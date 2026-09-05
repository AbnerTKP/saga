// Vários servidores. O banco já era assim desde o começo — cargo e banimento pertencem ao
// vínculo entre pessoa e servidor, não à pessoa — então aqui é só criar, convidar e entrar.
import { randomBytes } from 'node:crypto';
import { ErroDeConta } from './contas.mjs';
import { garantirCargos } from './banco.mjs';
import { temPermissao } from './permissoes.mjs';

const NOME_VALIDO = /^[^\r\n]{2,40}$/;
const DURACAO_DO_CONVITE = 7 * 24 * 60 * 60 * 1000;   // uma semana

const paraFora = (s) => s && ({ id: s.id, nome: s.nome, foto: s.foto ?? null, banner: s.banner ?? null });

/** Os servidores de que a pessoa faz parte, sem os que a baniram. */
export const meusServidores = (db, usuarioId) =>
  db.prepare(`
    SELECT s.* FROM servidores s
      JOIN membros m ON m.servidor_id = s.id
     WHERE m.usuario_id = ? AND m.banido_em IS NULL
     ORDER BY m.entrou_em, s.id`).all(usuarioId).map(paraFora);

export const buscarServidor = (db, id) =>
  paraFora(db.prepare('SELECT * FROM servidores WHERE id = ?').get(Number(id)));

export function criarServidor(db, usuario, { nome }) {
  const limpo = String(nome ?? '').trim();
  if (!NOME_VALIDO.test(limpo)) {
    throw new ErroDeConta('O nome do servidor precisa ter de 2 a 40 caracteres, numa linha só.');
  }

  const info = db.prepare('INSERT INTO servidores (nome, criado_em, criado_por) VALUES (?, ?, ?)')
    .run(limpo, Date.now(), usuario.id);
  const servidorId = Number(info.lastInsertRowid);

  garantirCargos(db, servidorId);
  // Um servidor sem sala nenhuma abriria numa tela vazia; quem criou não saberia o que fazer.
  db.prepare("INSERT INTO salas (servidor_id, nome, tipo, ordem) VALUES (?, 'Geral', 'voz', 0)").run(servidorId);
  db.prepare("INSERT INTO salas (servidor_id, nome, tipo, ordem) VALUES (?, 'Avisos', 'texto', 1)").run(servidorId);

  const doDono = db.prepare('SELECT id, nivel FROM cargos WHERE servidor_id = ? AND dono = 1').get(servidorId);
  db.prepare('INSERT INTO membros (servidor_id, usuario_id, cargo, cargo_id, entrou_em) VALUES (?, ?, ?, ?, ?)')
    .run(servidorId, usuario.id, doDono.nivel, doDono.id, Date.now());

  return buscarServidor(db, servidorId);
}

// Sem letras que se confundem lidas em voz alta ou copiadas à mão: O e 0, I e 1.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const gerarCodigo = () =>
  [...randomBytes(8)].map((b) => ALFABETO[b % ALFABETO.length]).join('');

export function criarConvite(db, servidorId, quem, { maxUsos } = {}) {
  if (!temPermissao(quem?.cargo, 'gerirServidor')) {
    throw new ErroDeConta('Seu cargo não permite convidar.', 403);
  }
  const codigo = gerarCodigo();
  db.prepare(
    'INSERT INTO convites (codigo, servidor_id, criado_por, criado_em, expira_em, max_usos) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(codigo, servidorId, quem.id, Date.now(), Date.now() + DURACAO_DO_CONVITE,
        maxUsos ? Math.max(1, Number(maxUsos)) : null);
  return { codigo, expiraEm: Date.now() + DURACAO_DO_CONVITE, maxUsos: maxUsos ?? null };
}

export const listarConvites = (db, servidorId) =>
  db.prepare('SELECT codigo, criado_em, expira_em, usos, max_usos FROM convites WHERE servidor_id = ? ORDER BY criado_em DESC')
    .all(servidorId)
    .map((c) => ({ codigo: c.codigo, criadoEm: c.criado_em, expiraEm: c.expira_em, usos: c.usos, maxUsos: c.max_usos }));

export function usarConvite(db, usuario, codigo) {
  const limpo = String(codigo ?? '').trim().toUpperCase();
  const convite = db.prepare('SELECT * FROM convites WHERE codigo = ?').get(limpo);
  // A mesma mensagem para inexistente, vencido e esgotado: dizer qual é entregaria
  // quais códigos existem a quem estiver tentando adivinhar.
  const recusa = () => { throw new ErroDeConta('Convite inválido ou vencido.', 404); };

  if (!convite) recusa();
  if (convite.expira_em && convite.expira_em < Date.now()) recusa();
  if (convite.max_usos && convite.usos >= convite.max_usos) recusa();

  const jaEsta = db.prepare('SELECT banido_em FROM membros WHERE servidor_id = ? AND usuario_id = ?')
    .get(convite.servidor_id, usuario.id);
  if (jaEsta?.banido_em) throw new ErroDeConta('Você foi banido deste servidor.', 403);
  if (jaEsta) return buscarServidor(db, convite.servidor_id);

  const maisBaixo = db.prepare('SELECT id, nivel FROM cargos WHERE servidor_id = ? ORDER BY nivel LIMIT 1')
    .get(convite.servidor_id);
  db.prepare('INSERT INTO membros (servidor_id, usuario_id, cargo, cargo_id, entrou_em) VALUES (?, ?, ?, ?, ?)')
    .run(convite.servidor_id, usuario.id, maisBaixo?.nivel ?? 10, maisBaixo?.id ?? null, Date.now());
  db.prepare('UPDATE convites SET usos = usos + 1 WHERE codigo = ?').run(limpo);

  return buscarServidor(db, convite.servidor_id);
}

export function sairDoServidor(db, servidorId, usuario) {
  const meu = db.prepare(`
    SELECT c.dono FROM membros m LEFT JOIN cargos c ON c.id = m.cargo_id
     WHERE m.servidor_id = ? AND m.usuario_id = ?`).get(servidorId, usuario.id);
  if (!meu) throw new ErroDeConta('Você não faz parte deste servidor.', 404);
  // O dono saindo deixaria o servidor sem ninguém capaz de administrá-lo, e sem jeito
  // de promover alguém depois.
  if (meu.dono) throw new ErroDeConta('O dono não pode sair do próprio servidor.', 409);

  db.prepare('DELETE FROM membros WHERE servidor_id = ? AND usuario_id = ?').run(servidorId, usuario.id);
  return { ok: true };
}

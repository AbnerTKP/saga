// Tudo que é da pessoa *dentro de um servidor*: nome exibido, cargo, banimento e castigo.
// Separado da conta porque a mesma conta poderá estar em vários servidores com cargos
// diferentes — hoje só existe um, mas o formato já é esse.
import { CARGO, podeAgir, podeDefinirCargo } from './cargos.mjs';
import { ErroDeConta, derrubarSessoes } from './contas.mjs';

/**
 * Vincula a pessoa ao servidor, se ainda não estiver. O primeiro a entrar vira dono —
 * ou, se DONO estiver definido no .env, só aquele apelido vira, e os demais entram como
 * membros mesmo que cheguem antes.
 */
export function garantirMembro(db, servidorId, usuario, { dono } = {}) {
  const jaEsta = buscarMembro(db, servidorId, usuario.id);
  if (jaEsta) return jaEsta;

  const temDono = db.prepare('SELECT count(*) c FROM membros WHERE servidor_id = ? AND cargo = ?')
    .get(servidorId, CARGO.DONO).c > 0;
  const ehODono = dono
    ? dono.trim().toLowerCase() === usuario.apelido_chave
    : !temDono;

  db.prepare('INSERT INTO membros (servidor_id, usuario_id, cargo, entrou_em) VALUES (?, ?, ?, ?)')
    .run(servidorId, usuario.id, ehODono ? CARGO.DONO : CARGO.MEMBRO, Date.now());
  return buscarMembro(db, servidorId, usuario.id);
}

// Junta conta e vínculo numa linha só, que é como o app quer ver a pessoa.
const SELECT_MEMBRO = `
  SELECT u.id, u.apelido, u.foto, u.banner,
         m.servidor_id, m.cargo, m.entrou_em, m.banido_em, m.banido_por, m.silenciado_ate,
         COALESCE(NULLIF(m.nome_exibido, ''), u.apelido) AS nome
    FROM membros m JOIN usuarios u ON u.id = m.usuario_id`;

export const buscarMembro = (db, servidorId, usuarioId) =>
  db.prepare(`${SELECT_MEMBRO} WHERE m.servidor_id = ? AND m.usuario_id = ?`).get(servidorId, usuarioId) ?? null;

export const listarMembros = (db, servidorId) =>
  db.prepare(`${SELECT_MEMBRO} WHERE m.servidor_id = ? ORDER BY m.cargo DESC, nome COLLATE NOCASE`).all(servidorId);

/** Motivo pelo qual esta pessoa não pode entrar numa sala agora, ou null se pode. */
export function impedimento(membro, agora = Date.now()) {
  if (!membro) return 'Você não faz parte deste servidor.';
  if (membro.banido_em) return 'Você foi banido deste servidor.';
  if (membro.silenciado_ate && membro.silenciado_ate > agora) {
    const minutos = Math.ceil((membro.silenciado_ate - agora) / 60_000);
    return `Você está de castigo por mais ${minutos} minuto${minutos > 1 ? 's' : ''}.`;
  }
  return null;
}

const NOME_VALIDO = /^.{2,32}$/u;   // aqui pode ter espaço: é nome de exibição, não login

export function mudarNomeExibido(db, servidorId, usuarioId, nome) {
  const limpo = String(nome ?? '').trim();
  // Vazio volta a usar o apelido da conta.
  if (limpo && !NOME_VALIDO.test(limpo)) {
    throw new ErroDeConta('O nome precisa ter de 2 a 32 caracteres.');
  }
  db.prepare('UPDATE membros SET nome_exibido = ? WHERE servidor_id = ? AND usuario_id = ?')
    .run(limpo || null, servidorId, usuarioId);
  return buscarMembro(db, servidorId, usuarioId);
}

// --- moderação --------------------------------------------------------------

/** Confere a permissão e devolve os dois lados, ou estoura com o motivo da recusa. */
export function exigirPermissao(db, servidorId, quemId, acao, alvoId) {
  const quem = buscarMembro(db, servidorId, quemId);
  const alvo = buscarMembro(db, servidorId, Number(alvoId));
  const r = podeAgir(quem, acao, alvo);
  if (!r.pode) throw new ErroDeConta(r.motivo, 403);
  return { quem, alvo };
}

export function banir(db, servidorId, quemId, alvoId) {
  const { quem, alvo } = exigirPermissao(db, servidorId, quemId, 'banir', alvoId);
  db.prepare('UPDATE membros SET banido_em = ?, banido_por = ? WHERE servidor_id = ? AND usuario_id = ?')
    .run(Date.now(), quem.apelido, servidorId, alvo.id);
  derrubarSessoes(db, alvo.id);   // não continua dentro com o app já aberto
  return buscarMembro(db, servidorId, alvo.id);
}

export function desbanir(db, servidorId, quemId, alvoId) {
  const { alvo } = exigirPermissao(db, servidorId, quemId, 'banir', alvoId);
  db.prepare('UPDATE membros SET banido_em = NULL, banido_por = NULL WHERE servidor_id = ? AND usuario_id = ?')
    .run(servidorId, alvo.id);
  return buscarMembro(db, servidorId, alvo.id);
}

export function darTimeout(db, servidorId, quemId, alvoId, minutos) {
  const { alvo } = exigirPermissao(db, servidorId, quemId, 'timeout', alvoId);
  const m = Math.min(Math.max(1, Number(minutos) || 0), 60 * 24);   // de 1 minuto a 1 dia
  db.prepare('UPDATE membros SET silenciado_ate = ? WHERE servidor_id = ? AND usuario_id = ?')
    .run(Date.now() + m * 60_000, servidorId, alvo.id);
  return buscarMembro(db, servidorId, alvo.id);
}

export function tirarTimeout(db, servidorId, quemId, alvoId) {
  const { alvo } = exigirPermissao(db, servidorId, quemId, 'timeout', alvoId);
  db.prepare('UPDATE membros SET silenciado_ate = NULL WHERE servidor_id = ? AND usuario_id = ?')
    .run(servidorId, alvo.id);
  return buscarMembro(db, servidorId, alvo.id);
}

export function expulsar(db, servidorId, quemId, alvoId) {
  const { alvo } = exigirPermissao(db, servidorId, quemId, 'expulsar', alvoId);
  derrubarSessoes(db, alvo.id);   // precisa entrar de novo; pode voltar, ao contrário do ban
  return alvo;
}

export function definirCargo(db, servidorId, quemId, alvoId, cargo) {
  const quem = buscarMembro(db, servidorId, quemId);
  const alvo = buscarMembro(db, servidorId, Number(alvoId));
  const r = podeDefinirCargo(quem, alvo, Number(cargo));
  if (!r.pode) throw new ErroDeConta(r.motivo, 403);
  db.prepare('UPDATE membros SET cargo = ? WHERE servidor_id = ? AND usuario_id = ?')
    .run(Number(cargo), servidorId, alvo.id);
  return buscarMembro(db, servidorId, alvo.id);
}

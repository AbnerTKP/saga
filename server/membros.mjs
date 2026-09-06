// Tudo que é da pessoa *dentro de um servidor*: nome exibido, cargo, banimento e castigo.
// Separado da conta porque a mesma conta poderá estar em vários servidores com cargos
// diferentes — hoje só existe um, mas o formato já é esse.
import { podeAgir, podeDarCargo, temPermissao } from './permissoes.mjs';
import { buscarCargo } from './cargos.mjs';
import { ErroDeConta, derrubarSessoes } from './contas.mjs';

/**
 * Vincula a pessoa ao servidor, se ainda não estiver. O primeiro a entrar vira dono —
 * ou, se DONO estiver definido no .env, só aquele apelido vira, e os demais entram como
 * membros mesmo que cheguem antes.
 */
export function garantirMembro(db, servidorId, usuario, { dono } = {}) {
  const jaEsta = buscarMembro(db, servidorId, usuario.id);
  if (jaEsta) return jaEsta;

  const cargos = db.prepare('SELECT id, nivel, dono FROM cargos WHERE servidor_id = ?').all(servidorId);
  const oDoDono = cargos.find((c) => c.dono);
  const oMaisBaixo = cargos.slice().sort((a, b) => a.nivel - b.nivel)[0];

  const jaTemDono = db.prepare(
    'SELECT count(*) c FROM membros WHERE servidor_id = ? AND cargo_id = ?',
  ).get(servidorId, oDoDono?.id ?? -1).c > 0;

  const ehODono = dono ? dono.trim().toLowerCase() === usuario.apelido_chave : !jaTemDono;
  const escolhido = ehODono ? oDoDono : oMaisBaixo;

  db.prepare('INSERT INTO membros (servidor_id, usuario_id, cargo, cargo_id, entrou_em) VALUES (?, ?, ?, ?, ?)')
    .run(servidorId, usuario.id, escolhido?.nivel ?? 10, escolhido?.id ?? null, Date.now());
  return buscarMembro(db, servidorId, usuario.id);
}

// Junta conta e vínculo numa linha só, que é como o app quer ver a pessoa.
const SELECT_MEMBRO = `
  SELECT u.id, u.apelido, u.foto, u.banner, u.enquadramento,
         m.servidor_id, m.entrou_em, m.banido_em, m.banido_por, m.silenciado_ate,
         m.turbo, m.id_exibido, m.cargo_id,
         c.nome AS cargo_nome, c.cor AS cargo_cor, c.nivel AS cargo_nivel,
         c.dono AS cargo_dono, c.permissoes AS cargo_permissoes,
         COALESCE(NULLIF(m.nome_exibido, ''), u.apelido) AS nome
    FROM membros m
    JOIN usuarios u ON u.id = m.usuario_id
    LEFT JOIN cargos c ON c.id = m.cargo_id`;

/** Junta o cargo à pessoa: as regras de permissão trabalham com o par, não com um número. */
const comCargo = (m) => m && ({
  ...m,
  cargo: m.cargo_id ? {
    id: m.cargo_id,
    nome: m.cargo_nome,
    cor: m.cargo_cor ?? null,
    nivel: m.cargo_nivel,
    dono: !!m.cargo_dono,
    permissoes: JSON.parse(m.cargo_permissoes || '[]'),
  } : null,
});

export const buscarMembro = (db, servidorId, usuarioId) =>
  comCargo(db.prepare(`${SELECT_MEMBRO} WHERE m.servidor_id = ? AND m.usuario_id = ?`)
    .get(servidorId, usuarioId)) ?? null;

export const listarMembros = (db, servidorId) =>
  db.prepare(`${SELECT_MEMBRO} WHERE m.servidor_id = ? ORDER BY c.nivel DESC, nome COLLATE NOCASE`)
    .all(servidorId).map(comCargo);

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

const ID_VALIDO = /^[\p{L}\p{N}._#-]{1,8}$/u;   // curto: fica antes do nome, não pode roubar a linha

/** Turbo é do dono conceder. Vale para qualquer pessoa, inclusive ele mesmo. */
export function definirTurbo(db, servidorId, quemId, alvoId, ligado) {
  if (!temPermissao(buscarMembro(db, servidorId, quemId)?.cargo, 'concederTurbo')) {
    throw new ErroDeConta('Seu cargo não permite conceder o Berserk.', 403);
  }
  const alvo = buscarMembro(db, servidorId, Number(alvoId));
  if (!alvo) throw new ErroDeConta('Essa pessoa não faz parte do servidor.', 404);
  db.prepare('UPDATE membros SET turbo = ? WHERE servidor_id = ? AND usuario_id = ?')
    .run(ligado ? 1 : 0, servidorId, alvo.id);
  return buscarMembro(db, servidorId, alvo.id);
}

/** Identificador curto que aparece antes do nome. Vazio remove. */
export function definirIdExibido(db, servidorId, quemId, alvoId, id) {
  if (!temPermissao(buscarMembro(db, servidorId, quemId)?.cargo, 'definirId')) {
    throw new ErroDeConta('Seu cargo não permite definir o identificador.', 403);
  }
  const alvo = buscarMembro(db, servidorId, Number(alvoId));
  if (!alvo) throw new ErroDeConta('Essa pessoa não faz parte do servidor.', 404);

  const limpo = String(id ?? '').trim();
  if (limpo && !ID_VALIDO.test(limpo)) {
    throw new ErroDeConta('O identificador precisa ter de 1 a 8 caracteres, sem espaços.');
  }
  db.prepare('UPDATE membros SET id_exibido = ? WHERE servidor_id = ? AND usuario_id = ?')
    .run(limpo || null, servidorId, alvo.id);
  return buscarMembro(db, servidorId, alvo.id);
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

export function definirCargo(db, servidorId, quemId, alvoId, cargoId) {
  const quem = buscarMembro(db, servidorId, quemId);
  const alvo = buscarMembro(db, servidorId, Number(alvoId));
  const novo = buscarCargo(db, servidorId, cargoId);
  const r = podeDarCargo(quem, alvo, novo);
  if (!r.pode) throw new ErroDeConta(r.motivo, 403);

  // A coluna antiga acompanha o nível: ela ainda é a fonte da migração de bancos velhos.
  db.prepare('UPDATE membros SET cargo_id = ?, cargo = ? WHERE servidor_id = ? AND usuario_id = ?')
    .run(novo.id, novo.nivel, servidorId, alvo.id);
  return buscarMembro(db, servidorId, alvo.id);
}

/**
 * A tabela `relatos`: os erros e as ideias de melhoria mandados pelo botão "Relatar".
 *
 * Por enquanto só se escreve e se conta. Ler, filtrar e decidir é do painel do dono da Saga,
 * que ainda não existe — e as colunas dele já estão na tabela.
 */

export function inserir(db, { usuarioId, tipo, texto, contexto, registro, criadoEm }) {
  const info = db.prepare(
    'INSERT INTO relatos (usuario_id, tipo, texto, contexto, registro, criado_em) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(usuarioId, tipo, texto, contexto, registro, criadoEm);
  return Number(info.lastInsertRowid);
}

/** Quantos relatos a conta mandou desde `desde`. Sem conta (`null`), quantos vieram sem ninguém. */
export const contarDesde = (db, usuarioId, desde) => (usuarioId === null
  ? db.prepare('SELECT count(*) c FROM relatos WHERE usuario_id IS NULL AND criado_em >= ?').get(desde).c
  : db.prepare('SELECT count(*) c FROM relatos WHERE usuario_id = ? AND criado_em >= ?').get(usuarioId, desde).c);

export const buscar = (db, id) => db.prepare('SELECT * FROM relatos WHERE id = ?').get(Number(id)) ?? null;

/**
 * A tabela `cargos`: os cargos de UM servidor.
 *
 * Não existe cargo de dono aqui, e é de propósito: mandar vem de ter criado o servidor
 * (`servidores.criado_por`), não de vestir um cargo. O que existe nesta tabela é o que o
 * pessoal de lá desenhou, e tudo nela pode ser renomeado ou apagado.
 */

/** Do mais alto para o mais baixo — a ordem da lista é o NÍVEL, nunca o poder. */
export const listar = (db, servidorId) =>
  db.prepare('SELECT * FROM cargos WHERE servidor_id = ? ORDER BY nivel DESC, id').all(servidorId);

export const buscar = (db, servidorId, id) =>
  db.prepare('SELECT * FROM cargos WHERE servidor_id = ? AND id = ?').get(servidorId, Number(id)) ?? null;

/** Só id e nível: é o que as contas de hierarquia precisam, sem carregar o resto. */
export const niveis = (db, servidorId) =>
  db.prepare('SELECT id, nivel FROM cargos WHERE servidor_id = ?').all(servidorId);

export const comONome = (db, servidorId, nome) =>
  db.prepare('SELECT id FROM cargos WHERE servidor_id = ? AND nome = ? COLLATE NOCASE').get(servidorId, nome) ?? null;

export const oMaisAlto = (db, servidorId) =>
  db.prepare('SELECT id, nivel FROM cargos WHERE servidor_id = ? ORDER BY nivel DESC, id LIMIT 1').get(servidorId) ?? null;

export const oMaisBaixo = (db, servidorId) =>
  db.prepare('SELECT id, nivel FROM cargos WHERE servidor_id = ? ORDER BY nivel LIMIT 1').get(servidorId) ?? null;

/** O mais baixo que não seja este — para onde vai quem estava no cargo apagado. */
export const oMaisBaixoExceto = (db, servidorId, cargoId) =>
  db.prepare('SELECT id, nivel FROM cargos WHERE servidor_id = ? AND id != ? ORDER BY nivel LIMIT 1')
    .get(servidorId, cargoId) ?? null;

export function inserir(db, servidorId, { nome, cor, nivel, permissoes, criadoEm }) {
  const info = db.prepare(
    'INSERT INTO cargos (servidor_id, nome, cor, nivel, dono, permissoes, criado_em) VALUES (?, ?, ?, ?, 0, ?, ?)',
  ).run(servidorId, nome, cor, nivel, permissoes, criadoEm);
  return Number(info.lastInsertRowid);
}

export const atualizar = (db, cargoId, { nome, cor, nivel, permissoes }) =>
  db.prepare('UPDATE cargos SET nome = ?, cor = ?, nivel = ?, permissoes = ? WHERE id = ?')
    .run(nome, cor, nivel, permissoes, cargoId);

export const apagar = (db, cargoId) =>
  db.prepare('DELETE FROM cargos WHERE id = ?').run(cargoId);

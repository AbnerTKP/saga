/**
 * A tabela `categorias`: as gavetas onde as salas ficam guardadas.
 *
 * Gaveta não é dona da conversa — apagá-la devolve as salas para o topo, e isso está em
 * `salas.soltarDaCategoria`. Aqui só existe a gaveta em si.
 */

export const listar = (db, servidorId) =>
  db.prepare('SELECT id, nome, ordem FROM categorias WHERE servidor_id = ? ORDER BY ordem, id').all(servidorId);

export const buscar = (db, servidorId, id) =>
  db.prepare('SELECT id, nome, ordem FROM categorias WHERE servidor_id = ? AND id = ?')
    .get(servidorId, Number(id)) ?? null;

export const comONome = (db, servidorId, nome) =>
  db.prepare('SELECT id FROM categorias WHERE servidor_id = ? AND nome = ? COLLATE NOCASE').get(servidorId, nome) ?? null;

export const idsDoServidor = (db, servidorId) =>
  db.prepare('SELECT id FROM categorias WHERE servidor_id = ?').all(servidorId).map((c) => c.id);

export const ultimaOrdem = (db, servidorId) =>
  db.prepare('SELECT MAX(ordem) o FROM categorias WHERE servidor_id = ?').get(servidorId).o;

export function inserir(db, { servidorId, nome, ordem, criadoEm }) {
  const info = db.prepare('INSERT INTO categorias (servidor_id, nome, ordem, criado_em) VALUES (?, ?, ?, ?)')
    .run(servidorId, nome, ordem, criadoEm);
  return Number(info.lastInsertRowid);
}

export const renomear = (db, id, nome) =>
  db.prepare('UPDATE categorias SET nome = ? WHERE id = ?').run(nome, id);

export const apagar = (db, id) =>
  db.prepare('DELETE FROM categorias WHERE id = ?').run(id);

export const mover = (db, id, ordem) =>
  db.prepare('UPDATE categorias SET ordem = ? WHERE id = ?').run(ordem, id);

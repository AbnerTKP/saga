/**
 * A tabela `salas`: as salas de voz e de texto de um servidor.
 *
 * A ordem da lista tem duas regras que moram no SQL e por isso moram aqui: a sala de
 * NOTAS vem sempre primeiro (é do app, não do servidor), e sala fora de gaveta vem antes
 * das guardadas — quem não guardou ainda precisa vê-la, não procurá-la no fim.
 *
 * A ordem é DENTRO da gaveta, não uma numeração corrida pelo servidor: assim mover uma
 * sala de gaveta não obriga a renumerar a lista toda.
 */

export const listar = (db, servidorId) =>
  db.prepare(`
    SELECT s.id, s.nome, s.tipo, s.ordem, s.papel, s.privada, s.categoria_id AS categoriaId
      FROM salas s
      LEFT JOIN categorias c ON c.id = s.categoria_id
     WHERE s.servidor_id = ?
     ORDER BY CASE WHEN s.papel IS NULL THEN 1 ELSE 0 END,
              (s.categoria_id IS NOT NULL), c.ordem, c.id, s.ordem, s.id`)
    .all(servidorId);

export const buscar = (db, servidorId, id) =>
  db.prepare('SELECT id, nome, tipo, ordem, papel, privada, categoria_id AS categoriaId FROM salas WHERE servidor_id = ? AND id = ?')
    .get(servidorId, Number(id)) ?? null;

export const comONome = (db, servidorId, nome) =>
  db.prepare('SELECT id FROM salas WHERE servidor_id = ? AND nome = ? COLLATE NOCASE').get(servidorId, nome) ?? null;

export const quantas = (db, servidorId) =>
  db.prepare('SELECT count(*) c FROM salas WHERE servidor_id = ?').get(servidorId).c;

export const ultimaOrdem = (db, servidorId) =>
  db.prepare('SELECT MAX(ordem) o FROM salas WHERE servidor_id = ?').get(servidorId).o;

export function inserir(db, { servidorId, nome, tipo, ordem, papel = null }) {
  const info = db.prepare('INSERT INTO salas (servidor_id, nome, tipo, ordem, papel) VALUES (?, ?, ?, ?, ?)')
    .run(servidorId, nome, tipo, ordem, papel);
  return Number(info.lastInsertRowid);
}

export const renomear = (db, id, nome) =>
  db.prepare('UPDATE salas SET nome = ? WHERE id = ?').run(nome, id);

/** Apagar a sala leva as mensagens junto: é o `ON DELETE CASCADE` do esquema. */
export const apagar = (db, id) =>
  db.prepare('DELETE FROM salas WHERE id = ?').run(id);

/** `categoriaId` undefined mantém a gaveta atual; null tira da gaveta. */
export function mover(db, id, ordem, categoriaId) {
  if (categoriaId === null) {
    return db.prepare('UPDATE salas SET ordem = ?, categoria_id = NULL WHERE id = ?').run(ordem, id);
  }
  return db.prepare('UPDATE salas SET ordem = ?, categoria_id = COALESCE(?, categoria_id) WHERE id = ?')
    .run(ordem, categoriaId ?? null, id);
}

/** Apagar a gaveta devolve as salas para o topo, em vez de levá-las junto. */
export const soltarDaCategoria = (db, categoriaId) =>
  db.prepare('UPDATE salas SET categoria_id = NULL WHERE categoria_id = ?').run(categoriaId);

// --- a sala de notas, que é do app -----------------------------------------

export const comOPapel = (db, servidorId, papel) =>
  db.prepare('SELECT * FROM salas WHERE servidor_id = ? AND papel = ?').get(servidorId, papel) ?? null;

export const porNome = (db, servidorId, nome) =>
  db.prepare('SELECT * FROM salas WHERE servidor_id = ? AND nome = ?').get(servidorId, nome) ?? null;

export const porId = (db, id) =>
  db.prepare('SELECT * FROM salas WHERE id = ?').get(id) ?? null;

/** Adota uma sala já existente como a de notas — sem brigar com o UNIQUE(servidor, nome). */
export const virarSalaDeNotas = (db, id, papel) =>
  db.prepare('UPDATE salas SET papel = ?, tipo = ?, ordem = -1, categoria_id = NULL WHERE id = ?')
    .run(papel, 'texto', id);

// --- sala privada: quem vê é por CARGO -------------------------------------

export const definirPrivada = (db, id, privada) =>
  db.prepare('UPDATE salas SET privada = ? WHERE id = ?').run(privada ? 1 : 0, id);


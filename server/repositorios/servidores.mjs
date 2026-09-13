/**
 * A tabela `servidores`, e o `criado_por` que decide quem manda em cada um.
 *
 * Mandar não é um cargo: é ter criado. Por isso `quemCriou` vive aqui e é lido pela
 * leitura de membros — assim editar cargo no banco não deixa um servidor sem conserto.
 */

export const buscar = (db, id) =>
  db.prepare('SELECT * FROM servidores WHERE id = ?').get(Number(id)) ?? null;

export const oPrimeiro = (db) =>
  db.prepare('SELECT * FROM servidores ORDER BY id LIMIT 1').get() ?? null;

export const quantos = (db) =>
  db.prepare('SELECT count(*) c FROM servidores').get().c;

export function inserir(db, { nome, criadoEm, criadoPor = null }) {
  const info = db.prepare('INSERT INTO servidores (nome, criado_em, criado_por) VALUES (?, ?, ?)')
    .run(nome, criadoEm, criadoPor);
  return Number(info.lastInsertRowid);
}

export const renomear = (db, id, nome) =>
  db.prepare('UPDATE servidores SET nome = ? WHERE id = ?').run(nome, id);

/** `papel` é 'foto' ou 'banner', conferido pela rota antes de chegar aqui. */
export const trocarImagem = (db, id, papel, nome) =>
  db.prepare(`UPDATE servidores SET ${papel} = ? WHERE id = ?`).run(nome, id);

export const quemCriou = (db, id) =>
  db.prepare('SELECT criado_por FROM servidores WHERE id = ?').get(id)?.criado_por ?? null;

export const definirQuemCriou = (db, id, usuarioId) =>
  db.prepare('UPDATE servidores SET criado_por = ? WHERE id = ?').run(usuarioId, id);

// --- a administração da Saga, que vê todos ----------------------------------

/** O servidor com quem o criou ao lado: a administração mostra os dois juntos. */
const COM_CRIADOR = `
  SELECT s.*, u.apelido AS criador_apelido, u.foto AS criador_foto
    FROM servidores s
    LEFT JOIN usuarios u ON u.id = s.criado_por`;

/** TODOS, inclusive os de que quem pergunta não faz parte. Por id: quem ordena para ler é a tela. */
export const todos = (db) =>
  db.prepare(`${COM_CRIADOR} ORDER BY s.id`).all();

export const buscarComCriador = (db, id) =>
  db.prepare(`${COM_CRIADOR} WHERE s.id = ?`).get(Number(id)) ?? null;

/** Os servidores de que a pessoa faz parte, sem os que a baniram. */
export const doUsuario = (db, usuarioId) =>
  db.prepare(`
    SELECT s.* FROM servidores s
      JOIN membros m ON m.servidor_id = s.id
     WHERE m.usuario_id = ? AND m.banido_em IS NULL
     ORDER BY m.entrou_em, s.id`).all(usuarioId);

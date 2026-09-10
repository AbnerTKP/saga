/**
 * A tabela `sons`: o soundboard de um servidor.
 *
 * Quem subiu vem junto na leitura, com o nome exibido DAQUELE servidor — e por
 * `LEFT JOIN`, de propósito: quem apagou a conta não leva os sons dele embora.
 */

const SELECT = `
  SELECT s.id, s.nome, s.arquivo, s.criado_em,
         COALESCE(NULLIF(m.nome_exibido, ''), u.apelido) AS porQuem
    FROM sons s
    LEFT JOIN usuarios u ON u.id = s.enviado_por
    LEFT JOIN membros  m ON m.usuario_id = s.enviado_por AND m.servidor_id = s.servidor_id`;

export const listar = (db, servidorId) =>
  db.prepare(`${SELECT} WHERE s.servidor_id = ? ORDER BY s.nome COLLATE NOCASE`).all(servidorId);

export const buscar = (db, servidorId, id) =>
  db.prepare(`${SELECT} WHERE s.servidor_id = ? AND s.id = ?`).get(servidorId, Number(id)) ?? null;

export const temONome = (db, servidorId, nome) =>
  !!db.prepare('SELECT 1 FROM sons WHERE servidor_id = ? AND nome = ? COLLATE NOCASE').get(servidorId, nome);

export function inserir(db, { servidorId, nome, arquivo, enviadoPor, criadoEm }) {
  const info = db.prepare(
    'INSERT INTO sons (servidor_id, nome, arquivo, enviado_por, criado_em) VALUES (?, ?, ?, ?, ?)',
  ).run(servidorId, nome, arquivo, enviadoPor, criadoEm);
  return Number(info.lastInsertRowid);
}

export const apagar = (db, servidorId, id) =>
  db.prepare('DELETE FROM sons WHERE servidor_id = ? AND id = ?').run(servidorId, id);

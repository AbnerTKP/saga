/**
 * A tabela `garagem_recordes`: o placar da Navinha, o jogo dos fliperamas da Garagem, por servidor.
 * Guarda-se só o que está no placar: ao anotar uma partida, as que caíram para fora dele são
 * apagadas, e a tabela nunca passa de umas poucas linhas por servidor.
 */

/** O placar, do maior para o menor; no empate, quem fez primeiro fica na frente. */
export const placar = (db, servidorId, quantos) => db.prepare(
  `SELECT r.usuario_id AS usuarioId, r.pontos, u.apelido
     FROM garagem_recordes r LEFT JOIN usuarios u ON u.id = r.usuario_id
    WHERE r.servidor_id = ?
    ORDER BY r.pontos DESC, r.id ASC
    LIMIT ?`,
).all(servidorId, quantos);

export function anotar(db, servidorId, usuarioId, pontos, agora, guardar) {
  db.prepare('INSERT INTO garagem_recordes (servidor_id, usuario_id, pontos, criado_em) VALUES (?, ?, ?, ?)')
    .run(servidorId, usuarioId, pontos, agora);
  db.prepare(
    `DELETE FROM garagem_recordes
      WHERE servidor_id = ?
        AND id NOT IN (SELECT id FROM garagem_recordes WHERE servidor_id = ? ORDER BY pontos DESC, id ASC LIMIT ?)`,
  ).run(servidorId, servidorId, guardar);
}

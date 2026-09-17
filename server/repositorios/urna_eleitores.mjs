/** A tabela `urna_eleitores`: quantas vezes cada pessoa votou na Urna de um servidor, e quando foi a última. */

export function contar(db, servidorId, usuarioId, agora) {
  const { changes } = db.prepare('UPDATE urna_eleitores SET votos = votos + 1, ultimo_em = ? WHERE servidor_id = ? AND usuario_id = ?')
    .run(agora, servidorId, usuarioId);
  if (!changes) db.prepare('INSERT INTO urna_eleitores (servidor_id, usuario_id, votos, ultimo_em) VALUES (?, ?, 1, ?)').run(servidorId, usuarioId, agora);
}

export const buscar = (db, servidorId, usuarioId) =>
  db.prepare('SELECT votos, ultimo_em FROM urna_eleitores WHERE servidor_id = ? AND usuario_id = ?').get(servidorId, usuarioId) ?? null;

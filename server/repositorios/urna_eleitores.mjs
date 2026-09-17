/** A tabela `urna_eleitores`: quantas vezes cada pessoa votou na Urna de um servidor, e quando foi a última. */

export function contar(db, servidorId, usuarioId, agora) {
  const { changes } = db.prepare('UPDATE urna_eleitores SET votos = votos + 1, ultimo_em = ? WHERE servidor_id = ? AND usuario_id = ?')
    .run(agora, servidorId, usuarioId);
  if (!changes) db.prepare('INSERT INTO urna_eleitores (servidor_id, usuario_id, votos, ultimo_em) VALUES (?, ?, 1, ?)').run(servidorId, usuarioId, agora);
}

/** Quantas vezes a pessoa votou somando todos os servidores, e o voto mais recente. */
export function buscar(db, usuarioId) {
  const l = db.prepare('SELECT SUM(votos) votos, MAX(ultimo_em) ultimo_em FROM urna_eleitores WHERE usuario_id = ?').get(usuarioId);
  return l && l.votos !== null ? l : null;
}

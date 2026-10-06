/** A tabela `urna_eleitores`: quantas vezes cada pessoa votou na Urna de um servidor, em cada turno, e quando foi a última. */

export function contar(db, turno, servidorId, usuarioId, agora) {
  const { changes } = db.prepare('UPDATE urna_eleitores SET votos = votos + 1, ultimo_em = ? WHERE turno = ? AND servidor_id = ? AND usuario_id = ?')
    .run(agora, turno, servidorId, usuarioId);
  if (!changes) {
    db.prepare('INSERT INTO urna_eleitores (turno, servidor_id, usuario_id, votos, ultimo_em) VALUES (?, ?, ?, 1, ?)')
      .run(turno, servidorId, usuarioId, agora);
  }
}

/** Quantas vezes a pessoa votou no turno, somando todos os servidores, e o voto mais recente. */
export function buscar(db, turno, usuarioId) {
  const l = db.prepare('SELECT SUM(votos) votos, MAX(ultimo_em) ultimo_em FROM urna_eleitores WHERE turno = ? AND usuario_id = ?').get(turno, usuarioId);
  return l && l.votos !== null ? l : null;
}

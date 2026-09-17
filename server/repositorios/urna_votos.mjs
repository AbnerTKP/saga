/**
 * A tabela `urna_votos`: o total de cada escolha da Urna em cada servidor — e só o total. Quem
 * votou mora em `urna_eleitores`, sem a escolha: é assim que o voto fica secreto no banco.
 */

export function somar(db, servidorId, escolha) {
  const { changes } = db.prepare('UPDATE urna_votos SET votos = votos + 1 WHERE servidor_id = ? AND escolha = ?').run(servidorId, escolha);
  if (!changes) db.prepare('INSERT INTO urna_votos (servidor_id, escolha, votos) VALUES (?, ?, 1)').run(servidorId, escolha);
}

export const contagem = (db, servidorId) =>
  db.prepare('SELECT escolha, votos FROM urna_votos WHERE servidor_id = ? ORDER BY escolha').all(servidorId);

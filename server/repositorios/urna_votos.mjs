/**
 * A tabela `urna_votos`: o total de cada escolha da Urna em cada servidor — e só o total. Quem
 * votou mora em `urna_eleitores`, sem a escolha: é assim que o voto fica secreto no banco. A
 * apuração lê a Saga inteira, somando os servidores.
 */

export function somar(db, servidorId, escolha) {
  const { changes } = db.prepare('UPDATE urna_votos SET votos = votos + 1 WHERE servidor_id = ? AND escolha = ?').run(servidorId, escolha);
  if (!changes) db.prepare('INSERT INTO urna_votos (servidor_id, escolha, votos) VALUES (?, ?, 1)').run(servidorId, escolha);
}

export const contagem = (db) =>
  db.prepare('SELECT escolha, SUM(votos) votos FROM urna_votos GROUP BY escolha ORDER BY escolha').all();

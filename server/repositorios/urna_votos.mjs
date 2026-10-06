/**
 * A tabela `urna_votos`: o total de cada escolha da Urna em cada servidor e em cada turno — e só o
 * total. Quem votou mora em `urna_eleitores`, sem a escolha: é assim que o voto fica secreto no banco.
 * A apuração lê a Saga inteira de um turno, somando os servidores.
 */

export function somar(db, turno, servidorId, escolha) {
  const { changes } = db.prepare('UPDATE urna_votos SET votos = votos + 1 WHERE turno = ? AND servidor_id = ? AND escolha = ?')
    .run(turno, servidorId, escolha);
  if (!changes) db.prepare('INSERT INTO urna_votos (turno, servidor_id, escolha, votos) VALUES (?, ?, ?, 1)').run(turno, servidorId, escolha);
}

export const contagem = (db, turno) =>
  db.prepare('SELECT escolha, SUM(votos) votos FROM urna_votos WHERE turno = ? GROUP BY escolha ORDER BY escolha').all(turno);

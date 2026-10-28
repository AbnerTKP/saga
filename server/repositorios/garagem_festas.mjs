/**
 * A tabela `garagem_festas`: o parabéns que o dono da Saga preparou na Garagem de cada servidor —
 * quem faz aniversário, o nome de cada um no telão e o tema de cada um. Uma linha por servidor, e
 * preparar de novo substitui. A lista vai em JSON porque é curta (até duas pessoas) e só se lê inteira.
 */

export function ler(db, servidorId) {
  const linha = db.prepare('SELECT aniversariantes FROM garagem_festas WHERE servidor_id = ?').get(servidorId);
  if (!linha) return [];
  try {
    const lista = JSON.parse(linha.aniversariantes);
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export function gravar(db, servidorId, aniversariantes, agora) {
  db.prepare('INSERT OR REPLACE INTO garagem_festas (servidor_id, aniversariantes, atualizado_em) VALUES (?, ?, ?)')
    .run(servidorId, JSON.stringify(aniversariantes), agora);
}

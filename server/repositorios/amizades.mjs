/**
 * A tabela `amizades`: quem é amigo de quem, e quem ainda é só um pedido.
 *
 * A linha é UMA por par, com os ids ordenados — `a` é sempre o menor. Por isso toda
 * consulta aqui passa por `par()`, e nenhuma lembra a ordem em que os nomes chegaram:
 * "somos amigos" não tem direção. O que tem direção é `pedido_de`, que é uma coluna.
 *
 * Recusar e desfazer APAGAM a linha, em vez de guardar um estado 'recusado': quem
 * recusou hoje pode aceitar amanhã, e uma tabela que só cresce guardaria cada não para
 * sempre sem ninguém nunca ler.
 */

/** O par ordenado. É a chave da tabela, e a razão de nada aqui depender de quem chamou. */
export const par = (x, y) => (Number(x) < Number(y) ? [Number(x), Number(y)] : [Number(y), Number(x)]);

export function buscar(db, x, y) {
  const [a, b] = par(x, y);
  return db.prepare('SELECT a, b, pedido_de, estado, criada_em, aceita_em FROM amizades WHERE a = ? AND b = ?')
    .get(a, b) ?? null;
}

export function pedir(db, { de, para, quando }) {
  const [a, b] = par(de, para);
  db.prepare('INSERT INTO amizades (a, b, pedido_de, estado, criada_em) VALUES (?, ?, ?, ?, ?)')
    .run(a, b, Number(de), 'pedido', quando);
}

export function aceitar(db, x, y, quando) {
  const [a, b] = par(x, y);
  db.prepare("UPDATE amizades SET estado = 'amigos', aceita_em = ? WHERE a = ? AND b = ?").run(quando, a, b);
}

export function apagar(db, x, y) {
  const [a, b] = par(x, y);
  db.prepare('DELETE FROM amizades WHERE a = ? AND b = ?').run(a, b);
}

/**
 * Tudo o que é da minha vida social numa consulta só: amigos, pedidos que recebi e
 * pedidos que mandei. `quem` é o OUTRO, com a conta inteira — em conversa privada não há
 * cargo nem nome exibido, porque não há servidor: quem fala é a conta.
 */
export const minhas = (db, usuarioId) =>
  db.prepare(`
    SELECT u.id, u.apelido AS nome, u.foto, u.enquadramento, u.turbo, u.status, u.visto_em,
           am.estado, am.pedido_de, am.criada_em
      FROM amizades am
      JOIN usuarios u ON u.id = CASE WHEN am.a = ? THEN am.b ELSE am.a END
     WHERE am.a = ? OR am.b = ?
     ORDER BY u.apelido COLLATE NOCASE`)
    .all(Number(usuarioId), Number(usuarioId), Number(usuarioId));

/** Só os ids, para quem precisa saber "somos amigos?" de várias pessoas de uma vez. */
export const idsDosAmigos = (db, usuarioId) =>
  db.prepare(`SELECT CASE WHEN a = ? THEN b ELSE a END AS id
                FROM amizades WHERE estado = 'amigos' AND (a = ? OR b = ?)`)
    .all(Number(usuarioId), Number(usuarioId), Number(usuarioId))
    .map((r) => r.id);

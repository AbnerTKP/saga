/**
 * As tabelas `conversas` e `conversa_pessoas`: a conversa privada entre duas pessoas.
 *
 * Ela é da CONTA, não de um servidor — por isso quem participa sai de `usuarios`, com
 * apelido e foto, e não de `membros`: numa conversa privada não há cargo, nem nome
 * exibido, nem identificador, porque não há servidor onde esses três signifiquem algo.
 *
 * `conversa_pessoas` é uma linha por participante em vez de duas colunas `a` e `b`: é o
 * que permitirá conversa de três sem mexer no que já existe. A consequência é que achar
 * "a conversa entre estes dois" é uma conta de quantos participantes batem, e não uma
 * comparação de colunas — está em `entre`.
 */

/** A conversa que tem EXATAMENTE estas duas pessoas, ou nada. */
export const entre = (db, x, y) =>
  db.prepare(`
    SELECT c.id
      FROM conversas c
      JOIN conversa_pessoas p ON p.conversa_id = c.id
     WHERE p.usuario_id IN (?, ?)
     GROUP BY c.id
    HAVING count(*) = 2
       AND (SELECT count(*) FROM conversa_pessoas t WHERE t.conversa_id = c.id) = 2`)
    .get(Number(x), Number(y))?.id ?? null;

export function criar(db, pessoas, quando) {
  const info = db.prepare('INSERT INTO conversas (criada_em) VALUES (?)').run(quando);
  const id = Number(info.lastInsertRowid);
  const juntar = db.prepare('INSERT INTO conversa_pessoas (conversa_id, usuario_id) VALUES (?, ?)');
  for (const p of pessoas) juntar.run(id, Number(p));
  return id;
}

/** Conversa de que eu não faço parte responde como conversa que não existe — ver a regra. */
export const souDela = (db, conversaId, usuarioId) =>
  !!db.prepare('SELECT 1 FROM conversa_pessoas WHERE conversa_id = ? AND usuario_id = ?')
    .get(Number(conversaId), Number(usuarioId));

/** As outras pessoas da conversa: hoje sempre uma, e é a ela que o aviso chega. */
export const outros = (db, conversaId, usuarioId) =>
  db.prepare('SELECT usuario_id FROM conversa_pessoas WHERE conversa_id = ? AND usuario_id <> ?')
    .all(Number(conversaId), Number(usuarioId)).map((r) => r.usuario_id);

/**
 * As minhas conversas, da mais recente para a mais antiga, já com o OUTRO e a última
 * mensagem — que é o que a lista da esquerda desenha. Tudo numa consulta só: uma por
 * conversa seria o mesmo erro do `listRooms` dentro do `for`, que comeu um terço do
 * núcleo da VPS.
 *
 * A ordem é pela última mensagem, e cai na data de criação enquanto ninguém falou nada:
 * conversa recém-aberta precisa aparecer no topo, senão quem acabou de abri-la não a acha.
 */
export const minhas = (db, usuarioId) =>
  db.prepare(`
    SELECT c.id,
           u.id AS outro_id, u.apelido AS outro_nome, u.foto, u.enquadramento, u.turbo,
           u.status, u.visto_em,
           m.id AS ultima_id, m.texto AS ultima_texto, m.imagem AS ultima_imagem,
           m.arquivo_nome AS ultima_arquivo, m.criado_em AS ultima_em, m.usuario_id AS ultima_de
      FROM conversa_pessoas minha
      JOIN conversas c        ON c.id = minha.conversa_id
      JOIN conversa_pessoas o ON o.conversa_id = c.id AND o.usuario_id <> minha.usuario_id
      JOIN usuarios u         ON u.id = o.usuario_id
      LEFT JOIN mensagens m   ON m.id = (SELECT id FROM mensagens
                                          WHERE conversa_id = c.id AND apagada_em IS NULL
                                          ORDER BY id DESC LIMIT 1)
     WHERE minha.usuario_id = ?
     ORDER BY COALESCE(m.criado_em, c.criada_em) DESC`)
    .all(Number(usuarioId));

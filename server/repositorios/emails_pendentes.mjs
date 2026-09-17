/**
 * A tabela `emails_pendentes`: o e-mail que alguém digitou e ainda não provou receber.
 *
 * Uma linha por conta, e o que fica guardado é o HASH do código, nunca ele. O e-mail só
 * chega a `usuarios.email` quando o código volta certo: assim, o que está na conta é
 * sempre um endereço que comprovadamente entrega — e não o que alguém digitou torto num
 * dia em que ninguém ia conferir.
 *
 * Quem escolhe como se guarda, quem confere e quem decide quando o código morre é
 * `contas.mjs`; aqui só se guarda, se conta erro e se apaga.
 */

/**
 * Guarda o pedido no lugar do que houver: pedir de novo — ou pedir para outro endereço —
 * invalida o anterior. Os erros voltam a zero junto, porque eram tentativas contra o
 * código velho.
 */
export const guardar = (db, { usuarioId, email, codigoHash, criadoEm, expiraEm }) =>
  db.prepare(`
    INSERT OR REPLACE INTO emails_pendentes (usuario_id, email, codigo_hash, criado_em, expira_em, erros)
    VALUES (?, ?, ?, ?, ?, 0)`)
    .run(Number(usuarioId), email, codigoHash, criadoEm, expiraEm);

export const daConta = (db, usuarioId) =>
  db.prepare('SELECT * FROM emails_pendentes WHERE usuario_id = ?').get(Number(usuarioId)) ?? null;

/** Soma um erro e devolve quantos são agora — 0 se a conta não tinha pedido nenhum. */
export const contarErro = (db, usuarioId) =>
  db.prepare('UPDATE emails_pendentes SET erros = erros + 1 WHERE usuario_id = ? RETURNING erros')
    .get(Number(usuarioId))?.erros ?? 0;

export const apagar = (db, usuarioId) =>
  db.prepare('DELETE FROM emails_pendentes WHERE usuario_id = ?').run(Number(usuarioId)).changes;

/**
 * O endereço está esperando confirmação em OUTRA conta?
 *
 * O índice único de `usuarios.email` só pega quem já confirmou. Sem esta pergunta, duas
 * contas podiam ficar com o mesmo endereço pendente, e a segunda a confirmar levaria um
 * erro de banco no lugar de um "esse e-mail já é de outra conta".
 */
export const deOutraConta = (db, email, usuarioId) =>
  !!db.prepare('SELECT 1 FROM emails_pendentes WHERE email = ? AND usuario_id <> ? AND expira_em > ?')
    .get(email, Number(usuarioId), Date.now());

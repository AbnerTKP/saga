/**
 * A tabela `recuperacoes`: o código de senha que o dono da Saga gera para uma conta.
 *
 * Uma linha por conta, e o que fica guardado é o HASH do código, nunca ele. Quem escolhe
 * como se guarda, quem confere e quem decide quando o código morre é `contas.mjs`; aqui só
 * se guarda, se conta erro e se apaga.
 */

/**
 * Guarda o código da conta no lugar do que houver: gerar outro invalida o anterior. Os
 * erros voltam a zero junto, porque eram tentativas contra o código velho.
 */
export const guardar = (db, { usuarioId, codigoHash, criadoPor, criadoEm, expiraEm }) =>
  db.prepare(`
    INSERT OR REPLACE INTO recuperacoes (usuario_id, codigo_hash, criado_por, criado_em, expira_em, erros)
    VALUES (?, ?, ?, ?, ?, 0)`)
    .run(Number(usuarioId), codigoHash, criadoPor ?? null, criadoEm, expiraEm);

export const daConta = (db, usuarioId) =>
  db.prepare('SELECT * FROM recuperacoes WHERE usuario_id = ?').get(Number(usuarioId)) ?? null;

/** Soma um erro e devolve quantos são agora — 0 se a conta não tinha código. */
export const contarErro = (db, usuarioId) =>
  db.prepare('UPDATE recuperacoes SET erros = erros + 1 WHERE usuario_id = ? RETURNING erros')
    .get(Number(usuarioId))?.erros ?? 0;

export const apagar = (db, usuarioId) =>
  db.prepare('DELETE FROM recuperacoes WHERE usuario_id = ?').run(Number(usuarioId)).changes;

/** As que ainda não venceram, sem o hash: é para o painel dizer até quando cada uma vale. */
export const validas = (db, agora) =>
  db.prepare('SELECT usuario_id, expira_em, erros FROM recuperacoes WHERE expira_em > ?').all(agora);

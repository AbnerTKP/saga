/**
 * A tabela `sessoes`: o crachá que faz o app abrir já logado.
 *
 * O que fica guardado é o HASH do token, nunca o token — quem lê o banco não consegue
 * entrar como ninguém. Quem gera e transforma o token é `contas.mjs`; aqui só se guarda
 * e se apaga.
 */

export const inserir = (db, { tokenHash, usuarioId, agora }) =>
  db.prepare('INSERT INTO sessoes (token_hash, usuario_id, criada_em, vista_em) VALUES (?, ?, ?, ?)')
    .run(tokenHash, usuarioId, agora, agora);

export const usuarioDoToken = (db, tokenHash) =>
  db.prepare('SELECT usuario_id FROM sessoes WHERE token_hash = ?').get(tokenHash) ?? null;

/**
 * Anota que a sessão foi vista.
 *
 * Isto era escrito a CADA pedido: com o app perguntando de 4 em 4 segundos por pessoa,
 * o servidor escrevia 3,5 MB/s e a máquina passava 40% do tempo esperando disco. Quem
 * segura a mão é `contas.mjs`, que só chama uma vez por minuto por sessão.
 */
export const anotarVista = (db, tokenHash, agora) =>
  db.prepare('UPDATE sessoes SET vista_em = ? WHERE token_hash = ?').run(agora, tokenHash);

export const apagar = (db, tokenHash) =>
  db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(tokenHash);

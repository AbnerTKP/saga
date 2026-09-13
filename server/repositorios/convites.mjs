/**
 * A tabela `convites`: a porta de entrada de um servidor.
 *
 * O código é a única chave, então tudo aqui é por código. Vencido, esgotado e inexistente
 * são estados diferentes no banco e a MESMA resposta lá em cima — dizer qual é entregaria
 * quais códigos existem a quem estiver tentando adivinhar.
 */

export const buscar = (db, codigo) =>
  db.prepare('SELECT * FROM convites WHERE codigo = ?').get(codigo) ?? null;

export const inserir = (db, { codigo, servidorId, criadoPor, criadoEm, expiraEm, maxUsos }) =>
  db.prepare(
    'INSERT INTO convites (codigo, servidor_id, criado_por, criado_em, expira_em, max_usos) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(codigo, servidorId, criadoPor, criadoEm, expiraEm, maxUsos);

export const doServidor = (db, servidorId) =>
  db.prepare('SELECT codigo, criado_em, expira_em, usos, max_usos FROM convites WHERE servidor_id = ? ORDER BY criado_em DESC')
    .all(servidorId);

/**
 * Quantos ainda abrem a porta: sem prazo ou dentro dele, e sem teto ou abaixo dele. Só o
 * número — o código não sai desta leitura, porque quem conta convites não precisa da chave.
 */
export const quantosAtivos = (db, servidorId, agora) =>
  db.prepare(`
    SELECT count(*) c FROM convites
     WHERE servidor_id = ?
       AND (expira_em IS NULL OR expira_em > ?)
       AND (max_usos IS NULL OR usos < max_usos)`).get(servidorId, Number(agora)).c;

export const contarUso = (db, codigo) =>
  db.prepare('UPDATE convites SET usos = usos + 1 WHERE codigo = ?').run(codigo);

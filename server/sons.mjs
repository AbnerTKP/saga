// Soundboard: quem sobe é o cargo mais alto do servidor; tocar é de todo mundo.
import { ErroDeConta } from './contas.mjs';
import { podeMexerNosSons } from './permissoes.mjs';

const NOME_VALIDO = /^.{1,40}$/u;

const SELECT = `
  SELECT s.id, s.nome, s.arquivo, s.criado_em,
         COALESCE(NULLIF(m.nome_exibido, ''), u.apelido) AS porQuem
    FROM sons s
    LEFT JOIN usuarios u ON u.id = s.enviado_por
    LEFT JOIN membros  m ON m.usuario_id = s.enviado_por AND m.servidor_id = s.servidor_id`;

export const listarSons = (db, servidorId) =>
  db.prepare(`${SELECT} WHERE s.servidor_id = ? ORDER BY s.nome COLLATE NOCASE`).all(servidorId);

export const buscarSom = (db, servidorId, id) =>
  db.prepare(`${SELECT} WHERE s.servidor_id = ? AND s.id = ?`).get(servidorId, Number(id)) ?? null;

/** Os níveis dos cargos daquele servidor: é com o TETO deles que a regra compara. */
const cargosDe = (db, servidorId) =>
  db.prepare('SELECT nivel FROM cargos WHERE servidor_id = ?').all(servidorId);

export function adicionarSom(db, servidorId, quem, { nome, arquivo }) {
  const r = podeMexerNosSons(quem, cargosDe(db, servidorId));
  if (!r.pode) throw new ErroDeConta(`Não dá para subir sons: ${r.motivo}.`, 403);
  const limpo = String(nome ?? '').trim();
  if (!NOME_VALIDO.test(limpo)) throw new ErroDeConta('Dê um nome ao som, de 1 a 40 caracteres.');
  if (db.prepare('SELECT 1 FROM sons WHERE servidor_id = ? AND nome = ? COLLATE NOCASE').get(servidorId, limpo)) {
    throw new ErroDeConta('Já existe um som com esse nome.', 409);
  }
  const info = db.prepare(
    'INSERT INTO sons (servidor_id, nome, arquivo, enviado_por, criado_em) VALUES (?, ?, ?, ?, ?)',
  ).run(servidorId, limpo, arquivo, quem.id, Date.now());
  return buscarSom(db, servidorId, Number(info.lastInsertRowid));
}

export function removerSom(db, servidorId, quem, id) {
  const r = podeMexerNosSons(quem, cargosDe(db, servidorId));
  if (!r.pode) throw new ErroDeConta(`Não dá para apagar sons: ${r.motivo}.`, 403);
  const som = buscarSom(db, servidorId, id);
  if (!som) throw new ErroDeConta('Esse som não existe.', 404);
  db.prepare('DELETE FROM sons WHERE servidor_id = ? AND id = ?').run(servidorId, som.id);
  // O arquivo em si fica: outro som pode apontar para o mesmo conteúdo, já que o nome
  // do arquivo é o hash. Apagar exigiria contar referências, e o ganho seria alguns KB.
  return { ok: true };
}

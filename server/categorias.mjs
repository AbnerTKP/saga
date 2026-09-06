// Categorias: as gavetas onde as salas ficam guardadas.
//
// Uma gaveta não guarda conversa nenhuma — só agrupa. Por isso apagá-la NÃO apaga as
// salas: elas voltam para o topo, sem gaveta. Quem quiser perder a conversa apaga a sala,
// que é uma decisão diferente e tem outra pergunta.
import { ErroDeConta } from './contas.mjs';
import { temPermissao } from './permissoes.mjs';

const NOME_VALIDO = /^[^\r\n]{1,32}$/;

const exigirGestaoDeSalas = (membro) => {
  if (!temPermissao(membro?.cargo, 'gerirSalas')) {
    throw new ErroDeConta('Seu cargo não permite mexer nas salas.', 403);
  }
};

export const listarCategorias = (db, servidorId) =>
  db.prepare('SELECT id, nome, ordem FROM categorias WHERE servidor_id = ? ORDER BY ordem, id')
    .all(servidorId);

export const buscarCategoria = (db, servidorId, id) =>
  db.prepare('SELECT id, nome, ordem FROM categorias WHERE servidor_id = ? AND id = ?')
    .get(servidorId, Number(id)) ?? null;

function conferirNome(db, servidorId, nome, exceto = null) {
  const limpo = String(nome ?? '').trim();
  if (!NOME_VALIDO.test(limpo)) {
    throw new ErroDeConta('O nome da categoria precisa ter de 1 a 32 caracteres, numa linha só.');
  }
  const igual = db.prepare(
    'SELECT id FROM categorias WHERE servidor_id = ? AND nome = ? COLLATE NOCASE',
  ).get(servidorId, limpo);
  if (igual && igual.id !== exceto) throw new ErroDeConta('Já existe uma categoria com esse nome.', 409);
  return limpo;
}

export function criarCategoria(db, servidorId, quem, nome) {
  exigirGestaoDeSalas(quem);
  const limpo = conferirNome(db, servidorId, nome);
  const ultima = db.prepare('SELECT MAX(ordem) o FROM categorias WHERE servidor_id = ?').get(servidorId).o;
  const info = db.prepare('INSERT INTO categorias (servidor_id, nome, ordem, criado_em) VALUES (?, ?, ?, ?)')
    .run(servidorId, limpo, (ultima ?? -1) + 1, Date.now());
  return buscarCategoria(db, servidorId, Number(info.lastInsertRowid));
}

export function renomearCategoria(db, servidorId, quem, id, nome) {
  exigirGestaoDeSalas(quem);
  const cat = buscarCategoria(db, servidorId, id);
  if (!cat) throw new ErroDeConta('Essa categoria não existe.', 404);
  db.prepare('UPDATE categorias SET nome = ? WHERE id = ?')
    .run(conferirNome(db, servidorId, nome, cat.id), cat.id);
  return buscarCategoria(db, servidorId, cat.id);
}

export function apagarCategoria(db, servidorId, quem, id) {
  exigirGestaoDeSalas(quem);
  const cat = buscarCategoria(db, servidorId, id);
  if (!cat) throw new ErroDeConta('Essa categoria não existe.', 404);
  // As salas sobrevivem e voltam para o topo. O ON DELETE SET NULL do banco faria isso
  // sozinho; está escrito aqui também porque é a regra, não um efeito colateral.
  db.prepare('UPDATE salas SET categoria_id = NULL WHERE categoria_id = ?').run(cat.id);
  db.prepare('DELETE FROM categorias WHERE id = ?').run(cat.id);
  return { ok: true };
}

export function reordenarCategorias(db, servidorId, quem, idsNaOrdem) {
  exigirGestaoDeSalas(quem);
  const atuais = new Set(listarCategorias(db, servidorId).map((c) => c.id));
  const ids = (idsNaOrdem ?? []).map(Number).filter((id) => atuais.has(id));
  // Mesma exigência das salas: citar todas, uma vez cada. Repetir uma deixaria outra de
  // fora e a ordem terminaria incoerente.
  if (new Set(ids).size !== atuais.size) {
    throw new ErroDeConta('A ordem precisa citar todas as categorias, uma vez cada.');
  }
  const mover = db.prepare('UPDATE categorias SET ordem = ? WHERE id = ?');
  ids.forEach((id, i) => mover.run(i, id));
  return listarCategorias(db, servidorId);
}

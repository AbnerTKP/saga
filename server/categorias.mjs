// Categorias: as gavetas onde as salas ficam guardadas.
//
// Uma gaveta não guarda conversa nenhuma — só agrupa. Por isso apagá-la NÃO apaga as
// salas: elas voltam para o topo, sem gaveta. Quem quiser perder a conversa apaga a sala,
// que é uma decisão diferente e tem outra pergunta.
import { ErroDeConta } from './contas.mjs';
import { temPermissao } from './permissoes.mjs';
import * as tabela from './repositorios/categorias.mjs';
import * as tabelaDeSalas from './repositorios/salas.mjs';

const NOME_VALIDO = /^[^\r\n]{1,32}$/;

const exigirGestaoDeSalas = (membro) => {
  if (!temPermissao(membro?.cargo, 'gerirSalas')) {
    throw new ErroDeConta('Seu cargo não permite mexer nas salas.', 403);
  }
};

export const listarCategorias = (db, servidorId) =>
  tabela.listar(db, servidorId);

export const buscarCategoria = (db, servidorId, id) =>
  tabela.buscar(db, servidorId, id);

function conferirNome(db, servidorId, nome, exceto = null) {
  const limpo = String(nome ?? '').trim();
  if (!NOME_VALIDO.test(limpo)) {
    throw new ErroDeConta('O nome da categoria precisa ter de 1 a 32 caracteres, numa linha só.');
  }
  const igual = tabela.comONome(db, servidorId, limpo);
  if (igual && igual.id !== exceto) throw new ErroDeConta('Já existe uma categoria com esse nome.', 409);
  return limpo;
}

export function criarCategoria(db, servidorId, quem, nome) {
  exigirGestaoDeSalas(quem);
  const limpo = conferirNome(db, servidorId, nome);
  const ultima = tabela.ultimaOrdem(db, servidorId);
  const id = tabela.inserir(db, { servidorId, nome: limpo, ordem: (ultima ?? -1) + 1, criadoEm: Date.now() });
  return buscarCategoria(db, servidorId, id);
}

export function renomearCategoria(db, servidorId, quem, id, nome) {
  exigirGestaoDeSalas(quem);
  const cat = buscarCategoria(db, servidorId, id);
  if (!cat) throw new ErroDeConta('Essa categoria não existe.', 404);
  tabela.renomear(db, cat.id, conferirNome(db, servidorId, nome, cat.id));
  return buscarCategoria(db, servidorId, cat.id);
}

export function apagarCategoria(db, servidorId, quem, id) {
  exigirGestaoDeSalas(quem);
  const cat = buscarCategoria(db, servidorId, id);
  if (!cat) throw new ErroDeConta('Essa categoria não existe.', 404);
  // As salas sobrevivem e voltam para o topo. O ON DELETE SET NULL do banco faria isso
  // sozinho; está escrito aqui também porque é a regra, não um efeito colateral.
  tabelaDeSalas.soltarDaCategoria(db, cat.id);
  tabela.apagar(db, cat.id);
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
  const mover = (ordem, id) => tabela.mover(db, id, ordem);
  ids.forEach((id, i) => mover(i, id));
  return listarCategorias(db, servidorId);
}

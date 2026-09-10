// Salas do servidor: de voz ou de texto. Criar, renomear, reordenar e apagar é do dono —
// quando os cargos configuráveis chegarem, isto vira uma permissão marcável.
import { ErroDeConta } from './contas.mjs';
import { temPermissao } from './permissoes.mjs';
import * as tabela from './repositorios/salas.mjs';
import * as tabelaDeCategorias from './repositorios/categorias.mjs';
import * as tabelaDeCargos from './repositorios/cargos.mjs';
import * as tabelaDeAcessos from './repositorios/sala_cargos.mjs';
import { podeVerASala, salasQueVejo } from './visibilidade.mjs';

export const TIPOS = ['voz', 'texto'];

const NOME_VALIDO = /^[^\r\n]{1,32}$/;

const exigirGestaoDeSalas = (membro) => {
  if (!temPermissao(membro?.cargo, 'gerirSalas')) {
    throw new ErroDeConta('Seu cargo não permite mexer nas salas.', 403);
  }
};

/**
 * As salas na ordem em que se lê a barra lateral: primeiro as que não estão em gaveta
 * nenhuma, depois cada categoria na ordem dela, com as suas dentro.
 *
 * `categoria_id IS NULL` primeiro é de propósito: sala fora de gaveta é a que a pessoa
 * ainda não guardou, e ela precisa estar à vista, não no fim da lista.
 */
/**
 * Todas as salas do servidor, sem olhar quem está perguntando.
 *
 * Use `salasDe` para o que vai à tela: esta aqui é para quem administra (a lista de
 * salas do painel) e para as contas internas. Confundir as duas é como uma sala privada
 * vaza — por isso os nomes são diferentes, e não um parâmetro opcional.
 */
export const listarSalas = (db, servidorId) => tabela.listar(db, servidorId);

/** Os cargos que veem cada sala privada, montado de uma vez para o servidor inteiro. */
export function acessosDoServidor(db, servidorId) {
  const porSala = new Map();
  for (const { sala_id: sala, cargo_id: cargo } of tabelaDeAcessos.doServidor(db, servidorId)) {
    porSala.set(sala, [...(porSala.get(sala) ?? []), cargo]);
  }
  return porSala;
}

/** As salas que ESTA pessoa vê. É o que vai para a barra lateral e para o /rooms. */
export const salasDe = (db, servidorId, quem) =>
  salasQueVejo(tabela.listar(db, servidorId), quem, acessosDoServidor(db, servidorId));

export const buscarSala = (db, servidorId, id) => tabela.buscar(db, servidorId, id);

/**
 * A sala, se esta pessoa puder vê-la — e `null` se não puder, do mesmo jeito que uma
 * sala que não existe.
 *
 * "Não existe" e "não é para os seus olhos" respondem igual de propósito: quem recebe
 * 403 numa sala que não vê aprende que ela existe, que é justamente o que privada quer
 * evitar. Toda porta passa por aqui: entrar na voz, ler e escrever no chat.
 */
export function salaVisivel(db, servidorId, quem, id) {
  const sala = tabela.buscar(db, servidorId, id);
  if (!sala) return null;
  return podeVerASala(quem, sala, tabelaDeAcessos.daSala(db, sala.id)) ? sala : null;
}

function conferirNome(db, servidorId, nome, exceto = null) {
  const limpo = String(nome ?? '').trim();
  if (!NOME_VALIDO.test(limpo)) {
    throw new ErroDeConta('O nome da sala precisa ter de 1 a 32 caracteres, numa linha só.');
  }
  const igual = tabela.comONome(db, servidorId, limpo);
  if (igual && igual.id !== exceto) throw new ErroDeConta('Já existe uma sala com esse nome.', 409);
  return limpo;
}

export function criarSala(db, servidorId, quem, { nome, tipo }) {
  exigirGestaoDeSalas(quem);
  if (!TIPOS.includes(tipo)) throw new ErroDeConta('A sala precisa ser de voz ou de texto.');
  const limpo = conferirNome(db, servidorId, nome);

  const ultima = tabela.ultimaOrdem(db, servidorId);
  const id = tabela.inserir(db, { servidorId, nome: limpo, tipo, ordem: (ultima ?? -1) + 1 });
  return buscarSala(db, servidorId, id);
}

/**
 * A sala de notas é do app, não do servidor: não se renomeia, não se apaga, não sai do
 * topo. É o que "chumbada" quer dizer — o dono do servidor manda em tudo lá dentro,
 * menos nisto, porque o conteúdo dela não vem de ninguém de lá.
 */
function exigirQueNaoSejaChumbada(sala, oQue) {
  if (sala?.papel) throw new ErroDeConta(`A sala de notas não pode ser ${oQue}.`, 403);
}

export function renomearSala(db, servidorId, quem, id, nome) {
  exigirGestaoDeSalas(quem);
  const sala = buscarSala(db, servidorId, id);
  if (!sala) throw new ErroDeConta('Essa sala não existe.', 404);
  exigirQueNaoSejaChumbada(sala, 'renomeada');
  const limpo = conferirNome(db, servidorId, nome, sala.id);
  tabela.renomear(db, sala.id, limpo);
  return buscarSala(db, servidorId, sala.id);
}

/**
 * Edita a sala: nome, privacidade e quem vê. Uma coisa só porque é uma decisão só —
 * "quem pode entrar aqui" e "como se chama" são a mesma tela, e mandar em dois pedidos
 * deixaria a sala meio trancada se o segundo falhasse.
 *
 * `cargos` é a lista inteira, não um acréscimo: é o estado da tela, e assim tirar um
 * cargo é mandar a lista sem ele — sem uma segunda rota para remover.
 */
export function editarSala(db, servidorId, quem, { id, nome, privada, cargos }) {
  exigirGestaoDeSalas(quem);
  const sala = buscarSala(db, servidorId, id);
  if (!sala) throw new ErroDeConta('Essa sala não existe.', 404);

  if (nome !== undefined) {
    exigirQueNaoSejaChumbada(sala, 'renomeada');
    tabela.renomear(db, sala.id, conferirNome(db, servidorId, nome, sala.id));
  }

  if (privada !== undefined) {
    exigirQueNaoSejaChumbada(sala, 'privada');
    tabela.definirPrivada(db, sala.id, privada);
  }

  if (cargos !== undefined) {
    // Cargo de outro servidor não entra: o id vem da tela, e a tela pode estar velha.
    const daqui = new Set(tabelaDeCargos.niveis(db, servidorId).map((c) => c.id));
    tabelaDeAcessos.limpar(db, sala.id);
    for (const c of cargos) if (daqui.has(Number(c))) tabelaDeAcessos.dar(db, sala.id, Number(c));
  }

  return verSala(db, servidorId, sala.id);
}

/** A sala com quem a vê junto: é o que a tela de edição precisa desenhar. */
export const verSala = (db, servidorId, id) => {
  const sala = buscarSala(db, servidorId, id);
  return sala && { ...sala, privada: !!sala.privada, cargos: tabelaDeAcessos.daSala(db, sala.id) };
};

export function apagarSala(db, servidorId, quem, id) {
  exigirGestaoDeSalas(quem);
  const sala = buscarSala(db, servidorId, id);
  if (!sala) throw new ErroDeConta('Essa sala não existe.', 404);
  exigirQueNaoSejaChumbada(sala, 'apagada');
  // Um servidor sem sala nenhuma não teria para onde entrar, e o dono ficaria preso numa
  // tela vazia sem entender o que fez.
  if (listarSalas(db, servidorId).length <= 1) {
    throw new ErroDeConta('Esta é a única sala: crie outra antes de apagar esta.', 409);
  }
  // As mensagens vão junto, pelo ON DELETE CASCADE.
  tabela.apagar(db, sala.id);
  return { ok: true };
}

/**
 * Recoloca as salas na ordem pedida — e, de quebra, na gaveta pedida.
 *
 * Aceita as duas formas: uma lista de ids (o que o app fazia antes de existir categoria)
 * e uma lista de `{id, categoriaId}`. App e servidor sobem separados, então a versão
 * velha do app precisa continuar reordenando sem saber de gaveta nenhuma.
 *
 * A `ordem` é DENTRO do grupo, e não uma numeração corrida: assim mover uma sala de
 * gaveta não obriga a renumerar a lista inteira, e duas gavetas podem ter uma sala 0 cada.
 */
export function reordenarSalas(db, servidorId, quem, itens) {
  exigirGestaoDeSalas(quem);
  // A chumbada fica de fora da conta, sem erro: arrastar a lista não pode falhar só
  // porque ela estava no caminho — ela apenas não se move.
  // E as salas que esta pessoa NÃO VÊ também ficam de fora, pelo mesmo motivo: a tela
  // dela manda o que ela enxerga, e exigir a lista inteira tornaria a barra inarrastável
  // para quem não vê uma sala privada. As invisíveis mantêm a `ordem` que tinham.
  const atuais = new Set(salasDe(db, servidorId, quem).filter((s) => !s.papel).map((s) => s.id));
  const pedidos = (itens ?? []).map((x) => (
    typeof x === 'object' && x !== null
      ? { id: Number(x.id), categoriaId: x.categoriaId == null ? null : Number(x.categoriaId) }
      : { id: Number(x), categoriaId: undefined }   // forma antiga: não mexe na gaveta
  ));

  // Contar quantos vieram não basta: repetir a mesma sala daria o mesmo total e deixaria
  // outra de fora, com a ordem terminando incoerente.
  const distintos = new Set(pedidos.map((p) => p.id).filter((id) => atuais.has(id)));
  if (pedidos.length !== atuais.size || distintos.size !== atuais.size) {
    throw new ErroDeConta('A ordem precisa citar todas as salas, uma vez cada.');
  }

  const gavetas = new Set(tabelaDeCategorias.idsDoServidor(db, servidorId));
  for (const p of pedidos) {
    if (p.categoriaId != null && !gavetas.has(p.categoriaId)) {
      throw new ErroDeConta('Essa categoria não existe.', 404);
    }
  }

  const daGaveta = (p) => (p.categoriaId === undefined ? 'igual' : String(p.categoriaId));
  const contador = new Map();
  for (const p of pedidos) {
    const chave = daGaveta(p);
    const i = contador.get(chave) ?? 0;
    contador.set(chave, i + 1);
    tabela.mover(db, p.id, i, p.categoriaId);
  }
  return listarSalas(db, servidorId);
}

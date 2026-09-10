// Cargos do servidor. As regras de quem pode o quê vivem em permissoes.mjs, sem banco;
// aqui é só guardar, ler e alterar.
import { ErroDeConta } from './contas.mjs';
import { limparPermissoes, podeMexerNoCargo, temPermissao } from './permissoes.mjs';
import * as tabela from './repositorios/cargos.mjs';
import * as tabelaDeMembros from './repositorios/membros.mjs';

const NOME_VALIDO = /^[^\r\n]{1,24}$/;
const COR_VALIDA = /^#[0-9a-f]{6}$/i;

const paraFora = (c) => c && ({
  id: c.id,
  nome: c.nome,
  cor: c.cor ?? null,
  nivel: c.nivel,
  permissoes: JSON.parse(c.permissoes || '[]'),
});

export const listarCargos = (db, servidorId) =>
  tabela.listar(db, servidorId).map(paraFora);

export const buscarCargo = (db, servidorId, id) =>
  paraFora(tabela.buscar(db, servidorId, id));

function conferir(db, servidorId, { nome, cor, nivel }, exceto = null) {
  const limpo = String(nome ?? '').trim();
  if (!NOME_VALIDO.test(limpo)) {
    throw new ErroDeConta('O nome do cargo precisa ter de 1 a 24 caracteres, numa linha só.');
  }
  if (cor != null && cor !== '' && !COR_VALIDA.test(cor)) {
    throw new ErroDeConta('A cor precisa ser um código como #a855f7.');
  }
  const n = Number(nivel);
  if (!Number.isInteger(n) || n < 1 || n > 99) {
    throw new ErroDeConta('O nível precisa ser um número de 1 a 99.');
  }
  const igual = tabela.comONome(db, servidorId, limpo);
  if (igual && igual.id !== exceto) throw new ErroDeConta('Já existe um cargo com esse nome.', 409);
  return { nome: limpo, cor: cor || null, nivel: n };
}

export function criarCargo(db, servidorId, quem, dados) {
  if (!temPermissao(quem?.cargo, 'gerirCargos')) {
    throw new ErroDeConta('Seu cargo não permite criar cargos.', 403);
  }
  const { nome, cor, nivel } = conferir(db, servidorId, dados);
  // Ninguém cria um cargo do próprio nível ou acima: seria dar a si mesmo um par capaz
  // de agir sobre quem o criou.
  if (!quem.cargo.dono && nivel >= quem.cargo.nivel) {
    throw new ErroDeConta('Não dá para criar um cargo do seu nível ou acima.', 403);
  }
  const permissoes = limparPermissoes(dados.permissoes);
  const id = tabela.inserir(db, servidorId, {
    nome, cor, nivel, permissoes: JSON.stringify(permissoes), criadoEm: Date.now(),
  });
  return buscarCargo(db, servidorId, id);
}

export function editarCargo(db, servidorId, quem, id, dados) {
  const cargo = buscarCargo(db, servidorId, id);
  const r = podeMexerNoCargo(quem, cargo);
  if (!r.pode) throw new ErroDeConta(r.motivo, 403);

  const { nome, cor, nivel } = conferir(db, servidorId, dados, cargo.id);
  if (!quem.cargo.dono && nivel >= quem.cargo.nivel) {
    throw new ErroDeConta('Não dá para pôr um cargo no seu nível ou acima.', 403);
  }
  // Ninguém dá a um cargo uma permissão que não tem: seria contornar o próprio limite
  // criando um cargo mais forte e vestindo-o depois.
  const pedidas = limparPermissoes(dados.permissoes);
  const permitidas = quem.cargo.dono ? pedidas : pedidas.filter((p) => temPermissao(quem.cargo, p));

  tabela.atualizar(db, cargo.id, { nome, cor, nivel, permissoes: JSON.stringify(permitidas) });
  return buscarCargo(db, servidorId, cargo.id);
}

export function apagarCargo(db, servidorId, quem, id) {
  const cargo = buscarCargo(db, servidorId, id);
  const r = podeMexerNoCargo(quem, cargo);
  if (!r.pode) throw new ErroDeConta(r.motivo, 403);

  // Quem estava nele desce para o cargo mais baixo, senão ficaria sem cargo nenhum e
  // sem poder entrar em lugar algum.
  const maisBaixo = tabela.oMaisBaixoExceto(db, servidorId, cargo.id);
  if (!maisBaixo) throw new ErroDeConta('É o único cargo que sobrou.', 409);

  tabelaDeMembros.trocarCargoDeTodos(db, servidorId, cargo.id, {
    cargoId: maisBaixo.id, nivel: maisBaixo.nivel,
  });
  tabela.apagar(db, cargo.id);
  return { ok: true, movidosPara: maisBaixo.id };
}

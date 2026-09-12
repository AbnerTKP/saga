// Contas, sessões e estado de moderação.
//
// A identidade é o apelido — escolhido uma vez e fixo. A coluna de e-mail existe no banco
// mas ainda não é pedida a ninguém: fica reservada para quando fizer sentido atrelar. É por
// isso que a senha esquecida se recupera pelo dono da Saga, e não por e-mail — ver
// "recuperar e trocar a senha", no fim.
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { gerarCodigo, limparCodigo } from './codigos.mjs';
import * as usuarios from './repositorios/usuarios.mjs';
import * as sessoes from './repositorios/sessoes.mjs';
import * as recuperacoes from './repositorios/recuperacoes.mjs';

export class ErroDeConta extends Error {
  /**
   * `tipo` diz ao app com que cara mostrar isto. Nem toda recusa é falha: "isso é do
   * Berserk" é convite, e pintá-lo de vermelho como um erro faz a pessoa achar que
   * quebrou alguma coisa. Quem decide é aqui, não o app adivinhando pelo texto.
   */
  constructor(mensagem, status = 400, tipo = 'erro') {
    super(mensagem);
    this.status = status;
    this.tipo = tipo;
  }
}

const APELIDO_VALIDO = /^[\p{L}\p{N}._-]{3,24}$/u;   // sem espaços: é usado para entrar
const SENHA_MINIMA = 6;

// --- senha ------------------------------------------------------------------

const CUSTO = { N: 16384, r: 8, p: 1 };
const TAMANHO = 64;

function hashDaSenha(senha) {
  const sal = randomBytes(16);
  const chave = scryptSync(senha, sal, TAMANHO, CUSTO);
  return `scrypt$${CUSTO.N}$${CUSTO.r}$${CUSTO.p}$${sal.toString('base64')}$${chave.toString('base64')}`;
}

/**
 * Senha que não é texto não confere, e não passa perto do scrypt: com um número ele lança
 * `TypeError`, e com um array aninhado um `String()` aqui estouraria a pilha — os dois,
 * vindos do JSON de quem pede, virariam 500 em vez de "não confere".
 */
export function senhaConfere(senha, guardado) {
  if (typeof senha !== 'string') return false;
  const partes = String(guardado ?? '').split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, N, r, p, sal, chave] = partes;
  const esperado = Buffer.from(chave, 'base64');
  const calculado = scryptSync(senha, Buffer.from(sal, 'base64'), esperado.length, {
    N: Number(N), r: Number(r), p: Number(p),
  });
  // timingSafeEqual exige o mesmo tamanho, e comparar sem ele vaza a senha pelo tempo.
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

/**
 * O tamanho da senha que vai ser GRAVADA, num lugar só: `trocarSenha` e `exigirSenhaNova`
 * tinham cada um a sua régua, e a de `trocarSenha` era justo a que deixava número passar.
 *
 * Senha que não é texto — número ou objeto vindo no JSON — cai aqui. Sem isso ela passaria
 * pela conta de tamanho, o scrypt lançaria lá dentro, e um corpo malformado viraria 500 em
 * vez de um não com motivo.
 */
function exigirTamanhoDaSenha(senha) {
  if (typeof senha !== 'string' || senha.length < SENHA_MINIMA) {
    throw new ErroDeConta(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
  }
}

/** A régua da senha nova, a mesma nas três portas: cadastro, "Sua conta" e recuperação. */
function exigirSenhaNova(senha, senhaRepetida) {
  exigirTamanhoDaSenha(senha);
  if (senha !== senhaRepetida) {
    throw new ErroDeConta('As duas senhas não são iguais.');
  }
}

// --- contas -----------------------------------------------------------------

const chaveDoApelido = (apelido) => apelido.trim().toLowerCase();

export function criarConta(db, { apelido, senha, senhaRepetida }) {
  // Sem `String()` no que veio do JSON: um array com milhares de níveis passa pelo
  // `JSON.parse`, mas estoura a pilha ao virar texto — medido, 5000 níveis em 10 KB —, e
  // cada pedido desses seria um 500 com a pilha inteira no registro.
  const nome = typeof apelido === 'string' ? apelido.trim() : '';
  if (!APELIDO_VALIDO.test(nome)) {
    throw new ErroDeConta('O apelido precisa ter de 3 a 24 caracteres, sem espaços.');
  }
  exigirSenhaNova(senha, senhaRepetida);

  const chave = chaveDoApelido(nome);
  if (usuarios.apelidoExiste(db, chave)) {
    throw new ErroDeConta('Esse apelido já está em uso.', 409);
  }

  const id = usuarios.inserir(db, {
    apelido: nome, chave, senhaHash: hashDaSenha(senha), criadoEm: Date.now(),
  });

  return buscarPorId(db, id);
}

/**
 * Troca a senha de uma conta.
 *
 * Passa pela mesma `hashDaSenha` do cadastro de propósito: uma segunda cópia dos
 * parâmetros do scrypt, num script solto, é como isso passa a divergir sem ninguém ver —
 * e o sintoma seria "a senha certa não entra", que ninguém liga à causa.
 *
 * No app, chega-se aqui por dois caminhos: `trocarMinhaSenha`, em "Sua conta", com a senha
 * atual; e `recuperarSenha`, com o código do dono. Nenhuma sessão cai aqui dentro, porque
 * quais caem é diferente em cada um dos dois. Fora do app, o dono da Saga que esqueceu a
 * própria senha — o código não vale para a conta dele — chega aqui pela VPS: a receita
 * está no CLAUDE.md, na entrada da recuperação.
 */
export function trocarSenha(db, usuarioId, senha) {
  exigirTamanhoDaSenha(senha);
  const mudou = usuarios.trocarSenha(db, usuarioId, hashDaSenha(senha));
  if (mudou === 0) throw new ErroDeConta('Essa conta não existe.', 404);
  return buscarPorId(db, Number(usuarioId));
}

export const buscarPorId = (db, id) => usuarios.buscarPorId(db, id);

/** Apelido que não é texto não é de ninguém — ver o `String()` que `criarConta` não usa. */
export const buscarPorApelido = (db, apelido) =>
  (typeof apelido === 'string' ? usuarios.buscarPorApelidoChave(db, chaveDoApelido(apelido)) : null);

// --- sessões ----------------------------------------------------------------
//
// Sessões não expiram por tempo: o app abre já logado. Somem quando a pessoa sai, quando
// recupera a senha pelo código (todas) e quando a troca em "Sua conta" (as outras). Banir e
// expulsar não tocam nelas: são do servidor, e a sessão é da conta.

const hashDoToken = (token) => createHash('sha256').update(token).digest('hex');

/** O crachá novo: o token cru vai para o app, e no banco fica só o hash dele. */
function abrirSessao(db, usuario) {
  const token = randomBytes(32).toString('base64url');
  sessoes.inserir(db, { tokenHash: hashDoToken(token), usuarioId: usuario.id, agora: Date.now() });
  return { usuario, token };
}

/** Confere a senha e devolve o token de sessão, que o app guarda para não pedir login de novo. */
export function entrar(db, { apelido, senha }) {
  const usuario = buscarPorApelido(db, apelido);
  // Mesma mensagem para apelido inexistente e senha errada: não entrega quem existe.
  if (!usuario || !senhaConfere(senha, usuario.senha_hash)) {
    throw new ErroDeConta('Apelido ou senha incorretos.', 401);
  }
  return abrirSessao(db, usuario);
}

/**
 * Cria a conta e já abre a sessão dela.
 *
 * O `/cadastrar` fazia isso chamando `entrar` com a senha que acabara de gravar: um segundo
 * scrypt, num processo de um núcleo, para conferir o que ninguém duvidava.
 */
export function criarContaEEntrar(db, pedido) {
  return abrirSessao(db, criarConta(db, pedido ?? {}));
}

/**
 * `vista_em` é anotado no máximo uma vez por minuto, por sessão.
 *
 * Era anotado a CADA pedido autenticado — e o app faz um a cada 4 s, por pessoa. Com o
 * SQLite em WAL isso é uma transação de escrita por pedido, com fsync, no disco de uma
 * VPS pequena. Medido: o servidor de token escrevia **3,5 MB/s** e a máquina passava
 * 37–47% do tempo esperando disco. O campo, note-se, é escrito e NUNCA lido — era meio
 * megabyte por minuto para um dado que ninguém consulta.
 *
 * Um minuto de granularidade não muda nada para quem venha a usá-lo, e tira a escrita do
 * caminho de todo pedido. O mapa é limpo junto: sessão que sumiu não fica guardada.
 */
const ANOTAR_A_CADA = 60_000;
const anotadas = new Map();

export function usuarioDaSessao(db, token) {
  if (!token) return null;
  const hash = hashDoToken(token);
  const sessao = sessoes.usuarioDoToken(db, hash);
  if (!sessao) return null;

  const agora = Date.now();
  if (agora - (anotadas.get(hash) ?? 0) >= ANOTAR_A_CADA) {
    sessoes.anotarVista(db, hash, agora);
    anotadas.set(hash, agora);
    if (anotadas.size > 500) {
      for (const [k, t] of anotadas) if (agora - t >= ANOTAR_A_CADA) anotadas.delete(k);
    }
  }
  return buscarPorId(db, sessao.usuario_id);
}

/** Só para os testes: o intervalo mora em memória e sobrevive entre um caso e outro. */
export const esquecerAnotacoes = () => anotadas.clear();

export const sair = (db, token) => sessoes.apagar(db, hashDoToken(token ?? ''));

// --- recuperar e trocar a senha ----------------------------------------------
//
// Sem e-mail, quem atesta que a pessoa é a pessoa é o dono da Saga: ele gera um código no
// painel dele, manda por fora (WhatsApp), e com o código a pessoa escolhe a senha nova na
// tela de entrar. Por construção isso deixa o dono entrar em qualquer conta — ele já tem a
// VPS, então não é poder novo —, e por isso as rotas anotam no registro cada código emitido
// e cada senha trocada com um. Nunca o código, nunca a senha.
//
// "Ele já tem a VPS" vale para o dono em PESSOA, e não para a sessão dele: uma Saga aberta
// num computador sem ninguém por perto passaria a valer a conta de todo mundo. Por isso
// gerar o código pede a senha do dono de novo — ver `emitirRecuperacao`, em plataforma.mjs.

export const VALIDADE_DO_CODIGO = 60 * 60_000;   // uma hora

/**
 * Cinco erros matam o código. O freio é do CÓDIGO, e não da conta nem do IP: o antigo,
 * por IP, trancou o grupo inteiro atrás do mesmo roteador, e o login com senha não tranca
 * mais. Com 32⁸ códigos possíveis, cinco chutes por código emitido não levam a nada.
 */
export const ERROS_POR_CODIGO = 5;

/**
 * Uma recusa só, com o mesmo 400, para apelido que não existe, conta sem código e código
 * vencido, esgotado ou errado: dizer qual é entregaria, a quem estiver chutando, quem
 * existe e quem tem código pendente. 400 e nunca 401, que no app quer dizer "a sessão caiu".
 */
const recusarCodigo = () => {
  throw new ErroDeConta('Código inválido ou vencido. Peça outro ao dono da Saga.', 400);
};

/**
 * Gera o código de senha de uma conta, no lugar do que houver.
 *
 * Quem pode pedir é conferido em `plataforma.mjs`; aqui só se confere a conta. O código
 * volta em texto UMA vez, para a tela de quem gerou. No banco fica o hash, pelo mesmo
 * scrypt da senha: são 40 bits, e num sha256 quem lesse o banco os quebraria em minutos.
 */
export function emitirCodigoDeRecuperacao(db, usuarioId, criadoPor) {
  const conta = buscarPorId(db, usuarioId);
  if (!conta) throw new ErroDeConta('Essa conta não existe.', 404);

  const codigo = gerarCodigo();
  const criadoEm = Date.now();
  const expiraEm = criadoEm + VALIDADE_DO_CODIGO;
  recuperacoes.guardar(db, {
    usuarioId: conta.id, codigoHash: hashDaSenha(codigo), criadoPor, criadoEm, expiraEm,
  });
  // O hífen é da tela, para ler e ditar em dois pedaços; quem confere o tira de volta.
  return { codigo: `${codigo.slice(0, 4)}-${codigo.slice(4)}`, expiraEm, apelido: conta.apelido };
}

/**
 * Esqueci a senha: com o código do dono, a pessoa escolhe a senha nova e já entra.
 *
 * A ordem é o que importa aqui:
 * - a senha nova é conferida ANTES do código, para que errar a digitação dela não gaste
 *   tentativa nem consuma o código;
 * - o código certo sai do banco ANTES de a senha mudar: é de uso único, e o que o faz
 *   único é deixar de existir;
 * - todas as sessões da conta caem — inclusive a de quem entrou com a senha antiga, que
 *   pode ser justamente o motivo de trocá-la — e abre-se uma nova: quem recuperou já entra.
 *
 * Tudo é síncrono (`DatabaseSync` e `scryptSync`), então dois pedidos com o mesmo código
 * não se intercalam: o segundo só começa depois de o primeiro ter apagado a linha.
 *
 * Conta sem código não paga scrypt nenhum, e o tempo da resposta deixa escapar que uma
 * conta tem código pendente. É de propósito: numa VPS de um núcleo, fazer todo pedido de
 * lixo custar um scrypt é pior do que isso — e o `entrar` já tem a mesma propriedade.
 *
 * `aoEsgotar` é chamado quando o quinto erro mata o código, para a rota anotar no registro.
 * Sem sessão nenhuma e sabendo só um apelido, qualquer um queima os códigos de uma conta —
 * cada um morre em cinco pedidos, antes de chegar pelo WhatsApp —, e a pessoa, com o código
 * certo na mão, lê a mesma recusa de quem digitou errado. A recusa continua igual para quem
 * pede; é o registro que deixa o dono separar "errou a digitação" de "estão queimando".
 */
export function recuperarSenha(db, pedido, { aoEsgotar } = {}) {
  const { apelido, codigo, senha, senhaRepetida } = pedido ?? {};
  exigirSenhaNova(senha, senhaRepetida);

  const conta = buscarPorApelido(db, apelido);
  const pendente = conta ? recuperacoes.daConta(db, conta.id) : null;
  if (!pendente) recusarCodigo();
  if (pendente.expira_em <= Date.now() || pendente.erros >= ERROS_POR_CODIGO) {
    recuperacoes.apagar(db, conta.id);
    recusarCodigo();
  }

  if (!senhaConfere(limparCodigo(codigo), pendente.codigo_hash)) {
    if (recuperacoes.contarErro(db, conta.id) >= ERROS_POR_CODIGO) {
      recuperacoes.apagar(db, conta.id);
      aoEsgotar?.(conta);
    }
    recusarCodigo();
  }

  recuperacoes.apagar(db, conta.id);
  const atualizada = trocarSenha(db, conta.id, senha);
  sessoes.apagarDaConta(db, conta.id);
  return abrirSessao(db, atualizada);
}

/**
 * Trocar a senha estando logado, em "Sua conta".
 *
 * Pede a senha atual, porque sessão aberta não prova que é a pessoa: basta o computador ter
 * ficado ligado noutro lugar. Errar a atual é 403, e não 401, que o app lê como "a sessão
 * caiu" e desloga. As OUTRAS sessões da conta caem; a deste pedido fica, porque é de quem
 * acabou de mostrar que sabe a senha.
 *
 * O código de senha pendente cai junto. Ele só existia porque a pessoa não sabia a senha, e
 * quem acabou de trocá-la com a atual encerrou esse caso: sobrando, ele trocaria a senha de
 * novo nas mãos de quem lesse a conversa do WhatsApp, e derrubaria até esta sessão.
 */
export function trocarMinhaSenha(db, token, pedido) {
  const { senhaAtual, senha, senhaRepetida } = pedido ?? {};
  const usuario = usuarioDaSessao(db, token);
  if (!usuario) throw new ErroDeConta('Faça login novamente.', 401);
  if (!senhaConfere(senhaAtual, usuario.senha_hash)) {
    throw new ErroDeConta('A senha atual não confere.', 403);
  }
  exigirSenhaNova(senha, senhaRepetida);

  trocarSenha(db, usuario.id, senha);
  recuperacoes.apagar(db, usuario.id);
  return { encerradas: sessoes.apagarOutrasDaConta(db, usuario.id, hashDoToken(token)) };
}

/**
 * Até quando vale o código de cada conta que tem um que ainda serve — nem vencido, nem
 * esgotado. `agora` entra por parâmetro para o teste não depender da hora em que roda.
 */
export function codigosPendentes(db, agora = Date.now()) {
  return new Map(recuperacoes.validas(db, agora)
    .filter((r) => r.erros < ERROS_POR_CODIGO)
    .map((r) => [r.usuario_id, r.expira_em]));
}

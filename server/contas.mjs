// Contas, sessões e estado de moderação.
//
// A identidade é o apelido — escolhido uma vez e fixo. A coluna de e-mail existe no banco
// mas ainda não é pedida a ninguém: fica reservada para quando fizer sentido atrelar.
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import * as usuarios from './repositorios/usuarios.mjs';
import * as sessoes from './repositorios/sessoes.mjs';

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

export function senhaConfere(senha, guardado) {
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

// --- contas -----------------------------------------------------------------

const chaveDoApelido = (apelido) => apelido.trim().toLowerCase();

export function criarConta(db, { apelido, senha, senhaRepetida }) {
  const nome = String(apelido ?? '').trim();
  if (!APELIDO_VALIDO.test(nome)) {
    throw new ErroDeConta('O apelido precisa ter de 3 a 24 caracteres, sem espaços.');
  }
  if (String(senha ?? '').length < SENHA_MINIMA) {
    throw new ErroDeConta(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
  }
  if (senha !== senhaRepetida) {
    throw new ErroDeConta('As duas senhas não são iguais.');
  }

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
 * Não existe caminho para isto no app, e por enquanto é assim: o grupo tem oito pessoas
 * e quem esquece pede ao dono. O que não podia existir era só o jeito errado.
 */
export function trocarSenha(db, usuarioId, senha) {
  if (String(senha ?? '').length < SENHA_MINIMA) {
    throw new ErroDeConta(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
  }
  const mudou = usuarios.trocarSenha(db, usuarioId, hashDaSenha(senha));
  if (mudou === 0) throw new ErroDeConta('Essa conta não existe.', 404);
  return buscarPorId(db, Number(usuarioId));
}

export const buscarPorId = (db, id) => usuarios.buscarPorId(db, id);

export const buscarPorApelido = (db, apelido) =>
  usuarios.buscarPorApelidoChave(db, chaveDoApelido(String(apelido ?? '')));

// --- sessões ----------------------------------------------------------------

const hashDoToken = (token) => createHash('sha256').update(token).digest('hex');

/** Confere a senha e devolve o token de sessão, que o app guarda para não pedir login de novo. */
export function entrar(db, { apelido, senha }) {
  const usuario = buscarPorApelido(db, apelido);
  // Mesma mensagem para apelido inexistente e senha errada: não entrega quem existe.
  if (!usuario || !senhaConfere(String(senha ?? ''), usuario.senha_hash)) {
    throw new ErroDeConta('Apelido ou senha incorretos.', 401);
  }
  const token = randomBytes(32).toString('base64url');
  const agora = Date.now();
  sessoes.inserir(db, { tokenHash: hashDoToken(token), usuarioId: usuario.id, agora });
  return { usuario, token };
}

/** Sessões não expiram por tempo: o app abre já logado. Só somem se a pessoa sair ou for expulsa. */
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

/** Expulsar e banir derrubam todas as sessões: a pessoa não continua dentro com o app aberto. */
export const derrubarSessoes = (db, usuarioId) => sessoes.apagarDaConta(db, usuarioId);

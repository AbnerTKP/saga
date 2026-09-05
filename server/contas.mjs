// Contas, sessões e estado de moderação.
//
// A identidade é o apelido — escolhido uma vez e fixo. A coluna de e-mail existe no banco
// mas ainda não é pedida a ninguém: fica reservada para quando fizer sentido atrelar.
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export class ErroDeConta extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem);
    this.status = status;
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
  if (db.prepare('SELECT 1 FROM usuarios WHERE apelido_chave = ?').get(chave)) {
    throw new ErroDeConta('Esse apelido já está em uso.', 409);
  }

  const info = db.prepare(
    'INSERT INTO usuarios (apelido, apelido_chave, senha_hash, criado_em) VALUES (?, ?, ?, ?)',
  ).run(nome, chave, hashDaSenha(senha), Date.now());

  return buscarPorId(db, Number(info.lastInsertRowid));
}

export const buscarPorId = (db, id) =>
  db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id) ?? null;

export const buscarPorApelido = (db, apelido) =>
  db.prepare('SELECT * FROM usuarios WHERE apelido_chave = ?').get(chaveDoApelido(String(apelido ?? ''))) ?? null;

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
  db.prepare('INSERT INTO sessoes (token_hash, usuario_id, criada_em, vista_em) VALUES (?, ?, ?, ?)')
    .run(hashDoToken(token), usuario.id, agora, agora);
  return { usuario, token };
}

/** Sessões não expiram por tempo: o app abre já logado. Só somem se a pessoa sair ou for expulsa. */
export function usuarioDaSessao(db, token) {
  if (!token) return null;
  const hash = hashDoToken(token);
  const sessao = db.prepare('SELECT usuario_id FROM sessoes WHERE token_hash = ?').get(hash);
  if (!sessao) return null;
  db.prepare('UPDATE sessoes SET vista_em = ? WHERE token_hash = ?').run(Date.now(), hash);
  return buscarPorId(db, sessao.usuario_id);
}

export const sair = (db, token) =>
  db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hashDoToken(token ?? ''));

/** Expulsar e banir derrubam todas as sessões: a pessoa não continua dentro com o app aberto. */
export const derrubarSessoes = (db, usuarioId) =>
  db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(usuarioId);

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco } from './banco.mjs';
import { criarConta, entrar, usuarioDaSessao, sair, derrubarSessoes, senhaConfere, buscarPorApelido } from './contas.mjs';

const novo = () => abrirBanco(':memory:');
const conta = (db, apelido = 'abner', senha = 'segredo123') =>
  criarConta(db, { apelido, senha, senhaRepetida: senha });

test('cria conta e encontra pelo apelido', () => {
  const db = novo();
  const u = conta(db);
  assert.equal(u.apelido, 'abner');
  assert.equal(buscarPorApelido(db, 'ABNER').id, u.id, 'a busca tem de ignorar maiúsculas');
});

test('a senha não fica guardada em texto', () => {
  const db = novo();
  const u = conta(db, 'abner', 'segredo123');
  assert.ok(!u.senha_hash.includes('segredo123'));
  assert.match(u.senha_hash, /^scrypt\$/);
  assert.equal(senhaConfere('segredo123', u.senha_hash), true);
  assert.equal(senhaConfere('segredo124', u.senha_hash), false);
});

test('apelido repetido é recusado, mesmo trocando maiúsculas', () => {
  const db = novo();
  conta(db, 'abner');
  assert.throws(() => conta(db, 'AbNeR'), /já está em uso/);
});

test('apelido inválido é recusado', () => {
  const db = novo();
  for (const ruim of ['ab', 'com espaço', 'x'.repeat(25), '', 'tem/barra']) {
    assert.throws(() => conta(db, ruim), /apelido/i, `aceitou "${ruim}"`);
  }
});

test('apelido com acento é aceito', () => {
  const db = novo();
  assert.equal(conta(db, 'joão').apelido, 'joão');
});

test('senha curta e senhas diferentes são recusadas', () => {
  const db = novo();
  assert.throws(() => criarConta(db, { apelido: 'ana', senha: '123', senhaRepetida: '123' }), /pelo menos/);
  assert.throws(() => criarConta(db, { apelido: 'ana', senha: 'segredo123', senhaRepetida: 'outra12345' }), /não são iguais/);
});

test('entrar com senha certa devolve token; com errada, não', () => {
  const db = novo();
  conta(db, 'abner', 'segredo123');
  const { token, usuario } = entrar(db, { apelido: 'abner', senha: 'segredo123' });
  assert.ok(token && token.length > 20);
  assert.equal(usuario.apelido, 'abner');
  assert.throws(() => entrar(db, { apelido: 'abner', senha: 'errada' }), /incorretos/);
});

test('apelido inexistente dá a mesma mensagem que senha errada', () => {
  // Mensagens diferentes entregariam quais apelidos existem.
  const db = novo();
  conta(db, 'abner', 'segredo123');
  const a = (() => { try { entrar(db, { apelido: 'abner', senha: 'x' }); } catch (e) { return e.message; } })();
  const b = (() => { try { entrar(db, { apelido: 'ninguem', senha: 'x' }); } catch (e) { return e.message; } })();
  assert.equal(a, b);
});

test('a sessão sobrevive: o app abre já logado', () => {
  const db = novo();
  conta(db, 'abner');
  const { token } = entrar(db, { apelido: 'abner', senha: 'segredo123' });
  assert.equal(usuarioDaSessao(db, token).apelido, 'abner');
  assert.equal(usuarioDaSessao(db, token).apelido, 'abner', 'continua válida ao reabrir');
});

test('token inválido, vazio ou nulo não autentica', () => {
  const db = novo();
  conta(db, 'abner');
  for (const ruim of ['', null, undefined, 'inventado']) {
    assert.equal(usuarioDaSessao(db, ruim), null, `aceitou ${JSON.stringify(ruim)}`);
  }
});

test('o token guardado no banco não é o token em si', () => {
  const db = novo();
  conta(db, 'abner');
  const { token } = entrar(db, { apelido: 'abner', senha: 'segredo123' });
  const guardados = db.prepare('SELECT token_hash FROM sessoes').all().map((r) => r.token_hash);
  assert.ok(!guardados.includes(token), 'o token cru foi parar no banco');
});

test('sair encerra só aquela sessão; derrubarSessoes encerra todas', () => {
  const db = novo();
  const u = conta(db, 'abner');
  const a = entrar(db, { apelido: 'abner', senha: 'segredo123' }).token;
  const b = entrar(db, { apelido: 'abner', senha: 'segredo123' }).token;
  sair(db, a);
  assert.equal(usuarioDaSessao(db, a), null);
  assert.ok(usuarioDaSessao(db, b), 'a outra sessão caiu junto');
  derrubarSessoes(db, u.id);
  assert.equal(usuarioDaSessao(db, b), null);
});

test('apagar o usuário leva as sessões junto', () => {
  const db = novo();
  const u = conta(db, 'abner');
  const { token } = entrar(db, { apelido: 'abner', senha: 'segredo123' });
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(u.id);
  assert.equal(usuarioDaSessao(db, token), null);
});

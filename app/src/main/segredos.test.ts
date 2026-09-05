import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limparSegredos } from './segredos.ts';

test('senha em JSON não vai para o registro', () => {
  const limpo = limparSegredos('POST /entrar {"apelido":"abner","senha":"segredoDoAbner"}');
  assert.ok(!limpo.includes('segredoDoAbner'), limpo);
  assert.ok(limpo.includes('abner'), 'o apelido pode ficar: ajuda a investigar');
});

test('todas as variações de campo de senha são cobertas', () => {
  for (const campo of ['senha', 'senhaRepetida', 'senhaDoGrupo', 'password']) {
    const limpo = limparSegredos(`{"${campo}":"naoPodeVazar"}`);
    assert.ok(!limpo.includes('naoPodeVazar'), `${campo} vazou: ${limpo}`);
  }
});

test('senha sem aspas também é removida', () => {
  assert.ok(!limparSegredos('senha=naoPodeVazar123').includes('naoPodeVazar123'));
});

test('crachá de sessão não vai para o registro', () => {
  const token = 'aB3xY9zQ7wE2rT5yU8iO1pA4sD6fG0hJ';
  for (const linha of [`x-sessao: ${token}`, `{"x-sessao":"${token}"}`, `Authorization: Bearer ${token}`]) {
    assert.ok(!limparSegredos(linha).includes(token), `vazou em: ${linha}`);
  }
});

test('o que não é segredo continua legível', () => {
  const texto = 'GET /rooms → 500 erro no servidor (sala Geral, usuário u3)';
  assert.equal(limparSegredos(texto), texto);
});

test('mensagem de erro comum passa inteira', () => {
  const texto = 'TypeError: Cannot read properties of undefined (reading "nome")\n    at Sidebar.tsx:42';
  assert.equal(limparSegredos(texto), texto);
});

test('não quebra com entrada estranha', () => {
  assert.equal(limparSegredos(null), '');
  assert.equal(limparSegredos(undefined), '');
  assert.equal(limparSegredos(12345), '12345');
});

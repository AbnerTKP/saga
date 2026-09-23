import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerComando, comandosParaOMenu } from './comandos.ts';

test('comando conhecido vira comando, com o resto como argumento', () => {
  assert.deepEqual(lerComando('/tocar https://youtu.be/dQw4w9WgXcQ'), { nome: 'tocar', arg: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.deepEqual(lerComando('  /Tocar   rick astley  '), { nome: 'tocar', arg: 'rick astley' });
  assert.deepEqual(lerComando('/pular'), { nome: 'pular', arg: '' });
});

test('barra que não é comando continua sendo mensagem', () => {
  assert.equal(lerComando('/shrug'), null);
  assert.equal(lerComando('/ oi'), null);
  assert.equal(lerComando('e/ou'), null);
  assert.equal(lerComando('tocar isso'), null);
});

test('o menu filtra pelo começo e some quando chega o argumento', () => {
  assert.equal(comandosParaOMenu('/').length, 4);
  assert.deepEqual(comandosParaOMenu('/p').map((c) => c.nome), ['pular', 'parar']);
  assert.deepEqual(comandosParaOMenu('/tocar ').map((c) => c.nome), []);
  assert.deepEqual(comandosParaOMenu('oi').map((c) => c.nome), []);
});

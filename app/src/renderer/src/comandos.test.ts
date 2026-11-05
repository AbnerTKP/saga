import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerComando, comandosParaOMenu, pareceLinkDePlaylist } from './comandos.ts';

test('tirar a playlist é comando, mas só o cartão oferece', () => {
  assert.deepEqual(lerComando('/tirar abc123'), { nome: 'tirar', arg: 'abc123' });
  assert.deepEqual(comandosParaOMenu('/t').map((c) => c.nome), ['tocar']);
  assert.ok(!comandosParaOMenu('/').some((c) => c.nome === 'tirar'));
});

test('a tela reconhece link de playlist para dizer o que está abrindo', () => {
  assert.ok(pareceLinkDePlaylist('https://www.youtube.com/playlist?list=PL123'));
  assert.ok(pareceLinkDePlaylist('https://www.youtube.com/watch?v=abc&list=PL123'));
  assert.ok(pareceLinkDePlaylist('https://open.spotify.com/intl-pt/album/x'));
  assert.ok(pareceLinkDePlaylist('https://open.spotify.com/playlist/x'));
  assert.ok(!pareceLinkDePlaylist('https://open.spotify.com/track/x'));
  assert.ok(!pareceLinkDePlaylist('https://youtu.be/abc'));
  assert.ok(!pareceLinkDePlaylist('rick astley'));
});

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

test('onde o app não toca, o menu não oferece o /tocar — e o resto continua', () => {
  assert.deepEqual(comandosParaOMenu('/', false).map((c) => c.nome), ['pular', 'parar', 'fila']);
  assert.deepEqual(comandosParaOMenu('/to', false), []);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { podeTransmitir } from './transmitir.ts';

test('sem lista de fontes, transmite — é o crachá do dono e de quem tem a permissão', () => {
  assert.equal(podeTransmitir(undefined), true);
  assert.equal(podeTransmitir([]), true);
});

test('com lista, só transmite se a tela estiver nela', () => {
  // câmera 1, microfone 2, soundboard (unknown) 0 — o crachá de quem não tem a permissão
  assert.equal(podeTransmitir([1, 2, 0]), false);
  assert.equal(podeTransmitir([1, 2, 0, 3]), true);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comASala, salaGuardada } from './ultimaSala.ts';

test('cada servidor lembra a sua sala, e cada conta a sua', () => {
  let t = comASala(null, 1, 10, 100);
  t = comASala(t, 1, 20, 200);
  t = comASala(t, 2, 10, 300);
  assert.equal(salaGuardada(t, 1, 10), 100);
  assert.equal(salaGuardada(t, 1, 20), 200);
  assert.equal(salaGuardada(t, 2, 10), 300);
  assert.equal(salaGuardada(t, 2, 20), null);
});

test('a sala nova substitui a antiga do mesmo servidor', () => {
  assert.equal(salaGuardada(comASala(comASala(null, 1, 10, 100), 1, 10, 101), 1, 10), 101);
});

test('texto estragado no localStorage vale como vazio', () => {
  for (const ruim of ['{', '[]', 'null', '"x"', '{"1:10":"cem"}']) assert.equal(salaGuardada(ruim, 1, 10), null, ruim);
  assert.equal(salaGuardada(comASala('{', 1, 10, 5), 1, 10), 5);
});

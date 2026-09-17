import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordenar } from './apuracao.ts';
import { CANDIDATOS } from './candidatos.ts';

test('a apuração põe todas as chapas, a mais votada primeiro, e branco e nulo no fim', () => {
  const lista = ordenar([{ numero: 30, votos: 2 }, { numero: 'nulo', votos: 9 }, { numero: 13, votos: 2 }, { numero: 80, votos: 5 }]);
  assert.equal(lista.length, CANDIDATOS.length + 2);
  assert.deepEqual(lista.slice(0, 3).map((c) => c.numero), [80, 13, 30], 'empate vai pelo número, não por nome');
  assert.deepEqual(lista.slice(-2), [{ numero: 'branco', votos: 0 }, { numero: 'nulo', votos: 9 }]);
});

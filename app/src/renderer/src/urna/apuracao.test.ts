import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordenar, porcentagens } from './apuracao.ts';
import { CANDIDATOS } from './candidatos.ts';

test('a apuração põe as duas chapas, a mais votada primeiro, e branco e nulo no fim', () => {
  assert.equal(CANDIDATOS.length, 2);
  const lista = ordenar([{ numero: 22, votos: 2 }, { numero: 'nulo', votos: 9 }, { numero: 13, votos: 1 }]);
  assert.deepEqual(lista.map((c) => c.numero), [22, 13, 'branco', 'nulo']);
  assert.deepEqual(ordenar([{ numero: 22, votos: 3 }, { numero: 13, votos: 3 }]).slice(0, 2).map((c) => c.numero), [13, 22],
    'empate vai pelo número, não por nome');
});

test('a porcentagem é dos válidos e soma 100, sem voto nenhum dá zero', () => {
  assert.deepEqual(porcentagens([7, 5]), [58, 42]);
  assert.deepEqual(porcentagens([1, 2]), [33, 67], 'o ponto que sobra vai para o maior resto');
  assert.deepEqual(porcentagens([1, 1]), [50, 50]);
  assert.deepEqual(porcentagens([0, 0]), [0, 0]);
  assert.deepEqual(porcentagens([3, 0]), [100, 0]);
});

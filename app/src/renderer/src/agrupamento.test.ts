import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ehContinuacao, JUNTAS_ATE } from './agrupamento.ts';

const em = (hora: number, minuto = 0, dia = 10) =>
  new Date(2026, 8, dia, hora, minuto).getTime();

test('a primeira mensagem nunca continua nada', () => {
  assert.equal(ehContinuacao(null, { autorId: 1, criadoEm: em(22) }), false);
});

test('a mesma pessoa logo em seguida continua', () => {
  const antes = { autorId: 1, criadoEm: em(22, 0) };
  assert.equal(ehContinuacao(antes, { autorId: 1, criadoEm: em(22, 1) }), true);
});

test('outra pessoa recomeça, por mais colada que esteja', () => {
  const antes = { autorId: 1, criadoEm: em(22, 0) };
  assert.equal(ehContinuacao(antes, { autorId: 2, criadoEm: em(22, 0) }), false);
});

test('depois de um tempo, a mesma pessoa recomeça', () => {
  const antes = { autorId: 1, criadoEm: em(22, 0) };
  assert.equal(ehContinuacao(antes, { autorId: 1, criadoEm: antes.criadoEm + JUNTAS_ATE }), true);
  assert.equal(ehContinuacao(antes, { autorId: 1, criadoEm: antes.criadoEm + JUNTAS_ATE + 1 }), false);
});

test('virou o dia, recomeça — mesmo com dois minutos de diferença', () => {
  // 23:59 e 00:01: o separador de dia entra entre as duas, e a de baixo ficaria órfã do
  // cabeçalho, colada num dia que não é o dela.
  const antes = { autorId: 1, criadoEm: em(23, 59, 10) };
  assert.equal(ehContinuacao(antes, { autorId: 1, criadoEm: em(0, 1, 11) }), false);
});

test('quem não tem autor não continua nem é continuado', () => {
  // É a Saga, na sala de notas: cada versão publicada é um recado inteiro.
  const nota = { autorId: null, criadoEm: em(22, 0) };
  assert.equal(ehContinuacao(nota, { autorId: null, criadoEm: em(22, 1) }), false);
  assert.equal(ehContinuacao(nota, { autorId: 1, criadoEm: em(22, 1) }), false);
  assert.equal(ehContinuacao({ autorId: 1, criadoEm: em(22, 0) }, nota), false);
});

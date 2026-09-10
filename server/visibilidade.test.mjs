import { test } from 'node:test';
import assert from 'node:assert/strict';
import { podeVerASala, salasQueVejo } from './visibilidade.mjs';

const membro = (cargoId, dono = false) => ({ cargo: { id: cargoId, nivel: 10, dono, permissoes: [] } });
const publica = { id: 1, privada: 0 };
const privada = { id: 2, privada: 1 };

test('sala pública é de todo mundo, inclusive de quem não tem cargo', () => {
  assert.equal(podeVerASala(membro(5), publica, []), true);
  assert.equal(podeVerASala({ cargo: null }, publica, []), true);
});

test('sala privada só aparece para os cargos escolhidos', () => {
  assert.equal(podeVerASala(membro(5), privada, [5]), true);
  assert.equal(podeVerASala(membro(9), privada, [5]), false);
  assert.equal(podeVerASala(membro(5), privada, []), false, 'sem cargo nenhum escolhido, ninguém vê');
});

test('quem não tem cargo não vê sala privada', () => {
  assert.equal(podeVerASala({ cargo: null }, privada, [5]), false);
  assert.equal(podeVerASala(undefined, privada, [5]), false);
});

test('quem criou o servidor vê tudo', () => {
  // Não é privilégio de cargo: é a saída para a sala que ficou sem cargo nenhum por
  // engano, que senão não teria como ser consertada por ninguém.
  assert.equal(podeVerASala(membro(9, true), privada, [5]), true);
  assert.equal(podeVerASala(membro(9, true), privada, []), true);
});

test('a lista some inteira para quem não pode, sem buraco no meio', () => {
  const salas = [publica, privada, { id: 3, privada: 0 }];
  const porSala = new Map([[2, [5]]]);
  assert.deepEqual(salasQueVejo(salas, membro(9), porSala).map((s) => s.id), [1, 3]);
  assert.deepEqual(salasQueVejo(salas, membro(5), porSala).map((s) => s.id), [1, 2, 3]);
});

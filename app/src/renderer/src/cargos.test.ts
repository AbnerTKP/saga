import { test } from 'node:test';
import assert from 'node:assert/strict';
import { empatadosCom, nivelParaCargoNovo } from './cargos.ts';

const DONO = { nivel: 1000, dono: true };

test('o cargo novo nasce acima do mais alto, sem empatar', () => {
  // O caso do CORNUME: "Peixe Souris" no 20, e o cargo seguinte caía no 20 também.
  assert.equal(nivelParaCargoNovo([20], DONO.nivel, true), 21);
  assert.equal(nivelParaCargoNovo([20, 21], DONO.nivel, true), 22);
  assert.equal(nivelParaCargoNovo([10, 50, 30], DONO.nivel, true), 51);
});

test('o primeiro cargo nasce no meio, com espaço dos dois lados', () => {
  assert.equal(nivelParaCargoNovo([], DONO.nivel, true), 20);
});

test('quem não é dono não passa do próprio nível', () => {
  // Nível 30 cria no máximo 29 — o servidor recusa 30 ou mais.
  assert.equal(nivelParaCargoNovo([20], 30, false), 21);
  assert.equal(nivelParaCargoNovo([29], 30, false), 28, 'não cabe acima: desce para o mais alto livre');
  assert.equal(nivelParaCargoNovo([28, 29], 30, false), 27);
});

test('sem espaço nenhum, devolve o menor e deixa o servidor explicar', () => {
  assert.equal(nivelParaCargoNovo([1], 1, false), 1);
});

test('o teto é 99, e cheio em cima procura livre embaixo', () => {
  assert.equal(nivelParaCargoNovo([99], DONO.nivel, true), 98);
  assert.equal(nivelParaCargoNovo([97, 98, 99], DONO.nivel, true), 96);
});

test('empate é visto antes de acontecer', () => {
  const cargos = [{ id: 8, nome: 'Peixe Souris', nivel: 20 }, { id: 9, nome: 'BEN 10', nivel: 20 }];
  assert.deepEqual(empatadosCom(20, cargos), ['Peixe Souris', 'BEN 10']);
  assert.deepEqual(empatadosCom(20, cargos, 9), ['Peixe Souris'], 'o cargo que se edita não empata consigo');
  assert.deepEqual(empatadosCom(21, cargos), []);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mudouDeDia, rotuloDoDia } from './dias.ts';

// Datas locais de propósito: a regra é do fuso de quem lê.
const em = (a: number, m: number, d: number, h = 12, min = 0) => new Date(a, m - 1, d, h, min).getTime();

test('a primeira mensagem sempre ganha separador', () => {
  assert.equal(mudouDeDia(null, em(2026, 9, 9)), true);
});

test('mensagens do mesmo dia não repetem o separador', () => {
  assert.equal(mudouDeDia(em(2026, 9, 9, 8), em(2026, 9, 9, 23, 59)), false);
});

test('a virada da meia-noite separa, mesmo com poucos minutos entre elas', () => {
  assert.equal(mudouDeDia(em(2026, 9, 9, 23, 58), em(2026, 9, 10, 0, 3)), true);
});

test('hoje e ontem têm nome; o resto tem data', () => {
  const agora = em(2026, 9, 9, 15);
  assert.equal(rotuloDoDia(em(2026, 9, 9, 2), agora), 'Hoje');
  assert.equal(rotuloDoDia(em(2026, 9, 8, 23), agora), 'Ontem');
  assert.equal(rotuloDoDia(em(2026, 9, 4), agora), '4 de set.');
});

test('ano diferente aparece; o ano corrente fica implícito', () => {
  const agora = em(2026, 9, 9);
  assert.equal(rotuloDoDia(em(2025, 12, 31), agora), '31 de dez. de 2025');
  assert.equal(rotuloDoDia(em(2026, 1, 1), agora), '1 de jan.');
});

test('"ontem" atravessa a virada do mês e do ano', () => {
  assert.equal(rotuloDoDia(em(2026, 8, 31), em(2026, 9, 1, 10)), 'Ontem');
  assert.equal(rotuloDoDia(em(2025, 12, 31), em(2026, 1, 1, 10)), 'Ontem');
});

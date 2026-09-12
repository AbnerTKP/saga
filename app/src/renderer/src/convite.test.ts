import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conviteDepoisDeColar, conviteDigitado } from './convite.ts';

test('o convite digitado com hífen ou espaço chega com as oito letras', () => {
  // Com o `maxLength` 8 do campo, "ABCD-2345" chegava ao servidor como "ABCD-234".
  assert.equal(conviteDigitado('ABCD-2345'), 'ABCD2345');
  assert.equal(conviteDigitado('abcd 2345'), 'ABCD2345');
  assert.equal(conviteDigitado(' ABCD2345 '), 'ABCD2345');
  assert.equal(conviteDigitado('ABCD23456'), 'ABCD2345');
  assert.equal(conviteDigitado(''), '');
});

test('colar o convite de uma conversa não come a última letra', () => {
  assert.equal(conviteDepoisDeColar('', 0, 0, ' ABCD2345'), 'ABCD2345');
  assert.equal(conviteDepoisDeColar('', 0, 0, 'ABCD-2345\n'), 'ABCD2345');
  assert.equal(conviteDepoisDeColar('', 0, 0, 'Entra no CORNUME: ABCD2345'), 'ABCD2345');
});

test('um convite inteiro colado troca o que estava no campo; um pedaço entra no cursor', () => {
  assert.equal(conviteDepoisDeColar('ABCD2345', 8, 8, 'EFGH6789'), 'EFGH6789');
  assert.equal(conviteDepoisDeColar('ABCD', 4, 4, '2345'), 'ABCD2345');
  assert.equal(conviteDepoisDeColar('ABCD', 4, 4, '-23'), 'ABCD23');
});

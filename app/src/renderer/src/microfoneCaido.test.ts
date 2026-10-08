import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESPERAS_PARA_REABRIR_MS, deveReabrirMicrofone } from './microfoneCaido.ts';

const caiu = { querFalar: true, surdo: false, conectado: true, faixaAcabou: true };

test('o microfone que caiu com a pessoa falando é reaberto', () => {
  assert.equal(deveReabrirMicrofone(caiu), true);
});

test('mudo de faixa viva não é queda: moderador, o seu e o do fone ficam como estão', () => {
  assert.equal(deveReabrirMicrofone({ ...caiu, faixaAcabou: false }), false);
});

test('quem se mutou, desligou o fone ou saiu da call não volta a falar sozinho', () => {
  assert.equal(deveReabrirMicrofone({ ...caiu, querFalar: false }), false);
  assert.equal(deveReabrirMicrofone({ ...caiu, surdo: true }), false);
  assert.equal(deveReabrirMicrofone({ ...caiu, conectado: false }), false);
});

test('as tentativas começam logo e dão tempo de o Bluetooth voltar', () => {
  assert.ok(ESPERAS_PARA_REABRIR_MS[0] <= 500);
  assert.ok(ESPERAS_PARA_REABRIR_MS.reduce((a, b) => a + b, 0) >= 15_000);
});

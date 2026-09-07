import { test } from 'node:test';
import assert from 'node:assert/strict';
import { falando, nivelDe, LIMIAR, SUSTENTAR } from './niveis.ts';

test('um pico acende na hora', () => {
  assert.equal(falando(LIMIAR + 0.01, 0, 1000), true);
});

test('silêncio curto não apaga: é a pausa entre sílabas', () => {
  assert.equal(falando(0, 1000, 1000 + SUSTENTAR - 1), true);
});

test('silêncio longo apaga', () => {
  assert.equal(falando(0, 1000, 1000 + SUSTENTAR), false);
});

test('quem nunca falou não acende por causa da sustentação', () => {
  // ultimoPico = 0 é "nunca"; sem esta guarda, `agora - 0 < 500` acenderia todo mundo
  // nos primeiros meio segundo de sala.
  assert.equal(falando(0, 0, 100), false);
});

test('chiado de microfone aberto não é fala', () => {
  const chiado = new Float32Array(256).map(() => (Math.random() - 0.5) * 0.01);
  assert.ok(nivelDe(chiado) < LIMIAR, 'o chiado passou por voz');
});

test('voz de verdade passa do limiar', () => {
  const voz = new Float32Array(256).map((_, i) => Math.sin(i / 4) * 0.3);
  assert.ok(nivelDe(voz) > LIMIAR);
});

test('silêncio absoluto é zero, e nada de dividir por zero', () => {
  assert.equal(nivelDe(new Float32Array(128)), 0);
  assert.equal(nivelDe(new Float32Array(0)), 0);
});

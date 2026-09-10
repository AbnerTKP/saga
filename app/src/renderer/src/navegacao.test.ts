import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oQueFazerAoClicar } from './navegacao.ts';

const voz = (id: number) => ({ id, tipo: 'voz' as const });
const texto = (id: number) => ({ id, tipo: 'texto' as const });

test('lendo uma conversa, entrar noutra call NÃO tira você da conversa', () => {
  // A queixa do dono: ele estava no chat e cada troca de call o jogava no palco, no meio
  // do que estava lendo.
  assert.deepEqual(oQueFazerAoClicar(voz(2), texto(9), 1), { abrir: false, entrar: true });
});

test('olhando o palco, trocar de call troca o palco', () => {
  assert.deepEqual(oQueFazerAoClicar(voz(2), voz(1), 1), { abrir: true, entrar: true });
});

test('sem nada aberto, entrar numa call mostra a call', () => {
  assert.deepEqual(oQueFazerAoClicar(voz(2), null, null), { abrir: true, entrar: true });
});

test('clicar na sala de voz em que já se está abre o palco, em vez de não fazer nada', () => {
  // Não há o que entrar: o clique só pode querer ver. Antes isso era um clique morto.
  assert.deepEqual(oQueFazerAoClicar(voz(1), texto(9), 1), { abrir: true, entrar: false });
  assert.deepEqual(oQueFazerAoClicar(voz(1), voz(1), 1), { abrir: true, entrar: false });
});

test('sala de texto sempre abre, e nunca mexe na voz', () => {
  assert.deepEqual(oQueFazerAoClicar(texto(9), voz(1), 1), { abrir: true, entrar: false });
  assert.deepEqual(oQueFazerAoClicar(texto(9), texto(8), 1), { abrir: true, entrar: false });
  assert.deepEqual(oQueFazerAoClicar(texto(9), null, null), { abrir: true, entrar: false });
});

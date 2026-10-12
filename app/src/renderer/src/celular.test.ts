import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recursosDaTela } from './celular.ts';

test('o app instalado tem tudo, numa janela larga ou estreita', () => {
  assert.deepEqual(recursosDaTela({ web: false, celular: false }),
    { transmitir: true, ligarCamera: true, soundboard: true, jogos: true });
});

test('no navegador do computador só não há transmitir a tela', () => {
  assert.deepEqual(recursosDaTela({ web: true, celular: false }),
    { transmitir: false, ligarCamera: true, soundboard: true, jogos: true });
});

test('no celular a primeira versão fica sem jogos, soundboard e câmera própria', () => {
  assert.deepEqual(recursosDaTela({ web: true, celular: true }),
    { transmitir: false, ligarCamera: false, soundboard: false, jogos: false });
});

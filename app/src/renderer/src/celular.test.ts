import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recursosDaTela } from './celular.ts';

test('o app instalado tem tudo, numa janela larga ou estreita', () => {
  assert.deepEqual(recursosDaTela({ web: false, celular: false }),
    { transmitir: true, ligarCamera: true, soundboard: true, jogos: true });
});

test('no navegador do computador que captura tela, tem tudo — transmitir inclusive', () => {
  assert.deepEqual(recursosDaTela({ web: true, celular: false, capturaNoNavegador: true }),
    { transmitir: true, ligarCamera: true, soundboard: true, jogos: true });
});

test('navegador que não sabe capturar a tela fica sem o botão', () => {
  assert.deepEqual(recursosDaTela({ web: true, celular: false, capturaNoNavegador: false }),
    { transmitir: false, ligarCamera: true, soundboard: true, jogos: true });
  assert.equal(recursosDaTela({ web: true, celular: false }).transmitir, false, 'sem dizer, não captura');
});

test('no celular a primeira versão fica sem jogos, soundboard, câmera própria e tela', () => {
  assert.deepEqual(recursosDaTela({ web: true, celular: true, capturaNoNavegador: true }),
    { transmitir: false, ligarCamera: false, soundboard: false, jogos: false });
});

test('o app instalado transmite mesmo sem a captura do navegador', () => {
  assert.equal(recursosDaTela({ web: false, celular: false, capturaNoNavegador: false }).transmitir, true);
});

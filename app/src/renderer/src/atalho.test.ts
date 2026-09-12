import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atalhoDoEvento, comoSeLe } from './atalho.ts';

const apertar = (o: Partial<Parameters<typeof atalhoDoEvento>[0]>) =>
  atalhoDoEvento({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, code: '', ...o });

test('a tecla vem do code, não do key: com Shift o "o" continua sendo O', () => {
  assert.equal(apertar({ ctrlKey: true, shiftKey: true, code: 'KeyO' }), 'Control+Shift+O');
});

test('número, F e as teclas de navegação valem', () => {
  assert.equal(apertar({ altKey: true, code: 'Digit1' }), 'Alt+1');
  assert.equal(apertar({ ctrlKey: true, code: 'F9' }), 'Control+F9');
  assert.equal(apertar({ ctrlKey: true, altKey: true, code: 'ArrowUp' }), 'Control+Alt+Up');
});

test('só modificador ainda não é atalho — é quem está no meio de apertar', () => {
  assert.equal(apertar({ ctrlKey: true, code: 'ControlLeft' }), null);
  assert.equal(apertar({ shiftKey: true, code: 'ShiftLeft' }), null);
});

test('tecla solta não vira atalho: ela seria roubada de todo programa aberto', () => {
  assert.equal(apertar({ code: 'KeyO' }), null);
});

test('tecla que não vale num atalho é ignorada', () => {
  assert.equal(apertar({ ctrlKey: true, code: 'CapsLock' }), null);
  assert.equal(apertar({ ctrlKey: true, code: 'Backquote' }), null);
});

test('a ordem dos modificadores é sempre a mesma', () => {
  assert.equal(apertar({ shiftKey: true, altKey: true, ctrlKey: true, code: 'KeyL' }), 'Control+Alt+Shift+L');
});

test('na tela, o atalho se lê com as teclas que se apertam — e cada sistema fala o seu', () => {
  assert.equal(comoSeLe('Control+Shift+O'), 'Ctrl + Shift + O');
  assert.equal(comoSeLe('Control+Shift+O', true), '⌃⇧O');
  assert.equal(comoSeLe('CommandOrControl+Alt+F9', true), '⌘⌥F9');
  assert.equal(comoSeLe('CommandOrControl+Alt+F9'), 'Ctrl + Alt + F9');
});

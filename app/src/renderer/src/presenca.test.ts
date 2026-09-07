import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusParaMandar, OCIOSO_PARA_AUSENTE } from './presenca.ts';

test('parado tempo demais vira ausente sozinho', () => {
  assert.equal(statusParaMandar('online', 0), 'online');
  assert.equal(statusParaMandar('online', OCIOSO_PARA_AUSENTE - 1), 'online');
  assert.equal(statusParaMandar('online', OCIOSO_PARA_AUSENTE), 'ausente');
});

test('quem se pôs como ocupado continua ocupado, mesmo largando a máquina', () => {
  // "Ocupado" é recado para os outros, não medição de presença.
  assert.equal(statusParaMandar('ocupado', 0), 'ocupado');
  assert.equal(statusParaMandar('ocupado', 9999), 'ocupado');
});

test('quem escolheu ausente volta a online ao mexer no computador', () => {
  // A escolha "ausente" é um estado, não uma trava: mexer no computador desfaz.
  assert.equal(statusParaMandar('ausente', 0), 'online');
  assert.equal(statusParaMandar('ausente', 9999), 'ausente');
});

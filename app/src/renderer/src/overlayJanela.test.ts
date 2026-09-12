import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alturaDe, esticarJanela, MAX, MIN } from './overlayJanela.ts';

const inicio = { x: 1000, y: 100, width: 384, height: 216 };

test('a janela do overlay é 16:9 puro — não tem barra embaixo', () => {
  assert.equal(alturaDe(384), 216);
  assert.equal(alturaDe(640), 360);
});

test('puxar a quina de baixo à direita deixa o canto de cima à esquerda parado', () => {
  const fim = esticarJanela(inicio, 'se', 96, 0);
  assert.deepEqual(fim, { x: 1000, y: 100, width: 480, height: 270 });
});

test('puxar a quina de cima à esquerda deixa o canto de baixo à direita parado', () => {
  const fim = esticarJanela(inicio, 'nw', -96, 0);
  assert.equal(fim.width, 480);
  assert.equal(fim.x + fim.width, inicio.x + inicio.width);
  assert.equal(fim.y + fim.height, inicio.y + inicio.height);
});

test('puxar a quina de cima à direita: cresce para a direita e sobe', () => {
  const fim = esticarJanela(inicio, 'ne', 96, 0);
  assert.equal(fim.x, inicio.x);
  assert.equal(fim.y + fim.height, inicio.y + inicio.height);
});

test('na diagonal manda quem andou mais', () => {
  const fim = esticarJanela(inicio, 'se', 4, 108);
  assert.equal(fim.width, Math.round((216 + 108) * (16 / 9)));
});

test('não encolhe até sumir nem cresce até virar o jogo', () => {
  assert.equal(esticarJanela(inicio, 'se', -5000, 0).width, MIN);
  assert.equal(esticarJanela(inicio, 'se', 5000, 0).width, MAX);
  // No mínimo, a quina oposta continua parada.
  const mini = esticarJanela(inicio, 'nw', 5000, 0);
  assert.equal(mini.width, MIN);
  assert.equal(mini.x + mini.width, inicio.x + inicio.width);
});

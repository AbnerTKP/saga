import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  alturaDe, aoSoltar, esticar, LARGURA_MAX, LARGURA_MIN, limitarLargura, MARGEM, PADRAO,
  paraTela, pousoGuardado, prender, validar,
} from './flutuante.ts';

const area = { largura: 1000, altura: 600 };

test('a altura sai da largura: 16:9 mais a barra', () => {
  assert.equal(alturaDe(320), 180 + 44);
  assert.equal(alturaDe(200), 113 + 44);
});

test('a largura respeita o mínimo, o máximo e a janela estreita', () => {
  assert.equal(limitarLargura(50, area), LARGURA_MIN);
  assert.equal(limitarLargura(5000, area), LARGURA_MAX);
  assert.equal(limitarLargura(400, { largura: 300, altura: 600 }), 268);
  // Numa janela menor que o próprio mínimo, o mínimo ganha: quadro de largura negativa
  // não existe.
  assert.equal(limitarLargura(400, { largura: 100, altura: 600 }), LARGURA_MIN);
});

test('prender não deixa o quadro sair pela borda', () => {
  assert.deepEqual(prender({ x: -50, y: -50, largura: 320 }, area), { x: 0, y: 0, largura: 320 });
  assert.deepEqual(prender({ x: 9000, y: 9000, largura: 320 }, area),
    { x: 1000 - 320, y: 600 - alturaDe(320), largura: 320 });
});

test('soltar perto de uma borda cola nela, e o canto guardado é o mais próximo', () => {
  const pouso = aoSoltar({ x: 1000 - 320 - 20, y: 600 - alturaDe(320) - 10, largura: 320 }, area);
  assert.deepEqual(pouso, { dx: MARGEM, dy: MARGEM, deDireita: true, deBaixo: true, largura: 320 });
});

test('soltar no meio guarda a distância como ela é, do canto mais próximo', () => {
  const pouso = aoSoltar({ x: 100, y: 300, largura: 320 }, area);
  assert.equal(pouso.deDireita, false);
  assert.equal(pouso.deBaixo, true);
  assert.equal(pouso.dx, 100);
  assert.equal(pouso.dy, 600 - 300 - alturaDe(320));
});

test('colado na direita continua colado depois de a janela mudar de tamanho', () => {
  const pouso = aoSoltar({ x: 1000 - 320 - MARGEM, y: 20, largura: 320 }, area);
  const maior = paraTela(pouso, { largura: 1600, altura: 900 });
  assert.equal(maior.x, 1600 - 320 - MARGEM);
  assert.equal(maior.y, MARGEM);
  // E numa janela ESTREITA ele encolhe junto, em vez de sumir pela borda.
  const estreita = paraTela(pouso, { largura: 300, altura: 400 });
  assert.equal(estreita.largura, 268);
  assert.ok(estreita.x >= 0 && estreita.x + estreita.largura <= 300);
});

test('o padrão é o canto de baixo à direita, acima da barra de escrever', () => {
  const caixa = paraTela(PADRAO, area);
  assert.equal(caixa.x, 1000 - 320 - 16);
  assert.equal(caixa.y, 600 - alturaDe(320) - 84);
});

test('esticar pela quina de baixo à direita deixa a de cima à esquerda parada', () => {
  const fim = esticar({ x: 100, y: 100, largura: 320 }, 'se', 80, 0, area);
  assert.deepEqual(fim, { x: 100, y: 100, largura: 400 });
});

test('esticar pela quina de cima à esquerda deixa a de baixo à direita parada', () => {
  const inicio = { x: 200, y: 200, largura: 320 };
  const fim = esticar(inicio, 'nw', -80, 0, area);
  assert.equal(fim.largura, 400);
  assert.equal(fim.x + fim.largura, inicio.x + inicio.largura);
  assert.equal(fim.y + alturaDe(fim.largura), inicio.y + alturaDe(inicio.largura));
});

test('na diagonal manda a direção que andou mais', () => {
  // Andou 8 px na horizontal e 90 na vertical: quem decide é a vertical.
  const fim = esticar({ x: 100, y: 100, largura: 320 }, 'se', 8, 90, area);
  assert.equal(fim.largura, limitarLargura(((alturaDe(320) + 90) - 44) * (16 / 9), area));
});

test('esticar não passa do mínimo nem some pela borda', () => {
  assert.equal(esticar({ x: 10, y: 10, largura: 320 }, 'se', -500, 0, area).largura, LARGURA_MIN);
  const grande = esticar({ x: 10, y: 10, largura: 320 }, 'se', 5000, 0, area);
  assert.ok(grande.x + grande.largura <= area.largura);
});

test('pouso estragado no localStorage volta ao padrão em vez de quebrar a tela', () => {
  assert.deepEqual(validar(null), PADRAO);
  assert.deepEqual(validar({ dx: 1 }), PADRAO);
  assert.deepEqual(validar({ dx: 1, dy: 2, largura: 300, deDireita: 'sim', deBaixo: false }), PADRAO);
  assert.deepEqual(validar({ dx: NaN, dy: 2, largura: 300, deDireita: true, deBaixo: false }), PADRAO);
  // Largura absurda é aparada, não descartada: o que a pessoa quis dizer continua valendo.
  assert.equal(validar({ dx: 1, dy: 2, largura: 9000, deDireita: true, deBaixo: true }).largura, LARGURA_MAX);
});

test('sem localStorage nenhum, o padrão', () => {
  const antes = (globalThis as { localStorage?: unknown }).localStorage;
  delete (globalThis as { localStorage?: unknown }).localStorage;
  assert.deepEqual(pousoGuardado(), PADRAO);
  if (antes) (globalThis as { localStorage?: unknown }).localStorage = antes;
});

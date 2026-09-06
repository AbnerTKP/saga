import test from 'node:test';
import assert from 'node:assert/strict';
import { limpar, estilo, arrastar, ehPadrao, PADRAO, ZOOM_MAXIMO } from './enquadramento.ts';

test('valores fora da régua são trazidos para dentro', () => {
  assert.deepEqual(limpar({ x: -10, y: 200, zoom: 50 }), { x: 0, y: 100, zoom: ZOOM_MAXIMO });
  assert.deepEqual(limpar({ x: 20, y: 30, zoom: 0.2 }), { x: 20, y: 30, zoom: 1 });
});

test('sem enquadramento, o padrão', () => {
  assert.deepEqual(limpar(null), PADRAO);
  assert.deepEqual(limpar({}), PADRAO);
  assert.ok(ehPadrao(limpar(undefined)));
});

test('sem aproximação não se escala à toa', () => {
  const s = estilo(PADRAO);
  assert.equal(s.objectPosition, '50% 50%');
  assert.equal(s.transform, undefined, 'escala 1 não precisa de transform');
});

test('com aproximação, a escala parte do mesmo ponto que a posição', () => {
  const s = estilo({ x: 20, y: 80, zoom: 2 });
  assert.equal(s.objectPosition, '20% 80%');
  assert.equal(s.transform, 'scale(2)');
  assert.equal(s.transformOrigin, '20% 80%',
    'origem diferente da posição faria a prévia mentir sobre o resultado');
});

test('o que vier estragado ainda desenha alguma coisa', () => {
  assert.equal(estilo({ x: NaN, y: NaN, zoom: NaN } as never).objectPosition, '50% 50%');
});

test('arrastar move a imagem no sentido do dedo', () => {
  // Puxando 50px para a direita num quadro de 200px, a imagem anda 25% para a direita —
  // ou seja, o ponto visível recua 25%.
  assert.deepEqual(arrastar(PADRAO, 50, 0, 200, 200), { x: 25, y: 50, zoom: 1 });
  assert.deepEqual(arrastar(PADRAO, 0, -100, 200, 200), { x: 50, y: 100, zoom: 1 });
});

test('arrastar não escapa da régua nem divide por zero', () => {
  assert.deepEqual(arrastar(PADRAO, 9999, 9999, 200, 200), { x: 0, y: 0, zoom: 1 });
  assert.deepEqual(arrastar(PADRAO, 10, 10, 0, 0), PADRAO);
});

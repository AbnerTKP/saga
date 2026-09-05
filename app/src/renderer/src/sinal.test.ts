import { test } from 'node:test';
import assert from 'node:assert/strict';
import { corDe, barrasDe } from './sinal.ts';

test('conexão perdida é vermelha, doa o ping que doer', () => {
  assert.equal(corDe('lost', 10), 'ruim');
  assert.equal(corDe('lost', null), 'ruim');
});

test('ping baixo com qualidade boa é verde', () => {
  assert.equal(corDe('excellent', 20), 'bom');
  assert.equal(corDe('good', 99), 'bom');
});

test('ping alto puxa para baixo mesmo com o LiveKit satisfeito', () => {
  // É o caso de quem está longe do servidor: sem perda de pacote, mas com atraso.
  assert.equal(corDe('excellent', 150), 'medio');
  assert.equal(corDe('excellent', 400), 'ruim');
});

test('qualidade ruim puxa para baixo mesmo com ping baixo', () => {
  // É o caso do wi-fi perdendo pacote: perto do servidor, mas picotando.
  assert.equal(corDe('poor', 20), 'medio');
});

test('as duas ruins continuam ruins, sem somar', () => {
  assert.equal(corDe('poor', 400), 'ruim');
});

test('sem medida ainda, não inventa', () => {
  assert.equal(corDe('unknown', null), 'sem');
  assert.equal(corDe('excellent', null), 'bom', 'já sabendo que está bom, não precisa do ping');
});

test('as fronteiras caem do lado certo', () => {
  assert.equal(corDe('excellent', 99), 'bom');
  assert.equal(corDe('excellent', 100), 'medio');
  assert.equal(corDe('excellent', 249), 'medio');
  assert.equal(corDe('excellent', 250), 'ruim');
});

test('a quantidade de barras acompanha a cor', () => {
  assert.deepEqual(
    (['bom', 'medio', 'ruim', 'sem'] as const).map(barrasDe),
    [3, 2, 1, 0],
  );
});

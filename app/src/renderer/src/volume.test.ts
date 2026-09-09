import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VOLUME, volumeGuardado } from './volume.ts';

test('o valor que derrubou o app é contido', () => {
  // 1.5 vinha do reforço de 150%: o elemento de áudio recusa e lança, e a exceção
  // estourava dentro de um efeito do React, deixando a janela cinza.
  assert.equal(VOLUME(1.5), 1);
});

test('fica sempre dentro do que o navegador aceita', () => {
  for (const v of [-1, 0, 0.5, 1, 1.5, 100, -0.0001]) {
    const r = VOLUME(v);
    assert.ok(r >= 0 && r <= 1, `${v} virou ${r}`);
  }
});

test('valores normais passam intactos', () => {
  assert.equal(VOLUME(0), 0);
  assert.equal(VOLUME(0.42), 0.42);
  assert.equal(VOLUME(1), 1);
});

test('lixo não vira volume zero por acidente', () => {
  // Voltar a 100% é o padrão seguro: silenciar alguém por causa de um NaN seria pior.
  assert.equal(VOLUME(NaN), 1);
  assert.equal(VOLUME(Infinity), 1);
  assert.equal(VOLUME(undefined as unknown as number), 1);
});

test('volume guardado: o que não se entende volta a 100%', () => {
  assert.equal(volumeGuardado(null), 1, 'nunca foi escolhido');
  assert.equal(volumeGuardado(''), 1, 'chave vazia — e Number("") é ZERO, que calaria tudo');
  assert.equal(volumeGuardado('  '), 1);
  assert.equal(volumeGuardado('alto'), 1);
});

test('volume guardado: o que se entende é respeitado, inclusive o silêncio', () => {
  assert.equal(volumeGuardado('0'), 0, 'escolher zero é escolher silêncio');
  assert.equal(volumeGuardado('0.35'), 0.35);
  assert.equal(volumeGuardado('1'), 1);
  assert.equal(volumeGuardado('2'), 1, 'acima de 100% o navegador lança');
  assert.equal(volumeGuardado('-1'), 0);
});

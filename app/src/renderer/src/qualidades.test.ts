import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TODAS, QUALIDADE_LIVRE, ehDoTurbo, qualidadesDe, qualidadeValida } from './qualidades.ts';

test('sem Turbo só existe 720p a 30 quadros', () => {
  assert.deepEqual(qualidadesDe(false), ['720p30']);
});

test('com Turbo, as quatro', () => {
  assert.deepEqual(qualidadesDe(true), TODAS);
});

test('1080p e 60 quadros são do Turbo, em qualquer combinação', () => {
  assert.equal(ehDoTurbo('720p30'), false);
  assert.equal(ehDoTurbo('1080p30'), true, '1080p pede Turbo mesmo a 30');
  assert.equal(ehDoTurbo('720p60'), true, '60 quadros pede Turbo mesmo em 720p');
  assert.equal(ehDoTurbo('1080p60'), true);
});

test('quem perde o Turbo cai para o que pode, em vez de continuar transmitindo alto', () => {
  assert.equal(qualidadeValida('1080p60', false), QUALIDADE_LIVRE);
  assert.equal(qualidadeValida('720p60', false), QUALIDADE_LIVRE);
  assert.equal(qualidadeValida('1080p60', true), '1080p60');
});

test('escolha guardada que não existe mais vira a livre, sem quebrar', () => {
  for (const lixo of ['4k120', '', null, undefined, 42]) {
    assert.equal(qualidadeValida(lixo, true), QUALIDADE_LIVRE, String(lixo));
  }
});

test('a qualidade livre passa para todo mundo', () => {
  assert.equal(qualidadeValida('720p30', false), '720p30');
  assert.equal(qualidadeValida('720p30', true), '720p30');
});

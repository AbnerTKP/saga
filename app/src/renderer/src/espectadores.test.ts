import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comoSeLe, porTransmissao, type NaCall } from './espectadores.ts';

const gente = (...linhas: [string, string, string | null][]): NaCall[] =>
  linhas.map(([identity, nome, assistindo]) => ({ identity, nome, assistindo }));

test('agrupa quem assiste por transmissão', () => {
  const mapa = porTransmissao(gente(
    ['u1', 'Abner', null],
    ['u2', 'Bruno', 'u1'],
    ['u3', 'Carla', 'u1'],
    ['u4', 'Dani', 'u5'],
  ));
  assert.deepEqual(mapa.get('u1')?.map((e) => e.nome), ['Bruno', 'Carla']);
  assert.deepEqual(mapa.get('u5')?.map((e) => e.nome), ['Dani']);
  assert.equal(mapa.get('u2'), undefined, 'ninguém assiste a quem não foi escolhido');
});

test('quem olha a própria transmissão não é plateia', () => {
  const mapa = porTransmissao(gente(['u1', 'Abner', 'u1'], ['u2', 'Bruno', 'u1']));
  assert.deepEqual(mapa.get('u1')?.map((e) => e.nome), ['Bruno']);
});

test('quem não escolheu nada não entra em lista nenhuma', () => {
  const mapa = porTransmissao(gente(['u1', 'Abner', null], ['u2', 'Bruno', '']));
  assert.equal(mapa.size, 0);
});

test('a ordem é por nome, e não a de chegada', () => {
  const mapa = porTransmissao(gente(
    ['u9', 'Zé', 'u1'], ['u2', 'Ana', 'u1'], ['u7', 'Ávila', 'u1'],
  ));
  assert.deepEqual(mapa.get('u1')?.map((e) => e.nome), ['Ana', 'Ávila', 'Zé']);
});

test('o texto da lista cabe no lugar apertado', () => {
  assert.equal(comoSeLe([]), '');
  assert.equal(comoSeLe(['Ana']), 'Ana');
  assert.equal(comoSeLe(['Ana', 'Bruno']), 'Ana e Bruno');
  assert.equal(comoSeLe(['Ana', 'Bruno', 'Carla']), 'Ana, Bruno e Carla');
  assert.equal(comoSeLe(['Ana', 'Bruno', 'Carla', 'Dani']), 'Ana, Bruno, Carla e mais 1');
  assert.equal(comoSeLe(['Ana', 'Bruno', 'Carla', 'Dani'], 2), 'Ana, Bruno e mais 2');
});

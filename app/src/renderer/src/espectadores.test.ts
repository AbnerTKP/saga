import { test } from 'node:test';
import assert from 'node:assert/strict';
import { porTransmissao, quemChegou, REPETIR_O_APITO, type NaCall } from './espectadores.ts';

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

test('o apito: quem chega na sua live apita uma vez, e quem já estava não', () => {
  const um = quemChegou(new Set(), ['u2'], new Map(), 1000);
  assert.deepEqual(um.chegaram, ['u2']);
  const dois = quemChegou(new Set(['u2']), ['u2', 'u3'], um.anunciados, 2000);
  assert.deepEqual(dois.chegaram, ['u3'], 'a Bia continuar assistindo não apita de novo');
  assert.deepEqual(quemChegou(new Set(['u2', 'u3']), ['u3'], dois.anunciados, 3000).chegaram, [], 'sair não apita');
});

test('o apito: a mesma pessoa voltando dentro de um minuto não vira sirene', () => {
  const primeira = quemChegou(new Set(), ['u2'], new Map(), 0);
  // Trocou de live e voltou; a internet piscou; você reconectou.
  assert.deepEqual(quemChegou(new Set(), ['u2'], primeira.anunciados, REPETIR_O_APITO - 1).chegaram, []);
  assert.deepEqual(quemChegou(new Set(), ['u2'], primeira.anunciados, REPETIR_O_APITO).chegaram, ['u2']);
});

test('o apito não mexe no registro que recebeu', () => {
  const anunciados = new Map([['u9', 5]]);
  quemChegou(new Set(), ['u2'], anunciados, 100_000);
  assert.deepEqual([...anunciados], [['u9', 5]]);
});

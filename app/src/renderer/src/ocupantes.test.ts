import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ocupantes } from './ocupantes.ts';

const gente = (...ids: string[]) => ids.map((identity) => ({ identity }));
const nomes = (l: { identity: string }[]) => l.map((p) => p.identity);

test('a busca atrasada não me deixa em duas salas ao mesmo tempo', () => {
  // Troquei do Jogos para o Geral: a busca ainda me lista no Jogos.
  const jogos = ocupantes(gente('u1', 'u2'), { euSou: 'u1', estouNesta: false });
  assert.deepEqual(nomes(jogos), ['u2'], 'continuei aparecendo na sala que deixei');
});

test('na sala em que estou, a busca passa inteira', () => {
  // Aqui quem manda é o LiveKit, e é ele que já entrega a lista — não se filtra nada.
  const geral = ocupantes(gente('u1', 'u3'), { euSou: 'u1', estouNesta: true });
  assert.deepEqual(nomes(geral), ['u1', 'u3']);
});

test('sair da call some na hora, sem esperar a busca', () => {
  // Sem sala de voz nenhuma, nenhuma sala é "esta": eu saio de todas.
  for (const sala of [gente('u1', 'u2'), gente('u4', 'u1')]) {
    assert.ok(!nomes(ocupantes(sala, { euSou: 'u1', estouNesta: false })).includes('u1'));
  }
});

test('ninguém mais é tocado', () => {
  const l = gente('u2', 'u3', 'u4');
  assert.deepEqual(nomes(ocupantes(l, { euSou: 'u1', estouNesta: false })), ['u2', 'u3', 'u4']);
});

test('sem saber quem eu sou, não se filtra nada', () => {
  // Antes de a sessão resolver não há "eu"; sumir com gente por causa disso seria pior.
  const l = gente('u1', 'u2');
  assert.deepEqual(nomes(ocupantes(l, { euSou: null, estouNesta: false })), ['u1', 'u2']);
});

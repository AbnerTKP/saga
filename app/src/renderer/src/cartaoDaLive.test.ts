import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acaoDaLive, plateiaEmTexto, ROTULO_DA_ACAO } from './cartaoDaLive.ts';

const base = { identity: 'u7', minhaIdentity: 'u1', salaId: 10, salaDaVozId: 10, assistindo: null };

test('na sua call, a live de alguém se assiste; a que você já assiste se larga', () => {
  assert.equal(acaoDaLive(base), 'assistir');
  assert.equal(acaoDaLive({ ...base, assistindo: 'u7' }), 'assistindo');
  assert.equal(ROTULO_DA_ACAO.assistindo, 'Sair da live');
  // Assistir OUTRA pessoa não conta como assistir esta.
  assert.equal(acaoDaLive({ ...base, assistindo: 'u9' }), 'assistir');
});

test('noutra sala, assistir é entrar na call', () => {
  assert.equal(acaoDaLive({ ...base, salaDaVozId: 11 }), 'entrarEAssistir');
  assert.equal(acaoDaLive({ ...base, salaDaVozId: null }), 'entrarEAssistir');
  // O que você escolheu na SUA call não vale para uma sala em que você não está.
  assert.equal(acaoDaLive({ ...base, salaDaVozId: 11, assistindo: 'u7' }), 'entrarEAssistir');
});

test('a própria transmissão não se oferece para assistir', () => {
  assert.equal(acaoDaLive({ ...base, identity: 'u1' }), 'sua');
});

test('a plateia diz o zero em vez de sumir', () => {
  assert.equal(plateiaEmTexto(0), 'ninguém assistindo ainda');
  assert.equal(plateiaEmTexto(1), '1 assistindo');
  assert.equal(plateiaEmTexto(4), '4 assistindo');
});

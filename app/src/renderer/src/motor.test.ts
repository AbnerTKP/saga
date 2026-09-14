import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARCHAS, rotacao, tomDoGiro } from './motor.ts';

test('o giro sobe dentro de cada marcha e cai na troca', () => {
  const max = 560;
  let antes = rotacao(0, max);
  assert.equal(antes.marcha, 1);
  let trocas = 0;
  for (let v = 5; v <= max; v += 5) {
    const agora = rotacao(v, max);
    if (agora.marcha === antes.marcha) assert.ok(agora.giro >= antes.giro - 1e-9, `giro caiu sem trocar em ${v}`);
    else {
      assert.equal(agora.marcha, antes.marcha + 1);
      assert.ok(agora.giro < antes.giro, `a troca em ${v} não derrubou o giro`);
      trocas++;
    }
    antes = agora;
  }
  assert.equal(trocas, MARCHAS.length - 1);
});

test('no talo o tom fica abaixo do de antes (200 Hz), e a marcha lenta tem tom', () => {
  const talo = rotacao(560, 560);
  assert.equal(talo.marcha, MARCHAS.length);
  assert.ok(talo.giro < 0.98, `giro no talo ${talo.giro}`);
  assert.ok(tomDoGiro(talo.giro) < 190, `tom no talo ${tomDoGiro(talo.giro)}`);
  assert.ok(tomDoGiro(rotacao(0, 560).giro) > 60);
  // de ré também ronca
  assert.deepEqual(rotacao(-100, 560), rotacao(100, 560));
});

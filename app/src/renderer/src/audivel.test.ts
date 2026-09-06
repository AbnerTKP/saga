import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mudo } from './audivel.ts';

const live = (identity: string) => ({ ehLive: true, identity });
const voz = (identity: string) => ({ ehLive: false, identity });
const palco = (liveNoPalco: string | null, cortadas: string[] = []) =>
  ({ surdo: false, cortadas: new Set(cortadas), liveNoPalco });

test('a live no palco é a única que se ouve', () => {
  assert.equal(mudo(live('ana'), palco('ana')), false);
  assert.equal(mudo(live('bia'), palco('ana')), true, 'a outra live cala');
});

test('sem live no palco, silêncio — não todas tocando de uma vez', () => {
  assert.equal(mudo(live('ana'), palco(null)), true);
  assert.equal(mudo(live('bia'), palco(null)), true);
});

test('live cortada cala mesmo estando no palco', () => {
  assert.equal(mudo(live('ana'), palco('ana', ['ana'])), true);
});

test('cortar uma não cala a outra', () => {
  assert.equal(mudo(live('bia'), palco('bia', ['ana'])), false);
});

test('a surdez cala tudo, live e voz', () => {
  const surdo = { surdo: true, cortadas: new Set<string>(), liveNoPalco: 'ana' };
  assert.equal(mudo(live('ana'), surdo), true);
  assert.equal(mudo(voz('ana'), surdo), true);
});

test('voz e soundboard não dependem do palco nem do que foi cortado', () => {
  assert.equal(mudo(voz('ana'), palco(null)), false);
  assert.equal(mudo(voz('bia'), palco('ana')), false, 'quem fala não cala por não estar transmitindo');
  assert.equal(mudo(voz('ana'), palco(null, ['ana'])), false,
    'parar de ver a live de alguém não é deixar de ouvir a pessoa');
});

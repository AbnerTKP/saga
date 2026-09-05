import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explicarFalhaDeAudio } from './erros.ts';

test('o erro que o amigo teve vira instrução, não enigma', () => {
  // Foi este, palavra por palavra, o que apareceu no registro dele.
  const m = explicarFalhaDeAudio('Could not start audio source');
  assert.match(m, /dispositivo de saída padrão/);
  assert.match(m, /modo exclusivo/);
  assert.ok(!m.includes('Could not start audio source'), 'a mensagem crua não ajuda ninguém');
});

test('reconhece o erro venha como vier', () => {
  for (const cru of [
    'Could not start audio source',
    'NotReadableError: Could not start audio source',
    'could not start AUDIO source',
  ]) {
    assert.match(explicarFalhaDeAudio(cru), /saída padrão/, cru);
  }
});

test('falta de permissão tem explicação própria', () => {
  assert.match(explicarFalhaDeAudio('NotAllowedError: Permission denied'), /permissão/);
});

test('erro desconhecido não é maquiado: aparece como veio', () => {
  // Inventar explicação para o que não se conhece mandaria a pessoa ao lugar errado —
  // que era exatamente o defeito da mensagem antiga.
  const m = explicarFalhaDeAudio('alguma coisa nova que ninguém viu ainda');
  assert.match(m, /alguma coisa nova que ninguém viu ainda/);
});

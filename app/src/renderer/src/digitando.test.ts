import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fraseDeQuemDigita } from './digitando.ts';

test('ninguém digitando não vira frase nenhuma', () => {
  assert.equal(fraseDeQuemDigita([]), null);
});

test('uma pessoa fica no singular', () => {
  assert.equal(fraseDeQuemDigita(['Bagre']), 'Bagre está digitando');
});

test('duas pessoas viram plural, com "e" e sem vírgula', () => {
  assert.equal(fraseDeQuemDigita(['Bagre', 'Tava1']), 'Bagre e Tava1 estão digitando');
});

test('três ainda cabem, com vírgula e "e" no fim', () => {
  assert.equal(
    fraseDeQuemDigita(['Bagre', 'Tava1', 'DaviS']),
    'Bagre, Tava1 e DaviS estão digitando',
  );
});

test('acima de três, a lista sai e sobra o que importa', () => {
  // Nome de gente não é curto: quatro por extenso passam da largura de qualquer janela,
  // e o que a linha precisa dizer é "tem gente escrevendo", não quem.
  assert.equal(
    fraseDeQuemDigita(['Bagre', 'Tava1', 'DaviS', 'Blankito']),
    'várias pessoas estão digitando',
  );
});

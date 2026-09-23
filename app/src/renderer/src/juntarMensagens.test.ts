import { test } from 'node:test';
import assert from 'node:assert/strict';
import { juntarMensagens } from './juntarMensagens.ts';

const m = (id: number) => ({ id });

test('a busca atrasada não repete a mensagem que o envio já mostrou', () => {
  // A busca saiu com "depois da 244"; nesse meio-tempo o /tocar respondeu e mostrou a 245.
  const naTela = [m(243), m(244), m(245)];
  const r = juntarMensagens(naTela, [m(245)]);
  assert.deepEqual(r.map((x) => x.id), [243, 244, 245]);
  assert.equal(r, naTela, 'nada novo: a mesma lista, sem redesenhar');
});

test('o que é novo entra, e o que já estava fica', () => {
  assert.deepEqual(juntarMensagens([m(1), m(2)], [m(2), m(3)]).map((x) => x.id), [1, 2, 3]);
});

test('continua com o teto de mensagens na tela', () => {
  const muitas = Array.from({ length: 300 }, (_, i) => m(i));
  assert.equal(juntarMensagens(muitas, [m(300)]).length, 300);
  assert.equal(juntarMensagens(muitas, [m(300)])[0].id, 1);
});

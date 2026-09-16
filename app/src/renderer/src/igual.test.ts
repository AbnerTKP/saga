import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mesmoSeIgual } from './igual.ts';

test('resposta com o mesmo conteúdo devolve o objeto de antes; mudou, o novo', () => {
  const antes = { servidorId: 1, rooms: [{ id: 6, nome: 'chat', pessoas: [] }] };
  assert.equal(mesmoSeIgual(antes, { servidorId: 1, rooms: [{ id: 6, nome: 'chat', pessoas: [] }] }), antes);
  const novo = { servidorId: 1, rooms: [{ id: 6, nome: 'chat', pessoas: [{ id: 1 }] }] };
  assert.equal(mesmoSeIgual(antes, novo), novo);
  const vazio: unknown[] = [];
  assert.equal(mesmoSeIgual(vazio, []), vazio);
  assert.equal(mesmoSeIgual(null, null), null);
});

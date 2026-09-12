import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comAPessoa, conversasComNovidade, ultimasVistas, COMO_SE_LE } from './amizade.ts';
import type { Conversa } from './api.ts';

const eu = { euId: 1, amigos: [2], enviados: [3], recebidos: [4] };

test('cada situação oferece uma coisa só', () => {
  assert.equal(comAPessoa(1, eu), 'euMesmo');
  assert.equal(comAPessoa(2, eu), 'conversar');
  assert.equal(comAPessoa(3, eu), 'esperando');
  assert.equal(comAPessoa(4, eu), 'responder');
  assert.equal(comAPessoa(9, eu), 'adicionar');
});

test('sem pessoa não há oferta nenhuma', () => {
  // Quem está numa call e não é da Saga — participante sem conta — não vira botão.
  assert.equal(comAPessoa(undefined, eu), null);
  assert.equal(comAPessoa(0, eu), null);
});

test('quem já é amigo não aparece como pedido, mesmo estando nas duas listas', () => {
  // Aceitar um pedido deixa a pessoa nas duas listas por uma volta da busca; ser amiga
  // vale mais que o pedido que acabou de virar amizade.
  assert.equal(comAPessoa(2, { euId: 1, amigos: new Set([2]), recebidos: new Set([2]) }), 'conversar');
});

test('o texto do botão é o mesmo em todo lugar que oferece a ação', () => {
  assert.equal(COMO_SE_LE.conversar, 'Mandar mensagem');
  assert.equal(COMO_SE_LE.adicionar, 'Adicionar amigo');
  assert.equal(COMO_SE_LE.euMesmo, null);
});

const conversa = (id: number, ultimaId: number, naoLidas = 1): Conversa => ({
  id,
  com: { id: id * 10, nome: `p${id}`, foto: null, enquadramento: {}, turbo: false, status: 'online' },
  previa: 'oi', ultimaEm: 1, ultimaId, naoLidas,
});

test('a primeira volta não avisa nada: abrir o app não é acontecer', () => {
  assert.deepEqual(conversasComNovidade(null, [conversa(1, 5)], null), []);
});

test('avisa só o que chegou depois da última volta', () => {
  const antes = ultimasVistas([conversa(1, 5), conversa(2, 9)]);
  const agora = [conversa(1, 7), conversa(2, 9)];
  assert.deepEqual(conversasComNovidade(antes, agora, null).map((c) => c.id), [1]);
});

test('a conversa aberta na tela não vira aviso', () => {
  const antes = ultimasVistas([conversa(1, 5)]);
  assert.deepEqual(conversasComNovidade(antes, [conversa(1, 7)], 1), []);
});

test('mensagem minha não vira aviso: o contador de não lidas não conta o que eu escrevi', () => {
  const antes = ultimasVistas([conversa(1, 5)]);
  assert.deepEqual(conversasComNovidade(antes, [conversa(1, 7, 0)], null), []);
});

test('conversa que aparece pela primeira vez com mensagem avisa', () => {
  // Alguém te mandou a primeira mensagem: a conversa nem existia na volta anterior.
  const antes = ultimasVistas([]);
  assert.deepEqual(conversasComNovidade(antes, [conversa(3, 1)], null).map((c) => c.id), [3]);
});

test('conversa aberta agora, sem mensagem nenhuma, não avisa', () => {
  const antes = ultimasVistas([]);
  assert.deepEqual(conversasComNovidade(antes, [conversa(4, 0, 0)], null), []);
});

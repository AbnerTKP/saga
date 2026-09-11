import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ehMinhaVez, jogandoAgora, minhaMesa, quemChamar, type ResumoDaMesa } from './jogos.ts';
import type { Membro } from './api.ts';

const mesa = (m: Partial<ResumoDaMesa> & { id: number }): ResumoDaMesa => ({
  estado: 'lobby', anfitriao: 1, brancas: null, pretas: null, convidado: null, vez: null, ...m,
});

test('quem está jogando é quem está numa partida em andamento, das duas cores', () => {
  const j = jogandoAgora([
    mesa({ id: 1, estado: 'jogando', brancas: 1, pretas: 2, vez: 'w' }),
    mesa({ id: 2, estado: 'lobby', anfitriao: 3, convidado: 4 }),
    mesa({ id: 3, estado: 'fim', brancas: 5, pretas: 6 }),
  ]);
  assert.deepEqual([...j.keys()].sort(), [1, 2]);
  assert.equal(j.get(2)?.id, 1);
});

test('a sua mesa é a partida em que você joga, antes da que você abriu e da que acabou', () => {
  const mesas = [
    mesa({ id: 7, estado: 'fim', brancas: 1, pretas: 2 }),
    mesa({ id: 8, estado: 'lobby', anfitriao: 1 }),
    mesa({ id: 9, estado: 'jogando', brancas: 3, pretas: 1, vez: 'b' }),
  ];
  assert.equal(minhaMesa(mesas, 1)?.id, 9);
  assert.equal(minhaMesa(mesas.slice(0, 2), 1)?.id, 8);
  assert.equal(minhaMesa(mesas.slice(0, 1), 1)?.id, 7);
  assert.equal(minhaMesa(mesas, 42), null);
  // Ser chamado para uma mesa não a torna sua: ela só é sua quando você aceita.
  assert.equal(minhaMesa([mesa({ id: 10, anfitriao: 3, convidado: 1 })], 1), null);
});

test('é a sua vez só na partida em andamento e na cor que é sua', () => {
  const m = mesa({ id: 1, estado: 'jogando', brancas: 1, pretas: 2, vez: 'b' });
  assert.equal(ehMinhaVez(m, 2), true);
  assert.equal(ehMinhaVez(m, 1), false);
  assert.equal(ehMinhaVez({ ...m, estado: 'fim' }, 2), false);
});

const pessoa = (id: number, nome: string, status = 'online', extra: Partial<Membro> = {}) =>
  ({ id, nome, status, banido: false, ...extra }) as Membro;

test('no lobby vem primeiro quem está na call, depois quem está online; offline não aparece', () => {
  const membros = [
    pessoa(1, 'TKP'), pessoa(2, 'Rafa'), pessoa(3, 'Bia'), pessoa(4, 'Lucas', 'ausente'),
    pessoa(5, 'Dudu', 'offline'), pessoa(6, 'Caio', 'online', { banido: true }), pessoa(7, 'juninho'),
    // Servidor antigo não diz o status de ninguém: sem saber se a pessoa está aí, não se chama.
    { id: 8, nome: 'Sem status', banido: false } as Membro,
  ];
  const r = quemChamar(membros, { euId: 1, naCall: new Set([2, 7]), jogando: new Set([3]), convidado: 7, recusou: 4 });
  assert.deepEqual(r.naCall.map((c) => [c.membro.nome, c.situacao]), [['juninho', 'chamado'], ['Rafa', 'livre']]);
  assert.deepEqual(r.online.map((c) => [c.membro.nome, c.situacao]), [['Bia', 'jogando'], ['Lucas', 'recusou']]);
});

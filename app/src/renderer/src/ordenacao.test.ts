import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moverSala, type ItemDeSala } from './ordenacao.ts';

const lista = (...pares: [number, number | null][]): ItemDeSala[] =>
  pares.map(([id, categoriaId]) => ({ id, categoriaId }));
const so = (l: ItemDeSala[]) => l.map((s) => `${s.id}${s.categoriaId === null ? '' : `@${s.categoriaId}`}`);

test('desce uma sala dentro do mesmo grupo', () => {
  const l = lista([1, null], [2, null], [3, null]);
  assert.deepEqual(so(moverSala(l, [null], 1, { categoriaId: null, indice: 2 })), ['2', '1', '3']);
});

test('desce para o fim', () => {
  const l = lista([1, null], [2, null], [3, null]);
  assert.deepEqual(so(moverSala(l, [null], 1, { categoriaId: null, indice: 3 })), ['2', '3', '1']);
});

test('sobe uma sala dentro do mesmo grupo', () => {
  const l = lista([1, null], [2, null], [3, null]);
  assert.deepEqual(so(moverSala(l, [null], 3, { categoriaId: null, indice: 0 })), ['3', '1', '2']);
});

test('soltar no mesmo lugar não muda nada', () => {
  const l = lista([1, null], [2, null], [3, null]);
  assert.deepEqual(so(moverSala(l, [null], 2, { categoriaId: null, indice: 1 })), ['1', '2', '3']);
  assert.deepEqual(so(moverSala(l, [null], 2, { categoriaId: null, indice: 2 })), ['1', '2', '3']);
});

test('leva a sala para dentro de uma gaveta', () => {
  const l = lista([1, null], [2, null], [3, 7]);
  assert.deepEqual(so(moverSala(l, [null, 7], 1, { categoriaId: 7, indice: 0 })),
    ['2', '1@7', '3@7']);
});

test('tira a sala da gaveta e devolve para o topo', () => {
  const l = lista([1, null], [2, 7], [3, 7]);
  assert.deepEqual(so(moverSala(l, [null, 7], 3, { categoriaId: null, indice: 1 })),
    ['1', '3', '2@7']);
});

test('gaveta vazia recebe a primeira sala', () => {
  // Ela não aparece na lista de salas justamente por estar vazia; quem a conhece é a
  // ordem dos grupos.
  const l = lista([1, null], [2, null]);
  assert.deepEqual(so(moverSala(l, [null, 9], 2, { categoriaId: 9, indice: 0 })), ['1', '2@9']);
});

test('índice fora da conta não estoura: cai no começo ou no fim', () => {
  const l = lista([1, null], [2, null]);
  assert.deepEqual(so(moverSala(l, [null], 1, { categoriaId: null, indice: 99 })), ['2', '1']);
  assert.deepEqual(so(moverSala(l, [null], 2, { categoriaId: null, indice: -5 })), ['2', '1']);
});

test('arrastar uma sala que não existe devolve a lista intacta', () => {
  const l = lista([1, null], [2, null]);
  assert.deepEqual(so(moverSala(l, [null], 42, { categoriaId: null, indice: 0 })), ['1', '2']);
});

test('a ordem das gavetas manda no resultado final', () => {
  const l = lista([1, 8], [2, 7]);
  assert.deepEqual(so(moverSala(l, [null, 7, 8], 1, { categoriaId: 7, indice: 0 })),
    ['1@7', '2@7']);
});

test('nenhuma sala se perde nem se duplica ao mover', () => {
  const l = lista([1, null], [2, 7], [3, 7], [4, null], [5, 8]);
  for (const alvo of [
    { categoriaId: null, indice: 0 }, { categoriaId: 7, indice: 1 },
    { categoriaId: 8, indice: 0 }, { categoriaId: null, indice: 2 },
  ]) {
    for (const id of [1, 2, 3, 4, 5]) {
      const r = moverSala(l, [null, 7, 8], id, alvo);
      assert.deepEqual([...r.map((s) => s.id)].sort(), [1, 2, 3, 4, 5],
        `mover ${id} para ${JSON.stringify(alvo)} bagunçou a lista`);
    }
  }
});

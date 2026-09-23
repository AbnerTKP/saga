import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maisNova, posicao, pontoDeEntrada } from './tocador.ts';

const item = (uid: string) => ({ uid, id: 'dQw4w9WgXcQ', titulo: 't', autor: 'a', duracao: 213, capa: '', origem: 'youtube' as const, pediu: { id: 1, nome: 'TKP' } });
const estado = (uid: string, comecouEm: number) => ({ tocando: item(uid), fila: [], comecouEm, anfitriao: 'u1' });

test('a busca que saiu antes do "acabou" não traz a música velha de volta', () => {
  const doAcabou = { estado: estado('nova', 5000), agora: 5000, recebidaEm: 1 };
  const buscaAtrasada = { estado: estado('velha', 1000), agora: 4900, recebidaEm: 2 };
  assert.equal(maisNova(doAcabou, buscaAtrasada), doAcabou);
  const buscaSeguinte = { estado: estado('nova', 5000), agora: 9000, recebidaEm: 3 };
  assert.equal(maisNova(doAcabou, buscaSeguinte), buscaSeguinte);
  const filaAcabou = { estado: null, agora: 9500, recebidaEm: 4 };
  assert.equal(maisNova(buscaSeguinte, filaAcabou).estado, null);
});

test('a posição conta com o relógio do servidor, mais o que passou aqui', () => {
  // Começou há 60 s no servidor; a notícia chegou há 2 s aqui. O relógio daqui é outro.
  const n = { estado: estado('a', 100_000), agora: 160_000, recebidaEm: 7_000_000 };
  assert.equal(posicao(n, 7_002_000), 62);
});

test('só pula para o ponto quando vale a pena', () => {
  assert.equal(pontoDeEntrada(1, 213), 0);
  assert.equal(pontoDeEntrada(62, 213), 62);
  assert.equal(pontoDeEntrada(211, 213), 0);
});

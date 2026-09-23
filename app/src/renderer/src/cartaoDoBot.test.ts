import { test } from 'node:test';
import assert from 'node:assert/strict';
import { situacaoDoCartao, duracao, nomeDaMusica } from './cartaoDoBot.ts';

const item = (uid: string) => ({ uid, id: 'dQw4w9WgXcQ', titulo: 't', autor: 'a', duracao: 213, capa: '', origem: 'youtube' as const, pediu: { id: 1, nome: 'TKP' } });
const estado = (tocando: string, fila: string[] = []) => ({ tocando: item(tocando), fila: fila.map(item), comecouEm: 0, anfitriao: 'u1' });

test('o cartão diz o que a música é agora, e só o que toca tem botões', () => {
  assert.deepEqual(situacaoDoCartao(item('a'), { tipo: 'tocando' }, estado('a')), { tipo: 'tocando', botoes: true });
  assert.deepEqual(situacaoDoCartao(item('a'), { tipo: 'tocando' }, estado('b')), { tipo: 'tocou' });
  assert.deepEqual(situacaoDoCartao(item('a'), { tipo: 'tocando' }, null), { tipo: 'tocou' }, 'fila acabou');
});

test('o da fila anda de posição, e vira "tocando" quando chega a vez', () => {
  const nasceu = { tipo: 'na-fila' as const, posicao: 2 };
  assert.deepEqual(situacaoDoCartao(item('c'), nasceu, estado('a', ['b', 'c'])), { tipo: 'na-fila', posicao: 2 });
  assert.deepEqual(situacaoDoCartao(item('c'), nasceu, estado('b', ['c'])), { tipo: 'na-fila', posicao: 1 });
  assert.deepEqual(situacaoDoCartao(item('c'), nasceu, estado('c')), { tipo: 'tocando', botoes: true });
});

test('sem saber a fila, vale o que o cartão disse ao nascer — sem prometer botão', () => {
  assert.deepEqual(situacaoDoCartao(item('a'), { tipo: 'tocando' }, undefined), { tipo: 'tocando', botoes: false });
  assert.deepEqual(situacaoDoCartao(item('a'), { tipo: 'na-fila', posicao: 3 }, undefined), { tipo: 'na-fila', posicao: 3 });
});

test('duração', () => {
  assert.equal(duracao(213), '3:33');
  assert.equal(duracao(59), '0:59');
  assert.equal(duracao(3725), '1:02:05');
});

test('o nome da música não repete o artista que o título já traz', () => {
  assert.equal(nomeDaMusica({ titulo: 'Rick Astley - Never Gonna Give You Up', autor: 'Rick Astley' }), 'Rick Astley - Never Gonna Give You Up');
  assert.equal(nomeDaMusica({ titulo: 'Despacito', autor: 'Luis Fonsi' }), 'Luis Fonsi — Despacito');
  assert.equal(nomeDaMusica({ titulo: 'Sem autor', autor: '' }), 'Sem autor');
});

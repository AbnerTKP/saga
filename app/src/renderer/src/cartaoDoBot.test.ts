import { test } from 'node:test';
import assert from 'node:assert/strict';
import { situacaoDoCartao, situacaoDaPlaylist, avisoDeCorte, quantasMusicas, duracao, nomeDaMusica } from './cartaoDoBot.ts';
import type { ItemDaMusica, PlaylistDoBot, EstadoDaMusica } from './api.ts';

const daLista = (n: number, uid = `u${n}`): ItemDaMusica => ({
  uid, id: 'dQw4w9WgXcQ', titulo: `música ${n}`, autor: 'x', duracao: 100, capa: 'c', origem: 'youtube',
  pediu: { id: 1, nome: 'TKP' }, lote: { id: 'p1', n },
});
const sozinha = (uid: string): ItemDaMusica => ({ ...daLista(0, uid), lote: undefined });
const naFila = (tocando: ItemDaMusica, fila: ItemDaMusica[] = []): EstadoDaMusica => ({ tocando, fila, comecouEm: 0, anfitriao: 'u1' });
const playlist = (extra: Partial<PlaylistDoBot> = {}): PlaylistDoBot => ({
  id: 'p1', nome: 'Rock', quantas: 3, total: 3, maisDe: false, duracao: 300, origem: 'youtube',
  primeira: daLista(1), posicao: 0, sala: { id: 5, nome: 'Jogos' }, pediu: { id: 1, nome: 'TKP' }, ...extra,
});

test('o cartão da playlist mostra a música dela que está tocando agora', () => {
  const s = situacaoDaPlaylist(playlist(), naFila(daLista(2), [daLista(3)]));
  assert.equal(s.tipo, 'tocando');
  assert.equal(s.tipo === 'tocando' && s.n, 2);
  assert.equal(s.tipo === 'tocando' && s.item.titulo, 'música 2');
  assert.equal(s.tipo === 'tocando' && s.botoes, true);
});

test('a playlist esperando a vez diz depois de quantas ela começa', () => {
  assert.deepEqual(situacaoDaPlaylist(playlist(), naFila(sozinha('a'), [sozinha('b'), daLista(1)])), { tipo: 'na-fila', depoisDe: 2, continua: false });
});

test('a playlist com o pedido de um amigo no meio diz que continua', () => {
  assert.deepEqual(situacaoDaPlaylist(playlist(), naFila(sozinha('a'), [daLista(2), daLista(3)])), { tipo: 'na-fila', depoisDe: 1, continua: true });
});

test('acabou, ou tiraram: tocou. Fila que é de outra playlist não conta', () => {
  assert.deepEqual(situacaoDaPlaylist(playlist(), null), { tipo: 'tocou' });
  const outra = { ...daLista(1), lote: { id: 'outra', n: 1 } };
  assert.deepEqual(situacaoDaPlaylist(playlist(), naFila(outra, [{ ...outra, uid: 'o2' }])), { tipo: 'tocou' });
});

test('sem saber da fila, vale o que o cartão disse ao nascer, sem botões', () => {
  const nasceuTocando = situacaoDaPlaylist(playlist(), undefined);
  assert.equal(nasceuTocando.tipo === 'tocando' && nasceuTocando.botoes, false);
  assert.deepEqual(situacaoDaPlaylist(playlist({ posicao: 3 }), undefined), { tipo: 'na-fila', depoisDe: 3, continua: false });
});

test('o aviso de corte só aparece quando não coube tudo', () => {
  assert.equal(avisoDeCorte({ quantas: 3, total: 3, maisDe: false }), null);
  assert.equal(avisoDeCorte({ quantas: 50, total: 125, maisDe: false }), 'só couberam 50 de 125');
  assert.equal(avisoDeCorte({ quantas: 50, total: 100, maisDe: true }), 'só couberam 50 de 100 ou mais');
  assert.equal(quantasMusicas(1), '1 música');
  assert.equal(quantasMusicas(50), '50 músicas');
});

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

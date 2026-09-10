import { test } from 'node:test';
import assert from 'node:assert/strict';
import { livesNasSalas } from './lives.ts';
import type { RoomInfo, RoomParticipant } from './api.ts';

const pessoa = (identity: string, extra: Partial<RoomParticipant> = {}): RoomParticipant => ({
  identity, name: identity.toUpperCase(), camera: false, screen: false, muted: false, ...extra,
});

const sala = (id: number, name: string, tipo: 'voz' | 'texto', participants: RoomParticipant[]): RoomInfo =>
  ({ id, name, tipo, participants, naoLidas: 0, categoriaId: null });

test('sem ninguém transmitindo, não há linha nenhuma', () => {
  const rooms = [sala(1, 'Geral', 'voz', [pessoa('u1'), pessoa('u2')])];
  assert.deepEqual(livesNasSalas(rooms, 'u1'), []);
});

test('quem está com a tela no ar aparece, com a sala em que está', () => {
  const rooms = [sala(1, 'Sala Principal', 'voz', [pessoa('u1'), pessoa('u2', { screen: true })])];
  const lives = livesNasSalas(rooms, 'u1');
  assert.equal(lives.length, 1);
  assert.deepEqual(
    { identity: lives[0].identity, salaNome: lives[0].salaNome, souEu: lives[0].souEu },
    { identity: 'u2', salaNome: 'Sala Principal', souEu: false },
  );
});

test('a própria transmissão vem marcada: ali não se oferece "assistir"', () => {
  const rooms = [sala(1, 'Geral', 'voz', [pessoa('u1', { screen: true })])];
  assert.equal(livesNasSalas(rooms, 'u1')[0].souEu, true);
});

test('a plateia sai do que cada app anuncia, e quem se olha não conta', () => {
  // Dá para pôr a própria live no palco — é a prévia do que você manda —, e contar isso
  // diria "1 assistindo" para quem está sozinho.
  const rooms = [sala(1, 'Geral', 'voz', [
    pessoa('u1', { screen: true, assistindo: 'u1' }),
    pessoa('u2', { assistindo: 'u1' }),
    pessoa('u3', { assistindo: 'u1' }),
    pessoa('u4', { assistindo: null }),
  ])];
  assert.deepEqual(livesNasSalas(rooms, 'u9')[0].espectadores, ['U2', 'U3']);
});

test('sala de texto não tem transmissão, mesmo que venha gente na lista', () => {
  const rooms = [sala(1, 'chat', 'texto', [pessoa('u2', { screen: true })])];
  assert.deepEqual(livesNasSalas(rooms, 'u1'), []);
});

test('duas salas de voz, duas linhas — quem transmite fica sempre à vista', () => {
  const rooms = [
    sala(1, 'Geral', 'voz', [pessoa('u2', { screen: true })]),
    sala(2, 'Bancada', 'voz', [pessoa('u3', { screen: true })]),
  ];
  assert.deepEqual(livesNasSalas(rooms, 'u1').map((l) => l.salaNome), ['Geral', 'Bancada']);
});

test('app antigo não anuncia nada, e isso vira plateia vazia em vez de erro', () => {
  const rooms = [sala(1, 'Geral', 'voz', [pessoa('u2', { screen: true }), pessoa('u3')])];
  assert.deepEqual(livesNasSalas(rooms, 'u1')[0].espectadores, []);
});

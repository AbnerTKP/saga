import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco, garantirServidor } from './banco.mjs';
import { criarConta } from './contas.mjs';
import { statusDeVerdade, bater, saiu, SILENCIO_ATE_OFFLINE } from './presenca.mjs';

const cenario = () => {
  const db = abrirBanco(':memory:');
  garantirServidor(db, { nome: 'Casa', salas: ['Geral'] });
  const u = criarConta(db, { apelido: 'abner', senha: 'segredo123', senhaRepetida: 'segredo123' });
  return { db, u };
};

test('sem sinal nenhum, a pessoa está offline', () => {
  assert.equal(statusDeVerdade('online', null), 'offline');
  assert.equal(statusDeVerdade('ocupado', undefined), 'offline');
});

test('sinal velho é lembrança, não presença', () => {
  const agora = 1_000_000;
  assert.equal(statusDeVerdade('ocupado', agora - SILENCIO_ATE_OFFLINE - 1, agora), 'offline');
  assert.equal(statusDeVerdade('ocupado', agora - SILENCIO_ATE_OFFLINE + 1, agora), 'ocupado');
});

test('status estragado no banco não vira status inventado', () => {
  const agora = 1_000_000;
  assert.equal(statusDeVerdade('dançando', agora, agora), 'online');
  assert.equal(statusDeVerdade(null, agora, agora), 'online');
});

test('bater sem status só renova o sinal, sem mexer no que a pessoa escolheu', () => {
  const { db, u } = cenario();
  bater(db, u.id, 'ocupado');
  assert.equal(bater(db, u.id), 'ocupado', 'o batimento não podia derrubar o "ocupado"');
});

test('status desconhecido é recusado', () => {
  const { db, u } = cenario();
  assert.throws(() => bater(db, u.id, 'dançando'), /desconhecido/);
});

test('sair apaga o sinal: fechar o app não deixa ninguém online', () => {
  const { db, u } = cenario();
  bater(db, u.id, 'online');
  saiu(db, u.id);
  const row = db.prepare('SELECT status, visto_em FROM usuarios WHERE id = ?').get(u.id);
  assert.equal(row.visto_em, null);
  assert.equal(statusDeVerdade(row.status, row.visto_em), 'offline');
});

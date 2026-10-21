import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco, garantirServidor } from './banco.mjs';
import { criarConta } from './contas.mjs';
import {
  statusDeVerdade, bater, saiu, SILENCIO_ATE_OFFLINE, lerAtividade, anotarAtividade, atividadeDe,
} from './presenca.mjs';

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

// --- a atividade -------------------------------------------------------------

const VALHEIM = { nome: 'Valheim', desde: 1_000_000, steam: 892970, icone: '2f64c9a826e2c6cf3253fea4834c2e612db09143' };

test('a atividade do Steam chega inteira', () => {
  assert.deepEqual(lerAtividade(VALHEIM, 2_000_000), VALHEIM);
});

test('nada aberto é null, e o que não dá para mostrar é recusado', () => {
  assert.equal(lerAtividade(null), null);
  for (const ruim of ['Valheim', 5, [], { nome: '' }, { nome: '   ' }, { steam: 1 }]) {
    assert.throws(() => lerAtividade(ruim), /Atividade|nome/, JSON.stringify(ruim));
  }
});

test('o endereço da imagem não sai do que o app mandou: número e hash conferidos à risca', () => {
  // O app de quem olha monta a URL do Steam com estes dois. Texto livre aqui faria todo mundo
  // buscar o que quem mandou quisesse.
  const agora = 2_000_000;
  const a = lerAtividade({ ...VALHEIM, steam: '892970' }, agora);
  assert.equal(a.steam, null, 'número em texto não vale');
  assert.equal(a.icone, null, 'sem jogo do Steam, sem ícone');
  assert.equal(lerAtividade({ ...VALHEIM, icone: 'https://x/y.jpg' }, agora).icone, null);
  assert.equal(lerAtividade({ ...VALHEIM, icone: VALHEIM.icone.toUpperCase() }, agora).icone, null);
  assert.equal(lerAtividade({ ...VALHEIM, steam: 1.5 }, agora).steam, null);
  assert.equal(lerAtividade({ ...VALHEIM, steam: -3 }, agora).steam, null);
});

test('o nome vem limpo e com teto, sem cortar emoji ao meio', () => {
  assert.equal(lerAtividade({ nome: '  Grand\tTheft\n  Auto ' }).nome, 'Grand Theft Auto');
  const longo = '🐉'.repeat(100);
  const nome = lerAtividade({ nome: longo }).nome;
  assert.equal(Array.from(nome).length, 80);
  assert.ok(nome.endsWith('🐉'), 'cortou no meio de um emoji');
});

test('"desde" no futuro é agora, e de mais de uma semana atrás fica em uma semana', () => {
  const agora = 10_000_000_000;
  assert.equal(lerAtividade({ nome: 'X', desde: agora + 5000 }, agora).desde, agora);
  assert.equal(lerAtividade({ nome: 'X', desde: 0 }, agora).desde, agora - 7 * 24 * 60 * 60_000);
  assert.equal(lerAtividade({ nome: 'X', desde: 'ontem' }, agora).desde, agora);
});

test('atividade vale enquanto o app renova, e some com o silêncio ou com a pessoa offline', () => {
  const agora = 5_000_000;
  anotarAtividade(901, VALHEIM, agora);
  assert.deepEqual(atividadeDe(901, agora, agora), VALHEIM);
  assert.equal(atividadeDe(901, agora, agora + SILENCIO_ATE_OFFLINE + 1), null, 'o app parou de contar');
  assert.equal(atividadeDe(901, agora - SILENCIO_ATE_OFFLINE - 1, agora), null, 'offline não joga para ninguém');
  anotarAtividade(901, null, agora);
  assert.equal(atividadeDe(901, agora, agora), null);
  assert.equal(atividadeDe(902, agora, agora), null, 'quem nunca contou nada');
});

test('o sinal sem atividade não apaga a que o computador contou', () => {
  // A Saga do navegador da mesma pessoa bate sem saber de jogo nenhum.
  const { db, u } = cenario();
  bater(db, u.id, 'online', VALHEIM);
  bater(db, u.id);
  const { visto_em } = db.prepare('SELECT visto_em FROM usuarios WHERE id = ?').get(u.id);
  assert.equal(atividadeDe(u.id, visto_em)?.nome, 'Valheim');
  bater(db, u.id, undefined, null);
  assert.equal(atividadeDe(u.id, visto_em), null, 'null apaga');
});

test('atividade recusada não renova o sinal pela metade', () => {
  const { db, u } = cenario();
  assert.throws(() => bater(db, u.id, 'online', { nome: '' }));
  const { visto_em } = db.prepare('SELECT visto_em FROM usuarios WHERE id = ?').get(u.id);
  assert.equal(visto_em, null);
});

test('sair apaga a atividade junto com o sinal', () => {
  const { db, u } = cenario();
  bater(db, u.id, 'online', VALHEIM);
  saiu(db, u.id);
  assert.equal(atividadeDe(u.id, Date.now()), null);
});

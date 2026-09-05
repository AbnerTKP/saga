import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { abrirBanco, garantirServidor, MIGRACOES } from './banco.mjs';

// As migrações são registradas pela POSIÇÃO na lista. Se alguém inserir uma no meio,
// a produção passa a considerar aplicada uma migração que nunca rodou, e a seguinte
// quebra contra um banco pela metade. Já aconteceu, ao acrescentar a tabela de sons.
//
// Estas impressões digitais travam a ordem: só acrescentar no fim passa. Ao criar uma
// migração nova, some a linha dela aqui embaixo — e só isso.
const IMPRESSOES = [
  '126b42e2e45f',  // 0  usuarios
  'a6c1b7bcd4c5',  // 1  índice de email
  'd43c7810259e',  // 2  sessoes
  'fcb5b554a160',  // 3  índice de sessoes
  '9e76db943e5d',  // 4  servidores
  'd85d3c798a4a',  // 5  membros
  '78e4601defeb',  // 6  salas
  'a2cbe6c4eacf',  // 7  sons
  '8b0535660d75',  // 8  índice de sons
  '89541d4a2506',  // 9  coluna turbo
  'dc92e35733c9',  // 10 coluna id_exibido
  '828329d3702c',  // 11 coluna tipo em salas
  '86a198ad22f7',  // 12 mensagens
  'b8d9e085c8e1',  // 13 índice de mensagens
];

const digital = (sql) => createHash('sha256').update(sql).digest('hex').slice(0, 12);

test('nenhuma migração já publicada foi editada ou reordenada', () => {
  MIGRACOES.slice(0, IMPRESSOES.length).forEach((sql, i) => {
    assert.equal(digital(sql), IMPRESSOES[i],
      `a migração ${i} mudou. Migração publicada não se edita nem se move: acrescente no fim.`);
  });
});

test('toda migração nova precisa ser registrada aqui', () => {
  assert.equal(MIGRACOES.length, IMPRESSOES.length,
    'acrescente a impressão digital da migração nova em IMPRESSOES');
});

test('o banco sobe com todas as tabelas', () => {
  const db = abrirBanco(':memory:');
  const tabelas = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
  assert.deepEqual(tabelas, ['membros', 'mensagens', 'migracoes', 'salas', 'servidores', 'sessoes', 'sons', 'usuarios']);
});

test('as colunas acrescentadas depois existem e têm padrão seguro', () => {
  const db = abrirBanco(':memory:');
  const colunas = db.prepare('PRAGMA table_info(membros)').all();
  const turbo = colunas.find((c) => c.name === 'turbo');
  assert.ok(turbo, 'a coluna turbo sumiu');
  assert.equal(turbo.dflt_value, '0', 'ninguém pode nascer Turbo por omissão');
  assert.ok(colunas.find((c) => c.name === 'id_exibido'), 'a coluna id_exibido sumiu');
});

test('abrir de novo não repete migração', () => {
  const db = abrirBanco(':memory:');
  assert.equal(db.prepare('SELECT count(*) c FROM migracoes').get().c, MIGRACOES.length);
});

test('garantirServidor é idempotente e não desfaz o que o dono ajustou', () => {
  const db = abrirBanco(':memory:');
  const a = garantirServidor(db, { nome: 'Cantinho', salas: ['Geral', 'Jogos'] });
  db.prepare('UPDATE servidores SET nome = ? WHERE id = ?').run('Renomeado pelo dono', a.id);
  const b = garantirServidor(db, { nome: 'Cantinho', salas: ['Geral'] });
  assert.equal(b.id, a.id);
  assert.equal(b.nome, 'Renomeado pelo dono', 'o nome escolhido pelo dono foi sobrescrito');
  assert.equal(db.prepare('SELECT count(*) c FROM salas').get().c, 2, 'uma sala foi apagada');
});

test('sala apagada pelo dono não ressuscita no reinício', () => {
  // O .env semeia só o primeiro arranque. Semear sempre faria a sala voltar sozinha, e
  // ninguém ligaria isso ao reinício, que acontece longe do clique que a apagou.
  const db = abrirBanco(':memory:');
  const s = garantirServidor(db, { nome: 'Cantinho', salas: ['Geral', 'Jogos', 'Filmes'] });
  db.prepare("DELETE FROM salas WHERE nome = 'Filmes'").run();

  garantirServidor(db, { nome: 'Cantinho', salas: ['Geral', 'Jogos', 'Filmes'] });
  const nomes = db.prepare('SELECT nome FROM salas WHERE servidor_id = ? ORDER BY ordem').all(s.id).map((r) => r.nome);
  assert.deepEqual(nomes, ['Geral', 'Jogos'], 'a sala apagada voltou');
});

test('sala criada antes do tipo continua sendo de voz', () => {
  // A migração acrescentou a coluna com padrão 'voz': o que já existia não podia virar
  // sala de texto de repente.
  const db = abrirBanco(':memory:');
  const s = garantirServidor(db, { nome: 'Cantinho', salas: ['Geral'] });
  assert.equal(db.prepare('SELECT tipo FROM salas WHERE servidor_id = ?').get(s.id).tipo, 'voz');
});

test('apagar a sala leva as mensagens junto', () => {
  const db = abrirBanco(':memory:');
  const s = garantirServidor(db, { nome: 'Cantinho', salas: ['Geral'] });
  const sala = db.prepare('SELECT id FROM salas LIMIT 1').get();
  db.prepare('INSERT INTO mensagens (sala_id, texto, criado_em) VALUES (?, ?, ?)').run(sala.id, 'oi', Date.now());
  db.prepare('DELETE FROM salas WHERE id = ?').run(sala.id);
  assert.equal(db.prepare('SELECT count(*) c FROM mensagens').get().c, 0, 'mensagem órfã ficou para trás');
  void s;
});

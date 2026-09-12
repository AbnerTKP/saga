import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { abrirBanco, garantirServidor, garantirCargos, MIGRACOES } from './banco.mjs';

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
  '665cf2b3ada3',  // 14 cargos
  'b82ab7deb06c',  // 15 índice de cargos
  'c7478768ae58',  // 16 coluna cargo_id em membros
  'def5e5aab371',  // 17 convites
  '393600a0c9a2',  // 18 índice de convites
  '7e000e21d81b',  // 19 coluna criado_por em servidores
  'e47efb98833d',  // 20 coluna imagem em mensagens
  'bf5bffec61bd',  // 21 coluna enquadramento em usuarios
  '90125bd0e30a',  // 22 coluna turbo em usuarios (o Berserk virou da conta)
  'a9415f3e8440',  // 23 quem já era Berserk num servidor passa a ser na conta
  '0fced285c329',  // 24 categorias
  '51329ea7751a',  // 25 índice de categorias
  '75910a23ea2f',  // 26 coluna categoria_id em salas
  'dbaf4d092025',  // 27 coluna dono em usuarios (dono da Saga, não do servidor)
  '4debb0eb4e71',  // 28 coluna status em usuarios
  'df3844962f6e',  // 29 coluna visto_em em usuarios
  '82e31b667a97',  // 30 quem estava no cargo de dono é quem criou o servidor
  '97d33f11bb13',  // 31 e passa para o cargo mais alto que sobra
  '23b2a587c3d1',  // 32 o cargo de dono chumbado some
  '9b6bdf868462',  // 33 coluna papel em salas (a sala de notas)
  'a6bfb898802f',  // 34 coluna arquivo em mensagens
  '5efe47c844b8',  // 35 coluna arquivo_nome em mensagens
  '4d5b7607bb97',  // 36 coluna arquivo_bytes em mensagens
  'f9821b9fa74e',  // 37 coluna privada em salas
  '40758e8a6181',  // 38 sala_cargos: quem vê uma sala privada
  '9661609923c8',  // 39 índice de sala_cargos
  '63a23738c8ea',  // 40 coluna apagada_em em mensagens
  '736605861bd8',  // 41 coluna apagada_por em mensagens
  '8b80fe8fe26d',  // 42 índice das mensagens apagadas
  'a481cf46ecbf',  // 43 todo cargo que já existia passa a poder convidar
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
  assert.deepEqual(tabelas, ['cargos', 'categorias', 'convites', 'membros', 'mensagens', 'migracoes', 'sala_cargos', 'salas', 'servidores', 'sessoes', 'sons', 'usuarios']);
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

test('o servidor nasce com dois cargos, e nenhum deles é imposto como dono', () => {
  const db = abrirBanco(':memory:');
  const s = garantirServidor(db, { nome: 'Cantinho', salas: ['Geral'] });
  const cargos = db.prepare('SELECT nome, nivel, dono FROM cargos WHERE servidor_id = ? ORDER BY nivel DESC').all(s.id);
  assert.deepEqual(cargos.map((c) => c.nome), ['Moderador', 'Membro']);
  // Nenhum é imposto como dono: mandar vem de ter criado o servidor, não de um cargo.
  assert.equal(cargos.filter((c) => c.dono).length, 0);
});

test('rodar de novo não duplica cargos nem desfaz o que o dono mudou', () => {
  const db = abrirBanco(':memory:');
  const s = garantirServidor(db, { nome: 'Cantinho', salas: ['Geral'] });
  db.prepare("UPDATE cargos SET nome = 'Xerife' WHERE servidor_id = ? AND nivel = 50").run(s.id);

  garantirServidor(db, { nome: 'Cantinho', salas: ['Geral'] });
  const cargos = db.prepare('SELECT nome FROM cargos WHERE servidor_id = ? ORDER BY nivel DESC').all(s.id);
  assert.deepEqual(cargos.map((c) => c.nome), ['Xerife', 'Membro']);
});

test('quem já era membro é ligado ao cargo certo pelo nível antigo', () => {
  // A conversão casa cada um com o cargo mais alto que não passe do nível antigo. Sem o
  // cargo de 100, quem estava lá cai no mais alto que sobrou — e continua mandando, que
  // agora é coisa de `criado_por` e não do cargo.
  const db = abrirBanco(':memory:');
  const s = garantirServidor(db, { nome: 'Cantinho', salas: ['Geral'] });
  db.prepare('INSERT INTO usuarios (apelido, apelido_chave, senha_hash, criado_em) VALUES (?,?,?,?)').run('a', 'a', 'x', 1);
  db.prepare('INSERT INTO usuarios (apelido, apelido_chave, senha_hash, criado_em) VALUES (?,?,?,?)').run('b', 'b', 'x', 1);
  db.prepare('INSERT INTO membros (servidor_id, usuario_id, cargo, entrou_em) VALUES (?,?,?,?)').run(s.id, 1, 100, 1);
  db.prepare('INSERT INTO membros (servidor_id, usuario_id, cargo, entrou_em) VALUES (?,?,?,?)').run(s.id, 2, 50, 1);

  garantirCargos(db, s.id);
  const quem = db.prepare(`
    SELECT u.apelido, c.nome FROM membros m
      JOIN usuarios u ON u.id = m.usuario_id
      JOIN cargos c   ON c.id = m.cargo_id
     WHERE m.servidor_id = ? ORDER BY u.apelido`).all(s.id)
    // O SQLite devolve objetos sem protótipo; a comparação estrita repara nisso.
    .map((r) => ({ ...r }));
  assert.deepEqual(quem, [{ apelido: 'a', nome: 'Moderador' }, { apelido: 'b', nome: 'Moderador' }]);
});

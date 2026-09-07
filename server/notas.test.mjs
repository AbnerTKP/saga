import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco, garantirServidor } from './banco.mjs';
import {
  garantirSalaDeNotas, salaDeNotas, mudancasDoCorpo, versoesQueFaltam,
  jaPublicadas, textoDaVersao, publicarNotas, NOME_DA_SALA,
} from './notas.mjs';

const cenario = () => {
  const db = abrirBanco(':memory:');
  const s = garantirServidor(db, { nome: 'CARDUME', salas: ['Geral', 'Jogos'] });
  return { db, sid: s.id };
};

const CORPO = `<!-- mudancas -->
- Primeira coisa
- Segunda coisa
<!-- /mudancas -->

---

**Windows:** baixe o .exe.`;

test('as mudanças saem do trecho entre as marcas, e a instalação fica de fora', () => {
  assert.deepEqual(mudancasDoCorpo(CORPO), ['Primeira coisa', 'Segunda coisa']);
  assert.deepEqual(mudancasDoCorpo('só a instalação, sem marca nenhuma'), []);
  assert.deepEqual(mudancasDoCorpo(null), []);
});

test('a sala nasce de texto, no topo, e nascer duas vezes não cria duas', () => {
  const { db, sid } = cenario();
  const a = garantirSalaDeNotas(db, sid);
  const b = garantirSalaDeNotas(db, sid);
  assert.equal(a.id, b.id);
  assert.equal(a.tipo, 'texto');
  assert.equal(a.nome, NOME_DA_SALA);
  assert.ok(a.ordem < 0, 'devia nascer antes de qualquer sala do pessoal');
  assert.equal(db.prepare('SELECT count(*) c FROM salas WHERE papel = ?').get('notas').c, 1);
});

test('uma sala com o mesmo nome, feita à mão, é adotada em vez de duplicar', () => {
  // Sem isto, o UNIQUE(servidor_id, nome) derrubaria o arranque.
  const { db, sid } = cenario();
  db.prepare('INSERT INTO salas (servidor_id, nome, tipo, ordem) VALUES (?,?,?,?)')
    .run(sid, NOME_DA_SALA, 'voz', 9);
  const sala = garantirSalaDeNotas(db, sid);
  assert.equal(sala.tipo, 'texto', 'devia ter virado sala de texto');
  assert.equal(db.prepare('SELECT count(*) c FROM salas WHERE nome = ?').get(NOME_DA_SALA).c, 1);
});

test('só entram as versões que faltam, da mais velha para a mais nova', () => {
  const rels = [
    { tag_name: 'v0.3.0', published_at: '2026-03-03T15:00:00Z', body: CORPO },
    { tag_name: 'v0.2.0', published_at: '2026-02-02T15:00:00Z', body: CORPO },
    { tag_name: 'v0.1.0', published_at: '2026-01-01T15:00:00Z', body: CORPO },
  ];
  const faltam = versoesQueFaltam(rels, new Set(['v0.2.0']));
  assert.deepEqual(faltam.map((v) => v.tag), ['v0.1.0', 'v0.3.0']);
});

test('rascunho, prévia e versão sem notas ficam de fora', () => {
  const rels = [
    { tag_name: 'v9.0.0', published_at: '2026-01-01T15:00:00Z', body: CORPO, draft: true },
    { tag_name: 'v9.1.0', published_at: '2026-01-01T15:00:00Z', body: CORPO, prerelease: true },
    { tag_name: 'v9.2.0', published_at: '2026-01-01T15:00:00Z', body: 'sem marca' },
  ];
  assert.deepEqual(versoesQueFaltam(rels, new Set()), []);
});

test('publicar duas vezes não repete mensagem', async () => {
  const { db, sid } = cenario();
  const rels = [
    { tag_name: 'v0.2.0', published_at: '2026-02-02T15:00:00Z', body: CORPO },
    { tag_name: 'v0.1.0', published_at: '2026-01-01T15:00:00Z', body: CORPO },
  ];
  const buscar = async () => ({ ok: true, json: async () => rels });

  assert.equal(await publicarNotas(db, sid, { buscar }), 2);
  assert.equal(await publicarNotas(db, sid, { buscar }), 0, 'republicou o que já estava lá');

  const sala = salaDeNotas(db, sid);
  const msgs = db.prepare('SELECT texto, usuario_id FROM mensagens WHERE sala_id = ? ORDER BY id').all(sala.id);
  assert.equal(msgs.length, 2);
  assert.match(msgs[0].texto, /^v0\.1\.0 — 1 de jan\. de 2026/, 'a mais velha vem primeiro');
  assert.match(msgs[1].texto, /^v0\.2\.0/);
  assert.equal(msgs[0].usuario_id, null, 'não foi ninguém que escreveu, foi a Saga');
  assert.match(msgs[0].texto, /• Primeira coisa/);
});

test('a etiqueta é lida de volta do texto, que é como se sabe o que já foi', () => {
  const { db, sid } = cenario();
  const sala = garantirSalaDeNotas(db, sid);
  db.prepare('INSERT INTO mensagens (sala_id, usuario_id, texto, criado_em) VALUES (?,NULL,?,?)')
    .run(sala.id, textoDaVersao({ tag: 'v1.2.3', quando: '1 de jan. de 2026', mudancas: ['x'] }), 1);
  db.prepare('INSERT INTO mensagens (sala_id, usuario_id, texto, criado_em) VALUES (?,NULL,?,?)')
    .run(sala.id, 'conversa solta de alguém', 2);
  assert.deepEqual([...jaPublicadas(db, sala.id)], ['v1.2.3']);
});

test('a data é a de São Paulo, não a da máquina que roda o servidor', () => {
  // O contêiner roda em UTC e o pessoal está no Brasil. Uma versão publicada às 21h
  // daqui é meia-noite lá: sem prender o fuso, ela apareceria com a data do dia
  // seguinte para quem lê — e o texto mudaria conforme onde o processo estivesse.
  const rels = [{ tag_name: 'v1.0.0', published_at: '2026-01-01T00:00:00Z', body: CORPO }];
  const [v] = versoesQueFaltam(rels, new Set());
  assert.equal(v.quando, '31 de dez. de 2025');
});

test('a hora da mensagem é a do lançamento, não a da cópia', () => {
  // As 53 versões antigas foram copiadas de uma vez. Com `Date.now()` elas apareceriam
  // todas como sendo de hoje, e o chat perderia justamente o que ele conta: a história.
  const rels = [{ tag_name: 'v1.0.0', published_at: '2026-01-01T15:00:00Z', body: CORPO }];
  const [v] = versoesQueFaltam(rels, new Set());
  assert.equal(v.em, Date.parse('2026-01-01T15:00:00Z'));
});

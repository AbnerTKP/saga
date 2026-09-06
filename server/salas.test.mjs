import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco, garantirServidor } from './banco.mjs';
import { criarConta } from './contas.mjs';
import { garantirMembro, buscarMembro, definirCargo } from './membros.mjs';
import { listarCargos } from './cargos.mjs';
import { listarSalas, criarSala, renomearSala, apagarSala, reordenarSalas } from './salas.mjs';
import { listarMensagens, enviarMensagem, contarNaoLidas, lerMarcadores, QUANTAS } from './mensagens.mjs';

function cenario() {
  const db = abrirBanco(':memory:');
  const servidor = garantirServidor(db, { nome: 'Cantinho', salas: ['Geral', 'Jogos'] });
  const cria = (apelido) => {
    const u = criarConta(db, { apelido, senha: 'segredo123', senhaRepetida: 'segredo123' });
    garantirMembro(db, servidor.id, u);
    return buscarMembro(db, servidor.id, u.id);
  };
  const cargos = Object.fromEntries(listarCargos(db, servidor.id).map((c) => [c.nome, c]));
  return { db, sid: servidor.id, cria, cargos };
}

// --- salas -------------------------------------------------------------------

test('as salas semeadas nascem de voz', () => {
  const { db, sid } = cenario();
  assert.deepEqual(listarSalas(db, sid).map((s) => s.tipo), ['voz', 'voz']);
});

test('o dono cria sala de voz e de texto', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner');
  assert.equal(criarSala(db, sid, dono, { nome: 'Avisos', tipo: 'texto' }).tipo, 'texto');
  assert.equal(criarSala(db, sid, dono, { nome: 'Estudo', tipo: 'voz' }).tipo, 'voz');
  assert.equal(listarSalas(db, sid).length, 4);
});

test('sala nova entra no fim da lista', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner');
  criarSala(db, sid, dono, { nome: 'Avisos', tipo: 'texto' });
  assert.equal(listarSalas(db, sid).at(-1).nome, 'Avisos');
});

test('membro e moderador não mexem em salas', () => {
  const { db, sid, cria, cargos } = cenario();
  const dono = cria('abner'), bruno = cria('bruno');
  definirCargo(db, sid, dono.id, bruno.id, cargos.Moderador.id);
  const mod = buscarMembro(db, sid, bruno.id);
  const caio = cria('caio');
  for (const quem of [mod, caio]) {
    assert.throws(() => criarSala(db, sid, quem, { nome: 'X', tipo: 'voz' }), /permite/);
    assert.throws(() => apagarSala(db, sid, quem, listarSalas(db, sid)[0].id), /permite/);
  }
});

test('tipo inválido é recusado', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner');
  assert.throws(() => criarSala(db, sid, dono, { nome: 'X', tipo: 'video' }), /voz ou de texto/);
});

test('nome repetido é recusado, mesmo trocando maiúsculas', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner');
  assert.throws(() => criarSala(db, sid, dono, { nome: 'geral', tipo: 'voz' }), /Já existe/);
});

test('nome vazio, com quebra de linha ou longo demais é recusado', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner');
  for (const ruim of ['', '   ', 'a\nb', 'x'.repeat(33)]) {
    assert.throws(() => criarSala(db, sid, dono, { nome: ruim, tipo: 'voz' }), /nome da sala/, JSON.stringify(ruim));
  }
});

test('renomear aceita o próprio nome de volta', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner');
  const sala = listarSalas(db, sid)[0];
  assert.equal(renomearSala(db, sid, dono, sala.id, 'Geral').nome, 'Geral');
  assert.equal(renomearSala(db, sid, dono, sala.id, 'Bate-papo').nome, 'Bate-papo');
});

test('não dá para apagar a última sala', () => {
  // Sem sala nenhuma não haveria para onde entrar, e o dono ficaria numa tela vazia
  // sem ligar isso ao que acabou de clicar.
  const { db, sid, cria } = cenario();
  const dono = cria('abner');
  const salas = listarSalas(db, sid);
  apagarSala(db, sid, dono, salas[0].id);
  assert.throws(() => apagarSala(db, sid, dono, salas[1].id), /única sala/);
});

test('reordenar exige citar todas as salas', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner');
  const ids = listarSalas(db, sid).map((s) => s.id);
  assert.throws(() => reordenarSalas(db, sid, dono, [ids[0]]), /todas as salas/);
  assert.throws(() => reordenarSalas(db, sid, dono, [ids[0], ids[0]]), /todas as salas/);
  assert.deepEqual(reordenarSalas(db, sid, dono, [ids[1], ids[0]]).map((s) => s.id), [ids[1], ids[0]]);
});

// --- mensagens ---------------------------------------------------------------

test('a mensagem sobrevive a todo mundo sair', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner');
  const sala = criarSala(db, sid, dono, { nome: 'Avisos', tipo: 'texto' });
  enviarMensagem(db, sid, dono, sala.id, 'olha esse link');

  // "Todo mundo saiu" não é evento nenhum para o banco: a mensagem continua lá.
  const msgs = listarMensagens(db, sid, sala.id);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].texto, 'olha esse link');
  assert.equal(msgs[0].nome, 'abner');
});

test('mensagem vazia ou longa demais é recusada', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner');
  const sala = listarSalas(db, sid)[0];
  assert.throws(() => enviarMensagem(db, sid, dono, sala.id, '   '), /vazia/);
  assert.throws(() => enviarMensagem(db, sid, dono, sala.id, 'x'.repeat(2001)), /passa de/);
});

test('as mensagens saem da mais antiga para a mais nova', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner');
  const sala = listarSalas(db, sid)[0];
  for (const t of ['um', 'dois', 'três']) enviarMensagem(db, sid, dono, sala.id, t);
  assert.deepEqual(listarMensagens(db, sid, sala.id).map((m) => m.texto), ['um', 'dois', 'três']);
});

test('só as últimas são carregadas, mas as mais recentes', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner');
  const sala = listarSalas(db, sid)[0];
  for (let i = 1; i <= QUANTAS + 20; i++) enviarMensagem(db, sid, dono, sala.id, `n${i}`);

  const msgs = listarMensagens(db, sid, sala.id);
  assert.equal(msgs.length, QUANTAS);
  assert.equal(msgs.at(-1).texto, `n${QUANTAS + 20}`, 'faltou a mais recente');
});

test('"depoisDe" traz só o que chegou desde a última olhada', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner');
  const sala = listarSalas(db, sid)[0];
  const primeira = enviarMensagem(db, sid, dono, sala.id, 'oi');
  enviarMensagem(db, sid, dono, sala.id, 'tudo bem?');

  const novas = listarMensagens(db, sid, sala.id, { depoisDe: primeira.id });
  assert.deepEqual(novas.map((m) => m.texto), ['tudo bem?']);
});

test('mensagem em sala que não existe dá erro claro', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner');
  assert.throws(() => enviarMensagem(db, sid, dono, 9999, 'oi'), /não existe/);
  assert.throws(() => listarMensagens(db, sid, 9999), /não existe/);
});

test('a mensagem carrega quem escreveu, para a tela não precisar buscar', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner');
  const sala = listarSalas(db, sid)[0];
  const m = enviarMensagem(db, sid, dono, sala.id, 'oi');
  assert.deepEqual(
    { nome: m.nome, autorId: m.autorId, turbo: m.turbo },
    { nome: 'abner', autorId: dono.id, turbo: false },
  );
});

test('mensagem só de imagem vale — é o caso do GIF', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('TKP');
  const sala = criarSala(db, sid, dono, { nome: 'papo', tipo: 'texto' });

  const m = enviarMensagem(db, sid, dono, sala.id, '', 'abc123.gif');
  assert.equal(m.texto, '');
  assert.equal(m.imagem, 'abc123.gif');
  assert.equal(listarMensagens(db, sid, sala.id)[0].imagem, 'abc123.gif');
});

test('sem texto e sem imagem continua sendo mensagem vazia', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('TKP');
  const sala = criarSala(db, sid, dono, { nome: 'papo', tipo: 'texto' });
  assert.throws(() => enviarMensagem(db, sid, dono, sala.id, '   ', null), /vazia/);
});

test('mensagem de texto não ganha imagem por acidente', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('TKP');
  const sala = criarSala(db, sid, dono, { nome: 'papo', tipo: 'texto' });
  assert.equal(enviarMensagem(db, sid, dono, sala.id, 'oi').imagem, null);
});

test('não lidas conta o que chegou depois do marcador', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('TKP');
  const outro = cria('Amigo');
  const sala = criarSala(db, sid, dono, { nome: 'papo', tipo: 'texto' });

  const primeira = enviarMensagem(db, sid, outro, sala.id, 'oi');
  enviarMensagem(db, sid, outro, sala.id, 'tudo bem?');

  assert.equal(contarNaoLidas(db, sala.id, 0, dono.id), 2);
  assert.equal(contarNaoLidas(db, sala.id, primeira.id, dono.id), 1);
  assert.equal(contarNaoLidas(db, sala.id, 999, dono.id), 0);
});

test('o que eu mesmo escrevi não me aparece como não lido', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('TKP');
  const sala = criarSala(db, sid, dono, { nome: 'papo', tipo: 'texto' });
  enviarMensagem(db, sid, dono, sala.id, 'falando sozinho');
  assert.equal(contarNaoLidas(db, sala.id, 0, dono.id), 0);
});

test('marcadores vindos da URL: o que não presta é descartado, sem estourar', () => {
  assert.deepEqual([...lerMarcadores('3:40,7:0')], [[3, 40], [7, 0]]);
  assert.deepEqual([...lerMarcadores('')], []);
  assert.deepEqual([...lerMarcadores(null)], []);
  assert.deepEqual([...lerMarcadores('bobagem,x:y,0:5,-2:9')], []);
  assert.deepEqual([...lerMarcadores('4:12,lixo')], [[4, 12]]);
});

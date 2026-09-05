import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco, garantirServidor } from './banco.mjs';
import { criarConta, entrar, usuarioDaSessao } from './contas.mjs';
import { CARGO } from './cargos.mjs';
import {
  garantirMembro, buscarMembro, listarMembros, impedimento, mudarNomeExibido,
  banir, desbanir, darTimeout, tirarTimeout, expulsar, definirCargo,
} from './membros.mjs';

function cenario({ dono } = {}) {
  const db = abrirBanco(':memory:');
  const servidor = garantirServidor(db, { nome: 'Cantinho', salas: ['Geral'] });
  const cria = (apelido) => {
    const u = criarConta(db, { apelido, senha: 'segredo123', senhaRepetida: 'segredo123' });
    garantirMembro(db, servidor.id, u, { dono });
    return u;
  };
  return { db, sid: servidor.id, cria };
}

test('o primeiro a entrar vira dono; os seguintes, membros', () => {
  const { db, sid, cria } = cenario();
  const a = cria('abner'), b = cria('bruno');
  assert.equal(buscarMembro(db, sid, a.id).cargo, CARGO.DONO);
  assert.equal(buscarMembro(db, sid, b.id).cargo, CARGO.MEMBRO);
});

test('com DONO definido, só aquele apelido vira dono — mesmo chegando depois', () => {
  const { db, sid, cria } = cenario({ dono: 'abner' });
  const b = cria('bruno');   // chega primeiro
  const a = cria('abner');
  assert.equal(buscarMembro(db, sid, b.id).cargo, CARGO.MEMBRO);
  assert.equal(buscarMembro(db, sid, a.id).cargo, CARGO.DONO);
});

test('entrar de novo não duplica nem rebaixa', () => {
  const { db, sid, cria } = cenario();
  const a = cria('abner');
  const u = { id: a.id, apelido_chave: 'abner' };
  garantirMembro(db, sid, u);
  assert.equal(db.prepare('SELECT count(*) c FROM membros').get().c, 1);
  assert.equal(buscarMembro(db, sid, a.id).cargo, CARGO.DONO);
});

test('sem nome exibido, mostra o apelido; e dá para voltar atrás', () => {
  const { db, sid, cria } = cenario();
  const a = cria('abner');
  assert.equal(buscarMembro(db, sid, a.id).nome, 'abner');
  assert.equal(mudarNomeExibido(db, sid, a.id, 'Abner do Vorcaro').nome, 'Abner do Vorcaro');
  assert.equal(mudarNomeExibido(db, sid, a.id, '   ').nome, 'abner', 'vazio devia voltar ao apelido');
});

test('nome exibido aceita espaço, mas não qualquer coisa', () => {
  const { db, sid, cria } = cenario();
  const a = cria('abner');
  assert.equal(mudarNomeExibido(db, sid, a.id, 'Abner K').nome, 'Abner K');
  assert.throws(() => mudarNomeExibido(db, sid, a.id, 'x'), /2 a 32/);
  assert.throws(() => mudarNomeExibido(db, sid, a.id, 'y'.repeat(33)), /2 a 32/);
});

test('moderador não bane; o dono bane', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner'), mod = cria('bruno'), membro = cria('caio');
  definirCargo(db, sid, dono.id, mod.id, CARGO.MODERADOR);
  assert.throws(() => banir(db, sid, mod.id, membro.id), /Dono/);
  assert.ok(banir(db, sid, dono.id, membro.id).banido_em);
});

test('banir derruba a sessão de quem está com o app aberto', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner'); cria('caio');
  const alvo = db.prepare("SELECT id FROM usuarios WHERE apelido = 'caio'").get();
  const { token } = entrar(db, { apelido: 'caio', senha: 'segredo123' });
  assert.ok(usuarioDaSessao(db, token));
  banir(db, sid, dono.id, alvo.id);
  assert.equal(usuarioDaSessao(db, token), null);
});

test('quem está banido não entra em sala, e desbanir libera', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner'), caio = cria('caio');
  banir(db, sid, dono.id, caio.id);
  assert.match(impedimento(buscarMembro(db, sid, caio.id)), /banido/);
  desbanir(db, sid, dono.id, caio.id);
  assert.equal(impedimento(buscarMembro(db, sid, caio.id)), null);
});

test('timeout impede por um tempo e depois libera sozinho', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner'), caio = cria('caio');
  darTimeout(db, sid, dono.id, caio.id, 10);
  const m = buscarMembro(db, sid, caio.id);
  assert.match(impedimento(m), /castigo/);
  // 11 minutos depois já pode
  assert.equal(impedimento(m, Date.now() + 11 * 60_000), null);
  tirarTimeout(db, sid, dono.id, caio.id);
  assert.equal(impedimento(buscarMembro(db, sid, caio.id)), null);
});

test('expulsar derruba a sessão mas deixa voltar', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner'); cria('caio');
  const caio = db.prepare("SELECT id FROM usuarios WHERE apelido = 'caio'").get();
  const { token } = entrar(db, { apelido: 'caio', senha: 'segredo123' });
  expulsar(db, sid, dono.id, caio.id);
  assert.equal(usuarioDaSessao(db, token), null, 'a sessão devia cair');
  assert.ok(entrar(db, { apelido: 'caio', senha: 'segredo123' }).token, 'devia poder entrar de novo');
  assert.equal(impedimento(buscarMembro(db, sid, caio.id)), null);
});

test('o dono promove, e o promovido passa a poder moderar', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner'), bruno = cria('bruno'), caio = cria('caio');
  assert.throws(() => darTimeout(db, sid, bruno.id, caio.id, 5), /Moderador/);
  definirCargo(db, sid, dono.id, bruno.id, CARGO.MODERADOR);
  assert.ok(darTimeout(db, sid, bruno.id, caio.id, 5).silenciado_ate);
});

test('ninguém escala sozinho nem encosta no dono', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner'), bruno = cria('bruno');
  assert.throws(() => definirCargo(db, sid, bruno.id, bruno.id, CARGO.DONO), /nível ou acima|consigo mesmo/);
  assert.throws(() => banir(db, sid, bruno.id, dono.id), /Dono|nível/);
  assert.throws(() => definirCargo(db, sid, dono.id, bruno.id, CARGO.DONO), /nível ou acima/);
});

test('a lista sai do cargo mais alto para o mais baixo', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner'); const bruno = cria('bruno'); cria('caio');
  definirCargo(db, sid, dono.id, bruno.id, CARGO.MODERADOR);
  assert.deepEqual(listarMembros(db, sid).map((m) => m.nome), ['abner', 'bruno', 'caio']);
});

test('quem não é membro do servidor não entra', () => {
  const { db, sid } = cenario();
  assert.match(impedimento(buscarMembro(db, sid, 999)), /não faz parte/);
});

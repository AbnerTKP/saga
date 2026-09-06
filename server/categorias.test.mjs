import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco, garantirServidor } from './banco.mjs';
import { criarConta } from './contas.mjs';
import { listarCargos } from './cargos.mjs';
import { garantirMembro, buscarMembro, definirCargo } from './membros.mjs';
import { criarSala, listarSalas, reordenarSalas } from './salas.mjs';
import {
  criarCategoria, renomearCategoria, apagarCategoria, listarCategorias, reordenarCategorias,
} from './categorias.mjs';

function cenario() {
  const db = abrirBanco(':memory:');
  const servidor = garantirServidor(db, { nome: 'Casa', salas: ['Geral'] });
  const cargos = Object.fromEntries(listarCargos(db, servidor.id).map((c) => [c.nome, c]));
  const cria = (apelido, dono) => {
    const u = criarConta(db, { apelido, senha: 'segredo123', senhaRepetida: 'segredo123' });
    garantirMembro(db, servidor.id, u, { dono: dono ? apelido : undefined });
    return buscarMembro(db, servidor.id, u.id);
  };
  const dono = cria('abner', true);
  return { db, sid: servidor.id, dono, cria, cargos };
}

test('o dono cria categoria; o membro comum, não', () => {
  const { db, sid, dono, cria } = cenario();
  assert.equal(criarCategoria(db, sid, dono, 'Jogos').nome, 'Jogos');
  const bruno = cria('bruno');
  assert.throws(() => criarCategoria(db, sid, bruno, 'Outra'), /não permite/);
});

test('duas categorias com o mesmo nome não coexistem', () => {
  const { db, sid, dono } = cenario();
  criarCategoria(db, sid, dono, 'Jogos');
  assert.throws(() => criarCategoria(db, sid, dono, 'jogos'), /Já existe/);
});

test('nome vazio ou com quebra de linha é recusado', () => {
  const { db, sid, dono } = cenario();
  for (const ruim of ['', '   ', 'a\nb']) {
    assert.throws(() => criarCategoria(db, sid, dono, ruim), /1 a 32/, JSON.stringify(ruim));
  }
});

test('as salas sem gaveta vêm primeiro, e as das gavetas na ordem das gavetas', () => {
  const { db, sid, dono } = cenario();
  const jogos = criarCategoria(db, sid, dono, 'Jogos');
  const papo = criarCategoria(db, sid, dono, 'Papo');
  const a = criarSala(db, sid, dono, { nome: 'Solta', tipo: 'voz' });
  const b = criarSala(db, sid, dono, { nome: 'Lobby', tipo: 'voz' });
  const c = criarSala(db, sid, dono, { nome: 'Recados', tipo: 'texto' });

  reordenarSalas(db, sid, dono, [
    { id: a.id, categoriaId: null },
    { id: listarSalas(db, sid)[0].id, categoriaId: null },   // a "Geral" do semeado
    { id: b.id, categoriaId: jogos.id },
    { id: c.id, categoriaId: papo.id },
  ]);

  assert.deepEqual(listarSalas(db, sid).map((s) => s.nome), ['Solta', 'Geral', 'Lobby', 'Recados']);
});

test('apagar a categoria não apaga as salas: elas voltam para o topo', () => {
  const { db, sid, dono } = cenario();
  const jogos = criarCategoria(db, sid, dono, 'Jogos');
  const sala = criarSala(db, sid, dono, { nome: 'Lobby', tipo: 'voz' });
  reordenarSalas(db, sid, dono, listarSalas(db, sid).map((s) => ({
    id: s.id, categoriaId: s.id === sala.id ? jogos.id : null,
  })));
  assert.equal(listarSalas(db, sid).find((s) => s.id === sala.id).categoriaId, jogos.id);

  apagarCategoria(db, sid, dono, jogos.id);
  const depois = listarSalas(db, sid).find((s) => s.id === sala.id);
  assert.ok(depois, 'a sala foi junto com a gaveta');
  assert.equal(depois.categoriaId, null, 'devia ter voltado para fora da gaveta');
});

test('reordenar categorias troca a ordem das salas de dentro', () => {
  const { db, sid, dono } = cenario();
  const um = criarCategoria(db, sid, dono, 'Um');
  const dois = criarCategoria(db, sid, dono, 'Dois');
  const a = criarSala(db, sid, dono, { nome: 'A', tipo: 'voz' });
  const b = criarSala(db, sid, dono, { nome: 'B', tipo: 'voz' });
  reordenarSalas(db, sid, dono, listarSalas(db, sid).map((s) => ({
    id: s.id,
    categoriaId: s.id === a.id ? um.id : s.id === b.id ? dois.id : null,
  })));
  assert.deepEqual(listarSalas(db, sid).map((s) => s.nome), ['Geral', 'A', 'B']);

  reordenarCategorias(db, sid, dono, [dois.id, um.id]);
  assert.deepEqual(listarSalas(db, sid).map((s) => s.nome), ['Geral', 'B', 'A']);
});

test('a ordem precisa citar todas as categorias, uma vez cada', () => {
  const { db, sid, dono } = cenario();
  const um = criarCategoria(db, sid, dono, 'Um');
  criarCategoria(db, sid, dono, 'Dois');
  assert.throws(() => reordenarCategorias(db, sid, dono, [um.id]), /uma vez cada/);
  assert.throws(() => reordenarCategorias(db, sid, dono, [um.id, um.id]), /uma vez cada/);
});

test('sala não vai para gaveta que não existe', () => {
  const { db, sid, dono } = cenario();
  const salas = listarSalas(db, sid);
  assert.throws(
    () => reordenarSalas(db, sid, dono, salas.map((s) => ({ id: s.id, categoriaId: 9999 }))),
    /categoria não existe/,
  );
});

test('a forma antiga de reordenar (só ids) continua valendo e não mexe na gaveta', () => {
  // O app e o servidor sobem separados: a versão velha manda uma lista de ids.
  const { db, sid, dono } = cenario();
  const jogos = criarCategoria(db, sid, dono, 'Jogos');
  const sala = criarSala(db, sid, dono, { nome: 'Lobby', tipo: 'voz' });
  reordenarSalas(db, sid, dono, listarSalas(db, sid).map((s) => ({
    id: s.id, categoriaId: s.id === sala.id ? jogos.id : null,
  })));

  reordenarSalas(db, sid, dono, listarSalas(db, sid).map((s) => s.id));
  assert.equal(listarSalas(db, sid).find((s) => s.id === sala.id).categoriaId, jogos.id,
    'a forma antiga não pode tirar a sala da gaveta');
});

test('renomear vale; renomear para um nome que já existe, não', () => {
  const { db, sid, dono } = cenario();
  const um = criarCategoria(db, sid, dono, 'Um');
  criarCategoria(db, sid, dono, 'Dois');
  assert.equal(renomearCategoria(db, sid, dono, um.id, 'Três').nome, 'Três');
  assert.throws(() => renomearCategoria(db, sid, dono, um.id, 'Dois'), /Já existe/);
  assert.equal(listarCategorias(db, sid).length, 2);
});

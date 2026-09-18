import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buscarPaginas, paginasDoServidor, PAGINAS_DA_CONTA } from './paginasDeConfiguracao.ts';
import type { Cargo } from './api.ts';

const cargo = (permissoes: Cargo['permissoes'], dono = false): Cargo => ({ id: 1, nome: 'x', cor: null, nivel: 10, permissoes, dono });
const ids = (c: Cargo | null) => paginasDoServidor(c).map((p) => p.id);

test('quem criou o servidor vê todas as páginas, na ordem do menu', () => {
  assert.deepEqual(ids(cargo([], true)), ['perfil', 'pessoas', 'cargos', 'convites', 'banidos', 'salas']);
});

test('quem não pode, não vê a página', () => {
  assert.deepEqual(ids(cargo(['convidar'])), ['convites']);
  assert.deepEqual(ids(cargo(['gerirSalas'])), ['salas']);
  assert.deepEqual(ids(cargo(['timeout'])), ['pessoas']);
  assert.deepEqual(ids(cargo(['banir'])), ['pessoas', 'banidos']);
  assert.deepEqual(ids(null), []);
});

test('a busca acha pelo título e pelos sinônimos, sem acento e sem maiúscula', () => {
  const achou = (b: string) => buscarPaginas(PAGINAS_DA_CONTA, b).map((p) => p.id);
  assert.deepEqual(achou('micro'), ['voz']);
  assert.deepEqual(achou('SENHA'), ['conta']);
  assert.deepEqual(achou('camera'), ['voz']);
  assert.deepEqual(achou('seguranca'), ['conta']);
  assert.deepEqual(achou(''), []);
  // O título vem antes do sinônimo: "perfil" é o título de uma e não sinônimo de outra.
  assert.equal(achou('perfil')[0], 'perfil');
});

test('"quem pode ver" leva a Salas e categorias', () => {
  assert.deepEqual(buscarPaginas(paginasDoServidor(cargo([], true)), 'privada').map((p) => p.id), ['salas']);
});

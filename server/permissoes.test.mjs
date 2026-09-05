import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TODAS, SOBRE_ALGUEM, limparPermissoes, temPermissao, podeAgir, podeDarCargo, podeMexerNoCargo,
} from './permissoes.mjs';

const cargo = (nivel, permissoes = [], dono = false) => ({ nivel, permissoes, dono });
const pessoa = (id, c) => ({ id, cargo: c });

const DONO = pessoa(1, cargo(100, [], true));
const MOD = pessoa(2, cargo(50, ['mutar', 'desconectar', 'timeout', 'expulsar']));
const OUTRO_MOD = pessoa(3, cargo(50, ['mutar', 'desconectar', 'timeout', 'expulsar']));
const MEMBRO = pessoa(4, cargo(10, []));

const pode = (quem, acao, alvo) => podeAgir(quem, acao, alvo).pode;

test('o dono tem tudo, mesmo com a lista vazia', () => {
  // Se o dono dependesse da lista, editar o cargo dele no banco deixaria o servidor
  // sem ninguém capaz de consertá-lo.
  for (const p of TODAS) assert.equal(temPermissao(DONO.cargo, p), true, p);
});

test('quem não tem a permissão não faz, por mais alto que esteja', () => {
  const alto = pessoa(9, cargo(90, ['mutar']));
  assert.equal(pode(alto, 'mutar', MEMBRO), true);
  assert.equal(pode(alto, 'banir', MEMBRO), false, 'banir sem ter a permissão');
});

test('a permissão sozinha não vence a hierarquia', () => {
  const mod = pessoa(5, cargo(50, ['banir']));
  assert.equal(pode(mod, 'banir', MEMBRO), true);
  assert.equal(pode(mod, 'banir', DONO), false, 'alcançou o dono');
  assert.equal(pode(mod, 'banir', OUTRO_MOD), false, 'alcançou um igual');
});

test('ninguém age sobre si mesmo, nem o dono', () => {
  for (const acao of SOBRE_ALGUEM) {
    assert.equal(pode(DONO, acao, { ...DONO }), false, acao);
    assert.equal(pode(MOD, acao, { ...MOD }), false, acao);
  }
});

test('permissões que não recaem sobre pessoa ignoram a hierarquia', () => {
  // Criar sala não é ação sobre alguém: não faz sentido perguntar "acima de quem?".
  const gestor = pessoa(6, cargo(10, ['gerirSalas', 'gerirSons']));
  assert.equal(pode(gestor, 'gerirSalas', DONO), true);
  assert.equal(pode(gestor, 'gerirSons', DONO), true);
});

test('permissão inventada não vira poder', () => {
  const esperto = pessoa(7, cargo(90, ['banirTudo', 'admin', '*']));
  assert.equal(pode(esperto, 'banir', MEMBRO), false);
  assert.deepEqual(limparPermissoes(['banirTudo', 'mutar', '*', 'mutar']), ['mutar']);
  assert.deepEqual(limparPermissoes(null), []);
  assert.deepEqual(limparPermissoes('mutar'), [], 'texto solto não é lista');
});

test('ação desconhecida é recusada mesmo para o dono', () => {
  assert.equal(pode(DONO, 'explodir', MEMBRO), false);
});

test('cargo dado precisa estar abaixo de quem dá', () => {
  const doMod = cargo(50, []);
  const deMembro = cargo(10, []);
  assert.equal(podeDarCargo(DONO, MEMBRO, doMod).pode, true);

  const mod = pessoa(8, cargo(50, ['definirCargo']));
  assert.equal(podeDarCargo(mod, MEMBRO, deMembro).pode, true);
  assert.equal(podeDarCargo(mod, MEMBRO, doMod).pode, false, 'deu o próprio nível');
});

test('o cargo de dono não se passa adiante por aqui', () => {
  const r = podeDarCargo(DONO, MEMBRO, cargo(100, [], true));
  assert.equal(r.pode, false);
  assert.match(r.motivo, /dono/);
});

test('editar cargo exige a permissão e estar acima dele', () => {
  const gestor = pessoa(10, cargo(50, ['gerirCargos']));
  assert.equal(podeMexerNoCargo(gestor, cargo(10)).pode, true);
  assert.equal(podeMexerNoCargo(gestor, cargo(50)).pode, false, 'mexeu num do próprio nível');
  assert.equal(podeMexerNoCargo(gestor, cargo(100, [], true)).pode, false, 'mexeu no do dono');
  assert.equal(podeMexerNoCargo(MEMBRO, cargo(10)).pode, false, 'sem a permissão');
});

test('o dono mexe em qualquer cargo, menos no dele', () => {
  assert.equal(podeMexerNoCargo(DONO, cargo(99)).pode, true);
  assert.equal(podeMexerNoCargo(DONO, cargo(100, [], true)).pode, false);
});

test('toda recusa vem com motivo escrito', () => {
  for (const acao of TODAS) {
    const r = podeAgir(MEMBRO, acao, DONO);
    assert.equal(r.pode, false, acao);
    assert.ok(r.motivo?.length > 0, `${acao} negou sem motivo`);
  }
});

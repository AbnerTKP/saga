import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARGO, ACOES, podeAgir, podeDefinirCargo } from './cargos.mjs';

const dono = { id: 1, cargo: CARGO.DONO };
const mod = { id: 2, cargo: CARGO.MODERADOR };
const outroMod = { id: 3, cargo: CARGO.MODERADOR };
const membro = { id: 4, cargo: CARGO.MEMBRO };
const outroMembro = { id: 5, cargo: CARGO.MEMBRO };

const pode = (quem, acao, alvo) => podeAgir(quem, acao, alvo).pode;

test('membro não pode fazer nada com ninguém', () => {
  for (const acao of ACOES) {
    assert.equal(pode(membro, acao, outroMembro), false, `membro conseguiu ${acao}`);
    assert.equal(pode(membro, acao, mod), false, `membro conseguiu ${acao} num moderador`);
    assert.equal(pode(membro, acao, dono), false, `membro conseguiu ${acao} no dono`);
  }
});

test('moderador modera membros', () => {
  for (const acao of ['mutar', 'desconectar', 'timeout', 'expulsar']) {
    assert.equal(pode(mod, acao, membro), true, `moderador não conseguiu ${acao}`);
  }
});

test('banir e definir cargo são só do dono', () => {
  assert.equal(pode(mod, 'banir', membro), false);
  assert.equal(pode(mod, 'definirCargo', membro), false);
  assert.equal(pode(dono, 'banir', membro), true);
  assert.equal(pode(dono, 'definirCargo', membro), true);
});

test('moderador não encosta em outro moderador', () => {
  for (const acao of ACOES) {
    assert.equal(pode(mod, acao, outroMod), false, `moderador conseguiu ${acao} em outro moderador`);
  }
});

test('ninguém encosta no dono — nem o próprio dono', () => {
  for (const acao of ACOES) {
    assert.equal(pode(mod, acao, dono), false, `moderador conseguiu ${acao} no dono`);
    assert.equal(pode(membro, acao, dono), false, `membro conseguiu ${acao} no dono`);
    assert.equal(pode(dono, acao, dono), false, `o dono conseguiu ${acao} em si mesmo`);
  }
});

test('o dono age sobre moderadores e membros', () => {
  for (const acao of ACOES) {
    assert.equal(pode(dono, acao, mod), true, `dono não conseguiu ${acao} num moderador`);
    assert.equal(pode(dono, acao, membro), true, `dono não conseguiu ${acao} num membro`);
  }
});

test('ninguém age sobre si mesmo', () => {
  for (const quem of [dono, mod, membro]) {
    for (const acao of ACOES) {
      assert.equal(pode(quem, acao, { ...quem }), false, `${quem.cargo} conseguiu ${acao} em si`);
    }
  }
});

test('o dono promove membro a moderador', () => {
  assert.equal(podeDefinirCargo(dono, membro, CARGO.MODERADOR).pode, true);
});

test('o dono não cria outro dono', () => {
  // Dois donos significam dois que podem banir um ao outro. Fica fora.
  const r = podeDefinirCargo(dono, membro, CARGO.DONO);
  assert.equal(r.pode, false);
  assert.match(r.motivo, /nível ou acima/);
});

test('moderador não promove ninguém, nem para membro', () => {
  assert.equal(podeDefinirCargo(mod, membro, CARGO.MEMBRO).pode, false);
});

test('cargo inexistente é recusado', () => {
  const r = podeDefinirCargo(dono, membro, 75);
  assert.equal(r.pode, false);
  assert.match(r.motivo, /inválido/);
});

test('ação inexistente é recusada, mesmo para o dono', () => {
  assert.equal(pode(dono, 'explodir', membro), false);
});

test('alvo que não existe é recusado', () => {
  assert.equal(pode(dono, 'banir', null), false);
});

test('toda ação sempre responde com motivo quando nega', () => {
  for (const acao of ACOES) {
    const r = podeAgir(membro, acao, dono);
    assert.equal(r.pode, false);
    assert.ok(typeof r.motivo === 'string' && r.motivo.length > 0, `${acao} negou sem motivo`);
  }
});

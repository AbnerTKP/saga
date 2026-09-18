import { test } from 'node:test';
import assert from 'node:assert/strict';
import { podeConfigurar } from './configurar.ts';
import type { Cargo } from './api.ts';

const cargo = (permissoes: Cargo['permissoes'], dono = false): Cargo => ({ id: 1, nome: 'x', cor: null, nivel: 10, permissoes, dono });

test('quem só convida ou só apaga mensagem não vê "Configurações do servidor"', () => {
  assert.equal(podeConfigurar(cargo(['convidar'])), false);
  assert.equal(podeConfigurar(cargo(['convidar', 'apagarMensagens'])), false);
  assert.equal(podeConfigurar(cargo(['definirId'])), false);
  assert.equal(podeConfigurar(null), false);
});

test('quem tem uma página nas configurações vê', () => {
  for (const p of ['gerirServidor', 'gerirSalas', 'gerirCargos', 'definirCargo', 'gerirSons', 'banir', 'expulsar', 'timeout', 'mutar', 'desconectar'] as const) {
    assert.equal(podeConfigurar(cargo([p])), true, p);
  }
});

test('quem criou o servidor sempre vê', () => {
  assert.equal(podeConfigurar(cargo([], true)), true);
});

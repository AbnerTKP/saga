import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco } from './banco.mjs';
import { criarConta } from './contas.mjs';
import { buscarMembro } from './membros.mjs';
import { criarServidor, criarConvite, usarConvite } from './servidores.mjs';
import { ALFABETO, gerarCodigo, limparCodigo } from './codigos.mjs';

test('o código sai só do alfabeto, sem as letras que se confundem', () => {
  for (let i = 0; i < 200; i++) {
    const codigo = gerarCodigo();
    assert.equal(codigo.length, 8);
    for (const letra of codigo) assert.ok(ALFABETO.includes(letra), `"${letra}" não é do alfabeto`);
  }
  assert.ok(!/[O0I1]/.test(ALFABETO));
  assert.equal(256 % ALFABETO.length, 0, 'com outro tamanho, `b % tamanho` puxaria para as primeiras letras');
});

test('limpar tira espaço e hífen e põe em maiúsculas; o que não é texto vira código vazio', () => {
  assert.equal(limparCodigo(' k7qm-2xpa '), 'K7QM2XPA');
  assert.equal(limparCodigo('K7QM 2XPA'), 'K7QM2XPA');
  for (const lixo of [undefined, null, 12345678, { a: 1 }, ['K7QM2XPA']]) assert.equal(limparCodigo(lixo), '');
  // Um array com milhares de níveis passa pelo JSON.parse e estoura a pilha ao virar texto.
  assert.equal(limparCodigo(JSON.parse('['.repeat(20_000) + ']'.repeat(20_000))), '');
});

test('o convite aceita o código do jeito que se digita o de senha: minúsculas, hífen e espaço', () => {
  const db = abrirBanco(':memory:');
  const conta = (apelido) => criarConta(db, { apelido, senha: 'segredo123', senhaRepetida: 'segredo123' });
  const dono = conta('abner');
  const servidor = criarServidor(db, dono, { nome: 'Toca' });
  const { codigo } = criarConvite(db, servidor.id, buscarMembro(db, servidor.id, dono.id), {});

  const jeitos = [
    (c) => `${c.slice(0, 4)}-${c.slice(4)}`,
    (c) => `${c.slice(0, 4)} ${c.slice(4)}`.toLowerCase(),
    (c) => ` ${c} `,
  ];
  jeitos.forEach((jeito, i) => {
    const quem = conta(`chegou${i}`);
    assert.equal(usarConvite(db, quem, jeito(codigo)).id, servidor.id, `recusou "${jeito(codigo)}"`);
    assert.ok(buscarMembro(db, servidor.id, quem.id), 'entrou sem virar membro');
  });

  const lixo = conta('lixo1');
  for (const errado of [JSON.parse('['.repeat(20_000) + ']'.repeat(20_000)), 12345678, 'AAAA-AAAA']) {
    assert.throws(() => usarConvite(db, lixo, errado), (e) => e.status === 404);
  }
});

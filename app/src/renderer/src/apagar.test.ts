import { test } from 'node:test';
import assert from 'node:assert/strict';
import { podeApagarMensagem } from './apagar.ts';
import type { Cargo, Permissao } from './api.ts';

const cargo = (nivel: number, permissoes: Permissao[] = [], dono = false): Cargo =>
  ({ id: nivel, nome: `nível ${nivel}`, cor: null, nivel, permissoes, dono });
const quem = (id: number, c: Cargo | null) => ({ id, cargo: c });

const DONO = quem(1, cargo(1000, [], true));
const FAXINA = quem(2, cargo(30, ['apagarMensagens']));
const MEMBRO = quem(3, cargo(10));
const deOutro = { minha: false, daSaga: false };

test('a própria mensagem se apaga sem cargo nenhum', () => {
  assert.equal(podeApagarMensagem(quem(9, null), null, { minha: true, daSaga: false }), true);
});

test('a dos outros pede a permissão e só alcança quem está abaixo', () => {
  assert.equal(podeApagarMensagem(MEMBRO, FAXINA, deOutro), false, 'membro sem a permissão');
  assert.equal(podeApagarMensagem(FAXINA, MEMBRO, deOutro), true);
  assert.equal(podeApagarMensagem(FAXINA, quem(4, cargo(30, ['apagarMensagens'])), deOutro), false, 'um igual');
  assert.equal(podeApagarMensagem(FAXINA, DONO, deOutro), false, 'quem está acima');
  assert.equal(podeApagarMensagem(DONO, FAXINA, deOutro), true, 'o dono apaga a de qualquer um');
  assert.equal(podeApagarMensagem(FAXINA, null, deOutro), true, 'quem saiu do servidor');
});

test('as notas da versão, ninguém — nem o dono', () => {
  assert.equal(podeApagarMensagem(DONO, null, { minha: false, daSaga: true }), false);
});

test('na conversa privada, cada um apaga só o que disse', () => {
  // Não há cargo entre duas pessoas: nem quem criou o servidor alcança a fala do outro
  // ali dentro. Sem isto o botão aparecia e o servidor recusava com 403.
  const privada = { daSaga: false, privada: true };
  assert.equal(podeApagarMensagem(DONO, MEMBRO, { minha: true, ...privada }), true);
  assert.equal(podeApagarMensagem(DONO, MEMBRO, { minha: false, ...privada }), false);
  assert.equal(podeApagarMensagem(FAXINA, MEMBRO, { minha: false, ...privada }), false);
  // Fora da conversa, a regra de sempre continua valendo.
  assert.equal(podeApagarMensagem(FAXINA, MEMBRO, { minha: false, daSaga: false }), true);
});

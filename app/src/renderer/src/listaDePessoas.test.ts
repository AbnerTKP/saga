import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agruparPessoas, type GrupoDePessoas } from './listaDePessoas.ts';
import type { Cargo, Membro } from './api.ts';

const cargo = (id: number, nome: string, nivel: number, cor: string | null = null) =>
  ({ id, nome, nivel, cor, permissoes: [] }) as unknown as Cargo;
const pessoa = (nome: string, c: Cargo | null, status: string, banido = false) =>
  ({ id: nome.length * 100 + nome.charCodeAt(0), nome, cargo: c, status, banido }) as unknown as Membro;
const lida = (grupos: GrupoDePessoas[]) => grupos.map((g) => `${g.titulo}: ${g.gente.map((m) => m.nome).join(', ')}`);

const MOD = cargo(1, 'Moderador', 50, '#3f7fe0');
const MEMBRO = cargo(2, 'Membro', 10);

test('quem está aqui fica no cargo; quem está offline vai para um grupo só, no fim', () => {
  // Na ordem do nome, que é como o servidor manda: offline no meio de quem está aqui.
  const membros = [
    pessoa('Bia', MEMBRO, 'offline'), pessoa('Caio', MEMBRO, 'offline'),
    pessoa('Juninho', MEMBRO, 'ocupado'), pessoa('Junio', MEMBRO, 'ausente'),
    pessoa('Lucas', MEMBRO, 'offline'), pessoa('Rafa', MOD, 'offline'),
    pessoa('Tava1', MEMBRO, 'online'), pessoa('TKP', MOD, 'online'),
  ];
  assert.deepEqual(lida(agruparPessoas(membros, [MOD, MEMBRO])), [
    'Moderador: TKP',
    // Ausente e ocupado são recados de quem está aqui: ficam no cargo.
    'Membro: Juninho, Junio, Tava1',
    // Um grupo só, em qualquer cargo, na mesma ordem em que vieram.
    'Offline: Bia, Caio, Lucas, Rafa',
  ]);
});

test('o grupo de offline não tem cor, e o de cargo leva a do cargo', () => {
  const [mod, off] = agruparPessoas([pessoa('TKP', MOD, 'online'), pessoa('Rafa', MOD, 'offline')], [MOD]);
  assert.equal(mod.cor, '#3f7fe0');
  assert.equal(off.titulo, 'Offline');
  assert.equal(off.cor, null);
});

test('cargo sem ninguém aqui some, e sem ninguém offline não há grupo de offline', () => {
  assert.deepEqual(lida(agruparPessoas([pessoa('Tava1', MEMBRO, 'online')], [MOD, MEMBRO])), ['Membro: Tava1']);
});

test('a ordem dos cargos é a do nível, não a da lista', () => {
  const membros = [pessoa('Tava1', MEMBRO, 'online'), pessoa('TKP', MOD, 'online')];
  assert.deepEqual(lida(agruparPessoas(membros, [MEMBRO, MOD])), ['Moderador: TKP', 'Membro: Tava1']);
});

test('sem cargo, ou com um cargo que não está na lista, fica em Sem cargo — antes de Offline', () => {
  const fantasma = cargo(99, 'Apagado', 30);
  const membros = [pessoa('Ana', null, 'online'), pessoa('Dono', fantasma, 'online'), pessoa('Zé', null, 'offline')];
  assert.deepEqual(lida(agruparPessoas(membros, [MOD, MEMBRO])), ['Sem cargo: Ana, Dono', 'Offline: Zé']);
});

test('banido não entra em grupo nenhum, nem no de offline', () => {
  const membros = [pessoa('Tava1', MEMBRO, 'online'), pessoa('Banido', MEMBRO, 'offline', true)];
  assert.deepEqual(lida(agruparPessoas(membros, [MEMBRO])), ['Membro: Tava1']);
});

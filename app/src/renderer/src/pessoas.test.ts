import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acharPessoa, contaDaIdentidade, doMembro, identidadeDe } from './pessoas.ts';
import type { Membro } from './api.ts';
import type { PessoaNaCall } from './components/MenuDaPessoa.tsx';

const membro = (id: number, nome: string, extra: Partial<Membro> = {}): Membro => ({
  id, apelido: nome.toLowerCase(), nome, cargo: { id: 1, nome: 'Peixe Souris', cor: '#f80', nivel: 10, permissoes: [] },
  cargoNome: 'Peixe Souris', foto: 'foto.png', banner: 'banner.png', enquadramento: {}, turbo: true,
  idExibido: 'RACIST', banido: false, banidoPor: null, castigoAte: null, entrouEm: 1757000000000, ...extra,
});

test('quem está na call vem da call', () => {
  const naCall = new Map<string, PessoaNaCall>([['u7', { identity: 'u7', nome: 'Tava1', usuarioId: 7 }]]);
  assert.equal(acharPessoa('u7', { naCall, membros: [] }).nome, 'Tava1');
});

test('quem NÃO está na call vem da lista de membros, inteiro', () => {
  // Era aqui que o cartão nascia pelado: do chat, quase ninguém está em call ao mesmo
  // tempo, e o mapa da call não tinha a pessoa.
  const p = acharPessoa('u7', { naCall: new Map(), membros: [membro(7, 'Tava1')] });
  assert.deepEqual(
    { nome: p.nome, cargo: p.cargo?.nome, foto: p.foto, id: p.idExibido, berserk: p.turbo },
    { nome: 'Tava1', cargo: 'Peixe Souris', foto: 'foto.png', id: 'RACIST', berserk: true },
  );
});

test('sem as duas fontes, sobra o nome que quem chamou tinha na mão', () => {
  // Alguém que saiu do servidor: a mensagem dele continua no chat, e o cartão abre com
  // o pouco que dá em vez de não abrir.
  const p = acharPessoa('u99', { naCall: new Map(), membros: [membro(7, 'Tava1')], nome: 'quem foi embora' });
  assert.equal(p.nome, 'quem foi embora');
  assert.equal(p.cargo, undefined);
});

test('identidade e conta são a mesma coisa dos dois lados', () => {
  assert.equal(identidadeDe(12), 'u12');
  assert.equal(contaDaIdentidade('u12'), 12);
  assert.equal(contaDaIdentidade('anon#9z'), null, 'identidade que não é de conta não vira número');
  assert.equal(contaDaIdentidade('u0'), null);
});

test('o membro virado pessoa carrega o que o cartão desenha', () => {
  const p = doMembro(membro(7, 'Tava1'));
  assert.equal(p.identity, 'u7');
  assert.equal(p.usuarioId, 7);
  assert.equal(p.entrouEm, 1757000000000);
});

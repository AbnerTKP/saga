import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acharPessoa, contaDaIdentidade, doMembro, identidadeDe, lembrarDasSalas, vistosEm } from './pessoas.ts';
import type { Conhecidos } from './pessoas.ts';
import type { Cargo, Membro, RoomInfo } from './api.ts';

const CORNUME = 1;
const TESTE = 2;

const cargo = (id: number, nome: string, nivel: number): Cargo => ({ id, nome, cor: '#f80', nivel, permissoes: [] });
const PEIXE = cargo(8, 'Peixe Souris', 20);
const BEN10 = cargo(9, 'BEN 10', 21);
const MODERADOR = cargo(6, 'Moderador', 50);

const membro = (id: number, nome: string, extra: Partial<Membro> = {}): Membro => ({
  id, apelido: nome.toLowerCase(), nome, cargo: PEIXE,
  cargoNome: 'Peixe Souris', foto: 'foto.png', banner: 'banner.png', enquadramento: {}, turbo: true,
  idExibido: 'RACIST', banido: false, banidoPor: null, castigoAte: null, entrouEm: 1757000000000, ...extra,
});

/** A lista de membros que o app tem na mão, com o servidor dela. */
const listaDe = (servidorId: number, ...lista: Membro[]) => ({ servidorId, lista });

/** Uma sala de voz com gente dentro, do jeito que o /rooms entrega. */
const salaCom = (...gente: { id: number; nome: string; cargo: Cargo | null; idExibido?: string | null }[]): RoomInfo => ({
  id: 1, name: 'Geral', tipo: 'voz', naoLidas: 0, categoriaId: null,
  participants: gente.map((g) => ({
    identity: identidadeDe(g.id), name: g.nome, camera: false, screen: false, muted: true,
    usuarioId: g.id, cargo: g.cargo, foto: 'foto.png', idExibido: g.idExibido ?? null, entrouEm: 1757000000000,
  })),
});

test('o cartão aberto num servidor não leva o cargo, o nome nem o identificador de outro', () => {
  // O caso do dono, medido no app de verdade. Na call do CORNUME ele é "Bagre", "Peixe
  // Souris", com o identificador TKP; no "teste" é TKP, Moderador e sem identificador.
  // O mapa das calls não sabia de servidor e era consultado primeiro: aberto pela lista
  // do "teste", o cartão dizia Peixe Souris — com a lista da direita dizendo Moderador na
  // mesma tela.
  const conhecidos: Conhecidos = new Map();
  lembrarDasSalas(conhecidos, CORNUME, [salaCom({ id: 7, nome: 'Bagre', cargo: PEIXE, idExibido: 'TKP' })]);

  const p = acharPessoa('u7', {
    servidorId: TESTE,
    conhecidos,
    membros: listaDe(TESTE, membro(7, 'TKP', { cargo: MODERADOR, cargoNome: 'Moderador', idExibido: null })),
  });
  assert.deepEqual(
    { nome: p.nome, cargo: p.cargo?.nome, id: p.idExibido },
    { nome: 'TKP', cargo: 'Moderador', id: null },
  );
});

test('logo depois de trocar de servidor, a lista do anterior não responde pelo novo', () => {
  // A busca do servidor novo ainda não voltou, e a lista na mão é a do CORNUME. Sem saber
  // de que servidor ela é, passava por ser a do "teste".
  const p = acharPessoa('u7', {
    servidorId: TESTE,
    conhecidos: new Map(),
    membros: listaDe(CORNUME, membro(7, 'Bagre', { idExibido: 'TKP' })),
    nome: 'TKP',
  });
  assert.equal(p.nome, 'TKP', 'fica o nome que quem clicou tinha na mão');
  assert.equal(p.cargo, undefined, 'e cargo nenhum, em vez do de outro servidor');
  assert.equal(p.idExibido, undefined);
});

test('quem está na call de um servidor que não está aberto vem do que se viu NAQUELE servidor', () => {
  // A voz continua no CORNUME com os olhos no "teste". Clicar em quem está no palco é
  // perguntar pelo CORNUME, e a lista na mão, a do "teste", não sabe dessa pessoa.
  const conhecidos: Conhecidos = new Map();
  lembrarDasSalas(conhecidos, CORNUME, [salaCom({ id: 9, nome: 'Tava1', cargo: BEN10 })]);
  const p = acharPessoa('u9', { servidorId: CORNUME, conhecidos, membros: listaDe(TESTE) });
  assert.equal(p.cargo?.nome, 'BEN 10');
});

test('o que se viu na call de um servidor não responde por outro', () => {
  // Quem saiu do "teste" e cuja mensagem continua lá: o CORNUME não diz nada sobre ele aqui.
  const conhecidos: Conhecidos = new Map();
  lembrarDasSalas(conhecidos, CORNUME, [salaCom({ id: 9, nome: 'Tava1', cargo: BEN10 })]);
  const p = acharPessoa('u9', { servidorId: TESTE, conhecidos, membros: listaDe(TESTE), nome: 'quem foi embora' });
  assert.equal(p.nome, 'quem foi embora');
  assert.equal(p.cargo, undefined);
});

test('no mesmo servidor, a lista de membros vem antes do que se viu na call', () => {
  // Quem saiu da call fica no mapa com o que tinha naquela hora; a lista é renovada. O
  // cargo trocado depois da call tem de aparecer.
  const conhecidos: Conhecidos = new Map();
  lembrarDasSalas(conhecidos, TESTE, [salaCom({ id: 7, nome: 'TKP', cargo: cargo(7, 'Membro', 10) })]);
  const p = acharPessoa('u7', { servidorId: TESTE, conhecidos, membros: listaDe(TESTE, membro(7, 'TKP', { cargo: MODERADOR })) });
  assert.equal(p.cargo?.nome, 'Moderador');
});

test('quem NÃO está na call vem da lista de membros, inteiro', () => {
  // Era aqui que o cartão nascia pelado: do chat, quase ninguém está em call ao mesmo
  // tempo, e o mapa da call não tinha a pessoa.
  const p = acharPessoa('u7', { servidorId: TESTE, conhecidos: new Map(), membros: listaDe(TESTE, membro(7, 'Tava1')) });
  assert.deepEqual(
    { nome: p.nome, cargo: p.cargo?.nome, foto: p.foto, id: p.idExibido, berserk: p.turbo },
    { nome: 'Tava1', cargo: 'Peixe Souris', foto: 'foto.png', id: 'RACIST', berserk: true },
  );
});

test('o que chega de novo de um servidor sobrescreve só naquele servidor', () => {
  const conhecidos: Conhecidos = new Map();
  lembrarDasSalas(conhecidos, CORNUME, [salaCom({ id: 7, nome: 'Bagre', cargo: PEIXE })]);
  lembrarDasSalas(conhecidos, TESTE, [salaCom({ id: 7, nome: 'TKP', cargo: MODERADOR })]);
  lembrarDasSalas(conhecidos, CORNUME, [salaCom({ id: 7, nome: 'Bagre', cargo: BEN10 })]);
  assert.equal(vistosEm(conhecidos, CORNUME).get('u7')?.cargo?.nome, 'BEN 10');
  assert.equal(vistosEm(conhecidos, TESTE).get('u7')?.cargo?.nome, 'Moderador');
  assert.equal(vistosEm(conhecidos, null).size, 0, 'sem servidor, ninguém');
  assert.equal(vistosEm(conhecidos, 99).size, 0, 'servidor nunca visto, ninguém');
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

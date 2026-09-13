import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cargosDoMaisAlto, contar, emQueDia, explicarFalha, haQuanto,
  pessoasPorCargo, quemVe, salasPorCategoria, servidoresNaOrdem,
} from './administracao.ts';
import type { Cargo, CargoDaSaga, Membro, SalaDaSaga, ServidorDaSaga } from './api.ts';

// Datas locais de propósito: "ontem" e "há 2 dias" são do fuso de quem lê — ver dias.ts.
const em = (a: number, m: number, d: number, h = 12, min = 0, s = 0) =>
  new Date(a, m - 1, d, h, min, s).getTime();

const servidor = (id: number, nome: string, criador: string | null = null): ServidorDaSaga => ({
  id, nome, foto: null, criadoEm: 0,
  criador: criador === null ? null : { id: id + 100, apelido: criador, foto: null },
  pessoas: 0, banidos: 0, online: 0, emCall: 0,
  salas: { voz: 0, texto: 0, privadas: 0 },
  mensagens: { total: 0, ultimos7Dias: 0, ultimaEm: null },
  souMembro: false,
});

const cargo = (id: number, nome: string, nivel: number): CargoDaSaga =>
  ({ id, nome, cor: null, nivel, permissoes: [], pessoas: 0 });

/** O cargo como vem DENTRO de um membro. */
const vestido = (c: CargoDaSaga): Cargo =>
  ({ id: c.id, nome: c.nome, cor: c.cor, nivel: c.nivel, dono: false, permissoes: [] });

const membro = (id: number, nome: string, c: Cargo | null, extra: Partial<Membro> = {}): Membro => ({
  id, apelido: nome.toLowerCase(), nome, cargo: c, cargoNome: c?.nome ?? 'Sem cargo',
  foto: null, banner: null, enquadramento: {}, turbo: false, idExibido: null,
  banido: false, banidoPor: null, castigoAte: null, entrouEm: null, ...extra,
});

const sala = (id: number, nome: string, categoriaId: number | null, extra: Partial<SalaDaSaga> = {}): SalaDaSaga => ({
  id, nome, tipo: 'texto', papel: null, privada: false, categoriaId, cargos: [],
  mensagens: { total: 0, ultimaEm: null }, naCall: [], ...extra,
});

// --- a lista de servidores ---------------------------------------------------

test('servidores em ordem de nome, sem diferenciar maiúscula nem acento', () => {
  const lista = [servidor(3, 'teste'), servidor(1, 'CORNUME'), servidor(2, 'Ágora'), servidor(4, 'cardume')];
  assert.deepEqual(servidoresNaOrdem(lista, '').map((s) => s.nome), ['Ágora', 'cardume', 'CORNUME', 'teste']);
});

test('nome igual desempata pelo id, venha a lista na ordem que vier', () => {
  // A lista volta de 10 em 10 s: se a ordem da resposta decidisse o empate, as linhas
  // trocariam de lugar debaixo do mouse.
  const lista = [servidor(7, 'Geral'), servidor(2, 'geral'), servidor(5, 'GERAL')];
  assert.deepEqual(servidoresNaOrdem(lista, '').map((s) => s.id), [2, 5, 7]);
  assert.deepEqual(servidoresNaOrdem(lista.slice().reverse(), '').map((s) => s.id), [2, 5, 7]);
});

test('ordenar não mexe na lista recebida', () => {
  const lista = [servidor(2, 'b'), servidor(1, 'a')];
  servidoresNaOrdem(lista, '');
  assert.deepEqual(lista.map((s) => s.id), [2, 1]);
});

test('a busca acha pelo nome do servidor, sem acento, sem maiúscula e sem os espaços das pontas', () => {
  const lista = [servidor(1, 'CORNUME'), servidor(2, 'Ágora'), servidor(3, 'teste')];
  assert.deepEqual(servidoresNaOrdem(lista, 'agora').map((s) => s.id), [2]);
  assert.deepEqual(servidoresNaOrdem(lista, '  corn ').map((s) => s.id), [1]);
  assert.deepEqual(servidoresNaOrdem(lista, '   ').map((s) => s.id), [2, 1, 3], 'busca só de espaço é busca nenhuma');
});

test('a busca acha também pelo apelido de quem criou', () => {
  const lista = [servidor(1, 'CORNUME', 'TKP'), servidor(2, 'teste', 'Tava1'), servidor(3, 'Casa', null)];
  assert.deepEqual(servidoresNaOrdem(lista, 'tkp').map((s) => s.id), [1]);
  assert.deepEqual(servidoresNaOrdem(lista, 'a').map((s) => s.nome), ['Casa', 'teste'], 'um pelo nome, outro por quem criou');
  assert.deepEqual(servidoresNaOrdem(lista, 'zzz'), [], 'servidor sem quem criou não quebra a busca');
});

// --- há quanto tempo ---------------------------------------------------------

test('há quanto tempo: nunca, agora há pouco, minutos e horas do mesmo dia', () => {
  const agora = em(2026, 9, 9, 15);
  assert.equal(haQuanto(null, agora), 'nunca');
  assert.equal(haQuanto(agora - 30_000, agora), 'agora há pouco');
  assert.equal(haQuanto(em(2026, 9, 9, 14, 55), agora), 'há 5 min');
  assert.equal(haQuanto(em(2026, 9, 9, 14, 0, 1), agora), 'há 59 min');
  assert.equal(haQuanto(em(2026, 9, 9, 12), agora), 'há 3 h');
});

test('relógio desta máquina atrás do servidor não vira futuro', () => {
  const agora = em(2026, 9, 9, 15);
  assert.equal(haQuanto(agora + 90_000, agora), 'agora há pouco');
});

test('"ontem" é o dia anterior no calendário, não 24 h atrás', () => {
  const agora = em(2026, 9, 9, 10);
  assert.equal(haQuanto(em(2026, 9, 8, 23), agora), 'ontem', 'só 11 h, mas noutro dia');
  assert.equal(haQuanto(em(2026, 9, 8, 0, 30), agora), 'ontem');
});

test('logo depois da meia-noite, minutos continuam sendo minutos', () => {
  assert.equal(haQuanto(em(2026, 9, 8, 23, 55), em(2026, 9, 9, 0, 10)), 'há 15 min');
});

test('dias contam pelo calendário: 23h do dia 7 lida à 1h do dia 9 são 2 dias', () => {
  assert.equal(haQuanto(em(2026, 9, 7, 23), em(2026, 9, 9, 1)), 'há 2 dias');
  assert.equal(haQuanto(em(2026, 9, 3), em(2026, 9, 9, 10)), 'há 6 dias');
});

test('passada uma semana, a data diz mais que a conta', () => {
  const agora = em(2026, 9, 9, 10);
  assert.equal(haQuanto(em(2026, 9, 2), agora), '2 de set.');
  assert.equal(haQuanto(em(2025, 12, 31), agora), '31 de dez. de 2025');
});

test('a data no meio da frase: hoje, ontem, ou "em" e a data', () => {
  const agora = em(2026, 9, 9, 15);
  assert.equal(emQueDia(em(2026, 9, 9, 8), agora), 'hoje');
  assert.equal(emQueDia(em(2026, 9, 8, 8), agora), 'ontem');
  assert.equal(emQueDia(em(2026, 9, 4), agora), 'em 4 de set.');
});

test('contar: singular só no um', () => {
  assert.equal(contar(1, 'pessoa', 'pessoas'), '1 pessoa');
  assert.equal(contar(5, 'pessoa', 'pessoas'), '5 pessoas');
  assert.equal(contar(0, 'pessoa', 'pessoas'), '0 pessoas');
});

// --- falhas ------------------------------------------------------------------

test('servidor antigo, sem a rota, ganha explicação em vez do 404 cru', () => {
  assert.equal(
    explicarFalha(404, 'não encontrado'),
    'O servidor da Saga ainda não conhece a administração: ela chega quando o servidor for publicado.',
  );
});

test('as outras falhas passam como vieram — inclusive o 404 de verdade', () => {
  assert.equal(explicarFalha(404, 'Esse servidor não existe.'), 'Esse servidor não existe.');
  assert.equal(explicarFalha(403, 'Isto é do dono da Saga.'), 'Isto é do dono da Saga.');
  assert.equal(explicarFalha(0, 'Não consegui falar com o servidor.'), 'Não consegui falar com o servidor.');
  assert.equal(explicarFalha(500, 'não encontrado'), 'não encontrado', 'só o 404 é o sinal da rota que falta');
});

// --- salas -------------------------------------------------------------------

test('salas: sem gaveta primeiro, depois as gavetas pela ordem delas', () => {
  const categorias = [{ id: 10, nome: 'Jogos', ordem: 1 }, { id: 11, nome: 'Estudo', ordem: 0 }];
  const salas = [sala(1, 'Geral', 10), sala(2, 'avisos', null), sala(3, 'Bancada', 11), sala(4, 'Truco', 10)];
  const grupos = salasPorCategoria(salas, categorias);
  assert.deepEqual(grupos.map((g) => g.categoria?.nome ?? null), [null, 'Estudo', 'Jogos']);
  assert.deepEqual(grupos.map((g) => g.salas.map((s) => s.id)), [[2], [3], [1, 4]], 'dentro do grupo, a ordem que veio');
});

test('gaveta com a mesma ordem desempata pelo id', () => {
  const categorias = [{ id: 12, nome: 'B', ordem: 0 }, { id: 11, nome: 'A', ordem: 0 }];
  const salas = [sala(1, 'x', 12), sala(2, 'y', 11)];
  assert.deepEqual(salasPorCategoria(salas, categorias).map((g) => g.categoria?.id), [11, 12]);
});

test('grupo vazio não aparece — nem gaveta vazia, nem o das salas soltas', () => {
  const categorias = [{ id: 10, nome: 'Jogos', ordem: 0 }, { id: 11, nome: 'Vazia', ordem: 1 }];
  assert.deepEqual(salasPorCategoria([sala(1, 'Geral', 10)], categorias).map((g) => g.categoria?.nome), ['Jogos']);
  assert.deepEqual(salasPorCategoria([], categorias), []);
});

test('sala de uma gaveta que não veio na lista fica sem gaveta, e não some', () => {
  const grupos = salasPorCategoria([sala(1, 'Perdida', 99)], []);
  assert.deepEqual(grupos.map((g) => [g.categoria, g.salas.map((s) => s.id)]), [[null, [1]]]);
});

// --- pessoas e cargos --------------------------------------------------------

test('cargos do mais alto ao mais baixo; empatados, na ordem de criação', () => {
  // O caso do CORNUME: "BEN 10" e "Peixe Souris" no mesmo nível, e empate é ordem de criação.
  const cargos = [cargo(9, 'BEN 10', 20), cargo(3, 'Membro', 10), cargo(8, 'Peixe Souris', 20), cargo(1, 'Moderador', 50)];
  assert.deepEqual(cargosDoMaisAlto(cargos).map((c) => c.nome), ['Moderador', 'Peixe Souris', 'BEN 10', 'Membro']);
});

test('pessoas por cargo, do mais alto ao mais baixo, com "Sem cargo" no fim', () => {
  const moderador = cargo(1, 'Moderador', 50);
  const comum = cargo(2, 'Membro', 10);
  const pessoas = [
    membro(11, 'Ana', vestido(comum)),
    membro(12, 'Bia', null),
    membro(13, 'Caio', vestido(moderador)),
    membro(14, 'Duda', vestido(comum)),
  ];
  const grupos = pessoasPorCargo(pessoas, [comum, moderador]);
  assert.deepEqual(grupos.map((g) => [g.cargo?.nome ?? null, g.pessoas.map((p) => p.nome)]), [
    ['Moderador', ['Caio']],
    ['Membro', ['Ana', 'Duda']],
    [null, ['Bia']],
  ]);
});

test('banido não é pessoa do servidor: fica fora dos grupos', () => {
  const comum = cargo(2, 'Membro', 10);
  const pessoas = [membro(11, 'Ana', vestido(comum)), membro(12, 'Bia', vestido(comum), { banido: true })];
  assert.deepEqual(pessoasPorCargo(pessoas, [comum]).map((g) => g.pessoas.map((p) => p.nome)), [['Ana']]);
});

test('cargo sem ninguém não vira grupo vazio', () => {
  const pessoas = [membro(11, 'Ana', null)];
  assert.deepEqual(pessoasPorCargo(pessoas, [cargo(1, 'Moderador', 50)]).map((g) => g.cargo), [null]);
});

test('quem criou fica no grupo do cargo que veste, mesmo chegando com nível 1000', () => {
  const moderador = cargo(1, 'Moderador', 50);
  const comum = cargo(2, 'Membro', 10);
  const dono: Cargo = { ...vestido(comum), nivel: 1000, dono: true };
  const grupos = pessoasPorCargo([membro(1, 'Lula', dono), membro(2, 'Caio', vestido(moderador))], [moderador, comum]);
  assert.deepEqual(grupos.map((g) => [g.cargo?.nome, g.pessoas.map((p) => p.nome)]), [
    ['Moderador', ['Caio']],
    ['Membro', ['Lula']],
  ]);
});

test('quem criou sem cargo nenhum cai em "Sem cargo": o cargo dele chega sem id', () => {
  const semId = { id: null, nome: null, cor: null, nivel: 1000, dono: true, permissoes: [] } as unknown as Cargo;
  const grupos = pessoasPorCargo([membro(1, 'Solo', semId)], [cargo(1, 'Moderador', 50)]);
  assert.deepEqual(grupos.map((g) => [g.cargo, g.pessoas.map((p) => p.nome)]), [[null, ['Solo']]]);
});

test('quem vê uma sala privada: os cargos do mais alto ao mais baixo', () => {
  const cargos = [cargo(2, 'Membro', 10), cargo(1, 'Moderador', 50), cargo(3, 'Visitante', 1)];
  assert.deepEqual(quemVe(sala(1, 'segredo', null, { privada: true, cargos: [2, 1] }), cargos), ['Moderador', 'Membro']);
});

test('sala aberta não tem lista de quem vê, mesmo com cargos guardados', () => {
  assert.deepEqual(quemVe(sala(1, 'Geral', null, { privada: false, cargos: [1] }), [cargo(1, 'Moderador', 50)]), []);
});

test('privada sem cargo nenhum, ou só com cargo apagado, devolve vazio', () => {
  const cargos = [cargo(1, 'Moderador', 50)];
  assert.deepEqual(quemVe(sala(1, 'trancada', null, { privada: true, cargos: [] }), cargos), []);
  assert.deepEqual(quemVe(sala(1, 'trancada', null, { privada: true, cargos: [99] }), cargos), []);
});

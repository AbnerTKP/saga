import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  andarNaGrade, andarNaLista, aoConfirmarNaGrade, aoConfirmarPessoa, cenarioAoLado, comandoDaTecla, itensDoFim, itensDoTitulo,
  ladoDoCursor, linhasDoConvite, montarEscolha, volumeAoLado, type ArenaNaTela,
} from './menu.ts';

test('as teclas dos menus: setas e WASD andam, Enter e J confirmam, Esc volta', () => {
  assert.equal(comandoDaTecla('ArrowLeft'), 'esquerda');
  assert.equal(comandoDaTecla('KeyW'), 'cima');
  assert.equal(comandoDaTecla('Enter'), 'confirmar');
  assert.equal(comandoDaTecla('KeyJ'), 'confirmar');
  assert.equal(comandoDaTecla('Escape'), 'voltar');
  assert.equal(comandoDaTecla('KeyC'), 'convidar');
  assert.equal(comandoDaTecla('KeyQ'), null);
});

test('o cursor anda na grade 3x3 e dá a volta nas bordas', () => {
  // goiaba vegetal picole / geladeira goiabaSuper vegetalSuper / gotinha tronco goteira
  assert.equal(andarNaGrade('goiaba', 'direita'), 'vegetal');
  assert.equal(andarNaGrade('goiaba', 'esquerda'), 'picole');
  assert.equal(andarNaGrade('goiaba', 'cima'), 'gotinha');
  assert.equal(andarNaGrade('goiabaSuper', 'baixo'), 'tronco');
  assert.equal(andarNaGrade('goteira', 'direita'), 'gotinha');
  assert.equal(andarNaGrade('tronco', 'confirmar'), 'tronco');
});

test('a lista pula o que não se escolhe e dá a volta', () => {
  const pode = (i: number) => i !== 0 && i !== 3;
  assert.equal(andarNaLista(1, 1, 5, pode), 2);
  assert.equal(andarNaLista(2, 1, 5, pode), 4);
  assert.equal(andarNaLista(4, 1, 5, pode), 1);
  assert.equal(andarNaLista(1, -1, 5, pode), 4);
  assert.equal(andarNaLista(0, 1, 2, () => false), 0, 'sem nada que se possa, fica');
});

test('cenário e volume andam pelas setas sem sair do que existe', () => {
  assert.equal(cenarioAoLado('torneio', 1), 'planeta');
  assert.equal(cenarioAoLado('torneio', -1), 'canion');
  assert.equal(volumeAoLado(0.95, 1), 1);
  assert.equal(volumeAoLado(0.05, -1), 0);
  assert.equal(volumeAoLado(0.7, -1), 0.6);
});

test('o título: LUTAR ou voltar à sua arena, e a arena de outra pessoa logo abaixo', () => {
  const nome = (id: number) => ({ 1: 'TKP', 2: 'BLANKITO', 3: 'TAVA1' } as Record<number, string>)[id];
  assert.deepEqual(itensDoTitulo([], 1, nome).map((i) => i.rotulo), ['LUTAR', 'OPÇÕES', 'SAIR']);
  const livre = itensDoTitulo([{ id: 9, estado: 'arena', anfitriao: 2, lutadores: [2, null] }], 1, nome);
  assert.deepEqual(livre.map((i) => i.rotulo), ['LUTAR', 'ENTRAR NA ARENA DE BLANKITO', 'OPÇÕES', 'SAIR']);
  assert.equal(livre[1].arena, 9);
  const lutando = itensDoTitulo([{ id: 9, estado: 'lutando', anfitriao: 2, lutadores: [2, 3] }], 1, nome);
  assert.equal(lutando[1].rotulo, 'ASSISTIR A LUTA DE BLANKITO');
  const minha = itensDoTitulo([{ id: 4, estado: 'lutando', anfitriao: 2, lutadores: [2, 1] }], 1, nome);
  assert.deepEqual(minha.map((i) => i.rotulo), ['VOLTAR À SUA LUTA', 'OPÇÕES', 'SAIR']);
  assert.equal(minha[0].arena, 4);
});

test('o fim: quem lutou tem revanche e troca; quem assistiu só sai', () => {
  assert.deepEqual(itensDoFim(true).map((i) => i.acao), ['revanche', 'trocar', 'sair']);
  assert.deepEqual(itensDoFim(false).map((i) => i.acao), ['sair']);
});

const tkp = { id: 1, nome: 'TKP' }, blankito = { id: 2, nome: 'Blankito' };
const arena = (o: Partial<ArenaNaTela>): ArenaNaTela => ({
  lados: [{ pessoa: tkp, lutador: 'goiaba' }, null], meuLado: 0, souAnfitriao: true, anfitriao: 'TKP', cenario: 'torneio', rounds: 2, ...o,
});

test('a escolha de quem abriu, sozinho: o painel mostra o cursor e o botão convida', () => {
  const e = montarEscolha(arena({}), 'tronco', 'TKP', false);
  assert.deepEqual([e.paineis[0].lutador, e.paineis[0].rotulo], ['tronco', 'ENTER TROCA']);
  assert.deepEqual([e.paineis[1].lutador, e.paineis[1].rotulo], [null, 'LUGAR LIVRE']);
  assert.deepEqual(e.cursores, ['tronco', null]);
  assert.equal(e.botao?.rotulo, 'C  CONVIDAR');
  assert.equal(aoConfirmarNaGrade(arena({}), 'tronco'), 'escolher');
  assert.equal(aoConfirmarNaGrade(arena({}), 'goiaba'), null, 'já escolhido e sem o outro lado: nada');
});

test('com os dois sentados, ENTER no próprio lutador começa — e só para quem abriu', () => {
  const cheia = arena({ lados: [{ pessoa: tkp, lutador: 'goiaba' }, { pessoa: blankito, lutador: 'picole' }] });
  assert.equal(aoConfirmarNaGrade(cheia, 'goiaba'), 'comecar');
  const e = montarEscolha(cheia, 'goiaba', 'TKP', true);
  assert.deepEqual([e.paineis[0].rotulo, e.paineis[1].rotulo], ['PRONTO!', 'PRONTO!']);
  assert.deepEqual(e.botao, { rotulo: 'ENTER  LUTAR!', ativo: true, aceso: true });
  const doConvidado = { ...cheia, meuLado: 1 as const, souAnfitriao: false };
  assert.equal(aoConfirmarNaGrade(doConvidado, 'picole'), null);
  assert.equal(aoConfirmarNaGrade(doConvidado, 'geladeira'), 'escolher');
  assert.equal(montarEscolha(doConvidado, 'picole', 'Blankito', false).recado, 'ESPERANDO TKP COMEÇAR');
});

test('quem chega de fora senta no lugar livre; com a arena cheia, só assiste', () => {
  const deFora = arena({ meuLado: null, souAnfitriao: false });
  assert.equal(ladoDoCursor(deFora), 1);
  const e = montarEscolha(deFora, 'gotinha', 'Tava1', false);
  assert.deepEqual([e.paineis[1].jogador, e.paineis[1].lutador, e.paineis[1].rotulo], ['Tava1', 'gotinha', 'ENTER SENTA AQUI']);
  assert.equal(aoConfirmarNaGrade(deFora, 'gotinha'), 'escolher');
  const cheia = arena({ meuLado: null, souAnfitriao: false, lados: [{ pessoa: tkp, lutador: 'goiaba' }, { pessoa: blankito, lutador: 'picole' }] });
  assert.equal(ladoDoCursor(cheia), null);
  assert.equal(aoConfirmarNaGrade(cheia, 'tronco'), null);
  assert.equal(montarEscolha(cheia, 'tronco', 'Tava1', false).recado, 'ASSISTINDO');
});

test('o convite agrupa na call e online, com a situação de cada um', () => {
  const linhas = linhasDoConvite(
    { naCall: [{ id: 2, nome: 'Blankito', foto: null }, { id: 3, nome: 'Tava1', foto: 'a.gif' }], online: [{ id: 5, nome: 'DaviS', foto: null }] },
    { lados: [{ pessoa: tkp, lutador: 'goiaba' }, { pessoa: blankito, lutador: 'picole' }], chamados: [3], recusaram: [5] },
  );
  assert.deepEqual(linhas.map((l) => (l.tipo === 'grupo' ? l.rotulo : `${l.nome}:${l.situacao}`)),
    ['NA CALL', 'Blankito:naArena', 'Tava1:chamado', 'ONLINE', 'DaviS:recusou']);
  assert.deepEqual(linhasDoConvite({ naCall: [], online: [] }, { lados: [null, null], chamados: [], recusaram: [] }), []);
  assert.equal(aoConfirmarPessoa({ id: 5, nome: 'DaviS', foto: null, situacao: 'recusou' }), 'chamar');
  assert.equal(aoConfirmarPessoa({ id: 3, nome: 'Tava1', foto: null, situacao: 'chamado' }), 'cancelarConvite');
  assert.equal(aoConfirmarPessoa({ id: 2, nome: 'Blankito', foto: null, situacao: 'naArena' }), null);
});

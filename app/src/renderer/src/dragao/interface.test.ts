import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARTAO, caber, desenharCartaoDeConvite, desenharConvite, desenharEscolha, desenharFim, desenharOpcoes, desenharPergunta,
  desenharTitulo, desenharVs, regiaoEm,
} from './interface.ts';
import { medir } from './fonte.ts';
import { criarQuadro } from './quadro.ts';
import { TELA } from './medidas.ts';
import { IDS_DOS_LUTADORES } from './tipos.ts';

const tela = () => criarQuadro(TELA.largura, TELA.altura);
const pintados = (q: { px: Uint32Array }) => q.px.reduce((n, c) => n + (c ? 1 : 0), 0);

test('cada tela desenha a tela inteira e devolve onde se clica', () => {
  const q = tela();
  const titulo = desenharTitulo(q, { itens: [{ rotulo: 'LUTAR' }, { rotulo: 'OPÇÕES' }, { rotulo: 'SAIR' }], selecionado: 0 });
  assert.equal(pintados(q), q.px.length);
  assert.deepEqual(titulo.map((r) => r.alvo), [{ tipo: 'item', indice: 0 }, { tipo: 'item', indice: 1 }, { tipo: 'item', indice: 2 }]);
  // o clique no meio do segundo item acerta o segundo item
  const r1 = titulo[1];
  assert.deepEqual(regiaoEm(titulo, r1.x + r1.l / 2, r1.y + r1.a / 2)?.alvo, { tipo: 'item', indice: 1 });

  const escolha = desenharEscolha(q, {
    paineis: [{ jogador: 'TKP', lutador: 'goiabaSuper', rotulo: 'PRONTO!', destaque: true }, { jogador: null, lutador: null, rotulo: 'LUGAR LIVRE', destaque: false }],
    cursores: ['goiabaSuper', null], cenario: 'ilha', rounds: 2, botao: { rotulo: 'C  CONVIDAR', ativo: true, aceso: false }, recado: null, legenda: 'ESC SAIR',
  });
  // os nove retratos, o cenário e o botão
  assert.equal(escolha.filter((r) => r.alvo.tipo === 'lutador').length, IDS_DOS_LUTADORES.length);
  assert.ok(escolha.some((r) => r.alvo.tipo === 'opcoes'));
  assert.ok(escolha.some((r) => r.alvo.tipo === 'botao'));

  const convite = desenharConvite(q, { selecionada: 1, linhas: [
    { tipo: 'grupo', rotulo: 'NA CALL' }, { tipo: 'pessoa', nome: 'Blankito', foto: null, situacao: 'livre' }, { tipo: 'pessoa', nome: 'Tava1', foto: null, situacao: 'chamado' },
  ] });
  assert.deepEqual(convite.map((r) => r.alvo), [{ tipo: 'pessoa', indice: 1 }, { tipo: 'pessoa', indice: 2 }]);

  const opcoes = desenharOpcoes(q, { linha: 2, cenario: 'torneio', rounds: 1, volume: 0.5, mudaArena: false });
  // sem mudar a arena, cenário e rounds não têm setas clicáveis; o som tem, e o testar também
  assert.ok(!opcoes.some((r) => r.alvo.tipo === 'linha' && r.alvo.indice < 2 && r.alvo.passo));
  assert.ok(opcoes.some((r) => r.alvo.tipo === 'linha' && r.alvo.indice === 2 && r.alvo.passo === 1));
  assert.ok(opcoes.some((r) => r.alvo.tipo === 'testar'));

  desenharVs(q, { lados: [{ jogador: 'TKP', lutador: 'goteira' }, { jogador: 'Blankito', lutador: 'vegetalSuper' }], cenario: 'canion', rounds: 1 });
  assert.equal(pintados(q), q.px.length);
  const fim = desenharFim(q, { vencedor: 2, lados: [{ jogador: 'TKP', lutador: 'goiaba' }, { jogador: 'X', lutador: 'picole' }], motivo: 'luta', cenario: 'torneio', itens: [{ rotulo: 'SAIR' }], selecionado: 0 });
  assert.equal(fim.length, 1);
  assert.equal(desenharPergunta(q, { titulo: 'DESISTIR?', detalhe: 'A LUTA CONTA COMO DERROTA', itens: [{ rotulo: 'NÃO' }, { rotulo: 'SIM' }], selecionado: 0 }).length, 2);
});

test('o cartão de convite tem os dois botões, e o texto que não cabe ganha reticências', () => {
  const c = criarQuadro(CARTAO.largura, CARTAO.altura);
  const r = desenharCartaoDeConvite(c, { de: 'UmApelidoMuitoMuitoComprido', foto: null, cenario: 'ilha', rounds: 2, contra: 'geladeira', servidor: 'Os Boboca', apontado: null });
  assert.deepEqual(r.map((x) => x.alvo.tipo), ['aceitar', 'recusar']);
  const t = caber('UMAPELIDOMUITOMUITOCOMPRIDO TE CHAMOU', 150);
  assert.ok(t.endsWith('...') && medir(t) <= 150, t);
});

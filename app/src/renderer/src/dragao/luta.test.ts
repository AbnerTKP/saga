import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avancar, caixaDoCorpo, clonar, criarLuta, impressao } from './luta.ts';
import { DURACAO } from './luta.ts';
import { BOTAO, SUB, type EstadoDaLuta } from './tipos.ts';
import { FICHAS, KI_INICIAL, TRANSFORMACAO } from './fichas.ts';

const luta = (rounds: 1 | 2 = 2) =>
  criarLuta({ lutadores: ['goiaba', 'vegetal'], cenario: 'torneio', roundsParaVencer: rounds, semente: 7 });

/** Pula a apresentação do round. */
function aoLutar(e: EstadoDaLuta) {
  while (e.fase !== 'luta') avancar(e, [0, 0]);
  return e;
}

const rodar = (e: EstadoDaLuta, n: number, a = 0, b = 0) => { for (let i = 0; i < n; i++) avancar(e, [a, b]); };

/** Entradas pseudoaleatórias fixas, iguais em toda execução. */
function entradas(n: number, semente: number): [number, number][] {
  let s = semente;
  const r = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) >>> 16) & 1023;
  const lista: [number, number][] = [];
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    if (i % 7 === 0) a = r();
    if (i % 5 === 0) b = r();
    lista.push([a, b]);
  }
  return lista;
}

test('a mesma sequência de botões dá a mesma luta, e o clone segue igual', () => {
  const lista = entradas(6000, 99);
  const a = luta(), b = luta();
  let meio: EstadoDaLuta | null = null;
  lista.forEach((ent, i) => {
    avancar(a, ent);
    avancar(b, ent);
    if (i === 2000) meio = clonar(a);
  });
  assert.equal(impressao(a), impressao(b));
  const c = meio!;
  lista.slice(2001).forEach((ent) => avancar(c, ent));
  assert.equal(impressao(c), impressao(a));
  // e mexer no clone não mexe no original
  const d = clonar(a);
  d.lutadores[0].vida = 1;
  d.projeteis.push({ ...(d.projeteis[0] ?? { id: 1, dono: 0, tipo: 'rajada', super: false, x: 0, y: 0, vx: 0, ponta: 0, direcao: 1, resta: 1, quadro: 0, batidas: 1, intervalo: 1, proximaBatida: 0 }) });
  assert.notEqual(a.lutadores[0].vida, 1);
  assert.notEqual(impressao(a), impressao(d));
});

test('a apresentação segura todo mundo e depois solta a luta', () => {
  const e = luta();
  rodar(e, 50, BOTAO.DIREITA, BOTAO.SOCO);
  assert.equal(e.fase, 'apresentacao');
  assert.equal(e.lutadores[0].x, luta().lutadores[0].x);
  rodar(e, DURACAO.apresentacao);
  assert.equal(e.fase, 'luta');
});

test('soco acerta de perto e erra de longe; acerto tira vida e dá ki', () => {
  const e = aoLutar(luta());
  const [a, b] = e.lutadores;
  avancar(e, [BOTAO.SOCO, 0]);
  rodar(e, 20);
  assert.equal(b.vida, FICHAS.vegetal.vida, 'de longe não acerta');
  b.x = a.x + 26 * SUB;
  avancar(e, [BOTAO.SOCO, 0]);
  rodar(e, 20);
  assert.ok(b.vida < FICHAS.vegetal.vida, 'de perto acerta');
  assert.ok(a.ki > KI_INICIAL);
  assert.ok(b.impactoEm > 0);
});

test('segurar para trás defende o golpe médio em pé; o baixo só agachado', () => {
  const e = aoLutar(luta());
  const [a, b] = e.lutadores;
  b.x = a.x + 26 * SUB;
  // b olha para a esquerda: trás dele é a DIREITA
  avancar(e, [BOTAO.SOCO, BOTAO.DIREITA]);
  rodar(e, 12, 0, BOTAO.DIREITA);
  assert.equal(b.vida, FICHAS.vegetal.vida);
  assert.equal(b.impactoTipo, 3);
  rodar(e, 40);
  b.x = a.x + 30 * SUB;
  // rasteira contra quem defende em pé: entra
  avancar(e, [BOTAO.BAIXO | BOTAO.CHUTE, BOTAO.DIREITA]);
  rodar(e, 16, BOTAO.BAIXO, BOTAO.DIREITA);
  assert.ok(b.vida < FICHAS.vegetal.vida, 'a rasteira passa por baixo da guarda alta');
});

test('a sequência de socos encadeia no acerto, e não no vazio', () => {
  const e = aoLutar(luta());
  const [a, b] = e.lutadores;
  const socoEmCadaQuadro = (n: number) => { for (let i = 0; i < n; i++) avancar(e, [i % 2 ? 0 : BOTAO.SOCO, 0]); };
  socoEmCadaQuadro(30);
  assert.notEqual(a.acao, 'soco3', 'no vazio não chega ao terceiro');
  rodar(e, 40);
  b.x = a.x + 26 * SUB;
  const vistos = new Set<string>();
  for (let i = 0; i < 60; i++) { avancar(e, [i % 2 ? 0 : BOTAO.SOCO, 0]); vistos.add(a.acao); }
  assert.ok(vistos.has('soco2') && vistos.has('soco3'), [...vistos].join(','));
});

test('rajada custa ki, voa e acerta; sem ki não sai', () => {
  const e = aoLutar(luta());
  const [a, b] = e.lutadores;
  const ki = a.ki;
  avancar(e, [BOTAO.RAJADA, 0]);
  rodar(e, 20);
  assert.equal(a.ki, ki - FICHAS.goiaba.rajada.custo);
  assert.equal(e.projeteis.length, 1);
  rodar(e, 60);
  assert.ok(b.vida < FICHAS.vegetal.vida);
  a.ki = 0;
  rodar(e, 60);
  avancar(e, [BOTAO.RAJADA, 0]);
  assert.equal(a.acao === 'rajada', false);
});

test('a super gasta três barras, congela a tela no clarão e derruba', () => {
  const e = aoLutar(luta());
  const [a, b] = e.lutadores;
  a.ki = 300;
  avancar(e, [BOTAO.BAIXO | BOTAO.ESPECIAL, 0]);
  assert.equal(a.acao, 'super');
  assert.equal(a.ki, 0);
  assert.ok(e.clarao > 0);
  const xDoOutro = b.x;
  rodar(e, 30, 0, BOTAO.ESQUERDA);
  assert.equal(b.x, xDoOutro, 'no clarão o outro não anda');
  rodar(e, 200);
  assert.ok(b.vida < FICHAS.vegetal.vida - 150, `vida ${b.vida}`);
  assert.ok(['voando', 'caido', 'levantando'].includes(b.acao) || b.vida < 700, `a última batida derruba (${b.acao})`);
});

test('sumir aparece nas costas do outro', () => {
  const e = aoLutar(luta());
  const [a, b] = e.lutadores;
  avancar(e, [BOTAO.SUMIR, 0]);
  assert.equal(a.acao, 'sumindo');
  rodar(e, 20);
  assert.ok(a.x > b.x, 'passou para o outro lado');
  assert.equal(a.lado, -1);
});

test('corpo não atravessa corpo, e ninguém sai do mundo', () => {
  const e = aoLutar(luta());
  rodar(e, 200, BOTAO.DIREITA, BOTAO.ESQUERDA);
  const [a, b] = e.lutadores;
  assert.ok(b.x > a.x);
  const ca = caixaDoCorpo(a), cb = caixaDoCorpo(b);
  assert.ok(ca[2] <= cb[0] + 1);
  rodar(e, 600, BOTAO.ESQUERDA, BOTAO.DIREITA);
  assert.ok(a.x >= 12 * SUB && b.x <= (640 - 12) * SUB);
  assert.ok(b.x - a.x <= (384 - 40) * SUB);
});

test('nocaute encerra o round, soma a vitória e a luta acaba no número de rounds', () => {
  const e = aoLutar(luta(2));
  const [a, b] = e.lutadores;
  b.vida = 1;
  b.x = a.x + 26 * SUB;
  avancar(e, [BOTAO.SOCO, 0]);
  rodar(e, 10);
  assert.equal(e.fase, 'nocaute');
  rodar(e, DURACAO.nocaute + 5);
  assert.equal(e.fase, 'fimDoRound');
  assert.equal(a.vitorias, 1);
  rodar(e, DURACAO.fimDoRound + 2);
  assert.equal(e.fase, 'apresentacao');
  assert.equal(e.round, 2);
  assert.equal(b.vida, FICHAS.vegetal.vida);
  aoLutar(e);
  b.vida = 1;
  b.x = a.x + 26 * SUB;
  avancar(e, [BOTAO.SOCO, 0]);
  rodar(e, DURACAO.nocaute + DURACAO.fimDoRound + 20);
  assert.equal(e.fase, 'fimDaLuta');
  assert.equal(e.vencedor, 0);
});

test('o relógio zerado dá a vitória a quem tem mais vida', () => {
  const e = aoLutar(luta(1));
  e.tempo = 3;
  e.lutadores[0].vida = 500;
  rodar(e, 5);
  assert.equal(e.fase, 'tempo');
  rodar(e, DURACAO.tempo + DURACAO.fimDoRound + 5);
  assert.equal(e.fase, 'fimDaLuta');
  assert.equal(e.vencedor, 1);
});

test('transformar pede ki, grita e vira; apanhar no meio perde a transformação', () => {
  const e = aoLutar(luta());
  const [a, b] = e.lutadores;
  a.ki = 100;
  avancar(e, [BOTAO.TRANSFORMAR, 0]);
  assert.notEqual(a.acao, 'transformando', 'sem ki suficiente não transforma');
  a.ki = 200;
  avancar(e, [0, 0]);
  avancar(e, [BOTAO.TRANSFORMAR, 0]);
  assert.equal(a.acao, 'transformando');
  assert.equal(a.ki, 200 - TRANSFORMACAO.custo);
  // o outro chega e bate no meio do grito
  b.x = a.x + 30 * SUB * 1.5;
  for (let i = 0; i < 20; i++) avancar(e, [0, i % 2 ? 0 : BOTAO.SOCO]);
  assert.equal(a.forma, 0, 'interrompido não transforma');
  assert.notEqual(a.acao, 'transformando');
});

test('transformado bate mais forte, o ki escoa e, zerando, volta ao normal', () => {
  const e = aoLutar(luta());
  const [a, b] = e.lutadores;
  a.ki = 300;
  avancar(e, [BOTAO.TRANSFORMAR, 0]);
  rodar(e, TRANSFORMACAO.duracao + 40);
  assert.equal(a.forma, 1);
  assert.ok(a.formaDesde > 0);
  // dano de um soco transformado contra o de um soco normal
  const socoNoOutro = (forma: 0 | 1) => {
    const x = aoLutar(luta());
    x.lutadores[0].forma = forma;
    x.lutadores[1].x = x.lutadores[0].x + 40 * SUB;
    avancar(x, [BOTAO.SOCO, 0]);
    rodar(x, 20);
    return FICHAS.vegetal.vida - x.lutadores[1].vida;
  };
  assert.ok(socoNoOutro(1) > socoNoOutro(0), `${socoNoOutro(1)} × ${socoNoOutro(0)}`);
  a.ki = 3;
  rodar(e, TRANSFORMACAO.escoamento * 4);
  assert.equal(a.ki, 0);
  assert.equal(a.forma, 0);
  // e round novo começa na forma de sempre
  a.forma = 1;
  b.vida = 1;
  b.x = a.x + 40 * SUB;
  avancar(e, [BOTAO.SOCO, 0]);
  rodar(e, DURACAO.nocaute + DURACAO.fimDoRound + 10);
  assert.equal(e.round, 2);
  assert.equal(a.forma, 0);
});

test('desempenho: avançar e clonar cabem folgados num quadro', () => {
  const lista = entradas(10_000, 3);
  const e = luta();
  const t0 = performance.now();
  for (const ent of lista) { avancar(e, ent); clonar(e); }
  const ms = performance.now() - t0;
  assert.ok(ms < 2000, `${ms.toFixed(0)} ms para 10.000 quadros`);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APAGAO, ATE_CAIR, BALCOES, CAIDO, DURACAO_DA_FESTA, FLIPERAMAS, Garagem, LIMITE_DA_BARRIGA, MESA, REUNIR, ROTEIRO,
  aparenciaDe, bloqueado, comidaDe, faseDaFesta, legendaEm, lugaresDaFesta, nomesNoTelao, obstaculosDa, planejar, soltar, temasDa,
  type Aniversariante, type LeituraDaGaragem, type PessoaNaGaragem,
} from './garagem.ts';

const pessoa = (id: number, x: number, y: number, extra: Partial<PessoaNaGaragem> = {}): PessoaNaGaragem => ({
  id, nome: `p${id}`, x, y, alvo: null, dir: 'baixo', cheio: 0, goles: 0, ultimo: null, quedas: 0, jogando: null, ...extra,
});
const TAVAO: Aniversariante = { id: 24, nome: 'Tavão', tema: 'moto' };
const DONIS: Aniversariante = { id: 30, nome: 'Donis', tema: 'carro' };
const leitura = (agora: number, pessoas: PessoaNaGaragem[], parabens: number | null = null, aniversariantes = [TAVAO, DONIS]): LeituraDaGaragem => ({
  agora, podeCantar: false, parabens: parabens === null ? null : { inicio: parabens, aniversariantes }, pessoas,
});
/** Anda a garagem `s` segundos, de 1/60 em 1/60, com o relógio daqui andando junto. */
function andarPor(g: Garagem, s: number, desde: number) {
  let t = desde;
  for (let i = 0; i < Math.round(s * 60); i++) { t += 1000 / 60; g.passo(1 / 60, t); }
  return t;
}

test('o caminho contorna a peça do tema, e nenhum ponto dele cai dentro de um móvel', () => {
  const obst = obstaculosDa(false);
  const rota = planejar({ x: 55, y: 125 }, { x: 55, y: 170 }, obst);
  assert.ok(rota.length > 1, 'devia passar por um canto da peça da esquerda');
  let de = { x: 55, y: 125 };
  for (const p of rota) {
    for (let k = 0; k <= 20; k++) {
      const x = de.x + (p.x - de.x) * k / 20, y = de.y + (p.y - de.y) * k / 20;
      assert.equal(bloqueado(x, y, obst), false, `passou por dentro em ${x},${y}`);
    }
    de = p;
  }
});

test('clicar em cima de um móvel leva para a beira dele, e fora da sala volta para dentro', () => {
  const obst = obstaculosDa(true);
  const q = soltar({ x: 160, y: 100 }, obst);
  assert.equal(bloqueado(q.x, q.y, obst), false);
  assert.deepEqual(soltar({ x: -40, y: 900 }, obst), { x: 8, y: 176 });
});

test('o lugar de parar em cada balcão e fliperama é chão livre', () => {
  const obst = obstaculosDa(true);
  for (const k of [...BALCOES, ...FLIPERAMAS]) assert.equal(bloqueado(k.para.x, k.para.y, obst), false, `${k.para.x},${k.para.y}`);
});

test('a festa: junta, canta, fica montada e some — e cabe no tempo que o servidor espera', () => {
  assert.equal(faseDaFesta(null), null);
  assert.equal(faseDaFesta(-1), null);
  assert.equal(faseDaFesta(1)?.fase, 'reunindo');
  assert.equal(faseDaFesta(REUNIR + 1)?.fase, 'cantando');
  assert.equal(faseDaFesta(REUNIR + ROTEIRO.fim + 1)?.fase, 'montada');
  assert.equal(faseDaFesta(DURACAO_DA_FESTA + 0.1), null);
  // garagem.mjs: DURACAO_DO_PARABENS = 40 s. Mais curto que a festa, o dono recomeçaria no meio dela.
  assert.ok(DURACAO_DA_FESTA < 40, `a festa dura ${DURACAO_DA_FESTA} s`);
  assert.ok(ROTEIRO.ratimbum < ROTEIRO.fim);
});

test('na festa, quem faz aniversário vai para trás da mesa e o resto para a frente, igual em toda tela', () => {
  const gente = [{ id: 9 }, { id: 24 }, { id: 1 }, { id: 30 }];
  const a = lugaresDaFesta(gente, [TAVAO, DONIS]);
  const b = lugaresDaFesta([...gente].reverse(), [TAVAO, DONIS]);
  assert.deepEqual([...a.entries()].sort(), [...b.entries()].sort(), 'a ordem de chegada não muda o lugar');
  const tavao = a.get(24)!, donis = a.get(30)!;
  assert.ok(tavao.ponto.y < MESA.frente && donis.ponto.y < MESA.frente, 'os dois atrás da mesa');
  assert.ok(tavao.ponto.x < 160 && donis.ponto.x > 160, 'o primeiro à esquerda do bolo, o segundo à direita');
  for (const id of [1, 9]) {
    assert.ok(a.get(id)!.ponto.y > MESA.base, 'a turma na frente');
    assert.equal(a.get(id)!.olhar, 'cima');
  }
  const obst = obstaculosDa(true);
  for (const { ponto } of a.values()) assert.equal(bloqueado(ponto.x, ponto.y, obst), false);
});

test('um aniversariante só fica no meio, atrás do bolo; quem não está na garagem não ocupa lugar', () => {
  const a = lugaresDaFesta([{ id: 24 }, { id: 9 }], [TAVAO]);
  assert.equal(a.get(24)!.ponto.x, 160);
  assert.ok(a.get(24)!.ponto.y < MESA.frente);
  const b = lugaresDaFesta([{ id: 9 }, { id: 1 }], [TAVAO, DONIS]);
  assert.equal(b.size, 2);
  for (const l of b.values()) assert.equal(l.olhar, 'cima');
});

test('o tema de cada lado: o do primeiro à esquerda, o do segundo à direita; um só, a garagem inteira', () => {
  assert.deepEqual(temasDa([]), ['moto', 'moto']);
  assert.deepEqual(temasDa([{ ...TAVAO, tema: 'pc' }]), ['pc', 'pc']);
  assert.deepEqual(temasDa([TAVAO, DONIS]), ['moto', 'carro']);
  assert.equal(nomesNoTelao([TAVAO, DONIS]), 'TAVÃO & DONIS');
});

test('o grito depois do rá-tim-bum diz o nome de quem faz aniversário', () => {
  const grito = ROTEIRO.legendas.find((l) => l.nomes)!;
  assert.equal(legendaEm(grito.ini + 0.1, [TAVAO, DONIS])?.texto, 'TAVÃO! DONIS!');
  assert.equal(legendaEm(grito.ini + 0.1, [{ id: 3, nome: 'Bia', tema: 'jogos' }])?.texto, 'BIA!');
  assert.equal(legendaEm(0.01, [TAVAO]), null, 'antes da primeira nota, nada');
});

test('ninguém escolhe o boneco: a cara sai da conta, a mesma toda vez; a roupa de festa é por cima', () => {
  assert.deepEqual(aparenciaDe(7), aparenciaDe(7));
  const festa = aparenciaDe(7, { tema: 'carro', lado: 1 });
  assert.equal(festa.pele, aparenciaDe(7).pele, 'a cara continua a da pessoa');
  assert.deepEqual(festa.roupa, { tema: 'carro', lado: 1 });
  const caras = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((id) => JSON.stringify(aparenciaDe(id))));
  assert.ok(caras.size >= 6, 'oito pessoas não podem sair quase todas iguais');
});

test('beber até o sexto: a sua tela apaga 1 s, o boneco cai e a barriga zera', () => {
  const g = new Garagem(1, 'TKP', { x: BALCOES[0].para.x, y: BALCOES[0].para.y });
  let t = 0;
  for (let i = 0; i < LIMITE_DA_BARRIGA; i++) {
    g.clicar({ x: 30, y: 80 });
    t = andarPor(g, 1, t);
  }
  const ocorreu = g.colher().map((o) => o.tipo);
  assert.equal(ocorreu.filter((o) => o === 'consumo').length, LIMITE_DA_BARRIGA);
  assert.ok(ocorreu.includes('desmaio'));
  assert.equal(g.eu.cheio, 0);
  assert.equal(g.eu.quedas, 1);
  assert.ok(g.eu.caido > 0);
  // caído, clicar não leva a lugar nenhum
  g.clicar({ x: 200, y: 150 });
  assert.equal(g.eu.rota.length, 0);
  t = andarPor(g, APAGAO + 0.5, t);
  assert.equal(g.apagao, -1, 'a tela volta');
  t = andarPor(g, CAIDO, t);
  assert.equal(g.eu.caido, 0, 'e o boneco levanta');
  assert.ok(ATE_CAIR < 1);
});

test('a água do bebedouro esvazia a barriga, e o que se pega no balcão é sorteado do cardápio dele', () => {
  const agua = BALCOES.find((b) => b.id === 'agua')!;
  const g = new Garagem(1, 'TKP', { x: agua.para.x, y: agua.para.y });
  g.eu.cheio = 3;
  g.clicar({ x: agua.x1 + 2, y: 80 });
  assert.equal(g.eu.cheio, 2);
  assert.equal(g.eu.ultimo, 'agua');
  g.eu.cheio = 0;
  andarPor(g, 1, 0);
  g.clicar({ x: agua.x1 + 2, y: 80 });
  assert.equal(g.eu.cheio, 0, 'não fica negativa');
  const salgados = BALCOES.find((b) => b.id === 'salgados')!;
  const h = new Garagem(2, 'Bia', { x: salgados.para.x, y: salgados.para.y });
  h.sortear = () => 1;
  h.clicar({ x: salgados.x1 + 2, y: 80 });
  assert.equal(h.eu.ultimo, salgados.itens[1]);
  // o app de antes mandava "beber" e "comer"
  assert.equal(comidaDe('beber'), 'cerveja');
  assert.equal(comidaDe('comer'), 'coxinha');
  assert.equal(comidaDe('veneno'), null);
});

test('o boneco dos outros anda até onde a leitura diz, e o gole e a queda dele tocam uma vez só', () => {
  const g = new Garagem(1, 'TKP');
  g.receber(leitura(1000, [pessoa(1, 160, 168), pessoa(5, 100, 120, { goles: 3, quedas: 1 })]), 0);
  assert.equal(g.colher().length, 0, 'a história de quem chegou não toca nada');
  g.receber(leitura(1400, [pessoa(1, 160, 168), pessoa(5, 100, 120, { alvo: { x: 120, y: 120 }, goles: 4, ultimo: 'pizza' })]), 400);
  const comeu = g.colher();
  assert.deepEqual(comeu.map((o) => o.tipo), ['consumo']);
  assert.equal(comeu[0].tipo === 'consumo' && comeu[0].comida, 'pizza');
  andarPor(g, 1, 400);
  const outro = g.bonecos.get(5)!;
  assert.ok(Math.abs(outro.x - 120) < 1 && Math.abs(outro.y - 120) < 1, `parou em ${outro.x},${outro.y}`);
  g.receber(leitura(1800, [pessoa(1, 160, 168), pessoa(5, 120, 120, { goles: 4, ultimo: 'pizza', quedas: 2 })]), 1400);
  assert.deepEqual(g.colher().map((o) => o.tipo), ['desmaio']);
  // leitura velha não desfaz nada, e quem sumiu da leitura sai da garagem
  g.receber(leitura(1500, []), 1500);
  assert.ok(g.bonecos.has(5));
  g.receber(leitura(2000, [pessoa(1, 160, 168)]), 2000);
  assert.equal(g.bonecos.has(5), false);
});

test('longe demais da posição que chegou, o boneco dos outros pula para ela', () => {
  const g = new Garagem(1, 'TKP');
  g.receber(leitura(1000, [pessoa(5, 40, 110)]), 0);
  g.receber(leitura(1400, [pessoa(5, 280, 170)]), 400);
  const b = g.bonecos.get(5)!;
  assert.deepEqual([b.x, b.y], [280, 170]);
});

test('o parabéns: todo mundo chega no lugar até a luz apagar, e a música começa na hora certa', () => {
  const g = new Garagem(1, 'TKP', { x: 30, y: 170 });
  const inicio = 50_000;
  // o relógio daqui está 2 s atrás do servidor: quem manda é o do servidor
  g.receber(leitura(inicio + 100, [pessoa(1, 30, 170), pessoa(24, 300, 175), pessoa(30, 20, 110)], inicio), inicio + 100 - 2000);
  let t = andarPor(g, REUNIR - 0.2, inicio - 1900);
  const ocorreu = g.colher().map((o) => o.tipo);
  assert.ok(ocorreu.includes('mesa'));
  assert.ok(!ocorreu.includes('canto'), 'ainda não');
  const lugares = lugaresDaFesta([...g.bonecos.values()], [TAVAO, DONIS]);
  for (const b of g.bonecos.values()) {
    const l = lugares.get(b.id)!;
    assert.ok(Math.hypot(b.x - l.ponto.x, b.y - l.ponto.y) < 1, `${b.nome} chegou em ${b.x},${b.y}, longe de ${l.ponto.x},${l.ponto.y}`);
  }
  assert.ok(g.eu.chapeu, 'chapéu de festa');
  assert.deepEqual(g.bonecos.get(30)!.aparencia.roupa, { tema: 'carro', lado: 1 }, 'quem faz aniversário veste o tema dele');
  assert.equal(g.eu.aparencia.roupa, null);
  // ninguém mexe no próprio boneco no meio da festa
  g.clicar({ x: 200, y: 160 });
  assert.equal(g.eu.rota.length, 0);
  t = andarPor(g, 0.4, t);
  const canto = g.colher().find((o) => o.tipo === 'canto');
  assert.ok(canto && canto.tipo === 'canto' && canto.aPartirDe < 0.5);
  t = andarPor(g, ROTEIRO.ratimbum + 0.1, t);
  assert.ok(g.colher().some((o) => o.tipo === 'ratimbum'));
  assert.equal(g.velas, false);
  t = andarPor(g, ROTEIRO.fim - ROTEIRO.ratimbum, t);
  assert.ok(g.colher().some((o) => o.tipo === 'fimDoCanto'));
  assert.equal(g.festa?.fase, 'montada');
  assert.equal(g.eu.chapeu, false);
  andarPor(g, DURACAO_DA_FESTA, t);
  assert.equal(g.festa, null);
  assert.equal(g.mesaNaTela, false);
  assert.equal(g.bonecos.get(30)!.aparencia.roupa, null, 'acabou a festa, a roupa sai');
});

test('quem abre a garagem com a música tocando já aparece no lugar', () => {
  const g = new Garagem(1, 'TKP', { x: 30, y: 170 });
  const inicio = 10_000;
  const agora = inicio + (REUNIR + 5) * 1000;
  g.receber(leitura(agora, [pessoa(1, 30, 170), pessoa(24, 300, 175)], inicio), agora);
  g.passo(1 / 60, agora);
  const canto = g.colher().find((o) => o.tipo === 'canto');
  assert.ok(canto && canto.tipo === 'canto' && Math.abs(canto.aPartirDe - 5) < 0.1, 'a música começa do meio');
  const l = lugaresDaFesta([...g.bonecos.values()], [TAVAO, DONIS]).get(24)!;
  const tava = g.bonecos.get(24)!;
  assert.deepEqual([tava.x, tava.y], [l.ponto.x, l.ponto.y]);
});

test('o que o app manda do seu boneco: onde está, para onde vai, a barriga e o fliperama', () => {
  const g = new Garagem(1, 'TKP', { x: 160, y: 168 });
  g.clicar({ x: 200, y: 130 });
  assert.equal(g.mudouMeuAlvo, true);
  const meu = g.meuBoneco();
  assert.deepEqual([meu.x, meu.y], [160, 168]);
  assert.deepEqual(meu.alvo, { x: 200, y: 130 });
  assert.equal(meu.cheio, 0);
  assert.equal(meu.jogando, null);
});

test('sem porta: quem abre a garagem já está dentro, com a própria cara', () => {
  const g = new Garagem(1, 'Juninho');
  assert.ok(g.bonecos.has(1));
  assert.equal(g.eu.aparencia.roupa, null);
  g.receber(leitura(1000, [pessoa(1, 50, 120), pessoa(5, 100, 120)]), 0);
  assert.ok(g.bonecos.has(1) && g.bonecos.has(5));
});

test('o fliperama: vai até ele, joga, e quem chega com ele ocupado não joga', () => {
  const k = FLIPERAMAS[0];
  const g = new Garagem(1, 'TKP', { x: 160, y: 140 });
  assert.equal(g.clicar({ x: k.x1 + 3, y: 70 }), 'fliperama');
  andarPor(g, 3, 0);
  assert.equal(g.eu.jogando, 0);
  assert.equal(g.meuBoneco().jogando, 0);
  assert.ok(g.colher().some((o) => o.tipo === 'fliperama' && o.qual === 0));
  g.sairDoFliperama();
  assert.equal(g.eu.jogando, null);
  // o outro fliperama já tem gente
  const j = FLIPERAMAS[1];
  const h = new Garagem(2, 'Juninho', { x: j.para.x, y: j.para.y });
  h.receber(leitura(1000, [pessoa(2, j.para.x, j.para.y), pessoa(7, j.para.x - 1, j.para.y, { jogando: 1 })]), 0);
  h.clicar({ x: j.x1 + 3, y: 70 });
  andarPor(h, 2, 0);
  assert.equal(h.eu.jogando, null);
  assert.ok(h.colher().some((o) => o.tipo === 'ocupado'));
});

test('a festa tira todo mundo do fliperama', () => {
  const k = FLIPERAMAS[0];
  const g = new Garagem(1, 'TKP', { x: k.para.x, y: k.para.y });
  g.clicar({ x: k.x1 + 3, y: 70 });
  assert.equal(g.eu.jogando, 0);
  g.receber(leitura(5000, [pessoa(1, k.para.x, k.para.y, { jogando: 0 })], 5000), 5000);
  g.passo(1 / 60, 5000);
  assert.equal(g.eu.jogando, null);
});

test('depois do canto, a mesa serve bolo', () => {
  const g = new Garagem(1, 'TKP', { x: 160, y: 116 });
  const inicio = 1000;
  const agora = inicio + (REUNIR + ROTEIRO.fim + 1) * 1000;
  g.receber(leitura(agora, [pessoa(1, 160, 116)], inicio), agora);
  g.passo(1 / 60, agora);
  assert.equal(g.festa?.fase, 'montada');
  g.clicar({ x: 160, y: 80 });
  andarPor(g, 2, agora);
  assert.equal(g.eu.ultimo, 'bolo');
});

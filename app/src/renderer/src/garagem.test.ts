import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APAGAO, ATE_CAIR, BALCOES, CAIDO, DURACAO_DA_FESTA, Garagem, LIMITE_DA_BARRIGA, MESA, REUNIR, ROTEIRO,
  aparenciaDe, bloqueado, faseDaFesta, lugaresDaFesta, obstaculosDa, papeisOcupados, planejar, soltar,
  type LeituraDaGaragem, type PessoaNaGaragem,
} from './garagem.ts';

const pessoa = (id: number, x: number, y: number, extra: Partial<PessoaNaGaragem> = {}): PessoaNaGaragem => ({
  id, nome: `p${id}`, moto: null, x, y, alvo: null, papel: 'outro', dir: 'baixo', cheio: 0, goles: 0, ultimo: null, quedas: 0, ...extra,
});
const leitura = (agora: number, pessoas: PessoaNaGaragem[], parabens: number | null = null): LeituraDaGaragem => ({
  agora, podeCantar: false, parabens: parabens === null ? null : { inicio: parabens }, pessoas,
});
/** Anda a garagem `s` segundos, de 1/60 em 1/60, com o relógio daqui andando junto. */
function andarPor(g: Garagem, s: number, desde: number) {
  let t = desde;
  for (let i = 0; i < Math.round(s * 60); i++) { t += 1000 / 60; g.passo(1 / 60, t); }
  return t;
}

test('o caminho contorna a moto, e nenhum ponto dele cai dentro de um móvel', () => {
  const obst = obstaculosDa(false);
  const rota = planejar({ x: 55, y: 125 }, { x: 55, y: 170 }, obst);
  assert.ok(rota.length > 1, 'devia passar por um canto da Harley');
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

test('na festa, a Harley e a Sahara vão para trás da mesa e o resto para a frente, igual em toda tela', () => {
  const gente = [{ id: 9, moto: null }, { id: 24, moto: 'harley' as const }, { id: 1, moto: null }, { id: 30, moto: 'sahara' as const }];
  const a = lugaresDaFesta(gente);
  const b = lugaresDaFesta([...gente].reverse());
  assert.deepEqual([...a.entries()].sort(), [...b.entries()].sort(), 'a ordem de chegada não muda o lugar');
  const harley = a.get(24)!, sahara = a.get(30)!;
  assert.ok(harley.ponto.y < MESA.frente && sahara.ponto.y < MESA.frente, 'os dois atrás da mesa');
  assert.ok(harley.ponto.x < 160 && sahara.ponto.x > 160, 'Harley à esquerda do bolo, Sahara à direita');
  for (const id of [1, 9]) {
    assert.ok(a.get(id)!.ponto.y > MESA.base, 'a turma na frente');
    assert.equal(a.get(id)!.olhar, 'cima');
  }
  const obst = obstaculosDa(true);
  for (const { ponto } of a.values()) assert.equal(bloqueado(ponto.x, ponto.y, obst), false);
});

test('ninguém escolhe o boneco: a cara sai da conta, a mesma toda vez', () => {
  assert.deepEqual(aparenciaDe(7, null), aparenciaDe(7, null));
  assert.equal(aparenciaDe(24, 'harley').estilo, 'harley');
  assert.equal(aparenciaDe(30, 'sahara').estilo, 'sahara');
  const caras = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((id) => JSON.stringify(aparenciaDe(id, null))));
  assert.ok(caras.size >= 6, 'oito pessoas não podem sair quase todas iguais');
});

test('beber até o sexto: a sua tela apaga 1 s, o boneco cai e a barriga zera', () => {
  const g = new Garagem(1, 'TKP', { x: BALCOES[0].para.x, y: BALCOES[0].para.y }).entrar('outro');
  let t = 0;
  for (let i = 0; i < LIMITE_DA_BARRIGA; i++) {
    g.clicar({ x: 30, y: 80 });
    t = andarPor(g, 1, t);
  }
  const ocorreu = g.colher().map((o) => o.tipo);
  assert.equal(ocorreu.filter((o) => o === 'gole').length, LIMITE_DA_BARRIGA);
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

test('o boneco dos outros anda até onde a leitura diz, e o gole e a queda dele tocam uma vez só', () => {
  const g = new Garagem(1, 'TKP');
  g.receber(leitura(1000, [pessoa(1, 160, 168), pessoa(5, 100, 120, { goles: 3, quedas: 1 })]), 0);
  assert.equal(g.colher().length, 0, 'a história de quem chegou não toca nada');
  g.receber(leitura(1400, [pessoa(1, 160, 168), pessoa(5, 100, 120, { alvo: { x: 120, y: 120 }, goles: 4, ultimo: 'comer' })]), 400);
  assert.deepEqual(g.colher().map((o) => o.tipo), ['mordida']);
  andarPor(g, 1, 400);
  const outro = g.bonecos.get(5)!;
  assert.ok(Math.abs(outro.x - 120) < 1 && Math.abs(outro.y - 120) < 1, `parou em ${outro.x},${outro.y}`);
  g.receber(leitura(1800, [pessoa(1, 160, 168), pessoa(5, 120, 120, { goles: 4, ultimo: 'comer', quedas: 2 })]), 1400);
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
  const g = new Garagem(1, 'TKP', { x: 30, y: 170 }).entrar('outro');
  const inicio = 50_000;
  // o relógio daqui está 2 s atrás do servidor: quem manda é o do servidor
  g.receber(leitura(inicio + 100, [pessoa(1, 30, 170), pessoa(24, 300, 175, { moto: 'harley', papel: 'tavao' }), pessoa(30, 20, 110, { moto: 'sahara', papel: 'donis' })], inicio), inicio + 100 - 2000);
  let t = andarPor(g, REUNIR - 0.2, inicio - 1900);
  const ocorreu = g.colher().map((o) => o.tipo);
  assert.ok(ocorreu.includes('mesa'));
  assert.ok(!ocorreu.includes('canto'), 'ainda não');
  const lugares = lugaresDaFesta([...g.bonecos.values()]);
  for (const b of g.bonecos.values()) {
    const l = lugares.get(b.id)!;
    assert.ok(Math.hypot(b.x - l.ponto.x, b.y - l.ponto.y) < 1, `${b.nome} chegou em ${b.x},${b.y}, longe de ${l.ponto.x},${l.ponto.y}`);
  }
  assert.ok(g.eu.chapeu, 'chapéu de festa');
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
});

test('quem abre a garagem com a música tocando já aparece no lugar', () => {
  const g = new Garagem(1, 'TKP', { x: 30, y: 170 }).entrar('outro');
  const inicio = 10_000;
  const agora = inicio + (REUNIR + 5) * 1000;
  g.receber(leitura(agora, [pessoa(1, 30, 170), pessoa(24, 300, 175, { moto: 'harley', papel: 'tavao' })], inicio), agora);
  g.passo(1 / 60, agora);
  const canto = g.colher().find((o) => o.tipo === 'canto');
  assert.ok(canto && canto.tipo === 'canto' && Math.abs(canto.aPartirDe - 5) < 0.1, 'a música começa do meio');
  const l = lugaresDaFesta([...g.bonecos.values()]).get(24)!;
  const tava = g.bonecos.get(24)!;
  assert.deepEqual([tava.x, tava.y], [l.ponto.x, l.ponto.y]);
});

test('o que o app manda do seu boneco: onde está, para onde vai e a barriga', () => {
  const g = new Garagem(1, 'TKP', { x: 160, y: 168 }).entrar('outro');
  g.clicar({ x: 200, y: 130 });
  assert.equal(g.mudouMeuAlvo, true);
  const meu = g.meuBoneco();
  assert.deepEqual([meu.x, meu.y], [160, 168]);
  assert.deepEqual(meu.alvo, { x: 200, y: 130 });
  assert.equal(meu.cheio, 0);
  assert.equal(meu.papel, 'outro');
});

test('na porta você só olha: sem boneco e sem clique, até escolher quem é', () => {
  const g = new Garagem(1, 'Juninho');
  g.receber(leitura(1000, [pessoa(1, 50, 120), pessoa(5, 100, 120)]), 0);
  assert.equal(g.bonecos.has(1), false, 'o servidor ainda lembrava de você, e o boneco não voltou');
  assert.ok(g.bonecos.has(5));
  g.clicar({ x: 200, y: 130 });
  assert.equal(g.eu.rota.length, 0);
  g.entrar('donis');
  assert.ok(g.bonecos.has(1));
  assert.equal(g.eu.aparencia.estilo, 'sahara');
  assert.equal(g.meuBoneco().papel, 'donis');
  g.voltarParaAPorta();
  assert.equal(g.bonecos.has(1), false);
});

test('a porta mostra quem já pegou o Tavão e o Donis — sem contar você', () => {
  const gente = [pessoa(2, 1, 1, { papel: 'tavao', nome: 'Tava1' }), pessoa(3, 1, 1, { papel: 'outro' }), pessoa(1, 1, 1, { papel: 'donis', nome: 'eu' })];
  assert.deepEqual(papeisOcupados(gente, 1), { tavao: 'Tava1', donis: null });
  assert.deepEqual(papeisOcupados([], 1), { tavao: null, donis: null });
});

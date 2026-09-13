import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandeiraDaVez, DURACAO_DO_AVISO_DE_CORTE } from './bandeiras.ts';
import { criarCronometro, escreverIntervalo, intervalo, registrar } from './cronometro.ts';

const VOLTA = 14_000;
const eu = (progresso: number, extra = {}) => ({ nome: 'TKP', progresso, velocidade: 300, chegouEm: null, corteEm: null, punicao: 0, ...extra });
const outro = (nome: string, progresso: number, velocidade = 300, chegouEm: number | null = null) => ({ nome, progresso, velocidade, chegouEm });

test('a verde só na largada, e antes das luzes não há bandeira nenhuma', () => {
  assert.equal(bandeiraDaVez({ tempo: -2000, volta: VOLTA, eu: eu(-100), outros: [] }), null);
  assert.equal(bandeiraDaVez({ tempo: 800, volta: VOLTA, eu: eu(50), outros: [] })?.tipo, 'verde');
  assert.equal(bandeiraDaVez({ tempo: 20_000, volta: VOLTA, eu: eu(5000), outros: [] }), null);
});

test('a preta e branca aparece por uns segundos depois do corte, com o total quando há mais de um', () => {
  const b = bandeiraDaVez({ tempo: 30_000, volta: VOLTA, eu: eu(9000, { corteEm: 29_000, punicao: 6000 }), outros: [] });
  assert.equal(b?.tipo, 'pretaebranca');
  assert.match(b!.texto, /\+3 s no seu tempo · 6 s no total/);
  assert.equal(bandeiraDaVez({ tempo: 29_000 + DURACAO_DO_AVISO_DE_CORTE + 1, volta: VOLTA, eu: eu(9000, { corteEm: 29_000, punicao: 3000 }), outros: [] }), null);
});

test('a amarela é de carro parado À FRENTE; parado atrás não interessa, e na largada ninguém é parado', () => {
  const parado = outro('Juninho', 6000, 10);
  assert.equal(bandeiraDaVez({ tempo: 40_000, volta: VOLTA, eu: eu(5000), outros: [parado] })?.tipo, 'amarela');
  assert.equal(bandeiraDaVez({ tempo: 40_000, volta: VOLTA, eu: eu(6500), outros: [parado] }), null);
  // uma volta à frente e parado logo adiante na pista também é à frente
  assert.equal(bandeiraDaVez({ tempo: 40_000, volta: VOLTA, eu: eu(5000), outros: [outro('Junio', 6000 + VOLTA, 0)] })?.tipo, 'amarela');
  assert.equal(bandeiraDaVez({ tempo: 2000, volta: VOLTA, eu: eu(100), outros: [outro('Junio', 300, 0)] })?.tipo, 'verde');
  // quem assiste vê a amarela de qualquer carro parado
  assert.match(bandeiraDaVez({ tempo: 40_000, volta: VOLTA, eu: null, outros: [parado] })!.texto, /Juninho parado na pista/);
});

test('a azul é para quem vai tomar volta: o líder logo atrás na pista, uma volta à frente na corrida', () => {
  const lider = outro('Blankito', 5000 - 200 + VOLTA);
  const b = bandeiraDaVez({ tempo: 60_000, volta: VOLTA, eu: eu(5000), outros: [lider] });
  assert.equal(b?.tipo, 'azul');
  assert.match(b!.texto, /Blankito vai te dar uma volta/);
  // logo atrás mas na mesma volta: é briga, não azul
  assert.equal(bandeiraDaVez({ tempo: 60_000, volta: VOLTA, eu: eu(5000), outros: [outro('Tava1', 4800)] }), null);
});

test('a quadriculada vence tudo: para quem chegou, e para quem assiste quando o líder chegou', () => {
  const parado = outro('Juninho', 6000, 0);
  assert.equal(bandeiraDaVez({ tempo: 90_000, volta: VOLTA, eu: eu(3 * VOLTA, { chegouEm: 89_000, corteEm: 89_500 }), outros: [parado] })?.tipo, 'quadriculada');
  assert.equal(bandeiraDaVez({ tempo: 90_000, volta: VOLTA, eu: null, outros: [outro('Blankito', 3 * VOLTA, 200, 88_000)] })?.tipo, 'quadriculada');
});

test('cronômetro: a diferença é a da última marca que os dois passaram', () => {
  const c = criarCronometro();
  // o líder passa pelas marcas antes
  for (let t = 0; t <= 10_000; t += 50) {
    registrar(c, 1, t * 0.4, t);
    registrar(c, 2, t * 0.4 - 360, t);
  }
  // 360 de distância a 400 por segundo: 0,9 s
  assert.equal(intervalo(c, 2, 1), 900);
  assert.equal(escreverIntervalo(intervalo(c, 2, 1), 0), '+0,9');
  assert.equal(intervalo(c, 3, 1), null);
  // andar para trás não apaga as marcas
  registrar(c, 2, 10, 20_000);
  assert.equal(intervalo(c, 2, 1), 900);
  assert.equal(escreverIntervalo(null, 1), '+1 volta');
  assert.equal(escreverIntervalo(1200, 2), '+2 voltas');
});

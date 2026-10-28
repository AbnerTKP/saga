import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPO, Navinha, PONTOS, VIDAS, entraNoPlacar, type Comandos } from './navinha.ts';

const parado: Comandos = { esq: false, dir: false, atirar: false, mirarX: null };
/** Um acaso que não muda: o teste é repetível. */
const sempre = (v: number) => () => v;
function rodar(n: Navinha, s: number, c: Comandos = parado) { for (let i = 0; i < Math.round(s * 60); i++) n.passo(1 / 60, c); }

test('começa esperando, e apertar o tiro começa a partida', () => {
  const n = new Navinha(sempre(0.99));
  assert.equal(n.fase, 'esperando');
  n.passo(1 / 60, { ...parado, atirar: true });
  assert.equal(n.fase, 'jogando');
  assert.equal(n.vidas, VIDAS);
  assert.ok(n.bichos.length > 20);
  assert.ok(n.colher().includes('comecou'));
});

test('a nave não sai do campo, e o mouse a leva até onde ele está', () => {
  const n = new Navinha(sempre(0.99));
  n.comecar();
  rodar(n, 3, { ...parado, esq: true });
  assert.ok(n.nave.x >= 7 && n.nave.x < 10);
  rodar(n, 3, { ...parado, mirarX: 100 });
  assert.ok(Math.abs(n.nave.x - 100) < 2, `parou em ${n.nave.x}`);
});

test('o tiro sobe, acerta o bicho e conta os pontos; no máximo dois tiros na tela', () => {
  const n = new Navinha(sempre(0.99));
  n.comecar();
  rodar(n, 1);
  // um soldado da fileira de baixo, bem em cima da nave (antes de o primeiro mergulho sair)
  const alvo = n.bichos.filter((b) => b.tipo === 2).sort((a, b) => b.y - a.y)[0];
  n.nave.x = alvo.x;
  n.bichos = [alvo];
  const antes = n.pontos;
  for (let i = 0; i < 50 && n.bichos.length; i++) {
    n.passo(1 / 60, { ...parado, atirar: true, mirarX: alvo.x });
    assert.ok(n.tiros.filter((k) => k.meu).length <= 2);
  }
  assert.equal(n.bichos.length, 0, 'acertou');
  assert.equal(n.pontos - antes, PONTOS[2]);
  assert.ok(n.colher().includes('explodiu'));
});

test('o comandante aguenta dois tiros', () => {
  const n = new Navinha(sempre(0.99));
  n.comecar();
  assert.equal(n.bichos.find((b) => b.tipo === 0)!.vida, 2);
});

test('levar tiro tira uma vida, e sem vidas a partida acaba', () => {
  const n = new Navinha(sempre(0.99));
  n.comecar();
  for (let v = VIDAS; v > 0; v--) {
    n.nave.protegida = 0;
    n.tiros.push({ x: n.nave.x, y: n.naveY - 1, vy: 0, meu: false });
    n.passo(1 / 60, parado);
    assert.equal(n.vidas, v - 1);
    rodar(n, 1.6);
  }
  assert.equal(n.fase, 'fim');
  assert.ok(n.colher().includes('fim'));
  // quem morreu atirando e continua segurando não recomeça sozinho: tem de soltar e apertar de novo
  rodar(n, 2, { ...parado, atirar: true });
  assert.equal(n.fase, 'fim');
  n.passo(1 / 60, parado);
  n.passo(1 / 60, { ...parado, atirar: true });
  assert.equal(n.fase, 'jogando');
  // e o "fim de jogo" fica na tela pelo menos um segundo
  const m = new Navinha(sempre(0.99));
  m.comecar();
  m.vidas = 1; m.nave.protegida = 0;
  m.tiros.push({ x: m.nave.x, y: m.naveY - 1, vy: 0, meu: false });
  rodar(m, 1.5);
  assert.equal(m.fase, 'fim');
  m.passo(1 / 60, { ...parado, atirar: true });
  assert.equal(m.fase, 'fim', 'cedo demais');
});

test('limpou a onda, vem outra', () => {
  const n = new Navinha(sempre(0.99));
  n.comecar();
  n.bichos = [];
  rodar(n, 0.1);
  assert.equal(n.fase, 'entreOndas');
  assert.equal(n.onda, 2);
  rodar(n, 2);
  assert.equal(n.fase, 'jogando');
  assert.ok(n.bichos.length > 20);
});

test('tonto, a nave escorrega sozinha', () => {
  const n = new Navinha(sempre(0.99));
  n.comecar();
  n.tonto = true;
  const x0 = n.nave.x;
  rodar(n, 0.6);
  assert.notEqual(Math.round(n.nave.x), Math.round(x0));
  assert.ok(n.nave.x >= 7 && n.nave.x <= CAMPO.w - 7);
});

test('o placar guarda os cinco maiores', () => {
  const placar = [{ pontos: 900 }, { pontos: 700 }, { pontos: 500 }, { pontos: 300 }, { pontos: 100 }];
  assert.equal(entraNoPlacar(placar, 150), true);
  assert.equal(entraNoPlacar(placar, 100), false);
  assert.equal(entraNoPlacar(placar.slice(0, 3), 10), true);
  assert.equal(entraNoPlacar([], 0), false, 'zero ponto não entra');
});

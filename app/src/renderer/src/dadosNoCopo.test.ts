import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACE_NO_CUBO, GIRO_PARADO, giroDoDado, giroParaAFrente } from './dadosNoCopo.ts';

// Os giros do CSS (y para baixo, z para quem olha), como matrizes 3×3; a lista de um `transform`
// se aplica da direita para a esquerda, e o cubo vale por cima da face (pai × filho).
type M = number[][];
const rad = (g: number) => (g * Math.PI) / 180;
const rx = (g: number): M => { const c = Math.cos(rad(g)), s = Math.sin(rad(g)); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
const ry = (g: number): M => { const c = Math.cos(rad(g)), s = Math.sin(rad(g)); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
const rz = (g: number): M => { const c = Math.cos(rad(g)), s = Math.sin(rad(g)); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
const vezes = (a: M, b: M): M => a.map((l) => b[0].map((_, j) => l.reduce((t, v, k) => t + v * b[k][j], 0)));
const aplicar = (m: M, v: number[]) => m.map((l) => l.reduce((t, x, k) => t + x * v[k], 0));
const perto = (a: number[], b: number[]) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
const FRENTE = [0, 0, 1];

/** Para onde aponta a face `n` depois do giro do cubo: a normal dela, no espaço da tela. */
function normal(n: number, cubo: M): number[] {
  const f = FACE_NO_CUBO[n];
  return aplicar(vezes(cubo, vezes(rx(f.x), ry(f.y))), FRENTE);
}

test('as faces opostas somam 7, e cada uma mora num lado diferente do cubo', () => {
  const parado = vezes(rx(0), ry(0));
  const lados = new Set<string>();
  for (let n = 1; n <= 6; n++) {
    const a = normal(n, parado), b = normal(7 - n, parado);
    assert.ok(perto(a, b.map((x) => -x)), `${n} e ${7 - n} não estão em lados opostos`);
    lados.add(a.map((x) => Math.round(x)).join(','));
  }
  assert.equal(lados.size, 6);
});

test('o giro final traz a face sorteada para a frente, com qualquer número de voltas', () => {
  for (let n = 1; n <= 6; n++) {
    const { x, y } = giroParaAFrente(n);
    assert.ok(perto(normal(n, vezes(rx(x), ry(y))), FRENTE), `a face ${n} não para de frente`);
    for (const rolagem of [0, 1, 7, 42]) {
      for (const qual of [0, 1] as const) {
        const g = giroDoDado(n, rolagem, qual);
        // Como o CSS: rotateZ(giro) rotateX(fimX) rotateY(fimY).
        assert.ok(perto(normal(n, vezes(rz(g.giro), vezes(rx(g.fimX), ry(g.fimY)))), FRENTE), `face ${n}, rolagem ${rolagem}`);
        assert.equal(g.giro, GIRO_PARADO[qual]);
      }
    }
  }
  assert.throws(() => giroParaAFrente(7));
});

test('o giro de partida é o mesmo nas duas telas e muda de uma rolagem para a seguinte', () => {
  assert.deepEqual(giroDoDado(4, 10, 0), giroDoDado(4, 10, 0));
  const a = giroDoDado(4, 10, 0), b = giroDoDado(4, 11, 0);
  assert.notEqual(Math.sign(a.iniX - a.fimX), Math.sign(b.iniX - b.fimX));
  // Gira de verdade: pelo menos duas voltas num eixo e uma no outro.
  assert.ok(Math.abs(a.iniX - a.fimX) >= 720 && Math.abs(a.iniY - a.fimY) >= 360);
});

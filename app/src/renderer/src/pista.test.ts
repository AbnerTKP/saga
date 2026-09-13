import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IDS_DAS_PISTAS, PASSO, chaoEm, contorno, definicao, desdeALinha, distanciaAoEixo, ehPista, localizar,
  lugarNoGrid, pistaPronta, pontoNaPista, prepararPista, type Pista,
} from './pista.ts';

const PISTAS = IDS_DAS_PISTAS.map((id) => pistaPronta(id));

/** Os dois segmentos se cruzam? */
function cruzam(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  return o(ax, ay, bx, by, cx, cy) !== o(ax, ay, bx, by, dx, dy) && o(cx, cy, dx, dy, ax, ay) !== o(cx, cy, dx, dy, bx, by);
}

const temMuroEntre = (p: Pista, ax: number, ay: number, bx: number, by: number) =>
  p.segmentos.some((s) => cruzam(ax, ay, bx, by, s.ax, s.ay, s.bx, s.by));

test('as seis pistas fecham, cada volta tem o tamanho de uns 40 segundos, e pista desconhecida vira Interlagos', () => {
  assert.equal(PISTAS.length, 6);
  for (const p of PISTAS) {
    assert.ok(p.volta > 10_000 && p.volta < 17_000, `${p.id}: volta de ${p.volta}`);
    const a = pontoNaPista(p, 0), b = pontoNaPista(p, p.volta - PASSO);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < PASSO * 1.5, `${p.id} não fecha`);
  }
  assert.equal(definicao('nada').id, 'interlagos');
  assert.equal(ehPista('monaco'), true);
  assert.equal(ehPista('Monaco'), false);
});

test('a pista é a mesma em todo computador: montar de novo dá as mesmas árvores e os mesmos muros', () => {
  const outra = prepararPista(definicao('interlagos'));
  const p = pistaPronta('interlagos');
  assert.equal(outra.arvores.length, p.arvores.length);
  assert.deepEqual(outra.arvores[10], p.arvores[10]);
  assert.equal(outra.segmentos.length, p.segmentos.length);
});

test('o grid fica todo atrás da linha e dentro do asfalto, em todas as pistas', () => {
  for (const p of PISTAS) {
    for (let lugar = 0; lugar < 8; lugar++) {
      const g = lugarNoGrid(p, lugar);
      const local = localizar(p, g.x, g.y);
      assert.ok(Math.abs(local.lateral) < p.L / 2 - 15, `${p.id}, lugar ${lugar}: fora do asfalto`);
      assert.ok(desdeALinha(p, local.distancia) > p.volta * 0.9, `${p.id}, lugar ${lugar}: não está atrás da linha`);
    }
  }
});

test('localizar diz de que lado do eixo o carro está, e o chão que ele pisa', () => {
  const p = pistaPronta('interlagos');
  for (const d of [1200, 5000, 9000]) {
    const dir = pontoNaPista(p, d, 30), esq = pontoNaPista(p, d, -30);
    assert.ok(Math.abs(localizar(p, dir.x, dir.y).lateral - 30) < 2);
    assert.ok(Math.abs(localizar(p, esq.x, esq.y).lateral + 30) < 2);
    assert.equal(chaoEm(p, localizar(p, dir.x, dir.y)), 'asfalto');
  }
  // Fora da pista, em Interlagos, é grama ou brita — nunca asfalto.
  let viuBrita = false, viuGrama = false;
  for (let d = 0; d < p.volta; d += 50) {
    for (const s of [1, -1]) {
      const q = pontoNaPista(p, d, s * (p.L / 2 + 45));
      const chao = chaoEm(p, localizar(p, q.x, q.y, Math.round(d / PASSO)));
      assert.notEqual(chao, 'asfalto');
      if (chao === 'brita') viuBrita = true;
      if (chao === 'grama') viuGrama = true;
    }
  }
  assert.ok(viuBrita && viuGrama);
});

test('nenhum muro encosta no asfalto', () => {
  for (const p of PISTAS) {
    for (const s of p.segmentos) {
      assert.ok(Math.hypot(s.bx - s.ax, s.by - s.ay) <= 45, `${p.id}: pedaço de muro longo demais`);
      for (const t of [0, 0.5, 1]) {
        const x = s.ax + (s.bx - s.ax) * t, y = s.ay + (s.by - s.ay) * t;
        const d = distanciaAoEixo(p, x, y, p.L);
        assert.ok(d >= p.L / 2 + 2, `${p.id}: muro a ${d.toFixed(1)} do eixo em (${x.toFixed(0)}, ${y.toFixed(0)})`);
      }
    }
  }
});

/**
 * O que faz cortar caminho não compensar: onde dois trechos da pista passam perto um do outro
 * mas estão longe na volta, há um muro entre eles. Sem isso, a grama do meio é um atalho.
 */
test('entre dois trechos perto no mapa e longe na volta, sempre há muro', () => {
  for (const p of PISTAS) {
    let conferidos = 0;
    const falhas: string[] = [];
    for (let i = 0; i < p.n; i += 3) {
      const j = p.vizinhoQual[i];
      if (j < 0 || p.vizinho[i] > 700) continue;
      let naVolta = Math.abs(i - j); naVolta = Math.min(naVolta, p.n - naVolta) * PASSO;
      if (naVolta < 1500) continue;
      conferidos++;
      if (!temMuroEntre(p, p.xs[i], p.ys[i], p.xs[j], p.ys[j])) falhas.push(`${i * PASSO}→${j * PASSO}`);
    }
    assert.deepEqual(falhas, [], `${p.id}: sem muro entre ${falhas.slice(0, 6).join(', ')} (de ${conferidos})`);
  }
});

test('o mapinha cabe no quadro e a linha de chegada está nele', () => {
  for (const p of PISTAS) {
    const m = contorno(p, 176, 150);
    const numeros = m.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    assert.ok(numeros.every((v) => v >= -1 && v <= 177), `${p.id} sai do quadro`);
    assert.equal(m.linha.length, 4);
  }
});

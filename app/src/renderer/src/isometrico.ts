/**
 * O desenho isométrico das peças do Catan: as do tabuleiro (`desenhoDoCatan.ts`, madeira maciça na
 * cor do jogador) e as dos botões de construir (`iconesDoCatan.ts`, as miniaturas). Um lugar só para
 * a projeção e para as formas, para as duas não desenharem a mesma casa de dois jeitos.
 *
 * Eixos: `a` vai para a direita-baixo, `b` para a esquerda-baixo, `c` para cima. Ficam à vista o
 * alto, a face +b (a da esquerda) e a face +a (a da direita) — é o que cada forma desenha.
 */
export type P3 = [number, number, number];
const C = 0.866, S = 0.5;
export const iso = ([a, b, c]: P3): [number, number] => [(a - b) * C, (a + b) * S - c];
const n = (v: number) => v.toFixed(2);

/** Junta polígonos e linhas, e sabe a caixa do que juntou (para o `viewBox` do ícone). */
export class Desenho {
  private pts: [number, number][] = [];
  private s = '';
  poly(lista: P3[], fill: string, extra = '') {
    const p = lista.map(iso);
    this.pts.push(...p);
    this.s += `<polygon points="${p.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" fill="${fill}" ${extra}/>`;
    return this;
  }
  linha(a: P3, b: P3, stroke: string, w: number) {
    const [p, q] = [iso(a), iso(b)];
    this.pts.push(p, q);
    this.s += `<line x1="${n(p[0])}" y1="${n(p[1])}" x2="${n(q[0])}" y2="${n(q[1])}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
    return this;
  }
  cru(texto: string, ...pontos: [number, number][]) {
    this.s += texto;
    this.pts.push(...pontos);
    return this;
  }
  /** O que foi juntado, sem moldura: para entrar dentro de outro desenho. */
  conteudo() { return this.s; }
  /** Um `<svg>` inteiro, com o `viewBox` justo no que foi desenhado. */
  svg(pad = 2.5) {
    const xs = this.pts.map((p) => p[0]), ys = this.pts.map((p) => p[1]);
    const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
    const w = Math.max(...xs) - x0 + pad, h = Math.max(...ys) - y0 + pad;
    return `<svg viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" xmlns="http://www.w3.org/2000/svg">${this.s}</svg>`;
  }
}

export type Tons = { alto?: string; esq: string; dir: string; contorno: string; w?: number };
/** Uma caixa: o alto (se tiver cor), a face +b (esquerda) e a face +a (direita). */
export function caixa(d: Desenho, [a0, a1]: [number, number], [b0, b1]: [number, number], [c0, c1]: [number, number], t: Tons) {
  const st = `stroke="${t.contorno}" stroke-width="${t.w ?? .7}" stroke-linejoin="round"`;
  d.poly([[a0, b1, c0], [a1, b1, c0], [a1, b1, c1], [a0, b1, c1]], t.esq, st);
  d.poly([[a1, b0, c0], [a1, b1, c0], [a1, b1, c1], [a1, b0, c1]], t.dir, st);
  if (t.alto) d.poly([[a0, b0, c1], [a1, b0, c1], [a1, b1, c1], [a0, b1, c1]], t.alto, st);
}

export type TonsDaCasa = { esq: string; dir: string; telhado: string; telhadoClaro: string; contorno: string; w?: number };
/** Uma casa de duas águas, cumeeira ao longo de a: as paredes e o telhado podem ser de cores diferentes. */
export function casaIsometrica(d: Desenho, [a0, a1]: [number, number], [b0, b1]: [number, number], h: number, r: number, t: TonsDaCasa) {
  const bm = (b0 + b1) / 2;
  const st = `stroke="${t.contorno}" stroke-width="${t.w ?? .8}" stroke-linejoin="round"`;
  d.poly([[a0, b0, h], [a1, b0, h], [a1, bm, h + r], [a0, bm, h + r]], t.telhado, st);                        // a água de trás
  d.poly([[a0, b1, 0], [a1, b1, 0], [a1, b1, h], [a0, b1, h]], t.esq, st);                                     // a parede comprida
  d.poly([[a1, b0, 0], [a1, b1, 0], [a1, b1, h], [a1, bm, h + r], [a1, b0, h]], t.dir, st);                   // a empena
  d.poly([[a0, bm, h + r], [a1, bm, h + r], [a1, b1 + .6, h - .4], [a0, b1 + .6, h - .4]], t.telhadoClaro, st); // a água da frente
}

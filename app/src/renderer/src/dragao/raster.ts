/**
 * Formas viram pixels aqui, e é aqui que mora o "jeito" de pixel art: cada PEÇA do desenho (um
 * braço, o tronco, o cabelo) vira uma máscara, ganha um contorno de um pixel por fora e uma faixa
 * de sombra do lado oposto à luz. Peça desenhada por cima de outra traz o próprio contorno — é o
 * risco escuro que separa o braço do peito, como um desenhista faria à mão.
 *
 * O contorno é pela vizinhança de QUATRO (cima, baixo, lados): a de oito engrossaria as
 * diagonais, e linha grossa é o que denuncia desenho feito por programa.
 */
import { type Cor, type Quadro } from './quadro.ts';

export type P = [number, number];

export type Forma =
  | { tipo: 'capsula'; a: P; b: P; ra: number; rb: number }
  | { tipo: 'elipse'; c: P; rx: number; ry: number; ang?: number }
  | { tipo: 'poligono'; pts: P[] };

export type Tinta = {
  base: Cor;
  sombra: Cor;
  /** Brilho de um pixel na borda virada para a luz. Sem ele, a peça fica fosca. */
  luz?: Cor;
  contorno: Cor;
  /** Espessura da faixa de sombra, em pixels. */
  faixa?: number;
  /** Peça sem contorno por fora: detalhe que encosta noutra peça (a faixa da cintura, a boca). */
  semContorno?: boolean;
};

/** A luz vem do alto e da frente (o personagem olha para a direita no desenho). */
const LUZ: P = [0.55, -0.83];

/** Uma máscara do tamanho do sprite, reaproveitada entre peças. */
export class Mascara {
  readonly l: number;
  readonly a: number;
  readonly m: Uint8Array;
  x0 = 0; y0 = 0; x1 = -1; y1 = -1;
  constructor(l: number, a: number) {
    this.l = l; this.a = a; this.m = new Uint8Array(l * a);
  }
  zerar() {
    if (this.x1 >= this.x0) {
      for (let y = this.y0; y <= this.y1; y++) this.m.fill(0, y * this.l + this.x0, y * this.l + this.x1 + 1);
    }
    this.x0 = this.l; this.y0 = this.a; this.x1 = -1; this.y1 = -1;
  }
  tem(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.l && y < this.a && this.m[y * this.l + x] === 1;
  }
  marcar(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.l || y >= this.a) return;
    this.m[y * this.l + x] = 1;
    if (x < this.x0) this.x0 = x;
    if (x > this.x1) this.x1 = x;
    if (y < this.y0) this.y0 = y;
    if (y > this.y1) this.y1 = y;
  }
}

function caixa(f: Forma): [number, number, number, number] {
  if (f.tipo === 'capsula') {
    const r = Math.max(f.ra, f.rb);
    return [Math.min(f.a[0], f.b[0]) - r, Math.min(f.a[1], f.b[1]) - r, Math.max(f.a[0], f.b[0]) + r, Math.max(f.a[1], f.b[1]) + r];
  }
  if (f.tipo === 'elipse') {
    const r = Math.max(f.rx, f.ry);
    return [f.c[0] - r, f.c[1] - r, f.c[0] + r, f.c[1] + r];
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of f.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

/** Marca na máscara os pixels cujo CENTRO cai dentro da forma. */
export function marcarForma(m: Mascara, f: Forma) {
  const [bx0, by0, bx1, by1] = caixa(f);
  const x0 = Math.max(0, Math.floor(bx0) - 1), y0 = Math.max(0, Math.floor(by0) - 1);
  const x1 = Math.min(m.l - 1, Math.ceil(bx1) + 1), y1 = Math.min(m.a - 1, Math.ceil(by1) + 1);
  if (f.tipo === 'capsula') {
    const [ax, ay] = f.a; const [bx, by] = f.b;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-9;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - ax, py = y + 0.5 - ay;
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        const r = f.ra + (f.rb - f.ra) * t;
        const qx = px - t * dx, qy = py - t * dy;
        if (qx * qx + qy * qy <= r * r) m.marcar(x, y);
      }
    }
  } else if (f.tipo === 'elipse') {
    const ang = ((f.ang ?? 0) * Math.PI) / 180;
    const c = Math.cos(ang), s = Math.sin(ang);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - f.c[0], py = y + 0.5 - f.c[1];
        const u = (px * c + py * s) / f.rx, v = (-px * s + py * c) / f.ry;
        if (u * u + v * v <= 1) m.marcar(x, y);
      }
    }
  } else {
    const pts = f.pts;
    const xs: number[] = [];
    for (let y = y0; y <= y1; y++) {
      const cy = y + 0.5;
      xs.length = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]; const [xj, yj] = pts[j];
        if ((yi > cy) !== (yj > cy)) xs.push(xi + ((cy - yi) * (xj - xi)) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(x0, Math.ceil(xs[k] - 0.5)), xb = Math.min(x1, Math.floor(xs[k + 1] - 0.5));
        for (let x = xa; x <= xb; x++) m.marcar(x, y);
      }
    }
  }
}

/**
 * Pinta a máscara no quadro: contorno por fora, base, sombra do lado oposto à luz e o brilho
 * na borda virada para ela. `luz` troca a direção da luz (o especial acende por baixo, por ex.).
 */
export function pintarMascara(q: Quadro, m: Mascara, t: Tinta, luz: P = LUZ) {
  if (m.x1 < m.x0) return;
  const W = q.largura;
  if (!t.semContorno) {
    for (let y = Math.max(0, m.y0 - 1); y <= Math.min(q.altura - 1, m.y1 + 1); y++) {
      for (let x = Math.max(0, m.x0 - 1); x <= Math.min(W - 1, m.x1 + 1); x++) {
        if (m.tem(x, y)) continue;
        if (m.tem(x - 1, y) || m.tem(x + 1, y) || m.tem(x, y - 1) || m.tem(x, y + 1)) q.px[y * W + x] = t.contorno;
      }
    }
  }
  const faixa = t.faixa ?? 2;
  const sx = Math.round(-luz[0] * faixa), sy = Math.round(-luz[1] * faixa);
  const lx = Math.round(luz[0] * 1.2), ly = Math.round(luz[1] * 1.2);
  for (let y = m.y0; y <= m.y1; y++) {
    for (let x = m.x0; x <= m.x1; x++) {
      if (!m.tem(x, y)) continue;
      let c = t.base;
      if (faixa > 0 && !m.tem(x + sx, y + sy)) c = t.sombra;
      else if (t.luz !== undefined && !m.tem(x + lx, y + ly)) c = t.luz;
      if (x >= 0 && y >= 0 && x < W && y < q.altura) q.px[y * W + x] = c;
    }
  }
}

/** Uma peça inteira: várias formas numa máscara só (o braço e o antebraço não ganham risco no cotovelo). */
export function pintarPeca(q: Quadro, m: Mascara, formas: Forma[], t: Tinta, luz?: P) {
  m.zerar();
  for (const f of formas) marcarForma(m, f);
  pintarMascara(q, m, t, luz);
}

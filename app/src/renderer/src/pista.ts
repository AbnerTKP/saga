/**
 * A pista de jogo, feita a partir do traçado de verdade: o eixo, as curvas, as zebras, a brita,
 * os muros, as arquibancadas e o que há em volta. Tudo aqui é conta pura — sem tela e sem
 * navegador —, e é a MESMA conta que o desenho (`DesenhoDaCorrida`) e a física (`corrida.ts`)
 * leem: o muro que se vê é o muro em que se bate.
 *
 * Unidades: a pista mora num mundo em que o carro tem 36 de comprimento. Os traçados vêm em
 * metros e são encolhidos (`k`) para cada volta levar uns 40 segundos; a LARGURA não encolhe
 * junto — 110, umas seis larguras de carro, como na F1.
 *
 * Nada aqui usa sorteio de verdade: árvore, prédio e torcida saem de um gerador com semente,
 * então a pista é a mesma em todo computador.
 */
import { TRACADOS } from './pistas/tracados.ts';

// ---- as seis pistas -----------------------------------------------------------------------

export type Tema = 'campo' | 'rua' | 'deserto' | 'noite';
export const IDS_DAS_PISTAS = ['interlagos', 'monza', 'monaco', 'spa', 'bahrein', 'vegas'] as const;
export type IdDaPista = (typeof IDS_DAS_PISTAS)[number];

export type Definicao = {
  id: IdDaPista;
  nome: string;
  /** Para o título da corrida: "GP de Interlagos". */
  gp: string;
  pais: string;
  km: string;
  tema: Tema;
  /** Unidades por metro: encolhe o traçado sem encolher o carro. */
  k: number;
  largura: number;
  semente: number;
  arvores?: number;
  lagos?: { x: number; y: number; rx: number; ry: number; a: number }[];
  /** O mar: da margem de um trecho da pista até a borda do mundo. */
  mar?: { de: number; ate: number; lado: 1 | -1; cais: number; fim: 's' | 'n' | 'l' | 'o'; inicio: 's' | 'n' | 'l' | 'o'; cantos: ('se' | 'so' | 'ne' | 'no')[]; barcos: [number, number] };
  tunel?: [number, number];
  esfera?: { x: number; y: number; r: number };
  torcida?: string[];
  bandeira?: 'br';
};

export const PISTAS: Record<IdDaPista, Definicao> = {
  interlagos: {
    id: 'interlagos', nome: 'Interlagos', gp: 'GP de Interlagos', pais: 'Brasil', km: '4,3 km', tema: 'campo',
    k: 3.3, largura: 110, semente: 11, arvores: 0.5,
    lagos: [{ x: 645, y: 760, rx: 150, ry: 250, a: 0.45 }],
    torcida: ['#1f9a4a', '#ffd500', '#f4f7fb', '#1d3f8f', '#1f9a4a', '#ffd500', '#e5484d'], bandeira: 'br',
  },
  monza: {
    id: 'monza', nome: 'Monza', gp: 'GP de Monza', pais: 'Itália', km: '5,8 km', tema: 'campo',
    k: 2.7, largura: 110, semente: 3, arvores: 0.9,
    torcida: ['#dc0000', '#dc0000', '#f4f7fb', '#ffe000', '#1f9a4a', '#dc0000'],
  },
  monaco: {
    id: 'monaco', nome: 'Mônaco', gp: 'GP de Mônaco', pais: 'Mônaco', km: '3,3 km', tema: 'rua',
    k: 4.4, largura: 96, semente: 5,
    mar: { de: 2630, ate: 8860, lado: -1, cais: 150, fim: 's', inicio: 'n', cantos: ['se', 'ne'], barcos: [5250, 8680] },
    tunel: [2930, 4460],
  },
  spa: {
    id: 'spa', nome: 'Spa-Francorchamps', gp: 'GP da Bélgica', pais: 'Bélgica', km: '7,0 km', tema: 'campo',
    k: 2.3, largura: 110, semente: 9, arvores: 1.0,
  },
  bahrein: {
    id: 'bahrein', nome: 'Bahrein', gp: 'GP do Bahrein', pais: 'Bahrein', km: '5,4 km', tema: 'deserto',
    k: 2.8, largura: 116, semente: 4,
  },
  vegas: {
    id: 'vegas', nome: 'Las Vegas', gp: 'GP de Las Vegas', pais: 'Estados Unidos', km: '6,2 km', tema: 'noite',
    k: 2.5, largura: 110, semente: 8, esfera: { x: 900, y: 200, r: 130 },
  },
};

export const ehPista = (id: unknown): id is IdDaPista => (IDS_DAS_PISTAS as readonly unknown[]).includes(id);
export const definicao = (id: string): Definicao => PISTAS[ehPista(id) ? id : 'interlagos'];

// ---- sorteio com semente --------------------------------------------------------------------

export function sorteio(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- geometria -----------------------------------------------------------------------------

type P2 = [number, number];
export const PASSO = 10;

function catmull(pontos: P2[], porTrecho: number): P2[] {
  const n = pontos.length, saida: P2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pontos[(i - 1 + n) % n], p1 = pontos[i], p2 = pontos[(i + 1) % n], p3 = pontos[(i + 2) % n];
    for (let k = 0; k < porTrecho; k++) {
      const t = k / porTrecho, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      saida.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return saida;
}

/** A mesma volta, com um ponto a cada `passo` exato: é o que deixa "distância" virar índice. */
function reamostrar(pontos: P2[], passo: number): P2[] {
  const n = pontos.length;
  const acum = [0];
  for (let i = 1; i <= n; i++) {
    const a = pontos[i - 1], b = pontos[i % n];
    acum.push(acum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = acum[n], m = Math.round(total / passo), saida: P2[] = [];
  let j = 0;
  for (let k = 0; k < m; k++) {
    const d = (k * total) / m;
    while (acum[j + 1] < d) j++;
    const a = pontos[j], b = pontos[(j + 1) % n];
    const t = (d - acum[j]) / (acum[j + 1] - acum[j] || 1);
    saida.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return saida;
}

function suavizar(pontos: P2[], passadas: number, janela: number): P2[] {
  let p = pontos;
  const n = p.length;
  for (let s = 0; s < passadas; s++) {
    const q: P2[] = new Array(n);
    for (let i = 0; i < n; i++) {
      let sx = 0, sy = 0, c = 0;
      for (let k = -janela; k <= janela; k++) {
        const r = p[(i + k + n) % n], w = janela + 1 - Math.abs(k);
        sx += r[0] * w; sy += r[1] * w; c += w;
      }
      q[i] = [sx / c, sy / c];
    }
    p = q;
  }
  return p;
}

/**
 * Grampo apertado demais vira laço na zebra e carro que não faz a curva: abre até o raio mínimo.
 * O traçado encolhido pela metade deixa os grampos de verdade com metade do raio — e a largura
 * não encolheu —, então sem isto a borda de dentro do grampo passaria do centro da curva.
 */
function abrirCurvas(pontos: P2[], raioMin: number): P2[] {
  let p = pontos.map((q): P2 => [q[0], q[1]]);
  const n = p.length;
  for (let volta = 0; volta < 400; volta++) {
    let mexeu = false;
    const q = p.map((r): P2 => [r[0], r[1]]);
    for (let i = 0; i < n; i++) {
      const a = p[(i - 3 + n) % n], b = p[i], c = p[(i + 3) % n];
      let d = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]);
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const comp = Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1]);
      if (Math.abs(d) / (comp / 2) <= 1 / raioMin) continue;
      mexeu = true;
      for (let k = -6; k <= 6; k++) {
        const j = (i + k + n) % n, e = p[(j - 1 + n) % n], f = p[(j + 1) % n];
        q[j] = [(e[0] + 2 * p[j][0] + f[0]) / 4, (e[1] + 2 * p[j][1] + f[1]) / 4];
      }
    }
    p = q;
    if (!mexeu) break;
  }
  return p;
}

type Grade = { perto(x: number, y: number, raio: number, fn: (i: number) => void): void };

function criarGrade(n: number, xDe: (i: number) => number, yDe: (i: number) => number, celula: number): Grade {
  const mapa = new Map<number, number[]>();
  const chave = (cx: number, cy: number) => cx * 100003 + cy;
  for (let i = 0; i < n; i++) {
    const k = chave(Math.floor(xDe(i) / celula), Math.floor(yDe(i) / celula));
    let l = mapa.get(k);
    if (!l) mapa.set(k, (l = []));
    l.push(i);
  }
  return {
    perto(x, y, raio, fn) {
      const c0 = Math.floor((x - raio) / celula), c1 = Math.floor((x + raio) / celula);
      const r0 = Math.floor((y - raio) / celula), r1 = Math.floor((y + raio) / celula);
      for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
        const l = mapa.get(chave(cx, cy));
        if (l) for (const i of l) fn(i);
      }
    },
  };
}

export function dentroDoPoligono(x: number, y: number, pol: P2[]): boolean {
  let dentro = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [xi, yi] = pol[i], [xj, yj] = pol[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

// ---- a pista preparada ---------------------------------------------------------------------

export type Curva = { i0: number; tam: number; apice: number; lado: 1 | -1; raio: number; angulo: number };
export type Muro = { pts: P2[]; pneus: boolean[]; lado: 1 | -1 | 0 };
export type Retangulo = { x: number; y: number; a: number; w: number; h: number };
export type Arquibancada = Retangulo & { lado: 1 | -1 };
export type Garagem = Retangulo & { k: number };
export type Arvore = { x: number; y: number; r: number; c: number };
export type Predio = Retangulo & { c: number; alto: number };
export type Posto = { x: number; y: number; a: number; lado: 1 | -1; d: number };
export type Placa = { x: number; y: number; a: number; n: number };
export type Brita = { i0: number; i1: number; lado: 1 | -1; fundo: number; asfalto: boolean; rua: boolean };
export type Zebra = { i0: number; i1: number; lado: 1 | -1 };

export type Pista = {
  def: Definicao;
  id: IdDaPista;
  tema: Tema;
  /** Largura do asfalto. */
  L: number;
  n: number;
  volta: number;
  xs: Float64Array; ys: Float64Array; nx: Float64Array; ny: Float64Array; ang: Float64Array; curv: Float64Array;
  limites: { minX: number; minY: number; maxX: number; maxY: number };
  mundo: { x0: number; y0: number; x1: number; y1: number };
  grade: Grade;
  curvas: Curva[];
  /** Menor distância de cada ponto a um trecho da pista que não é ele mesmo. */
  vizinho: Float64Array;
  vizinhoQual: Int32Array;
  /** O escape de cada lado, contado da borda do asfalto: [direita (+), esquerda (-)]. */
  escape: [Float64Array, Float64Array];
  zebras: Zebra[];
  britas: Brita[];
  /** Para a física: zebra, largura da brita e se a brita é asfalto, por ponto e lado. */
  zebraEm: [Uint8Array, Uint8Array];
  britaEm: [Float64Array, Float64Array];
  escapeAsfaltado: [Uint8Array, Uint8Array];
  muros: Muro[];
  gradeDosMuros: Grade;
  segmentos: { ax: number; ay: number; bx: number; by: number }[];
  box: { lado: 1 | -1; d0: number; d1: number; muro: number; faixa: number; fundo: number };
  garagens: Garagem[];
  arquibancadas: Arquibancada[];
  placas: Placa[];
  postos: Posto[];
  arvores: Arvore[];
  predios: Predio[];
  barcos: { x: number; y: number; a: number; t: number }[];
  marPoligono: P2[] | null;
  base: number;
};

export const idx = (p: { n: number }, k: number) => ((k % p.n) + p.n) % p.n;

const cache = new Map<IdDaPista, Pista>();

/** A pista pronta. Montá-la leva uma fração de segundo, então cada uma é montada uma vez só. */
export function pistaPronta(id: string): Pista {
  const def = definicao(id);
  let p = cache.get(def.id);
  if (!p) { p = prepararPista(def); cache.set(def.id, p); }
  return p;
}

export function prepararPista(def: Definicao): Pista {
  const bruto = TRACADOS[def.id];
  let pontos: P2[] = [];
  for (let i = 0; i < bruto.length; i += 2) pontos.push([bruto[i] * def.k, bruto[i + 1] * def.k]);
  pontos = catmull(pontos, 12);
  pontos = reamostrar(pontos, PASSO);
  pontos = suavizar(pontos, 3, 3);
  pontos = reamostrar(pontos, PASSO);
  pontos = abrirCurvas(pontos, 62);
  pontos = reamostrar(pontos, PASSO);
  const n = pontos.length;
  const xs = new Float64Array(n), ys = new Float64Array(n), nx = new Float64Array(n), ny = new Float64Array(n);
  const ang = new Float64Array(n), curv = new Float64Array(n);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    xs[i] = pontos[i][0]; ys[i] = pontos[i][1];
    minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]);
    minY = Math.min(minY, ys[i]); maxY = Math.max(maxY, ys[i]);
  }
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n, b = (i + 1) % n;
    const dx = xs[b] - xs[a], dy = ys[b] - ys[a], l = Math.hypot(dx, dy) || 1;
    ang[i] = Math.atan2(dy, dx);
    // normal para a DIREITA de quem anda, com y para baixo
    nx[i] = -dy / l; ny[i] = dx / l;
  }
  for (let i = 0; i < n; i++) {
    let d = ang[(i + 3) % n] - ang[(i - 3 + n) % n];
    d = Math.atan2(Math.sin(d), Math.cos(d));
    curv[i] = d / (6 * PASSO);
  }
  const grade = criarGrade(n, (i) => xs[i], (i) => ys[i], 120);
  const p = {
    def, id: def.id, tema: def.tema, L: def.largura, n, volta: n * PASSO,
    xs, ys, nx, ny, ang, curv, limites: { minX, minY, maxX, maxY }, grade,
  } as Pista;
  p.curvas = acharCurvas(p);
  const { dist, qual } = acharVizinhos(p);
  p.vizinho = dist;
  p.vizinhoQual = qual;
  montarEntorno(p);
  return p;
}

/** A menor distância de (x, y) ao eixo da pista, olhando só até `raio`. */
export function distanciaAoEixo(p: Pista, x: number, y: number, raio = 420): number {
  let m = Infinity;
  p.grade.perto(x, y, raio, (i) => {
    const d = Math.hypot(x - p.xs[i], y - p.ys[i]);
    if (d < m) m = d;
  });
  return m;
}

function acharCurvas(p: Pista): Curva[] {
  const lim = 1 / 520;
  const curvas: Curva[] = [];
  let inicio = 0;
  while (Math.abs(p.curv[inicio]) > lim && inicio < p.n) inicio++;
  for (let k = 0; k < p.n; k++) {
    const i = (inicio + k) % p.n;
    if (Math.abs(p.curv[i]) <= lim) continue;
    const lado = Math.sign(p.curv[i]) as 1 | -1;
    let j = k, pico = 0, apice = i, angulo = 0;
    while (j < p.n) {
      const q = (inicio + j) % p.n;
      if (Math.abs(p.curv[q]) <= lim * 0.7 || Math.sign(p.curv[q]) !== lado) break;
      angulo += p.curv[q] * PASSO;
      if (Math.abs(p.curv[q]) > pico) { pico = Math.abs(p.curv[q]); apice = q; }
      j++;
    }
    if (Math.abs(angulo) > 0.35) curvas.push({ i0: i, tam: j - k, apice, lado, raio: 1 / pico, angulo });
    k = j;
  }
  return curvas;
}

function acharVizinhos(p: Pista) {
  const dist = new Float64Array(p.n).fill(Infinity), qual = new Int32Array(p.n).fill(-1);
  const minimoNaVolta = Math.ceil((p.L * 4) / PASSO);
  for (let i = 0; i < p.n; i++) {
    p.grade.perto(p.xs[i], p.ys[i], 700, (j) => {
      let dv = Math.abs(i - j); dv = Math.min(dv, p.n - dv);
      if (dv < minimoNaVolta) return;
      const d = Math.hypot(p.xs[i] - p.xs[j], p.ys[i] - p.ys[j]);
      if (d < dist[i]) { dist[i] = d; qual[i] = j; }
    });
  }
  return { dist, qual };
}

/** Um ponto a `d` do começo da volta, deslocado `lado` para a direita de quem anda. */
export function pontoNaPista(p: Pista, d: number, lado = 0) {
  const dd = ((d % p.volta) + p.volta) % p.volta;
  const f = dd / PASSO, i = Math.floor(f) % p.n, j = (i + 1) % p.n, t = f - Math.floor(f);
  const x = p.xs[i] + (p.xs[j] - p.xs[i]) * t, y = p.ys[i] + (p.ys[j] - p.ys[i]) * t;
  let da = p.ang[j] - p.ang[i];
  da = Math.atan2(Math.sin(da), Math.cos(da));
  const nxv = p.nx[i] + (p.nx[j] - p.nx[i]) * t, nyv = p.ny[i] + (p.ny[j] - p.ny[i]) * t;
  return { x: x + nxv * lado, y: y + nyv * lado, angulo: p.ang[i] + da * t };
}

/** Pontos deslocados do eixo, sem os que andam para trás — é o laço do lado de dentro de um grampo. */
export function pontosLimpos(p: Pista, i0: number, i1: number, ladoDe: (i: number) => number): P2[] {
  const pts: P2[] = [];
  let ultimo: P2 | null = null;
  for (let k = i0; k <= i1; k++) {
    const i = idx(p, k), o = ladoDe(i);
    const x = p.xs[i] + p.nx[i] * o, y = p.ys[i] + p.ny[i] * o;
    if (ultimo && (x - ultimo[0]) * Math.cos(p.ang[i]) + (y - ultimo[1]) * Math.sin(p.ang[i]) <= 0.3) continue;
    pts.push([x, y]);
    ultimo = [x, y];
  }
  return pts;
}

/** A caixa do grid: a pole logo atrás da linha, os outros de dois em dois, alternando os lados. */
export function lugarNoGrid(p: Pista, lugar: number) {
  const fila = Math.floor(lugar / 2);
  const lado = lugar % 2 === 0 ? -p.L * 0.24 : p.L * 0.24;
  return pontoNaPista(p, -60 - fila * 70 - (lugar % 2) * 30, lado);
}

function montarEntorno(p: Pista) {
  const def = p.def;
  const r = sorteio(def.semente);
  const L = p.L, meia = L / 2;
  const base = p.tema === 'rua' ? 16 : p.tema === 'noite' ? 26 : 72;
  p.base = base;
  const escapeMax = new Float64Array(p.n);
  for (let i = 0; i < p.n; i++) escapeMax[i] = Math.max(8, p.vizinho[i] / 2 - meia - 10);

  // Zebras por dentro no ápice e por fora na saída; brita por fora das curvas (na rua, só nas fortes).
  p.zebras = [];
  p.britas = [];
  const fortes: Curva[] = [];
  for (const c of p.curvas) {
    const dentro = c.lado;
    const ext = Math.round(Math.min(10, c.tam * 0.35));
    if (Math.abs(c.angulo) > 0.9 && c.raio < 420) fortes.push(c);
    if (p.tema === 'rua' && Math.abs(c.angulo) < 0.7) continue;
    p.zebras.push({ i0: c.i0 - 2, i1: c.i0 + c.tam + 2, lado: dentro });
    p.zebras.push({ i0: c.apice + Math.round(c.tam * 0.15), i1: c.i0 + c.tam + ext + 4, lado: (-dentro) as 1 | -1 });
    if (p.tema === 'campo' || p.tema === 'deserto') {
      const fundo = Math.min(230, 90 + (1400 / Math.max(80, c.raio)) * 40);
      p.britas.push({ i0: c.i0 - 4, i1: c.i0 + c.tam + ext + 14, lado: (-dentro) as 1 | -1, fundo, asfalto: p.tema === 'deserto', rua: false });
    } else if (Math.abs(c.angulo) > 1.0) {
      p.britas.push({ i0: c.i0 - 2, i1: c.i0 + c.tam + 6, lado: (-dentro) as 1 | -1, fundo: 70, asfalto: true, rua: true });
    }
  }

  p.escape = [new Float64Array(p.n).fill(base), new Float64Array(p.n).fill(base)];
  for (const b of p.britas) {
    const lado = b.lado > 0 ? 0 : 1;
    for (let k = b.i0; k <= b.i1; k++) {
      const i = idx(p, k);
      const t = Math.min(1, (k - b.i0) / 8, (b.i1 - k) / 8);
      p.escape[lado][i] = Math.max(p.escape[lado][i], base + (b.fundo - base) * Math.max(0, t) + 20);
    }
  }

  // Boxes do lado com mais espaço em volta da largada; ali o limite é o muro dos boxes.
  const livreDoLado = (s: number) => {
    let c = 0;
    for (let d = -700; d <= 420; d += 70) {
      const q = pontoNaPista(p, d, s * (meia + 200));
      if (distanciaAoEixo(p, q.x, q.y, 400) > meia + 170) c++;
    }
    return c;
  };
  const ladoBox: 1 | -1 = livreDoLado(1) >= livreDoLado(-1) ? 1 : -1;
  p.box = { lado: ladoBox, d0: -760, d1: 460, muro: meia + 34, faixa: 58, fundo: 72 };
  {
    const lado = ladoBox > 0 ? 0 : 1;
    for (let d = p.box.d0 - 100; d <= p.box.d1 + 100; d += PASSO) {
      const i = idx(p, Math.round(d / PASSO));
      const fora = d < p.box.d0 ? p.box.d0 - d : d > p.box.d1 ? d - p.box.d1 : 0;
      const t = Math.min(1, fora / 100);
      p.escape[lado][i] = 34 + (p.escape[lado][i] - 34) * t;
    }
  }

  for (let i = 0; i < p.n; i++) {
    p.escape[0][i] = Math.min(p.escape[0][i], escapeMax[i]);
    p.escape[1][i] = Math.min(p.escape[1][i], escapeMax[i]);
  }
  for (const e of p.escape) {
    for (let s = 0; s < 3; s++) {
      const c = Float64Array.from(e);
      for (let i = 0; i < p.n; i++) {
        let m = Infinity, soma = 0;
        for (let k = -4; k <= 4; k++) { const v = c[(i + k + p.n) % p.n]; soma += v; m = Math.min(m, v); }
        e[i] = Math.min(soma / 9, m + 30, escapeMax[i]);
      }
    }
  }

  // Para a física: o que tem em cada ponto de cada lado.
  p.zebraEm = [new Uint8Array(p.n), new Uint8Array(p.n)];
  p.britaEm = [new Float64Array(p.n), new Float64Array(p.n)];
  p.escapeAsfaltado = [new Uint8Array(p.n), new Uint8Array(p.n)];
  for (const z of p.zebras) for (let k = z.i0; k <= z.i1; k++) p.zebraEm[z.lado > 0 ? 0 : 1][idx(p, k)] = 1;
  for (const b of p.britas) {
    const lado = b.lado > 0 ? 0 : 1;
    for (let k = b.i0; k <= b.i1; k++) {
      const i = idx(p, k);
      p.britaEm[lado][i] = Math.max(0, p.escape[lado][i] - 32);
      p.escapeAsfaltado[lado][i] = b.asfalto ? 1 : 0;
    }
  }

  montarMuros(p);
  p.gradeDosMuros = criarGrade(0, () => 0, () => 0, 100);
  {
    const segs: Pista['segmentos'] = [];
    for (const m of p.muros) for (let k = 1; k < m.pts.length; k++) {
      segs.push({ ax: m.pts[k - 1][0], ay: m.pts[k - 1][1], bx: m.pts[k][0], by: m.pts[k][1] });
    }
    p.segmentos = segs;
    p.gradeDosMuros = criarGrade(segs.length, (i) => (segs[i].ax + segs[i].bx) / 2, (i) => (segs[i].ay + segs[i].by) / 2, 100);
  }

  // O que já tem dono no chão, para árvore e prédio não nascerem em cima.
  const ocupado = new Set<number>();
  const CEL = 30;
  const chave = (x: number, y: number) => Math.floor(x / CEL) * 100003 + Math.floor(y / CEL);
  const ocupar = (x: number, y: number, w: number, h: number, a: number, folga = 12) => {
    const c = Math.cos(a), s = Math.sin(a);
    for (let u = -w / 2 - folga; u <= w / 2 + folga; u += CEL / 2) for (let v = -h / 2 - folga; v <= h / 2 + folga; v += CEL / 2) {
      ocupado.add(chave(x + u * c - v * s, y + u * s + v * c));
    }
  };
  const livre = (x: number, y: number) => !ocupado.has(chave(x, y));

  p.garagens = [];
  {
    const b = p.box, s = b.lado;
    for (let d = b.d0; d <= b.d1; d += 40) {
      const q = pontoNaPista(p, d, s * (b.muro + b.faixa / 2 + 6));
      ocupar(q.x, q.y, 44, b.faixa + 8, q.angulo);
    }
    let k = 0;
    for (let d = b.d0 + 60; d < b.d1 - 60; d += 92) {
      const q = pontoNaPista(p, d, s * (b.muro + 8 + b.faixa + b.fundo / 2));
      p.garagens.push({ x: q.x, y: q.y, a: q.angulo, w: 88, h: b.fundo, k: k++ });
      ocupar(q.x, q.y, 92, b.fundo, q.angulo);
    }
  }

  p.marPoligono = def.mar ? montarMar(p, def.mar) : null;
  const naAgua = (x: number, y: number) =>
    (p.marPoligono !== null && dentroDoPoligono(x, y, p.marPoligono))
    || (def.lagos ?? []).some((l) => ((x - l.x) / (l.rx + 40)) ** 2 + ((y - l.y) / (l.ry + 40)) ** 2 < 1);

  // Arquibancadas: blocos em fila, só onde o chão inteiro está livre.
  p.arquibancadas = [];
  const tentar = (d0: number, d1: number, s: 1 | -1, afastamento: number, fundo: number) => {
    let fila: Arquibancada[] = [];
    const fechar = () => {
      if (fila.length >= 3) for (const a of fila) { p.arquibancadas.push(a); ocupar(a.x, a.y, a.w, a.h, a.a); }
      fila = [];
    };
    for (let d = d0; d < d1; d += 64) {
      const q = pontoNaPista(p, d + 32, s * (afastamento + fundo / 2));
      const c = Math.cos(q.angulo), sn = Math.sin(q.angulo);
      const cantos = [[-31, -fundo / 2], [31, -fundo / 2], [-31, fundo / 2], [31, fundo / 2], [0, 0]]
        .map(([u, v]) => [q.x + u * c - v * sn, q.y + u * sn + v * c]);
      const ok = cantos.every(([x, y]) => distanciaAoEixo(p, x, y, afastamento + fundo + 40) >= afastamento - 20 && livre(x, y) && !naAgua(x, y));
      if (ok) fila.push({ x: q.x, y: q.y, a: q.angulo, w: 62, h: fundo, lado: s });
      else fechar();
    }
    fechar();
  };
  const escNo = (s: number, d: number) => p.escape[s > 0 ? 0 : 1][idx(p, Math.round(d / PASSO))];
  tentar(-640, 380, (-ladoBox) as 1 | -1, meia + escNo(-ladoBox, 0) + 26, p.tema === 'rua' ? 70 : 118);
  const lentas = [...p.curvas].filter((c) => c.raio < 340).sort((a, b) => Math.abs(b.angulo) - Math.abs(a.angulo)).slice(0, 5);
  for (const c of lentas) {
    const s = (-c.lado) as 1 | -1;
    let esc = 0;
    for (let k = 0; k <= c.tam; k++) esc = Math.max(esc, p.escape[s > 0 ? 0 : 1][idx(p, c.i0 + k)]);
    tentar((c.i0 - 8) * PASSO, (c.i0 + c.tam + 8) * PASSO, s, meia + esc + 30, 84);
  }

  // Placas de freada (150, 100 e 50) e postos de fiscal, só onde cabem.
  p.placas = [];
  p.postos = [];
  for (const c of fortes) {
    const s = -c.lado;
    [150, 100, 50].forEach((m, k) => {
      const i = idx(p, c.i0 - Math.round((m * 1.1) / PASSO) - 2);
      const o = meia + Math.min(p.escape[s > 0 ? 0 : 1][i] - 12, 36);
      if (o < meia + 16) return;
      const x = p.xs[i] + p.nx[i] * s * o, y = p.ys[i] + p.ny[i] * s * o;
      if (distanciaAoEixo(p, x, y, o + 30) < o - 6) return;
      p.placas.push({ x, y, a: p.ang[i], n: 3 - k });
    });
  }
  for (const c of p.curvas) {
    const s = (-c.lado) as 1 | -1, i = idx(p, c.i0 + c.tam + 6);
    const o = meia + p.escape[s > 0 ? 0 : 1][i] + 22;
    const x = p.xs[i] + p.nx[i] * s * o, y = p.ys[i] + p.ny[i] * s * o;
    if (distanciaAoEixo(p, x, y, o + 30) < o - 8 || !livre(x, y)) continue;
    p.postos.push({ x, y, a: p.ang[i], lado: s, d: i * PASSO });
    ocupar(x, y, 24, 24, p.ang[i]);
  }

  // O mundo em volta: largo o bastante para a vista geral não mostrar chão sem nada.
  const { minX, minY, maxX, maxY } = p.limites;
  const larg = maxX - minX, alt = maxY - minY;
  const mx = Math.max(1700, (alt * 1.6 - larg) / 2 + 500), my = Math.max(1700, (larg / 1.6 - alt) / 2 + 500);
  p.mundo = { x0: minX - mx, y0: minY - my, x1: maxX + mx, y1: maxY + my };
  const foraDoCorredor = (x: number, y: number, folga: number) => {
    let ok = true;
    p.grade.perto(x, y, meia + 320 + folga, (i) => {
      if (!ok) return;
      const dx = x - p.xs[i], dy = y - p.ys[i];
      const e = dx * p.nx[i] + dy * p.ny[i] > 0 ? p.escape[0][i] : p.escape[1][i];
      if (Math.hypot(dx, dy) < meia + e + folga) ok = false;
    });
    return ok;
  };

  p.arvores = [];
  p.predios = [];
  p.barcos = [];
  if (p.tema === 'campo' || p.tema === 'deserto') {
    const densidade = def.arvores ?? (p.tema === 'campo' ? 0.55 : 0.04);
    const passo = 46;
    for (let x = p.mundo.x0; x < p.mundo.x1; x += passo) for (let y = p.mundo.y0; y < p.mundo.y1; y += passo) {
      const mancha = Math.sin(x * 0.0021 + def.k) * Math.cos(y * 0.0017 - def.k * 2) + Math.sin((x + y) * 0.0009);
      if (r() > densidade * (0.4 + Math.max(0, mancha))) continue;
      const px = x + (r() - 0.5) * passo, py = y + (r() - 0.5) * passo;
      const raio = p.tema === 'deserto' ? 9 + r() * 5 : 16 + r() * 16;
      if (!foraDoCorredor(px, py, 30 + raio) || !livre(px, py) || naAgua(px, py)) continue;
      p.arvores.push({ x: px, y: py, r: raio, c: Math.floor(r() * 3) });
    }
  } else {
    const passo = p.tema === 'noite' ? 150 : 110;
    for (let x = p.mundo.x0; x < p.mundo.x1; x += passo) for (let y = p.mundo.y0; y < p.mundo.y1; y += passo) {
      const px = x + (r() - 0.5) * 16, py = y + (r() - 0.5) * 16;
      const w = passo * (0.62 + r() * 0.28), h = passo * (0.55 + r() * 0.33);
      if (!foraDoCorredor(px, py, Math.max(w, h) * 0.62 + 18) || naAgua(px, py) || !livre(px, py)) continue;
      let melhor = Infinity, ang = 0;
      p.grade.perto(px, py, 700, (i) => {
        const d = Math.hypot(px - p.xs[i], py - p.ys[i]);
        if (d < melhor) { melhor = d; ang = p.ang[i]; }
      });
      if (p.tema === 'rua' && r() < 0.14) { p.arvores.push({ x: px, y: py, r: 22 + r() * 12, c: Math.floor(r() * 3) }); continue; }
      p.predios.push({ x: px, y: py, w, h, a: melhor === Infinity ? 0 : ang, c: Math.floor(r() * 5), alto: r() });
    }
  }
  if (p.marPoligono && def.mar) {
    const [d0, d1] = def.mar.barcos;
    for (let d = d0; d < d1; d += 26) {
      if (r() < 0.45) continue;
      const q = pontoNaPista(p, d, def.mar.lado * (meia + 150 + r() * 160));
      if (!dentroDoPoligono(q.x, q.y, p.marPoligono)) continue;
      p.barcos.push({ x: q.x, y: q.y, a: q.angulo + (r() < 0.5 ? Math.PI / 2 : -Math.PI / 2) + (r() - 0.5) * 0.3, t: 22 + r() * 30 });
    }
  }
}

/**
 * Os muros: o limite do escape de cada lado e o muro no meio de dois trechos colados.
 *
 * Do lado de dentro de um grampo o limite do escape dá um laço — o ponto deslocado passa do
 * centro da curva e volta. Esses pontos saem, e o buraco que sobra é FECHADO por uma reta
 * quando ela não encosta no asfalto: um muro com buraco é um atalho, e cortar caminho é
 * justamente o que este muro existe para impedir.
 */
function montarMuros(p: Pista) {
  const meia = p.L / 2;
  p.muros = [];
  for (const s of [1, -1] as const) {
    const lado = s > 0 ? 0 : 1;
    let atual: Muro | null = null;
    let ultimo: P2 | null = null;
    let buraco = 0;
    const lista: Muro[] = [];
    for (let k = 0; k <= p.n; k++) {
      const i = k % p.n;
      const o = meia + p.escape[lado][i];
      const x = p.xs[i] + p.nx[i] * s * o, y = p.ys[i] + p.ny[i] * s * o;
      let ok = distanciaAoEixo(p, x, y, o + 40) >= o - 7;
      if (ok && ultimo && (x - ultimo[0]) * Math.cos(p.ang[i]) + (y - ultimo[1]) * Math.sin(p.ang[i]) <= 0.5) ok = false;
      if (ok) {
        if (atual && buraco > 0 && ultimo) {
          // fecha o buraco com uma reta, se ela passa longe do asfalto
          let limpa = buraco <= 40;
          for (let t = 0.1; limpa && t < 1; t += 0.1) {
            const bx = ultimo[0] + (x - ultimo[0]) * t, by = ultimo[1] + (y - ultimo[1]) * t;
            if (distanciaAoEixo(p, bx, by, meia + 40) < meia + 14) limpa = false;
          }
          if (!limpa) atual = null;
          else {
            // em pedaços curtos: a física procura muro perto do carro pelo meio de cada pedaço
            const passos = Math.ceil(Math.hypot(x - ultimo[0], y - ultimo[1]) / 15);
            for (let t = 1; t < passos; t++) {
              atual.pts.push([ultimo[0] + ((x - ultimo[0]) * t) / passos, ultimo[1] + ((y - ultimo[1]) * t) / passos]);
              atual.pneus.push(atual.pneus[atual.pneus.length - 1] ?? false);
            }
          }
        }
        if (!atual) { atual = { pts: [], pneus: [], lado: s }; lista.push(atual); }
        atual.pts.push([x, y]);
        atual.pneus.push(p.escape[lado][i] > p.base + 30);
        ultimo = [x, y];
        buraco = 0;
      } else if (atual) {
        buraco++;
      }
    }
    for (const m of lista) if (m.pts.length >= 4) p.muros.push(m);
  }
  // Entre trechos colados, o muro vai no meio — mesmo encostando na borda, como na rua de
  // verdade: sem ele, a faixa entre os dois é um atalho. Ele só não pode pisar no asfalto, e um
  // salto grande entre dois pontos quer dizer que o trecho vizinho mudou: começa outro muro.
  let atual: Muro | null = null;
  for (let i = 0; i < p.n; i++) {
    let ok = p.vizinho[i] < p.L + 2 * p.base + 60;
    let mx = 0, my = 0;
    if (ok) {
      const j = p.vizinhoQual[i];
      mx = (p.xs[i] + p.xs[j]) / 2; my = (p.ys[i] + p.ys[j]) / 2;
      ok = distanciaAoEixo(p, mx, my, meia + 40) >= meia + 3;
    }
    if (ok && atual) {
      const [ux, uy] = atual.pts[atual.pts.length - 1];
      if (Math.hypot(mx - ux, my - uy) > 30) atual = null;
    }
    if (ok) {
      if (!atual) { atual = { pts: [], pneus: [], lado: 0 }; p.muros.push(atual); }
      atual.pts.push([mx, my]); atual.pneus.push(false);
    } else atual = null;
  }
  // Pedaço de muro sempre curto: a física acha o muro perto do carro pelo meio de cada pedaço,
  // e por fora de um grampo dois pontos seguidos do limite ficam longe um do outro.
  p.muros = p.muros.filter((m) => m.pts.length >= 3).map((m) => {
    const pts: P2[] = [m.pts[0]], pneus = [m.pneus[0]];
    for (let k = 1; k < m.pts.length; k++) {
      const [ax, ay] = m.pts[k - 1], [bx, by] = m.pts[k];
      const partes = Math.ceil(Math.hypot(bx - ax, by - ay) / 15);
      for (let t = 1; t <= partes; t++) { pts.push([ax + ((bx - ax) * t) / partes, ay + ((by - ay) * t) / partes]); pneus.push(m.pneus[k]); }
    }
    return { ...m, pts, pneus };
  });
}

function montarMar(p: Pista, mar: NonNullable<Definicao['mar']>): P2[] {
  const pts: P2[] = [];
  for (let d = mar.de; d <= mar.ate; d += 40) {
    const q = pontoNaPista(p, d, mar.lado * (p.L / 2 + mar.cais));
    pts.push([q.x, q.y]);
  }
  const { minX, minY, maxX, maxY } = p.limites;
  const X0 = minX - 5000, Y0 = minY - 5000, X1 = maxX + 5000, Y1 = maxY + 5000;
  const borda = { s: (q: P2): P2 => [q[0], Y1], n: (q: P2): P2 => [q[0], Y0], l: (q: P2): P2 => [X1, q[1]], o: (q: P2): P2 => [X0, q[1]] };
  const cantos: Record<string, P2> = { se: [X1, Y1], so: [X0, Y1], ne: [X1, Y0], no: [X0, Y0] };
  return [...pts, borda[mar.fim](pts[pts.length - 1]), ...mar.cantos.map((c) => cantos[c]), borda[mar.inicio](pts[0])];
}

// ---- onde o carro está --------------------------------------------------------------------

export type Local = { indice: number; distancia: number; lateral: number };

/**
 * O trecho mais próximo, a distância andada até ali e o quanto o carro está para a direita (+)
 * ou esquerda (-) do eixo. Procura perto do último trecho conhecido — dois trechos paralelos
 * podem estar mais perto um do outro do que o carro anda num segundo —, e só procura na pista
 * inteira quando ficou longe de tudo.
 */
export function localizar(p: Pista, x: number, y: number, dica: number | null = null): Local {
  const procurar = (de: number, ate: number) => {
    let melhor = { i: 0, t: 0, d2: Infinity };
    for (let k = de; k <= ate; k++) {
      const i = ((k % p.n) + p.n) % p.n, j = (i + 1) % p.n;
      const vx = p.xs[j] - p.xs[i], vy = p.ys[j] - p.ys[i];
      const l2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((x - p.xs[i]) * vx + (y - p.ys[i]) * vy) / l2));
      const qx = p.xs[i] + vx * t - x, qy = p.ys[i] + vy * t - y;
      const d2 = qx * qx + qy * qy;
      if (d2 < melhor.d2) melhor = { i, t, d2 };
    }
    return melhor;
  };
  let achado = dica === null ? procurar(0, p.n - 1) : procurar(dica - 40, dica + 40);
  if (dica !== null && Math.sqrt(achado.d2) > p.L * 2.5) achado = procurar(0, p.n - 1);
  const { i, t } = achado;
  const j = (i + 1) % p.n;
  const nxv = p.nx[i] + (p.nx[j] - p.nx[i]) * t, nyv = p.ny[i] + (p.ny[j] - p.ny[i]) * t;
  const cx = p.xs[i] + (p.xs[j] - p.xs[i]) * t, cy = p.ys[i] + (p.ys[j] - p.ys[i]) * t;
  return { indice: i, distancia: (i + t) * PASSO, lateral: (x - cx) * nxv + (y - cy) * nyv };
}

export type Chao = 'asfalto' | 'zebra' | 'escape' | 'grama' | 'brita';

/**
 * O chão debaixo do carro. Escape asfaltado (deserto, rua) segura como asfalto, mas continua
 * sendo FORA da pista para o limite de pista.
 */
export function chaoEm(p: Pista, local: Local): Chao {
  const meia = p.L / 2;
  const a = Math.abs(local.lateral);
  if (a <= meia) return 'asfalto';
  const lado = local.lateral > 0 ? 0 : 1, i = local.indice;
  if (a <= meia + 13 && p.zebraEm[lado][i]) return 'zebra';
  const brita = p.britaEm[lado][i];
  if (brita > 0 && a >= meia + 14 && a <= meia + 18 + brita) return p.escapeAsfaltado[lado][i] ? 'escape' : 'brita';
  if (p.tema === 'rua' || p.tema === 'noite') return 'escape';
  return 'grama';
}

/** A distância desde a linha de chegada, de 0 a uma volta. */
export const desdeALinha = (p: Pista, distancia: number) => ((distancia % p.volta) + p.volta) % p.volta;

// ---- o mapinha ---------------------------------------------------------------------------

/** O traçado num quadro w x h, como caminho de SVG, e a conta que leva o mundo para o quadro. */
export function contorno(p: Pista, w: number, h: number, margem = 10) {
  const { minX, minY, maxX, maxY } = p.limites;
  const s = Math.min((w - 2 * margem) / (maxX - minX), (h - 2 * margem) / (maxY - minY));
  const ox = (w - (maxX - minX) * s) / 2, oy = (h - (maxY - minY) * s) / 2;
  const para = (x: number, y: number): P2 => [ox + (x - minX) * s, oy + (y - minY) * s];
  let d = '';
  for (let i = 0; i < p.n; i += 6) {
    const [x, y] = para(p.xs[i], p.ys[i]);
    d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  const l0 = pontoNaPista(p, 0, -p.L), l1 = pontoNaPista(p, 0, p.L);
  return { d: d + 'Z', para, linha: [...para(l0.x, l0.y), ...para(l1.x, l1.y)] as [number, number, number, number] };
}

/**
 * O traçado em miniatura, direto dos pontos brutos: é o desenho do cartão da pista no grid, e
 * montar a pista inteira (muros, árvores) só para uma miniatura travaria a tela por um segundo.
 */
export function miniatura(id: string, w: number, h: number, margem = 4): string {
  const bruto = TRACADOS[definicao(id).id];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < bruto.length; i += 2) {
    minX = Math.min(minX, bruto[i]); maxX = Math.max(maxX, bruto[i]);
    minY = Math.min(minY, bruto[i + 1]); maxY = Math.max(maxY, bruto[i + 1]);
  }
  const s = Math.min((w - 2 * margem) / (maxX - minX), (h - 2 * margem) / (maxY - minY));
  const ox = (w - (maxX - minX) * s) / 2, oy = (h - (maxY - minY) * s) / 2;
  let d = '';
  for (let i = 0; i < bruto.length; i += 2) {
    d += `${i ? 'L' : 'M'}${(ox + (bruto[i] - minX) * s).toFixed(1)},${(oy + (bruto[i + 1] - minY) * s).toFixed(1)}`;
  }
  return d + 'Z';
}

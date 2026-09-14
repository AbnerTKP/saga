/**
 * O quadro do Dragão Quadrado: uma grade de pixels de verdade, em baixa resolução, que a tela
 * amplia sem suavizar. Tudo o que o jogo desenha passa por aqui — personagem, cenário, placar —,
 * e nada daqui sabe de `canvas`: o mesmo código desenha na janela e num PNG de teste.
 *
 * Cor é um inteiro de 32 bits na ordem que o `ImageData` lê (ABGR, byte a byte RGBA), e ZERO é
 * transparente: colar um sprite pula o que for zero.
 */

export type Cor = number;

export type Quadro = {
  largura: number;
  altura: number;
  px: Uint32Array;
};

export function criarQuadro(largura: number, altura: number): Quadro {
  return { largura, altura, px: new Uint32Array(largura * altura) };
}

/** `#rrggbb` (ou `#rrggbbaa`) para a cor do quadro. */
export function cor(hex: string): Cor {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export const canais = (c: Cor): [number, number, number, number] =>
  [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, (c >>> 24) & 255];

export const deCanais = (r: number, g: number, b: number, a = 255): Cor =>
  ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;

/** Mistura duas cores opacas: `t` 0 é `a`, 1 é `b`. */
export function misturar(a: Cor, b: Cor, t: number): Cor {
  const [ar, ag, ab] = canais(a);
  const [br, bg, bb] = canais(b);
  return deCanais(Math.round(ar + (br - ar) * t), Math.round(ag + (bg - ag) * t), Math.round(ab + (bb - ab) * t));
}

export function limpar(q: Quadro, c: Cor = 0) {
  q.px.fill(c);
}

export function pixel(q: Quadro, x: number, y: number, c: Cor) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= q.largura || y >= q.altura) return;
  q.px[y * q.largura + x] = c;
}

export function ler(q: Quadro, x: number, y: number): Cor {
  if (x < 0 || y < 0 || x >= q.largura || y >= q.altura) return 0;
  return q.px[y * q.largura + x];
}

export function retangulo(q: Quadro, x: number, y: number, l: number, a: number, c: Cor) {
  const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(q.largura, Math.floor(x + l)), y1 = Math.min(q.altura, Math.floor(y + a));
  for (let yy = y0; yy < y1; yy++) q.px.fill(c, yy * q.largura + x0, yy * q.largura + x1);
}

/** Linha de um pixel de espessura (Bresenham), para detalhe: risco de músculo, fio, faísca. */
export function linha(q: Quadro, x0: number, y0: number, x1: number, y1: number, c: Cor) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pixel(q, x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/**
 * Cola um sprite no quadro, pulando o transparente. `espelhar` vira na horizontal — é assim que
 * o mesmo desenho luta para os dois lados. `tinta`, se vier, pinta tudo o que é opaco de uma cor
 * só (o clarão de quem levou o golpe).
 */
export function colar(q: Quadro, s: Quadro, x: number, y: number, espelhar = false, tinta: Cor | null = null) {
  x = Math.round(x); y = Math.round(y);
  const x0 = Math.max(0, x), y0 = Math.max(0, y);
  const x1 = Math.min(q.largura, x + s.largura), y1 = Math.min(q.altura, y + s.altura);
  for (let yy = y0; yy < y1; yy++) {
    const linhaS = (yy - y) * s.largura;
    const linhaQ = yy * q.largura;
    for (let xx = x0; xx < x1; xx++) {
      const sx = espelhar ? s.largura - 1 - (xx - x) : xx - x;
      const c = s.px[linhaS + sx];
      if (c !== 0) q.px[linhaQ + xx] = tinta ?? c;
    }
  }
}

/** Escurece (ou clareia, com `t` negativo) o quadro inteiro na direção de uma cor — o clarão do especial. */
export function velar(q: Quadro, c: Cor, t: number) {
  for (let i = 0; i < q.px.length; i++) q.px[i] = misturar(q.px[i], c, t);
}

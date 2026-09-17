/**
 * O que as telas da Urna dividem: a tela de 384x216 do Dragão Quadrado, as regiões clicáveis que
 * cada desenho devolve (o mouse acerta o que se vê porque sai da mesma conta) e os rostos.
 */
import { type Cor, type Quadro, cor, criarQuadro, pixel, retangulo } from '../dragao/quadro.ts';
import { medir } from '../dragao/fonte.ts';
import { RETRATOS, type Retrato } from './retratos.ts';

export const W = 384;
export const H = 216;

export type AlvoDaUrna =
  | { tipo: 'tecla'; tecla: Tecla }
  | { tipo: 'votarDeNovo' }
  | { tipo: 'sair' }
  | { tipo: 'cola' };

export type Tecla = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'branco' | 'corrige' | 'confirma';

export type Regiao = { x: number; y: number; l: number; a: number; alvo: AlvoDaUrna };

/** A de cima é a última desenhada. */
export function regiaoEm(regioes: Regiao[], x: number, y: number): Regiao | null {
  for (let i = regioes.length - 1; i >= 0; i--) {
    const r = regioes[i];
    if (x >= r.x && y >= r.y && x < r.x + r.l && y < r.y + r.a) return r;
  }
  return null;
}

export const PRETO = cor('#15161a');
export const BRANCO = cor('#f4f4ef');

/** Caixa com borda de um pixel. */
export function caixa(q: Quadro, x: number, y: number, l: number, a: number, fundo: Cor, borda: Cor) {
  retangulo(q, x, y, l, a, borda);
  retangulo(q, x + 1, y + 1, l - 2, a - 2, fundo);
}

/** O texto que não cabe perde o fim e ganha reticências. */
export function caber(t: string, largura: number): string {
  const s = t.toUpperCase();
  if (medir(s) <= largura) return s;
  let r = s;
  while (r.length > 1 && medir(`${r}...`) > largura) r = r.slice(0, -1);
  return `${r.trimEnd()}...`;
}

const SIMBOLOS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const prontos = new Map<string, Quadro>();

function montar(r: Retrato): Quadro {
  const q = criarQuadro(r.l, r.a);
  const paleta = r.paleta.map(cor);
  for (let i = 0; i < r.px.length; i++) q.px[i] = paleta[SIMBOLOS.indexOf(r.px[i])];
  return q;
}

/** O rosto de uma chapa, montado uma vez e guardado. */
export function rosto(numero: number, quem: 'titular' | 'vice'): Quadro | null {
  const chave = `${numero}-${quem}`;
  let q = prontos.get(chave);
  if (!q) {
    const r = RETRATOS[numero]?.[quem];
    if (!r) return null;
    q = montar(r);
    prontos.set(chave, q);
  }
  return q;
}

/** O rosto reduzido pela metade (um pixel de cada dois), para a apuração. */
export function rostoPequeno(numero: number): Quadro | null {
  const chave = `${numero}-pequeno`;
  let q = prontos.get(chave);
  if (!q) {
    const g = rosto(numero, 'titular');
    if (!g) return null;
    // Só a cabeça: o terço de baixo da foto é ombro e paletó.
    const l = 15, a = 15;
    q = criarQuadro(l, a);
    for (let y = 0; y < a; y++) for (let x = 0; x < l; x++) pixel(q, x, y, g.px[(y * 2 + 2) * g.largura + x * 2]);
    prontos.set(chave, q);
  }
  return q;
}

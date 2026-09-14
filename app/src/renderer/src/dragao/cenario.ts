/**
 * Os cenários: camadas de pixels desenhadas UMA vez e coladas a cada quadro, cada uma andando
 * numa fração do movimento da câmera (a montanha do fundo anda menos que a arquibancada). O que
 * se mexe sozinho — nuvem, água, plateia — vai em `animar`, por cima das camadas e atrás dos
 * lutadores. Tudo determinístico: o sorteio tem semente, e é o mesmo cenário em todo computador.
 */
import { type Cor, type Quadro, colar, criarQuadro, misturar, retangulo } from './quadro.ts';
import { TELA } from './medidas.ts';

export type Camada = {
  quadro: Quadro;
  /** Quanto a camada anda com a câmera: 0 parada (céu), 1 junto com o chão. */
  fator: number;
  /** Onde a camada começa na tela, de cima. */
  y?: number;
  /** Repete na horizontal (nuvens, mar); sem isso ela precisa ter a largura que a câmera alcança. */
  repetir?: boolean;
};

export type Cenario = {
  id: string;
  nome: string;
  /** A largura do mundo: a câmera anda de 0 a `largura - TELA.largura`. */
  largura: number;
  /** Atrás dos lutadores, do fundo para a frente. */
  camadas: Camada[];
  /** Na frente dos lutadores (grama alta, poeira do chão). Pouca coisa: tapa a luta. */
  frente?: Camada[];
  /** O que se mexe sozinho, desenhado depois das camadas. `tique` conta quadros a 60 por segundo. */
  animar?: (q: Quadro, camX: number, tique: number) => void;
  /** A cor que cobre a tela no clarão de um especial. */
  clarao?: Cor;
};

export function colarCamada(q: Quadro, c: Camada, camX: number) {
  const x = -Math.round(camX * c.fator);
  const y = c.y ?? 0;
  if (!c.repetir) { colar(q, c.quadro, x, y); return; }
  const l = c.quadro.largura;
  let x0 = ((x % l) + l) % l - l;
  for (; x0 < q.largura; x0 += l) colar(q, c.quadro, x0, y);
}

export function desenharCenario(q: Quadro, c: Cenario, camX: number, tique: number) {
  for (const camada of c.camadas) colarCamada(q, camada, camX);
  c.animar?.(q, camX, tique);
}

export function desenharFrente(q: Quadro, c: Cenario, camX: number) {
  for (const camada of c.frente ?? []) colarCamada(q, camada, camX);
}

/** A largura que uma camada precisa ter para cobrir a câmera inteira andando no fator dela. */
export const larguraDaCamada = (c: { largura: number }, fator: number) =>
  Math.ceil(TELA.largura + (c.largura - TELA.largura) * fator) + 1;

/** Sorteio com semente (mulberry32): o mesmo cenário em todo computador. */
export function sorteio(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Pontilhado ordenado 4x4: `t` de 0 a 1 diz quantos pixels da cor de cima viram a de baixo. */
export const pontilhar = (x: number, y: number, t: number) => t * 16 > BAYER[(y & 3) * 4 + (x & 3)] + 0.5;

/**
 * Céu (ou qualquer faixa) em degraus de cor com pontilhado na passagem — o degradê de pixel art:
 * nada de cor intermediária inventada, só as da paleta, misturadas no padrão.
 */
export function degrade(q: Quadro, y0: number, y1: number, cores: Cor[], passagem = 6) {
  const faixas = cores.length;
  const alt = (y1 - y0) / faixas;
  for (let y = y0; y < y1; y++) {
    const pos = (y - y0) / alt;
    const i = Math.min(faixas - 1, Math.floor(pos));
    const dentro = (pos - i) * alt;
    const restante = alt - dentro;
    for (let x = 0; x < q.largura; x++) {
      let c = cores[i];
      if (i + 1 < faixas && restante < passagem && pontilhar(x, y, 1 - restante / passagem)) c = cores[i + 1];
      q.px[y * q.largura + x] = c;
    }
  }
}

export { criarQuadro, retangulo, misturar };

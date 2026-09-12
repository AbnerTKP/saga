import type { Quina } from './flutuante.ts';

/**
 * Redimensionar a janela do overlay puxando uma quina.
 *
 * Uma janela SEM MOLDURA não tem borda para agarrar: quem faz o papel dela é uma quina
 * desenhada por nós, e a conta de para onde a janela cresce é a mesma que o quadro
 * flutuante faz dentro do app — a quina oposta fica parada, e a proporção manda. A
 * diferença é que aqui não há barra embaixo: o overlay é 16:9 puro, e as coordenadas são
 * as da TELA, não as do palco.
 *
 * Puro e testado porque é conta que erra calado: puxar para a esquerda cresce a largura E
 * anda com o x, e trocar um sinal faz a janela fugir do ponteiro.
 */

export type Janela = { x: number; y: number; width: number; height: number };

/** Abaixo disto não se vê mais o que está acontecendo na live. */
export const MIN = 192;
/** Acima disto já não é overlay: é o jogo que vira a janela pequena. */
export const MAX = 1920;

export const alturaDe = (width: number): number => Math.round((width * 9) / 16);

export function esticarJanela(inicio: Janela, quina: Quina, dx: number, dy: number): Janela {
  const paraDireita = quina === 'ne' || quina === 'se';
  const paraBaixo = quina === 'se' || quina === 'sw';
  const porX = inicio.width + (paraDireita ? dx : -dx);
  const porY = (alturaDe(inicio.width) + (paraBaixo ? dy : -dy)) * (16 / 9);
  // Na diagonal, manda a direção que o ponteiro andou mais: com a proporção presa, as duas
  // não podem valer ao mesmo tempo.
  const bruta = Math.abs(dy) > Math.abs(dx) ? porY : porX;
  const width = Math.round(Math.min(MAX, Math.max(MIN, bruta)));
  const height = alturaDe(width);
  return {
    x: paraDireita ? inicio.x : inicio.x + (inicio.width - width),
    y: paraBaixo ? inicio.y : inicio.y + (alturaDe(inicio.width) - height),
    width,
    height,
  };
}

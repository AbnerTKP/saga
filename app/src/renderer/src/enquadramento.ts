// Onde a foto e o banner ficam dentro do espaço em que aparecem.
//
// O app não recorta: recortar é redesenhar a imagem, e um GIF redesenhado perde a
// animação — justamente o que o Berserk destrava. Guardamos onde a imagem foi
// arrastada e o quanto foi aproximada, e aplicamos isso na hora de mostrar.
//
// As mesmas regras existem em `server/enquadramento.mjs`, porque o que vem daqui nunca é
// palavra final. O que só existe aqui é `estilo()`: quem desenha é a tela.

import type { CSSProperties } from 'react';

export type Enquadramento = { x: number; y: number; zoom: number };
export type Papel = 'foto' | 'banner';
/** O que vem do servidor junto de cada pessoa. Papel sem ajuste simplesmente não vem. */
export type Enquadramentos = Partial<Record<Papel, Enquadramento>>;

export const PADRAO: Enquadramento = { x: 50, y: 50, zoom: 1 };
export const ZOOM_MAXIMO = 4;

const entre = (n: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, n));

export const limpar = (e: Partial<Enquadramento> | null | undefined): Enquadramento => ({
  x: entre(Number.isFinite(e?.x) ? Number(e?.x) : PADRAO.x, 0, 100),
  y: entre(Number.isFinite(e?.y) ? Number(e?.y) : PADRAO.y, 0, 100),
  zoom: entre(Number.isFinite(e?.zoom) ? Number(e?.zoom) : PADRAO.zoom, 1, ZOOM_MAXIMO),
});

export const ehPadrao = (e: Enquadramento) =>
  e.x === PADRAO.x && e.y === PADRAO.y && e.zoom === PADRAO.zoom;

/**
 * O estilo que põe a imagem no lugar escolhido.
 *
 * `object-fit: cover` já preenche o espaço; `object-position` decide que parte da imagem
 * fica visível, e a escala aproxima. Esta é a única conta que existe — o editor mostra a
 * prévia com ela, e a tela desenha com ela. É o que garante que o resultado seja o que a
 * pessoa viu ao ajustar.
 */
export function estilo(e: Enquadramento | null | undefined): CSSProperties {
  const { x, y, zoom } = limpar(e ?? PADRAO);
  return {
    objectFit: 'cover',
    objectPosition: `${x}% ${y}%`,
    ...(zoom > 1 ? { transform: `scale(${zoom})`, transformOrigin: `${x}% ${y}%` } : {}),
  };
}

/** Arrastar move o enquadramento na direção contrária ao dedo: a imagem é que anda. */
export function arrastar(
  atual: Enquadramento,
  deltaX: number,
  deltaY: number,
  largura: number,
  altura: number,
): Enquadramento {
  if (!(largura > 0) || !(altura > 0)) return atual;
  return limpar({
    ...atual,
    x: atual.x - (deltaX / largura) * 100,
    y: atual.y - (deltaY / altura) * 100,
  });
}

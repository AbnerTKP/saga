import { useMemo } from 'react';

/**
 * O `{ __html }` do `dangerouslySetInnerHTML`, o MESMO objeto enquanto o texto não muda.
 *
 * No React 19 a comparação é pelo OBJETO, e não pelo texto: `dangerouslySetInnerHTML={{ __html: x }}`
 * escrito no JSX é um objeto novo a cada desenho, e o React refaz o innerHTML inteiro — mesmo com o
 * texto idêntico. Medido na mesa do Catan (06/10/2026): o fundo do tabuleiro (milhares de árvores,
 * ovelhas e pedras) e o sprite das cartas eram jogados fora e montados de novo a cada leitura da
 * partida (800 ms) — ~1.450 objetos refeitos no layout, de 1.700, sem nada ter mudado. É o
 * `html.test.ts` que barra o objeto escrito no JSX.
 */
export function useHtml(texto: string): { __html: string } {
  return useMemo(() => ({ __html: texto }), [texto]);
}

/** Para o texto que nunca muda (uma constante do módulo): o objeto feito uma vez, fora do componente. */
export const htmlFixo = (texto: string): { __html: string } => ({ __html: texto });

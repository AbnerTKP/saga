/**
 * A frase de quem está escrevendo agora.
 *
 * Fica longe da tela porque o que dá para errar aqui é redação, não desenho: singular e
 * plural, a vírgula antes do "e", e o ponto em que a lista deixa de caber e vira "várias
 * pessoas". A linha do chat é estreita — nomes de gente não são curtos, e três deles por
 * extenso já passam da largura de qualquer janela que o pessoal use.
 */

/** Acima disto a lista não cabe, e contar quem é deixa de importar: importa que tem gente. */
export const CABEM = 3;

export function fraseDeQuemDigita(nomes: string[]): string | null {
  if (nomes.length === 0) return null;
  if (nomes.length === 1) return `${nomes[0]} está digitando`;
  if (nomes.length > CABEM) return 'várias pessoas estão digitando';
  const ultimo = nomes[nomes.length - 1];
  return `${nomes.slice(0, -1).join(', ')} e ${ultimo} estão digitando`;
}

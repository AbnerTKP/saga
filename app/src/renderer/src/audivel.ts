/**
 * Quem se ouve e quem não. Uma regra só, num lugar só.
 *
 * A do soundboard e a do microfone são simples: só a surdez cala. A da live é que tem
 * história — **só a live que está no palco é ouvida**. Com duas pessoas transmitindo,
 * ouvir as duas ao mesmo tempo é uma sopa em que não se entende nenhuma.
 *
 * O que estava errado era o "nenhuma no palco". A regra antiga só calava uma live quando
 * havia OUTRA em destaque; sem destaque nenhum, ela não calava nada — e "nada calado"
 * quer dizer *todas tocando*. Era o que acontecia ao parar de assistir: os vídeos sumiam
 * da tela, o palco ficava vazio, e o som das lives todas continuava. Aqui,
 * `liveNoPalco: null` significa silêncio, não festa.
 */
export type Faixa = {
  /** Áudio de transmissão de tela. Microfone e soundboard não são. */
  ehLive: boolean;
  identity: string;
};

export type Estado = {
  surdo: boolean;
  /** De quem a pessoa escolheu não receber a live. */
  cortadas: ReadonlySet<string>;
  /** A live em destaque — ou, se o destaque for uma câmera, a primeira que estiver no ar. */
  liveNoPalco: string | null;
};

export const mudo = (faixa: Faixa, estado: Estado): boolean => {
  if (estado.surdo) return true;
  if (!faixa.ehLive) return false;
  if (estado.cortadas.has(faixa.identity)) return true;
  return faixa.identity !== estado.liveNoPalco;
};

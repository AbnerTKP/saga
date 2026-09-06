/**
 * Quem se ouve e quem não. Uma regra só, num lugar só.
 *
 * A do soundboard e a do microfone são simples: só a surdez cala. A da transmissão é que
 * tem história — **só a que está no palco é ouvida**. Com duas pessoas transmitindo,
 * ouvir as duas ao mesmo tempo é uma sopa em que não se entende nenhuma.
 *
 * O que estava errado era o "nenhuma no palco". A regra antiga só calava uma quando havia
 * OUTRA em destaque; sem destaque nenhum, ela não calava nada — e "nada calado" quer
 * dizer *todas tocando*. Aqui, `liveNoPalco: null` significa silêncio, não festa.
 *
 * Hoje a transmissão que não está no palco nem chega — é desinscrita, então não existe
 * elemento de áudio para ela. Esta regra continua valendo como a segunda tranca, para o
 * instante entre a faixa chegar e a inscrição ser cortada.
 */
export type Faixa = {
  /** Áudio de transmissão de tela. Microfone e soundboard não são. */
  ehLive: boolean;
  identity: string;
};

export type Estado = {
  surdo: boolean;
  /** Quem esta pessoa escolheu assistir. `null` = ninguém. */
  liveNoPalco: string | null;
};

export const mudo = (faixa: Faixa, estado: Estado): boolean => {
  if (estado.surdo) return true;
  if (!faixa.ehLive) return false;
  return faixa.identity !== estado.liveNoPalco;
};

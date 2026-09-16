/**
 * O Goiaba da Super Feira: o Goiaba do zip, pixel a pixel, com a roupa da fase nova — o que era
 * azul (a camiseta por baixo do quimono, os punhos, a faixa e as botas) vai ao marinho. A
 * transformação é o Blue: o cabelo arrepiado do Super Goiabadin levado ao azul pelo brilho, e o
 * olho azul.
 */
import { tingir } from './arte.ts';
import { ROUPA_GOIABA, type Rampa, type Roupa, trocarRampa } from './materiais.ts';
import { pecasDoGoiaba, vestirPecas } from './pecas.ts';
import { registrarPixel } from './sprites.ts';

/** O marinho da fase nova: bem mais fundo que o azul do zip, para os dois Goiabas não se confundirem lado a lado. */
const MARINHO: Rampa = [
  ['#02030a', '#000000', '#050714'], ['#0b1440', '#0e1848'], ['#15225e', '#1a2a6a', '#122058', '#0b1440'],
  ['#223a8a', '#1f3584', '#284294', '#1c3078'], ['#3b5bb4', '#4466bc'],
];

export const ROUPA_GOIABA_SUPER: Roupa = { ...ROUPA_GOIABA, manga: MARINHO, faixa: MARINHO, bota: MARINHO };

/** O cabelo do Blue: ciano na luz, azul-rei na sombra e contorno anil. */
export const AZUL_BLUE: Rampa = [['#0a2466'], ['#1554b8'], ['#1f8fe6'], ['#4cc6f5'], ['#c4f4ff']];
/** O olho do Blue: a íris e a pupila azuis; o branco fica. */
export const OLHO_BLUE: Rampa = [['#062a52'], ['#0a4f9a'], ['#1c8fe0'], ['#fbf3fe'], ['#fbfafe']];

registrarPixel('goiabaSuper', () => ({
  pecas: [vestirPecas(pecasDoGoiaba(0), ROUPA_GOIABA_SUPER), vestirPecas(pecasDoGoiaba(1), ROUPA_GOIABA_SUPER)],
  roupa: ROUPA_GOIABA_SUPER,
  forma1: (a) => tingir(a, (c, m) => (m === 'cabelo' ? trocarRampa(c, ROUPA_GOIABA.cabelo, AZUL_BLUE, -0.7)
    : m === 'olho' ? trocarRampa(c, ROUPA_GOIABA.olho, OLHO_BLUE) : c)),
}));

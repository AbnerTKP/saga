/**
 * O Gotinha (a paródia do Goten criança) no corpo do Goiaba: é o pai em miniatura, como na obra —
 * o quimono laranja com as mangas compridas azuis por baixo. O que o separa do Goiaba é o cabelo
 * preto (o da Goteira) e o pé: caneleira marinho e sapato preto.
 *
 * A forma 1 é o Super Gotinha: o cabelo arrepiado do Super Goiabadin, dourado, e o olho verde-água.
 */
import { tingir } from './arte.ts';
import { PRETO, SAPATO } from './goteira.ts';
import { ROUPA_GOIABA, type Rampa, type Roupa, trocarRampa } from './materiais.ts';
import { pecasDoGoiaba, vestirPecas } from './pecas.ts';
import { OURO, registrarPixel, VERDE_AGUA } from './sprites.ts';

/** A caneleira: marinho, mais fundo que a bota azul do Goiaba. */
const CANELEIRA: Rampa = [
  ['#02030a', '#000000'], ['#0b1440', '#0e1848'], ['#15225e', '#1a2a6a', '#122058'],
  ['#223a8a', '#1f3584', '#284294'], ['#3b5bb4', '#4466bc'],
];

export const ROUPA_GOTINHA: Roupa = { ...ROUPA_GOIABA, cabelo: PRETO, bota: CANELEIRA, sola: SAPATO };

registrarPixel('gotinha', () => ({
  // o cabelo dourado sai do cabelo do zip, como o do Super Goiabadin: pelo preto, o salpicado apagava
  pecas: [vestirPecas(pecasDoGoiaba(0), ROUPA_GOTINHA), vestirPecas(pecasDoGoiaba(1), { ...ROUPA_GOTINHA, cabelo: ROUPA_GOIABA.cabelo })],
  roupa: ROUPA_GOTINHA,
  forma1: (a) => tingir(a, (c, m) => (m === 'cabelo' ? trocarRampa(c, ROUPA_GOIABA.cabelo, OURO, -0.7)
    : m === 'olho' ? trocarRampa(c, ROUPA_GOIABA.olho, VERDE_AGUA) : c)),
}));

/**
 * O Vegetal da Super Feira: a mesma cabeça e o mesmo corpo do Vegetal, com a armadura da fase nova
 * — sem as ombreiras, e o macacão num azul-rei mais claro que o marinho de antes. A transformação é
 * o Blue: o cabelo em chama levado ao azul pelo brilho, e o olho azul.
 */
import { tingir } from './arte.ts';
import { AZUL_BLUE, OLHO_BLUE } from './goiaba-super.ts';
import { type Rampa, type Roupa, trocarRampa } from './materiais.ts';
import { registrarPixel } from './sprites.ts';
import { pecasDoVegetal, ROUPA_VEGETAL } from './vegetal.ts';

const AZUL_REI: Rampa = [
  ['#040a24', '#000000', '#070d2c'], ['#12297a', '#152e84'], ['#1f43a8', '#1c3ea0', '#2449b2', '#12297a'],
  ['#3563d6', '#305dd0', '#3b6ade', '#2c56c4'], ['#5d8ff0', '#6a98f2'],
];

export const ROUPA_VEGETAL_SUPER: Roupa = { ...ROUPA_VEGETAL, manga: AZUL_REI, calca: AZUL_REI };

registrarPixel('vegetalSuper', () => {
  const pecas = pecasDoVegetal(undefined, undefined, ROUPA_VEGETAL_SUPER);
  return {
    pecas: [pecas, pecas],
    roupa: ROUPA_VEGETAL_SUPER,
    forma1: (a) => tingir(a, (c, m) => (m === 'cabelo' ? trocarRampa(c, ROUPA_VEGETAL.cabelo, AZUL_BLUE, -0.4)
      : m === 'olho' ? trocarRampa(c, ROUPA_VEGETAL.olho, OLHO_BLUE) : c)),
  };
});

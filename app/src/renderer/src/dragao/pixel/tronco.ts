/**
 * O Tronco (a paródia do Trunks criança) no corpo do Goiaba: quimono verde-escuro com a faixa
 * laranja, braços de fora e as botas douradas do Trunks do futuro. A cabeça é o rosto do zip com o
 * cabelo lilás, liso e redondo, a franja até a sobrancelha e a mecha tapando a orelha — e o olho
 * azul.
 *
 * A forma 1 é o Super Tronco: o mesmo corte dourado e mais arrepiado, com o olho verde-água.
 */
import { type Arte, recortar, tingir } from './arte.ts';
import { BRACO, type Cara, CARAS, comCabeca, juntar, pintarSimbolos } from './goteira.ts';
import { OLHO_BLUE } from './goiaba-super.ts';
import { type Material, ROUPA_GOIABA, type Rampa, type Roupa, trocarRampa } from './materiais.ts';
import { type Pecas, pecasDoGoiaba, vestirPecas } from './pecas.ts';
import { OURO, registrarPixel, VERDE_AGUA } from './sprites.ts';

// ——— a roupa ———

const LILAS: Rampa = [
  ['#241840', '#1c1234'], ['#57428a', '#5c4690'], ['#8670b8', '#7e68b0', '#8c78c0'],
  ['#a992d6', '#b29cdc', '#a48ed2'], ['#d6c6f4', '#cfbef0'],
];
const VERDE: Rampa = [
  ['#031208', '#000000', '#04160a'], ['#0c3a1e', '#0f4222'], ['#15582c', '#125026', '#1a6232', '#0c3a1e'],
  ['#237a3c', '#207438', '#2a8444', '#1c6c34'], ['#3f9e56', '#48a85e'],
];
const LARANJA: Rampa = [
  ['#350203', '#460207'], ['#b8400a', '#a8380c'], ['#e8660e', '#f0700f', '#e05c10'],
  ['#fd9020', '#fc9a28', '#f88618'], ['#ffc060', '#ffb44a'],
];
const DOURADO: Rampa = [
  ['#2a1204', '#1c0c02'], ['#8a560a', '#7e4e08'], ['#c9921a', '#c08814', '#d19c22'],
  ['#f0c83a', '#ecc030', '#f5d046'], ['#fff09a', '#ffe680'],
];
const SOLA: Rampa = [['#1c0c02', '#000000'], ['#4a2a08', '#40240a'], ['#6e4410', '#76480e'], ['#9a6414', '#a06a18'], ['#c89030']];

export const ROUPA_TRONCO: Roupa = {
  pele: ROUPA_GOIABA.pele,
  cabelo: LILAS,
  olho: OLHO_BLUE,
  camisa: VERDE,
  // como o colete da Goteira, o quimono dele deixa o braço de fora e o decote aberto
  manga: BRACO,
  mao: BRACO,
  faixa: LARANJA,
  calca: VERDE,
  bota: DOURADO,
  sola: SOLA,
};

// ——— a cabeça ———

/** Os símbolos: 5 a 9 é o cabelo, do contorno à luz. */
const TINTAS: Record<string, [Material, string[]]> = {
  '5': ['cabelo', LILAS[0]], '6': ['cabelo', LILAS[1]], '7': ['cabelo', LILAS[2]], '8': ['cabelo', LILAS[3]], '9': ['cabelo', LILAS[4]],
};

/**
 * O corte do Trunks, de perfil: a cúpula redonda sem espeto nenhum, a franja caindo até a
 * sobrancelha (a ponta passa um pixel na frente do rosto, como a do zip) e a mecha do lado
 * tapando a orelha até o queixo. O rosto, o olho e a boca são os do zip, por baixo.
 */
const CABELO = [
  '............5555555.............', // 4
  '..........55889998855...........', // 5
  '.........5788999998885..........', // 6
  '........578889799988885.........', // 7
  '........577888878888785.........', // 8
  '.......5677888878887885.........', // 9
  '.......5677888787877875.........', // 10
  '.......567788776....75..........', // 11
  '........56788776................', // 12
  '........5677875.................', // 13
  '.........56775..................', // 14
  '..........5665..................', // 15
];

/**
 * O cabelo do Super Tronco: o mesmo corte arrepiado — espetos no alto e na nuca, e a franja
 * apontando para a frente. Pintado em lilás como o outro; o dourado vem do `forma1`.
 */
const CABELO_SUPER = [
  '..............5.................', // 1
  '..........5..575..5.............', // 2
  '..........5755895585............', // 3
  '..........57889998885...........', // 4
  '.........5788999998885..........', // 5
  '......55578889999988885.........', // 6
  '.....577888897999888885.........', // 7
  '.......5677888878888785.........', // 8
  '......556778888788878855........', // 9
  '.....557788887878778875.........', // 10
  '.......567788776....785.........', // 11
  '........56788776.....5..........', // 12
  '........5677875.................', // 13
  '.........56775..................', // 14
  '..........5665..................', // 15
];

function pecasDoTronco(linhas: string[], y0: number): Pecas {
  const vestidas = vestirPecas(pecasDoGoiaba(0), ROUPA_TRONCO);
  const cabelo = pintarSimbolos(linhas, y0, TINTAS, 11);
  const cabecas = {} as Record<Cara, Arte>;
  for (const cara of CARAS) cabecas[cara] = juntar(0, recortar(vestidas[cara], (_x, _y, m) => m !== 'cabelo'), cabelo);
  return { ...vestidas, ...cabecas, inteiro: comCabeca(vestidas.inteiro, cabecas.cabeca) };
}

registrarPixel('tronco', () => {
  return {
    pecas: [pecasDoTronco(CABELO, 4), pecasDoTronco(CABELO_SUPER, 1)],
    roupa: ROUPA_TRONCO,
    forma1: (a) => tingir(a, (c, m) => (m === 'cabelo' ? trocarRampa(c, LILAS, OURO, -0.3)
      : m === 'olho' ? trocarRampa(c, OLHO_BLUE, VERDE_AGUA) : c)),
  };
});

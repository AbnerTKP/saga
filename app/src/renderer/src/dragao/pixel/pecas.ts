/**
 * As peças recortadas do Goiaba parado. Recorte não muda de lugar: a cabeça recortada está onde
 * estava no zip, e colar em (0, 0) devolve o parado. Mexer a peça é colar em (dx, dy).
 *
 * Linhas do zip: cabelo e rosto de 1 a 15 (o queixo encosta na 16), camisa de 16 a 20, faixa em
 * 21 e 22, calça de 23 a 26, botas de 27 a 30. O pé fica na linha 30 e o meio dele na coluna 15
 * — é a âncora.
 *
 * O que o zip não mostra vem em RETALHO: as mesmas letras e a mesma paleta do zip, pintadas por
 * cima de um recorte. É o caso do tronco sem os braços (no parado as mãos estão pintadas na
 * barriga, e com o braço no carimbo seriam três mãos), das caras de grito e de dor, e do cabelo
 * do Super Goiabadin.
 */
import { type Arte, arteDaBase, copiar, criarArte, numeroDo, recortar, tingir } from './arte.ts';
import { LINHAS_GOIABA, MATERIAIS_GOIABA, PALETA_GOIABA } from './base-goiaba.ts';
import { cor } from '../quadro.ts';
import { type Material, ROUPA_GOIABA, type Roupa, trocarRampa } from './materiais.ts';

/** Onde o pé do parado encosta no chão, nas coordenadas do zip. */
export const PE: [number, number] = [15, 30];

export type Pecas = {
  /** O zip inteiro. */
  inteiro: Arte;
  /** Cabelo, rosto e olho. */
  cabeca: Arte;
  /** A boca aberta: o grito de quem carrega, solta e apanha. */
  cabecaGrito: Arte;
  /** Os olhos fechados. */
  cabecaFechados: Arte;
  /** Olhos apertados e boca aberta: a pancada. */
  cabecaDor: Arte;
  /** Camisa, braços e faixa como estão no parado (linhas 16 a 24, sem o queixo). */
  tronco: Arte;
  /** O tronco sem os braços, para os carimbos de braço. */
  troncoLimpo: Arte;
  /** Calça e botas (linhas 25 a 30). */
  pernas: Arte;
};

const CABECA = new Set(['cabelo', 'pele', 'olho']);
const AZUIS = 'JKLNOPQYZ034567#';
const PELE = 'spwxBGmoACvz';

/**
 * Retalho em letras do zip: `linhas` começam na linha `y0` do zip (negativa para o cabelo que
 * sobe acima do quadro de 32), e o material de cada pixel sai de `materialDaLetra`.
 */
function retalho(y0: number, linhas: string[], materialDaLetra: (letra: string, x: number, y: number) => string): Arte {
  const topo = Math.max(0, -y0);
  const todas = Array.from({ length: 32 + topo }, (_, i) => linhas[i - topo - y0] ?? '.'.repeat(32));
  const mats = todas.map((l, i) => l.replace(/[^.]/g, (ch, x: number) => materialDaLetra(ch, x, i - topo)));
  const a = arteDaBase(todas, PALETA_GOIABA, mats);
  a.pivo = [0, topo];
  return a;
}

/** Troca pixels de uma peça (coordenadas do zip) por letras do zip, cada uma com o seu material. */
function editar(p: Arte, trocas: [x: number, y: number, letra: string, material: Material][]): Arte {
  const r = copiar(p);
  for (const [x, y, letra, m] of trocas) {
    const i = (y + p.pivo[1]) * p.largura + x;
    // ponto apaga: é o recorte da boca aberta no perfil
    r.cor[i] = letra === '.' ? 0 : cor(PALETA_GOIABA[letra]);
    r.mat[i] = letra === '.' ? 0 : numeroDo(m);
  }
  return r;
}

// o olho do zip é uma coluna branca (17) e uma escura (18), nas linhas 11 a 13
const OLHO_FECHADO: [number, number, string, Material][] = [
  [17, 11, 'p', 'pele'], [18, 11, 'p', 'pele'], [17, 12, 'r', 'pele'], [18, 12, 'u', 'pele'], [17, 13, 's', 'pele'], [18, 13, 's', 'pele'],
];
// a boca abre na frente do queixo, onde o rosto do zip termina
const BOCA_ABERTA: [number, number, string, Material][] = [
  [18, 14, 'A', 'pele'], [19, 14, 'u', 'pele'], [20, 14, 'y', 'pele'], [21, 14, '.', 'pele'],
  [19, 15, 'S', 'pele'], [20, 15, 'u', 'pele'],
];

/**
 * O cabelo do Super Goiabadin: a silhueta do zip com as pontas levantadas — a de cima sobe dois
 * pixels, a da frente vira para o alto e as duas de trás apontam para cima em vez de para trás. O
 * miolo é o salpicado do próprio zip; o dourado vem depois, pelo brilho de cada pixel.
 */
const CABELO_SUPER = [
  '.................k..............',
  '................bj..............',
  '...............beb..b...........',
  '...............kfd.jk...........',
  '..............bck.dej...........',
  '........b.....dcfked............',
  '........beb..keiieeb............',
  '.....b..bieceeiliiek............',
  '.....beb.ceeiciiiieik...........',
  '.....beceeeeiciiiieiek..........',
  '......jfggeeeieiicmeiek.........',
  '......becceecicincoceij.........',
  '.......knncccnnepqrpcb..........',
  '........bcccnssnstusv...........',
  '.......bkcccewxsstyswz..........',
  '.........bgcccwssssssz..........',
  '...........nakAsBsssC...........',
  '................GbHz............',
];

export function pecasDoGoiaba(forma: 0 | 1 = 0): Pecas {
  const base = arteDaBase(LINHAS_GOIABA, PALETA_GOIABA, MATERIAIS_GOIABA);
  const cabeca = forma === 0
    ? recortar(base, (_x, y, m) => y <= 16 && CABECA.has(m!))
    : retalho(-1, CABELO_SUPER, (ch, x, y) => (y >= 0 && y <= 16 && MATERIAIS_GOIABA[y][x] !== 'c' && MATERIAIS_GOIABA[y][x] !== '.'
      ? MATERIAIS_GOIABA[y][x] : PELE.includes(ch) && y >= 9 ? 'p' : 'c'));
  const inteiro = forma === 0 ? base : (() => {
    const a = criarArte(32, 32 + cabeca.pivo[1], cabeca.pivo);
    const semCabeca = recortar(base, (_x, y, m) => !(y <= 16 && CABECA.has(m!)));
    for (const p of [semCabeca, cabeca]) {
      for (let y = 0; y < p.altura; y++) for (let x = 0; x < p.largura; x++) {
        const i = y * p.largura + x;
        if (!p.mat[i]) continue;
        const j = (y - p.pivo[1] + a.pivo[1]) * a.largura + x;
        a.cor[j] = p.cor[i]; a.mat[j] = p.mat[i];
      }
    }
    return a;
  })();
  return {
    inteiro,
    cabeca,
    cabecaGrito: editar(cabeca, BOCA_ABERTA),
    cabecaFechados: editar(cabeca, OLHO_FECHADO),
    cabecaDor: editar(cabeca, [...OLHO_FECHADO, ...BOCA_ABERTA]),
    tronco: recortar(base, (_x, y, m) => y >= 16 && y <= 24 && !CABECA.has(m!)),
    // os braços do parado viram camisa, e o azul da faixa desce inteiro na 21 e 22
    troncoLimpo: retalho(16, [
      '............uDEFMNz.............',
      '...........uIEDFMNz.............',
      '...........b2DEDIDQb............',
      '...........b2I1EDIIbb...........',
      '...........b2DIDVWXub...........',
      '............hZYYZOKu............',
      '............hO00ZKMu............',
      '............h2EE11Az............',
      '............bE221IXh............',
    ], (ch, _x, y) => (y >= 23 ? 'k' : y >= 21 ? (AZUIS.includes(ch) ? 'f' : 'k') : AZUIS.includes(ch) ? 'm' : 'r')),
    pernas: recortar(base, (_x, y) => y >= 25),
  };
}

/**
 * O corpo do Goiaba com a roupa de outro lutador: cada pixel de cada peça troca de rampa pelo
 * brilho, no material dele — o salpicado do zip continua, só que verde, roxo ou branco. É assim
 * que Vegetal, Picolé e Geladeira ganham o corpo e as poses: dão a roupa, trocam as quatro cabeças
 * (`cabeca`, `cabecaGrito`, `cabecaFechados`, `cabecaDor`, e o `inteiro` com ela) e pintam os
 * carimbos com a mesma roupa.
 */
export function vestirPecas(pecas: Pecas, roupa: Roupa, de: Roupa = ROUPA_GOIABA): Pecas {
  const vestida = {} as Pecas;
  for (const nome of Object.keys(pecas) as (keyof Pecas)[]) {
    vestida[nome] = tingir(pecas[nome], (c, m) => trocarRampa(c, de[m], roupa[m]));
  }
  return vestida;
}


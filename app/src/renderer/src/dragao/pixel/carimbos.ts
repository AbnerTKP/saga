/**
 * O acervo de carimbos: o que o Goiaba parado não tem — braço esticado, perna no ar, corpo
 * deitado —, desenhado à mão no acabamento do zip. São MATERIAIS e não cores (ver
 * `materiais.ts`): minúscula é sombra, maiúscula base, dígito luz, `#` contorno.
 *
 *   p P 1 pele     r R 2 camisa   m M 3 manga    l L 4 mão      f F 5 faixa
 *   k K 6 calça    b B 7 bota     s S 8 sola     c C 9 cabelo   o O 0 olho
 *
 * O pivô é onde o carimbo se prende: o ombro no braço, o quadril na perna. Tudo olha para a
 * direita, como o zip; a raiz do braço e da perna não tem contorno, porque some dentro do corpo.
 * As medidas são as do zip: braço de 3 pixels, punho de 4, perna de 4, bota de 4 — mais fino
 * que isso o membro vira risco perto do tronco gordo dele.
 */
import type { Carimbo } from './arte.ts';

export const CARIMBOS = {
  // ——— braços (pivô no ombro) ———

  /** Soco reto, na altura do ombro. */
  bracoSoco: {
    pivo: [0, 3],
    linhas: [
      '.........###',
      '.########4LL#',
      'RR3MMMM#LLLL#',
      'rRMMMMm#LLLL#',
      'mmmmmmm#lLLl#',
      '.########lll#',
      '.........###',
    ],
  },
  /** O punho da guarda, na frente do queixo (acima tapava a boca): o braço dobrado junto às costelas. */
  punhoGuarda: {
    pivo: [1, 3],
    linhas: [
      '......####',
      '.....#4LLL#',
      '.....#LLLL#',
      'RM...#LLLl#',
      'MMM.##lll#',
      'mMMMMMMm#',
      '#mmmmmmm#',
      '.#######',
    ],
  },
  /** O soco que sobe: braço na diagonal, punho na frente da testa. */
  bracoCima: {
    pivo: [1, 10],
    linhas: [
      '.........####',
      '........#4LLL#',
      '........#LLLL#',
      '.......##LLLl#',
      '......#3#lll#',
      '.....#3MM####',
      '....#3MMm#',
      '...#3MMm#',
      '..#3MMm#',
      '.#RMMm#',
      'RRRMm#',
      'rrmm#',
      '####',
    ],
  },
  /** Mão aberta à frente, a palma virada para o adversário (a rajada). */
  maoAberta: {
    pivo: [0, 4],
    linhas: [
      '........#.#',
      '.......#4#4#',
      '.#######LLL#',
      'RR3MMMM#LLL#',
      'rRMMMMm#LL#',
      'mmmmmmm#lL#',
      '.#######l#',
      '........#',
    ],
  },
  /** O braço da frente cruza a barriga e as mãos se fecham em concha junto ao quadril de trás. */
  maosNoQuadril: {
    pivo: [6, 0],
    linhas: [
      '.....#RR#',
      '....#3MMm#',
      '...#3MMm#',
      '..#4LMm#',
      '.#4LLLl#',
      '#LLLLll#',
      '#lLlll#',
      '.#####',
    ],
  },
  /** O antebraço em pé na frente do rosto, adiante do olho (em cima dele a cara sumia): a defesa. */
  bracoDefesa: {
    pivo: [1, 8],
    linhas: [
      '......####',
      '.....#4LLL#',
      '.....#LLLL#',
      '.....#LLLl#',
      '.....#lll#',
      '.....#3MM#',
      '.....#MMm#',
      '.....#MMm#',
      'RM...#MMm#',
      'MMM.##MMm#',
      'mMMMMMMmm#',
      '#mmmmmmm#',
      '.#######',
    ],
  },
  /** O braço largado, caindo ao lado do corpo. */
  bracoSolto: {
    pivo: [1, 0],
    linhas: [
      'RRM#',
      'rMMm#',
      '#3Mm#',
      '#MMm#',
      '#MMm#',
      '#4LL#',
      '#LLLl#',
      '#lLll#',
      '.####',
    ],
  },
  /** O braço jogado para trás e para cima: quem apanhou. */
  bracoJogado: {
    pivo: [7, 8],
    linhas: [
      '.####',
      '#4LLL#',
      '#LLLl#',
      '#lll##',
      '.##3MM#',
      '...#3MM#',
      '....#MMm#',
      '.....#MMm',
      '......#mR',
    ],
  },
  /** O punho fechado e empurrado para baixo, o cotovelo aberto: carregando a força. */
  punhoTenso: {
    pivo: [1, 0],
    linhas: [
      'RRM#',
      'rMMm#',
      '#3MMm#',
      '.#MMMm#',
      '..#MMm#',
      '..#4LL##',
      '..#LLLL#',
      '..#LLLl#',
      '...####',
    ],
  },
  /** O braço que fica para trás na corrida, o punho atrás do quadril. */
  bracoAtras: {
    pivo: [7, 0],
    linhas: [
      '......#RR',
      '.....#3MM',
      '....#3MMm',
      '..##MMmm#',
      '.#4LMmm#',
      '#4LLl##',
      '#LLll#',
      '.####',
    ],
  },
  /** A mão apoiada no chão, atrás: a rasteira e o levantar. */
  bracoApoio: {
    pivo: [4, 0],
    linhas: [
      '...#RR',
      '..#3MM',
      '.#3MMm',
      '.#MMm#',
      '#4LL#',
      '#lLl#',
    ],
  },

  // ——— pernas (pivô no quadril; a última linha é o chão) ———

  /** A perna de apoio, reta. */
  pernaApoio: {
    pivo: [2, 0],
    linhas: [
      '#KKK6#',
      '#kKKK#',
      '#bB7B#',
      '#bBBB#',
      '#bBBBB#',
      '#sSSSs#',
    ],
  },
  /** A guarda: perna da frente adiante, a de trás para trás, o quadril no meio. */
  pernasGuarda: {
    pivo: [7, 0],
    linhas: [
      '...#kKKKK6K#...',
      '..#kKKK#KKKK#..',
      '.#kKKK#.#kKKK#.',
      '#bBBb#..#B7BB#.',
      '#bBBb#..#bBBBB#',
      '#sSSs#..#sSSSs#',
    ],
  },
  /** Chute reto, na altura do quadril: a sola virada para o adversário, a ponta do pé para cima. */
  pernaChute: {
    pivo: [0, 3],
    linhas: [
      '........###',
      '########B7s#',
      'K6KKKK6#bBS#',
      'KKKKKKK#bBS#',
      'kkKKKkk#bBs#',
      '########bbs#',
      '........###',
    ],
  },
  /** Chute alto, na diagonal. */
  pernaAlta: {
    pivo: [0, 9],
    linhas: [
      '.........####',
      '........#B7Bs#',
      '.......#bBBBS#',
      '......#bBBBs#',
      '.....#K#bbs#',
      '....#K6K###',
      '...#K6KKk#',
      '..#K6KKk#',
      '.#KKKKk#',
      'KKKKKk#',
      'kkkkk#',
      '####',
    ],
  },
  /** O joelho levantado: coxa deitada, canela pendurada. */
  joelhoAlto: {
    pivo: [0, 2],
    linhas: [
      '#######',
      'KK6KKK6#',
      'KKKKKKKk#',
      'kkkkkKKk#',
      '#####bBB#',
      '....#bB7#',
      '....#bBB#',
      '....#sSSs#',
      '.....####',
    ],
  },
  /** O passo: a perna da frente adiante no calcanhar, a de trás na ponta do pé. */
  pernasPassada: {
    pivo: [8, 0],
    linhas: [
      '....#kKKKK6K#.....',
      '...#kKKK#KKKKK#...',
      '..#kKK#..#kKKKK#..',
      '.#bBBb#...#B7BB#..',
      '#bBBBb#...#bBBBB#.',
      '#sSSSs#...#sSSSSs#',
    ],
  },
  /** O outro passo: a perna de trás (a escura) vai adiante. */
  pernasPassada2: {
    pivo: [8, 0],
    linhas: [
      '....#K6KKKKk#.....',
      '...#KKKKK#Kkkk#...',
      '..#KKKK#..#kkKk#..',
      '.#BB7B#...#bBbb#..',
      '#BBBBB#...#bbBbb#.',
      '#sSSSs#...#sSSss#.',
    ],
  },
  /** Agachado: joelhos para a frente, as botas no chão, o quadril baixo. */
  pernasAgachado: {
    pivo: [6, 0],
    linhas: [
      '...#kKKKKK66KK#',
      '..#kKKK#KKKKKKK#',
      '.#bBBb#.#bB7BB#',
      '#sSSSs#.#sSSSSs#',
    ],
  },
  /** No ar, encolhido: os joelhos sobem na frente e as botas ficam debaixo do quadril. */
  pernasPulo: {
    pivo: [4, 1],
    linhas: [
      '....####..',
      '..##KK6K#.',
      '.#kKKKKKK#',
      '#kKKKKKKK#',
      '#bBBkK#kk#',
      '#bB7B##.#.',
      '#sSSs#....',
      '.####.....',
    ],
  },
  /** Descendo: as pernas soltas, as pontas dos pés para baixo. */
  pernasQueda: {
    pivo: [4, 0],
    linhas: [
      '.#kKKKK6#',
      '#kKK#KKKK#',
      '#bB#.#B7B#',
      '#bB#.#bBB#',
      '#sS#.#bBB#',
      '.##..#sSs#',
    ],
  },
  /** O meio do passo: a perna da frente pisa, a de trás passa no ar com o joelho dobrado. */
  pernasCruzando: {
    pivo: [5, 0],
    linhas: [
      '..#kKKK6#.',
      '.#kk#KKKK#',
      '#bBb##B7B#',
      '#sSs##BBB#',
      '.###.#BBBB#',
      '.....#sSSs#',
    ],
  },
  /** O outro meio do passo: a de trás pisa, a da frente passa no ar. */
  pernasCruzando2: {
    pivo: [5, 0],
    linhas: [
      '..#kKKK6K#.',
      '.#kkK#KKKK#',
      '.#bBb#bB7B#',
      '.#bBb#BBBB#',
      '.#bBBb#sSSs#',
      '.#sSSs#.###',
    ],
  },
  /** O chute voador: a perna esticada na diagonal para baixo, a sola na frente. */
  pernaVoadora: {
    pivo: [0, 2],
    linhas: [
      '#####',
      'KKKK6#',
      'kKKKKK#',
      '#kKKK6K#',
      '.#kKKKK#',
      '..#kKKK##',
      '...#bBB7B#',
      '....#bBBBs#',
      '.....#bBBS#',
      '......#bbs#',
      '.......###',
    ],
  },
  /** Ajoelhado: a perna da frente pisa com o joelho em cima, a de trás com o joelho no chão. */
  pernasAjoelhado: {
    pivo: [8, 0],
    linhas: [
      '.......#kKKKKK6K#.',
      '......#kkK#KKKKKK#',
      '#####.#kK##bB7BB#.',
      '#bbBBBBkk#.#bBBB#.',
      '#ssSSSS##..#sSSSs#',
    ],
  },
  /** A rasteira: a perna da frente deitada rente ao chão, a sola para o adversário. */
  pernaRasteira: {
    pivo: [0, 1],
    linhas: [
      '#########.####',
      'KKKKK6KKK#B7Bs#',
      'kKKKKKKKk#bBBS#',
      '#########bbBs#',
    ],
  },
} satisfies Record<string, Carimbo>;

export type NomeDoCarimbo = keyof typeof CARIMBOS;

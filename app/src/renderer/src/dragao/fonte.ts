/**
 * As letras do Dragão Quadrado, desenhadas pixel a pixel. Nada de `fillText`: fonte do sistema
 * suaviza a borda, muda de computador para computador e não cabe numa grade de 384x216 — a letra
 * sairia borrada ao lado de um lutador de contorno duro. Aqui cada letra é uma grade escrita à
 * mão, e o mesmo código escreve na janela e no PNG de teste.
 *
 * São dois tamanhos, os dois só com maiúsculas (minúscula vira maiúscula) e os acentos do
 * português. A PEQUENA tem 5 px de altura: é a do nome, do "RODADA 2", do menu. A GRANDE tem 13 px:
 * é a do relógio, que precisa ser lida de relance no meio da luta, e a do locutor — "LUTEM!",
 * "NOCAUTE", "VITÓRIA" —, que escrito em 5 px no meio da tela seria um recado, e não um grito.
 *
 * O `y` de `escrever` é o TOPO DAS MAIÚSCULAS, nunca o topo do acento: assim "GOIABA" e "PICOLÉ"
 * escritos na mesma altura ficam na mesma linha. O acento mora acima (na pequena, duas linhas de
 * sinal e uma de folga; na grande, três e uma) e a cedilha abaixo — `FONTE` diz quanto, para quem
 * monta a tela.
 */
import { type Cor, type Quadro, pixel } from './quadro.ts';

export type Tamanho = 'pequena' | 'grande';

export type OpcoesDoTexto = {
  tamanho?: Tamanho;
  /** Um pixel em volta de cada letra, diagonais incluídas: é o que faz texto ler sobre céu claro e chão escuro. */
  contorno?: Cor;
  /** `x` é a ponta esquerda, o meio ou a ponta direita do texto. */
  alinhar?: 'esquerda' | 'centro' | 'direita';
  /** A metade de baixo das letras nesta cor — o degrau de dois tons do relógio de fliperama. */
  corDeBaixo?: Cor;
};

/** Quanto cada tamanho ocupa além da altura da letra: acima (acento) e abaixo (cedilha), sem contar o contorno. */
export const FONTE = {
  pequena: { altura: 5, acima: 3, abaixo: 1, espaco: 1 },
  grande: { altura: 13, acima: 4, abaixo: 3, espaco: 2 },
} as const;

type Glifo = { largura: number; px: number[] };

/** Grade escrita à mão para glifo: `X` é tinta, qualquer outra coisa é vazio. `dy` desloca as linhas. */
function grade(linhas: string[], dy = 0, dx = 0): number[] {
  const px: number[] = [];
  linhas.forEach((l, y) => {
    for (let x = 0; x < l.length; x++) if (l[x] === 'X') px.push(x + dx, y + dy);
  });
  return px;
}

function glifo(...linhas: string[]): Glifo {
  return { largura: Math.max(...linhas.map((l) => l.length)), px: grade(linhas) };
}

// A pequena tem largura variável: quatro colunas é o que deixa A, O e R redondos a 5 px de altura;
// I, T e Y cabem em três e ficam no meio; M, W e V precisam de cinco para a diagonal existir.
const PEQUENA: Record<string, Glifo> = {
  A: glifo('.XX.', 'X..X', 'XXXX', 'X..X', 'X..X'),
  B: glifo('XXX.', 'X..X', 'XXX.', 'X..X', 'XXX.'),
  C: glifo('.XXX', 'X...', 'X...', 'X...', '.XXX'),
  D: glifo('XXX.', 'X..X', 'X..X', 'X..X', 'XXX.'),
  E: glifo('XXXX', 'X...', 'XXX.', 'X...', 'XXXX'),
  F: glifo('XXXX', 'X...', 'XXX.', 'X...', 'X...'),
  G: glifo('.XXX', 'X...', 'X.XX', 'X..X', '.XXX'),
  H: glifo('X..X', 'X..X', 'XXXX', 'X..X', 'X..X'),
  I: glifo('XXX', '.X.', '.X.', '.X.', 'XXX'),
  J: glifo('...X', '...X', '...X', 'X..X', '.XX.'),
  K: glifo('X..X', 'X.X.', 'XX..', 'X.X.', 'X..X'),
  L: glifo('X...', 'X...', 'X...', 'X...', 'XXXX'),
  M: glifo('X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X'),
  N: glifo('X..X', 'XX.X', 'X.XX', 'X..X', 'X..X'),
  O: glifo('.XX.', 'X..X', 'X..X', 'X..X', '.XX.'),
  P: glifo('XXX.', 'X..X', 'XXX.', 'X...', 'X...'),
  Q: glifo('.XX.', 'X..X', 'X..X', 'X.X.', '.X.X'),
  R: glifo('XXX.', 'X..X', 'XXX.', 'X.X.', 'X..X'),
  S: glifo('.XXX', 'X...', '.XX.', '...X', 'XXX.'),
  T: glifo('XXX', '.X.', '.X.', '.X.', '.X.'),
  U: glifo('X..X', 'X..X', 'X..X', 'X..X', '.XX.'),
  V: glifo('X...X', 'X...X', '.X.X.', '.X.X.', '..X..'),
  W: glifo('X...X', 'X...X', 'X.X.X', 'XX.XX', 'X...X'),
  X: glifo('X..X', 'X..X', '.XX.', 'X..X', 'X..X'),
  Y: glifo('X.X', 'X.X', '.X.', '.X.', '.X.'),
  Z: glifo('XXXX', '...X', '.XX.', 'X...', 'XXXX'),
  '0': glifo('XXX', 'X.X', 'X.X', 'X.X', 'XXX'),
  '1': glifo('.X.', 'XX.', '.X.', '.X.', 'XXX'),
  '2': glifo('XX.', '..X', '.X.', 'X..', 'XXX'),
  '3': glifo('XX.', '..X', '.X.', '..X', 'XX.'),
  '4': glifo('X.X', 'X.X', 'XXX', '..X', '..X'),
  '5': glifo('XXX', 'X..', 'XX.', '..X', 'XX.'),
  '6': glifo('.XX', 'X..', 'XXX', 'X.X', 'XXX'),
  '7': glifo('XXX', '..X', '.X.', '.X.', '.X.'),
  '8': glifo('XXX', 'X.X', 'XXX', 'X.X', 'XXX'),
  '9': glifo('XXX', 'X.X', 'XXX', '..X', 'XX.'),
  '.': glifo('.', '.', '.', '.', 'X'),
  ',': { largura: 1, px: grade(['.', '.', '.', '.', 'X', 'X']) },
  ':': glifo('.', 'X', '.', 'X', '.'),
  ';': { largura: 1, px: grade(['.', 'X', '.', 'X', 'X']) },
  '!': glifo('X', 'X', 'X', '.', 'X'),
  '?': glifo('XX.', '..X', '.X.', '...', '.X.'),
  '-': glifo('...', '...', 'XXX', '...', '...'),
  '+': glifo('...', '.X.', 'XXX', '.X.', '...'),
  '=': glifo('...', 'XXX', '...', 'XXX', '...'),
  '/': glifo('..X', '..X', '.X.', 'X..', 'X..'),
  '%': glifo('X..X', '..X.', '.X..', 'X...', 'X..X'),
  "'": glifo('X', 'X', '.', '.', '.'),
  '"': glifo('X.X', 'X.X', '...', '...', '...'),
  '(': glifo('.X', 'X.', 'X.', 'X.', '.X'),
  ')': glifo('X.', '.X', '.X', '.X', 'X.'),
  '<': glifo('..X', '.X.', 'X..', '.X.', '..X'),
  '>': glifo('X..', '.X.', '..X', '.X.', 'X..'),
  '#': glifo('.X.X.', 'XXXXX', '.X.X.', 'XXXXX', '.X.X.'),
  '*': glifo('...', 'X.X', '.X.', 'X.X', '...'),
  '×': glifo('...', 'X.X', '.X.', 'X.X', '...'),
  ' ': { largura: 2, px: [] },
};

/**
 * Os sinais do acento, em duas linhas, para letra de 4 e de 3 colunas. Ficam uma linha ACIMA da
 * letra, e não encostados nela: colado, o agudo do É vira um calombo no traço de cima, e o do Á
 * se confunde com o bico do A. Com contorno, a linha de folga é justamente a que fica escura e
 * separa o sinal da letra.
 */
const SINAIS: Record<string, Record<number, string[]>> = {
  agudo: { 4: ['..X.', '.X..'], 3: ['..X', '.X.'] },
  grave: { 4: ['.X..', '..X.'], 3: ['X..', '.X.'] },
  circunflexo: { 4: ['.XX.', 'X..X'], 3: ['.X.', 'X.X'] },
  til: { 4: ['.X.X', 'X.X.'], 3: ['.XX', 'XX.'] },
};

function acentuada(base: string, sinal: keyof typeof SINAIS): Glifo {
  const b = PEQUENA[base];
  return { largura: b.largura, px: [...b.px, ...grade(SINAIS[sinal][b.largura === 3 ? 3 : 4], -FONTE.pequena.acima)] };
}

Object.assign(PEQUENA, {
  Á: acentuada('A', 'agudo'), À: acentuada('A', 'grave'), Â: acentuada('A', 'circunflexo'), Ã: acentuada('A', 'til'),
  É: acentuada('E', 'agudo'), Ê: acentuada('E', 'circunflexo'),
  Í: acentuada('I', 'agudo'),
  Ó: acentuada('O', 'agudo'), Ô: acentuada('O', 'circunflexo'), Õ: acentuada('O', 'til'),
  Ú: acentuada('U', 'agudo'),
  // A cedilha é um rabinho só, colado no pé do C: é a única marca que não cabe em cima.
  Ç: { largura: 4, px: [...PEQUENA.C.px, 2, 5] },
});

// Os algarismos da grande são de largura FIXA: o relógio troca de número a cada segundo, e
// algarismo de largura variável faria o "11" e o "10" pularem de lugar. Traço vertical de 3 e
// horizontal de 2, e a barriga de baixo maior que a de cima, como num 8 bem desenhado. As letras
// podem variar (I, M, W), porque palavra do locutor não muda enquanto está na tela.
const GRANDE: Record<string, Glifo> = {
  '0': glifo('.XXXXXXX.', 'XXXXXXXXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX',
    'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXXXXXXXX', '.XXXXXXX.'),
  '1': glifo('..XXXX...', '.XXXXX...', 'XXXXXX...', '...XXX...', '...XXX...', '...XXX...', '...XXX...',
    '...XXX...', '...XXX...', '...XXX...', '...XXX...', 'XXXXXXXXX', 'XXXXXXXXX'),
  '2': glifo('.XXXXXXX.', 'XXXXXXXXX', 'XXX...XXX', '......XXX', '......XXX', '.XXXXXXXX', 'XXXXXXXX.',
    'XXX......', 'XXX......', 'XXX......', 'XXX......', 'XXXXXXXXX', 'XXXXXXXXX'),
  '3': glifo('.XXXXXXX.', 'XXXXXXXXX', 'XXX...XXX', '......XXX', '......XXX', '..XXXXXX.', '..XXXXXXX',
    '......XXX', '......XXX', '......XXX', 'XXX...XXX', 'XXXXXXXXX', '.XXXXXXX.'),
  '4': glifo('XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXXXXXXXX', 'XXXXXXXXX',
    '......XXX', '......XXX', '......XXX', '......XXX', '......XXX', '......XXX'),
  '5': glifo('XXXXXXXXX', 'XXXXXXXXX', 'XXX......', 'XXX......', 'XXX......', 'XXXXXXXX.', 'XXXXXXXXX',
    '......XXX', '......XXX', '......XXX', 'XXX...XXX', 'XXXXXXXXX', '.XXXXXXX.'),
  '6': glifo('.XXXXXXX.', 'XXXXXXXXX', 'XXX...XXX', 'XXX......', 'XXX......', 'XXXXXXXX.', 'XXXXXXXXX',
    'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXXXXXXXX', '.XXXXXXX.'),
  '7': glifo('XXXXXXXXX', 'XXXXXXXXX', '......XXX', '......XXX', '.....XXX.', '.....XXX.', '....XXX..',
    '....XXX..', '...XXX...', '...XXX...', '...XXX...', '...XXX...', '...XXX...'),
  '8': glifo('.XXXXXXX.', 'XXXXXXXXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', '.XXXXXXX.', 'XXXXXXXXX',
    'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXXXXXXXX', '.XXXXXXX.'),
  '9': glifo('.XXXXXXX.', 'XXXXXXXXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXXXXXXXX',
    '.XXXXXXXX', '......XXX', '......XXX', 'XXX...XXX', 'XXXXXXXXX', '.XXXXXXX.'),
  // Luta sem relógio: o infinito, deitado no meio da altura dos algarismos. O traço é de 2, e não
  // de 3 como nos números: com 3 os dois furos fecham e ele vira um laço de fita.
  '∞': {
    largura: 15,
    px: grade(['..XXX.....XXX..', '.XXXXX...XXXXX.', 'XX...XX.XX...XX', 'XX....XXX....XX', 'XX...XX.XX...XX', '.XXXXX...XXXXX.', '..XXX.....XXX..'], 3),
  },
  ':': { largura: 3, px: grade(['XXX', 'XXX', '...', '...', '...', 'XXX', 'XXX'], 3) },
  ' ': { largura: 5, px: [] },
  // As letras seguem os algarismos: haste de 3, travessa de 2, canto arredondado de um pixel e a
  // travessa do meio nas linhas 5 e 6, a mesma altura da cintura do 8. O O é o próprio 0 — numa
  // fonte de haste grossa, um O mais redondo sairia mais estreito que as letras em volta.
  A: glifo('.XXXXXXX.', 'XXXXXXXXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXXXXXXXX', 'XXXXXXXXX',
    'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX'),
  B: glifo('XXXXXXXX.', 'XXXXXXXXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXXXXXXX.', 'XXXXXXXXX',
    'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXXXXXXXX', 'XXXXXXXX.'),
  C: glifo('.XXXXXXX.', 'XXXXXXXXX', 'XXX...XXX', 'XXX......', 'XXX......', 'XXX......', 'XXX......',
    'XXX......', 'XXX......', 'XXX......', 'XXX...XXX', 'XXXXXXXXX', '.XXXXXXX.'),
  D: glifo('XXXXXXX..', 'XXXXXXXX.', 'XXX..XXXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX',
    'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX..XXXX', 'XXXXXXXX.', 'XXXXXXX..'),
  E: glifo('XXXXXXXXX', 'XXXXXXXXX', 'XXX......', 'XXX......', 'XXX......', 'XXXXXXX..', 'XXXXXXX..',
    'XXX......', 'XXX......', 'XXX......', 'XXX......', 'XXXXXXXXX', 'XXXXXXXXX'),
  F: glifo('XXXXXXXXX', 'XXXXXXXXX', 'XXX......', 'XXX......', 'XXX......', 'XXXXXXX..', 'XXXXXXX..',
    'XXX......', 'XXX......', 'XXX......', 'XXX......', 'XXX......', 'XXX......'),
  G: glifo('.XXXXXXX.', 'XXXXXXXXX', 'XXX...XXX', 'XXX......', 'XXX......', 'XXX......', 'XXX..XXXX',
    'XXX..XXXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXXXXXXXX', '.XXXXXXX.'),
  H: glifo('XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXXXXXXXX', 'XXXXXXXXX',
    'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX'),
  I: glifo('XXXXXXX', 'XXXXXXX', '..XXX..', '..XXX..', '..XXX..', '..XXX..', '..XXX..',
    '..XXX..', '..XXX..', '..XXX..', '..XXX..', 'XXXXXXX', 'XXXXXXX'),
  J: glifo('......XXX', '......XXX', '......XXX', '......XXX', '......XXX', '......XXX', '......XXX',
    '......XXX', '......XXX', '......XXX', 'XXX...XXX', 'XXXXXXXXX', '.XXXXXXX.'),
  K: glifo('XXX...XXX', 'XXX...XXX', 'XXX..XXX.', 'XXX.XXX..', 'XXXXXX...', 'XXXXX....', 'XXXXX....',
    'XXXXXX...', 'XXX.XXX..', 'XXX..XXX.', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX'),
  L: glifo('XXX......', 'XXX......', 'XXX......', 'XXX......', 'XXX......', 'XXX......', 'XXX......',
    'XXX......', 'XXX......', 'XXX......', 'XXX......', 'XXXXXXXXX', 'XXXXXXXXX'),
  // M e W precisam de onze colunas: em nove, o V do meio fecha e as hastes viram um bloco
  M: glifo('XXX.....XXX', 'XXXX...XXXX', 'XXXXX.XXXXX', 'XXX.XXX.XXX', 'XXX..X..XXX', 'XXX.....XXX', 'XXX.....XXX',
    'XXX.....XXX', 'XXX.....XXX', 'XXX.....XXX', 'XXX.....XXX', 'XXX.....XXX', 'XXX.....XXX'),
  N: glifo('XXX...XXX', 'XXXX..XXX', 'XXXX..XXX', 'XXXXX.XXX', 'XXXXX.XXX', 'XXX.X.XXX', 'XXX.X.XXX',
    'XXX.X.XXX', 'XXX.XXXXX', 'XXX.XXXXX', 'XXX..XXXX', 'XXX..XXXX', 'XXX...XXX'),
  P: glifo('XXXXXXXX.', 'XXXXXXXXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXXXXXXXX',
    'XXXXXXXX.', 'XXX......', 'XXX......', 'XXX......', 'XXX......', 'XXX......'),
  Q: glifo('.XXXXXXX.', 'XXXXXXXXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX',
    'XXX...XXX', 'XXX...XXX', 'XXX.X.XXX', 'XXX..XXXX', 'XXXXXXXXX', '.XXXXXXXX'),
  R: glifo('XXXXXXXX.', 'XXXXXXXXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXXXXXXXX', 'XXXXXXXX.',
    'XXX.XXX..', 'XXX..XXX.', 'XXX..XXX.', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX'),
  S: glifo('.XXXXXXX.', 'XXXXXXXXX', 'XXX...XXX', 'XXX......', 'XXX......', 'XXXXXXXX.', '.XXXXXXXX',
    '......XXX', '......XXX', '......XXX', 'XXX...XXX', 'XXXXXXXXX', '.XXXXXXX.'),
  T: glifo('XXXXXXXXX', 'XXXXXXXXX', '...XXX...', '...XXX...', '...XXX...', '...XXX...', '...XXX...',
    '...XXX...', '...XXX...', '...XXX...', '...XXX...', '...XXX...', '...XXX...'),
  U: glifo('XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX',
    'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXXXXXXXX', '.XXXXXXX.'),
  V: glifo('XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX',
    '.XXX.XXX.', '.XXX.XXX.', '..XXXXX..', '..XXXXX..', '...XXX...', '...XXX...'),
  W: glifo('XXX.....XXX', 'XXX.....XXX', 'XXX.....XXX', 'XXX.....XXX', 'XXX.....XXX', 'XXX.....XXX', 'XXX.....XXX',
    'XXX.....XXX', 'XXX..X..XXX', 'XXX.XXX.XXX', 'XXXXX.XXXXX', 'XXXX...XXXX', 'XXX.....XXX'),
  X: glifo('XXX...XXX', 'XXX...XXX', '.XXX.XXX.', '.XXX.XXX.', '..XXXXX..', '...XXX...', '...XXX...',
    '..XXXXX..', '.XXX.XXX.', '.XXX.XXX.', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX'),
  Y: glifo('XXX...XXX', 'XXX...XXX', 'XXX...XXX', '.XXX.XXX.', '.XXX.XXX.', '..XXXXX..', '...XXX...',
    '...XXX...', '...XXX...', '...XXX...', '...XXX...', '...XXX...', '...XXX...'),
  Z: glifo('XXXXXXXXX', 'XXXXXXXXX', '......XXX', '.....XXX.', '.....XXX.', '....XXX..', '...XXX...',
    '..XXX....', '.XXX.....', '.XXX.....', 'XXX......', 'XXXXXXXXX', 'XXXXXXXXX'),
  '!': glifo('XXX', 'XXX', 'XXX', 'XXX', 'XXX', 'XXX', 'XXX', 'XXX', 'XXX', '...', '...', 'XXX', 'XXX'),
  '?': glifo('.XXXXXXX.', 'XXXXXXXXX', 'XXX...XXX', '......XXX', '......XXX', '....XXXX.', '...XXXX..',
    '...XXX...', '...XXX...', '.........', '.........', '...XXX...', '...XXX...'),
  '.': glifo('...', '...', '...', '...', '...', '...', '...', '...', '...', '...', '...', 'XXX', 'XXX'),
  '-': { largura: 7, px: grade(['XXXXXXX', 'XXXXXXX'], 5) },
};
GRANDE.O = GRANDE['0'];

/**
 * Os acentos da grande, em três linhas e uma de folga, com o traço de 3 das hastes: um agudo de
 * um pixel sobre uma letra de haste grossa some, e a letra parece sem acento de longe.
 */
const SINAIS_GRANDES: Record<keyof typeof SINAIS, Record<number, string[]>> = {
  agudo: { 9: ['.....XXX.', '....XXX..', '...XXX...'], 7: ['....XXX', '...XXX.', '..XXX..'] },
  grave: { 9: ['.XXX.....', '..XXX....', '...XXX...'], 7: ['XXX....', '.XXX...', '..XXX..'] },
  circunflexo: { 9: ['...XXX...', '.XXX.XXX.', 'XXX...XXX'], 7: ['..XXX..', '.XX.XX.', 'XX...XX'] },
  til: { 9: ['.XXX...XX', 'XXXXX.XXX', 'XX...XXX.'], 7: ['.XX..XX', 'XXXXXXX', 'XX..XX.'] },
};

function acentuadaGrande(base: string, sinal: keyof typeof SINAIS): Glifo {
  const b = GRANDE[base];
  return { largura: b.largura, px: [...b.px, ...grade(SINAIS_GRANDES[sinal][b.largura === 7 ? 7 : 9], -FONTE.grande.acima)] };
}

Object.assign(GRANDE, {
  Á: acentuadaGrande('A', 'agudo'), À: acentuadaGrande('A', 'grave'), Â: acentuadaGrande('A', 'circunflexo'), Ã: acentuadaGrande('A', 'til'),
  É: acentuadaGrande('E', 'agudo'), Ê: acentuadaGrande('E', 'circunflexo'),
  Í: acentuadaGrande('I', 'agudo'),
  Ó: acentuadaGrande('O', 'agudo'), Ô: acentuadaGrande('O', 'circunflexo'), Õ: acentuadaGrande('O', 'til'),
  Ú: acentuadaGrande('U', 'agudo'),
  // a cedilha é um gancho de três linhas no pé do C, como a da pequena é um pixel
  Ç: { largura: 9, px: [...GRANDE.C.px, ...grade(['...XXX...', '.....XX..', '..XXXX...'], FONTE.grande.altura)] },
});

const TABELAS: Record<Tamanho, Record<string, Glifo>> = { pequena: PEQUENA, grande: GRANDE };

function glifos(texto: string, tamanho: Tamanho): Glifo[] {
  const tabela = TABELAS[tamanho];
  const lista: Glifo[] = [];
  for (const ch of texto.toUpperCase()) {
    // Letra que a fonte não tem vira "?": sumir calada esconderia o buraco no teste. A grande já
    // fez isso — só tinha algarismos, e "LUTEM!" escrito nela saía em branco, sem erro nenhum.
    const g = tabela[ch] ?? tabela['?'];
    lista.push(g);
  }
  return lista;
}

/** A largura do texto em pixels, sem o contorno. */
export function medir(texto: string, tamanho: Tamanho = 'pequena'): number {
  const lista = glifos(texto, tamanho);
  if (lista.length === 0) return 0;
  return lista.reduce((s, g) => s + g.largura, 0) + FONTE[tamanho].espaco * (lista.length - 1);
}

/**
 * Escreve `texto` com o topo das letras em `y`. Devolve a largura escrita (sem o contorno).
 * O contorno sai numa passada inteira ANTES das letras: feito letra por letra, o contorno da
 * letra seguinte comeria a ponta da anterior no espaço de um pixel entre elas.
 */
export function escrever(q: Quadro, texto: string, x: number, y: number, c: Cor, opcoes: OpcoesDoTexto = {}): number {
  const tamanho = opcoes.tamanho ?? 'pequena';
  const lista = glifos(texto, tamanho);
  const largura = medir(texto, tamanho);
  const alinhar = opcoes.alinhar ?? 'esquerda';
  let x0 = Math.round(alinhar === 'centro' ? x - largura / 2 : alinhar === 'direita' ? x - largura : x);
  const y0 = Math.round(y);
  const pontos: number[] = [];
  for (const g of lista) {
    for (let i = 0; i < g.px.length; i += 2) pontos.push(x0 + g.px[i], y0 + g.px[i + 1]);
    x0 += g.largura + FONTE[tamanho].espaco;
  }
  if (opcoes.contorno !== undefined) {
    for (let i = 0; i < pontos.length; i += 2) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) pixel(q, pontos[i] + dx, pontos[i + 1] + dy, opcoes.contorno);
    }
  }
  const meio = y0 + Math.floor(FONTE[tamanho].altura / 2) + 1;
  for (let i = 0; i < pontos.length; i += 2) {
    const baixo = opcoes.corDeBaixo !== undefined && pontos[i + 1] >= meio;
    pixel(q, pontos[i], pontos[i + 1], baixo ? opcoes.corDeBaixo! : c);
  }
  return largura;
}

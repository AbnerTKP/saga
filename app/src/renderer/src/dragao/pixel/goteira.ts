/**
 * A Goteira (a paródia do Gotenks, a fusão do Goten com o Trunks) no corpo do Goiaba: o colete da
 * fusão, verde-azulado com o enchimento mostarda nos ombros, braços de fora, calça branca, faixa
 * azul-clara e sapato preto. A cabeça é a do zip com o cabelo preto, os espetos mais altos e a
 * franja lilás do Trunks por cima da testa.
 *
 * A forma 1 é o Super Goteira 3 (o Super Saiyajin 3): testa limpa, sem sobrancelha, o cabelo
 * dourado arrepiado para trás e a juba que desce pelas costas. A juba não cabe na cabeça — ela
 * passaria por cima do corpo —, então entra por baixo da pose montada, presa onde a cabeça está.
 */
import { cor } from '../quadro.ts';
import { type Arte, colarArte, copiar, criarArte, numeroDo, pintarCarimbo, recortar, tingir } from './arte.ts';
import { type Material, ROUPA_GOIABA, type Rampa, type Roupa, trocarRampa } from './materiais.ts';
import { type Pecas, PE, pecasDoGoiaba, vestirPecas } from './pecas.ts';
import { PE_NA_ARTE, POSES } from './poses.ts';
import { registrarPixel } from './sprites.ts';
import { comOmbreira } from './vegetal.ts';

// ——— a roupa ———

/** O preto do cabelo, puxado para o violeta: é o que deixa a franja lilás parecer do mesmo cabelo. */
const PRETO: Rampa = [
  ['#000000', '#040208'], ['#0f0a1a', '#120c1e'], ['#1c1530', '#201834', '#181228'],
  ['#2c2346', '#2a2140', '#302650'], ['#463a64', '#4c3f6c'],
];
const COLETE: Rampa = [
  ['#021416', '#031a1c'], ['#0a3d44', '#0c434a'], ['#11606a', '#0f5a63', '#146670', '#0a3d44'],
  ['#1f8a93', '#1c828b', '#2493a0', '#18777f'], ['#4cc0c4', '#5ccac8'],
];
const BRANCO: Rampa = [
  ['#16132e', '#0b0a1c'], ['#6f6f9c', '#7a6f96'], ['#b3b6d6', '#c2bfd9', '#a9b0d4'],
  ['#eceef6', '#f6f3ea', '#e4e8f4'], ['#ffffff', '#fffcf0'],
];
const AZUL_CLARO: Rampa = [
  ['#0a1830', '#000000'], ['#1f5c9a', '#23609e'], ['#3a8fd0', '#3384c8', '#4298d6'],
  ['#6cc2ee', '#62b8ea', '#78caf2'], ['#b4e8fb', '#c8f0ff'],
];
const SAPATO: Rampa = [
  ['#000000', '#00000a'], ['#121118', '#16151e'], ['#23212c', '#2a2834', '#1e1c26'],
  ['#3a3846', '#403e4c'], ['#5e5c6c', '#666474'],
];
/** O enchimento do colete: mostarda, com a sombra puxando para o ferrugem. */
const MOSTARDA: Rampa = [
  ['#2e1a04', '#241402'], ['#8a560a', '#7e4e08'], ['#c98e18', '#c08614', '#d19620'],
  ['#f0c23a', '#ecba30', '#f5ca46'], ['#fff09a', '#ffe680'],
];

/**
 * Braço e mão são a pele do zip: o colete não tem manga, e a manga do Goiaba — a camiseta azul
 * que aparece no decote — vira o peito de fora. Só o degrau fundo é outro: o da pele é o vermelho
 * da orelha, e o braço de trás, que desce para ele, saía cor de sangue.
 */
const BRACO: Rampa = [ROUPA_GOIABA.pele[0], ['#c4605a', '#b8584e'], ROUPA_GOIABA.pele[2], ROUPA_GOIABA.pele[3], ROUPA_GOIABA.pele[4]];

export const ROUPA_GOTEIRA: Roupa = {
  pele: ROUPA_GOIABA.pele,
  cabelo: PRETO,
  olho: ROUPA_GOIABA.olho,
  camisa: COLETE,
  manga: BRACO,
  mao: BRACO,
  faixa: AZUL_CLARO,
  calca: BRANCO,
  bota: SAPATO,
  sola: SAPATO,
};

// ——— pintura em símbolos ———

/** Os símbolos das cabeças: 5 a 9 é o cabelo (do contorno à luz), v m M L a franja lilás, 0 a 4 a pele. */
const TINTAS: Record<string, [Material, string[]]> = {
  '5': ['cabelo', PRETO[0]], '6': ['cabelo', PRETO[1]], '7': ['cabelo', PRETO[2]], '8': ['cabelo', PRETO[3]], '9': ['cabelo', PRETO[4]],
  v: ['cabelo', ['#1c1036', '#180c2e']], m: ['cabelo', ['#6a54a6', '#6450a0', '#7058ac']],
  M: ['cabelo', ['#9a82d8', '#9078d0', '#a48ce0']], L: ['cabelo', ['#cdbcf4', '#d8caf8']],
  '0': ['pele', ROUPA_GOIABA.pele[0]], '1': ['pele', ROUPA_GOIABA.pele[1]], '2': ['pele', ROUPA_GOIABA.pele[2]],
  '3': ['pele', ROUPA_GOIABA.pele[3]], '4': ['pele', ROUPA_GOIABA.pele[4]],
};

/** Sorteio fixo por pixel, para o salpicado sair igual em todo computador. */
const sorte = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Linhas de símbolos numa arte, com a linha 0 da grade na linha `y0` do zip. */
function pintar(linhas: string[], y0: number, semente = 9): Arte {
  const largura = Math.max(...linhas.map((l) => l.length));
  const a = criarArte(largura, linhas.length, [0, -y0]);
  linhas.forEach((l, y) => [...l].forEach((ch, x) => {
    if (ch === '.') return;
    const t = TINTAS[ch];
    if (!t) throw new Error(`símbolo desconhecido na Goteira: ${ch}`);
    const tons = t[1];
    const hex = tons.length > 1 && sorte(x, y + y0, semente) < 0.34 ? tons[1 + Math.floor(sorte(y + y0, x, semente + 1) * (tons.length - 1))] : tons[0];
    a.cor[y * largura + x] = cor(hex);
    a.mat[y * largura + x] = numeroDo(t[0]);
  }));
  return a;
}

// ——— as cabeças ———

/** Os espetos que o zip não tem: sobem mais alto que os do Goiaba, um para trás e um para a frente. */
const ESPETOS = [
  '................5...............', // -3
  '................55..............', // -2
  '..........5....575.....5........', // -1
  '..........55...5775...55........', // 0
  '..........575..5875..575........', // 1
  '...........57755875.5775........', // 2
  '...........57875...58775........', // 3
  '............5787..5877..........', // 4
  '............578...787...........', // 5
];

/** A franja do Trunks: mechas lilases caindo sobre a testa, sem tapar o olho (17 e 18, da linha 11). */
const FRANJA = [
  '..................vvv...........', // 6
  '.................vMLMv..........', // 7
  '................vMLMMLv.........', // 8
  '................vmMvMMmv........', // 9
  '.................vm.vMmv........', // 10
  '....................vmv.........', // 11
  '.....................v..........', // 12
];

type Cara = 'cabeca' | 'cabecaGrito' | 'cabecaFechados' | 'cabecaDor';
const CARAS: Cara[] = ['cabeca', 'cabecaGrito', 'cabecaFechados', 'cabecaDor'];

/** Uma cabeça de 32 colunas com espaço acima da linha 0 do zip, e as camadas coladas em ordem. */
function juntar(topo: number, ...camadas: Arte[]): Arte {
  const a = criarArte(32, 32 + topo, [0, topo]);
  for (const c of camadas) colarArte(a, c, 0, topo);
  return a;
}

/** O corpo inteiro com a cabeça trocada. */
function comCabeca(inteiro: Arte, cabeca: Arte): Arte {
  const corpo = recortar(inteiro, (_x, y, m) => !(y - inteiro.pivo[1] <= 16 && (m === 'cabelo' || m === 'pele' || m === 'olho')));
  return juntar(cabeca.pivo[1], corpo, cabeca);
}

function pecasDaGoteira(): Pecas {
  const vestidas = vestirPecas(pecasDoGoiaba(0), ROUPA_GOTEIRA);
  const espetos = pintar(ESPETOS, -3), franja = pintar(FRANJA, 6);
  const cabecas = {} as Record<Cara, Arte>;
  for (const cara of CARAS) cabecas[cara] = juntar(3, vestidas[cara], espetos, franja);
  return { ...vestidas, ...cabecas, inteiro: comCabeca(vestidas.inteiro, cabecas.cabeca) };
}

// ——— o Super Goteira 3 ———

/**
 * A coroa do Super Saiyajin 3: o cabelo todo para trás, espetado no alto e na nuca. A testa fica
 * limpa e sem sobrancelha — o que se vê acima do olho é o osso da testa, um tom de sombra.
 */
const COROA = [
  '.............5..................', // -2
  '........5....55.................', // -1
  '........55...575................', // 0
  '.........5755875...5............', // 1
  '.........5788875..55............', // 2
  '...5.....588888755875...........', // 3
  '...555..58888888888875..........', // 4
  '....57758888898888875...........', // 5
  '.....578888889988875............', // 6
  '....5578888899887...............', // 7
  '..5577888888888887..............', // 8
  '.57788888888888887..............', // 9
  '...577888888888887..............', // 10
  '....777888888888................', // 11
  '......7778888887................', // 12
  '.......778888...................', // 13
  '.........77888..................', // 14
  '...........778..................', // 15
];

const TESTA = [
  '....................0...........', // 6
  '.................4430...........', // 7
  '................333340..........', // 8
  '................343330..........', // 9
  '................222230..........', // 10
  '....................30..........', // 11
  '...............3................', // 12
];

/**
 * A juba que desce pelas costas até a dobra do joelho, em coordenadas do zip com a cabeça no lugar
 * do parado. Vai por baixo da pose: onde o corpo está, ele cobre.
 */
const JUBA = [
  '..5788..........................', // 10
  '..578888........................', // 11
  '..5788888.......................', // 12
  '..57888888......................', // 13
  '..578888888.....................', // 14
  '..5788988888....................', // 15
  '..57889888887...................', // 16
  '..578898888875..................', // 17
  '..57889888875...................', // 18
  '..5788988875....................', // 19
  '.57888988875....................', // 20
  '.5788898875.....................', // 21
  '.578888875......................', // 22
  '.57878875.......................', // 23
  '.575.5785.......................', // 24
  '.5...575........................', // 25
  '......5.........................', // 26
];

function pecasDoSuper3(): Pecas {
  const vestidas = vestirPecas(pecasDoGoiaba(0), ROUPA_GOTEIRA);
  const coroa = pintar(COROA, -2), testa = pintar(TESTA, 6);
  const cabecas = {} as Record<Cara, Arte>;
  for (const cara of CARAS) {
    // do zip fica o rosto, do olho para baixo: acima dele é a testa nova
    const rosto = recortar(vestidas[cara], (_x, y, m) => m !== 'cabelo' && y >= 11);
    cabecas[cara] = juntar(2, coroa, testa, rosto);
  }
  return { ...vestidas, ...cabecas, inteiro: comCabeca(vestidas.inteiro, cabecas.cabeca) };
}

const DX = PE_NA_ARTE[0] - PE[0], DY = PE_NA_ARTE[1] - PE[1];

/** A juba presa à cabeça da pose (a do corpo inteiro, no parado), girada junto quando ela está deitada. */
function comJuba(a: Arte, pose: string, juba: Arte): Arte {
  const cabeca = POSES[pose]?.find((c) => 'peca' in c && (c.peca === 'inteiro' || c.peca.startsWith('cabeca')));
  if (!cabeca || !('peca' in cabeca)) return a;
  const r = copiar(a);
  colarArte(r, juba, DX + (cabeca.x ?? 0), DY + (cabeca.y ?? 0), { girar: cabeca.girar, porBaixo: true });
  return r;
}

// ——— o enchimento do colete ———

/** O enchimento mostarda no ombro: menor que a ombreira do Vegetal, e redondo. */
const ENCHIMENTO = { linhas: ['.##.', '#2R#', '#Rr#', '.##.'], pivo: [2, 1] as [number, number] };

// ——— a ficha ———

const OURO: Rampa = [['#6b3406'], ['#c26d0c'], ['#e0a21c'], ['#ffe45a'], ['#fffbd0']];
const VERDE_AGUA: Rampa = [['#07393a'], ['#0c6f68'], ['#26b8a4'], ['#fbf3fe'], ['#fbfafe']];

registrarPixel('goteira', () => {
  const enchimento = pintarCarimbo(ENCHIMENTO, { ...ROUPA_GOTEIRA, camisa: MOSTARDA });
  const juba = pintar(JUBA, 10);
  return {
    pecas: [pecasDaGoteira(), pecasDoSuper3()],
    roupa: ROUPA_GOTEIRA,
    enfeitar: (a, pose, forma) => {
      const vestida = comOmbreira(a, pose, enchimento);
      return forma === 1 ? comJuba(vestida, pose, juba) : vestida;
    },
    forma1: (a) => tingir(a, (c, m) => (m === 'cabelo' ? trocarRampa(c, PRETO, OURO, -0.3)
      : m === 'olho' ? trocarRampa(c, ROUPA_GOIABA.olho, VERDE_AGUA) : c)),
  };
});

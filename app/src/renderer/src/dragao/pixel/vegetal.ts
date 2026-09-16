/**
 * O Vegetal de pixel: o corpo e as poses do Goiaba, vestidos com a armadura — macacão marinho,
 * peito, luvas e botas brancos, faixa e biqueira douradas — e a cabeça dele, desenhada nas letras
 * do zip: cabelo em chama, entradas na testa e sobrancelha franzida. As ombreiras, que o corpo do
 * Goiaba não tem, entram por cima da pose montada (`enfeitar`).
 */
import { cor } from '../quadro.ts';
import { type Arte, arteDaBase, colarArte, copiar, criarArte, numeroDo, pintarCarimbo, recortar, tingir } from './arte.ts';
import { LINHAS_GOIABA, MATERIAIS_GOIABA, PALETA_GOIABA } from './base-goiaba.ts';
import { MATERIAIS, type Material, type Rampa, type Roupa, trocarRampa } from './materiais.ts';
import { type Pecas, PE, pecasDoGoiaba, vestirPecas } from './pecas.ts';
import { PE_NA_ARTE, POSES } from './poses.ts';
import { registrarPixel } from './sprites.ts';

// o branco da armadura puxa para o lilás na sombra, como o creme do zip puxa para o rosa
const BRANCO: Rampa = [
  ['#16132e', '#0b0a1c'], ['#6f6f9c', '#7a6f96'], ['#b3b6d6', '#c2bfd9', '#a9b0d4'],
  ['#eceef6', '#f6f3ea', '#e4e8f4'], ['#ffffff', '#fffcf0'],
];
const OURO: Rampa = [
  ['#3b1c05', '#2a1204'], ['#9a5a0a', '#8a4e0c'], ['#d38e16', '#c98414', '#dc9a1e'],
  ['#f6c936', '#efbd2c', '#fbd24a'], ['#fff08a', '#ffe56a'],
];
const MARINHO: Rampa = [
  ['#03040f', '#000000', '#060816'], ['#0e1650', '#121a5a'], ['#1a2878', '#16236e', '#1f2f86', '#0e1650'],
  ['#2a3fa3', '#2539a0', '#3046ad', '#223494'], ['#3d58c2', '#4461c8'],
];

/**
 * A roupa do Vegetal. O cabelo é quase preto e cada degrau muda um pouco de matiz (violeta, anil,
 * marinho, aço): trocando a rampa só pelo brilho, é essa diferença que mantém o salpicado à vista.
 */
export const ROUPA_VEGETAL: Roupa = {
  pele: [['#350a10', '#220409'], ['#8e1f2a', '#7c1a3a'], ['#f0a192', '#eba797'], ['#fdd6bd'], ['#fff0d8', '#fde0b0']],
  cabelo: [['#000000', '#06040e', '#020309'], ['#0c0a1e'], ['#11142c', '#161436'], ['#1a2144', '#1e2040'], ['#2c3a66', '#34406e']],
  olho: [['#030208'], ['#141032'], ['#2a2a5e'], ['#fbf3fe'], ['#fbfafe']],
  camisa: BRANCO,
  manga: MARINHO,
  mao: BRANCO,
  faixa: OURO,
  calca: MARINHO,
  bota: BRANCO,
  sola: OURO,
};

/**
 * A cabeça, das linhas -6 a 16 do zip, com as letras e a paleta dele. A chama sobe em quatro
 * línguas inclinadas para trás, com vincos escuros descendo dos vãos; na testa, a entrada nua
 * e o bico de cabelo formam o M. O rosto e o olho são os do zip; a sobrancelha franzida é a
 * linha escura que desce para a frente, por cima do olho.
 */
const CABECA_NORMAL = [
  '...............a................', // -6
  '..............bed...............', // -5
  '..............kij..f............', // -4
  '.............keiebbid...........', // -3
  '............bcelijeib...........', // -2
  '..........a.kcieinieb...........', // -1
  '.........bekceiiecieeb..........', // 0
  '.........keineilienieb..........', // 1
  '.......akceieneiiecnib..........', // 2
  '.......gceieieneiieceb..........', // 3
  '........gceieieceieecb..........', // 4
  '........bcceceieneiecb..........', // 5
  '.........kccececnpnceb..........', // 6
  '.........bcncecnpsncsz..........', // 7
  '.........bccnccnpssnsz..........', // 8
  '.........bgccncnpsmssz..........', // 9
  '.........bgcccncszzsoz..........', // 10
  '.........bkccnnepqrupz..........', // 11
  '.........bccnssnstusv...........', // 12
  '.........bkcewxsstyswz..........', // 13
  '..........bgcnwssssssz..........', // 14
  '............akAsBsssC...........', // 15
  '................GHHz............', // 16
];

// no rosto o contorno preto é 'H', e não 'b': assim a letra basta para dizer se é cabelo ou pele
const LETRAS_DO_CABELO = 'abcdefgijkln';

function cabecaEmLetras(y0: number, linhas: string[]): Arte {
  const topo = Math.max(0, -y0);
  const todas = Array.from({ length: 32 + topo }, (_, i) => linhas[i - topo - y0] ?? '.'.repeat(32));
  const mats = todas.map((l, i) => l.replace(/[^.]/g, (ch, x: number) => {
    const y = i - topo;
    if (x >= 17 && x <= 18 && y >= 11 && y <= 13 && 'qtruy'.includes(ch)) return 'o';
    return LETRAS_DO_CABELO.includes(ch) ? 'c' : 'p';
  }));
  const a = arteDaBase(todas, PALETA_GOIABA, mats);
  a.pivo = [0, topo];
  return a;
}

/** Troca pixels da cabeça (coordenadas do zip) por letras do zip; ponto apaga. */
function editar(p: Arte, trocas: [x: number, y: number, letra: string, material: Material][]): Arte {
  const r = copiar(p);
  for (const [x, y, letra, m] of trocas) {
    const i = (y + p.pivo[1]) * p.largura + x;
    r.cor[i] = letra === '.' ? 0 : cor(PALETA_GOIABA[letra]);
    r.mat[i] = letra === '.' ? 0 : numeroDo(m);
  }
  return r;
}

// o olho fica onde o do zip fica (17 e 18, linhas 11 a 13), então os fechados são os do Goiaba
const OLHO_FECHADO: [number, number, string, Material][] = [
  [17, 11, 'p', 'pele'], [18, 11, 'p', 'pele'], [17, 12, 'r', 'pele'], [18, 12, 'u', 'pele'], [17, 13, 's', 'pele'], [18, 13, 's', 'pele'],
];
// o grito mostra um dente claro: é o Vegetal rangendo, e não a boca redonda do Goiaba
const BOCA_ABERTA: [number, number, string, Material][] = [
  [18, 14, 'A', 'pele'], [19, 14, 'u', 'pele'], [20, 14, 't', 'pele'], [21, 14, '.', 'pele'],
  [19, 15, 'S', 'pele'], [20, 15, 'u', 'pele'],
];

const CABECA = new Set(['cabelo', 'pele', 'olho']);

/**
 * O corpo do Goiaba com a cabeça do Vegetal no lugar da dele, já vestido com a armadura (ou com
 * outra roupa: é assim que sai o da Super Feira).
 */
export function pecasDoVegetal(linhas: string[] = CABECA_NORMAL, y0 = -6, roupa: Roupa = ROUPA_VEGETAL): Pecas {
  const cabeca = cabecaEmLetras(y0, linhas);
  const base = arteDaBase(LINHAS_GOIABA, PALETA_GOIABA, MATERIAIS_GOIABA);
  const semCabeca = recortar(base, (_x, y, m) => !(y <= 16 && CABECA.has(m!)));
  const inteiro = criarArte(32, 32 + cabeca.pivo[1], cabeca.pivo);
  for (const p of [semCabeca, cabeca]) {
    for (let y = 0; y < p.altura; y++) for (let x = 0; x < p.largura; x++) {
      const i = y * p.largura + x;
      if (!p.mat[i]) continue;
      const j = (y - p.pivo[1] + inteiro.pivo[1]) * inteiro.largura + x;
      inteiro.cor[j] = p.cor[i]; inteiro.mat[j] = p.mat[i];
    }
  }
  return vestirPecas({
    ...pecasDoGoiaba(0),
    inteiro,
    cabeca,
    cabecaGrito: editar(cabeca, BOCA_ABERTA),
    cabecaFechados: editar(cabeca, OLHO_FECHADO),
    cabecaDor: editar(cabeca, [...OLHO_FECHADO, ...BOCA_ABERTA]),
  }, roupa);
}

/** A ombreira dourada, com o pivô no ombro. */
const OMBREIRA = { linhas: ['.####.', '#55FF#', '#FFFff#', '.#fff#'], pivo: [3, 2] as [number, number] };
const DX = PE_NA_ARTE[0] - PE[0], DY = PE_NA_ARTE[1] - PE[1];
const ARTICULA = /^(braco|punho|mao)/;

/**
 * Pinta a ombreira no ombro do braço da FRENTE — é ele que sai de debaixo dela; sem braço de
 * carimbo (parado, andando, caído), no ombro do zip levado junto com o tronco, girado se ele
 * estiver. Só pinta sobre o corpo e nunca sobre cabeça ou luva: fica atrás do queixo e do punho
 * da guarda, e não aumenta a silhueta. A Goteira usa a mesma conta para o enchimento do colete.
 */
export function comOmbreira(a: Arte, pose: string, ombreira: Arte): Arte {
  const camadas = POSES[pose];
  if (!camadas) return a;
  const o = criarArte(a.largura, a.altura, a.pivo);
  const braco = camadas.find((c) => 'carimbo' in c && !c.atras && ARTICULA.test(c.carimbo));
  if (braco && 'carimbo' in braco) colarArte(o, ombreira, DX + braco.x, DY + braco.y, { espelhar: braco.espelhar });
  else {
    const t = camadas.find((c) => 'peca' in c && (c.peca === 'troncoLimpo' || c.peca === 'tronco' || c.peca === 'inteiro'));
    if (!t || !('peca' in t)) return a;
    let rx = 14, ry = 17;
    for (let k = 0; k < (t.girar ?? 0); k++) [rx, ry] = [-ry, rx];
    colarArte(o, ombreira, DX + (t.x ?? 0) + rx, DY + (t.y ?? 0) + ry, { girar: t.girar });
  }
  const r = copiar(a);
  for (let i = 0; i < r.mat.length; i++) {
    if (!o.mat[i] || !a.mat[i]) continue;
    const m = MATERIAIS[a.mat[i] - 1];
    if (CABECA.has(m) || m === 'mao') continue;
    r.cor[i] = o.cor[i]; r.mat[i] = o.mat[i];
  }
  return r;
}

/** O Super Vegetalzin: o cabelo vai ao dourado pelo brilho (a textura fica) e o olho, ao verde-água. */
const DOURADO: Rampa = [['#6b3406'], ['#c26d0c'], ['#e0a21c'], ['#ffe45a'], ['#fffbd0']];
const VERDE_AGUA: Rampa = [['#07393a'], ['#0c6f68'], ['#26b8a4'], ['#fbf3fe'], ['#fbfafe']];

registrarPixel('vegetal', () => {
  const pecas = pecasDoVegetal(CABECA_NORMAL, -6);
  return {
    pecas: [pecas, pecas],
    roupa: ROUPA_VEGETAL,
    forma1: (a) => tingir(a, (c, m) => (m === 'cabelo' ? trocarRampa(c, ROUPA_VEGETAL.cabelo, DOURADO, -0.5)
      : m === 'olho' ? trocarRampa(c, ROUPA_VEGETAL.olho, VERDE_AGUA) : c)),
    enfeitar: (a, pose) => comOmbreira(a, pose, pintarCarimbo(OMBREIRA, ROUPA_VEGETAL)),
  };
});

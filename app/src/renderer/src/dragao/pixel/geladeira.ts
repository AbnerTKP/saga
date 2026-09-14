/**
 * A Geladeira (a paródia do Freeza, na forma final) no corpo do Goiaba: o mesmo zip vestido de
 * branco e roxo. O que era laranja vira o corpo branco, o azul vira as placas roxas (ombros e
 * antebraços na manga, canelas na bota), e a textura do zip continua pelo brilho de cada pixel.
 *
 * O que o corpo do Goiaba não tem vem daqui: a cabeça careca com o domo, desenhada em pixels no
 * mesmo acabamento, e o rabo, colado atrás do quadril em cada pose.
 */
import { type Arte, type Carimbo, colarArte, copiar, criarArte, numeroDo, pintarCarimbo, recortar, tingir } from './arte.ts';
import { cor } from '../quadro.ts';
import { BASE, CONTORNO, FUNDA, LUZ, type Material, type Rampa, type Roupa, SOMBRA, trocarRampa } from './materiais.ts';
import { type Pecas, PE, pecasDoGoiaba, vestirPecas } from './pecas.ts';
import { PE_NA_ARTE, POSES } from './poses.ts';
import { registrarPixel } from './sprites.ts';

/** O branco frio: a sombra puxa para o lilás, e o contorno é um roxo quase preto. */
const BRANCO: Rampa = [
  ['#2a1b45', '#221538'], ['#6d63a3'], ['#aea6d6', '#b8b1dc', '#a59cd0'], ['#e9e6f5', '#f1eff9', '#e2def0'], ['#ffffff', '#f8f7ff'],
];
/** As placas: roxo de casca lisa, com a luz quase branca para brilhar. */
const ROXO: Rampa = [
  ['#1c0730', '#150424'], ['#43136b', '#4d1878'], ['#6f25a6', '#7a2eb2', '#65209a'], ['#a24ad8', '#ab55e0'], ['#e2a9ff', '#f2d4ff'],
];
const VERMELHO: Rampa = [['#1f0208'], ['#6a0414'], ['#b10c22'], ['#f0243a'], ['#ffb3b8']];

export const ROUPA_GELADEIRA: Roupa = {
  pele: BRANCO, mao: BRANCO, camisa: BRANCO, faixa: BRANCO, calca: BRANCO, sola: BRANCO,
  cabelo: ROXO, manga: ROXO, bota: ROXO,
  olho: VERMELHO,
};

/** A Geladeira Dourada: o branco vira ouro de metal, e o roxo acende. */
const OURO: Rampa = [['#3b2105'], ['#8a5a0a'], ['#c98a0e'], ['#ffcf3a'], ['#fff4b8']];
const ROXO_VIVO: Rampa = [['#260838'], ['#5a1486'], ['#8e24c8'], ['#c451f5'], ['#f3c2ff']];
const BRANCOS = new Set<Material>(['pele', 'mao', 'camisa', 'faixa', 'calca', 'sola']);
const ROXOS = new Set<Material>(['cabelo', 'manga', 'bota']);

// ——— a cabeça ———

/** Tinta de cada símbolo da cabeça: o domo (cabelo), o rosto (pele) e o olho, cada um em cinco degraus. */
const TINTAS: Record<string, [Material, number]> = {
  X: ['cabelo', CONTORNO], v: ['cabelo', FUNDA], c: ['cabelo', SOMBRA], C: ['cabelo', BASE], '9': ['cabelo', LUZ],
  '#': ['pele', CONTORNO], q: ['pele', FUNDA], p: ['pele', SOMBRA], P: ['pele', BASE], '1': ['pele', LUZ],
  y: ['olho', CONTORNO], u: ['olho', FUNDA], o: ['olho', SOMBRA], O: ['olho', BASE], '0': ['olho', LUZ],
};

/** Sorteio fixo por pixel, para o salpicado sair igual em todo computador. */
const sorte = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function pintarPixel(a: Arte, x: number, y: number, ch: string, roupa: Roupa, salpico: number) {
  const i = y * a.largura + x;
  if (ch === '.') { a.cor[i] = 0; a.mat[i] = 0; return; }
  const t = TINTAS[ch];
  if (!t) throw new Error(`símbolo desconhecido na cabeça: ${ch}`);
  const tons = roupa[t[0]][t[1]];
  const hex = tons.length > 1 && sorte(x, y, 11) < salpico ? tons[1 + Math.floor(sorte(y, x, 12) * (tons.length - 1))] : tons[0];
  a.cor[i] = cor(hex);
  a.mat[i] = numeroDo(t[0]);
}

/** A cabeça em coordenadas do zip: a primeira linha é a linha 0. */
function pintarCabeca(linhas: string[], roupa: Roupa): Arte {
  const a = criarArte(32, 32);
  linhas.forEach((l, y) => { for (let x = 0; x < l.length; x++) if (l[x] !== '.') pintarPixel(a, x, y, l[x], roupa, 0.3); });
  return a;
}

function editarCabeca(c: Arte, trocas: [x: number, y: number, simbolo: string][], roupa: Roupa): Arte {
  const r = copiar(c);
  for (const [x, y, s] of trocas) pintarPixel(r, x, y, s, roupa, 0);
  return r;
}

const CABECA = [
  '',
  '',
  '',
  '',
  '............XXXX',
  '..........XXC99CXX',
  '.........XcCC999CCX',
  '.........XcCCCC99CCX',
  '........XvcCCCCCCCCcX',
  '........XvcCCCCCCCcccX',
  '........XvcccvvvvvvXXX',
  '........XvccvpPP0OOXXP#',
  '........XvcvpqpPOOOyPP#',
  '.........XvppPPPpoopPP#',
  '..........XpPPPPPcPPv#',
  '...........#qpPPcPPPp#',
  '............##qpPPp##',
];

const OLHO_FECHADO: [number, number, string][] = [[16, 11, 'P'], [17, 11, 'p'], [18, 11, 'p'], [16, 12, 'y'], [17, 12, 'y'], [18, 12, 'y'], [19, 12, 'y'], [16, 13, 'P'], [17, 13, 'p'], [18, 13, 'P']];
const BOCA_ABERTA: [number, number, string][] = [[19, 14, 'v'], [20, 14, 'y'], [21, 14, '.'], [19, 15, 'o'], [20, 15, 'y']];

// ——— o rabo ———

/** Em pé: sai do quadril para trás, desce e sobe a ponta. O pivô é a raiz, escondida atrás do corpo. */
const RABO_EM_PE: Carimbo = {
  pivo: [14, 5],
  linhas: [
    '..#............',
    '.#6#...........',
    '.#K#...........',
    '#kK#........###',
    '#kK#....####K6K',
    '.#kK####K6KKKKK',
    '.#kkK6KKKKKKkkk',
    '..##kkkkkkkk###',
    '....########...',
  ],
};
/** No chão: deitado para trás, só a ponta levanta. A última linha é a do chão. */
const RABO_NO_CHAO: Carimbo = {
  pivo: [14, 4],
  linhas: [
    '...............',
    '.##............',
    '#6K#.......####',
    '.#k########K6KK',
    '.#kK6KKKKKKKKKK',
    '.#kkKKKKkkkkkkk',
    '..##kkkk#######',
    '....####.......',
  ],
};

const DX = PE_NA_ARTE[0] - PE[0], DY = PE_NA_ARTE[1] - PE[1];
/** A raiz do rabo no zip: logo atrás da faixa, na altura do quadril. */
const RAIZ: [number, number] = [12, 24];

function comRabo(a: Arte, pose: string): Arte {
  const r = copiar(a);
  const tronco = POSES[pose]?.find((c) => 'peca' in c && (c.peca === 'troncoLimpo' || c.peca === 'tronco' || c.peca === 'inteiro'));
  const tx = tronco?.x ?? 0, ty = tronco?.y ?? 0;
  if (tronco && 'peca' in tronco && tronco.girar === 3) {
    // deitado de costas: o quadril encosta no chão e o rabo vai para a frente, por trás das pernas
    const rabo = pintarCarimbo(RABO_NO_CHAO, ROUPA_GELADEIRA);
    colarArte(r, rabo, DX + tx + RAIZ[1], PE_NA_ARTE[1] - 3, { espelhar: true, porBaixo: true });
    return r;
  }
  const x = DX + tx + RAIZ[0], y = DY + ty + RAIZ[1];
  const noChao = y + 3 > PE_NA_ARTE[1];
  const rabo = pintarCarimbo(noChao ? RABO_NO_CHAO : RABO_EM_PE, ROUPA_GELADEIRA);
  colarArte(r, rabo, x, noChao ? PE_NA_ARTE[1] - 3 : y, { porBaixo: true });
  return r;
}

function pecasDaGeladeira(): Pecas {
  const vestido = vestirPecas(pecasDoGoiaba(0), ROUPA_GELADEIRA);
  const cabeca = pintarCabeca(CABECA, ROUPA_GELADEIRA);
  const inteiro = recortar(vestido.inteiro, (_x, y, m) => !(y <= 16 && (m === 'cabelo' || m === 'pele' || m === 'olho')));
  colarArte(inteiro, cabeca, 0, 0);
  return {
    ...vestido,
    inteiro,
    cabeca,
    cabecaGrito: editarCabeca(cabeca, BOCA_ABERTA, ROUPA_GELADEIRA),
    cabecaFechados: editarCabeca(cabeca, OLHO_FECHADO, ROUPA_GELADEIRA),
    cabecaDor: editarCabeca(cabeca, [...OLHO_FECHADO, ...BOCA_ABERTA], ROUPA_GELADEIRA),
  };
}

registrarPixel('geladeira', () => {
  const pecas = pecasDaGeladeira();
  return {
    pecas: [pecas, pecas],
    roupa: ROUPA_GELADEIRA,
    enfeitar: (a, pose) => comRabo(a, pose),
    forma1: (a) => tingir(a, (c, m) => (BRANCOS.has(m) ? trocarRampa(c, ROUPA_GELADEIRA[m], OURO)
      : ROXOS.has(m) ? trocarRampa(c, ROUPA_GELADEIRA[m], ROXO_VIVO) : c)),
  };
});

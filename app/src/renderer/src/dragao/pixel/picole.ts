/**
 * O Picolé de pixel: o corpo do Goiaba — o do zip, pose por pose — com a roupa do Picolé. Pele
 * verde, quimono roxo sem manga (a manga do Goiaba vira braço verde, com as placas rosadas), faixa
 * azul-clara e sapato marrom. O que o corpo do Goiaba não tem vem daqui: as quatro cabeças, a capa
 * com as ombreiras e as placas dos braços.
 *
 * A forma 1 é o Picolé de Laranja: pele laranja com placas vermelhas, careca e sem capa, olhos
 * vermelhos. O quimono roxo fica.
 */
import { type Cor, canais, cor } from '../quadro.ts';
import { type Arte, type Carimbo, colarArte, copiar, criarArte, numeroDo, recortar, tingir } from './arte.ts';
import { CARIMBOS } from './carimbos.ts';
import { type Material, type Rampa, type Roupa, ROUPA_GOIABA, trocarRampa } from './materiais.ts';
import { type Pecas, PE, pecasDoGoiaba, vestirPecas } from './pecas.ts';
import { PE_NA_ARTE, POSES } from './poses.ts';
import { registrarPixel } from './sprites.ts';

// ——— as rampas: contorno, funda, sombra, base e luz; a primeira cor de cada degrau sobe de brilho ———

/** A pele: as sombras puxam para o azul e a luz para o amarelo, como o zip puxa a pele para o vermelho. */
const VERDE: Rampa = [
  ['#0a1f17', '#061410', '#0e2414'], ['#15603a', '#1d5a2e', '#0f5238'],
  ['#2f9b43', '#3a9e3a', '#288f45', '#34a04a'], ['#67c447', '#5fbc45', '#71ca4b', '#58b442'], ['#b6e56b', '#c8ee7c', '#a6dc5e'],
];
/** As placas dos braços. */
const ROSA: Rampa = [['#2a0a1a'], ['#8a3052'], ['#c85a80', '#bf5078'], ['#ee93aa', '#e585a0'], ['#fbc3cf']];
const LARANJA: Rampa = [['#2e0a04', '#240604'], ['#9a2a0a', '#8a2208'], ['#e0561a', '#d84c16'], ['#fb8a2e', '#f68226'], ['#ffc15a', '#ffd070']];
const VERMELHO: Rampa = [['#2a0206'], ['#6e0414'], ['#b0101e'], ['#e02a2a'], ['#ff6a50']];
/** O olho da forma 1: a íris e a pupila vermelhas; o branco fica. */
const OLHO_VERMELHO: Rampa = [['#2a0208'], ['#7a0612'], ['#e0182a'], ['#fbf3fe'], ['#fbfafe']];
const ROXO: Rampa = [
  ['#17061f', '#0e0314', '#22082a'], ['#3a1466', '#43155c', '#321060'], ['#5c2a9a', '#512492', '#6a2f9e', '#4a1f86'],
  ['#8246c2', '#7a40ba', '#8c52c8', '#7038b0', '#9a5cd0'], ['#b07ae0', '#c08ceb', '#a36cd8'],
];
/** Turbante e capa: pano branco, com sombra lilás e contorno azul-escuro. */
const BRANCO: Rampa = [['#1c1a30', '#141224'], ['#5e5c86', '#56547c'], ['#9c9cc4', '#a4a2c8', '#9294bc'], ['#dcdcee', '#d4d6ea', '#e4e2f2'], ['#ffffff', '#f8f6ff']];

/**
 * O cabelo do Picolé é o pano branco: não há cabelo no corpo do Goiaba fora da cabeça, e as cabeças
 * são daqui — então turbante e capa usam o material sem roubar o de ninguém.
 */
export const ROUPA_PICOLE: Roupa = {
  pele: VERDE,
  cabelo: BRANCO,
  olho: ROUPA_GOIABA.olho,
  camisa: ROXO,
  manga: VERDE,
  mao: VERDE,
  faixa: [['#0a1830', '#000000'], ['#1f5c9a', '#23609e'], ['#3a8fd0', '#3384c8', '#4298d6'], ['#6cc2ee', '#62b8ea', '#78caf2'], ['#b4e8fb', '#c8f0ff']],
  calca: ROXO,
  bota: [['#1a0c04', '#000000'], ['#4e2a12', '#46240e'], ['#7a4520', '#6e3c1a', '#834b24'], ['#a86a38', '#9c6032', '#b0743e'], ['#d09a5a', '#c88e50']],
  sola: [['#140802', '#0c0400'], ['#34180a'], ['#52280e', '#4a240c'], ['#74401c', '#6c3a18'], ['#9a5e2e']],
};

// ——— pintura em símbolos: 0 a 4 pele, 5 a 9 pano, y u r q t olho (do contorno à luz) ———

const SIMBOLOS = new Map<string, [Material, number]>();
[...'01234'].forEach((s, i) => SIMBOLOS.set(s, ['pele', i]));
[...'56789'].forEach((s, i) => SIMBOLOS.set(s, ['cabelo', i]));
[...'yurqt'].forEach((s, i) => SIMBOLOS.set(s, ['olho', i]));

/** Sorteio fixo por pixel, para o salpicado sair igual em todo computador. */
const sorte = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** A cor de um símbolo num pixel: o tom de sempre ou, às vezes, um dos outros do degrau. */
function corDo(simbolo: string, x: number, y: number, semente: number): [Cor, Material] {
  const s = SIMBOLOS.get(simbolo);
  if (!s) throw new Error(`símbolo desconhecido: ${simbolo}`);
  const tons = ROUPA_PICOLE[s[0]][s[1]];
  const hex = tons.length > 1 && sorte(x, y, semente) < 0.34 ? tons[1 + Math.floor(sorte(y, x, semente + 1) * (tons.length - 1))] : tons[0];
  return [cor(hex), s[0]];
}

/** Linhas de símbolos numa arte, com a linha 0 da grade na linha `y0` do zip. */
function pintar(linhas: string[], y0 = 0, semente = 3): Arte {
  const largura = Math.max(...linhas.map((l) => l.length));
  const a = criarArte(largura, linhas.length, [0, -y0]);
  linhas.forEach((l, y) => [...l].forEach((ch, x) => {
    if (ch === '.') return;
    const [c, m] = corDo(ch, x, y + y0, semente);
    a.cor[y * largura + x] = c;
    a.mat[y * largura + x] = numeroDo(m);
  }));
  return a;
}

/** Troca pixels (coordenadas do zip) por símbolos; o ponto apaga. */
function editar(p: Arte, trocas: [x: number, y: number, simbolo: string][]): Arte {
  const r = copiar(p);
  for (const [x, y, s] of trocas) {
    const i = (y + p.pivo[1]) * p.largura + x;
    if (s === '.') { r.cor[i] = 0; r.mat[i] = 0; continue; }
    const [c, m] = corDo(s, x, y, 3);
    r.cor[i] = c; r.mat[i] = numeroDo(m);
  }
  return r;
}

// ——— as cabeças ———

/**
 * A cabeça careca, no lugar da do zip: o olho grande é o dele (coluna branca na 17, escura na 18) e
 * o queixo encosta na linha 16 como o dele. A sobrancelha desce para o nariz — é a cara fechada —,
 * as antenas saem do alto da testa e a orelha pontuda aponta para trás.
 */
const CARECA = [
  '................................',
  '.............0...0..............',
  '.............2...2..............',
  '..............1...1.............',
  '.............000000.............',
  '...........0023344400...........',
  '..........023333444430..........',
  '.....0...0223333344430..........',
  '.....040.0122333333330..........',
  '......0340222333333330..........',
  '.......0143123310034430.........',
  '........001234132q0130..........',
  '.........01123433tu31...........',
  '.........01112433ty320..........',
  '..........012223333330..........',
  '...........0111233331...........',
  '................3000............',
];

/** O turbante: cobre o alto da cabeça e as antenas; a orelha fica de fora, por cima do pano. */
const TURBANTE = [
  '................................',
  '............555555..............',
  '..........5588999955............',
  '.........578889999855...........',
  '........57788889998855..........',
  '........56778888988875..........',
  '.......5667788888887755.........',
  '.......5666777777777665.........',
  '.......5788899999998885.........',
  '.......5778888888885555.........',
  '.......55777865.................',
];

const OLHO_FECHADO: [number, number, string][] = [[17, 11, '2'], [17, 12, '1'], [18, 12, '0'], [17, 13, '3'], [18, 13, '3']];
const BOCA_ABERTA: [number, number, string][] = [[18, 14, '1'], [19, 14, '0'], [20, 14, '0'], [21, 14, '.'], [19, 15, '1'], [20, 15, '0']];

type Cabecas = Pick<Pecas, 'cabeca' | 'cabecaGrito' | 'cabecaFechados' | 'cabecaDor'>;

function cabecas(turbante: boolean): Cabecas {
  let cabeca = pintar(CARECA);
  if (turbante) {
    const pano = pintar(TURBANTE);
    // a orelha (pele fora do crânio, atrás da coluna 9) fica por cima do pano
    const orelha = recortar(cabeca, (x, y) => y >= 7 && x <= 11 && y <= 11);
    colarArte(cabeca, pano, 0, 0);
    colarArte(cabeca, orelha, 0, 0);
  }
  return {
    cabeca,
    cabecaGrito: editar(cabeca, BOCA_ABERTA),
    cabecaFechados: editar(cabeca, OLHO_FECHADO),
    cabecaDor: editar(cabeca, [...OLHO_FECHADO, ...BOCA_ABERTA]),
  };
}

const DA_CABECA = new Set<Material>(['cabelo', 'pele', 'olho']);

/** As peças do Goiaba vestidas de Picolé, com as cabeças trocadas (e a do `inteiro` junto). */
function pecasDoPicole(turbante: boolean): Pecas {
  const vestidas = vestirPecas(pecasDoGoiaba(0), ROUPA_PICOLE);
  const novas = cabecas(turbante);
  const inteiro = recortar(vestidas.inteiro, (_x, y, m) => !(y <= 16 && DA_CABECA.has(m!)));
  colarArte(inteiro, novas.cabeca, 0, 0);
  return { ...vestidas, ...novas, inteiro };
}

// ——— as placas dos braços ———

/**
 * Onde vão as placas num carimbo de braço: contando a partir do ombro (a camisa) pelos pixels da
 * manga, uma placa perto do ombro e outra no antebraço, só no lado que pega luz.
 */
function placasDoCarimbo(c: Carimbo): Set<number> {
  const largura = Math.max(...c.linhas.map((l) => l.length));
  const ch = (x: number, y: number) => c.linhas[y]?.[x] ?? '.';
  const dist = new Map<number, number>();
  const fila: [number, number][] = [];
  c.linhas.forEach((l, y) => [...l].forEach((s, x) => { if ('Rr2'.includes(s)) { dist.set(y * largura + x, 0); fila.push([x, y]); } }));
  for (let i = 0; i < fila.length; i++) {
    const [x, y] = fila[i];
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (!'Mm3'.includes(ch(nx, ny)) || dist.has(ny * largura + nx)) continue;
      dist.set(ny * largura + nx, dist.get(y * largura + x)! + 1);
      fila.push([nx, ny]);
    }
  }
  const comprimento = Math.max(0, ...[...dist.values()]);
  const perto = Math.round(comprimento * 0.3), longe = Math.round(comprimento * 0.75);
  const placas = new Set<number>();
  for (const [i, d] of dist) {
    const s = ch(i % largura, Math.floor(i / largura));
    if ((s === 'M' || s === '3') && (d === perto || d === perto + 1 || d === longe || d === longe + 1)) placas.add(i);
  }
  return placas;
}

const DX = PE_NA_ARTE[0] - PE[0], DY = PE_NA_ARTE[1] - PE[1];

/**
 * Marca, na pose montada, os pixels que são placa: refaz a pilha de camadas só com etiquetas (1 é
 * corpo, 2 é placa), para saber de que carimbo veio cada pixel de manga que sobrou à vista.
 */
function marcarPlacas(pose: string, pecas: Pecas): Uint32Array {
  const marcas = criarArte(48, 40, PE_NA_ARTE);
  for (const c of POSES[pose]) {
    if ('peca' in c) {
      const p = tingir(pecas[c.peca], () => 1);
      colarArte(marcas, p, DX + (c.x ?? 0), DY + (c.y ?? 0), c);
    } else {
      const carimbo = CARIMBOS[c.carimbo];
      const placas = placasDoCarimbo(carimbo);
      const largura = Math.max(...carimbo.linhas.map((l) => l.length));
      const p = criarArte(largura, carimbo.linhas.length, carimbo.pivo);
      carimbo.linhas.forEach((l, y) => [...l].forEach((s, x) => {
        if (s === '.' || s === ' ') return;
        p.mat[y * largura + x] = 1;
        p.cor[y * largura + x] = placas.has(y * largura + x) ? 2 : 1;
      }));
      colarArte(marcas, p, DX + c.x, DY + c.y, c);
    }
  }
  return marcas.cor;
}

// ——— a capa ———

/**
 * A capa em coordenadas do tronco no parado (as costas na coluna 11, o ombro na linha 17), com as
 * ombreiras acima do ombro. Tudo o que cai debaixo do corpo é tapado: ela é colada por baixo.
 */
const CAPA_PENDURADA = {
  y0: 13,
  linhas: [
    '.....555555....',
    '...5589999855..',
    '..589999999985.',
    '..588888888885.',
    '..577888888875.',
    '..567777777765.',
    '...55666666555.',
    '....5878878888.',
    '....5788787888.',
    '....5878878888.',
    '...57887887888.',
    '...58788788888.',
    '...57887887888.',
    '..577887887888.',
    '..578788788788.',
    '..566766766766.',
    '...5555555555..',
  ],
};
const CAPA_AO_VENTO = {
  y0: 13,
  linhas: [
    '.....555555....',
    '...5589999855..',
    '..589999999985.',
    '.55888888888885',
    '5899788888888875',
    '58887777777765.',
    '57878766666655.',
    '.5787878788888.',
    '..577878787888.',
    '...5767676788..',
    '....5555666688.',
    '........55555..',
  ],
};
const CAPA_NO_AR = {
  y0: 7,
  linhas: [
    '.55............',
    '5895...........',
    '58895..........',
    '.58895.........',
    '.578895........',
    '..57889555555..',
    '..5788999999855',
    '..589999999998.',
    '..588888888885.',
    '..577888888875.',
    '..567777777765.',
    '...55666666555.',
    '....5878878888.',
    '....5787787888.',
    '.....556676788.',
    '.......555555..',
  ],
};

const NO_AR = new Set(['caindo', 'voando']);
const AO_VENTO = new Set(['investida', 'rasteira', 'pulando', 'socoAereo', 'chuteAereo']);

/** Onde está o tronco numa pose: a camada do tronco (ou do corpo inteiro), com o giro dela. */
function ondeEstaOTronco(pose: string): { x: number; y: number; girar: 0 | 1 | 2 | 3 } {
  for (const c of POSES[pose]) {
    if ('peca' in c && (c.peca === 'troncoLimpo' || c.peca === 'tronco' || c.peca === 'inteiro')) {
      return { x: c.x ?? 0, y: c.y ?? 0, girar: c.girar ?? 0 };
    }
  }
  return { x: 0, y: 0, girar: 0 };
}

/** Deitado, a capa fica estendida no chão por baixo dele, e sobra além da cabeça. */
const CAPA_DEITADA = [
  '.555....................',
  '58895555................',
  '5889999888555555555.....',
  '57888888888877777766555.',
  '555555555555555555555555',
];

function vestirCapa(a: Arte, pose: string): Arte {
  const r = copiar(a);
  const t = ondeEstaOTronco(pose);
  if (t.girar) {
    const capa = pintar(CAPA_DEITADA, 0, 5);
    capa.pivo = [0, 0];
    colarArte(r, capa, 0, 40 - CAPA_DEITADA.length, { porBaixo: true });
    return r;
  }
  const molde = NO_AR.has(pose) ? CAPA_NO_AR : AO_VENTO.has(pose) ? CAPA_AO_VENTO : CAPA_PENDURADA;
  // o chão, em coordenadas do tronco: a capa que passaria dele é cortada e ganha contorno ali
  const chao = PE[1] - t.y;
  const linhas = molde.linhas.map((l, i) => (molde.y0 + i > chao ? '' : molde.y0 + i === chao ? l.replace(/[6-9]/g, '5') : l));
  const capa = pintar(linhas, molde.y0, 5);
  colarArte(r, capa, DX + t.x, DY + t.y, { porBaixo: true });
  return r;
}

// ——— a ficha ———

const vermelhoDe = (c: Cor) => { const [r, g] = canais(c); return r > g; };

registrarPixel('picole', () => {
  const pecas: [Pecas, Pecas] = [pecasDoPicole(true), pecasDoPicole(false)];
  return {
    pecas,
    roupa: ROUPA_PICOLE,
    enfeitar: (a, pose, forma) => {
      const marcas = marcarPlacas(pose, pecas[forma]);
      const comPlacas = tingir(a, (c, m, x, y) => (m === 'manga' && marcas[y * a.largura + x] === 2 ? trocarRampa(c, VERDE, ROSA) : c));
      return forma === 0 ? vestirCapa(comPlacas, pose) : comPlacas;
    },
    // a pele verde vira laranja pelo brilho, e a placa (a única pele avermelhada) vira vermelha
    forma1: (a) => tingir(a, (c, m) => (m === 'pele' || m === 'mao' || m === 'manga'
      ? (vermelhoDe(c) ? trocarRampa(c, ROSA, VERMELHO) : trocarRampa(c, VERDE, LARANJA))
      : m === 'olho' ? trocarRampa(c, ROUPA_GOIABA.olho, OLHO_VERMELHO) : c)),
  };
});

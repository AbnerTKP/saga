/**
 * Os materiais do lutador de pixel. Um lutador não é uma lista de cores: é pele, cabelo, camisa,
 * manga, mão, faixa, calça, bota e sola, cada um com a sua rampa de tons. O Goiaba tem as rampas
 * TIRADAS do zip; os outros lutadores trocam as rampas (pele verde, roupa roxa) e herdam o corpo
 * inteiro, poses incluídas, sem redesenhar pixel nenhum.
 *
 * A rampa tem cinco degraus — contorno, funda, sombra, base e luz. Os carimbos são desenhados em
 * três (sombra, base e luz) mais o contorno; a funda é o degrau abaixo, e é para onde desce o
 * membro que fica ATRÁS do corpo. Cada degrau pode ter mais de uma cor: a primeira é a de sempre,
 * as outras salpicam o carimbo como o zip salpica a roupa — sem isso o carimbo sai liso, com cara
 * de outro desenhista.
 */
import { type Cor, canais, cor, deCanais } from '../quadro.ts';

export const MATERIAIS = ['pele', 'cabelo', 'olho', 'camisa', 'manga', 'mao', 'faixa', 'calca', 'bota', 'sola'] as const;
export type Material = (typeof MATERIAIS)[number];

/**
 * A letra de cada material. No mapa da base é o material do pixel; no carimbo a minúscula é a
 * sombra, a maiúscula a base, e o dígito ao lado a luz.
 */
export const LETRAS: Record<Material, [sombra: string, luz: string]> = {
  pele: ['p', '1'], camisa: ['r', '2'], manga: ['m', '3'], mao: ['l', '4'], faixa: ['f', '5'],
  calca: ['k', '6'], bota: ['b', '7'], sola: ['s', '8'], cabelo: ['c', '9'], olho: ['o', '0'],
};

/** Os degraus da rampa, do escuro ao claro. */
export const CONTORNO = 0, FUNDA = 1, SOMBRA = 2, BASE = 3, LUZ = 4;

export type Rampa = [contorno: string[], funda: string[], sombra: string[], base: string[], luz: string[]];
export type Roupa = Record<Material, Rampa>;

const azulDoZip: Rampa = [
  ['#000000', '#090514', '#00000a'], ['#011169', '#282269'], ['#0d37a6', '#0627a1', '#1946c2', '#011169'],
  ['#1c67db', '#1261bd', '#225ae4', '#1a5d80', '#186373'], ['#3089d7', '#2a70e9', '#2c72cd'],
];
const laranjaDoZip: Rampa = [
  ['#350203', '#460207', '#1c0004'], ['#dc041d', '#c90220', '#ac0012'], ['#f72211', '#ef2d11', '#fc5c09', '#dc041d'],
  ['#fd7510', '#fd8311', '#ff6b08', '#ef4c22', '#fe9825'], ['#fe9825', '#fdaf45'],
];

/**
 * O Goiaba, com as cores do próprio zip (as oito rotações dele). A primeira cor de cada degrau é a
 * que o recolorir usa de régua: por isso elas sobem de brilho sem empatar, e a luz da pele é o
 * creme da testa e não o amarelo da orelha, que tem o mesmo brilho da base.
 */
export const ROUPA_GOIABA: Roupa = {
  pele: [['#350203', '#1c0004'], ['#900008', '#7f0233'], ['#f88e84', '#f49b8a'], ['#fcc9a8'], ['#fdecc7', '#fcd187']],
  cabelo: [['#000000', '#0d021a', '#090514'], ['#29021c'], ['#40062c', '#3c0c21', '#490520', '#260d18'], ['#471929', '#501e2a'], ['#5b2932', '#633a3a']],
  olho: [['#040205'], ['#460207'], ['#701c40'], ['#fbf3fe'], ['#fbfafe']],
  camisa: laranjaDoZip,
  manga: azulDoZip,
  mao: [['#1c0004', '#000000'], ['#f58da5'], ['#f4cdc7', '#f8e5e3', '#f58da5'], ['#fdecc7', '#fffcb5', '#fefce6'], ['#fefce6', '#fbfafe']],
  faixa: [['#350203', '#000000'], ['#0d37a6'], ['#1946c2', '#225ae4'], ['#1c67db', '#1261bd'], ['#2a70e9']],
  calca: laranjaDoZip,
  bota: [['#000000', '#00000a'], ['#0627a1', '#204091'], ['#204091', '#1d32bf', '#3157bc', '#473251'], ['#2c72cd', '#1c67db', '#1261bd'], ['#3089d7', '#2a70e9']],
  sola: [['#1c0004', '#350203'], ['#5d001b', '#6f010e'], ['#ac0012', '#900008'], ['#f72211', '#dc041d'], ['#fdaf45', '#fe9825']],
};

export const brilho = (c: Cor) => {
  const [r, g, b] = canais(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const reguas = new WeakMap<Rampa, number[]>();
/** O brilho da primeira cor de cada degrau: é a régua que diz em que degrau um pixel está. */
function regua(r: Rampa): number[] {
  let v = reguas.get(r);
  if (!v) { v = r.map((d) => brilho(cor(d[0]))); reguas.set(r, v); }
  return v;
}

/** Em que ponto da rampa (de 0, contorno, a 4, luz, com fração) está uma cor, pelo brilho. */
export function degrauDe(c: Cor, r: Rampa): number {
  const l = brilho(c), v = regua(r);
  if (l <= v[0]) return 0;
  for (let i = 1; i < v.length; i++) if (l <= v[i]) return i - 1 + (l - v[i - 1]) / (v[i] - v[i - 1]);
  return v.length - 1;
}

/** A cor num ponto da rampa, misturando os dois degraus vizinhos. */
export function corNoDegrau(d: number, r: Rampa): Cor {
  const i = Math.max(0, Math.min(r.length - 1, Math.floor(d)));
  const t = Math.max(0, Math.min(1, d - i));
  const a = cor(r[i][0]);
  if (t === 0 || i === r.length - 1) return a;
  const b = cor(r[i + 1][0]);
  const [ar, ag, ab] = canais(a), [br, bg, bb] = canais(b);
  return deCanais(Math.round(ar + (br - ar) * t), Math.round(ag + (bg - ag) * t), Math.round(ab + (bb - ab) * t));
}

/**
 * Leva uma cor pintada com a rampa `de` para a rampa `para` pelo brilho: o salpicado do zip vira
 * salpicado na cor nova. É o que faz o cabelo dourado e é o que vai vestir os outros lutadores.
 */
export const trocarRampa = (c: Cor, de: Rampa, para: Rampa, deslocar = 0): Cor =>
  corNoDegrau(Math.max(0, degrauDe(c, de) + deslocar), para);

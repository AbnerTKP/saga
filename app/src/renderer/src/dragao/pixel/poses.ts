/**
 * As poses do lutador de pixel: cada uma é uma pilha de camadas, de trás para a frente — peças
 * recortadas do parado (mexidas de pixel em pixel) e carimbos. As posições são em coordenadas do
 * zip: a peça do zip vai em (dx, dy) do lugar dela, o carimbo vai com o pivô em (x, y).
 *
 * A arte de cada pose tem 48x40 e o pé encosta na última linha, na coluna 20 — é o que deixa o
 * sprite com a âncora sempre no mesmo pixel, pise o lutador com um pé, com dois ou deitado.
 *
 * O braço de trás vem antes do corpo e um degrau mais escuro (`atras`); o da frente, depois. Não
 * há inclinar: o que se inclina é a cabeça andando um pixel à frente do tronco, e o tronco um à
 * frente das pernas — em 32 pixels é o que se lê como "foi com o corpo".
 */
import { type Arte, type Colagem, colarArte, criarArte, pintarCarimbo } from './arte.ts';
import { CARIMBOS, type NomeDoCarimbo } from './carimbos.ts';
import type { Roupa } from './materiais.ts';
import { type Pecas, PE } from './pecas.ts';

export const LARGURA_DA_ARTE = 48;
export const ALTURA_DA_ARTE = 40;
/** A coluna do pé na arte da pose, e a linha dele é a última. */
export const PE_NA_ARTE: [number, number] = [20, ALTURA_DA_ARTE - 1];
const DX = PE_NA_ARTE[0] - PE[0], DY = PE_NA_ARTE[1] - PE[1];

export type NomeDaPeca = keyof Pecas;
type Cara = 'cabeca' | 'cabecaGrito' | 'cabecaFechados' | 'cabecaDor';

export type Camada =
  | ({ peca: NomeDaPeca; x?: number; y?: number } & Colagem)
  /** `atras`: o membro do outro lado do corpo, um degrau mais escuro. */
  | ({ carimbo: NomeDoCarimbo; x: number; y: number; atras?: boolean } & Colagem);

export type Pose = Camada[];

/** Tronco sem braço e cabeça, deslocados juntos; a cabeça pode ir um pouco além (`cx`, `cy`). */
const corpo = (dx = 0, dy = 0, cara: Cara = 'cabeca', cx = 0, cy = 0): Camada[] => [
  { peca: 'troncoLimpo', x: dx, y: dy },
  { peca: cara, x: dx + cx, y: dy + cy },
];
/** Um carimbo de braço no ombro (o ombro do zip é 14,17), deslocado com o corpo. */
const braco = (carimbo: NomeDoCarimbo, dx = 0, dy = 0, atras = false): Camada => ({ carimbo, x: 14 + dx, y: 17 + dy, atras });
/** As pernas de dois pés, com o quadril no meio (15,25). */
const pernas = (carimbo: NomeDoCarimbo, dx = 0, dy = 0): Camada => ({ carimbo, x: 15 + dx, y: 25 + dy });
/**
 * O corpo inteiro deitado de costas: as peças do zip giradas um quarto de volta para a esquerda,
 * a cabeça no lado de trás e as botas para a frente. Girada, a coluna 11 do zip (as costas) cai
 * na linha do chão; o que passa dela — as pontas de trás do cabelo — fica debaixo da terra.
 */
const deitado = (cara: Cara, x = -1): Camada[] => [
  { peca: 'pernas', x, y: 41, girar: 3 },
  { peca: 'troncoLimpo', x, y: 41, girar: 3 },
  { peca: cara, x, y: 41, girar: 3 },
];

export const POSES: Record<string, Pose> = {
  parado0: [{ peca: 'inteiro' }],
  parado1: [{ peca: 'pernas' }, { peca: 'tronco', y: 1 }, { peca: 'cabeca', y: 1 }],

  andar1: [pernas('pernasPassada'), { peca: 'tronco', y: 1 }, { peca: 'cabeca', y: 1 }],
  andar2: [pernas('pernasCruzando'), { peca: 'tronco' }, { peca: 'cabeca' }],
  andar3: [pernas('pernasPassada2'), { peca: 'tronco', y: 1 }, { peca: 'cabeca', y: 1 }],
  andar4: [pernas('pernasCruzando2'), { peca: 'tronco' }, { peca: 'cabeca' }],
  investida: [braco('bracoAtras', 0, 1, true), pernas('pernasPassada', 1), ...corpo(2, 1, 'cabeca', 1), braco('bracoAtras', 2, 1)],
  recuo: [pernas('pernasQueda', -1), ...corpo(-1, 0, 'cabeca', -1), braco('punhoGuarda', -2, 0, true), braco('punhoGuarda', -1)],

  agachado: [pernas('pernasAgachado', 0, 2), braco('punhoGuarda', -1, 3, true), ...corpo(0, 3), braco('punhoGuarda', 0, 3)],
  pulando: [pernas('pernasPulo'), braco('bracoSolto', -1, 0, true), ...corpo(), braco('punhoGuarda')],
  caindo: [pernas('pernasQueda'), braco('bracoSolto', -2, -1, true), ...corpo(), braco('bracoSolto', 1, -1)],
  pouso: [pernas('pernasAgachado', 0, 2), braco('bracoSolto', -1, 3, true), ...corpo(0, 3), braco('bracoSolto', 1, 3)],

  defesa: [pernas('pernasGuarda'), braco('bracoDefesa', -2, 0, true), ...corpo(-1), braco('bracoDefesa', -1, 1)],
  defesaBaixa: [pernas('pernasAgachado', 0, 2), braco('bracoDefesa', -2, 3, true), ...corpo(-1, 3), braco('bracoDefesa', -1, 4)],

  socoPreparo: [pernas('pernasGuarda'), braco('punhoGuarda', -2, 0, true), ...corpo(-1), braco('punhoGuarda', -1)],
  soco: [pernas('pernasGuarda'), braco('punhoGuarda', -1, 0, true), ...corpo(1), braco('bracoSoco', 1)],
  socoTras: [pernas('pernasGuarda'), braco('bracoSoco', 1, 0, true), ...corpo(2), braco('punhoGuarda', -1, 1)],
  socoForte: [pernas('pernasGuarda'), braco('punhoTenso', -2, 0, true), ...corpo(1), braco('bracoCima', 1)],

  chutePreparo: [{ carimbo: 'pernaApoio', x: 14, y: 25, atras: true }, braco('punhoGuarda', -2, 0, true), ...corpo(-1), { carimbo: 'joelhoAlto', x: 16, y: 21 }, braco('punhoGuarda', -1)],
  chute: [{ carimbo: 'pernaApoio', x: 13, y: 25, atras: true }, ...corpo(-2), { carimbo: 'pernaChute', x: 16, y: 24 }, braco('punhoGuarda', -2)],
  chuteAlto: [{ carimbo: 'pernaApoio', x: 13, y: 25, atras: true }, ...corpo(-2), { carimbo: 'pernaAlta', x: 16, y: 24 }, braco('punhoGuarda', -3)],

  socoBaixo: [pernas('pernasAgachado', 0, 2), braco('punhoGuarda', -1, 3, true), ...corpo(1, 3), braco('bracoSoco', 1, 3)],
  rasteira: [braco('bracoApoio', -3, 7, true), { carimbo: 'pernaApoio', x: 12, y: 27, atras: true }, ...corpo(-2, 6), { carimbo: 'pernaRasteira', x: 16, y: 28 }, braco('bracoApoio', -2, 7)],

  socoAereo: [pernas('pernasPulo'), braco('punhoGuarda', -1, 0, true), ...corpo(1), braco('bracoSoco', 1)],
  chuteAereo: [{ carimbo: 'joelhoAlto', x: 14, y: 22, atras: true }, ...corpo(-1), { carimbo: 'pernaVoadora', x: 16, y: 22 }, braco('punhoGuarda', -1)],

  maosNoQuadril: [pernas('pernasGuarda'), ...corpo(-1), braco('maosNoQuadril', -1)],
  rajada: [pernas('pernasGuarda'), braco('punhoGuarda', -1, 0, true), ...corpo(1), braco('maoAberta', 1)],
  soltarDuas: [pernas('pernasGuarda'), braco('maoAberta', 1, -1, true), ...corpo(1, 0, 'cabecaGrito'), braco('maoAberta', 1)],
  carrega: [pernas('pernasPassada'), ...corpo(-2, 1, 'cabecaGrito'), braco('maosNoQuadril', -2, 1)],
  solta: [pernas('pernasPassada'), braco('maoAberta', 2, 0, true), ...corpo(2, 1, 'cabecaGrito'), braco('maoAberta', 2, 1)],
  carregar1: [pernas('pernasPassada'), { carimbo: 'punhoTenso', x: 13, y: 19, atras: true, espelhar: true }, ...corpo(0, 2, 'cabecaGrito'), braco('punhoTenso', 1, 2)],
  carregar2: [pernas('pernasPassada'), { carimbo: 'punhoTenso', x: 12, y: 18, atras: true, espelhar: true }, ...corpo(0, 1, 'cabecaGrito'), braco('punhoTenso', 2, 1)],

  apanhar1: [{ peca: 'pernas' }, braco('bracoJogado', -2, -1, true), ...corpo(-1, 0, 'cabecaDor', -1), braco('bracoJogado', -1)],
  apanhar2: [{ peca: 'pernas' }, ...corpo(-1, 1, 'cabecaFechados'), braco('bracoSolto', 0, 1)],
  apanharBaixo: [pernas('pernasAgachado', 0, 2), ...corpo(-1, 3, 'cabecaDor', -1), braco('bracoSolto', -1, 3)],
  // arremessado para trás: as pernas vão na frente, a cabeça fica para trás e os braços se abrem
  voando: [
    braco('bracoJogado', -3, 2, true), { carimbo: 'pernaChute', x: 16, y: 25, atras: true },
    { peca: 'troncoLimpo', y: 3 }, { peca: 'cabecaDor', x: -2, y: 5 },
    { carimbo: 'pernaChute', x: 17, y: 27 }, braco('bracoJogado', 0, 2),
  ],
  caido: [...deitado('cabecaFechados')],
  levantando: [pernas('pernasAjoelhado', 0, 2), ...corpo(1, 3, 'cabeca', 1), braco('bracoSolto', 3, 3)],

  vitoria: [{ peca: 'pernas' }, braco('punhoTenso', -2, 0, true), ...corpo(0, 0, 'cabecaGrito'), braco('bracoCima')],
  derrota: [{ peca: 'pernas' }, ...corpo(0, 1, 'cabecaFechados', 1, 1), braco('bracoSolto', 0, 1)],
  sumindo: [pernas('pernasAgachado', 0, 2), braco('punhoGuarda', -1, 2, true), ...corpo(0, 2), braco('punhoGuarda', 0, 2)],
};

export type Lutador = { pecas: Pecas; roupa: Roupa };

export function montarPose(pose: Pose, l: Lutador): Arte {
  const a = criarArte(LARGURA_DA_ARTE, ALTURA_DA_ARTE, PE_NA_ARTE);
  for (const c of pose) {
    if ('peca' in c) colarArte(a, l.pecas[c.peca], DX + (c.x ?? 0), DY + (c.y ?? 0), c);
    else colarArte(a, pintarCarimbo(CARIMBOS[c.carimbo], l.roupa, c.atras), DX + c.x, DY + c.y, c);
  }
  return a;
}

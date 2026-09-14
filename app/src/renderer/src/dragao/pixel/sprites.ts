/**
 * O lutador de pixel pronto para a luta: a pose montada, vestida com a forma e ampliada 3x sem
 * suavizar, no mesmo quadro e com a mesma âncora do sprite dos outros lutadores — o jogo cola um
 * ou outro sem saber a diferença.
 *
 * Hoje só o Goiaba tem sprite de pixel. Os outros entram em `FICHAS` com a roupa deles e as peças
 * do Goiaba vestidas com ela (`vestirPecas`), trocando as cabeças; corpo e poses vêm de graça.
 */
import { SPRITE } from '../boneco.ts';
import { type Quadro, criarQuadro, girarMatiz } from '../quadro.ts';
import type { Retrato } from '../retrato.ts';
import type { IdDoLutador } from '../tipos.ts';
import { type Arte, criarArte, limites, tingir } from './arte.ts';
import { ROUPA_GOIABA, type Rampa, trocarRampa } from './materiais.ts';
import { type Pecas, pecasDoGoiaba } from './pecas.ts';
import { ALTURA_DA_ARTE, LARGURA_DA_ARTE, type Lutador, montarPose, PE_NA_ARTE, POSES } from './poses.ts';

/** Quantos pixels da tela cada pixel da arte ocupa. */
export const tamanhoDoPixel = 3;

/** As poses que existem, na ordem da tabela. */
export const CHAVES_DO_PIXEL = Object.keys(POSES);

/**
 * O cabelo do Super Goiabadin: o salpicado do zip levado para o dourado pelo brilho, quase um
 * degrau abaixo — sem descer, o miolo do cabelo (que no zip já é o tom claro) virava creme, e o
 * dourado sumia.
 */
const OURO: Rampa = [['#6b3406'], ['#c26d0c'], ['#e0a21c'], ['#ffe45a'], ['#fffbd0']];
/** O olho verde-água: a íris e a pupila; o branco fica. */
const VERDE_AGUA: Rampa = [['#07393a'], ['#0c6f68'], ['#26b8a4'], ['#fbf3fe'], ['#fbfafe']];

/**
 * O que um lutador de pixel fornece: as peças (normal e transformado), a roupa (as rampas dos
 * materiais), o recolorir da forma transformada e, se precisar, os enfeites que o corpo do Goiaba
 * não tem (capa, rabo, turbante), pintados por cima da pose montada.
 */
export type FichaDePixel = {
  pecas: [Pecas, Pecas];
  roupa: typeof ROUPA_GOIABA;
  forma1: (a: Arte) => Arte;
  /** Chamado com a pose já montada (antes do recolorir da forma 1); devolve a arte enfeitada. */
  enfeitar?: (a: Arte, pose: string, forma: 0 | 1) => Arte;
};
type Ficha = FichaDePixel;

/**
 * Cada lutador de pixel se registra no próprio arquivo (`vegetal.ts`, `picole.ts`,
 * `geladeira.ts`), e `todos.ts` importa todos: assim os três são feitos lado a lado sem ninguém
 * editar a mesma tabela.
 */
export function registrarPixel(id: IdDoLutador, fabrica: () => FichaDePixel) {
  FICHAS[id] = fabrica;
  fichas.delete(id);
  for (const k of [...cache.keys()]) if (k.startsWith(`${id}|`)) cache.delete(k);
  for (const k of [...retratos.keys()]) if (k.startsWith(`${id}|`)) retratos.delete(k);
}

const FICHAS: Partial<Record<IdDoLutador, () => Ficha>> = {
  goiaba: () => ({
    pecas: [pecasDoGoiaba(0), pecasDoGoiaba(1)],
    roupa: ROUPA_GOIABA,
    forma1: (a) => tingir(a, (c, m) => (m === 'cabelo' ? trocarRampa(c, ROUPA_GOIABA.cabelo, OURO, -0.7)
      : m === 'olho' ? trocarRampa(c, ROUPA_GOIABA.olho, VERDE_AGUA) : c)),
  }),
};
const fichas = new Map<IdDoLutador, Ficha>();
function fichaDe(id: IdDoLutador): Ficha | null {
  const f = FICHAS[id];
  if (!f) return null;
  if (!fichas.has(id)) fichas.set(id, f());
  return fichas.get(id)!;
}

const SUFIXOS = ['ko', 's', 't', 'v'];
/** A pose de uma chave da luta: tira o grito da super (s), da transformação (t), a volta (v) e o nocaute (ko). */
export function poseDaChave(chave: string): string | null {
  let c = chave;
  for (;;) {
    if (c in POSES || c === 'vazio') return c;
    const s = SUFIXOS.find((s) => c.endsWith(s) && c.length > s.length);
    if (!s) return null;
    c = c.slice(0, -s.length);
  }
}

/** A arte da pose (48x40, pé na coluna 20 da última linha), já vestida com a forma. */
export function artePixel(id: IdDoLutador, forma: 0 | 1, chave: string): Arte | null {
  const f = fichaDe(id);
  if (!f) return null;
  const nome = poseDaChave(chave) ?? 'parado0';
  if (nome === 'vazio') return criarArte(LARGURA_DA_ARTE, ALTURA_DA_ARTE, PE_NA_ARTE);
  const l: Lutador = { pecas: f.pecas[forma], roupa: f.roupa };
  const montada = montarPose(POSES[nome], l);
  const a = f.enfeitar ? f.enfeitar(montada, nome, forma) : montada;
  return forma === 1 ? f.forma1(a) : a;
}

/** Amplia sem suavizar para dentro de um quadro, com o pixel (ax, ay) da arte no pixel (qx, qy) do quadro. */
function ampliarEm(q: Quadro, a: Arte, e: number, ax: number, ay: number, qx: number, qy: number) {
  for (let y = 0; y < a.altura; y++) for (let x = 0; x < a.largura; x++) {
    const c = a.cor[y * a.largura + x];
    if (!a.mat[y * a.largura + x]) continue;
    const x0 = qx + (x - ax) * e, y0 = qy + (y - ay) * e;
    for (let yy = Math.max(0, y0); yy < Math.min(q.altura, y0 + e); yy++) {
      for (let xx = Math.max(0, x0); xx < Math.min(q.largura, x0 + e); xx++) q.px[yy * q.largura + xx] = c;
    }
  }
}

const cache = new Map<string, Quadro>();

/** Quem não gira na segunda cor: a pele (e o que usa a rampa dela, como o braço do Picolé), o cabelo e o olho. */
function segundaCor(a: Arte, f: Ficha): Arte {
  const pele = f.roupa.pele[3][0], mao = f.roupa.mao[3][0];
  return tingir(a, (c, m) => {
    const base = f.roupa[m][3][0];
    return m === 'cabelo' || m === 'olho' || base === pele || base === mao ? c : girarMatiz(c, 150);
  });
}

/**
 * O sprite de pixel de um lutador numa pose, do tamanho de `SPRITE`, olhando para a direita e com
 * os pés na âncora: a coluna do pé centrada em `ancoraX` (o espelho cai no mesmo lugar) e a sola
 * na linha logo acima de `ancoraY`, que é a do chão. Null se o lutador ainda não tem pixel.
 *
 * A segunda cor (`cor` 1) é a do espelho, Goiaba contra Goiaba: a roupa gira de matiz.
 */
export function quadroDoPixel(id: IdDoLutador, forma: 0 | 1, chave: string, cor: 0 | 1 = 0): Quadro | null {
  // o grito e a volta desenham a mesma pose: guardar pela pose, e não pela chave, divide o quadro
  const nome = poseDaChave(chave) ?? 'parado0';
  const k = `${id}|${forma}|${nome}|${cor}`;
  const pronto = cache.get(k);
  if (pronto) return pronto;
  const vestida = artePixel(id, forma, nome);
  if (!vestida) return null;
  const a = cor === 1 ? segundaCor(vestida, fichaDe(id)!) : vestida;
  const q = criarQuadro(SPRITE.largura, SPRITE.altura);
  const e = tamanhoDoPixel;
  ampliarEm(q, a, e, PE_NA_ARTE[0], PE_NA_ARTE[1], SPRITE.ancoraX - (e >> 1), SPRITE.ancoraY - e);
  cache.set(k, q);
  return q;
}

const retratos = new Map<string, Retrato>();

/**
 * O retrato do placar: 32x32, o parado ampliado 2x com a cabeça inteira e o começo da gola — como
 * o retrato dos outros lutadores, que também corta a nuca do cabelo. Na forma dourada a ponta de
 * cima sobra um pixel acima da janela e fica de fora: cortar o queixo seria pior. Lembra onde está
 * a cabeça (`Retrato`), para o placar compacto tirar dele um rosto menor.
 */
export function retratoDoPixel(id: IdDoLutador, forma: 0 | 1): Retrato | null {
  const k = `${id}|${forma}`;
  const pronto = retratos.get(k);
  if (pronto) return pronto;
  const f = fichaDe(id);
  if (!f) return null;
  const inteiro = f.pecas[forma].inteiro;
  const vestido = forma === 1 ? f.forma1(inteiro) : inteiro;
  const lim = limites(f.pecas[forma].cabeca)!;
  // em coordenadas do zip: 16 colunas até a frente do rosto, 16 linhas a partir do topo (ou da linha 0)
  const x0 = lim[2] - 15, y0 = Math.max(0, lim[1] - inteiro.pivo[1]);
  const q = criarQuadro(32, 32);
  ampliarEm(q, vestido, 2, x0 + inteiro.pivo[0], y0 + inteiro.pivo[1], 0, 0);
  let topo = 32, esq = 32, dir = -1;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (!q.px[y * 32 + x] || y >= 30) continue;
    if (y < topo) topo = y;
    if (x < esq) esq = x;
    if (x > dir) dir = x;
  }
  // o miolo da cabeça do zip fica na coluna 15,5 e na linha 10,5 (entre a testa e a orelha)
  const r: Retrato = Object.assign(q, { cabeca: [(15.5 - x0) * 2, (10.5 - y0) * 2] as [number, number], topo, meio: (esq + dir + 1) / 2 });
  retratos.set(k, r);
  return r;
}

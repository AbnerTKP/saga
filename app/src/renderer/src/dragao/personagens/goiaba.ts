/**
 * Goiaba — o herói de quimono laranja e cabelo espetado. Equilibrado: nem o mais rápido nem o
 * mais forte, e é o que tem a rajada grande, a Onda Goiabada. Transformado (`forma` 1) é o Super
 * Goiabadin: cabelo dourado em pé, sobrancelha dourada e olho verde-água, com a mesma roupa.
 *
 * O traço é o da arte que o dono mandou: cabeça grande (com o cabelo, uns 40% da altura), tronco
 * curto, pernas grossas, olho grande de anime e NENHUM preto. O contorno de cada peça é a sombra
 * mais funda da própria cor — bordô no laranja e na pele, marinho no azul, marrom no cabelo —, a
 * sombra puxa para o vermelho e o roxo e a luz para o amarelo.
 */
import { type Cor, cor, linha, misturar, pixel } from '../quadro.ts';
import {
  type Corpo, type Esqueleto, type Personagem, type Pintor, type Pose, medidasDoSprite, naCabeca, noOsso, noTronco, tinta,
} from '../boneco.ts';
import type { Forma, P, Tinta } from '../raster.ts';

const pintado = (t: Tinta): Tinta => ({ ...t, pontilhado: true });

const C = {
  pele: tinta(cor('#fdc8a0'), cor('#e88c78'), cor('#5c1a22'), cor('#fff0c6'), 2),
  // o rosto é a peça grande de pele: só nele a passagem de sombra é pontilhada
  rosto: pintado(tinta(cor('#fdc8a0'), cor('#e88c78'), cor('#5c1a22'), cor('#fff0c6'), 2)),
  peleAtras: tinta(cor('#e88c78'), cor('#c05a62'), cor('#4e1420'), undefined, 2),
  laranja: pintado(tinta(cor('#fb7a18'), cor('#d4401e'), cor('#64101a'), cor('#ffb24a'), 2)),
  laranjaAtras: pintado(tinta(cor('#d4401e'), cor('#a22228'), cor('#560c18'), undefined, 2)),
  azul: tinta(cor('#2a62da'), cor('#1c349e'), cor('#0c1350'), cor('#56a4f4'), 1),
  azulAtras: tinta(cor('#1c349e'), cor('#161d70'), cor('#0a0e40'), undefined, 1),
  aro: tinta(cor('#f4c466'), cor('#c87a3c'), cor('#5a2414'), cor('#fff1aa'), 1),
  aroAtras: tinta(cor('#c87a3c'), cor('#944e2e'), cor('#481a10'), undefined, 1),
  sola: tinta(cor('#7a2a3c'), cor('#50182e'), cor('#28081a'), cor('#9c4856'), 1),
  // castanho bem escuro, puxado para o vinho, e não preto: o contorno dele ainda é cor
  cabelo: pintado(tinta(cor('#4e1e2c'), cor('#33101e'), cor('#1e0610'), cor('#74383e'), 2)),
  ouro: pintado(tinta(cor('#ffe04a'), cor('#ec981e'), cor('#743206'), cor('#fffad0'), 2)),
  fioCastanho: cor('#86464a'),
  fioOuro: cor('#fffad0'),
  cilio: cor('#2a0a12'),
  branco: cor('#fff6ee'),
  brilho: cor('#ffffff'),
  iris: cor('#3c0c1c'),
  irisBaixo: cor('#8c2e44'),
  verde: cor('#137a74'),
  verdeClaro: cor('#52e0cc'),
  rubor: cor('#f3907c'),
  boca: cor('#9a3436'),
  bocaFunda: cor('#4e1020'),
  lingua: cor('#e0606a'),
  sobrancelhaOuro: cor('#ffd84a'),
  ambar: cor('#a8600e'),
  emblema: cor('#fff6ee'),
};

// Tronco, braço inteiro e perna inteira ficam com as medidas de antes: `animacoes.ts` estica as poses
// dos outros lutadores a partir delas, e mudar a soma aqui mudaria o gesto de todo mundo. O que o
// chibi mexe é onde as coisas pregam: ombro baixo, logo debaixo do queixo, e a cabeça grande por
// cima do pescoço, que some.
export const corpoDoGoiaba: Corpo = {
  tronco: 18,
  pescoco: 7,
  bracoSup: 9.5,
  antebraco: 10.5,
  coxa: 13,
  canela: 13.5,
  ombroF: [3.5, 12.5],
  ombroT: [-4, 13],
  quadrilF: [2.5, 0],
  quadrilT: [-3, 0],
};

const RAD = Math.PI / 180;
/** A luz do desenho, a mesma de `raster.ts`: do alto e da frente. */
const LUZ: P = [0.55, -0.83];

/**
 * A escala do desenho em curso, lida de um ajudante: 1 no retrato do placar, 1,5 na luta. Detalhe
 * de pixel não escala sozinho, então olho, boca e emblema têm um desenho para cada tamanho.
 */
const escalaAgora = () => noOsso([0, 0], [1, 0], 0, 1)[1];

/** De que lado de `noOsso(a, b)` fica a luz: +1 ou -1. */
const ladoDaLuz = (a: P, b: P) => (-(b[1] - a[1]) * LUZ[0] + (b[0] - a[0]) * LUZ[1] >= 0 ? 1 : -1);

/** O seno da dobra na junta `b`: positivo quando `b→c` vira para o lado positivo de `noOsso(a, b)`. */
function dobra(a: P, b: P, c: P) {
  const d1x = b[0] - a[0], d1y = b[1] - a[1], d2x = c[0] - b[0], d2y = c[1] - b[1];
  return (d1x * d2y - d1y * d2x) / (Math.hypot(d1x, d1y) * Math.hypot(d2x, d2y) || 1);
}

/**
 * Um detalhe desenhado pixel a pixel (olho, boca, emblema) no ponto `c`, girado em `ang`. Cada
 * pixel do quadro pergunta de que pixel do desenho veio: girar o desenho pixel a pixel deixaria
 * buracos na diagonal. Até 30 graus de um ângulo reto ele não gira — olho inclinado 12 graus só
 * serrilha —, e o de quem está deitado gira inteiro.
 */
function carimbo(p: Pintor, c: P, ang: number, mapa: string[], tintas: Record<string, Cor>) {
  const reto = Math.round(ang / 90) * 90;
  const t = (Math.abs(ang - reto) <= 30 ? reto : ang) * RAD;
  const cs = Math.abs(ang - reto) <= 30 ? Math.round(Math.cos(t)) : Math.cos(t);
  const sn = Math.abs(ang - reto) <= 30 ? Math.round(Math.sin(t)) : Math.sin(t);
  const w = mapa[0].length, a = mapa.length;
  const r = Math.ceil(Math.hypot(w, a) / 2) + 1;
  const x0 = Math.floor(c[0]), y0 = Math.floor(c[1]);
  for (let y = y0 - r; y <= y0 + r; y++) {
    for (let x = x0 - r; x <= x0 + r; x++) {
      const rx = x + 0.5 - c[0], ry = y + 0.5 - c[1];
      const ch = mapa[Math.floor(-rx * sn + ry * cs + a / 2)]?.[Math.floor(rx * cs + ry * sn + w / 2)];
      if (ch !== undefined && ch !== '.') pixel(p.q, x, y, tintas[ch]);
    }
  }
}

// Os detalhes na escala da luta, olhando para a direita: K cílio, W branco, I a íris (castanha;
// verde-água no Super), J o fundo claro dela, H o brilho, s sombra da pele, r o rubor, B boca,
// D o fundo da boca, R língua, G e A a sobrancelha dourada. O olho é o de anime da arte do dono:
// alto, a pálpebra grossa com a ponta do cílio para trás, o branco atrás da íris e o brilho no alto.
const OLHO = ['K......', '.KKKKK.', '.KKKKKK', '.WWIIHI', '.WWIIII', '.WWIIII', '.WWJJJI', '..WJJJ.', '.......'];
const OLHO_FECHADO = ['.......', '.......', '.......', '.......', 'KKK....', '..KKKKK', '.......', '.......', '.......'];
const OLHO_NOCAUTE = ['.......', '.......', '.K...K.', '..K.K..', '...K...', '..K.K..', '.K...K.', '.......', '.......'];
const SOBRANCELHA = ['KKK..', '.KKKK', '...KK'];
const SOBRANCELHA_SUPER = ['GG...', 'AGGG.', '.AGGG', '...AA'];
const BOCA = ['BB'];
const BOCA_GRITO = ['DDD', 'DRD', '.DD'];
const RUBOR = ['rr'];
const ORELHA = ['.s', 's.', 's.', '.s'];
const EMBLEMA = ['.WWW.', 'WKKKW', 'WWKWW', 'WWKWW', '.WWW.'];
// no retrato do placar a cabeça tem 17 pixels, e cada traço do rosto vira um ou dois
const OLHO_P = ['KKK', 'WII', 'WJI'];
const OLHO_FECHADO_P = ['...', 'KKK', '...'];
const OLHO_NOCAUTE_P = ['K.K', '.K.', 'K.K'];
const SOBRANCELHA_P = ['KK.', '.KK'];
const SOBRANCELHA_SUPER_P = ['GG.', '.GG'];
const BOCA_GRITO_P = ['DD', 'DR'];
const EMBLEMA_P = ['WWW', 'W.W', 'WWW'];

/** A mão em unidades a partir do pulso: `x` adiante no antebraço, `y` para o lado de cima. */
function naMao(cot: P, mao: P) {
  const cima = ladoDaLuz(cot, mao);
  return (x: number, y: number) => noOsso(cot, mao, 1 + x / corpoDoGoiaba.antebraco, y * cima);
}

function risco(p: Pintor, a: P, b: P, c: Cor) {
  linha(p.q, a[0], a[1], b[0], b[1], c);
}

/**
 * Punho fechado: um bloco mais largo que o pulso, o polegar deitado por cima dos dedos e as
 * dobras entre os dedos na frente. No chibi a mão é grande: é ela que diz "soco" de longe.
 */
function punho(p: Pintor, cot: P, mao: P, pele: Tinta) {
  const m = naMao(cot, mao);
  p.peca([{ tipo: 'poligono', pts: [m(-1.0, 3.2), m(3.4, 3.7), m(5.3, 2.8), m(5.9, 0.3), m(5.4, -2.5), m(3.7, -3.6), m(-1.0, -3.2)] }], pele);
  const vinco = misturar(pele.sombra, pele.contorno, 0.3);
  risco(p, m(0.5, 2.2), m(3.2, 0.8), vinco);
  for (const y of [1.1, -1.0]) risco(p, m(3.7, y), m(5.3, y), vinco);
}

/** Mão aberta, da rajada e da defesa: palma, três dedos juntos e o polegar aberto para cima. */
function maoAberta(p: Pintor, cot: P, mao: P, pele: Tinta) {
  const m = naMao(cot, mao);
  p.peca([
    { tipo: 'poligono', pts: [m(-1.0, 3.0), m(3.2, 3.2), m(6.6, 2.7), m(8.0, 1.7), m(8.4, -0.2), m(7.5, -2.3), m(3.2, -3.1), m(-1.0, -3.0)] },
    { tipo: 'capsula', a: m(1.0, 2.4), b: m(3.9, 4.6), ra: 1.2, rb: 1.0 },
  ], pele);
  const vinco = misturar(pele.sombra, pele.contorno, 0.3);
  for (const y of [1.0, -1.0]) risco(p, m(4.6, y), m(7.6, y), vinco);
}

function braco(p: Pintor, e: Esqueleto, frente: boolean) {
  const ombro = frente ? e.ombroF : e.ombroT;
  const cot = frente ? e.cotoveloF : e.cotoveloT;
  const mao = frente ? e.maoF : e.maoT;
  const pele = frente ? C.pele : C.peleAtras;
  const azul = frente ? C.azul : C.azulAtras;
  // Braço de chibi é um tubo grosso: do músculo desenhado sobrou só o volume do antebraço, do lado
  // de fora da dobra. Com o braço quase reto não há dobra que decida, e ele vai para o lado da luz:
  // sem isso o volume trocaria de lado entre dois quadros do mesmo soco.
  const sen = dobra(ombro, cot, mao);
  const fora = Math.abs(sen) > 0.3 ? -Math.sign(sen) : ladoDaLuz(cot, mao);
  const meio = noOsso(cot, mao, 0.35, fora * 0.4);
  p.peca([
    { tipo: 'capsula', a: ombro, b: cot, ra: 3.2, rb: 2.7 },
    { tipo: 'capsula', a: cot, b: meio, ra: 2.7, rb: 3.0 },
    { tipo: 'capsula', a: meio, b: mao, ra: 3.0, rb: 2.5 },
  ], pele);
  // Manga curta da camiseta azul: um tubo da grossura do braço, do ombro até um terço dele, com a
  // barra reta. Era uma bola centrada NO ombro e mais larga que ele, e lia como ombreira.
  p.peca([
    { tipo: 'capsula', a: noOsso(ombro, cot, 0.02), b: noOsso(ombro, cot, 0.28), ra: 3.9, rb: 3.6 },
    { tipo: 'poligono', pts: [noOsso(ombro, cot, 0.1, -3.8), noOsso(ombro, cot, 0.1, 3.8), noOsso(ombro, cot, 0.4, 3.6), noOsso(ombro, cot, 0.4, -3.6)] },
  ], azul);
  // munhequeira
  p.peca([{ tipo: 'capsula', a: noOsso(cot, mao, 0.66), b: noOsso(cot, mao, 0.93), ra: 3.2, rb: 3.1 }], azul);
  if ((frente ? e.pose.maoF : e.pose.maoT) === 'aberta') maoAberta(p, cot, mao, pele);
  else punho(p, cot, mao, pele);
}

function perna(p: Pintor, e: Esqueleto, frente: boolean) {
  const quadril = frente ? e.quadrilF : e.quadrilT;
  const tornozelo = frente ? e.tornozeloF : e.tornozeloT;
  const k = escalaAgora();
  // Ajoelhado fundo (a rasteira), o joelho do osso passa do chão, e a calça grossa do chibi aparecia
  // como um balão por baixo dele. Desenhado, o joelho pousa acima da linha da sola.
  const osso = frente ? e.joelhoF : e.joelhoT;
  const joelho: P = [osso[0], Math.min(osso[1], medidasDoSprite(k).ancoraY - 7 * k)];
  const laranja = frente ? C.laranja : C.laranjaAtras;
  const azul = frente ? C.azul : C.azulAtras;
  // Calça larga de chibi: estufa no meio da coxa e na canela e entra apertada na bota. A raiz é
  // mais fina que o meio para a coxa não passar da faixa: da mesma cor que o quimono, a borda dela
  // aparecia como um risco em arco em cima da cintura.
  p.peca([
    { tipo: 'capsula', a: quadril, b: noOsso(quadril, joelho, 0.45), ra: 4.8, rb: 5.9 },
    { tipo: 'capsula', a: noOsso(quadril, joelho, 0.45), b: joelho, ra: 5.9, rb: 5.2 },
    { tipo: 'capsula', a: joelho, b: noOsso(joelho, tornozelo, 0.42), ra: 5.2, rb: 5.2 },
    { tipo: 'capsula', a: noOsso(joelho, tornozelo, 0.42), b: noOsso(joelho, tornozelo, 0.56), ra: 5.2, rb: 3.8 },
  ], laranja);
  // Vincos: o pano dobra atrás do joelho (do lado para onde a canela vira) e puxa da virilha para
  // a coxa. Sem eles a calça era um balão liso, e perna dobrada não parecia dobrada.
  const vinco = misturar(laranja.sombra, laranja.contorno, 0.35);
  const sen = dobra(quadril, joelho, tornozelo);
  if (Math.abs(sen) > 0.25) {
    const s = Math.sign(sen);
    risco(p, noOsso(quadril, joelho, 0.7, s * 4.9), noOsso(quadril, joelho, 0.92, s * 1.9), vinco);
    risco(p, noOsso(joelho, tornozelo, 0.24, s * 4.6), noOsso(joelho, tornozelo, 0.08, s * 1.9), vinco);
  }
  const frenteDaCoxa = -(joelho[1] - quadril[1]) * e.u[0] + (joelho[0] - quadril[0]) * e.u[1] >= 0 ? 1 : -1;
  risco(p, noOsso(quadril, joelho, 0.2, frenteDaCoxa * 4.6), noOsso(quadril, joelho, 0.44, frenteDaCoxa * 1.8), vinco);
  // Bota por cima da barra da calça: cano, a boca do cano em couro claro e a sola. O pé segue o
  // referencial de `formaDoPe` (x para a ponta, y para cima), só que em unidades do começo ao fim.
  // Grande, como o pé de chibi: é o peso embaixo que segura a cabeça grande em cima.
  const a = ((frente ? e.pose.peF : e.pose.peT) ?? 0) * RAD;
  const cs = Math.cos(a), sn = Math.sin(a);
  const pe = (x: number, y: number): P => [tornozelo[0] + (cs * x - sn * y) * k, tornozelo[1] + (-sn * x - cs * y) * k];
  p.peca([
    { tipo: 'poligono', pts: [noOsso(joelho, tornozelo, 0.53, -4.0), noOsso(joelho, tornozelo, 0.53, 4.0), noOsso(joelho, tornozelo, 0.92, 3.7), noOsso(joelho, tornozelo, 0.92, -3.7)] },
    { tipo: 'poligono', pts: [pe(-3.2, -0.8), pe(-3.7, 2.0), pe(-2.9, 4.6), pe(1.8, 4.4), pe(5.4, 3.0), pe(7.8, 2.0), pe(8.4, 0.3), pe(7.6, -0.9)] },
  ], azul);
  p.peca([{ tipo: 'poligono', pts: [noOsso(joelho, tornozelo, 0.47, -4.5), noOsso(joelho, tornozelo, 0.47, 4.5), noOsso(joelho, tornozelo, 0.59, 4.3), noOsso(joelho, tornozelo, 0.59, -4.3)] }], frente ? C.aro : C.aroAtras);
  p.peca([{ tipo: 'poligono', pts: [pe(-3.3, -0.9), pe(-3.6, 0.5), pe(8.3, 0.5), pe(7.8, -0.9)] }], C.sola);
}

function tronco(p: Pintor, e: Esqueleto) {
  const t = (f: number, h: number) => noTronco(e, f, h);
  // Quimono curto e largo, da cintura até debaixo do queixo: a parte de cima some atrás da cabeça,
  // e é ela que segura a cabeça quando a pose a entorta para trás.
  p.peca([{ tipo: 'poligono', pts: [t(-6.6, 1), t(-7.2, 8.5), t(-6.4, 14.5), t(-3.4, 17.8), t(3.6, 17.8), t(7.2, 14.6), t(7.9, 9), t(7.3, 1)] }], C.laranja);
  // o decote em V mostra a camiseta azul
  p.peca([{ tipo: 'poligono', pts: [t(-0.6, 17.8), t(7.0, 16.0), t(3.4, 8.2)] }], { ...C.azul, faixa: 0 });
  // A gola cruzada descendo do decote até a faixa, e o pano franzido em cima dela: sem as dobras
  // o peito era uma placa laranja lisa.
  const vinco = misturar(C.laranja.sombra, C.laranja.contorno, 0.35);
  risco(p, t(3.2, 8.0), t(2.0, 5.0), vinco);
  risco(p, t(-4.4, 5.2), t(-3.8, 7.8), vinco);
  // O emblema vai nas costas, como no quimono do original. No peito ele ficava debaixo da manga do
  // braço da frente em todas as poses da luta — medido: nenhum pixel dele aparecia.
  const grande = escalaAgora() > 1.25;
  carimbo(p, t(-4.2, 10.4), e.pose.tronco, grande ? EMBLEMA : EMBLEMA_P, { W: C.emblema, K: C.laranja.contorno });
}

/**
 * A aba do quimono abaixo da faixa e a faixa: vêm DEPOIS da perna da frente, porque o pano cai por
 * cima da raiz da coxa — é isso que encurta a perna do chibi sem encurtar o osso.
 */
function cintura(p: Pintor, e: Esqueleto) {
  const t = (f: number, h: number) => noTronco(e, f, h);
  p.peca([{ tipo: 'poligono', pts: [t(-6.6, 2.6), t(7.3, 2.8), t(7.1, -3.8), t(3.4, -5.6), t(-2.2, -5.4), t(-6.9, -3.6)] }], C.laranja);
  p.peca([{ tipo: 'poligono', pts: [t(-6.9, 4.4), t(7.8, 4.8), t(7.7, 0.4), t(-6.7, -0.2)] }], C.azul);
}

/** As duas pontas da faixa caindo, abrindo um pouco no fim. */
function pontasDaFaixa(p: Pintor, e: Esqueleto) {
  const t = (f: number, h: number) => noTronco(e, f, h);
  p.peca([
    { tipo: 'capsula', a: t(7.0, 1.8), b: t(8.8, -5.2), ra: 1.2, rb: 1.6 },
    { tipo: 'capsula', a: t(5.6, 1.6), b: t(5.0, -4.2), ra: 1.1, rb: 1.5 },
  ], C.azul);
}

/** O nó por cima, com o próprio contorno: é o risco em volta que o faz ler como nó. */
function noDaFaixa(p: Pintor, e: Esqueleto) {
  p.peca([{ tipo: 'elipse', c: noTronco(e, 6.6, 2.4), rx: 2.1, ry: 1.8, ang: e.pose.tronco }], C.azul);
}

/**
 * O desenho da cabeça fica ACIMA do centro que o esqueleto conhece (e o pescoço, mais curto na
 * mesma medida): o retrato do placar garante 10 pixels abaixo desse centro, e o queixo do rosto
 * grande passava disso — no Super, com o cabelo alto, o recorte comia o queixo.
 */
const ACIMA = 1.5;

/** Mecha: base, ponta, largura na base, quanto o meio curva e se fica atrás (0) ou na frente (1). */
type Mecha = [P, P, number, number, 0 | 1];

// O crânio redondo e grande do chibi, e por baixo dele a bochecha cheia, o queixo pequeno e o
// nariz de um pixel adiante. Polígono e não elipse: caído, a cabeça amassa na linha do chão.
const CRANIO: P[] = Array.from({ length: 28 }, (_, i) => [8.4 * Math.cos((i / 28) * 2 * Math.PI), 8.3 * Math.sin((i / 28) * 2 * Math.PI)]);
const ROSTO: P[] = [[-3.6, -5.4], [-0.4, -8.2], [2.4, -9.2], [5.0, -9.4], [6.8, -8.4], [8.1, -6.2], [8.5, -4.4], [9.5, -3.2], [9.3, -2.2], [8.7, -1.4], [8.6, 2.0], [4.0, 3.0]];

// O cabelo cobre o crânio até a testa, com a costeleta descendo na frente da orelha e o vão dela
// aberto para baixo.
const CAPACETE: P[] = [
  [8.8, 5.0], [7.0, 4.4], [3.6, 4.4], [1.4, 3.0], [0.6, 0.0], [-0.2, -3.8], [-1.0, -0.6],
  [-3.6, 0.2], [-4.4, -2.6], [-5.6, -6.4], [-8.2, -4.6], [-9.2, 0.6], [-8.6, 5.4], [-6.0, 8.8],
  [-1.6, 10.0], [3.6, 9.6], [7.4, 7.8],
];

// Cabelo espetado: poucas mechas grandes sobre a base, abrindo em leque para trás e para o alto,
// uma na nuca e duas mechas de franja que param ACIMA do olho: descendo até ele, com a costeleta,
// o cabelo tapava o rosto inteiro, e o rosto grande é metade do chibi. As da frente pendem PARA BAIXO: apontando
// para fora como as outras, o cabelo virava uma estrela com a cabeça no meio.
const MECHAS: Mecha[] = [
  [[-6.0, -4.4], [-11.6, -8.2], 5.0, 0.5, 0],
  [[-7.8, 0.4], [-17.0, -2.4], 8.0, 1.0, 0],
  [[-7.4, 5.8], [-18.0, 7.8], 8.5, 0.9, 0],
  [[-4.6, 9.2], [-14.2, 16.0], 8.5, 0.8, 0],
  [[0.6, 9.6], [0.4, 17.4], 8.4, -0.8, 1],
  [[4.4, 8.6], [11.4, 13.4], 6.6, 0.8, 1],
  [[6.8, 6.0], [13.0, 6.4], 5.0, 1.0, 1],
  [[7.6, 6.0], [10.0, 1.8], 4.0, -0.4, 1],
  [[4.6, 6.4], [5.6, 2.2], 4.2, 0.3, 1],
];

// No Super as mechas se levantam: as de trás apontam para o alto em vez de caírem, o alto sobe e
// sobra uma franja solta na testa, que é a marca da transformação.
const MECHAS_SUPER: Mecha[] = [
  [[-6.2, -3.8], [-12.2, -4.6], 5.0, 0.4, 0],
  [[-7.8, 1.4], [-17.4, 6.0], 8.0, 0.8, 0],
  [[-7.0, 6.2], [-16.6, 14.4], 8.5, 0.6, 0],
  [[-4.2, 9.0], [-10.6, 19.4], 8.5, 0.6, 0],
  [[0.2, 9.8], [-0.4, 20.6], 8.6, -0.6, 1],
  [[4.0, 8.8], [9.6, 18.0], 7.0, 0.4, 1],
  [[6.6, 6.6], [13.4, 12.2], 5.4, 0.6, 1],
  [[7.4, 5.8], [9.8, 1.6], 3.8, -0.4, 1],
];

function cabelo(p: Pintor, e: Esqueleto, h: (f: number, a: number) => P) {
  const sup = e.pose.forma === 1;
  // a luz no referencial da cabeça: o fio de brilho corre do lado aceso de cada mecha
  const t = e.angCabeca * RAD;
  const luz: P = [LUZ[0] * Math.cos(t) + LUZ[1] * Math.sin(t), LUZ[0] * Math.sin(t) - LUZ[1] * Math.cos(t)];
  const camadas: Forma[][] = [[], [{ tipo: 'poligono', pts: CAPACETE.map(([f, a]) => h(f, a)) }]];
  const fios: P[][][] = [[], []];
  for (const [b, pt, w, curva, camada] of sup ? MECHAS_SUPER : MECHAS) {
    const d = Math.hypot(pt[0] - b[0], pt[1] - b[1]);
    const n: P = [-(pt[1] - b[1]) / d, (pt[0] - b[0]) / d];
    const c: P = [(b[0] + pt[0]) / 2 + n[0] * curva, (b[1] + pt[1]) / 2 + n[1] * curva];
    // Um ponto da mecha: `s` de 0 (base) a 1 (ponta) ao longo da curva, `l` de -1 a 1 na largura.
    // Os lados abaulam para fora e a ponta tem um pixel e meio: afiada, ela vira um fio solto.
    const em = (s: number, l: number): P => {
      const x = (1 - s) ** 2 * b[0] + 2 * (1 - s) * s * c[0] + s * s * pt[0];
      const y = (1 - s) ** 2 * b[1] + 2 * (1 - s) * s * c[1] + s * s * pt[1];
      const tx = 2 * (1 - s) * (c[0] - b[0]) + 2 * s * (pt[0] - c[0]);
      const ty = 2 * (1 - s) * (c[1] - b[1]) + 2 * s * (pt[1] - c[1]);
      const tl = Math.hypot(tx, ty) || 1;
      const meia = (0.5 + (w / 2 - 0.5) * (1 - s ** 1.6)) * l;
      return [x - (ty / tl) * meia, y + (tx / tl) * meia];
    };
    const S = [0, 0.2, 0.4, 0.6, 0.8, 1];
    camadas[camada].push({ tipo: 'poligono', pts: [...S.map((s) => em(s, -1)), ...[...S].reverse().map((s) => em(s, 1))].map(([f, a]) => h(f, a)) });
    // o fio claro no meio das mechas compridas é o que separa uma da outra dentro do castanho
    if (d > 6) {
      const lado = n[0] * luz[0] + n[1] * luz[1] >= 0 ? 0.38 : -0.38;
      fios[camada].push([0.16, 0.28, 0.4, 0.52, 0.64].map((s) => h(...em(s, lado))));
    }
  }
  // A camada de trás primeiro, com os fios dela: a da frente cobre os dois, e o contorno de dentro
  // dela risca a divisa entre as mechas — no dourado, é esse risco âmbar que separa uma da outra.
  for (const i of [0, 1]) {
    p.peca(camadas[i], sup ? C.ouro : C.cabelo);
    for (const f of fios[i]) for (let j = 1; j < f.length; j++) risco(p, f[j - 1], f[j], sup ? C.fioOuro : C.fioCastanho);
  }
}

function cabeca(p: Pintor, e: Esqueleto) {
  const ang = e.angCabeca;
  const sup = e.pose.forma === 1;
  const grande = escalaAgora() > 1.25;
  // Caído, a cabeça e as mechas de trás apontam para o chão: amassam na linha dele em vez de
  // atravessá-lo. A cabeça grande do chibi passava dela.
  const chao = medidasDoSprite(escalaAgora()).ancoraY - 1;
  const h = (f: number, a: number): P => {
    const q = naCabeca(e, f, a + ACIMA);
    return [q[0], Math.min(q[1], chao)];
  };
  p.peca([{ tipo: 'poligono', pts: CRANIO.map(([f, a]) => h(f, a)) }, { tipo: 'poligono', pts: ROSTO.map(([f, a]) => h(f, a)) }], C.rosto);
  // orelha, com a concha em sombra
  p.peca([{ tipo: 'elipse', c: h(-2.2, -2.6), rx: 1.8, ry: 2.3, ang }], { ...C.pele, faixa: 1 });
  if (grande) carimbo(p, h(-2.1, -2.6), ang, ORELHA, { s: C.pele.sombra });
  cabelo(p, e, h);
  const olhos = e.pose.olhos ?? 'abertos';
  const tintas = {
    K: C.cilio, W: C.branco, H: C.brilho, I: sup ? C.verde : C.iris, J: sup ? C.verdeClaro : C.irisBaixo,
    s: C.pele.sombra, r: C.rubor, B: C.boca, D: C.bocaFunda, R: C.lingua, G: C.sobrancelhaOuro, A: C.ambar,
  };
  const olho = olhos === 'abertos' ? (grande ? OLHO : OLHO_P) : olhos === 'fechados' ? (grande ? OLHO_FECHADO : OLHO_FECHADO_P) : (grande ? OLHO_NOCAUTE : OLHO_NOCAUTE_P);
  carimbo(p, h(4.6, -1.6), ang, olho, tintas);
  if (grande) carimbo(p, h(7.4, -4.9), ang, RUBOR, tintas);
  const sobrancelha = sup ? (grande ? SOBRANCELHA_SUPER : SOBRANCELHA_SUPER_P) : (grande ? SOBRANCELHA : SOBRANCELHA_P);
  carimbo(p, h(4.9, sup ? 3.6 : 3.4), ang, sobrancelha, tintas);
  carimbo(p, h(6.6, -6.6), ang, e.pose.grito ? (grande ? BOCA_GRITO : BOCA_GRITO_P) : BOCA, tintas);
}

export const goiaba: Personagem = {
  id: 'goiaba',
  nome: 'Goiaba',
  corpo: corpoDoGoiaba,
  desenhar(p, e) {
    braco(p, e, false);
    perna(p, e, false);
    tronco(p, e);
    // As pontas da faixa caem na frente da coxa quando ela está para baixo; com a perna erguida
    // num chute, é a coxa que passa na frente delas.
    const coxaBaixa = e.joelhoF[1] - e.quadrilF[1] > 0.55 * e.corpo.coxa;
    if (!coxaBaixa) pontasDaFaixa(p, e);
    perna(p, e, true);
    cintura(p, e);
    if (coxaBaixa) pontasDaFaixa(p, e);
    noDaFaixa(p, e);
    cabeca(p, e);
    braco(p, e, true);
  },
};

/**
 * As três poses de apresentação. O especial é a CARGA da Onda Goiabada, e não o disparo: soltar
 * com as duas mãos à frente é o gesto do Canhão de Alho do Vegetal também, e lado a lado os dois
 * pareceriam o mesmo golpe. As mãos em concha junto ao quadril de trás só ele faz — o braço da
 * frente atravessa a barriga, e é esse risco na diagonal que se lê a 1x.
 */
export const vitrine: { parado: Pose; especial: Pose; vitoria: Pose } = {
  // a guarda do chibi fica debaixo do queixo: na altura de antes, o punho tapava a boca
  parado: {
    quadril: [-1, -22], tronco: 8, cabeca: -4,
    pernaF: { alvo: [11, -3] }, pernaT: { alvo: [-10, -3] },
    bracoF: { alvo: [18, -31] }, bracoT: { alvo: [11, -33] },
  },
  especial: {
    quadril: [-2, -21], tronco: -8, cabeca: 4,
    pernaF: { alvo: [13, -3] }, pernaT: { alvo: [-13, -3] },
    bracoF: { alvo: [-11, -26] }, bracoT: { alvo: [-13, -25] },
    maoF: 'aberta', maoT: 'aberta', grito: true,
  },
  // o punho sobe À FRENTE do rosto e não sobre ele: reto para cima, o antebraço tapava a cara
  vitoria: {
    quadril: [0, -25], tronco: -4, cabeca: -8,
    pernaF: { alvo: [8, -3] }, pernaT: { alvo: [-6, -3] },
    bracoF: { alvo: [22, -54] }, bracoT: { ang: [-35, 110] },
  },
};

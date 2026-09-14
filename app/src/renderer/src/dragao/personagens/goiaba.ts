/**
 * Goiaba — o herói de quimono laranja e cabelo espetado. Equilibrado: nem o mais rápido nem o
 * mais forte, e é o que tem a rajada grande, a Onda Goiabada. Transformado (`forma` 1) é o Super
 * Goiabadin: cabelo dourado em pé, sobrancelha dourada e olho verde-água, com a mesma roupa.
 */
import { type Cor, cor, linha, misturar, pixel } from '../quadro.ts';
import {
  type Corpo, type Esqueleto, type Personagem, type Pintor, type Pose, medidasDoSprite, naCabeca, noOsso, noTronco, tinta,
} from '../boneco.ts';
import type { Forma, P, Tinta } from '../raster.ts';

const C = {
  contorno: cor('#1b1022'),
  pele: tinta(cor('#f4c39a'), cor('#d58f66'), cor('#1b1022'), cor('#ffe2c2'), 2),
  peleAtras: tinta(cor('#d58f66'), cor('#b06a48'), cor('#1b1022'), undefined, 2),
  laranja: tinta(cor('#f27a1a'), cor('#be4f10'), cor('#1b1022'), cor('#ffac4a'), 2),
  laranjaAtras: tinta(cor('#be4f10'), cor('#8e3708'), cor('#1b1022'), undefined, 2),
  azul: tinta(cor('#2b50b8'), cor('#1a2f78'), cor('#1b1022'), cor('#4f7ee4'), 1),
  azulAtras: tinta(cor('#1a2f78'), cor('#111e52'), cor('#1b1022'), undefined, 1),
  aro: tinta(cor('#e3b865'), cor('#b3833a'), cor('#1b1022'), cor('#f6dc9a'), 1),
  aroAtras: tinta(cor('#b3833a'), cor('#86602a'), cor('#1b1022'), undefined, 1),
  sola: tinta(cor('#4a4058'), cor('#2e2838'), cor('#1b1022'), cor('#6a6078'), 1),
  cabelo: tinta(cor('#1d1b2c'), cor('#0d0c16'), cor('#0a0810'), cor('#3c3a58'), 2),
  // o dourado do Super: o contorno é âmbar e não preto, senão o cabelo vira um recorte em volta
  ouro: tinta(cor('#ffe45a'), cor('#e0a21c'), cor('#5c3306'), cor('#fffbd0'), 2),
  fioPreto: cor('#5b5a86'),
  fioOuro: cor('#fffbd0'),
  olho: cor('#1b1022'),
  branco: cor('#ffffff'),
  boca: cor('#9a4a3a'),
  lingua: cor('#d8665a'),
  verde: cor('#45dcc8'),
  verdeFundo: cor('#1c8c88'),
  sobrancelhaOuro: cor('#ffd84a'),
  ambar: cor('#9a5a0c'),
};

export const corpoDoGoiaba: Corpo = {
  tronco: 18,
  pescoco: 8.5,
  bracoSup: 10.5,
  antebraco: 9.5,
  coxa: 13.5,
  canela: 13,
  ombroF: [4.5, 16],
  ombroT: [-5, 16.5],
  quadrilF: [2.5, 1],
  quadrilT: [-3, 1],
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

// Os detalhes na escala da luta, olhando para a direita: K contorno, W branco, I e J a íris (preta;
// verde-água no Super), H o brilho, s sombra da pele, B boca, R língua, G e A sobrancelha dourada.
// O olho é alto e a pálpebra desce para a frente, como o do arquétipo: é o que dá o olhar bravo.
const OLHO = ['KKK..', 'KKKKK', 'WWIHK', 'WWJI.', '..ss.'];
const OLHO_FECHADO = ['.....', 'KKK..', '..KKK', '.....', '.....'];
const OLHO_NOCAUTE = ['.....', '.K.K.', '..K..', '.K.K.', '.....'];
const SOBRANCELHA = ['KK..', 'KKKK', '..KK'];
const SOBRANCELHA_SUPER = ['GG..', 'AGGG', '.AGG', '..AA'];
const BOCA = ['BBB'];
const BOCA_GRITO = ['KKK', 'KRK', '.KK'];
const ORELHA = ['.s', 's.', 's.', '.s'];
const EMBLEMA = ['.WWW.', 'WKKKW', 'WWKWW', 'WWKWW', '.WWW.'];
const EMBLEMA_PEQUENO = ['WWW', 'W.W', 'WWW'];

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
 * dobras entre os dedos na frente. Era uma bola de pele, e bola não soca.
 */
function punho(p: Pintor, cot: P, mao: P, pele: Tinta) {
  const m = naMao(cot, mao);
  p.peca([{ tipo: 'poligono', pts: [m(-0.8, 2.6), m(2.8, 3.0), m(4.3, 2.2), m(4.8, 0.2), m(4.4, -2.0), m(3.0, -2.9), m(-0.8, -2.6)] }], pele);
  const vinco = misturar(pele.sombra, C.contorno, 0.3);
  risco(p, m(0.4, 1.8), m(2.6, 0.6), vinco);
  for (const y of [0.9, -0.8]) risco(p, m(3.0, y), m(4.3, y), vinco);
}

/** Mão aberta, da rajada e da defesa: palma, três dedos juntos e o polegar aberto para cima. */
function maoAberta(p: Pintor, cot: P, mao: P, pele: Tinta) {
  const m = naMao(cot, mao);
  p.peca([
    { tipo: 'poligono', pts: [m(-0.8, 2.4), m(2.6, 2.6), m(5.4, 2.2), m(6.6, 1.4), m(7.0, -0.2), m(6.2, -1.9), m(2.6, -2.5), m(-0.8, -2.4)] },
    { tipo: 'capsula', a: m(0.8, 2.0), b: m(3.2, 3.8), ra: 1.0, rb: 0.8 },
  ], pele);
  const vinco = misturar(pele.sombra, C.contorno, 0.3);
  for (const y of [0.8, -0.8]) risco(p, m(3.8, y), m(6.3, y), vinco);
}

function braco(p: Pintor, e: Esqueleto, frente: boolean) {
  const ombro = frente ? e.ombroF : e.ombroT;
  const cot = frente ? e.cotoveloF : e.cotoveloT;
  const mao = frente ? e.maoF : e.maoT;
  const pele = frente ? C.pele : C.peleAtras;
  const azul = frente ? C.azul : C.azulAtras;
  // O bíceps fica do lado de dentro da dobra do cotovelo e o volume do antebraço, do lado de fora.
  // Com o braço quase reto não há dobra que decida, e os dois vão para o lado da luz: sem isso o
  // músculo trocaria de lado entre dois quadros do mesmo soco.
  const sen = dobra(ombro, cot, mao);
  const dentro = Math.abs(sen) > 0.3 ? Math.sign(sen) : ladoDaLuz(ombro, cot);
  const fora = Math.abs(sen) > 0.3 ? -Math.sign(sen) : ladoDaLuz(cot, mao);
  p.peca([
    { tipo: 'capsula', a: ombro, b: cot, ra: 3.6, rb: 2.7 },
    { tipo: 'capsula', a: noOsso(ombro, cot, 0.4, dentro * 1.2), b: noOsso(ombro, cot, 0.72, dentro * 1.1), ra: 2.8, rb: 2.3 },
    { tipo: 'capsula', a: cot, b: noOsso(cot, mao, 0.3, fora * 0.5), ra: 2.8, rb: 3.2 },
    { tipo: 'capsula', a: noOsso(cot, mao, 0.3, fora * 0.5), b: mao, ra: 3.2, rb: 2.3 },
  ], pele);
  // Manga curta da camiseta azul: um tubo da grossura do braço, do ombro até um terço dele, com a
  // barra reta. Era uma bola centrada NO ombro e mais larga que ele, e lia como ombreira.
  p.peca([
    { tipo: 'capsula', a: noOsso(ombro, cot, 0.02), b: noOsso(ombro, cot, 0.3), ra: 4.0, rb: 3.8 },
    { tipo: 'poligono', pts: [noOsso(ombro, cot, 0.1, -4.0), noOsso(ombro, cot, 0.1, 4.0), noOsso(ombro, cot, 0.4, 3.9), noOsso(ombro, cot, 0.4, -3.9)] },
  ], azul);
  // munhequeira
  p.peca([{ tipo: 'capsula', a: noOsso(cot, mao, 0.58), b: noOsso(cot, mao, 0.92), ra: 3.1, rb: 3.0 }], azul);
  if ((frente ? e.pose.maoF : e.pose.maoT) === 'aberta') maoAberta(p, cot, mao, pele);
  else punho(p, cot, mao, pele);
}

function perna(p: Pintor, e: Esqueleto, frente: boolean) {
  const quadril = frente ? e.quadrilF : e.quadrilT;
  const joelho = frente ? e.joelhoF : e.joelhoT;
  const tornozelo = frente ? e.tornozeloF : e.tornozeloT;
  const laranja = frente ? C.laranja : C.laranjaAtras;
  const azul = frente ? C.azul : C.azulAtras;
  // calça larga: estufa na coxa e na canela e entra apertada na bota
  p.peca([
    { tipo: 'capsula', a: quadril, b: joelho, ra: 5.6, rb: 4.8 },
    { tipo: 'capsula', a: joelho, b: noOsso(joelho, tornozelo, 0.42), ra: 4.8, rb: 4.7 },
    { tipo: 'capsula', a: noOsso(joelho, tornozelo, 0.42), b: noOsso(joelho, tornozelo, 0.56), ra: 4.7, rb: 3.0 },
  ], laranja);
  // Vincos: o pano dobra atrás do joelho (do lado para onde a canela vira) e puxa da virilha para
  // a coxa. Sem eles a calça era um balão liso, e perna dobrada não parecia dobrada.
  const vinco = misturar(laranja.sombra, C.contorno, 0.35);
  const sen = dobra(quadril, joelho, tornozelo);
  if (Math.abs(sen) > 0.25) {
    const s = Math.sign(sen);
    risco(p, noOsso(quadril, joelho, 0.7, s * 4.2), noOsso(quadril, joelho, 0.92, s * 1.6), vinco);
    risco(p, noOsso(joelho, tornozelo, 0.24, s * 3.9), noOsso(joelho, tornozelo, 0.08, s * 1.6), vinco);
  }
  const frenteDaCoxa = -(joelho[1] - quadril[1]) * e.u[0] + (joelho[0] - quadril[0]) * e.u[1] >= 0 ? 1 : -1;
  risco(p, noOsso(quadril, joelho, 0.1, frenteDaCoxa * 3.6), noOsso(quadril, joelho, 0.36, frenteDaCoxa * 1.4), vinco);
  // Bota por cima da barra da calça: cano, a boca do cano em couro claro e a sola. O pé segue o
  // referencial de `formaDoPe` (x para a ponta, y para cima), só que em unidades do começo ao fim.
  const k = escalaAgora();
  const a = ((frente ? e.pose.peF : e.pose.peT) ?? 0) * RAD;
  const cs = Math.cos(a), sn = Math.sin(a);
  const pe = (x: number, y: number): P => [tornozelo[0] + (cs * x - sn * y) * k, tornozelo[1] + (-sn * x - cs * y) * k];
  p.peca([
    { tipo: 'poligono', pts: [noOsso(joelho, tornozelo, 0.55, -3.3), noOsso(joelho, tornozelo, 0.55, 3.3), noOsso(joelho, tornozelo, 0.92, 3.0), noOsso(joelho, tornozelo, 0.92, -3.0)] },
    { tipo: 'poligono', pts: [pe(-2.5, -0.8), pe(-3.0, 1.6), pe(-2.4, 3.8), pe(1.6, 3.6), pe(4.8, 2.4), pe(6.6, 1.5), pe(7.1, 0.1), pe(6.4, -0.9)] },
  ], azul);
  p.peca([{ tipo: 'poligono', pts: [noOsso(joelho, tornozelo, 0.49, -3.8), noOsso(joelho, tornozelo, 0.49, 3.8), noOsso(joelho, tornozelo, 0.6, 3.6), noOsso(joelho, tornozelo, 0.6, -3.6)] }], frente ? C.aro : C.aroAtras);
  p.peca([{ tipo: 'poligono', pts: [pe(-2.6, -0.9), pe(-2.8, 0.4), pe(7.0, 0.4), pe(6.5, -0.9)] }], C.sola);
}

function tronco(p: Pintor, e: Esqueleto) {
  const t = (f: number, h: number) => noTronco(e, f, h);
  // quimono
  p.peca([{ tipo: 'poligono', pts: [t(-8.5, 15.5), t(-5.5, 19.5), t(4.5, 20), t(9.8, 17), t(10, 11.5), t(7.2, 4.5), t(-6, 2.5), t(-8.4, 8.5)] }], C.laranja);
  // o decote em V mostra a camiseta azul
  p.peca([{ tipo: 'poligono', pts: [t(0, 20), t(6.4, 19.6), t(4.2, 11.8)] }], { ...C.azul, faixa: 0 });
  // A gola cruzada descendo do decote até a faixa, e o pano franzido em cima dela: sem as dobras
  // o peito era uma placa laranja lisa.
  const vinco = misturar(C.laranja.sombra, C.contorno, 0.35);
  risco(p, t(4.0, 11.6), t(2.4, 7.2), vinco);
  risco(p, t(-4.6, 7.4), t(-3.8, 10.4), vinco);
  risco(p, t(-0.6, 7.2), t(-0.2, 9.4), vinco);
  // faixa na cintura
  p.peca([{ tipo: 'poligono', pts: [t(-6.6, 6.2), t(7.6, 7), t(7.6, 2.8), t(-6.4, 1.8)] }], C.azul);
  // O emblema vai nas costas, como no quimono do original. No peito ele ficava debaixo da manga do
  // braço da frente em todas as poses da luta — medido: nenhum pixel dele aparecia.
  const grande = escalaAgora() > 1.25;
  carimbo(p, t(-5.3, 12.6), e.pose.tronco, grande ? EMBLEMA : EMBLEMA_PEQUENO, { W: C.branco, K: C.contorno });
}

/** O nó da faixa e as duas pontas caindo, abrindo um pouco no fim. */
function noDaFaixa(p: Pintor, e: Esqueleto) {
  const t = (f: number, h: number) => noTronco(e, f, h);
  p.peca([
    { tipo: 'capsula', a: t(6.8, 3.4), b: t(8.4, -2.4), ra: 1.1, rb: 1.4 },
    { tipo: 'capsula', a: t(5.6, 3.2), b: t(5.1, -1.6), ra: 1.0, rb: 1.3 },
  ], C.azul);
  // o nó por cima, com o próprio contorno: é o risco em volta que o faz ler como nó
  p.peca([{ tipo: 'elipse', c: t(6.4, 4.5), rx: 1.9, ry: 1.6, ang: e.pose.tronco }], C.azul);
}

/** Mecha: base, ponta, largura na base, quanto o meio curva e se fica atrás (0) ou na frente (1). */
type Mecha = [P, P, number, number, 0 | 1];

// O crânio coberto, com a costeleta descendo na frente da orelha. A linha do cabelo na testa fica
// acima da sobrancelha: cobrindo-a, a sobrancelha preta sumia no preto do cabelo.
const CAPACETE: P[] = [
  [-0.4, -2.2], [-0.2, 3.6], [3.0, 6.2], [5.9, 5.8], [6.2, 7], [3, 11], [-3, 11.5], [-8, 8], [-8.6, 2],
  [-7.4, -3], [-4.4, -4], [-4.2, 0.4], [-1.0, 1.6], [-0.9, 0.4],
];

// Cabelo espetado: poucas mechas grandes em cima de uma base que cobre o crânio. Era um polígono
// só com onze pontas finas do mesmo tamanho em volta da cabeça, e isso lia como um estouro — o
// arquétipo tem as mechas grandes no alto, as de trás abrindo em leque, uma na nuca e a franja
// sobre a testa. As da frente pendem PARA BAIXO: apontando para fora como as outras, o cabelo
// virava uma estrela com a cabeça no meio.
const MECHAS: Mecha[] = [
  [[-5.6, -2.4], [-9.0, -7.6], 4.2, 0.4, 0],
  [[-7.2, 1.8], [-15.6, -1.0], 7.5, 0.9, 0],
  [[-6.2, 7.6], [-15.2, 12.6], 7.5, 0.6, 0],
  [[-2.8, 10.6], [-8.4, 18.4], 7.5, 0.8, 0],
  [[1.6, 10.8], [3.6, 19.0], 7.2, -0.8, 1],
  [[4.6, 9.0], [10.8, 6.0], 5.8, 1.0, 1],
  [[4.8, 6.8], [9.4, 2.4], 4.4, 0.8, 1],
];

// No Super as mechas se levantam: as de trás apontam para o alto em vez de caírem, o alto sobe
// quase metade de novo, e sobra uma franja solta na testa, que é a marca da transformação.
const MECHAS_SUPER: Mecha[] = [
  [[-5.8, -2.0], [-10.2, -5.2], 4.4, 0.3, 0],
  [[-7.4, 2.6], [-16.4, 8.8], 7.2, 0.6, 0],
  [[-6.2, 7.8], [-16.4, 17.0], 8.0, 0.4, 0],
  [[-3.0, 10.4], [-9.6, 22.6], 8.0, 0.6, 0],
  [[0.8, 10.8], [1.4, 23.8], 8.2, -0.6, 1],
  [[4.2, 9.2], [11.6, 16.4], 6.6, 0.4, 1],
  [[5.0, 7.0], [12.4, 11.6], 5.0, 0.6, 1],
  [[4.8, 6.6], [7.4, 1.2], 3.4, -0.5, 1],
];

function cabelo(p: Pintor, e: Esqueleto, cab: (f: number, a: number) => P) {
  const sup = e.pose.forma === 1;
  // Caído, as mechas de trás apontam para o chão: amassam na linha dele em vez de atravessá-lo.
  const chao = medidasDoSprite(escalaAgora()).ancoraY - 1;
  const h = (f: number, a: number): P => {
    const q = cab(f, a);
    return [q[0], Math.min(q[1], chao)];
  };
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
    // o fio claro no meio das mechas compridas é o que separa uma da outra dentro do preto
    if (d > 6) {
      const lado = n[0] * luz[0] + n[1] * luz[1] >= 0 ? 0.38 : -0.38;
      fios[camada].push([0.16, 0.28, 0.4, 0.52, 0.64].map((s) => h(...em(s, lado))));
    }
  }
  // A camada de trás primeiro, com os fios dela: a da frente cobre os dois, e o contorno de dentro
  // dela risca a divisa entre as mechas — no dourado, é esse risco âmbar que separa uma da outra.
  for (const i of [0, 1]) {
    p.peca(camadas[i], sup ? C.ouro : C.cabelo);
    for (const f of fios[i]) for (let j = 1; j < f.length; j++) risco(p, f[j - 1], f[j], sup ? C.fioOuro : C.fioPreto);
  }
}

function cabeca(p: Pintor, e: Esqueleto) {
  const h = (f: number, a: number) => naCabeca(e, f, a);
  const ang = e.angCabeca;
  const sup = e.pose.forma === 1;
  const grande = escalaAgora() > 1.25;
  // rosto: o oval e, por baixo dele, o queixo que avança, a quina da mandíbula e o nariz
  p.peca([
    { tipo: 'elipse', c: h(0, 0.4), rx: 5.5, ry: 6, ang },
    { tipo: 'poligono', pts: [h(-3.9, -1.2), h(5.0, -0.6), h(5.5, -1.0), h(7.3, -2.9), h(5.6, -3.5), h(5.3, -5.4), h(4.6, -6.8), h(2.6, -7.4), h(-0.8, -6.4), h(-3.3, -4.2)] },
  ], C.pele);
  // orelha, com a concha em sombra
  p.peca([{ tipo: 'elipse', c: h(-2.7, -0.9), rx: 1.6, ry: 2.2, ang }], { ...C.pele, faixa: 1 });
  if (grande) carimbo(p, h(-2.5, -0.9), ang, ORELHA, { s: C.pele.sombra });
  cabelo(p, e, h);
  const olhos = e.pose.olhos ?? 'abertos';
  const iris = sup ? C.verde : C.olho;
  if (grande) {
    const tintas = {
      K: C.olho, W: C.branco, H: C.branco, I: iris, J: sup ? C.verdeFundo : C.olho, s: C.pele.sombra,
      B: C.boca, R: C.lingua, G: C.sobrancelhaOuro, A: C.ambar,
    };
    carimbo(p, h(2.6, 0.1), ang, olhos === 'abertos' ? OLHO : olhos === 'fechados' ? OLHO_FECHADO : OLHO_NOCAUTE, tintas);
    carimbo(p, h(2.9, sup ? 3.2 : 2.9), ang, sup ? SOBRANCELHA_SUPER : SOBRANCELHA, tintas);
    carimbo(p, h(4.0, -4.3), ang, e.pose.grito ? BOCA_GRITO : BOCA, tintas);
    return;
  }
  // no retrato do placar a cabeça tem 12 pixels, e o rosto é o de um pixel por traço
  const o = h(2.7, 0.4);
  if (olhos === 'abertos') {
    pixel(p.q, o[0], o[1], iris); pixel(p.q, o[0], o[1] + 1, iris);
    pixel(p.q, o[0] - 1, o[1], C.branco); pixel(p.q, o[0] - 1, o[1] + 1, C.branco);
  } else if (olhos === 'fechados') {
    linha(p.q, o[0] - 1, o[1] + 1, o[0] + 1, o[1] + 1, C.olho);
  } else {
    pixel(p.q, o[0] - 1, o[1], C.olho); pixel(p.q, o[0] + 1, o[1] + 2, C.olho);
    pixel(p.q, o[0], o[1] + 1, C.olho); pixel(p.q, o[0] + 1, o[1], C.olho); pixel(p.q, o[0] - 1, o[1] + 2, C.olho);
  }
  risco(p, h(1.2, 2.3), h(4.6, 1.5), sup ? C.ambar : C.olho);
  const b = h(3.6, -4.2);
  if (e.pose.grito) {
    pixel(p.q, b[0], b[1], C.olho); pixel(p.q, b[0] + 1, b[1], C.olho); pixel(p.q, b[0], b[1] + 1, C.olho); pixel(p.q, b[0] + 1, b[1] + 1, C.boca);
  } else {
    pixel(p.q, b[0], b[1], C.boca); pixel(p.q, b[0] + 1, b[1], C.boca);
  }
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
    if (!coxaBaixa) noDaFaixa(p, e);
    perna(p, e, true);
    if (coxaBaixa) noDaFaixa(p, e);
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
  parado: {
    quadril: [-1, -23], tronco: 10, cabeca: -6,
    pernaF: { alvo: [11, -3] }, pernaT: { alvo: [-10, -3] },
    bracoF: { alvo: [16, -40] }, bracoT: { alvo: [7, -44] },
  },
  especial: {
    quadril: [-2, -21], tronco: -8, cabeca: 4,
    pernaF: { alvo: [13, -3] }, pernaT: { alvo: [-13, -3] },
    bracoF: { alvo: [-11, -28] }, bracoT: { alvo: [-13, -27] },
    maoF: 'aberta', maoT: 'aberta', grito: true,
  },
  // o punho sobe À FRENTE do rosto e não sobre ele: reto para cima, o antebraço tapava a cara
  vitoria: {
    quadril: [0, -25], tronco: -4, cabeca: -8,
    pernaF: { alvo: [8, -3] }, pernaT: { alvo: [-6, -3] },
    bracoF: { alvo: [19, -58] }, bracoT: { ang: [-35, 110] },
  },
};

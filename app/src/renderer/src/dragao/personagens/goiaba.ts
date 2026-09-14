/**
 * Goiaba — o herói de quimono laranja e cabelo espetado. Equilibrado: nem o mais rápido nem o
 * mais forte, e é o que tem a rajada grande, a Onda Goiabada.
 */
import { cor } from '../quadro.ts';
import {
  type Corpo, type Esqueleto, type Personagem, type Pintor, type Pose, formaDoPe, naCabeca, noOsso, noTronco, tinta,
} from '../boneco.ts';
import type { Forma, P } from '../raster.ts';
import { pixel, linha } from '../quadro.ts';

const C = {
  contorno: cor('#1b1022'),
  pele: tinta(cor('#f4c39a'), cor('#d58f66'), cor('#1b1022'), cor('#ffe2c2'), 2),
  peleAtras: tinta(cor('#d58f66'), cor('#b06a48'), cor('#1b1022'), undefined, 2),
  laranja: tinta(cor('#f27a1a'), cor('#be4f10'), cor('#1b1022'), cor('#ffac4a'), 2),
  laranjaAtras: tinta(cor('#be4f10'), cor('#8e3708'), cor('#1b1022'), undefined, 2),
  azul: tinta(cor('#2b50b8'), cor('#1a2f78'), cor('#1b1022'), cor('#4f7ee4'), 1),
  azulAtras: tinta(cor('#1a2f78'), cor('#111e52'), cor('#1b1022'), undefined, 1),
  cabelo: tinta(cor('#1d1b2c'), cor('#0d0c16'), cor('#0a0810'), cor('#3c3a58'), 2),
  olho: cor('#1b1022'),
  branco: cor('#ffffff'),
  boca: cor('#9a4a3a'),
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

function braco(p: Pintor, e: Esqueleto, frente: boolean) {
  const ombro = frente ? e.ombroF : e.ombroT;
  const cot = frente ? e.cotoveloF : e.cotoveloT;
  const mao = frente ? e.maoF : e.maoT;
  const pele = frente ? C.pele : C.peleAtras;
  const azul = frente ? C.azul : C.azulAtras;
  p.peca([
    { tipo: 'capsula', a: ombro, b: noOsso(ombro, cot, 0.55), ra: 3.9, rb: 3.6 },
    { tipo: 'capsula', a: noOsso(ombro, cot, 0.55), b: cot, ra: 3.6, rb: 2.8 },
    { tipo: 'capsula', a: cot, b: noOsso(cot, mao, 0.35), ra: 2.9, rb: 3.2 },
    { tipo: 'capsula', a: noOsso(cot, mao, 0.35), b: mao, ra: 3.2, rb: 2.4 },
  ], pele);
  // Manga curta da camiseta azul: um tubo da grossura do braço, do ombro até um terço dele, com a
  // barra reta. Era uma bola centrada NO ombro e mais larga que ele, e lia como ombreira.
  p.peca([
    { tipo: 'capsula', a: noOsso(ombro, cot, 0.02), b: noOsso(ombro, cot, 0.3), ra: 4.0, rb: 3.8 },
    { tipo: 'poligono', pts: [noOsso(ombro, cot, 0.1, -3.9), noOsso(ombro, cot, 0.1, 3.9), noOsso(ombro, cot, 0.4, 3.8), noOsso(ombro, cot, 0.4, -3.8)] },
  ], azul);
  // munhequeira
  p.peca([{ tipo: 'capsula', a: noOsso(cot, mao, 0.55), b: noOsso(cot, mao, 0.9), ra: 3.1, rb: 3 }], azul);
  const aberta = (frente ? e.pose.maoF : e.pose.maoT) === 'aberta';
  p.peca([aberta
    ? { tipo: 'elipse', c: noOsso(cot, mao, 1.12), rx: 3.2, ry: 2.2, ang: 90 - Math.atan2(mao[0] - cot[0], mao[1] - cot[1]) * 180 / Math.PI }
    : { tipo: 'elipse', c: noOsso(cot, mao, 1.12), rx: 3.1, ry: 3.1 }], pele);
}

function perna(p: Pintor, e: Esqueleto, frente: boolean) {
  const quadril = frente ? e.quadrilF : e.quadrilT;
  const joelho = frente ? e.joelhoF : e.joelhoT;
  const tornozelo = frente ? e.tornozeloF : e.tornozeloT;
  const laranja = frente ? C.laranja : C.laranjaAtras;
  const azul = frente ? C.azul : C.azulAtras;
  // bota: cano e pé
  p.peca([
    { tipo: 'capsula', a: noOsso(joelho, tornozelo, 0.55), b: tornozelo, ra: 3.3, rb: 3.1 },
    formaDoPe(tornozelo, 6.5, 3.2, frente ? e.pose.peF : e.pose.peT),
  ], azul);
  // calça larga, presa na bota
  p.peca([
    { tipo: 'capsula', a: quadril, b: joelho, ra: 5.6, rb: 4.8 },
    { tipo: 'capsula', a: joelho, b: noOsso(joelho, tornozelo, 0.62), ra: 4.8, rb: 3.8 },
  ], laranja);
}

function tronco(p: Pintor, e: Esqueleto) {
  const t = (f: number, h: number) => noTronco(e, f, h);
  // quimono
  p.peca([{ tipo: 'poligono', pts: [t(-8.5, 15.5), t(-5.5, 19.5), t(4.5, 20), t(9.8, 17), t(10, 11.5), t(7.2, 4.5), t(-6, 2.5), t(-8.4, 8.5)] }], C.laranja);
  // o decote em V mostra a camiseta azul
  p.peca([{ tipo: 'poligono', pts: [t(0, 20), t(6.4, 19.6), t(4.2, 11.8)] }], { ...C.azul, faixa: 0 });
  // faixa na cintura, com o nó caindo na frente
  p.peca([{ tipo: 'poligono', pts: [t(-6.6, 6.2), t(7.6, 7), t(7.6, 2.8), t(-6.4, 1.8)] }], C.azul);
  p.peca([
    { tipo: 'capsula', a: t(5.5, 3), b: t(7.5, -3.5), ra: 1.3, rb: 1.1 },
    { tipo: 'capsula', a: t(4.5, 3), b: t(4.8, -3), ra: 1.2, rb: 1 },
  ], C.azul);
  // o símbolo no peito: um quadrado, claro
  const s = t(4.2, 15.5);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    if (dx === 0 && dy === 0) continue;
    pixel(p.q, s[0] + dx, s[1] + dy, C.branco);
  }
}

function cabeca(p: Pintor, e: Esqueleto) {
  const h = (f: number, a: number) => naCabeca(e, f, a);
  // rosto e queixo
  p.peca([
    { tipo: 'elipse', c: h(0, 0.3), rx: 5.6, ry: 6.1, ang: e.angCabeca },
    { tipo: 'poligono', pts: [h(-3.5, -2), h(4.2, -1.5), h(5, -4.6), h(2.6, -7), h(-1.5, -6.2)] },
  ], C.pele);
  // orelha
  p.peca([{ tipo: 'elipse', c: h(-2.6, -0.8), rx: 1.5, ry: 2.1, ang: e.angCabeca }], { ...C.pele, faixa: 1 });
  // Cabelo espetado: poucas mechas grandes em cima de uma base que cobre o crânio. Era um polígono
  // só com onze pontas finas do mesmo tamanho em volta da cabeça, e isso lia como um estouro —
  // o arquétipo tem duas mechas grandes no alto, duas para trás, uma na nuca e a franja caindo
  // sobre a testa. As da frente pendem PARA BAIXO: apontando para fora como as outras, o cabelo
  // virava uma estrela com a cabeça no meio.
  const capacete: P[] = [
    [0.2, -2.4], [1.4, 2.2], [3.2, 3.4], [5.8, 4.2], [6.2, 7], [3, 11], [-3, 11.5], [-8, 8], [-8.6, 2],
    [-7.4, -3], [-4.4, -4], [-4.2, 0.4], [-1.2, 2.0], [-0.6, 1.0],
  ];
  // base, ponta, largura na base e quanto o meio entorta para o lado; da franja à nuca
  const mechas: [P, P, number, number][] = [
    [[3.6, 5.4], [8.4, 2.2], 4.5, 0],
    [[4.6, 9.0], [10.4, 5.0], 5.5, 0.6],
    [[2.0, 10.8], [4.4, 18.8], 7, 0],
    [[-2.6, 11.0], [-7.2, 18.6], 7.5, 0],
    [[-6.0, 8.4], [-14.6, 13.0], 7.5, 0],
    [[-7.4, 1.6], [-15.4, -0.8], 8, 0],
    [[-5.8, -2.8], [-8.6, -7.4], 4, 0],
  ];
  const formas: Forma[] = [{ tipo: 'poligono', pts: capacete.map(([f, a]) => h(f, a)) }];
  const fios: [P, P][] = [];
  for (const [b, t, w, entorta] of mechas) {
    const d = Math.hypot(t[0] - b[0], t[1] - b[1]);
    const n: P = [-(t[1] - b[1]) / d, (t[0] - b[0]) / d];
    const em = (k: number, l: number): P => [b[0] + (t[0] - b[0]) * k + n[0] * l, b[1] + (t[1] - b[1]) * k + n[1] * l];
    // os lados abaulam para fora e a ponta tem um pixel de largura: afiada, ela vira um fio solto
    const pts = [em(0, -w / 2), em(0.5, -w * 0.36 + entorta), em(1, -0.5 + entorta), em(1, 0.5 + entorta), em(0.5, w * 0.36 + entorta), em(0, w / 2)];
    formas.push({ tipo: 'poligono', pts: pts.map(([f, a]) => h(f, a)) });
    // o risco claro no meio das mechas compridas é o que separa uma da outra dentro do preto
    if (d > 9) fios.push([em(0.3, 0.8), em(0.6, 0.8 + entorta * 0.5)]);
  }
  p.peca(formas, C.cabelo);
  for (const [a, b] of fios) {
    const pa = h(...a), pb = h(...b);
    linha(p.q, pa[0], pa[1], pb[0], pb[1], C.cabelo.luz ?? C.cabelo.base);
  }
  // olho, sobrancelha e boca
  const olhos = e.pose.olhos ?? 'abertos';
  const o = h(2.7, 0.4);
  if (olhos === 'abertos') {
    pixel(p.q, o[0], o[1], C.olho); pixel(p.q, o[0], o[1] + 1, C.olho);
    pixel(p.q, o[0] - 1, o[1], C.branco); pixel(p.q, o[0] - 1, o[1] + 1, C.branco);
  } else if (olhos === 'fechados') {
    linha(p.q, o[0] - 1, o[1] + 1, o[0] + 1, o[1] + 1, C.olho);
  } else {
    pixel(p.q, o[0] - 1, o[1], C.olho); pixel(p.q, o[0] + 1, o[1] + 2, C.olho);
    pixel(p.q, o[0], o[1] + 1, C.olho); pixel(p.q, o[0] + 1, o[1], C.olho); pixel(p.q, o[0] - 1, o[1] + 2, C.olho);
  }
  const s1 = h(1.2, 2.3), s2 = h(4.6, 1.5);
  linha(p.q, s1[0], s1[1], s2[0], s2[1], C.olho);
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
    perna(p, e, true);
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

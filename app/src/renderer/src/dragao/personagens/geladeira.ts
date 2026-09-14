/**
 * Geladeira — o tirano do espaço, branco e roxo, que sorri de canto enquanto manda congelar o
 * planeta dos outros. Esguia e um pouco mais baixa que o Goiaba; quem marca a silhueta é o RABO,
 * grosso na base e fino na ponta, fazendo curva atrás do corpo. O especial é o Raio Congelante,
 * um risco fino que sai da ponta do dedo.
 *
 * Não há roupa: o corpo é uma bio-armadura branca e lisa, e as placas roxas (domo da cabeça,
 * ombros, antebraços e canelas) são peças à parte, com contorno próprio — é o risco escuro que
 * faz a placa parecer encaixada no corpo e não pintada nele.
 */
import { cor, linha, pixel } from '../quadro.ts';
import {
  type Corpo, type Esqueleto, type Personagem, type Pintor, type Pose, dir, formaDoPe, naCabeca, noOsso, noTronco,
  soma, tinta,
} from '../boneco.ts';
import type { Forma, P } from '../raster.ts';

const C = {
  contorno: cor('#1b1022'),
  branco: tinta(cor('#eeeaf4'), cor('#b4a9c8'), cor('#1b1022'), cor('#ffffff'), 2),
  brancoAtras: tinta(cor('#b4a9c8'), cor('#8a7ea3'), cor('#1b1022'), undefined, 2),
  roxo: tinta(cor('#9038cc'), cor('#5c1c8e'), cor('#1b1022'), cor('#cf86f6'), 2),
  roxoAtras: tinta(cor('#5c1c8e'), cor('#3e1164'), cor('#1b1022'), undefined, 2),
  /** O reflexo de um pixel que faz a placa parecer vidrada. */
  reflexo: cor('#f4dcff'),
  olho: cor('#1b1022'),
  vermelho: cor('#e0263e'),
  marca: cor('#7a2cb0'),
  boca: cor('#3a1a52'),
};

export const corpoDaGeladeira: Corpo = {
  tronco: 17,
  pescoco: 8.5,
  bracoSup: 10,
  antebraco: 10,
  coxa: 14,
  canela: 14,
  ombroF: [4, 15.5],
  ombroT: [-4.5, 16],
  quadrilF: [2.5, 1],
  quadrilT: [-2.5, 1],
};

/**
 * O boneco só conhece mão fechada e aberta; o Raio Congelante sai do INDICADOR, e é isso que
 * diferencia o gesto da rajada de mão aberta dos outros. `apontar` viaja junto da pose (o
 * `sprite` repassa o que vier nela) e vale para a mão da frente.
 */
export type PoseDaGeladeira = Pose & { apontar?: boolean };

const unit = (a: P, b: P): P => {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
};
/** O ângulo de tela (graus, 0 para a direita) de `a` para `b`: é o que a elipse do raster entende. */
const grausDe = (a: P, b: P) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
const girar = ([x, y]: P, grau: number): P => {
  const r = (grau * Math.PI) / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
};

/** Um pixel de reflexo, só se cair dentro da peça que acabou de ser pintada (a máscara ainda é dela). */
function reflexo(p: Pintor, pt: P) {
  const x = Math.floor(pt[0]), y = Math.floor(pt[1]);
  if (p.m.tem(x, y)) pixel(p.q, x, y, C.reflexo);
}

function rabo(p: Pintor, e: Esqueleto) {
  const vento = e.pose.vento ?? 0;
  const N = 10;
  let ponto = noTronco(e, -3.5, 3.5);
  // Nasce para trás e para baixo e vai enrolando para cima: o gancho é o que se lê a 1x. O
  // tronco inclina a raiz só pela metade, senão o rabo apontaria para o céu num soco inclinado.
  // O `vento` entorta mais perto da ponta do que na raiz, como chicote: positivo levanta a raiz e
  // enrola a ponta por cima (escorpião), negativo solta o rabo para trás.
  let ang = -48 + e.pose.tronco * 0.5 - vento * 6;
  const formas: Forma[] = [];
  const raio = (t: number) => 0.9 + 3.6 * Math.pow(1 - t, 1.1);
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    ang += -13 - vento * 8 * t0;
    const prox = soma(ponto, dir(ang), 4.4 - t0 * 1.4);
    formas.push({ tipo: 'capsula', a: ponto, b: prox, ra: raio(t0), rb: raio(t1) });
    ponto = prox;
  }
  p.peca(formas, C.branco);
}

function mao(p: Pintor, cot: P, pulso: P, aberta: boolean, apontar: boolean, branco: typeof C.branco) {
  const d = unit(cot, pulso);
  const centro = soma(pulso, d, 1.2);
  const formas: Forma[] = [];
  if (aberta) {
    // três dedos em leque: palma curta e dedos compridos, que é o que faz a mão parecer de garra
    formas.push({ tipo: 'elipse', c: centro, rx: 2.4, ry: 2.2 });
    for (const g of [-32, 0, 32]) {
      const base = soma(centro, d, 1);
      formas.push({ tipo: 'capsula', a: base, b: soma(base, girar(d, g), 3.4), ra: 0.9, rb: 0.7 });
    }
  } else {
    formas.push({ tipo: 'elipse', c: centro, rx: apontar ? 2.3 : 2.6, ry: apontar ? 2.3 : 2.6 });
  }
  p.peca(formas, branco);
  if (apontar) {
    // O indicador vai numa peça à parte e fino (um pixel e o contorno): na mesma peça do punho, ele
    // virava um cone e ninguém lia dedo nenhum.
    const base = soma(centro, d, 1.6);
    p.peca([{ tipo: 'capsula', a: base, b: soma(base, d, 4.6), ra: 0.6, rb: 0.5 }], branco);
  }
}

function braco(p: Pintor, e: Esqueleto, frente: boolean) {
  const ombro = frente ? e.ombroF : e.ombroT;
  const cot = frente ? e.cotoveloF : e.cotoveloT;
  const pulso = frente ? e.maoF : e.maoT;
  const branco = frente ? C.branco : C.brancoAtras;
  const roxo = frente ? C.roxo : C.roxoAtras;
  p.peca([
    { tipo: 'capsula', a: ombro, b: noOsso(ombro, cot, 0.55), ra: 3.4, rb: 2.9 },
    { tipo: 'capsula', a: noOsso(ombro, cot, 0.55), b: cot, ra: 2.9, rb: 2.3 },
    { tipo: 'capsula', a: cot, b: noOsso(cot, pulso, 0.4), ra: 2.4, rb: 2.8 },
    { tipo: 'capsula', a: noOsso(cot, pulso, 0.4), b: pulso, ra: 2.8, rb: 2 },
  ], branco);
  // placa do antebraço: uma oval por cima do osso, mais curta que ele — tubo inteiro viraria luva
  const placa = noOsso(cot, pulso, 0.42, -0.5);
  p.peca([{ tipo: 'elipse', c: placa, rx: 3.4, ry: 2.1, ang: grausDe(cot, pulso) }], roxo);
  if (frente) reflexo(p, noOsso(cot, pulso, 0.32, -1.2));
  const pose = e.pose as PoseDaGeladeira;
  const aberta = (frente ? pose.maoF : pose.maoT) === 'aberta';
  mao(p, cot, pulso, aberta, frente && !!pose.apontar, branco);
  // ombreira: um domo em cima do ombro
  p.peca([{ tipo: 'elipse', c: noOsso(ombro, cot, 0.05), rx: 3.7, ry: 3.5 }], roxo);
  if (frente) reflexo(p, soma(noOsso(ombro, cot, 0.05), [0.8, -2]));
}

function perna(p: Pintor, e: Esqueleto, frente: boolean) {
  const quadril = frente ? e.quadrilF : e.quadrilT;
  const joelho = frente ? e.joelhoF : e.joelhoT;
  const tornozelo = frente ? e.tornozeloF : e.tornozeloT;
  const branco = frente ? C.branco : C.brancoAtras;
  const roxo = frente ? C.roxo : C.roxoAtras;
  const angPe = (frente ? e.pose.peF : e.pose.peT) ?? 0;
  // o mesmo referencial do `formaDoPe`: x para a ponta, y para baixo até a sola
  const a = (angPe * Math.PI) / 180;
  const f: P = [Math.cos(a), -Math.sin(a)];
  const up: P = [Math.sin(a), Math.cos(a)];
  const naSola = (x: number, y: number): P => [tornozelo[0] + f[0] * x - up[0] * y, tornozelo[1] + f[1] * x - up[1] * y];
  // A perna e o pé numa peça só, sem risco no tornozelo, como pele contínua. Os três dedos vão
  // nela também, com as pontas em alturas e comprimentos diferentes: a frente do pé vira uma
  // garra em degraus. Dedo com contorno próprio foi tentado e, com um pé de
  // três pixels de altura, os riscos entre eles faziam um borrão escuro no lugar do pé.
  const dedo = (y: number, ponta: number): Forma =>
    ({ tipo: 'capsula', a: naSola(1, y), b: naSola(ponta, y + 0.3), ra: 1.1, rb: 0.6 });
  p.peca([
    { tipo: 'capsula', a: quadril, b: joelho, ra: 4.5, rb: 3.1 },
    { tipo: 'capsula', a: joelho, b: noOsso(joelho, tornozelo, 0.4), ra: 3.1, rb: 3.1 },
    { tipo: 'capsula', a: noOsso(joelho, tornozelo, 0.4), b: tornozelo, ra: 3.1, rb: 1.9 },
    formaDoPe(tornozelo, 3.5, 2.8, angPe),
    dedo(0.2, 5.4), dedo(1.2, 7.2), dedo(2.1, 6.2),
  ], branco);
  // o vão entre os dedos, só na ponta e na cor da sombra: risco escuro ali pesaria o pé inteiro
  const v1 = naSola(4.6, 0.9), v2 = naSola(5.6, 0.9);
  linha(p.q, v1[0], v1[1], v2[0], v2[1], branco.sombra);
  const v3 = naSola(5.2, 1.9), v4 = naSola(6, 1.9);
  linha(p.q, v3[0], v3[1], v4[0], v4[1], branco.sombra);
  // placa da canela: oval na frente da canela, e o tornozelo continua branco — senão vira bota
  p.peca([{ tipo: 'elipse', c: noOsso(joelho, tornozelo, 0.5, -0.7), rx: 4.6, ry: 2.3, ang: grausDe(joelho, tornozelo) }], roxo);
  if (frente) reflexo(p, noOsso(joelho, tornozelo, 0.38, -1.4));
}

function tronco(p: Pintor, e: Esqueleto) {
  const t = (f: number, h: number) => noTronco(e, f, h);
  // pescoço fino, que a cabeça tapa quase inteiro
  p.peca([{ tipo: 'capsula', a: t(0.5, 15), b: noOsso(e.pescoco, e.cabeca, 0.6), ra: 2.4, rb: 2.2 }], C.branco);
  // peito largo em cima, cintura fina: o V do tirano
  p.peca([{
    tipo: 'poligono',
    pts: [t(-7, 15.5), t(-5, 19), t(3.5, 19.5), t(8.2, 16.5), t(8.2, 11.5), t(5, 7), t(5.8, 2.5), t(3.4, -1.5), t(-4.6, -1.5), t(-6.4, 2.5), t(-5, 7.5), t(-7.2, 11.5)],
  }], C.branco);
  // O risco embaixo do peitoral e o do meio da barriga, na cor da sombra e não do contorno: a
  // bio-armadura é lisa, e risco escuro ali viraria costura de roupa. O do peito fica abaixo da
  // ombreira da frente, que tapa tudo o que estiver acima da altura 12.
  const s = C.branco.sombra;
  const traco = (pts: P[]) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = t(...pts[i]), b = t(...pts[i + 1]);
      linha(p.q, a[0], a[1], b[0], b[1], s);
    }
  };
  traco([[-1.5, 11.2], [2, 10], [5.8, 10.4]]);
  traco([[2.6, 8.2], [3, 4.6]]);
}

function cabeca(p: Pintor, e: Esqueleto) {
  const h = (f: number, a: number) => naCabeca(e, f, a);
  // O crânio é redondo e maior que o rosto de antes: a cabeça pequena num pescoço fino lia como
  // um ovo num palito, e o domo não tinha onde assentar.
  const cx = -0.6, cy = 2.6, rx = 6, ry = 7.2;
  p.peca([
    { tipo: 'elipse', c: h(cx, cy), rx, ry, ang: e.angCabeca },
    { tipo: 'poligono', pts: [h(-3.4, -2), h(4, -1.4), h(4.4, -3.9), h(2.3, -6.6), h(-1.4, -5.8)] },
  ], C.branco);
  // O domo roxo segue a curva do crânio por fora e desce pela nuca, com a testa e o lado do rosto
  // brancos. Era uma elipse própria por cima da cabeça, e passando da borda dela lia como boina;
  // cobrindo tudo, como capacete. A borda de fora coincide com a do crânio (4% a mais, para o
  // contorno das duas peças cair no mesmo pixel e não dobrar de espessura).
  const noCranio = (grau: number): P => {
    const r = (grau * Math.PI) / 180;
    return [cx + Math.cos(r) * rx * 1.04, cy + Math.sin(r) * ry * 1.04];
  };
  const borda: P[] = [];
  for (let g = 48; g < 200; g += 12) borda.push(noCranio(g));
  borda.push(noCranio(200));
  // a borda de dentro, da nuca à testa, cede um pouco no meio: reta, parecia touca de natação
  const dentro: P[] = [[-4.6, 2.6], [-1.8, 4.3], [1.4, 5.7]];
  p.peca([{ tipo: 'poligono', pts: [...borda, ...dentro].map(([f, a]) => h(f, a)) }], C.roxo);
  reflexo(p, h(cx + 0.6, cy + ry - 1.6));
  reflexo(p, h(cx + 1.6, cy + ry - 2.2));
  // olho vermelho com a pálpebra caída, marca roxa embaixo e o riso de canto
  const olhos = e.pose.olhos ?? 'abertos';
  const o = h(3, -0.8);
  const x = Math.floor(o[0]), y = Math.floor(o[1]);
  if (olhos === 'abertos') {
    // A pálpebra desce em diagonal para a frente, por cima do vermelho: é o olhar de desdém. Ela
    // faz as vezes da sobrancelha — uma linha a mais ali colaria nela e viraria um borrão escuro.
    pixel(p.q, x - 2, y - 1, C.olho); pixel(p.q, x - 1, y, C.olho); pixel(p.q, x, y, C.olho);
    pixel(p.q, x - 1, y + 1, C.vermelho); pixel(p.q, x, y + 1, C.vermelho);
  } else if (olhos === 'fechados') {
    pixel(p.q, x - 2, y, C.olho); pixel(p.q, x - 1, y + 1, C.olho); pixel(p.q, x, y + 1, C.olho);
  } else {
    pixel(p.q, x - 1, y, C.olho); pixel(p.q, x + 1, y, C.olho); pixel(p.q, x, y + 1, C.olho);
    pixel(p.q, x - 1, y + 2, C.olho); pixel(p.q, x + 1, y + 2, C.olho);
  }
  // a marca roxa que desce do olho pela bochecha
  const m1 = h(1.6, -2.6), m2 = h(0.8, -3.8);
  linha(p.q, m1[0], m1[1], m2[0], m2[1], C.marca);
  const b = h(2.5, -4.5);
  const bx = Math.floor(b[0]), by = Math.floor(b[1]);
  if (e.pose.grito) {
    // aberta para CIMA: o queixo é fino, e uma boca que descesse cairia fora do rosto
    pixel(p.q, bx, by - 1, C.olho); pixel(p.q, bx + 1, by - 1, C.olho);
    pixel(p.q, bx, by, C.vermelho); pixel(p.q, bx + 1, by, C.boca);
  } else {
    // o riso de canto: a boca é reta na frente e sobe um pixel no canto de trás
    pixel(p.q, bx, by, C.boca); pixel(p.q, bx + 1, by, C.boca); pixel(p.q, bx - 1, by - 1, C.boca);
  }
}

export const geladeira: Personagem = {
  id: 'geladeira',
  nome: 'Geladeira',
  corpo: corpoDaGeladeira,
  desenhar(p, e) {
    rabo(p, e);
    braco(p, e, false);
    perna(p, e, false);
    tronco(p, e);
    perna(p, e, true);
    cabeca(p, e);
    braco(p, e, true);
  },
};

/**
 * Três poses de mostruário, com os alvos medidos para este corpo (pernas de 28, ombro a ~40 do
 * chão). A de pé é a guarda com a mão aberta, que mostra os três dedos. A do especial é o Raio
 * Congelante: braço na altura do peito de quem está na frente e o tronco jogado para trás, porque
 * quem atira com um dedo não precisa se esforçar. A da vitória levanta o indicador ao lado do
 * rosto, no riso de canto de quem já sabia o resultado.
 *
 * Nas duas últimas a mão de trás vai na cintura por ÂNGULO, e não por alvo: com alvo o cotovelo
 * dobrava para dentro do tronco e a mão na cintura não se lia; por ângulo ele sai das costas, e a
 * silhueta ganha a ponta.
 */
// em pé e de joelho quase reto: quem manda não se agacha. Com o quadril baixo e os pés abertos
// os joelhos iam para os lados, e a pose de quem despreza o adversário virava a de um sapo
const parado: PoseDaGeladeira = {
  quadril: [-1, -27.5], tronco: 3, cabeca: -3,
  pernaF: { alvo: [8, -3] }, pernaT: { alvo: [-8, -3] },
  bracoF: { alvo: [13, -40] }, bracoT: { alvo: [5, -43] },
  maoF: 'aberta', vento: 0.2,
};
const especial: PoseDaGeladeira = {
  quadril: [-4, -23], tronco: -10, cabeca: 8,
  pernaF: { alvo: [12, -3] }, pernaT: { alvo: [-14, -3] },
  bracoF: { alvo: [23, -40] }, bracoT: { ang: [-70, 135] },
  apontar: true, vento: -1,
};
const vitoria: PoseDaGeladeira = {
  quadril: [0, -26], tronco: -5, cabeca: -8,
  pernaF: { alvo: [7, -3] }, pernaT: { alvo: [-6, -3] },
  bracoF: { alvo: [12, -53] }, bracoT: { ang: [-70, 135] },
  apontar: true, vento: 0.8,
};

export const vitrine: { parado: Pose; especial: Pose; vitoria: Pose } = { parado, especial, vitoria };

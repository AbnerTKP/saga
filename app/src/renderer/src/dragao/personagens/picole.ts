/**
 * Picolé — o alienígena verde e sábio, de turbante e capa. O mais alto e o de braço mais comprido:
 * luta de longe, e o especial é o Picolé Espiral (dois dedos na testa carregando, e o braço
 * estendido na hora de soltar).
 *
 * A capa é o que dá a silhueta dele, e ela pendura pelo MUNDO, não pelo tronco: quem se inclina
 * leva o ombro junto, mas o pano continua caindo para baixo. `pose.vento` levanta a capa para
 * trás (0 parada, 1 esvoaçando na horizontal), e as dobras da barra andam com ele — animar o
 * vento já faz o pano ondular, sem um segundo número.
 *
 * Transformado (`forma: 1`) ele é o Picolé de Laranja: pele laranja, mais músculo e SEM turbante
 * nem capa. Trocar só a cor daria o mesmo boneco pintado de outro jeito; o que se reconhece de
 * longe é a silhueta — a cabeça careca com as antenas e os ombros nus.
 *
 * Medidas em UNIDADES: os ajudantes do boneco multiplicam pela escala. O que é pixel de verdade —
 * o olho, a boca, os riscos das dobras — não cresce com ela, e por isso é desenhado à parte.
 */
import { type Cor, cor, pixel } from '../quadro.ts';
import {
  type Corpo, type Esqueleto, type Personagem, type Pintor, type Pose, angulo, dir, medidasDoSprite, naCabeca, noOsso,
  noTronco, soma, tinta,
} from '../boneco.ts';
import type { Forma, P, Tinta } from '../raster.ts';

/**
 * Os dedos do especial. A mão do boneco só conhece punho e aberta, e o Picolé Espiral é o gesto
 * dele — dois dedos esticados —, então o campo vive aqui e não no esqueleto de todo mundo.
 */
export type PoseDoPicole = Pose & { dedosF?: boolean; dedosT?: boolean };

const CONTORNO = cor('#1b1022');

/** O que a transformação troca: a pele, as placas dos braços, os riscos da pele e o olho. */
type Pele = {
  pele: Tinta; peleAtras: Tinta; placa: Tinta; placaAtras: Tinta;
  vinco: Cor; vincoAtras: Cor; luz: Cor; esclera: Cor; pupila: Cor; brilho: Cor; boca: Cor;
};

const VERDE: Pele = {
  pele: tinta(cor('#78bf48'), cor('#4b8a33'), CONTORNO, cor('#a8e070'), 2),
  peleAtras: tinta(cor('#4b8a33'), cor('#346a28'), CONTORNO, undefined, 2),
  // as placas rosadas são da mesma pele: a borda delas é um rosa escuro, e não o contorno preto
  placa: { ...tinta(cor('#e3949c'), cor('#b8646f'), CONTORNO, cor('#f6c0c4'), 1), linha: cor('#9a4c5a') },
  placaAtras: { ...tinta(cor('#b06470'), cor('#8a4a58'), CONTORNO, undefined, 1), linha: cor('#6a3444') },
  vinco: cor('#3c7a2a'), vincoAtras: cor('#29561f'), luz: cor('#bdec8a'),
  esclera: cor('#ffffff'), pupila: CONTORNO, brilho: cor('#ffffff'), boca: cor('#2d4a22'),
};

/** O Picolé de Laranja: placas vermelho-tijolo, e o olho aceso em vermelho no lugar do branco. */
const LARANJA: Pele = {
  pele: tinta(cor('#f08a2a'), cor('#c05a18'), CONTORNO, cor('#ffc070'), 2),
  peleAtras: tinta(cor('#c05a18'), cor('#8e3f10'), CONTORNO, undefined, 2),
  // vermelho vivo e não tijolo escuro: escuro sobre laranja, a placa lia como mancha de pele
  placa: { ...tinta(cor('#d4432e'), cor('#9c2e20'), CONTORNO, cor('#f07a5a'), 1), linha: cor('#7a2016') },
  placaAtras: { ...tinta(cor('#9c2e20'), cor('#782418'), CONTORNO, undefined, 1), linha: cor('#561810') },
  vinco: cor('#a64c12'), vincoAtras: cor('#7a360c'), luz: cor('#ffd49a'),
  esclera: cor('#ff3c28'), pupila: cor('#5a0a0a'), brilho: cor('#ffc890'), boca: cor('#5a2008'),
};

const C = {
  roxo: tinta(cor('#5b3f9c'), cor('#3b2770'), CONTORNO, cor('#7e62c6'), 2),
  roxoAtras: tinta(cor('#3b2770'), cor('#281a50'), CONTORNO, undefined, 2),
  vincoRoxo: cor('#39266e'),
  vincoRoxoAtras: cor('#231746'),
  faixa: tinta(cor('#78cdea'), cor('#3f93bf'), CONTORNO, cor('#b4ecfa'), 1),
  vincoFaixa: cor('#4b9fc9'),
  sapato: tinta(cor('#8a5431'), cor('#5c3520'), CONTORNO, cor('#b27a4c'), 1),
  sapatoAtras: tinta(cor('#5c3520'), cor('#3f2416'), CONTORNO, undefined, 1),
  sola: cor('#c99d70'),
  solaAtras: cor('#86674c'),
  branco: tinta(cor('#efebe2'), cor('#b4aec4'), CONTORNO, cor('#ffffff'), 2),
  brancoAtras: tinta(cor('#bcb6ca'), cor('#8f89a6'), CONTORNO, undefined, 2),
  // a capa é a maior peça do desenho: com a sombra de 2 px ela ficava chapada como papel
  capa: tinta(cor('#efebe2'), cor('#b4aec4'), CONTORNO, cor('#ffffff'), 3),
  dobra: cor('#cdc7d8'),
  dobraFunda: cor('#9a94b2'),
  luzPano: cor('#ffffff'),
  dente: cor('#ffffff'),
  goela: cor('#5a1420'),
};

export const corpoDoPicole: Corpo = {
  tronco: 18.5,
  pescoco: 9.5,
  bracoSup: 12.5,
  antebraco: 12,
  coxa: 15.5,
  canela: 15,
  ombroF: [4, 16],
  ombroT: [-5, 16.5],
  quadrilF: [2.5, 1],
  quadrilT: [-3, 1],
};

/**
 * A escala do desenho em curso, lida do próprio esqueleto: o corpo chega multiplicado por ela. É
 * o que faz a luta (1,5) e o retrato do placar (1) saírem do mesmo código.
 */
const escalaDe = (e: Esqueleto) => e.corpo.tronco / corpoDoPicole.tronco;

/** Risco de 1 px que só pinta DENTRO da última peça pintada: dobra e vinco não vazam pelo contorno. */
function risco(p: Pintor, pts: P[], c: Cor) {
  for (let s = 1; s < pts.length; s++) {
    let x0 = Math.floor(pts[s - 1][0]), y0 = Math.floor(pts[s - 1][1]);
    const x1 = Math.floor(pts[s][0]), y1 = Math.floor(pts[s][1]);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (p.m.tem(x0, y0)) pixel(p.q, x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
}

/**
 * Mancha de sombra por dentro da última peça (a cunha de uma dobra), recortada pela máscara dela.
 * Só escurece: o pixel que já era mais escuro — a sombra da borda, o contorno de dentro — fica,
 * senão a mancha apagava o volume que a peça acabou de ganhar.
 */
function mancha(p: Pintor, pts: P[], c: Cor) {
  const soma3 = (x: Cor) => (x & 255) + ((x >>> 8) & 255) + ((x >>> 16) & 255);
  const alvo = soma3(c);
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const xs: number[] = [];
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]; const [xj, yj] = pts[j];
      if ((yi > cy) !== (yj > cy)) xs.push(xi + ((cy - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let n = 0; n + 1 < xs.length; n += 2) {
      for (let x = Math.ceil(xs[n] - 0.5); x <= Math.floor(xs[n + 1] - 0.5); x++) {
        if (p.m.tem(x, y) && soma3(p.q.px[y * p.q.largura + x]) > alvo) pixel(p.q, x, y, c);
      }
    }
  }
}

/**
 * Desenho de pixel escrito à mão: cada linha é uma altura (`a`, para cima a partir do `base`), cada
 * letra uma cor, o ponto é vazio, e a quarta coluna cai no `base`. Gira de 90 em 90 graus com a
 * cabeça — girado grau a grau, um olho de três pixels abria buraco ou engordava.
 */
function grade(p: Pintor, e: Esqueleto, base: P, linhas: Record<number, string>, cores: Record<string, Cor>) {
  const r = (Math.round(e.angCabeca / 90) * Math.PI) / 2;
  const c = Math.round(Math.cos(r)), s = Math.round(Math.sin(r));
  const bx = Math.floor(base[0]), by = Math.floor(base[1]);
  for (const [chave, l] of Object.entries(linhas)) {
    const a = Number(chave);
    for (let i = 0; i < l.length; i++) {
      const tom = cores[l[i]];
      if (tom === undefined) continue;
      const f = i - 3;
      pixel(p.q, bx + c * f + s * a, by + s * f - c * a, tom);
    }
  }
}

/** Uma lente ao longo do osso, fina nas duas pontas: a forma das placas dos braços. */
function lente(a: P, b: P, t0: number, t1: number, lado: number, larg: number): Forma {
  const t = (s: number) => t0 + (t1 - t0) * s;
  return {
    tipo: 'poligono',
    pts: [
      noOsso(a, b, t(0), lado), noOsso(a, b, t(0.2), lado - larg * 0.8), noOsso(a, b, t(0.55), lado - larg),
      noOsso(a, b, t(0.85), lado - larg * 0.7), noOsso(a, b, t(1), lado), noOsso(a, b, t(0.85), lado + larg * 0.7),
      noOsso(a, b, t(0.55), lado + larg), noOsso(a, b, t(0.2), lado + larg * 0.8),
    ],
  };
}

/** Músculo: uma elipse deitada no osso, `comp` no sentido dele e `larg` atravessado. */
const musculo = (c: P, larg: number, comp: number, angOsso: number): Forma => ({ tipo: 'elipse', c, rx: larg, ry: comp, ang: -angOsso });

function braco(p: Pintor, e: Esqueleto, frente: boolean, pl: Pele, forte: boolean) {
  const ombro = frente ? e.ombroF : e.ombroT;
  const cot = frente ? e.cotoveloF : e.cotoveloT;
  const mao = frente ? e.maoF : e.maoT;
  const pele = frente ? pl.pele : pl.peleAtras;
  const placa = frente ? pl.placa : pl.placaAtras;
  const vinco = frente ? pl.vinco : pl.vincoAtras;
  // comprido e seco no verde, que é o alcance dele; o laranja engrossa o braço inteiro
  const g = forte ? 1.3 : 1;
  const aSup = angulo(ombro, cot);
  // o braço incha no meio (bíceps na frente do osso, tríceps atrás) e afina no cotovelo e no
  // pulso: o tubo de raio quase igual é o que fazia dele um cano verde
  p.peca([
    { tipo: 'capsula', a: ombro, b: cot, ra: 2.8 * g, rb: 2 * g },
    { tipo: 'elipse', c: noOsso(ombro, cot, 0.1), rx: 3.3 * g, ry: 3.3 * g },
    musculo(noOsso(ombro, cot, 0.5, -0.9 * g), 2.2 * g, 4.4, aSup),
    musculo(noOsso(ombro, cot, 0.44, 0.8 * g), 2.2 * g, 4.6, aSup),
    { tipo: 'capsula', a: cot, b: noOsso(cot, mao, 0.3), ra: 2.1 * g, rb: 2.7 * g },
    { tipo: 'capsula', a: noOsso(cot, mao, 0.3), b: mao, ra: 2.7 * g, rb: 1.7 * g },
  ], pele);
  // o fim do deltoide e a dobra do cotovelo
  risco(p, [noOsso(ombro, cot, 0.2, -2.8 * g), noOsso(ombro, cot, 0.34, -0.8 * g)], vinco);
  risco(p, [noOsso(ombro, cot, 0.88, -1.8 * g), noOsso(cot, mao, 0.1, -1.4 * g)], vinco);
  // as placas: no bíceps e no antebraço, com as estrias atravessadas
  p.peca([lente(ombro, cot, 0.4, 0.9, 0.4 * g, 1.3 * g), lente(cot, mao, 0.08, 0.58, 0.3 * g, 1.25 * g)], placa);
  for (const s of [0.32, 0.62]) {
    const ts = 0.4 + 0.5 * s, ta = 0.08 + 0.5 * s;
    risco(p, [noOsso(ombro, cot, ts - 0.03, -0.9 * g), noOsso(ombro, cot, ts + 0.03, 1.7 * g)], placa.sombra);
    risco(p, [noOsso(cot, mao, ta - 0.03, -0.95 * g), noOsso(cot, mao, ta + 0.03, 1.55 * g)], placa.sombra);
  }
  maoDoPicole(p, e, frente, pele, vinco, forte ? 1.15 : 1);
}

/**
 * A mão, no referencial do pulso: `ao` para a frente no sentido do antebraço, `lado` atravessado.
 * O polegar é peça à parte — o contorno de dentro dele é o que separa o dedo do resto da mão.
 */
function maoDoPicole(p: Pintor, e: Esqueleto, frente: boolean, pele: Tinta, vinco: Cor, g: number) {
  const k = escalaDe(e);
  const cot = frente ? e.cotoveloF : e.cotoveloT;
  const m = frente ? e.maoF : e.maoT;
  const d = dir(angulo(cot, m));
  const em = (ao: number, lado: number): P => [m[0] + (d[0] * ao - d[1] * lado) * g * k, m[1] + (d[1] * ao + d[0] * lado) * g * k];
  const polegar = (a: P, b: P) => p.peca([{ tipo: 'capsula', a, b, ra: 0.95 * g, rb: 0.8 * g }], pele);
  const pose = e.pose as PoseDoPicole;
  if (frente ? pose.dedosF : pose.dedosT) {
    // punho com o indicador e o médio esticados: um risco no meio faz dos dois dedos um par
    p.peca([
      { tipo: 'capsula', a: em(1, 0.3), b: em(2.2, 0.4), ra: 2.2 * g, rb: 2.2 * g },
      { tipo: 'capsula', a: em(3, -0.5), b: em(7.4, -0.6), ra: 1.25 * g, rb: 1.05 * g },
    ], pele);
    risco(p, [em(4.2, -0.55), em(7.4, -0.6)], vinco);
    risco(p, [em(3.3, 0.9), em(3.3, 2.3)], vinco);
    polegar(em(1.2, -1.9), em(2.8, -1.6));
  } else if ((frente ? pose.maoF : pose.maoT) === 'aberta') {
    // mão aberta: palma e dedos juntos numa peça, e os vãos entre os dedos riscados
    p.peca([{
      tipo: 'poligono',
      pts: [em(0.2, -1.7), em(2.8, -2), em(5.6, -1.6), em(6.5, -0.7), em(6.4, 0.6), em(5.6, 1.6), em(2.6, 2.1), em(0.2, 1.8)],
    }], pele);
    risco(p, [em(3.4, -0.55), em(6.1, -0.6)], vinco);
    risco(p, [em(3.4, 0.6), em(5.8, 0.7)], vinco);
    polegar(em(1, -1.6), em(3.1, -3.4));
  } else {
    // punho: um bloco maior que o pulso, os nós dos dedos atravessados e dois vãos até a frente
    p.peca([{ tipo: 'capsula', a: em(1.4, 0.1), b: em(2.6, 0.1), ra: 2.4 * g, rb: 2.4 * g }], pele);
    risco(p, [em(3.3, -1.9), em(3.3, 2)], vinco);
    risco(p, [em(3.5, -0.4), em(4.9, -0.4)], vinco);
    risco(p, [em(3.5, 0.9), em(4.7, 0.9)], vinco);
    polegar(em(1.4, -2.2), em(3.4, -1.8));
  }
}

/**
 * O sapato de sola chata, no referencial do tornozelo: x para a ponta, y para cima, com a sola no
 * chão (3 unidades abaixo do tornozelo, onde a bola do calcanhar do boneco encostava). A sola é a
 * última faixa de baixo, pintada por dentro da peça para não ganhar um segundo contorno.
 */
function sapato(p: Pintor, tornozelo: P, ang: number, k: number, frente: boolean) {
  const a = (ang * Math.PI) / 180;
  const F: P = [Math.cos(a), -Math.sin(a)], U: P = [-Math.sin(a), -Math.cos(a)];
  const no = (x: number, y: number): P => [tornozelo[0] + (F[0] * x + U[0] * y) * k, tornozelo[1] + (F[1] * x + U[1] * y) * k];
  p.peca([{
    tipo: 'poligono',
    pts: [no(-2.9, -3), no(-3.2, -0.4), no(-2.4, 2.4), no(1.6, 2.4), no(4.4, 0.6), no(6.8, -0.6), no(8.1, -1.6), no(8, -3)],
  }], frente ? C.sapato : C.sapatoAtras);
  const sola = frente ? C.sola : C.solaAtras;
  for (let y = p.m.y0; y <= p.m.y1; y++) {
    for (let x = p.m.x0; x <= p.m.x1; x++) {
      if (p.m.tem(x, y) && ((x + 0.5 - tornozelo[0]) * U[0] + (y + 0.5 - tornozelo[1]) * U[1]) / k < -2) pixel(p.q, x, y, sola);
    }
  }
}

function perna(p: Pintor, e: Esqueleto, frente: boolean) {
  const quadril = frente ? e.quadrilF : e.quadrilT;
  const joelho = frente ? e.joelhoF : e.joelhoT;
  const tornozelo = frente ? e.tornozeloF : e.tornozeloT;
  sapato(p, tornozelo, (frente ? e.pose.peF : e.pose.peT) ?? 0, escalaDe(e), frente);
  // calça larga que cai em bolsa por cima do sapato
  p.peca([
    { tipo: 'capsula', a: quadril, b: joelho, ra: 5, rb: 4.2 },
    { tipo: 'capsula', a: joelho, b: noOsso(joelho, tornozelo, 0.58), ra: 4.2, rb: 3.8 },
    { tipo: 'capsula', a: noOsso(joelho, tornozelo, 0.58), b: noOsso(joelho, tornozelo, 0.76), ra: 3.8, rb: 4.3 },
    { tipo: 'capsula', a: noOsso(joelho, tornozelo, 0.76), b: noOsso(joelho, tornozelo, 0.84), ra: 4.3, rb: 3.1 },
  ], frente ? C.roxo : C.roxoAtras);
  const v = frente ? C.vincoRoxo : C.vincoRoxoAtras;
  const coxa = (t: number, lado: number) => noOsso(quadril, joelho, t, lado);
  const canela = (t: number, lado: number) => noOsso(joelho, tornozelo, t, lado);
  // o pano junta atrás do joelho num ">", desce da virilha numa dobra comprida e franze na bolsa
  risco(p, [coxa(0.7, 3.4), coxa(1, 1.4), canela(0.24, 3.2)], v);
  risco(p, [coxa(0.16, 1.8), coxa(0.6, -2.4)], v);
  risco(p, [canela(0.62, -3.2), canela(0.76, -0.8)], v);
  risco(p, [canela(0.7, 3.2), canela(0.84, 1)], v);
}

/**
 * A capa pendura pelos ombros e cai no sentido do mundo. As duas bordas são curvas: perto do
 * ombro o pano pende, e quanto mais perto da barra, mais o vento o leva para trás — girar a capa
 * inteira de uma vez a transforma numa bandeira dura. A barra tem dobras em zigue-zague cuja fase
 * anda com o próprio vento.
 */
function capa(p: Pintor, e: Esqueleto) {
  const k = escalaDe(e);
  const t = (f: number, h: number) => noTronco(e, f, h);
  // Pano não atravessa o chão: o que passaria dele deita e escorrega para trás. O chão sai da
  // escala do desenho — lido do SPRITE da luta, o retrato do placar cortava a capa no lugar errado.
  const chao = medidasDoSprite(k).ancoraY - 0.5;
  const noChao = ([x, y]: P): P => (y > chao ? [x - (y - chao) * 0.8, chao] : [x, y]);
  // acima de 1 a capa já está na horizontal, e mais que isso só a afina até virar fita
  const vento = Math.max(0, Math.min(1.1, e.pose.vento ?? 0));
  // Presa por baixo das ombreiras, em UNIDADES do corpo. Com `e.corpo.tronco` (que já chega
  // multiplicado) o noTronco escalava duas vezes, e a capa saía flutuando acima dos ombros.
  const nuca = t(-2.5, corpoDoPicole.tronco + 0.8);
  const costas = t(-11, corpoDoPicole.tronco - 1.2);
  const PASSOS = 4;
  // uma borda: cada trecho gira um pouco mais que o anterior, e ondula com o vento. O giro para
  // na horizontal: passando dela, a borda de cima cruzava a de baixo e a capa virava um nó
  const borda = (de: P, comprimento: number, abertura: number, curva: number, fase: number): P[] => {
    const pts: P[] = [];
    let ponto = de;
    for (let i = 1; i <= PASSOS; i++) {
      const s = i / PASSOS;
      const giro = Math.max(-96, abertura - vento * curva * s * s + Math.sin(s * 5 + vento * 8 + fase) * vento * 8);
      ponto = soma(ponto, dir(giro), (comprimento * k) / PASSOS);
      pts.push(noChao(ponto));
    }
    return pts;
  };
  // inclinado para a frente, o pano deita nas costas antes de cair; sem isso a barra pendia
  // da nuca direto para o meio das pernas e virava uma mancha branca entre elas
  const deita = Math.max(0, e.pose.tronco) * 0.9;
  // de costas no ar (arremessado), o pano vai deitado atrás do corpo, para o lado dos pés;
  // pendurado dos ombros ele descia até o chão como uma tábua branca debaixo dele
  const arrasta = Math.min(100, Math.max(0, -e.pose.tronco - 25) * 2.4);
  // deitado, o pano embola: inteiro, a barra passava dos joelhos e aparecia entre as pernas
  const embola = 1 - arrasta / 350;
  // a borda de baixo curva menos que a de cima: é o que mantém a barra larga com vento forte,
  // em vez de as duas se juntarem numa fita
  const tras = borda(costas, 42 * embola, -16 - vento * 8 - deita * 0.5 + arrasta, 80, 0);
  const frente = borda(nuca, 38 * embola, -2 - deita + arrasta, 50, 1.3);
  const baixoTras = tras[PASSOS - 1], baixoFrente = frente[PASSOS - 1];
  // a quina de cima da barra é chanfrada: em ângulo agudo o contorno deixava um fiapo solto
  tras[PASSOS - 1] = noOsso(baixoTras, tras[PASSOS - 2], 0.12);
  const para = angulo(baixoTras, baixoFrente) - 90;
  // a onda some perto das pontas, pelo mesmo motivo
  const onda = (s: number) => Math.sin(s * Math.PI * 3 + vento * 9) * (1.2 + vento * 1.2) * Math.sin(s * Math.PI) * k;
  const naBarra = (s: number): P => noChao(soma(noOsso(baixoTras, baixoFrente, s), dir(para), onda(s)));
  const barra: P[] = [noOsso(baixoTras, baixoFrente, 0.1)];
  for (let i = 1; i < 6; i++) barra.push(naBarra(i / 6));
  p.peca([{ tipo: 'poligono', pts: [nuca, costas, ...tras, ...barra, ...[...frente].reverse()] }], C.capa);
  // Dobras com volume: cada uma é uma cunha de sombra que nasce fina perto dos ombros e abre até a
  // barra, com o fundo mais escuro e um fio de luz do lado da frente, de onde vem a luz. Riscos
  // soltos diziam "dobra" mas deixavam o pano chapado.
  for (const s of [0.2, 0.47, 0.74]) {
    const topo = noOsso(tras[0], frente[0], 0.15 + s * 0.7);
    mancha(p, [topo, naBarra(s - 0.1), naBarra(s + 0.03)], C.dobra);
    risco(p, [noOsso(topo, naBarra(s - 0.03), 0.3), naBarra(s - 0.03)], C.dobraFunda);
    risco(p, [noOsso(topo, naBarra(s + 0.07), 0.35), naBarra(s + 0.07)], C.luzPano);
  }
}

function ombreira(p: Pintor, e: Esqueleto, frente: boolean) {
  const t = (f: number, h: number) => noTronco(e, f, h);
  // em unidades, pelo mesmo motivo da capa: `e.corpo.ombroF` já vem escalado
  const o = frente ? corpoDoPicole.ombroF : corpoDoPicole.ombroT;
  // Almofada redonda EM CIMA do ombro, passando dele para os dois lados: é o que faz o "T" da
  // silhueta. Foi uma placa reta que saía 8 px para a frente e subia até o pescoço, e como o
  // rosto dele fica à frente do ombro ela lia como uma tábua branca atravessada debaixo do queixo.
  // Hoje o alto é chato e desce para a frente, longe do queixo.
  const s = frente ? 1 : -1;
  const no = (f: number, h: number) => t(o[0] + f * s, o[1] + h);
  const pts: P[] = [no(-5.6, 0.8), no(-4.2, 3), no(0.6, 3.4), no(4.6, 2.4), no(6, 0.4), no(5.6, -1.6), no(4.2, -2.6), no(-4.6, -2.2), no(-5.8, -1)];
  p.peca([{ tipo: 'poligono', pts }], frente ? C.branco : C.brancoAtras);
  // A almofada tem espessura: o terço de baixo é a borda, num tom abaixo e com o vinco em cima.
  // Toda branca, ela lia como uma nuvem debaixo do queixo.
  mancha(p, [no(-6, -0.4), no(6.4, 0), no(6.4, -3), no(-6, -3)], frente ? C.dobra : C.brancoAtras.sombra);
  risco(p, [no(-5.4, -0.4), no(1.6, 0.1), no(6, -0.2)], frente ? C.dobraFunda : C.brancoAtras.sombra);
}

function tronco(p: Pintor, e: Esqueleto, pl: Pele, forte: boolean) {
  const t = (f: number, h: number) => noTronco(e, f, h);
  if (forte) {
    // o trapézio do laranja sobe por trás do pescoço: é o ombro de quem ficou maior
    p.peca([{ tipo: 'poligono', pts: [t(-8.2, 17.4), t(-4.8, 22.8), t(0.6, 24.2), t(5.4, 22.8), t(9, 18.6), t(0, 16)] }], pl.pele);
  }
  // quimono sem manga, estreito na cintura; o laranja o estica no peito
  const w = forte ? 1.2 : 0;
  p.peca([{
    tipo: 'poligono',
    pts: [t(-7.4 - w, 17.5), t(-4.5 - w * 0.6, 20.8 + w * 0.4), t(4 + w * 0.5, 21 + w * 0.4), t(8.2 + w, 18), t(7.8 + w, 11), t(5.6 + w * 0.6, 3.6), t(-5.2 - w * 0.4, 2), t(-6.8 - w, 9)],
  }], C.roxo);
  // o pano desce das axilas e junta na faixa
  risco(p, [t(-5.4 - w, 15.2), t(-4.2, 10.6), t(-3, 6.4)], C.vincoRoxo);
  risco(p, [t(6.6 + w, 13.2), t(5.2 + w * 0.5, 9.4), t(4.4, 6.8)], C.vincoRoxo);
  risco(p, [t(0.4, 11.4), t(1.2, 6.8)], C.vincoRoxo);
  // o decote em V mostra o peito; a borda dele é o pano do quimono, e não um risco de pele escura
  const decote = forte ? [t(-1, 21.6), t(7.4, 21), t(3.6, 11.6)] : [t(0.4, 21), t(5.6, 20.6), t(3.2, 14.2)];
  p.peca([{ tipo: 'poligono', pts: decote }], { ...pl.pele, faixa: 0, linha: C.vincoRoxo });
  risco(p, forte ? [t(1.2, 17.4), t(3, 16.2), t(5.6, 16.8)] : [t(1.8, 17.8), t(4.4, 17.3)], pl.vinco);
}

/**
 * A faixa vem DEPOIS das pernas: é ela que prende o quimono por cima da calça, e o nó na frente
 * ficaria escondido pela coxa. As pontas do nó caem pelo mundo, e o vento as leva para trás.
 */
function faixaDaCintura(p: Pintor, e: Esqueleto, forte: boolean) {
  const k = escalaDe(e);
  const t = (f: number, h: number) => noTronco(e, f, h);
  const w = forte ? 0.8 : 0;
  p.peca([{ tipo: 'poligono', pts: [t(-5.8 - w, 6), t(6.6 + w, 6.8), t(6.6 + w, 2.6), t(-5.6 - w, 1.6)] }], C.faixa);
  risco(p, [t(-5.4 - w, 4), t(1, 4.5), t(6.2 + w, 4.7)], C.vincoFaixa);
  const vento = Math.max(0, Math.min(1, e.pose.vento ?? 0));
  // as duas pontas se abrem em V: paralelas e grossas, liam como uma alça pendurada
  const ponta = (de: P, comp: number, abre: number): Forma => ({ tipo: 'capsula', a: de, b: soma(de, dir(abre - vento * 55), comp * k), ra: 1, rb: 0.75 });
  p.peca([ponta(t(4.8 + w, 3.6), 6.2, 16), ponta(t(5.6 + w, 3.4), 5, -14)], C.faixa);
  p.peca([{ tipo: 'elipse', c: t(5.3 + w, 4.3), rx: 1.6, ry: 1.5 }], C.faixa);
}

/**
 * Turbante: bulbo e volta na testa numa peça só — com um risco de contorno entre os dois, ele
 * virava um chapéu de dois andares. O bulbo pende para trás, e as voltas do pano (sombra embaixo,
 * brilho em cima) cruzam na frente, de onde saem as antenas: é pano enrolado, não capacete.
 */
function turbante(p: Pintor, e: Esqueleto, grande: boolean) {
  const h = (f: number, a: number) => naCabeca(e, f, a);
  p.peca([
    { tipo: 'elipse', c: h(-2.2, 9.8), rx: 6.1, ry: 6, ang: e.angCabeca - 24 },
    { tipo: 'poligono', pts: [h(-5.6, 2.2), h(1, 3.0), h(4.8, 3.2), h(5.6, 5.0), h(5.2, 7.2), h(-6.4, 7.0)] },
  ], C.branco);
  // As voltas SOBEM de trás para a frente e cruzam acima da testa. Deitadas, paralelas ao chão,
  // elas faziam do turbante uma pilha de panquecas.
  const volta = (pts: P[]) => {
    risco(p, pts.map(([f, a]) => h(f, a)), C.dobraFunda);
    if (grande) risco(p, pts.map(([f, a]) => h(f - 0.5, a + 0.7)), C.luzPano);
  };
  volta([[-6.4, 5.4], [-2, 7.4], [3.4, 10.4]]);
  volta([[-7.8, 9.2], [-4.4, 12.4], [0, 15.2]]);
  if (grande) {
    // a borda enrolada na testa e a volta que cruza as outras na frente
    risco(p, [h(-5.2, 3.3), h(1, 4), h(4.9, 4.2)], C.dobra);
    risco(p, [h(5, 6.4), h(3.4, 9.6), h(1.4, 12.8)], C.dobraFunda);
  }
}

/**
 * O rosto pixel a pixel, com o olho como origem. Na luta (cabeça de ~18 px): sobrancelha grossa
 * descendo para o nariz, com um pixel de pele até o turbante; olho com branco e a pupila na frente;
 * a maçã do rosto com brilho em cima e o vinco embaixo; boca reta de canto caído. No retrato do
 * placar (escala 1) a cabeça tem 12 px e o desenho é o de sempre, menor.
 */
function rosto(p: Pintor, e: Esqueleto, pl: Pele, forte: boolean, grande: boolean) {
  const olhos = e.pose.olhos ?? 'abertos';
  const g: Record<number, string> = {};
  if (grande) {
    // o laranja franze a testa careca, e a sobrancelha fica mais pesada
    if (forte) { g[6] = '..VVV..'; g[4] = '.VVVV..'; }
    g[2] = forte ? 'KKKK...' : 'KKK....';
    g[1] = forte ? '.KKKKKK' : '..KKKKK';
    if (olhos === 'abertos') { g[0] = forte ? '..WBWP.' : '..WWWP.'; g[-1] = '....WP.'; g[-2] = '..LL...'; }
    else if (olhos === 'fechados') { g[-1] = '..KKKK.'; g[-2] = '..LL...'; }
    else { g[0] = '..K.K..'; g[-1] = '...K...'; g[-2] = '..K.K..'; }
    g[-3] = '.V.....';
    g[-4] = '..V....';
    if (e.pose.grito) { g[-5] = '....KKK'; g[-6] = '...KDRR'; g[-7] = '....KRD'; g[-8] = '.....KK'; }
    else { g[-6] = '....MMM'; g[-7] = '...M...'; }
  } else {
    g[2] = '..KK...';
    g[1] = '....KK.';
    if (olhos === 'abertos') g[0] = '..WWP..';
    else if (olhos === 'fechados') g[-1] = '..KKK..';
    else { g[0] = '..K.K..'; g[-1] = '...K...'; g[-2] = '..K.K..'; }
    if (e.pose.grito) { g[-4] = '...KD..'; g[-5] = '...KK..'; } else g[-4] = '...MM..';
  }
  const cores = { K: CONTORNO, W: pl.esclera, P: pl.pupila, B: pl.brilho, V: pl.vinco, L: pl.luz, M: pl.boca, D: C.dente, R: C.goela };
  grade(p, e, grande ? naCabeca(e, 2.2, 0.1) : naCabeca(e, 3.1, -0.5), g, cores);
}

function cabeca(p: Pintor, e: Esqueleto, pl: Pele, forte: boolean) {
  const h = (f: number, a: number) => naCabeca(e, f, a);
  const grande = escalaDe(e) >= 1.25;
  // pescoço comprido; o do laranja é um tronco
  p.peca([{ tipo: 'capsula', a: e.pescoco, b: h(-0.6, -3), ra: forte ? 3.3 : 2.5, rb: forte ? 3 : 2.5 }], pl.pele);
  // rosto de queixo comprido e fino, com o nariz marcando o perfil; careca, ganha o crânio inteiro
  const formas: Forma[] = [
    { tipo: 'elipse', c: h(0, 0.4), rx: 5, ry: 6, ang: e.angCabeca },
    { tipo: 'poligono', pts: [h(-3.4, -1.5), h(4.8, 1), h(5.5, -1.5), h(4.9, -2.6), h(5, -3.8), h(3.8, -6.4), h(1, -7.4), h(-2.2, -5.4)] },
  ];
  if (forte) formas.push({ tipo: 'elipse', c: h(-0.8, 3.6), rx: 5.7, ry: 6.3, ang: e.angCabeca - 12 });
  p.peca(formas, pl.pele);
  if (!forte) turbante(p, e, grande);
  // as antenas saem da testa (furando o turbante, no verde) e se abrem, cada uma para um lado
  const antena = (pts: P[], pele: Tinta) => p.peca([
    { tipo: 'capsula', a: h(...pts[0]), b: h(...pts[1]), ra: 0.7, rb: 0.55 },
    { tipo: 'capsula', a: h(...pts[1]), b: h(...pts[2]), ra: 0.55, rb: 0.45 },
  ], { ...pele, faixa: 0 });
  if (forte) {
    antena([[1.4, 8.4], [2, 12], [4.2, 14.6]], pl.peleAtras);
    antena([[3.4, 7.4], [6.2, 10], [9.2, 10.8]], pl.pele);
  } else {
    antena([[1.2, 11.5], [1.6, 15.2], [4, 17.4]], pl.peleAtras);
    antena([[3.8, 10], [6.8, 12.6], [9.8, 13]], pl.pele);
  }
  // orelha pontuda, para trás e para cima; o risco de dentro é o que a faz orelha e não chifre
  p.peca([{ tipo: 'poligono', pts: [h(-1.4, 2.2), h(-5.2, 4.2), h(-10.4, 6.2), h(-6.4, 1.2), h(-3.8, -2.8)] }], { ...pl.pele, faixa: 1 });
  risco(p, [h(-3.2, 0.4), h(-6.4, 3), h(-9, 5.4)], pl.vinco);
  rosto(p, e, pl, forte, grande);
}

export const picole: Personagem = {
  id: 'picole',
  nome: 'Picolé',
  corpo: corpoDoPicole,
  desenhar(p, e) {
    const forte = e.pose.forma === 1;
    const pl = forte ? LARANJA : VERDE;
    if (!forte) capa(p, e);
    braco(p, e, false, pl, forte);
    if (!forte) ombreira(p, e, false);
    perna(p, e, false);
    tronco(p, e, pl, forte);
    perna(p, e, true);
    faixaDaCintura(p, e, forte);
    cabeca(p, e, pl, forte);
    braco(p, e, true, pl, forte);
    if (!forte) ombreira(p, e, true);
  },
};

export const vitrine: { parado: PoseDoPicole; especial: PoseDoPicole; vitoria: PoseDoPicole } = {
  parado: {
    quadril: [-1, -27], tronco: 8, cabeca: -5,
    pernaF: { alvo: [13, -3] }, pernaT: { alvo: [-11, -3] },
    bracoF: { alvo: [19, -44] }, bracoT: { alvo: [9, -48] },
  },
  especial: {
    quadril: [-2, -25], tronco: 2, cabeca: -2,
    pernaF: { alvo: [15, -3] }, pernaT: { alvo: [-15, -3] },
    // a mão de trás fica escondida atrás do tronco: solta, ela cruzava a capa e sujava a silhueta
    bracoF: { alvo: [9.5, -56] }, bracoT: { alvo: [2.5, -37] },
    dedosF: true, grito: true, vento: 0.6,
  },
  vitoria: {
    quadril: [0, -29], tronco: -2, cabeca: 4,
    pernaF: { alvo: [8, -3] }, pernaT: { alvo: [-7, -3] },
    // braços cruzados: o antebraço da frente deitado sobre o peito, a mão de trás aparecendo na frente
    bracoF: { ang: [25, -115] }, bracoT: { ang: [20, 110] },
    olhos: 'fechados', vento: 0.4,
  },
};

/**
 * O segundo tempo do Picolé Espiral: o braço estendido com os dois dedos apontando, e a capa
 * levada pelo tranco. A vitrine mostra a carga (os dedos na testa), que é o gesto que ninguém mais
 * faz; esta é a pose de onde o disparo sai.
 */
export const disparoDoEspecial: PoseDoPicole = {
  quadril: [-3, -25], tronco: 10, cabeca: -6,
  pernaF: { alvo: [16, -3] }, pernaT: { alvo: [-17, -3] },
  bracoF: { alvo: [34, -46] }, bracoT: { alvo: [14, -40] },
  dedosF: true, maoT: 'aberta', grito: true, vento: 1,
};

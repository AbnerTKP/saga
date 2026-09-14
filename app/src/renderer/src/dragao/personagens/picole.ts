/**
 * Picolé — o alienígena verde e sábio, de turbante e capa. O mais alto e o de braço mais comprido:
 * luta de longe, e o especial é o Picolé Espiral (dois dedos na testa carregando, e o braço
 * estendido na hora de soltar).
 *
 * O desenho segue a arte que o dono mandou: proporção de boneco (a cabeça com o turbante é uns 40%
 * da altura, tronco curto, perna curta e grossa, mão e sapato grandes), olho grande de anime e
 * NENHUM contorno preto — cada peça se contorna com um tom fundo dela mesma, e a sombra puxa para
 * o azul enquanto a luz puxa para o amarelo. O braço continua comprido: é o alcance dele.
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

/** Peça grande: a passagem de sombra e de luz em xadrez, que é o acabamento pintado da referência. */
const pintada = (t: Tinta): Tinta => ({ ...t, pontilhado: true });

/** O que a transformação troca: a pele, as placas dos braços, os riscos da pele e o olho. */
type Pele = {
  pele: Tinta; peleAtras: Tinta; placa: Tinta; placaAtras: Tinta;
  vinco: Cor; vincoAtras: Cor; luz: Cor; sobrancelha: Cor; cilio: Cor;
  esclera: Cor; iris: Cor; irisBaixo: Cor; brilho: Cor; boca: Cor;
};

// o contorno da pele verde é musgo fundo, e a sombra dela puxa para o azul-petróleo
const MUSGO = cor('#17392a');
const VERDE: Pele = {
  pele: tinta(cor('#7ac24e'), cor('#3c8858'), MUSGO, cor('#d4ee80'), 2),
  peleAtras: tinta(cor('#4c9255'), cor('#2e684c'), MUSGO, undefined, 2),
  // as placas rosadas são da mesma pele: sombra arroxeada, luz de pêssego e borda vinho
  placa: { ...tinta(cor('#ee96a0'), cor('#b05a86'), cor('#56223f'), cor('#ffd4bc'), 1), linha: cor('#8a3a62') },
  placaAtras: { ...tinta(cor('#b6667e'), cor('#88466a'), cor('#46193a'), undefined, 1), linha: cor('#682a50') },
  vinco: cor('#2c6a4a'), vincoAtras: cor('#21503c'), luz: cor('#e2f496'),
  sobrancelha: cor('#1f4a32'), cilio: cor('#10241c'),
  esclera: cor('#f4f6ea'), iris: cor('#1c1c3a'), irisBaixo: cor('#3f6c8c'), brilho: cor('#ffffff'), boca: cor('#1c3a2a'),
};

/** O Picolé de Laranja: placas vermelhas, sombra puxando para o vinho e o olho aceso em vermelho. */
const BRASA = cor('#561b1e');
const LARANJA: Pele = {
  pele: tinta(cor('#f49c3c'), cor('#c2503e'), BRASA, cor('#ffdc7a'), 2),
  peleAtras: tinta(cor('#de7636'), cor('#a8423a'), BRASA, undefined, 2),
  // vermelho vivo e não tijolo escuro: escuro sobre laranja, a placa lia como mancha de pele
  placa: { ...tinta(cor('#e0442e'), cor('#a0264a'), cor('#480d22'), cor('#ff9460'), 1), linha: cor('#7a1a38') },
  placaAtras: { ...tinta(cor('#a43032'), cor('#7a1e3c'), cor('#3c0a1c'), undefined, 1), linha: cor('#5a1228') },
  vinco: cor('#b24a34'), vincoAtras: cor('#86322e'), luz: cor('#ffeaa6'),
  sobrancelha: cor('#7a2622'), cilio: cor('#3a0c14'),
  esclera: cor('#fff0dc'), iris: cor('#d01e2a'), irisBaixo: cor('#ff7a3a'), brilho: cor('#fff6c0'), boca: cor('#4a1414'),
};

// Branco de pano: luz de creme e sombra lavanda, com o contorno cinza-azulado fundo.
const ARDOSIA = cor('#383b5e');
const ROXO_FUNDO = cor('#20133c');
const C = {
  roxo: pintada(tinta(cor('#6b4fb8'), cor('#3c2e88'), ROXO_FUNDO, cor('#b08ad8'), 2)),
  roxoAtras: pintada(tinta(cor('#46358e'), cor('#2b2168'), ROXO_FUNDO, undefined, 2)),
  vincoRoxo: cor('#3a2b80'),
  vincoRoxoAtras: cor('#241b58'),
  faixa: tinta(cor('#72cce6'), cor('#3c82c2'), cor('#1a3262'), cor('#d8f6e6'), 1),
  vincoFaixa: cor('#4a8ec6'),
  sapato: tinta(cor('#9c5c38'), cor('#603538'), cor('#2c171c'), cor('#d69e5e'), 1),
  sapatoAtras: tinta(cor('#673a3a'), cor('#452530'), cor('#2c171c'), undefined, 1),
  sola: cor('#dcb07c'),
  solaAtras: cor('#8c6a56'),
  branco: tinta(cor('#f3efe2'), cor('#b0b0d0'), ARDOSIA, cor('#fffbea'), 2),
  brancoAtras: tinta(cor('#c4c3da'), cor('#9292b8'), ARDOSIA, undefined, 2),
  turbante: pintada(tinta(cor('#f3efe2'), cor('#b0b0d0'), ARDOSIA, cor('#fffbea'), 2)),
  // a capa é a maior peça do desenho: com a sombra de 2 px ela ficava chapada como papel
  capa: pintada(tinta(cor('#f3efe2'), cor('#b0b0d0'), ARDOSIA, cor('#fffbea'), 3)),
  dobra: cor('#d2d2e6'),
  dobraFunda: cor('#9496be'),
  luzPano: cor('#fffdf2'),
  dente: cor('#ffffff'),
  goela: cor('#6a1a30'),
};

/**
 * Corpo de boneco: tronco e perna curtos, a cabeça grande logo em cima dos ombros. O braço é o
 * único osso que não encolheu — é o alcance dele, e as poses de golpe esticam pelo comprimento.
 */
export const corpoDoPicole: Corpo = {
  tronco: 14,
  pescoco: 10.5,
  bracoSup: 11.5,
  antebraco: 11,
  coxa: 10.5,
  canela: 10,
  ombroF: [4.5, 12.5],
  ombroT: [-4.5, 13],
  quadrilF: [3, 0.5],
  quadrilT: [-3.2, 0.5],
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
 * cabeça — girado grau a grau, um olho de poucos pixels abria buraco ou engordava.
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
  // comprido no verde, que é o alcance dele; o laranja engrossa o braço inteiro
  const g = forte ? 1.3 : 1;
  const aSup = angulo(ombro, cot);
  // braço de boneco: roliço, com o ombro redondo e o antebraço engrossando até o punho grande.
  // Músculo desenhado osso a osso é do corpo comprido, e no boneco virava um nó
  p.peca([
    { tipo: 'capsula', a: ombro, b: cot, ra: 3.1 * g, rb: 2.5 * g },
    { tipo: 'elipse', c: noOsso(ombro, cot, 0.08), rx: 3.6 * g, ry: 3.6 * g },
    musculo(noOsso(ombro, cot, 0.48, -0.7 * g), 2.5 * g, 4, aSup),
    { tipo: 'capsula', a: cot, b: noOsso(cot, mao, 0.45), ra: 2.5 * g, rb: 3 * g },
    { tipo: 'capsula', a: noOsso(cot, mao, 0.45), b: mao, ra: 3 * g, rb: 2.3 * g },
  ], pele);
  risco(p, [noOsso(ombro, cot, 0.9, -1.8 * g), noOsso(cot, mao, 0.1, -1.4 * g)], vinco);
  // as placas: no bíceps e no antebraço, com uma estria atravessada em cada
  p.peca([lente(ombro, cot, 0.38, 0.88, 0.3 * g, 1.5 * g), lente(cot, mao, 0.12, 0.62, 0.2 * g, 1.5 * g)], placa);
  risco(p, [noOsso(ombro, cot, 0.6, -1.1 * g), noOsso(ombro, cot, 0.66, 1.9 * g)], placa.sombra);
  risco(p, [noOsso(cot, mao, 0.34, -1.2 * g), noOsso(cot, mao, 0.4, 1.8 * g)], placa.sombra);
  maoDoPicole(p, e, frente, pele, vinco, forte ? 1.5 : 1.35);
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
      { tipo: 'capsula', a: em(3, -0.5), b: em(6.2, -0.6), ra: 1.2 * g, rb: 1 * g },
    ], pele);
    risco(p, [em(3.8, -0.55), em(6.4, -0.6)], vinco);
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
    // punho: um bloco redondo maior que o pulso, com os nós dos dedos atravessados na frente
    p.peca([{ tipo: 'capsula', a: em(1.4, 0.1), b: em(2.4, 0.1), ra: 2.4 * g, rb: 2.4 * g }], pele);
    risco(p, [em(3.1, -1.6), em(3.1, 1.8)], vinco);
    risco(p, [em(3.4, 0.2), em(4.5, 0.2)], vinco);
    polegar(em(1.4, -2.2), em(3.2, -1.8));
  }
}

/**
 * O sapato de sola chata, no referencial do tornozelo: x para a ponta, y para cima, com a sola no
 * chão (3 unidades abaixo do tornozelo). Grande e redondo, como o pé de boneco da referência; a
 * sola é a última faixa de baixo, pintada por dentro da peça para não ganhar um segundo contorno.
 */
function sapato(p: Pintor, tornozelo: P, ang: number, k: number, frente: boolean) {
  const a = (ang * Math.PI) / 180;
  const F: P = [Math.cos(a), -Math.sin(a)], U: P = [-Math.sin(a), -Math.cos(a)];
  const no = (x: number, y: number): P => [tornozelo[0] + (F[0] * x + U[0] * y) * k, tornozelo[1] + (F[1] * x + U[1] * y) * k];
  p.peca([{
    tipo: 'poligono',
    pts: [no(-3.8, -3), no(-4.3, -0.4), no(-3.2, 2.8), no(1.8, 3.2), no(5.2, 1.4), no(8.2, 0.4), no(9.8, -0.8), no(10, -3)],
  }], frente ? C.sapato : C.sapatoAtras);
  const sola = frente ? C.sola : C.solaAtras;
  for (let y = p.m.y0; y <= p.m.y1; y++) {
    for (let x = p.m.x0; x <= p.m.x1; x++) {
      if (p.m.tem(x, y) && ((x + 0.5 - tornozelo[0]) * U[0] + (y + 0.5 - tornozelo[1]) * U[1]) / k < -2.2) pixel(p.q, x, y, sola);
    }
  }
}

function perna(p: Pintor, e: Esqueleto, frente: boolean) {
  const quadril = frente ? e.quadrilF : e.quadrilT;
  const joelho = frente ? e.joelhoF : e.joelhoT;
  const tornozelo = frente ? e.tornozeloF : e.tornozeloT;
  sapato(p, tornozelo, (frente ? e.pose.peF : e.pose.peT) ?? 0, escalaDe(e), frente);
  // calça larga e curta, que cai em bolsa por cima do sapato: a perna de boneco é quase só pano
  p.peca([
    { tipo: 'capsula', a: quadril, b: joelho, ra: 5.6, rb: 4.8 },
    { tipo: 'capsula', a: joelho, b: noOsso(joelho, tornozelo, 0.5), ra: 4.8, rb: 4.5 },
    { tipo: 'capsula', a: noOsso(joelho, tornozelo, 0.5), b: noOsso(joelho, tornozelo, 0.76), ra: 4.5, rb: 5 },
    { tipo: 'capsula', a: noOsso(joelho, tornozelo, 0.76), b: noOsso(joelho, tornozelo, 0.86), ra: 5, rb: 3.8 },
  ], frente ? C.roxo : C.roxoAtras);
  const v = frente ? C.vincoRoxo : C.vincoRoxoAtras;
  const coxa = (t: number, lado: number) => noOsso(quadril, joelho, t, lado);
  const canela = (t: number, lado: number) => noOsso(joelho, tornozelo, t, lado);
  // o pano junta atrás do joelho num ">" e franze na bolsa
  risco(p, [coxa(0.62, 3.8), coxa(1, 1.6), canela(0.3, 3.4)], v);
  risco(p, [canela(0.6, -3.4), canela(0.76, -1)], v);
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
  const nuca = t(-2.2, corpoDoPicole.tronco + 0.6);
  const costas = t(-10, corpoDoPicole.tronco - 1.6);
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
  // em vez de as duas se juntarem numa fita. O pano é curto como a perna do boneco
  const tras = borda(costas, 34 * embola, -18 - vento * 8 - deita * 0.5 + arrasta, 80, 0);
  const frente = borda(nuca, 30 * embola, -3 - deita + arrasta, 50, 1.3);
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
  // barra, com um fio de luz do lado da frente, de onde vem a luz. Riscos soltos diziam "dobra"
  // mas deixavam o pano chapado.
  for (const s of [0.25, 0.62]) {
    const topo = noOsso(tras[0], frente[0], 0.15 + s * 0.7);
    mancha(p, [topo, naBarra(s - 0.12), naBarra(s + 0.04)], C.dobra);
    risco(p, [noOsso(topo, naBarra(s - 0.04), 0.3), naBarra(s - 0.04)], C.dobraFunda);
    risco(p, [noOsso(topo, naBarra(s + 0.08), 0.4), naBarra(s + 0.08)], C.luzPano);
  }
}

function ombreira(p: Pintor, e: Esqueleto, frente: boolean) {
  const t = (f: number, h: number) => noTronco(e, f, h);
  // em unidades, pelo mesmo motivo da capa: `e.corpo.ombroF` já vem escalado
  const o = frente ? corpoDoPicole.ombroF : corpoDoPicole.ombroT;
  // Almofada redonda EM CIMA do ombro, passando dele para os dois lados: é o que faz o "T" da
  // silhueta. Ela senta um pouco abaixo da gola e recua para trás do ombro: a cabeça grande do
  // boneco mora logo acima, e colada no queixo a almofada lia como um babador branco.
  const s = frente ? 1 : -1;
  const no = (f: number, h: number) => t(o[0] + f * s, o[1] + h - 1.4);
  const pts: P[] = [no(-6, 0.2), no(-4.6, 1.8), no(-0.2, 2.2), no(3.4, 1.5), no(4.8, -0.2), no(4.4, -2.2), no(3, -3.2), no(-5, -2.8), no(-6.2, -1.6)];
  p.peca([{ tipo: 'poligono', pts }], frente ? C.branco : C.brancoAtras);
  // A almofada tem espessura: o terço de baixo é a borda, num tom abaixo e com o vinco em cima.
  // Toda branca, ela lia como uma nuvem debaixo do queixo.
  mancha(p, [no(-6.6, -1), no(5.4, -0.6), no(5.4, -3.6), no(-6.6, -3.6)], frente ? C.dobra : C.brancoAtras.sombra);
  risco(p, [no(-5.8, -1), no(0.8, -0.5), no(4.8, -0.8)], frente ? C.dobraFunda : C.brancoAtras.sombra);
}

function tronco(p: Pintor, e: Esqueleto, pl: Pele, forte: boolean) {
  const t = (f: number, h: number) => noTronco(e, f, h);
  if (forte) {
    // o trapézio do laranja sobe por trás do pescoço: é o ombro de quem ficou maior
    p.peca([{ tipo: 'poligono', pts: [t(-8.4, 11.4), t(-5.2, 15.4), t(0.4, 16.4), t(5.4, 15.6), t(9.2, 12.4), t(0, 10.4)] }], pl.pele);
  }
  // quimono sem manga, curto e largo como o tronco do boneco; o laranja o estica no peito
  const w = forte ? 1.2 : 0;
  p.peca([{
    tipo: 'poligono',
    pts: [t(-7.6 - w, 12), t(-5 - w * 0.6, 15.2 + w * 0.3), t(3.6 + w * 0.5, 15.4 + w * 0.3), t(8.2 + w, 12.4), t(8.4 + w, 7), t(7 + w * 0.6, 1.6), t(-6.2 - w * 0.4, 0.8), t(-7.8 - w, 6)],
  }], C.roxo);
  // o pano desce das axilas e junta na faixa
  risco(p, [t(-5.6 - w, 10.4), t(-4.4, 6.6), t(-3.4, 4.2)], C.vincoRoxo);
  risco(p, [t(6.6 + w, 9.2), t(5.4 + w * 0.5, 5.4)], C.vincoRoxo);
  // o decote em V mostra o peito; a borda dele é o pano do quimono, e não um risco de pele escura
  const decote = forte ? [t(-0.8, 15.8), t(7.4, 15.2), t(3.6, 8.6)] : [t(0.2, 15.4), t(5.6, 15.1), t(3.1, 10.2)];
  p.peca([{ tipo: 'poligono', pts: decote }], { ...pl.pele, faixa: 1, linha: C.vincoRoxo });
  if (forte) risco(p, [t(1.4, 12.6), t(3.2, 11.8), t(5.6, 12.2)], pl.vinco);
}

/**
 * A faixa vem DEPOIS das pernas: é ela que prende o quimono por cima da calça, e o nó na frente
 * ficaria escondido pela coxa. As pontas do nó caem pelo mundo, e o vento as leva para trás.
 */
function faixaDaCintura(p: Pintor, e: Esqueleto, forte: boolean) {
  const k = escalaDe(e);
  const t = (f: number, h: number) => noTronco(e, f, h);
  const w = forte ? 0.8 : 0;
  p.peca([{ tipo: 'poligono', pts: [t(-6.6 - w, 5.4), t(7.4 + w, 6), t(7.4 + w, 1.8), t(-6.4 - w, 0.8)] }], C.faixa);
  risco(p, [t(-6 - w, 3.2), t(1, 3.7), t(7 + w, 3.9)], C.vincoFaixa);
  const vento = Math.max(0, Math.min(1, e.pose.vento ?? 0));
  // as duas pontas se abrem em V: paralelas e grossas, liam como uma alça pendurada
  const ponta = (de: P, comp: number, abre: number): Forma => ({ tipo: 'capsula', a: de, b: soma(de, dir(abre - vento * 55), comp * k), ra: 1.2, rb: 0.9 });
  p.peca([ponta(t(5.4 + w, 2.6), 6, 16), ponta(t(6.4 + w, 2.4), 4.8, -14)], C.faixa);
  p.peca([{ tipo: 'elipse', c: t(6 + w, 3.4), rx: 1.9, ry: 1.8 }], C.faixa);
}

/**
 * Turbante: domo e volta na testa numa peça só — com um risco de contorno entre os dois, ele
 * virava um chapéu de dois andares. No boneco ele é quase do tamanho do rosto, e é metade da
 * cabeça grande. As voltas do pano SOBEM de trás para a frente, com sombra embaixo e brilho em
 * cima: deitadas, paralelas ao chão, faziam do turbante uma pilha de panquecas.
 */
function turbante(p: Pintor, e: Esqueleto, grande: boolean) {
  const h = (f: number, a: number) => naCabeca(e, f, a);
  p.peca([
    { tipo: 'elipse', c: h(-1.6, 11), rx: 9.4, ry: 8.4, ang: e.angCabeca - 12 },
    { tipo: 'poligono', pts: [h(-9.8, 2.6), h(-3, 2.6), h(3.6, 3.2), h(8.6, 4.2), h(9.4, 6.8), h(8.4, 9.6), h(-10.4, 9.4)] },
  ], C.turbante);
  const volta = (baixo: P[], alto: P[]) => {
    mancha(p, [...baixo, ...[...alto].reverse()].map(([f, a]) => h(f, a)), C.dobra);
    risco(p, baixo.map(([f, a]) => h(f, a)), C.dobraFunda);
    if (grande) risco(p, alto.map(([f, a]) => h(f, a + 0.7)), C.luzPano);
  };
  // a borda enrolada na testa: a dobra de cima separa a volta do domo
  volta([[-10, 7.6], [-2, 8.2], [5, 8.6], [9.2, 8]], [[-10, 9], [-2, 9.8], [5, 10], [9, 9.4]]);
  volta([[-10.4, 11.4], [-4, 13.4], [2.6, 17.4]], [[-10.2, 13], [-4, 15], [1.6, 18.6]]);
  if (grande) risco(p, [h(-7, 4), h(0, 4.4), h(7.4, 5.4)], C.dobra);
}

/**
 * O rosto pixel a pixel, com o olho como origem. Na luta (cabeça de ~26 px): sobrancelha grossa
 * descendo para o nariz, e o olho grande de anime — cílio em cima, a íris alta com o brilho
 * branco no alto e o fundo mais claro, o branco atrás dela. A boca pequena de canto caído mora
 * perto do queixo. No retrato do placar (escala 1) o desenho é o mesmo, menor.
 */
function rosto(p: Pintor, e: Esqueleto, pl: Pele, forte: boolean, grande: boolean) {
  const olhos = e.pose.olhos ?? 'abertos';
  const g: Record<number, string> = {};
  if (grande) {
    // o laranja franze a testa careca
    if (forte) { g[4] = '.VVV......'; g[3] = '...VVV....'; }
    g[1] = forte ? 'GGG.......' : '.GG.......';
    g[0] = forte ? '.GGGGG....' : '..GGGG....';
    g[-1] = '....GGGGG.';
    if (olhos === 'abertos') {
      // a quina de fora do cílio desce um pixel: é o traço que faz o olho de anime
      g[-2] = '.KKKKKKKG.';
      g[-3] = 'K.WIIIIIK.';
      g[-4] = '..WIBBIII.';
      g[-5] = '..WIBBIII.';
      g[-6] = '..WIIIII..';
      g[-7] = '..WJJJJI..';
      g[-8] = '...WJJI...';
      g[-9] = '....KKK...';
      g[-10] = '.LL.......';
    } else if (olhos === 'fechados') {
      g[-5] = '.KKKKKKK..';
      g[-4] = 'K.........';
      g[-6] = '..LLLL....';
    } else {
      g[-3] = '..K...K...';
      g[-4] = '...K.K....';
      g[-5] = '....K.....';
      g[-6] = '...K.K....';
      g[-7] = '..K...K...';
    }
    if (e.pose.grito) { g[-10] = '...KKKK...'; g[-11] = '...KDDDK..'; g[-12] = '...KRRK...'; g[-13] = '....KK....'; }
    else { g[-11] = '...MMMM...'; g[-12] = '..M.......'; }
  } else {
    g[1] = forte ? 'GGG....' : '.GG....';
    g[0] = '...GGG.';
    if (olhos === 'abertos') { g[-1] = '..KKKK.'; g[-2] = '..WIBK.'; g[-3] = '..WII..'; g[-4] = '...J...'; }
    else if (olhos === 'fechados') g[-2] = '..KKKK.';
    else { g[-1] = '..K.K..'; g[-2] = '...K...'; g[-3] = '..K.K..'; }
    if (e.pose.grito) { g[-6] = '...KD..'; g[-7] = '...KK..'; } else g[-6] = '...MM..';
  }
  const cores = {
    K: pl.cilio, G: pl.sobrancelha, W: pl.esclera, I: pl.iris, J: pl.irisBaixo, B: pl.brilho, V: pl.vinco, L: pl.luz,
    M: pl.boca, D: C.dente, R: C.goela,
  };
  grade(p, e, grande ? naCabeca(e, 3.6, 1) : naCabeca(e, 3.4, -0.2), g, cores);
}

function cabeca(p: Pintor, e: Esqueleto, pl: Pele, forte: boolean) {
  const h = (f: number, a: number) => naCabeca(e, f, a);
  const grande = escalaDe(e) >= 1.25;
  p.peca([{ tipo: 'capsula', a: e.pescoco, b: h(-0.8, -5), ra: forte ? 4 : 3.2, rb: forte ? 3.8 : 3 }], pl.pele);
  // rosto de boneco: o crânio redondo e um queixo pequeno na frente; careca, ganha o alto inteiro
  const formas: Forma[] = [
    { tipo: 'elipse', c: h(-0.6, 0.8), rx: 8.2, ry: 8.2 },
    { tipo: 'poligono', pts: [h(-6, -2), h(-3.6, -6.6), h(0.4, -8.6), h(4.2, -8.6), h(6.9, -6.4), h(8.3, -3.2), h(8.7, -0.6), h(8, 2.6), h(3.6, 4.2)] },
  ];
  if (forte) formas.push({ tipo: 'elipse', c: h(-1, 3.2), rx: 8.6, ry: 8.4, ang: e.angCabeca - 8 });
  p.peca(formas, pl.pele);
  if (!forte) turbante(p, e, grande);
  // as antenas saem da testa (furando o turbante, no verde), se abrem e terminam num botão
  const antena = (pts: P[], pele: Tinta) => p.peca([
    { tipo: 'capsula', a: h(...pts[0]), b: h(...pts[1]), ra: forte ? 1 : 0.85, rb: 0.75 },
    { tipo: 'capsula', a: h(...pts[1]), b: h(...pts[2]), ra: 0.75, rb: 0.65 },
    { tipo: 'elipse', c: h(...pts[2]), rx: 1.1, ry: 1.1 },
  ], { ...pele, faixa: 1 });
  if (forte) {
    // careca, as antenas crescem da testa até a altura em que o turbante as deixava
    antena([[1.4, 9], [1.8, 15.8], [4.6, 20.4]], pl.pele);
    antena([[4.6, 8], [7.6, 13.8], [10.8, 16.4]], pl.pele);
  } else {
    antena([[1.4, 17.2], [1.2, 21.8], [3.8, 25]], pl.peleAtras);
    antena([[5, 14.8], [6.4, 19.6], [9.4, 22]], pl.pele);
  }
  // orelha pontuda e grande, para trás e para cima; o risco de dentro é o que a faz orelha e não chifre
  p.peca([{ tipo: 'poligono', pts: [h(-5.4, 2.4), h(-9, 4.4), h(-14.6, 7), h(-10.6, 0.2), h(-7.4, -3.4), h(-5, -2)] }], { ...pl.pele, faixa: 1 });
  risco(p, [h(-6.6, 0), h(-10, 3), h(-12.8, 5.6)], pl.vinco);
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
    quadril: [-1, -20.5], tronco: 8, cabeca: -6,
    pernaF: { alvo: [11, -3] }, pernaT: { alvo: [-10, -3] },
    bracoF: { alvo: [19, -30] }, bracoT: { alvo: [10, -29] },
  },
  especial: {
    quadril: [-2, -19.5], tronco: 2, cabeca: -2,
    pernaF: { alvo: [13, -3] }, pernaT: { alvo: [-13, -3] },
    // o cotovelo sai para a frente e o antebraço volta até a testa: pelo alvo, o cotovelo dobrava
    // para baixo e a mão tapava o olho. A de trás fica escondida atrás do tronco: solta, ela
    // cruzava a capa e sujava a silhueta
    bracoF: { ang: [85, 125] }, bracoT: { alvo: [3, -27] },
    dedosF: true, grito: true, vento: 0.6,
  },
  vitoria: {
    quadril: [0, -21.5], tronco: -2, cabeca: 4,
    pernaF: { alvo: [8, -3] }, pernaT: { alvo: [-7, -3] },
    // braços cruzados: o antebraço da frente deitado sobre o peito, a mão de trás aparecendo na frente
    bracoF: { ang: [30, -120] }, bracoT: { ang: [25, 110] },
    olhos: 'fechados', vento: 0.4,
  },
};

/**
 * O segundo tempo do Picolé Espiral: o braço estendido com os dois dedos apontando, e a capa
 * levada pelo tranco. A vitrine mostra a carga (os dedos na testa), que é o gesto que ninguém mais
 * faz; esta é a pose de onde o disparo sai.
 */
export const disparoDoEspecial: PoseDoPicole = {
  quadril: [-3, -19.5], tronco: 10, cabeca: -6,
  pernaF: { alvo: [15, -3] }, pernaT: { alvo: [-15, -3] },
  bracoF: { alvo: [30, -34] }, bracoT: { alvo: [12, -27] },
  dedosF: true, maoT: 'aberta', grito: true, vento: 1,
};

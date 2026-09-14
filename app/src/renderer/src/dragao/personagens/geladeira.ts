/**
 * Geladeira — o tirano do espaço, branco e roxo, que sorri de canto enquanto manda congelar o
 * planeta dos outros. Esguia e um pouco mais baixa que o Goiaba; quem marca a silhueta é o RABO,
 * grosso na base e fino na ponta, fazendo curva atrás do corpo. O especial é o Raio Congelante,
 * um risco fino que sai da ponta do dedo.
 *
 * Não há roupa: o corpo é uma bio-armadura branca e lisa, e as placas roxas (domo da cabeça,
 * ombros, antebraços e canelas) são peças à parte, com contorno próprio — é o risco escuro que
 * faz a placa parecer encaixada no corpo e não pintada nele.
 *
 * A transformação é a Geladeira Dourada: o branco vira ouro polido e as placas continuam roxas,
 * mais vivas. Muda só a PALETA — o desenho é um só, então toda pose da forma normal já sai
 * dourada, e o rosto continua sendo o mesmo rosto.
 *
 * Detalhe de um pixel (olho, boca, brilho) é desenhado para a escala em que sai: na luta a cabeça
 * tem uns 18 pixels e cabe olho com branco, íris e pálpebra; no retrato do placar (escala 1) tem
 * 12, e ali vale o olho de três pixels.
 */
import { type Cor, cor, ler, linha, misturar, pixel } from '../quadro.ts';
import {
  type Corpo, type Esqueleto, type Personagem, type Pintor, type Pose, dir, formaDoPe, medidasDoSprite, naCabeca,
  noOsso, noTronco, soma, tinta,
} from '../boneco.ts';
import type { Forma, P, Tinta } from '../raster.ts';

type Paleta = {
  pele: Tinta;
  peleAtras: Tinta;
  placa: Tinta;
  placaAtras: Tinta;
  /** O brilho forte das placas: é o que as faz parecer vidradas. */
  reflexo: Cor;
  /** O reflexo do corpo liso. */
  lustro: Cor;
  olho: Cor;
  esclera: Cor;
  vermelho: Cor;
  pupila: Cor;
  marca: Cor;
  boca: Cor;
};

// A sombra do branco puxa para o lilás frio: sombra cinza deixava o corpo com cara de gesso. Frio,
// mas pouco saturado: a segunda cor gira o matiz de tudo o que tem cor, e o branco tem de ficar.
const NORMAL: Paleta = {
  pele: tinta(cor('#f1eef8'), cor('#a9a2cf'), cor('#1b1022'), cor('#ffffff'), 2),
  peleAtras: tinta(cor('#b7afd3'), cor('#8a80ab'), cor('#1b1022'), undefined, 2),
  placa: tinta(cor('#9038cc'), cor('#5c1c8e'), cor('#1b1022'), cor('#cf86f6'), 2),
  placaAtras: tinta(cor('#5c1c8e'), cor('#3e1164'), cor('#1b1022'), undefined, 2),
  reflexo: cor('#f8e8ff'),
  lustro: cor('#ffffff'),
  olho: cor('#1b1022'),
  esclera: cor('#ffffff'),
  vermelho: cor('#e0263e'),
  pupila: cor('#5e0818'),
  marca: cor('#8430c0'),
  boca: cor('#3a1a52'),
};

// Ouro e não amarelo: o que faz metal é o salto grande entre o brilho quase branco e a sombra
// alaranjada, e o contorno marrom — preto em volta de amarelo vira abelha.
const DOURADA: Paleta = {
  pele: tinta(cor('#ffcf3a'), cor('#c98a0e'), cor('#3a1d06'), cor('#fff4b8'), 2),
  peleAtras: tinta(cor('#d99a1e'), cor('#94600b'), cor('#3a1d06'), undefined, 2),
  placa: tinta(cor('#a83ff2'), cor('#6716ae'), cor('#2a0b3c'), cor('#e3a6ff'), 2),
  placaAtras: tinta(cor('#6716ae'), cor('#460d7a'), cor('#2a0b3c'), undefined, 2),
  reflexo: cor('#ffffff'),
  lustro: cor('#fffbe8'),
  olho: cor('#2a1206'),
  esclera: cor('#fffbea'),
  vermelho: cor('#e0263e'),
  pupila: cor('#5e0818'),
  marca: cor('#8a28cc'),
  boca: cor('#551270'),
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

const RAD = Math.PI / 180;
/**
 * A escala do desenho em curso, lida do esqueleto (o corpo dele já vem multiplicado). Os
 * ajudantes do boneco escalam pontos e raios sozinhos; é medida escrita aqui — passo do rabo,
 * dedo, deslocamento — que precisa dela, e foi sem ela que o rabo encolheu na escala da luta.
 */
const escalaDe = (e: Esqueleto) => e.corpo.tronco / corpoDaGeladeira.tronco;
/** Da escala da luta para cima cabe detalhe de verdade; abaixo, só o essencial. */
const GRANDE = 1.25;

const unit = (a: P, b: P): P => {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
};
/** O ângulo de tela (graus, 0 para a direita) de `a` para `b`: é o que a elipse do raster entende. */
const grausDe = (a: P, b: P) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
const girar = ([x, y]: P, grau: number): P => {
  const r = grau * RAD;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
};

/** Os pixels de uma linha quebrada, sem repetir nenhum (tingir duas vezes escureceria o encontro). */
function tracado(pts: P[]): [number, number][] {
  const vistos = new Set<number>();
  const saida: [number, number][] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
    for (let j = 0; j <= n; j++) {
      const x = Math.floor(ax + ((bx - ax) * j) / n), y = Math.floor(ay + ((by - ay) * j) / n);
      if (!vistos.has(y * 4096 + x)) { vistos.add(y * 4096 + x); saida.push([x, y]); }
    }
  }
  return saida;
}

/**
 * Um risco só DENTRO da peça que acabou de ser pintada (a máscara ainda é dela): detalhe que vaza
 * vira sujeira no contorno. Com `forca` abaixo de 1 ele tinge o que já está lá, e a luz e a
 * sombra da peça continuam aparecendo por baixo.
 */
function riscar(p: Pintor, pts: P[], c: Cor, forca = 1) {
  for (const [x, y] of tracado(pts)) {
    if (p.m.tem(x, y)) pixel(p.q, x, y, forca >= 1 ? c : misturar(ler(p.q, x, y), c, forca));
  }
}

/**
 * O brilho de uma placa: um pixel no retrato; na luta, dois claros e a meia-luz em volta. Placa
 * sem ele fica fosca como borracha, e é o brilho que diz "casco".
 */
function brilho(p: Pintor, pt: P, k: number, pal: Paleta, fraco = false) {
  const x = Math.floor(pt[0]), y = Math.floor(pt[1]);
  const luz = pal.placa.luz ?? pal.reflexo;
  const forte = fraco ? luz : pal.reflexo;
  const meia = fraco ? pal.placa.base : luz;
  const pontos: [number, number, Cor][] = k >= GRANDE
    ? [[x, y, forte], [x + 1, y, forte], [x - 1, y + 1, meia], [x, y + 1, meia], [x + 2, y, meia]]
    : [[x, y, forte]];
  for (const [a, b, c] of pontos) if (p.m.tem(a, b)) pixel(p.q, a, b, c);
}

/**
 * O rabo é uma corrente de cápsulas que afina, e a curva é UMA conta ao longo do comprimento
 * (dobra mais perto da ponta, como chicote) em vez de um ângulo fixo por gomo — era o degrau entre
 * um gomo e outro que tirava a suavidade. Nasce para trás e para baixo, desce quase até o chão e
 * sobe no gancho, que é o que se lê a 1x.
 */
function rabo(p: Pintor, e: Esqueleto, pal: Paleta) {
  const k = escalaDe(e);
  const vento = e.pose.vento ?? 0;
  // `vento` positivo levanta a raiz e enrola a ponta por cima (escorpião); negativo solta o rabo
  // para trás, mais reto
  const sobe = Math.max(vento, 0), solta = Math.max(-vento, 0);
  const inclinacao = e.pose.tronco;
  let ang: number, curva: number;
  if (Math.abs(inclinacao) >= 70) {
    // Deitado, o rabo sai por baixo do quadril e fica largado no chão ao longo das pernas, com a
    // ponta mal levantada. Enrolando para o lado das costas, como em pé, ele corria rente ao chão
    // por trás da cabeça e saía do outro lado como uma vara; com a ponta erguida, virava um chifre.
    const lado = inclinacao < 0 ? 1 : -1;
    ang = 90 * lado;
    curva = 22 * lado;
  } else {
    // O tronco gira a raiz só pela metade: por inteiro, num soco inclinado o rabo apontaria para o
    // céu, e jogado para trás (voando) ele passaria por dentro das costas.
    ang = Math.min(Math.max(-30 - 22 * sobe - 38 * solta - inclinacao * 0.5, -100), -8);
    curva = -150 - 40 * sobe + 80 * solta;
  }
  const N = 22;
  const passo = (46 / N) * k;
  const chao = medidasDoSprite(k).ancoraY;
  const raio = (s: number) => 0.5 + 3.9 * Math.pow(1 - s, 1.2);
  let ponto = noTronco(e, -3.2, 3.2);
  ponto = [ponto[0], Math.min(ponto[1], chao - raio(0) * k)];
  const formas: Forma[] = [];
  const eixo: { c: P; d: P; r: number }[] = [];
  for (let i = 0; i < N; i++) {
    const s0 = i / N, s1 = (i + 1) / N;
    ang += curva * (0.6 * (s1 - s0) + 0.4 * (s1 * s1 - s0 * s0));
    let d = dir(ang);
    const r = raio(s1) * k;
    // o chão segura o rabo: em vez de atravessá-lo, ele deita e segue rente até o gancho subir
    if (d[1] > 0 && ponto[1] + d[1] * passo + r > chao) {
      ang = d[0] < 0 ? -90 : 90;
      d = dir(ang);
    }
    const prox = soma(ponto, d, passo);
    formas.push({ tipo: 'capsula', a: ponto, b: prox, ra: raio(s0), rb: raio(s1) });
    eixo.push({ c: prox, d, r });
    ponto = prox;
  }
  p.peca(formas, pal.pele);
  if (k < GRANDE) return;
  // Anéis sutis na metade grossa: um risco atravessado que TINGE o que está pintado (a luz e a
  // sombra do rabo continuam por baixo), com o meio puxado para a ponta, como aro de cilindro.
  for (const i of [4, 6, 8, 10, 12]) {
    const { c, d, r } = eixo[i];
    const n: P = [-d[1], d[0]];
    riscar(p, [soma(c, n, r), soma(c, d, 0.8), soma(c, n, -r)], pal.pele.sombra, 0.4);
  }
}

function mao(p: Pintor, cot: P, pulso: P, aberta: boolean, apontar: boolean, pele: Tinta, k: number) {
  const d = unit(cot, pulso);
  const n: P = [-d[1], d[0]];
  const centro = soma(pulso, d, 1.2 * k);
  const formas: Forma[] = [];
  if (aberta) {
    // Três dedos em leque, palma curta e dedos compridos: é a garra. Abertos o bastante para o vão
    // entre eles virar risco de contorno — em leque fechado os três colavam num remo.
    formas.push({ tipo: 'elipse', c: centro, rx: 2.3, ry: 2.1 });
    const base = soma(centro, d, k);
    for (const g of [-40, 0, 40]) {
      formas.push({ tipo: 'capsula', a: base, b: soma(base, girar(d, g), 3.9 * k), ra: 0.85, rb: 0.55 });
    }
  } else {
    // o punho é mais alto que comprido: são os três dedos dobrados, empilhados
    formas.push({ tipo: 'elipse', c: centro, rx: 2.3, ry: 2.7, ang: grausDe(cot, pulso) });
  }
  p.peca(formas, pele);
  if (!aberta && k >= GRANDE) {
    // os dois vãos entre os dedos dobrados, só na frente do punho e no tom da sombra
    for (const o of [-0.95, 0.95]) {
      const a = soma(centro, n, o * k);
      riscar(p, [soma(a, d, 0.4 * k), soma(a, d, 2.4 * k)], pele.sombra);
    }
  }
  if (apontar) {
    // O indicador vai numa peça à parte e fino (um pixel e o contorno): na mesma peça do punho, ele
    // virava um cone e ninguém lia dedo nenhum. Sai do dedo de cima, não do meio do punho.
    const base = soma(soma(centro, d, 1.6 * k), n, -0.9 * k);
    p.peca([{ tipo: 'capsula', a: base, b: soma(base, d, 4.2 * k), ra: 0.6, rb: 0.5 }], pele);
  }
}

function braco(p: Pintor, e: Esqueleto, frente: boolean, pal: Paleta) {
  const k = escalaDe(e);
  const ombro = frente ? e.ombroF : e.ombroT;
  const cot = frente ? e.cotoveloF : e.cotoveloT;
  const pulso = frente ? e.maoF : e.maoT;
  const pele = frente ? pal.pele : pal.peleAtras;
  const placa = frente ? pal.placa : pal.placaAtras;
  p.peca([
    { tipo: 'capsula', a: ombro, b: noOsso(ombro, cot, 0.55), ra: 3.4, rb: 2.9 },
    { tipo: 'capsula', a: noOsso(ombro, cot, 0.55), b: cot, ra: 2.9, rb: 2.3 },
    { tipo: 'capsula', a: cot, b: noOsso(cot, pulso, 0.4), ra: 2.4, rb: 2.8 },
    { tipo: 'capsula', a: noOsso(cot, pulso, 0.4), b: pulso, ra: 2.8, rb: 2 },
  ], pele);
  // placa do antebraço: uma oval por cima do osso, mais curta que ele — tubo inteiro viraria luva
  p.peca([{ tipo: 'elipse', c: noOsso(cot, pulso, 0.42, -0.5), rx: 3.4, ry: 2.1, ang: grausDe(cot, pulso) }], placa);
  brilho(p, noOsso(cot, pulso, 0.3, -1.1), k, pal, !frente);
  const pose = e.pose as PoseDaGeladeira;
  const aberta = (frente ? pose.maoF : pose.maoT) === 'aberta';
  mao(p, cot, pulso, aberta, frente && !!pose.apontar, pele, k);
  // ombreira: um domo em cima do ombro, com o brilho no alto e à frente, de onde vem a luz
  const c = noOsso(ombro, cot, 0.05);
  p.peca([{ tipo: 'elipse', c, rx: 3.7, ry: 3.5 }], placa);
  brilho(p, soma(c, [0.9 * k, -2 * k]), k, pal, !frente);
}

function perna(p: Pintor, e: Esqueleto, frente: boolean, pal: Paleta) {
  const k = escalaDe(e);
  const quadril = frente ? e.quadrilF : e.quadrilT;
  const joelho = frente ? e.joelhoF : e.joelhoT;
  const tornozelo = frente ? e.tornozeloF : e.tornozeloT;
  const pele = frente ? pal.pele : pal.peleAtras;
  const placa = frente ? pal.placa : pal.placaAtras;
  const angPe = (frente ? e.pose.peF : e.pose.peT) ?? 0;
  // o mesmo referencial do `formaDoPe`: x para a ponta, y para baixo até a sola — escalado como
  // ele, senão os dedos ficavam dentro do pé na escala da luta
  const a = angPe * RAD;
  const f: P = [Math.cos(a), -Math.sin(a)];
  const up: P = [Math.sin(a), Math.cos(a)];
  const naSola = (x: number, y: number): P =>
    [tornozelo[0] + (f[0] * x - up[0] * y) * k, tornozelo[1] + (f[1] * x - up[1] * y) * k];
  // A perna e o pé numa peça só, sem risco no tornozelo, como pele contínua. Os três dedos vão
  // nela também, com as pontas em alturas e comprimentos diferentes: a frente do pé vira uma
  // garra em degraus. Dedo com contorno próprio foi tentado e, com um pé de
  // três pixels de altura, os riscos entre eles faziam um borrão escuro no lugar do pé.
  const dedo = (y: number, ponta: number): Forma =>
    ({ tipo: 'capsula', a: naSola(1, y), b: naSola(ponta, y + 0.3), ra: 1.05, rb: 0.55 });
  p.peca([
    { tipo: 'capsula', a: quadril, b: joelho, ra: 4.5, rb: 3.1 },
    { tipo: 'capsula', a: joelho, b: noOsso(joelho, tornozelo, 0.4), ra: 3.1, rb: 3.1 },
    { tipo: 'capsula', a: noOsso(joelho, tornozelo, 0.4), b: tornozelo, ra: 3.1, rb: 1.9 },
    formaDoPe(tornozelo, 3.5, 2.8, angPe),
    dedo(0.2, 5.6), dedo(1.25, 7.4), dedo(2.2, 6.3),
  ], pele);
  // o vão entre os dedos, só na ponta e na cor da sombra: risco escuro ali pesaria o pé inteiro
  riscar(p, [naSola(4.4, 0.75), naSola(6, 0.8)], pele.sombra);
  riscar(p, [naSola(4.8, 1.8), naSola(6.4, 1.85)], pele.sombra);
  // placa da canela: oval na frente da canela, e o tornozelo continua branco — senão vira bota
  p.peca([{ tipo: 'elipse', c: noOsso(joelho, tornozelo, 0.5, -0.7), rx: 4.6, ry: 2.3, ang: grausDe(joelho, tornozelo) }], placa);
  brilho(p, noOsso(joelho, tornozelo, 0.36, -1.5), k, pal, !frente);
}

function tronco(p: Pintor, e: Esqueleto, pal: Paleta) {
  const k = escalaDe(e);
  const t = (f: number, h: number) => noTronco(e, f, h);
  // pescoço fino, que a cabeça tapa quase inteiro
  p.peca([{ tipo: 'capsula', a: t(0.5, 15), b: noOsso(e.pescoco, e.cabeca, 0.6), ra: 2.4, rb: 2.2 }], pal.pele);
  // peito largo em cima, cintura fina: o V do tirano
  p.peca([{
    tipo: 'poligono',
    pts: [t(-7, 15.5), t(-5, 19), t(3.5, 19.5), t(8.2, 16.5), t(8.2, 11.5), t(5, 7), t(5.8, 2.5), t(3.4, -1.5), t(-4.6, -1.5), t(-6.4, 2.5), t(-5, 7.5), t(-7.2, 11.5)],
  }], pal.pele);
  // O risco embaixo do peitoral e o do meio da barriga, na cor da sombra e não do contorno: a
  // bio-armadura é lisa, e risco escuro ali viraria costura de roupa. O do peito fica abaixo da
  // ombreira da frente, que tapa tudo o que estiver acima da altura 12.
  const s = pal.pele.sombra;
  const traco = (pts: P[]) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = t(...pts[i]), b = t(...pts[i + 1]);
      linha(p.q, a[0], a[1], b[0], b[1], s);
    }
  };
  traco([[-1.5, 11.2], [2, 10], [5.8, 10.4]]);
  traco([[2.6, 8.2], [3, 4.6]]);
  // O lustro: um fio claro por dentro da borda iluminada do peito e da barriga. A luz da borda
  // sozinha diz "volume"; o fio de dentro é o que diz "liso e polido".
  if (k >= GRANDE) riscar(p, [t(6.2, 13.8), t(5.9, 11.2)], pal.lustro);
  if (k >= GRANDE) riscar(p, [t(3.9, 3.4), t(4.1, 5.6)], pal.lustro, 0.7);
}

/** Um desenho de pixels: o canto de cima e de trás, em pixels a partir do centro da cabeça, e a grade. */
type Carimbo = [P, string[]];
type Rosto = Record<'abertos' | 'fechados' | 'nocaute' | 'marca' | 'boca' | 'grito', Carimbo>;

/**
 * Na luta, [para a frente, para baixo] a partir do centro da cabeça. K pálpebra, W branco do olho,
 * R íris, P pupila, S sombra da pele, M marca, B boca.
 */
const ROSTO_GRANDE: Rosto = {
  // A pálpebra de cima é pesada e desce para a frente: é ela o desdém, e faz as vezes da
  // sobrancelha. A de baixo vai no tom da sombra da pele — o olho inteiro contornado de preto
  // ficava assustado, e não ameaçador. A pupila fica na frente: ele olha para quem apanha.
  abertos: [[1, -4], ['KK.....', '.KKKKK.', '..WRRPK', '..SWRK.', '...SS..']],
  fechados: [[1, -3], ['KK.....', '.KKKKK.', '.....K.']],
  nocaute: [[3, -4], ['K.K', '.K.', 'K.K']],
  // a marca desce da pálpebra de baixo pela maçã do rosto; mais comprida, encostava no canto da
  // boca e virava um risco só do olho ao riso
  marca: [[3, 1], ['.M', 'M.']],
  // o riso de canto: reta na frente, e o canto de trás sobe um pixel
  boca: [[2, 4], ['B....', '.BBBB']],
  // aberta, com o fundo escuro atrás e o vermelho na frente
  grito: [[2, 3], ['.BBBB', 'BPRRB', '.BRB.', '..B..']],
};
/** No retrato (escala 1), o rosto de três pixels, que é o que cabe numa cabeça de 12. */
const ROSTO_PEQUENO: Rosto = {
  // olho um pixel acima do meio e marca de um pixel só: numa cabeça de 12, marca de dois encostava
  // no canto da boca
  abertos: [[1, -2], ['K..', '.KK', '.RR']],
  fechados: [[1, -1], ['K..', '.KK']],
  nocaute: [[2, -1], ['K.K', '.K.', 'K.K']],
  marca: [[1, 1], ['M']],
  boca: [[1, 3], ['B..', '.BB']],
  // aberta para CIMA: o queixo é fino, e uma boca que descesse cairia fora do rosto
  grito: [[2, 3], ['KK', 'RB']],
};

/**
 * Carimba uma grade de pixels presa à cabeça. A grade GIRA com ela — cada pixel da tela procura a
 * letra que cai nele, então girar não abre buraco —, porque olho desenhado reto numa cabeça
 * deitada (caído, voando) sai do rosto. Só pinta dentro da última peça, que é a cabeça.
 */
function carimbo(p: Pintor, e: Esqueleto, k: number, [em, grade]: Carimbo, cores: Record<string, Cor>) {
  const o = naCabeca(e, em[0] / k, -em[1] / k);
  const t = e.angCabeca * RAD;
  const F: P = [Math.cos(t), Math.sin(t)], D: P = [-Math.sin(t), Math.cos(t)];
  const alt = grade.length, larg = Math.max(...grade.map((l) => l.length));
  const xs: number[] = [], ys: number[] = [];
  for (const [c, r] of [[0, 0], [larg, 0], [0, alt], [larg, alt]]) {
    xs.push(o[0] + F[0] * c + D[0] * r); ys.push(o[1] + F[1] * c + D[1] * r);
  }
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      if (!p.m.tem(x, y)) continue;
      const dx = x + 0.5 - o[0], dy = y + 0.5 - o[1];
      const letra = grade[Math.floor(dx * D[0] + dy * D[1])]?.[Math.floor(dx * F[0] + dy * F[1])];
      const c = letra === undefined ? undefined : cores[letra];
      if (c !== undefined) pixel(p.q, x, y, c);
    }
  }
}

function cabeca(p: Pintor, e: Esqueleto, pal: Paleta) {
  const k = escalaDe(e);
  const h = (f: number, a: number) => naCabeca(e, f, a);
  // O crânio é redondo e maior que o rosto: a cabeça pequena num pescoço fino lia como um ovo num
  // palito, e o domo não tinha onde assentar.
  const cx = -0.6, cy = 2.6, rx = 6, ry = 7.2;
  p.peca([
    { tipo: 'elipse', c: h(cx, cy), rx, ry, ang: e.angCabeca },
    { tipo: 'poligono', pts: [h(-3.4, -2), h(4, -1.4), h(4.4, -3.9), h(2.3, -6.6), h(-1.4, -5.8)] },
  ], pal.pele);
  // o rosto vai logo depois do crânio, enquanto a máscara ainda é dele
  const r = k >= GRANDE ? ROSTO_GRANDE : ROSTO_PEQUENO;
  const cores: Record<string, Cor> = {
    K: pal.olho, W: pal.esclera, R: pal.vermelho, P: pal.pupila, S: pal.pele.sombra, M: pal.marca, B: pal.boca,
  };
  carimbo(p, e, k, r[e.pose.olhos ?? 'abertos'], cores);
  carimbo(p, e, k, r.marca, cores);
  carimbo(p, e, k, e.pose.grito ? r.grito : r.boca, cores);
  // O domo roxo segue a curva do crânio por fora e desce pela nuca, com a testa e o lado do rosto
  // brancos. Era uma elipse própria por cima da cabeça, e passando da borda dela lia como boina;
  // cobrindo tudo, como capacete. A borda de fora coincide com a do crânio (4% a mais, para o
  // contorno das duas peças cair no mesmo pixel e não dobrar de espessura).
  const noCranio = (grau: number, r = 1.04): P => [cx + Math.cos(grau * RAD) * rx * r, cy + Math.sin(grau * RAD) * ry * r];
  const borda: P[] = [];
  for (let g = 48; g < 200; g += 12) borda.push(noCranio(g));
  borda.push(noCranio(200));
  // a borda de dentro, da nuca à testa, cede um pouco no meio: reta, parecia touca de natação
  const dentro: P[] = [[-4.6, 2.6], [-1.8, 4.3], [1.4, 5.7]];
  p.peca([{ tipo: 'poligono', pts: [...borda, ...dentro].map(([f, a]) => h(f, a)) }], pal.placa);
  // O brilho do domo: um arco curto no alto e à frente, seguindo a curva, e uma faísca solta
  // atrás dele. Mancha redonda ali lia como furo; o arco é o que diz "cúpula de vidro".
  const noDomo = (grau: number, r: number) => h(...noCranio(grau, r));
  if (k >= GRANDE) {
    riscar(p, [noDomo(56, 0.8), noDomo(74, 0.84), noDomo(94, 0.82)], pal.reflexo);
    riscar(p, [noDomo(104, 0.8), noDomo(112, 0.77)], pal.placa.luz ?? pal.reflexo);
    riscar(p, [noDomo(70, 0.6)], pal.placa.luz ?? pal.reflexo);
  } else {
    riscar(p, [noDomo(70, 0.78), noDomo(84, 0.8)], pal.reflexo);
  }
}

export const geladeira: Personagem = {
  id: 'geladeira',
  nome: 'Geladeira',
  corpo: corpoDaGeladeira,
  desenhar(p, e) {
    const pal = e.pose.forma === 1 ? DOURADA : NORMAL;
    rabo(p, e, pal);
    braco(p, e, false, pal);
    perna(p, e, false, pal);
    tronco(p, e, pal);
    perna(p, e, true, pal);
    cabeca(p, e, pal);
    braco(p, e, true, pal);
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

/**
 * Geladeira — o tirano do espaço, branco e roxo, que sorri de canto enquanto manda congelar o
 * planeta dos outros. Desenhada em proporção de chibi, como a arte que o dono mandou: a cabeça é
 * uns 40% da altura, o tronco é curto e as pernas, curtas e grossas, com mão e pé robustos. Fora a
 * cabeça, quem marca a silhueta é o RABO, grosso na base e fino na ponta, fazendo curva atrás do
 * corpo. O especial é o Raio Congelante, um risco fino que sai da ponta do dedo.
 *
 * Não há roupa: o corpo é uma bio-armadura branca e lisa, e as placas roxas (domo da cabeça,
 * ombros, antebraços e canelas) são peças à parte, com contorno próprio.
 *
 * Nenhum contorno é preto. Cada peça se fecha num tom bem escuro puxado dela mesma — lilás no
 * branco, roxo nas placas, marrom no ouro —, a sombra gira o matiz para o frio e a luz puxa para o
 * amarelo, e a passagem entre elas é pontilhada. É isso, mais que o desenho, que dá o acabamento
 * pintado da referência: contorno preto em volta de corpo branco vira desenho de colorir.
 *
 * A transformação é a Geladeira Dourada: o branco vira ouro polido e as placas continuam roxas,
 * mais vivas. Muda só a PALETA — o desenho é um só, então toda pose da forma normal já sai
 * dourada, e o rosto continua sendo o mesmo rosto.
 *
 * Detalhe de um pixel (olho, boca, brilho) é desenhado para a escala em que sai: na luta a cabeça
 * tem uns 39 pixels e cabe o olho grande de anime, com pálpebra, íris em dois tons, pupila e
 * brilho; no retrato do placar (escala 1) tem 26, e ali vale um olho de cinco.
 */
import { type Cor, cor, ler, misturar, pixel } from '../quadro.ts';
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
  /** Pálpebra e cílio: o tom mais escuro do rosto, e ainda assim não é preto. */
  olho: Cor;
  esclera: Cor;
  vermelho: Cor;
  /** A metade de cima da íris, na sombra da pálpebra: é o que dá o olhar pesado. */
  irisFunda: Cor;
  pupila: Cor;
  marca: Cor;
  boca: Cor;
};

/** As peças grandes levam a passagem de luz e sombra em xadrez, como a arte da referência. */
const pintada = (t: Tinta): Tinta => ({ ...t, pontilhado: true });

// A sombra do branco puxa para o lilás frio e a luz para o creme: sombra cinza deixava o corpo com
// cara de gesso, e luz branca pura sumia no branco da base.
const NORMAL: Paleta = {
  pele: pintada(tinta(cor('#f3eff9'), cor('#aaa0d6'), cor('#45365f'), cor('#fffbe8'), 2)),
  peleAtras: pintada(tinta(cor('#c3badf'), cor('#8b80b9'), cor('#3b2d54'), undefined, 2)),
  placa: pintada(tinta(cor('#8f3bcf'), cor('#50239a'), cor('#2c104c'), cor('#e6a8f2'), 2)),
  placaAtras: pintada(tinta(cor('#6d31b1'), cor('#46228f'), cor('#271044'), undefined, 2)),
  reflexo: cor('#fff4fb'),
  lustro: cor('#ffffff'),
  olho: cor('#2c0f36'),
  esclera: cor('#ffffff'),
  vermelho: cor('#ee2b48'),
  irisFunda: cor('#95102f'),
  pupila: cor('#4e0620'),
  marca: cor('#8a3acb'),
  boca: cor('#4a2463'),
};

// Ouro e não amarelo: o que faz metal é o salto grande entre o brilho quase branco e a sombra
// alaranjada. O contorno é marrom — preto em volta de amarelo vira abelha.
const DOURADA: Paleta = {
  pele: pintada(tinta(cor('#f8c63c'), cor('#c2701f'), cor('#4f2609'), cor('#fff6b6'), 2)),
  peleAtras: pintada(tinta(cor('#d49326'), cor('#955216'), cor('#402008'), undefined, 2)),
  placa: pintada(tinta(cor('#b24cf5'), cor('#6a25c4'), cor('#32104f'), cor('#f4c8ff'), 2)),
  placaAtras: pintada(tinta(cor('#7a2dc2'), cor('#511a98'), cor('#2a0d45'), undefined, 2)),
  reflexo: cor('#ffffff'),
  lustro: cor('#fffbe8'),
  olho: cor('#3a1508'),
  esclera: cor('#fffbea'),
  vermelho: cor('#ee2b48'),
  irisFunda: cor('#95102f'),
  pupila: cor('#4e0620'),
  marca: cor('#8a28cc'),
  boca: cor('#5a1a70'),
};

// A cabeça é medida a partir do CENTRO do crânio (o pescoço vai até ele), e o queixo fica logo
// acima da base do pescoço: no chibi a cabeça senta nos ombros.
export const corpoDaGeladeira: Corpo = {
  tronco: 14,
  pescoco: 12,
  bracoSup: 8.5,
  antebraco: 8.5,
  coxa: 10,
  canela: 10,
  ombroF: [4.2, 10.5],
  ombroT: [-4.2, 11.5],
  quadrilF: [2.6, 0],
  quadrilT: [-2.8, 0.3],
};

/** O crânio, em unidades a partir do centro da cabeça. */
const CRANIO = { rx: 12.6, ry: 13.2 };

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
  if (pts.length === 1) saida.push([Math.floor(pts[0][0]), Math.floor(pts[0][1])]);
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
 * um gomo e outro que tirava a suavidade. Nasce para trás e para baixo, desce até o chão e sobe no
 * gancho, que é o que se lê a 1x. No chibi ele é mais grosso na base: rabo fino atrás de perna
 * grossa parecia fio.
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
    ang = Math.min(Math.max(-36 - 22 * sobe - 38 * solta - inclinacao * 0.5, -100), -10);
    curva = -150 - 40 * sobe + 80 * solta;
  }
  const N = 22;
  const passo = (44 / N) * k;
  const chao = medidasDoSprite(k).ancoraY;
  const raio = (s: number) => 0.6 + 3.9 * Math.pow(1 - s, 1.15);
  let ponto = noTronco(e, -3.4, 2.6);
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
  for (const i of [4, 7, 10, 13]) {
    const { c, d, r } = eixo[i];
    const n: P = [-d[1], d[0]];
    riscar(p, [soma(c, n, r), soma(c, d, 0.8), soma(c, n, -r)], pal.pele.sombra, 0.35);
  }
}

function mao(p: Pintor, cot: P, pulso: P, aberta: boolean, apontar: boolean, pele: Tinta, k: number) {
  const d = unit(cot, pulso);
  const n: P = [-d[1], d[0]];
  const centro = soma(pulso, d, 1.4 * k);
  const formas: Forma[] = [];
  if (aberta) {
    // Palma curta e três dedos grossos em leque: é a garra, na medida do chibi. Abertos o bastante
    // para o vão entre eles virar risco de contorno — em leque fechado os três colavam num remo.
    formas.push({ tipo: 'elipse', c: centro, rx: 2.8, ry: 2.6 });
    const base = soma(centro, d, 1.2 * k);
    for (const g of [-42, 0, 42]) {
      formas.push({ tipo: 'capsula', a: base, b: soma(base, girar(d, g), 3.4 * k), ra: 1.15, rb: 0.8 });
    }
  } else {
    // o punho é um bloco quase redondo e maior que o pulso: mão de chibi é robusta
    formas.push({ tipo: 'elipse', c: centro, rx: 3, ry: 3.3, ang: grausDe(cot, pulso) });
  }
  p.peca(formas, pele);
  if (!aberta && k >= GRANDE) {
    // os vãos entre os dedos dobrados, só na frente do punho e no tom da sombra
    for (const o of [-1.1, 1.1]) {
      const a = soma(centro, n, o * k);
      riscar(p, [soma(a, d, 0.9 * k), soma(a, d, 2.6 * k)], pele.sombra);
    }
  }
  if (apontar) {
    // O indicador vai numa peça à parte (um pixel e o contorno): na mesma peça do punho, ele virava
    // um cone e ninguém lia dedo nenhum. Sai do dedo de cima, não do meio do punho.
    const base = soma(soma(centro, d, 1.8 * k), n, -1.1 * k);
    p.peca([{ tipo: 'capsula', a: base, b: soma(base, d, 4 * k), ra: 0.85, rb: 0.7 }], pele);
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
    { tipo: 'capsula', a: ombro, b: cot, ra: 3.1, rb: 2.6 },
    { tipo: 'capsula', a: cot, b: noOsso(cot, pulso, 0.45), ra: 2.6, rb: 3 },
    { tipo: 'capsula', a: noOsso(cot, pulso, 0.45), b: pulso, ra: 3, rb: 2.3 },
  ], pele);
  // placa do antebraço: uma oval por cima do osso, mais curta que ele — tubo inteiro viraria luva
  p.peca([{ tipo: 'elipse', c: noOsso(cot, pulso, 0.48, -0.6), rx: 3.3, ry: 2.4, ang: grausDe(cot, pulso) }], placa);
  brilho(p, noOsso(cot, pulso, 0.36, -1.3), k, pal, !frente);
  const pose = e.pose as PoseDaGeladeira;
  const aberta = (frente ? pose.maoF : pose.maoT) === 'aberta';
  mao(p, cot, pulso, aberta, frente && !!pose.apontar, pele, k);
  // ombreira: um domo em cima do ombro, com o brilho no alto e à frente, de onde vem a luz
  const c = noOsso(ombro, cot, 0.08);
  p.peca([{ tipo: 'elipse', c, rx: 3.9, ry: 3.6 }], placa);
  brilho(p, soma(c, [0.8 * k, -2.1 * k]), k, pal, !frente);
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
  // A perna e o pé numa peça só, sem risco no tornozelo, como pele contínua. Coxa grossa e canela
  // curta, e o pé é um bloco com dois dedos redondos na ponta: pé fino não segura cabeça de chibi.
  const dedo = (y: number, ponta: number): Forma =>
    ({ tipo: 'capsula', a: naSola(1.5, y), b: naSola(ponta, y), ra: 1.45, rb: 1.2 });
  p.peca([
    { tipo: 'capsula', a: quadril, b: joelho, ra: 4.7, rb: 3.7 },
    { tipo: 'capsula', a: joelho, b: noOsso(joelho, tornozelo, 0.45), ra: 3.7, rb: 3.5 },
    { tipo: 'capsula', a: noOsso(joelho, tornozelo, 0.45), b: tornozelo, ra: 3.5, rb: 2.7 },
    formaDoPe(tornozelo, 4.6, 3.4, angPe, 2.6),
    dedo(1.2, 5.7), dedo(2.2, 6.3),
  ], pele);
  // o vão entre os dois dedos, só na ponta e na cor da sombra: risco escuro ali pesaria o pé inteiro
  riscar(p, [naSola(5, 1.75), naSola(7, 1.75)], pele.sombra);
  // placa da canela: oval na frente da canela, e o tornozelo continua branco — senão vira bota
  p.peca([{ tipo: 'elipse', c: noOsso(joelho, tornozelo, 0.48, -0.9), rx: 4, ry: 2.6, ang: grausDe(joelho, tornozelo) }], placa);
  brilho(p, noOsso(joelho, tornozelo, 0.3, -1.9), k, pal, !frente);
}

function tronco(p: Pintor, e: Esqueleto, pal: Paleta) {
  const k = escalaDe(e);
  const t = (f: number, h: number) => noTronco(e, f, h);
  // o pescoço é curto e a cabeça o tapa quase inteiro; fica só para a cabeça deitada não descolar
  p.peca([{ tipo: 'capsula', a: t(0.4, 11), b: noOsso(e.pescoco, e.cabeca, 0.35), ra: 3, rb: 2.8 }], pal.pele);
  // o tronco é um barril curto, com o peito um pouco mais largo que a cintura: o V do tirano, mas
  // na medida do chibi
  p.peca([{
    tipo: 'poligono',
    pts: [t(-6.2, 11), t(-4.2, 14.4), t(3.2, 14.8), t(6.8, 12), t(7.1, 8), t(5.7, 4.8), t(6.1, 1.5), t(4.4, -2.4), t(-4.8, -2.4), t(-6.5, 1.5), t(-5.6, 5), t(-6.6, 8.5)],
  }], pal.pele);
  // O risco embaixo do peito, na cor da sombra e não do contorno: a bio-armadura é lisa, e risco
  // escuro ali viraria costura de roupa.
  riscar(p, [t(-0.5, 7.4), t(2.6, 6.6), t(5.6, 7.1)], pal.pele.sombra);
  if (k < GRANDE) return;
  riscar(p, [t(3.4, 4.6), t(3.6, 2.4)], pal.pele.sombra, 0.6);
  // o lustro: um fio claro por dentro da borda iluminada do peito. A luz da borda sozinha diz
  // "volume"; o fio de dentro é o que diz "liso e polido"
  riscar(p, [t(5.4, 11.4), t(5.6, 9.2)], pal.lustro);
}

/** Um desenho de pixels: o canto de cima e de trás, em pixels a partir do centro da cabeça, e a grade. */
type Carimbo = [P, string[]];
type Rosto = Record<'abertos' | 'fechados' | 'nocaute' | 'marca' | 'boca' | 'grito', Carimbo>;

/**
 * Na luta, [para a frente, para baixo] a partir do centro da cabeça. K pálpebra, E branco do olho,
 * D íris funda, R íris, P pupila, W brilho, S sombra da pele, M marca, B boca.
 */
const ROSTO_GRANDE: Rosto = {
  // O olho grande de anime, e malvado: a pálpebra de cima é grossa e desce para a frente até uma
  // ponta, que faz as vezes da sobrancelha franzida. A íris é escura em cima (a sombra da
  // pálpebra) e acesa embaixo, e o brilho fica ao lado da pupila — sem ele o olho vira buraco. A
  // de baixo vai no tom da sombra da pele: o olho inteiro contornado ficava assustado.
  abertos: [[5, -6], [
    'KK........',
    '.KKK......',
    '..KKKKK...',
    '..KKKKKKKK',
    '.SKDDDDKKK',
    '.SDDDDDDK.',
    '.SDWWDPDK.',
    '.SRWWPPRK.',
    '.SRRPPPRK.',
    '.SRRRPRRK.',
    '.SRRRRRRK.',
    '..RRRRRK..',
    '...SSSS...',
  ]],
  fechados: [[5, 1], ['KK........', '.KKKK.....', '..KKKKKKK.', '.......KK.']],
  nocaute: [[7, -2], ['KK...KK', '.KK.KK.', '..KKK..', '.KK.KK.', 'KK...KK']],
  // a marca desce do canto de trás do olho pela maçã do rosto
  marca: [[4, 8], ['M.', 'M.', '.M']],
  // o riso de canto: reta na frente, e o canto de trás sobe um pixel
  boca: [[9, 12], ['B....', '.BBBB']],
  // aberta, com o fundo escuro atrás e o vermelho na frente
  grito: [[9, 10], ['.BBBB', 'BPRRB', 'BRRRB', '.BBB.']],
};
/** No retrato (escala 1), o rosto de cinco pixels, que é o que cabe numa cabeça de 26. */
const ROSTO_PEQUENO: Rosto = {
  abertos: [[3, -4], ['KK....', '.KKKKK', '.SDDKK', '.SWPRK', '.SRPRK', '..RRK.']],
  fechados: [[3, 0], ['KK....', '.KKKKK', '....KK']],
  nocaute: [[5, -1], ['K.K', '.K.', 'K.K']],
  marca: [[3, 3], ['M', 'M']],
  boca: [[6, 7], ['B..', '.BB']],
  grito: [[6, 6], ['BBB', 'BRB']],
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
  const { rx, ry } = CRANIO;
  // O crânio é redondo e grande, e o rosto fica baixo e à frente nele. Com uma bochecha a mais
  // embaixo, a cara esticava para a frente e virava focinho.
  p.peca([{ tipo: 'elipse', c: h(0, 0), rx, ry, ang: e.angCabeca }], pal.pele);
  // o rosto vai logo depois do crânio, enquanto a máscara ainda é dele
  const r = k >= GRANDE ? ROSTO_GRANDE : ROSTO_PEQUENO;
  const cores: Record<string, Cor> = {
    K: pal.olho, E: pal.esclera, D: pal.irisFunda, R: pal.vermelho, P: pal.pupila, W: pal.lustro,
    S: pal.pele.sombra, M: pal.marca, B: pal.boca,
  };
  carimbo(p, e, k, r[e.pose.olhos ?? 'abertos'], cores);
  carimbo(p, e, k, r.marca, cores);
  carimbo(p, e, k, e.pose.grito ? r.grito : r.boca, cores);
  // O domo roxo cobre o alto do crânio e desce pela nuca, com a testa e o rosto brancos. A borda
  // de fora coincide com a do crânio (3% a mais, para o contorno das duas peças cair no mesmo pixel
  // e não dobrar de espessura); a de dentro corre acima do olho e cai atrás, onde seria a orelha.
  const noCranio = (grau: number, f = 1.03): P => [Math.cos(grau * RAD) * rx * f, Math.sin(grau * RAD) * ry * f];
  const borda: P[] = [];
  for (let g = 29; g < 222; g += 11) borda.push(noCranio(g));
  borda.push(noCranio(222));
  const dentro: P[] = [[-7.6, -5], [-5, 1.8], [-1, 5.4], [4.2, 6.6], [9, 6.6]];
  p.peca([{ tipo: 'poligono', pts: [...borda, ...dentro].map(([f, a]) => h(f, a)) }], pal.placa);
  // O brilho do domo: um arco curto no alto e à frente, seguindo a curva, e uma faísca solta
  // atrás dele. Mancha redonda ali lia como furo; o arco é o que diz "cúpula de vidro".
  const noDomo = (grau: number, f: number) => h(...noCranio(grau, f));
  if (k >= GRANDE) {
    riscar(p, [noDomo(50, 0.8), noDomo(66, 0.84), noDomo(84, 0.83)], pal.reflexo);
    riscar(p, [noDomo(96, 0.8), noDomo(104, 0.78)], pal.placa.luz ?? pal.reflexo);
    riscar(p, [noDomo(62, 0.62)], pal.placa.luz ?? pal.reflexo);
  } else {
    riscar(p, [noDomo(62, 0.78), noDomo(78, 0.8)], pal.reflexo);
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
 * Três poses de mostruário, com os alvos medidos para este corpo (pernas de 20, ombro a ~30 do
 * chão). A de pé é a guarda com a mão aberta, que mostra os três dedos. A do especial é o Raio
 * Congelante: braço esticado na altura do peito de quem está na frente e o tronco jogado para
 * trás, porque quem atira com um dedo não precisa se esforçar. A da vitória levanta o indicador ao
 * lado do rosto, no riso de canto de quem já sabia o resultado.
 *
 * Nas duas últimas a mão de trás vai na cintura por ÂNGULO, e não por alvo: com alvo o cotovelo
 * dobrava para dentro do tronco e a mão na cintura não se lia; por ângulo ele sai das costas, e a
 * silhueta ganha a ponta.
 */
// em pé e de joelho quase reto: quem manda não se agacha. Com o quadril baixo e os pés abertos
// os joelhos iam para os lados, e a pose de quem despreza o adversário virava a de um sapo
const parado: PoseDaGeladeira = {
  quadril: [-1, -21], tronco: 4, cabeca: -3,
  pernaF: { alvo: [7, -3] }, pernaT: { alvo: [-7, -3] },
  bracoF: { alvo: [12, -27] }, bracoT: { alvo: [6, -29] },
  maoF: 'aberta', vento: 0.2,
};
const especial: PoseDaGeladeira = {
  quadril: [-3, -19], tronco: -10, cabeca: 8,
  pernaF: { alvo: [10, -3] }, pernaT: { alvo: [-11, -3] },
  bracoF: { alvo: [19, -33] }, bracoT: { ang: [-60, 125] },
  apontar: true, vento: -1,
};
const vitoria: PoseDaGeladeira = {
  quadril: [0, -20], tronco: -5, cabeca: -8,
  pernaF: { alvo: [6, -3] }, pernaT: { alvo: [-5, -3] },
  bracoF: { alvo: [13, -41] }, bracoT: { ang: [-60, 125] },
  apontar: true, vento: 0.8,
};

export const vitrine: { parado: Pose; especial: Pose; vitoria: Pose } = { parado, especial, vitoria };

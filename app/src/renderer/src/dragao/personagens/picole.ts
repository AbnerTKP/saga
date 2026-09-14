/**
 * Picolé — o alienígena verde e sábio, de turbante e capa. O mais alto e o de braço mais comprido:
 * luta de longe, e o especial é o Picolé Espiral (dois dedos na testa carregando, e o braço
 * estendido na hora de soltar).
 *
 * A capa é o que dá a silhueta dele, e ela pendura pelo MUNDO, não pelo tronco: quem se inclina
 * leva o ombro junto, mas o pano continua caindo para baixo. `pose.vento` levanta a capa para
 * trás (0 parada, 1 esvoaçando na horizontal), e as dobras da barra andam com ele — animar o
 * vento já faz o pano ondular, sem um segundo número.
 */
import { cor, linha, pixel } from '../quadro.ts';
import {
  type Corpo, type Esqueleto, type Personagem, type Pintor, type Pose, angulo, dir, formaDoPe, naCabeca, noOsso,
  noTronco, SPRITE, soma, tinta,
} from '../boneco.ts';
import type { P } from '../raster.ts';

/**
 * Os dedos do especial. A mão do boneco só conhece punho e aberta, e o Picolé Espiral é o gesto
 * dele — dois dedos esticados —, então o campo vive aqui e não no esqueleto de todo mundo.
 */
export type PoseDoPicole = Pose & { dedosF?: boolean; dedosT?: boolean };

const CONTORNO = cor('#1b1022');

const C = {
  pele: tinta(cor('#78bf48'), cor('#4b8a33'), CONTORNO, cor('#a8e070'), 2),
  peleAtras: tinta(cor('#4b8a33'), cor('#346a28'), CONTORNO, undefined, 2),
  // as placas rosadas dos braços: sem contorno, porque são da mesma pele
  placa: { ...tinta(cor('#e3949c'), cor('#b8646f'), CONTORNO, cor('#f6c0c4'), 1), semContorno: true },
  placaAtras: { ...tinta(cor('#b06470'), cor('#8a4a58'), CONTORNO, undefined, 1), semContorno: true },
  roxo: tinta(cor('#5b3f9c'), cor('#3b2770'), CONTORNO, cor('#7e62c6'), 2),
  roxoAtras: tinta(cor('#3b2770'), cor('#281a50'), CONTORNO, undefined, 2),
  faixa: tinta(cor('#78cdea'), cor('#3f93bf'), CONTORNO, cor('#b4ecfa'), 1),
  sapato: tinta(cor('#8a5431'), cor('#5c3520'), CONTORNO, cor('#b27a4c'), 1),
  sapatoAtras: tinta(cor('#5c3520'), cor('#3f2416'), CONTORNO, undefined, 1),
  branco: tinta(cor('#efebe2'), cor('#b4aec4'), CONTORNO, cor('#ffffff'), 2),
  brancoAtras: tinta(cor('#bcb6ca'), cor('#8f89a6'), CONTORNO, undefined, 2),
  dobra: cor('#b4aec4'),
  vinco: cor('#4b8a33'),
  olho: CONTORNO,
  esclera: cor('#ffffff'),
  boca: cor('#2d4a22'),
  dente: cor('#ffffff'),
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

function braco(p: Pintor, e: Esqueleto, frente: boolean) {
  const ombro = frente ? e.ombroF : e.ombroT;
  const cot = frente ? e.cotoveloF : e.cotoveloT;
  const mao = frente ? e.maoF : e.maoT;
  const pele = frente ? C.pele : C.peleAtras;
  const placa = frente ? C.placa : C.placaAtras;
  // braço comprido e fino: é o alcance dele, e engrossar o faria parecer o Goiaba esticado
  p.peca([
    { tipo: 'capsula', a: ombro, b: noOsso(ombro, cot, 0.5), ra: 3.4, rb: 3.2 },
    { tipo: 'capsula', a: noOsso(ombro, cot, 0.5), b: cot, ra: 3.2, rb: 2.3 },
    { tipo: 'capsula', a: cot, b: noOsso(cot, mao, 0.4), ra: 2.4, rb: 2.8 },
    { tipo: 'capsula', a: noOsso(cot, mao, 0.4), b: mao, ra: 2.8, rb: 2 },
  ], pele);
  // as placas rosadas: bíceps e antebraço, do lado de fora do osso
  p.peca([
    { tipo: 'capsula', a: noOsso(ombro, cot, 0.38, 0.9), b: noOsso(ombro, cot, 0.72, 0.8), ra: 1.7, rb: 1.3 },
    { tipo: 'capsula', a: noOsso(cot, mao, 0.22, 0.6), b: noOsso(cot, mao, 0.62, 0.5), ra: 1.6, rb: 1.2 },
  ], placa);
  const pose = e.pose as PoseDoPicole;
  const dedos = frente ? pose.dedosF : pose.dedosT;
  const aberta = (frente ? pose.maoF : pose.maoT) === 'aberta';
  const ang = angulo(cot, mao);
  if (dedos) {
    // punho com indicador e médio esticados na direção do antebraço
    const base = noOsso(cot, mao, 1.08);
    p.peca([
      { tipo: 'elipse', c: base, rx: 2.6, ry: 2.6 },
      { tipo: 'capsula', a: noOsso(cot, mao, 1.1, 0.7), b: soma(base, dir(ang + 4), 5.5), ra: 1, rb: 0.8 },
    ], pele);
  } else {
    p.peca([aberta
      ? { tipo: 'elipse', c: noOsso(cot, mao, 1.12), rx: 3, ry: 2, ang: 90 - ang }
      : { tipo: 'elipse', c: noOsso(cot, mao, 1.1), rx: 2.8, ry: 2.8 }], pele);
  }
}

function perna(p: Pintor, e: Esqueleto, frente: boolean) {
  const quadril = frente ? e.quadrilF : e.quadrilT;
  const joelho = frente ? e.joelhoF : e.joelhoT;
  const tornozelo = frente ? e.tornozeloF : e.tornozeloT;
  const roxo = frente ? C.roxo : C.roxoAtras;
  const sapato = frente ? C.sapato : C.sapatoAtras;
  // o pé do boneco nasce ACIMA do tornozelo; é a bola do calcanhar que encosta no chão
  p.peca([
    { tipo: 'capsula', a: noOsso(joelho, tornozelo, 0.88), b: tornozelo, ra: 2.8, rb: 3 },
    formaDoPe(tornozelo, 7.5, 3.2, frente ? e.pose.peF : e.pose.peT),
  ], sapato);
  // calça larga que cai em bolsa por cima do sapato
  p.peca([
    { tipo: 'capsula', a: quadril, b: joelho, ra: 5, rb: 4.2 },
    { tipo: 'capsula', a: joelho, b: noOsso(joelho, tornozelo, 0.72), ra: 4.2, rb: 4 },
    { tipo: 'capsula', a: noOsso(joelho, tornozelo, 0.72), b: noOsso(joelho, tornozelo, 0.82), ra: 4, rb: 3 },
  ], roxo);
}

/** Pano não atravessa o chão: o que passaria dele deita e escorrega para trás. */
const CHAO_DO_SPRITE = SPRITE.ancoraY - 0.5;
const noChao = ([x, y]: P): P => (y > CHAO_DO_SPRITE ? [x - (y - CHAO_DO_SPRITE) * 0.8, CHAO_DO_SPRITE] : [x, y]);

/**
 * A capa pendura pelos ombros e cai no sentido do mundo. As duas bordas são curvas: perto do
 * ombro o pano pende, e quanto mais perto da barra, mais o vento o leva para trás — girar a capa
 * inteira de uma vez a transforma numa bandeira dura. A barra tem dobras em zigue-zague cuja fase
 * anda com o próprio vento.
 */
function capa(p: Pintor, e: Esqueleto) {
  const t = (f: number, h: number) => noTronco(e, f, h);
  // acima de 1 a capa já está na horizontal, e mais que isso só a afina até virar fita
  const vento = Math.max(0, Math.min(1.1, e.pose.vento ?? 0));
  const nuca = t(-3, e.corpo.tronco + 1);
  const costas = t(-12, e.corpo.tronco - 1);
  const PASSOS = 4;
  // uma borda: cada trecho gira um pouco mais que o anterior, e ondula com o vento. O giro para
  // na horizontal: passando dela, a borda de cima cruzava a de baixo e a capa virava um nó
  const borda = (de: P, comprimento: number, abertura: number, curva: number, fase: number): P[] => {
    const pts: P[] = [];
    let ponto = de;
    for (let i = 1; i <= PASSOS; i++) {
      const k = i / PASSOS;
      const giro = Math.max(-96, abertura - vento * curva * k * k + Math.sin(k * 5 + vento * 8 + fase) * vento * 8);
      ponto = soma(ponto, dir(giro), comprimento / PASSOS);
      pts.push(noChao(ponto));
    }
    return pts;
  };
  // inclinado para a frente, o pano deita nas costas antes de cair; sem isso a barra pendia
  // da nuca direto para o meio das pernas e virava uma mancha branca entre elas
  const deita = Math.max(0, e.pose.tronco) * 0.9;
  // a borda de baixo curva menos que a de cima: é o que mantém a barra larga com vento forte,
  // em vez de as duas se juntarem numa fita
  const tras = borda(costas, 42, -16 - vento * 8 - deita * 0.5, 80, 0);
  const frente = borda(nuca, 38, -2 - deita, 50, 1.3);
  const baixoTras = tras[PASSOS - 1], baixoFrente = frente[PASSOS - 1];
  // a quina de cima da barra é chanfrada: em ângulo agudo o contorno deixava um fiapo solto
  tras[PASSOS - 1] = noOsso(baixoTras, tras[PASSOS - 2], 0.12);
  const barra: P[] = [noOsso(baixoTras, baixoFrente, 0.1)];
  const n = 6;
  const para = angulo(baixoTras, baixoFrente) - 90;
  for (let i = 1; i < n; i++) {
    const k = i / n;
    // a onda some perto das pontas, pelo mesmo motivo
    const onda = Math.sin(k * Math.PI * 3 + vento * 9) * (1.2 + vento * 1.2) * Math.sin(k * Math.PI);
    barra.push(noChao(soma(noOsso(baixoTras, baixoFrente, k), dir(para), onda)));
  }
  p.peca([{ tipo: 'poligono', pts: [nuca, costas, ...tras, ...barra, ...[...frente].reverse()] }], C.branco);
  // dobras: riscos que descem do meio do pano até os vales da barra
  for (const k of [0.25, 0.58]) {
    // para antes da barra: a onda pode puxar a borda para dentro, e a ponta do risco sobraria fora
    const meio = noOsso(tras[1], frente[1], k);
    const baixo = noOsso(meio, noOsso(baixoTras, baixoFrente, k), 0.85);
    linha(p.q, meio[0], meio[1], baixo[0], baixo[1], C.dobra);
  }
}

function ombreira(p: Pintor, e: Esqueleto, frente: boolean) {
  const t = (f: number, h: number) => noTronco(e, f, h);
  const o = frente ? e.corpo.ombroF : e.corpo.ombroT;
  // Almofada redonda EM CIMA do ombro, passando dele para os dois lados: é o que faz o "T" da
  // silhueta. Foi uma placa reta que saía 8 px para a frente e subia até o pescoço, e como o
  // rosto dele fica à frente do ombro ela lia como uma tábua branca atravessada debaixo do queixo.
  const s = frente ? 1 : -1;
  const pts: P[] = [
    t(o[0] - 5.0 * s, o[1] + 0.6), t(o[0] - 3.4 * s, o[1] + 3.0), t(o[0] + 2.4 * s, o[1] + 3.8), t(o[0] + 5.6 * s, o[1] + 2.2),
    t(o[0] + 6.2 * s, o[1] - 1.2), t(o[0] + 5.0 * s, o[1] - 2.8), t(o[0] - 4.6 * s, o[1] - 2.4),
  ];
  p.peca([{ tipo: 'poligono', pts }], frente ? C.branco : C.brancoAtras);
}

function tronco(p: Pintor, e: Esqueleto) {
  const t = (f: number, h: number) => noTronco(e, f, h);
  // quimono sem manga, estreito na cintura
  p.peca([{ tipo: 'poligono', pts: [t(-7.4, 17.5), t(-4.5, 20.8), t(4, 21), t(8.2, 18), t(7.8, 11), t(5.6, 3.6), t(-5.2, 2), t(-6.8, 9)] }], C.roxo);
  // o decote em V mostra o peito verde
  p.peca([{ tipo: 'poligono', pts: [t(0.4, 21), t(5.6, 20.6), t(3.2, 14.2)] }], { ...C.pele, faixa: 0 });
  // faixa azul-clara, com a ponta do nó caindo atrás
  p.peca([{ tipo: 'capsula', a: t(-4.6, 2.6), b: t(-6.8, -3.8), ra: 1.1, rb: 0.9 }], C.faixa);
  p.peca([{ tipo: 'poligono', pts: [t(-5.8, 6), t(6.6, 6.8), t(6.6, 2.6), t(-5.6, 1.6)] }], C.faixa);
}

function cabeca(p: Pintor, e: Esqueleto) {
  const h = (f: number, a: number) => naCabeca(e, f, a);
  // pescoço comprido
  p.peca([{ tipo: 'capsula', a: e.pescoco, b: h(-0.6, -3), ra: 2.5, rb: 2.5 }], C.pele);
  // rosto de queixo comprido e fino
  p.peca([
    { tipo: 'elipse', c: h(0, 0.4), rx: 5, ry: 6, ang: e.angCabeca },
    { tipo: 'poligono', pts: [h(-3.4, -1.5), h(4.6, -0.2), h(4.9, -3.2), h(3.4, -6.6), h(0.6, -7.2), h(-2.2, -5.4)] },
  ], C.pele);
  // turbante: bulbo e volta na testa numa peça só — com um risco de contorno entre os dois, ele
  // virava um chapéu de dois andares. O bulbo sobe e pende para trás, e a volta segue a testa
  // sem quina na frente: com a quina e a borda de baixo reta, o pano lia como balde com aba.
  p.peca([
    { tipo: 'elipse', c: h(-1.2, 9.8), rx: 6, ry: 5.8, ang: e.angCabeca - 16 },
    { tipo: 'poligono', pts: [h(-5.4, 2.2), h(1, 3.0), h(4.8, 3.2), h(5.6, 5.0), h(5.2, 7.2), h(-6.2, 7.0)] },
  ], C.branco);
  // as voltas do pano: a de baixo acompanha a testa, e uma segunda mais acima diz que é pano
  // enrolado, e não chapéu
  const d1 = h(-5.2, 6.4), d2 = h(1, 7.0), d3 = h(5.0, 6.6);
  linha(p.q, d1[0], d1[1], d2[0], d2[1], C.dobra);
  linha(p.q, d2[0], d2[1], d3[0], d3[1], C.dobra);
  const e1 = h(-4.8, 10.6), e2 = h(2.4, 12.6);
  linha(p.q, e1[0], e1[1], e2[0], e2[1], C.dobra);
  // as antenas furam o turbante pela frente e se abrem, cada uma para um lado
  const antena = (base: P, meio: P, ponta: P, pele: typeof C.pele) => p.peca([
    { tipo: 'capsula', a: h(...base), b: h(...meio), ra: 0.55, rb: 0.55 },
    { tipo: 'capsula', a: h(...meio), b: h(...ponta), ra: 0.55, rb: 0.55 },
  ], { ...pele, faixa: 0 });
  antena([1.2, 11.5], [1.6, 15.2], [4, 17.4], C.peleAtras);
  antena([3.8, 10], [6.8, 12.6], [9.8, 13], C.pele);
  // orelha pontuda, para trás e para cima, por cima da volta do turbante
  p.peca([{ tipo: 'poligono', pts: [h(-1.8, 1.8), h(-9.6, 5), h(-3.4, -3)] }], { ...C.pele, faixa: 1 });
  // rosto: vinco da bochecha, olho, sobrancelha e boca
  const v1 = h(1, -2.4), v2 = h(2, -4.8);
  linha(p.q, v1[0], v1[1], v2[0], v2[1], C.vinco);
  const olhos = e.pose.olhos ?? 'abertos';
  const o = h(3.1, -0.5);
  if (olhos === 'abertos') {
    pixel(p.q, o[0] - 1, o[1], C.esclera); pixel(p.q, o[0], o[1], C.esclera);
    pixel(p.q, o[0] + 1, o[1], C.olho);
  } else if (olhos === 'fechados') {
    linha(p.q, o[0] - 1, o[1] + 1, o[0] + 1, o[1] + 1, C.olho);
  } else {
    pixel(p.q, o[0] - 1, o[1] - 1, C.olho); pixel(p.q, o[0] + 1, o[1] + 1, C.olho);
    pixel(p.q, o[0], o[1], C.olho); pixel(p.q, o[0] + 1, o[1] - 1, C.olho); pixel(p.q, o[0] - 1, o[1] + 1, C.olho);
  }
  // sobrancelha descendo para o nariz, com um pixel de pele entre ela e o turbante — colada nele,
  // virava parte do contorno e o rosto perdia a cara de bravo
  const s1 = h(1.6, 1.3), s2 = h(4.8, 0.4);
  linha(p.q, s1[0], s1[1], s2[0], s2[1], C.olho);
  const b = h(2.6, -4.5);
  if (e.pose.grito) {
    pixel(p.q, b[0], b[1], C.olho); pixel(p.q, b[0] + 1, b[1], C.dente);
    pixel(p.q, b[0], b[1] + 1, C.olho); pixel(p.q, b[0] + 1, b[1] + 1, C.olho);
  } else {
    pixel(p.q, b[0], b[1], C.boca); pixel(p.q, b[0] + 1, b[1], C.boca);
  }
}

export const picole: Personagem = {
  id: 'picole',
  nome: 'Picolé',
  corpo: corpoDoPicole,
  desenhar(p, e) {
    capa(p, e);
    braco(p, e, false);
    ombreira(p, e, false);
    perna(p, e, false);
    tronco(p, e);
    perna(p, e, true);
    cabeca(p, e);
    braco(p, e, true);
    ombreira(p, e, true);
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

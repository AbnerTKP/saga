/**
 * Vegetal — o rival orgulhoso. Mais baixo e mais troncudo que o Goiaba, e é o cabelo em chama
 * que devolve a altura: do pé ao topo os dois ficam a três pixels um do outro, mas o corpo dele
 * é menor e mais largo, e isso é o que faz ele parecer rápido. O especial é o Canhão de Alho.
 *
 * A silhueta é da chama e das OMBREIRAS. A 1x, sem as ombreiras, ele seria um boneco azul de
 * cabelo alto; com elas, o alto do corpo vira um T largo que se reconhece do outro lado da tela.
 */
import { cor, linha, pixel } from '../quadro.ts';
import {
  type Corpo, type Esqueleto, type Personagem, type Pintor, type Pose, angulo, dir, dist, formaDoPe, naCabeca, noOsso, noTronco, tinta,
} from '../boneco.ts';
import { Mascara, type Forma, type P, marcarForma } from '../raster.ts';

const CONTORNO = cor('#1b1022');

const C = {
  contorno: CONTORNO,
  pele: tinta(cor('#f2bf96'), cor('#d28b62'), CONTORNO, cor('#ffe0c0'), 2),
  // O marinho não pode encostar no contorno: a sombra escura demais come o risco e o braço
  // vira um borrão. Por isso ele é mais azul do que "marinho" de verdade.
  marinho: tinta(cor('#2f3c86'), cor('#212a63'), CONTORNO, cor('#4b5cb2'), 2),
  marinhoAtras: tinta(cor('#232d69'), cor('#18204b'), CONTORNO, undefined, 2),
  branco: tinta(cor('#f1f2f6'), cor('#b5bdd2'), CONTORNO, cor('#ffffff'), 2),
  brancoAtras: tinta(cor('#b5bdd2'), cor('#8a93ad'), CONTORNO, undefined, 2),
  dourado: tinta(cor('#f2b93b'), cor('#b8761c'), CONTORNO, cor('#ffe68a'), 2),
  douradoAtras: tinta(cor('#bb8126'), cor('#875512'), CONTORNO, undefined, 2),
  cabelo: tinta(cor('#1e1b2e'), cor('#0e0c17'), cor('#0a0810'), cor('#3e3a5c'), 2),
  olho: CONTORNO,
  branquinho: cor('#ffffff'),
  boca: cor('#8e4436'),
};

export const corpoDoVegetal: Corpo = {
  tronco: 16.5,
  pescoco: 7.5,
  bracoSup: 9.5,
  antebraco: 9,
  coxa: 12,
  canela: 11.5,
  // Ombros mais abertos que os do Goiaba: é o troncudo.
  ombroF: [5, 14.5],
  ombroT: [-5.5, 15],
  quadrilF: [2.5, 1],
  quadrilT: [-3, 1],
};

type Lado = { ombro: P; cot: P; mao: P; frente: boolean };

const lado = (e: Esqueleto, frente: boolean): Lado => frente
  ? { ombro: e.ombroF, cot: e.cotoveloF, mao: e.maoF, frente }
  : { ombro: e.ombroT, cot: e.cotoveloT, mao: e.maoT, frente };

/** O antebraço sozinho, do cotovelo à ponta dos dedos, sem a luva. */
const formasDoAntebraco = ({ cot, mao }: Lado): Forma[] => [
  { tipo: 'capsula', a: cot, b: noOsso(cot, mao, 0.4), ra: 2.9, rb: 3.1 },
  { tipo: 'capsula', a: noOsso(cot, mao, 0.4), b: mao, ra: 3.1, rb: 2.5 },
];

function luva(p: Pintor, e: Esqueleto, l: Lado) {
  const { cot, mao, frente } = l;
  const branco = frente ? C.branco : C.brancoAtras;
  // o cano da luva é mais largo que o braço: é o que faz ela parecer luva, e não mão pintada
  p.peca([{ tipo: 'capsula', a: noOsso(cot, mao, 0.64), b: noOsso(cot, mao, 0.94), ra: 3.5, rb: 3.1 }], branco);
  const aberta = (frente ? e.pose.maoF : e.pose.maoT) === 'aberta';
  if (aberta) p.peca(formasDaMaoAberta(cot, mao), branco);
  else p.peca([{ tipo: 'elipse', c: noOsso(cot, mao, 1.12), rx: 3.3, ry: 3.2, ang: 90 - angulo(cot, mao) }], branco);
}

/**
 * A mão aberta. Com o antebraço deitado para a frente (o Canhão de Alho, a defesa), o pulso dobra
 * e a palma fica de pé, virada para o outro lutador: deitada na linha do braço, ela seria um golpe
 * de faca, e empilhar duas assim dá um bastão branco em vez de duas mãos. Com o braço caído ou
 * erguido, os dedos seguem o braço. A dobra cresce aos poucos com o ângulo, para a animação de um
 * para o outro não saltar.
 */
function formasDaMaoAberta(cot: P, mao: P): Forma[] {
  const braco = angulo(cot, mao);
  const dobra = Math.min(1, Math.max(0, (braco - 25) / 40)) * Math.min(80, Math.max(0, 172 - braco));
  const d = dir(braco + dobra);
  // o polegar sai do lado que aponta para cima (ou para a frente, com os dedos para cima)
  let n: P = [-d[1], d[0]];
  if (n[1] > 0.3) n = [-n[0], -n[1]];
  const pulso = noOsso(cot, mao, 0.98);
  const em = (k: number, l = 0): P => [pulso[0] + d[0] * k + n[0] * l, pulso[1] + d[1] * k + n[1] * l];
  return [
    { tipo: 'elipse', c: em(2.4), rx: 2.9, ry: 2.6, ang: 90 - (braco + dobra) },
    { tipo: 'capsula', a: em(3.4, -0.3), b: em(5.8, -0.5), ra: 2.1, rb: 1.6 },
    { tipo: 'capsula', a: em(1.2, 2), b: em(3.2, 3.6), ra: 1.1, rb: 0.9 },
  ];
}

const formasDoBracoSuperior = ({ ombro, cot }: Lado): Forma[] => [
  { tipo: 'capsula', a: ombro, b: noOsso(ombro, cot, 0.55), ra: 4, rb: 3.6 },
  { tipo: 'capsula', a: noOsso(ombro, cot, 0.55), b: cot, ra: 3.6, rb: 2.9 },
];

function braco(p: Pintor, e: Esqueleto, frente: boolean) {
  const l = lado(e, frente);
  // manga do macacão, braço inteiro numa peça só: o cotovelo não ganha risco no meio
  p.peca([...formasDoBracoSuperior(l), ...formasDoAntebraco(l)], frente ? C.marinho : C.marinhoAtras);
  luva(p, e, l);
}

/** Quanto um ponto está à frente do quadril, no eixo do tronco. */
const aFrente = (e: Esqueleto, pt: P) => (pt[0] - e.quadril[0]) * e.u[0] + (pt[1] - e.quadril[1]) * e.u[1];

/**
 * Braços cruzados: o antebraço da frente volta para trás e o de trás vem para a frente. É a
 * cara dele, e a ordem de sempre não o desenha — o braço de trás mora atrás do tronco e some, e
 * sobra um braço só dobrado sobre nada. Quem decide é a geometria e não um nome de pose, para a
 * animação que entra e sai do cruzado trocar de desenho sozinha.
 */
const cruzados = (e: Esqueleto) =>
  aFrente(e, e.maoF) < aFrente(e, e.cotoveloF) - 3 && aFrente(e, e.maoT) > aFrente(e, e.cotoveloT) + 3
  // e as mãos juntas: sem isso, um soco de trás com o braço da frente recolhido também passaria
  && dist(e.maoF, e.maoT) < 8;

/**
 * De verdade, cada mão agarra o bíceps do outro braço, na ponta oposta do peito. Com estes ossos
 * não cabe: o antebraço de 9 px vai do cotovelo só até o meio do peito. Então o cruzado é uma
 * faixa de cotovelo a cotovelo com as duas mãos se encontrando no meio, a de trás (cinza) por
 * baixo e a da frente por cima — dois punhos empilhados é o que diz "cruzado"; um punho só
 * pareceria mão no peito. O braço da frente, do ombro ao cotovelo, vem por último e fecha a
 * ponta da faixa. Tentado antes: o X com as mãos nas pontas, que virou um bloco azul sem leitura.
 */
function bracosCruzados(p: Pintor, e: Esqueleto) {
  const frente = lado(e, true), tras = lado(e, false);
  p.peca(formasDoAntebraco(tras), C.marinhoAtras);
  luva(p, e, tras);
  p.peca(formasDoAntebraco(frente), C.marinho);
  luva(p, e, frente);
  p.peca(formasDoBracoSuperior(frente), C.marinho);
}

/**
 * A ombreira faz parte da armadura, e não do braço: fica parada no tronco enquanto o braço gira
 * por baixo. `sentido` 1 é a da frente, que se abre para a frente; -1 é a de trás.
 */
function formaDaOmbreira(e: Esqueleto, sentido: 1 | -1): Forma {
  // A da frente é mais curta e recuada: ela se abre para o lado de quem olha, e de perfil isso
  // aparece encurtado. Do mesmo tamanho da de trás ela passava 8 px à frente do ombro e virava
  // uma banana dourada atravessada no peito, na frente do queixo.
  const t = (f: number, h: number) => noTronco(e, sentido > 0 ? f * 0.8 - 1.8 : -f - 0.6, h);
  return {
    tipo: 'poligono',
    pts: [t(2.6, 14.8), t(6.4, 16.4), t(10.4, 17.8), t(12.6, 20.2), t(13.2, 16.2), t(11.4, 12), t(6.6, 10.8), t(2.8, 12)],
  };
}

/**
 * Ombreira por cima do braço e, se o antebraço estiver dobrado na frente dela (a guarda, o soco
 * armado), o antebraço de novo por cima. Sem isso a ombreira engole o punho da guarda; com a ordem
 * ao contrário, o braço caído passaria por cima da ombreira. Quem decide é a sobreposição
 * medida em pixels, e não o ângulo: o mesmo braço cruza a ombreira ou não conforme o tronco.
 */
function ombreira(p: Pintor, e: Esqueleto, frente: boolean) {
  const forma = formaDaOmbreira(e, frente ? 1 : -1);
  p.peca([forma], frente ? C.dourado : C.douradoAtras);
  // de braços cruzados o antebraço da frente está POR BAIXO do braço; trazê-lo por cima da
  // ombreira o traria também por cima do braço, e desfaria o cruzado
  if (frente && cruzados(e)) return;
  const l = lado(e, frente);
  if (!cobreAOmbreira(p, forma, formasDoAntebraco(l))) return;
  p.peca(formasDoAntebraco(l), frente ? C.marinho : C.marinhoAtras);
  luva(p, e, l);
}

let mascaraDeTeste: Mascara | null = null;

/**
 * O antebraço, sem contar o cotovelo, cai em cima da ombreira? A máscara do pintor serve de
 * rascunho para a ombreira — toda peça a zera antes de marcar —, e a do antebraço é uma segunda,
 * guardada entre chamadas para não alocar uma a cada quadro.
 */
function cobreAOmbreira(p: Pintor, ombreira: Forma, antebraco: Forma[]): boolean {
  if (!mascaraDeTeste || mascaraDeTeste.l !== p.q.largura || mascaraDeTeste.a !== p.q.altura) {
    mascaraDeTeste = new Mascara(p.q.largura, p.q.altura);
  }
  const a = p.m;
  a.zerar();
  marcarForma(a, ombreira);
  const b = mascaraDeTeste;
  b.zerar();
  // o pedaço do cotovelo encosta na ombreira em quase toda pose; o que conta é o resto
  const [cotovelo, resto] = antebraco;
  if (cotovelo.tipo === 'capsula') marcarForma(b, { ...cotovelo, a: noOsso(cotovelo.a, cotovelo.b, 0.9) });
  marcarForma(b, resto);
  let comum = 0;
  for (let y = Math.max(a.y0, b.y0); y <= Math.min(a.y1, b.y1); y++) {
    for (let x = Math.max(a.x0, b.x0); x <= Math.min(a.x1, b.x1); x++) {
      if (a.tem(x, y) && b.tem(x, y) && ++comum >= 4) return true;
    }
  }
  return false;
}

/**
 * O braço de trás mora atrás do tronco — até vir para a frente dele. Na guarda e no Canhão de
 * Alho, desenhado atrás, a mão de trás some dentro do peito. Quando o cotovelo de trás passa para
 * a frente do meio do corpo, o antebraço volta por cima do peito (e ainda por baixo do braço da
 * frente, que vem depois). O cruzado tem a ordem própria dele.
 */
function antebracoDeTrasNaFrente(p: Pintor, e: Esqueleto) {
  if (aFrente(e, e.cotoveloT) <= 0 || cruzados(e)) return;
  const l = lado(e, false);
  p.peca(formasDoAntebraco(l), C.marinhoAtras);
  luva(p, e, l);
}

function perna(p: Pintor, e: Esqueleto, frente: boolean) {
  const quadril = frente ? e.quadrilF : e.quadrilT;
  const joelho = frente ? e.joelhoF : e.joelhoT;
  const tornozelo = frente ? e.tornozeloF : e.tornozeloT;
  const angPe = (frente ? e.pose.peF : e.pose.peT) ?? 0;
  // macacão justo: coxa grossa e canela fina, sem a calça larga do Goiaba
  p.peca([
    { tipo: 'capsula', a: quadril, b: joelho, ra: 5, rb: 4 },
    { tipo: 'capsula', a: joelho, b: noOsso(joelho, tornozelo, 0.6), ra: 4, rb: 3.3 },
  ], frente ? C.marinho : C.marinhoAtras);
  // bota por cima do macacão, com a boca mais larga que a canela
  p.peca([
    { tipo: 'capsula', a: noOsso(joelho, tornozelo, 0.4), b: tornozelo, ra: 3.9, rb: 3.3 },
    formaDoPe(tornozelo, 7, 3.4, angPe),
  ], frente ? C.branco : C.brancoAtras);
  p.peca([biqueira(tornozelo, 7, 3.4, angPe)], frente ? C.dourado : C.douradoAtras);
}

/** A ponta da bota, no mesmo referencial de `formaDoPe`: x ao longo da sola, y para baixo. */
function biqueira(tornozelo: P, comprimento: number, altura: number, ang: number): Forma {
  const a = (ang * Math.PI) / 180;
  const f: P = [Math.cos(a), -Math.sin(a)];
  const up: P = [Math.sin(a), Math.cos(a)];
  const p = (x: number, y: number): P => [tornozelo[0] + f[0] * x - up[0] * y, tornozelo[1] + f[1] * x - up[1] * y];
  return {
    tipo: 'poligono',
    pts: [p(comprimento * 0.4, -1.2), p(comprimento * 0.36, altura - 0.5), p(comprimento, altura - 0.5), p(comprimento + 0.5, altura * 0.4)],
  };
}

function tronco(p: Pintor, e: Esqueleto) {
  const t = (f: number, h: number) => noTronco(e, f, h);
  // macacão: aparece na gola e embaixo da armadura
  p.peca([{ tipo: 'poligono', pts: [t(-7, 13.5), t(-3.8, 18.6), t(3.6, 18.8), t(8, 15), t(8.4, 9.5), t(6.8, 2.6), t(-5.6, 1.2), t(-7.4, 7)] }], C.marinho);
  // barriga dourada, em gomos, embaixo do peitoral
  p.peca([{ tipo: 'poligono', pts: [t(-6.4, 8.6), t(8.8, 9), t(8.2, 4.4), t(-5.6, 3.8)] }], C.dourado);
  const g1 = t(1.5, 8), g2 = t(1.5, 5);
  linha(p.q, g1[0], g1[1], g2[0], g2[1], C.dourado.sombra);
  // peitoral branco, com o decote baixo que deixa a gola azul aparecer
  p.peca([{ tipo: 'poligono', pts: [t(-7.4, 15.2), t(-4, 16.8), t(1.4, 15.4), t(4.4, 16.9), t(9, 14.8), t(9.8, 10.4), t(8.8, 7.4), t(-6.2, 6.8), t(-7.8, 10)] }], C.branco);
  // o emblema: um quadradinho marinho com o miolo dourado, no meio do peito — mais para a frente,
  // a ombreira da frente o cobre
  const s = t(0.6, 10.8);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    pixel(p.q, s[0] + dx, s[1] + dy, dx === 0 && dy === 0 ? C.dourado.base : C.marinho.base);
  }
}

function cabeca(p: Pintor, e: Esqueleto) {
  // o vento só inclina as pontas: a chama é dura, e a raiz não sai do lugar
  const vento = e.pose.vento ?? 0;
  const h = (f: number, a: number) => naCabeca(e, f - vento * Math.max(0, a - 4) * 0.12, a);
  const r = (f: number, a: number) => naCabeca(e, f, a);
  // rosto de queixo quadrado e testa alta: sem a testa, as entradas não têm onde aparecer
  p.peca([
    { tipo: 'elipse', c: r(0, 0.3), rx: 5.4, ry: 5.8, ang: e.angCabeca },
    { tipo: 'poligono', pts: [r(-3.6, -2), r(4.4, -1.2), r(5.3, -4), r(4, -6.3), r(-1.6, -6)] },
    { tipo: 'poligono', pts: [r(-1.5, 5.6), r(2.8, 7.8), r(5.6, 6.6), r(6, 1.6), r(3.5, -0.5)] },
  ], C.pele);
  p.peca([{ tipo: 'elipse', c: r(-2.6, -0.8), rx: 1.4, ry: 2, ang: e.angCabeca }], { ...C.pele, faixa: 1 });
  const cabelo: P[] = [
    // A linha do cabelo, da frente para trás. O bico desce quase até a sobrancelha e a entrada
    // atrás dele sobe funda: a pele da entrada precisa de uns três pixels de largura, porque o
    // contorno do cabelo come um de cada lado — com menos, o bico some e sobra uma franja.
    [6.6, 9.2], [5.6, 8.4], [4.3, 3.4], [3.2, 8.6], [0.6, 8.2], [-0.4, 3.2], [-1.2, -0.6], [-2.6, 1.4],
    [-4.6, 0.8], [-5.4, -2.2],
    // As costas: poucas línguas grandes subindo, com vão fundo entre elas. Eram oito pontas
    // pequenas e iguais, e a 1x a borda de trás virava serrote; o que diz "chama" é a diferença
    // entre as línguas, não a quantidade. Elas sobem mais do que vão para trás: aberta para trás,
    // a chama arredondava e a silhueta virava a de um Goiaba menor.
    [-7.4, -0.6], [-9.6, 6.4], [-6.4, 8.4], [-9.0, 14.2], [-4.8, 13.8], [-5.8, 20.0], [-2.4, 17.6],
    // A ponta, puxada um pouco para trás, e a frente quase lisa descendo até a testa. A chama é
    // alta e estreita de propósito — é o que se reconhece dele — e fica abaixo da ponta do cabelo
    // do Goiaba; quem diz que ele é o mais baixo é o corpo: ombro e olho bem abaixo dos outros três.
    [-0.6, 22.6], [2.6, 18.2], [5.0, 15.4], [4.6, 13.0], [7.0, 11.0], [5.6, 10.2],
  ];
  p.peca([{ tipo: 'poligono', pts: cabelo.map(([f, a]) => h(f, a)) }], C.cabelo);
  // os fios: riscos claros subindo pelas línguas, para a chama não virar um bloco preto
  for (const [a, b] of [[[-4.4, 5.2], [-7.4, 11.0]], [[-1.8, 9.6], [-3.8, 16.6]], [[1.4, 11.4], [0.0, 19.0]]] as [P, P][]) {
    const pa = h(...a), pb = h(...b);
    linha(p.q, pa[0], pa[1], pb[0], pb[1], C.cabelo.luz ?? C.cabelo.base);
  }

  const olhos = e.pose.olhos ?? 'abertos';
  const o = r(2.9, 0.2);
  if (olhos === 'abertos') {
    pixel(p.q, o[0], o[1], C.olho); pixel(p.q, o[0], o[1] + 1, C.olho);
    pixel(p.q, o[0] - 1, o[1] + 1, C.branquinho);
  } else if (olhos === 'fechados') {
    linha(p.q, o[0] - 1, o[1] + 1, o[0] + 1, o[1] + 1, C.olho);
  } else {
    pixel(p.q, o[0] - 1, o[1], C.olho); pixel(p.q, o[0] + 1, o[1] + 2, C.olho);
    pixel(p.q, o[0], o[1] + 1, C.olho); pixel(p.q, o[0] + 1, o[1], C.olho); pixel(p.q, o[0] - 1, o[1] + 2, C.olho);
  }
  if (olhos === 'nocaute') {
    // nocauteado não franze nada: a sobrancelha sobe e desfaz a ruga, e é o que abre espaço para
    // o X — com ela franzida no lugar de sempre, o X encosta nela e o olho vira um borrão
    const s1 = r(0.8, 3.4), s2 = r(4.4, 2.6);
    linha(p.q, s1[0], s1[1], s2[0], s2[1], C.olho);
  } else {
    // sobrancelha franzida em qualquer outra pose: desce forte para o nariz
    const s1 = r(0.6, 2.9), s2 = r(4.8, 1.2);
    linha(p.q, s1[0], s1[1], s2[0], s2[1], C.olho);
    const s3 = r(3.4, 1.2);
    linha(p.q, s3[0], s3[1], s2[0], s2[1], C.olho);
  }

  const b = r(3.8, -3.6);
  if (e.pose.grito) {
    pixel(p.q, b[0] - 1, b[1], C.olho); pixel(p.q, b[0], b[1], C.olho); pixel(p.q, b[0] + 1, b[1], C.olho);
    pixel(p.q, b[0], b[1] + 1, C.boca); pixel(p.q, b[0] + 1, b[1] + 1, C.olho);
  } else if (olhos === 'fechados') {
    // de olho fechado e boca fechada é o "hunf" da vitória: o canto de trás sobe
    pixel(p.q, b[0] - 1, b[1] - 1, C.boca); pixel(p.q, b[0], b[1], C.boca); pixel(p.q, b[0] + 1, b[1], C.boca);
  } else {
    pixel(p.q, b[0], b[1], C.boca); pixel(p.q, b[0] + 1, b[1], C.boca);
  }
}

export const vegetal: Personagem = {
  id: 'vegetal',
  nome: 'Vegetal',
  corpo: corpoDoVegetal,
  desenhar(p, e) {
    braco(p, e, false);
    ombreira(p, e, false);
    perna(p, e, false);
    tronco(p, e);
    perna(p, e, true);
    antebracoDeTrasNaFrente(p, e);
    cabeca(p, e);
    if (cruzados(e)) bracosCruzados(p, e);
    else braco(p, e, true);
    ombreira(p, e, true);
  },
};

/**
 * As três poses de apresentação, medidas para o corpo dele. Os braços do especial vão por alvo,
 * porque o que importa ali é onde as palmas param; os da vitória, por ângulo, porque o cruzado é a
 * relação entre os ossos, e ângulo acompanha o ombro se a pose respirar.
 */
export const vitrine: { parado: Pose; especial: Pose; vitoria: Pose } = {
  // base larga e baixa, guarda alta com o punho de trás junto do queixo: quem ataca primeiro
  parado: {
    quadril: [-2, -19.5], tronco: 8, cabeca: -8,
    pernaF: { alvo: [12, -3] }, pernaT: { alvo: [-12, -3] },
    bracoF: { alvo: [18, -35] }, bracoT: { alvo: [9, -40] },
  },
  // Canhão de Alho: tronco jogado para a frente, os dois braços esticados e as duas palmas de pé,
  // a de trás por cima e um palmo atrás. Uma exatamente sobre a outra não cabe de braço esticado:
  // o boneco não gira o tronco, o ombro de trás fica 10,5 px atrás do da frente, e a mão de trás
  // só alcança até o cotovelo do outro braço.
  especial: {
    quadril: [-4, -18], tronco: 10, cabeca: -10,
    pernaF: { alvo: [12, -3] }, pernaT: { alvo: [-17, -3] },
    bracoF: { alvo: [24, -31] }, bracoT: { alvo: [24, -37] },
    maoF: 'aberta', maoT: 'aberta', grito: true,
  },
  // braços cruzados de cotovelo a cotovelo, queixo para cima, olho fechado e o canto da boca subindo
  vitoria: {
    quadril: [0, -24], tronco: -2, cabeca: -8,
    pernaF: { alvo: [7, -3] }, pernaT: { alvo: [-8, -3] },
    bracoF: { ang: [41, -145] }, bracoT: { ang: [-24, 125] },
    olhos: 'fechados',
  },
};

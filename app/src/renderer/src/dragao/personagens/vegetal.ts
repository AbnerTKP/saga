/**
 * Vegetal — o rival orgulhoso. Mais baixo e mais troncudo que o Goiaba, e é o cabelo em chama
 * que devolve a altura: do pé ao topo os dois ficam a três pixels um do outro, mas o corpo dele
 * é menor e mais largo, e isso é o que faz ele parecer rápido. O especial é o Canhão de Alho.
 *
 * A silhueta é da chama e das OMBREIRAS. A 1x, sem as ombreiras, ele seria um boneco azul de
 * cabelo alto; com elas, o alto do corpo vira um T largo que se reconhece do outro lado da tela.
 */
import { type Cor, type Quadro, cor, linha, pixel } from '../quadro.ts';
import {
  type Corpo, type Esqueleto, type Personagem, type Pintor, type Pose, angulo, dir, dist, formaDoPe, naCabeca, noOsso, noTronco, tinta,
} from '../boneco.ts';
import { Mascara, type Forma, type P, type Tinta, marcarForma } from '../raster.ts';

const CONTORNO = cor('#1b1022');
const RAD = Math.PI / 180;

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
  // a sola assenta a bota no chão: branca até embaixo, o pé parecia flutuar sobre o piso claro
  sola: tinta(cor('#565a72'), cor('#4a4d64'), CONTORNO, undefined, 1),
  solaAtras: tinta(cor('#44475b'), cor('#3a3c4f'), CONTORNO, undefined, 1),
  // o lado de dentro da ombreira, que aparece embaixo dela e dá a espessura da placa
  douradoFundo: tinta(cor('#a8691a'), cor('#7c4a10'), CONTORNO, undefined, 1),
  olho: CONTORNO,
  branquinho: cor('#ffffff'),
  claraDoOlho: cor('#e9edf7'),
  boca: cor('#8e4436'),
  labio: cor('#6a2d29'),
};

/**
 * O que muda da testa para cima quando ele vira o Super Vegetalzin: o cabelo, a sobrancelha e a
 * íris. A roupa fica igual de propósito — quem diz que transformou é a cabeça, e a 1x o dourado
 * do cabelo contra o marinho da roupa já grita isso do outro lado da tela.
 */
type Cabeleira = {
  cabelo: Tinta;
  /** O fio de brilho, o meio-tom que corre ao lado dele e a divisão entre duas mechas. */
  fio: Cor; fioPar: Cor; divisao: Cor;
  /** A sobrancelha tem duas fileiras: a de baixo mais escura, senão a dourada some na pele. */
  sobrancelha: Cor; sobrancelhaFunda: Cor;
  /** A íris: a fileira de cima (debaixo da pálpebra) e a de baixo, que pega a luz. */
  iris: Cor; irisClara: Cor;
};

const NORMAL: Cabeleira = {
  cabelo: tinta(cor('#1e1b2e'), cor('#0e0c17'), cor('#0a0810'), cor('#3e3a5c'), 2),
  fio: cor('#5a567f'), fioPar: cor('#3a365a'), divisao: cor('#07060c'),
  sobrancelha: CONTORNO, sobrancelhaFunda: CONTORNO,
  iris: CONTORNO, irisClara: cor('#34304f'),
};

const SUPER: Cabeleira = {
  cabelo: tinta(cor('#ffe45a'), cor('#e0a21c'), cor('#6e3a06'), cor('#fffbd0'), 2),
  fio: cor('#fffbd0'), fioPar: cor('#fff08c'), divisao: cor('#c27a0e'),
  sobrancelha: cor('#e6a51c'), sobrancelhaFunda: cor('#8c500a'),
  iris: cor('#11736a'), irisClara: cor('#46dcc4'),
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

/**
 * A escala do desenho em curso, lida do esqueleto, que já chega multiplicado. Serve para o que não
 * passa pelos ajudantes do boneco — limiar em pixels, raio marcado à mão, deslocamento de dedo —,
 * que de outro jeito ficaria do tamanho da escala 1 num lutador 1,5 vez maior.
 */
const escalaDe = (e: Esqueleto) => e.corpo.tronco / corpoDoVegetal.tronco;

/** 1 se o `lado` positivo de `noOsso(a, b, …)` aponta para `alvo`; -1 se aponta para longe. */
const ladoDe = (a: P, b: P, alvo: P) => (-(b[1] - a[1]) * (alvo[0] - a[0]) + (b[0] - a[0]) * (alvo[1] - a[1]) >= 0 ? 1 : -1);

/**
 * Um decalque: pixels escritos à mão, presos a um ponto da cabeça. Com a cabeça de 18 px o olho é
 * questão de UM pixel, e forma rasterizada nenhuma acerta isso. Ele acompanha a cabeça por
 * cisalhamento — cada coluna desce inteira — e por quartos de volta (caído), e não girando pixel a
 * pixel, que abre buraco no risco e amontoa o miolo. `ancora` cai na casa do meio do desenho.
 */
function decalque(q: Quadro, e: Esqueleto, ancora: P, desenho: readonly string[], cores: Record<string, Cor>) {
  const giro = Math.round(e.angCabeca / 90);
  const s = Math.sin((e.angCabeca - giro * 90) * RAD);
  const ox = Math.floor(ancora[0]), oy = Math.floor(ancora[1]);
  const ci = Math.floor(desenho[0].length / 2), cj = Math.floor(desenho.length / 2);
  for (let j = 0; j < desenho.length; j++) {
    for (let i = 0; i < desenho[j].length; i++) {
      const c = cores[desenho[j][i]];
      if (c === undefined) continue;
      let dx = i - ci, dy = j - cj;
      [dx, dy] = [dx - Math.round(dy * s), dy + Math.round(dx * s)];
      for (let g = ((giro % 4) + 4) % 4; g > 0; g--) [dx, dy] = [-dy, dx];
      pixel(q, ox + dx, oy + dy, c);
    }
  }
}

/**
 * A dobra do macacão no lado de dentro de uma junta dobrada (cotovelo, joelho): um risco da sombra
 * do canto de dentro para o meio da junta. Sem ela o braço dobrado é um cano torto; com a junta
 * quase reta o pano não franze, e o risco não aparece.
 */
function dobra(q: Quadro, raiz: P, junta: P, ponta: P, raio: number, c: Cor) {
  const d1 = dir(angulo(junta, raiz)), d2 = dir(angulo(junta, ponta));
  const bx = d1[0] + d2[0], by = d1[1] + d2[1];
  const bl = Math.hypot(bx, by);
  // bl é 2·cos(meia abertura): perto de zero, a junta está reta
  if (bl < 0.55) return;
  const ux = bx / bl, uy = by / bl;
  // o canto de dentro fica a raio / sen(meia abertura) do centro da junta
  const canto = Math.min(raio / Math.sqrt(Math.max(0.01, 1 - (bl * bl) / 4)), raio * 1.9);
  linha(q, junta[0] + ux * raio * 0.3, junta[1] + uy * raio * 0.3, junta[0] + ux * (canto - 1.4), junta[1] + uy * (canto - 1.4), c);
}

type Lado = { ombro: P; cot: P; mao: P; frente: boolean };

const lado = (e: Esqueleto, frente: boolean): Lado => frente
  ? { ombro: e.ombroF, cot: e.cotoveloF, mao: e.maoF, frente }
  : { ombro: e.ombroT, cot: e.cotoveloT, mao: e.maoT, frente };

/**
 * O antebraço sozinho, do cotovelo à ponta dos dedos, sem a luva. O primeiro pedaço é o do cotovelo
 * (quem testa a ombreira o descarta). O músculo estufa perto do cotovelo, do lado de fora da dobra:
 * com o raio igual do cotovelo ao pulso, o braço era um cano.
 */
const formasDoAntebraco = ({ ombro, cot, mao }: Lado): Forma[] => {
  const fora = -ladoDe(cot, mao, ombro);
  return [
    { tipo: 'capsula', a: cot, b: noOsso(cot, mao, 0.4), ra: 2.9, rb: 3.1 },
    { tipo: 'capsula', a: noOsso(cot, mao, 0.4), b: mao, ra: 3.1, rb: 2.5 },
    { tipo: 'capsula', a: noOsso(cot, mao, 0.12, fora * 0.5), b: noOsso(cot, mao, 0.42, fora * 0.4), ra: 3.0, rb: 2.8 },
  ];
};

function luva(p: Pintor, e: Esqueleto, l: Lado) {
  const { cot, mao, frente } = l;
  const k = escalaDe(e);
  const branco = frente ? C.branco : C.brancoAtras;
  // o cano da luva é mais largo que o braço: é o que faz ela parecer luva, e não mão pintada
  p.peca([{ tipo: 'capsula', a: noOsso(cot, mao, 0.64), b: noOsso(cot, mao, 0.94), ra: 3.5, rb: 3.1 }], branco);
  // a boca do cano virada para fora: um risco atravessado logo depois da borda dá a espessura dela
  // (na escala 1 do retrato não sobra pixel entre o risco e a borda, e ele só sujaria)
  if (k > 1.2) {
    const b1 = noOsso(cot, mao, 0.73, 3.0), b2 = noOsso(cot, mao, 0.73, -3.0);
    linha(p.q, b1[0], b1[1], b2[0], b2[1], branco.sombra);
  }
  const aberta = (frente ? e.pose.maoF : e.pose.maoT) === 'aberta';
  if (aberta) {
    p.peca(formasDaMaoAberta(cot, mao, k), branco);
    if (k > 1.2) dedos(p.q, cot, mao, k, branco);
  } else {
    p.peca([{ tipo: 'elipse', c: noOsso(cot, mao, 1.12), rx: 3.3, ry: 3.2, ang: 90 - angulo(cot, mao) }], branco);
    if (k > 1.2) nosDosDedos(p.q, cot, mao, k, branco);
  }
}

/**
 * O punho fechado: a dobra entre o nó dos dedos e as falanges, atravessada, e dois riscos curtos
 * separando os dedos na frente. Sem isso o punho era uma bola branca, e soco e mão aberta só se
 * distinguiam pelo contorno.
 */
function nosDosDedos(q: Quadro, cot: P, mao: P, k: number, t: Tinta) {
  const d = dir(angulo(cot, mao));
  const n: P = [-d[1], d[0]];
  const em = (a: number, l: number): P => [mao[0] + (d[0] * a + n[0] * l) * k, mao[1] + (d[1] * a + n[1] * l) * k];
  const risco = (a: P, b: P) => linha(q, a[0], a[1], b[0], b[1], t.sombra);
  risco(em(2.1, -2.0), em(2.1, 1.7));
  risco(em(2.9, -0.8), em(3.7, -0.8));
  risco(em(2.9, 0.6), em(3.7, 0.6));
}

/**
 * A mão aberta. Com o antebraço deitado para a frente (o Canhão de Alho, a defesa), o pulso dobra
 * e a palma fica de pé, virada para o outro lutador: deitada na linha do braço, ela seria um golpe
 * de faca, e empilhar duas assim dá um bastão branco em vez de duas mãos. Com o braço caído ou
 * erguido, os dedos seguem o braço. A dobra cresce aos poucos com o ângulo, para a animação de um
 * para o outro não saltar.
 */
function referencialDaMao(cot: P, mao: P, k: number) {
  const braco = angulo(cot, mao);
  const dobra = Math.min(1, Math.max(0, (braco - 25) / 40)) * Math.min(80, Math.max(0, 172 - braco));
  const d = dir(braco + dobra);
  // o polegar sai do lado que aponta para cima (ou para a frente, com os dedos para cima)
  let n: P = [-d[1], d[0]];
  if (n[1] > 0.3) n = [-n[0], -n[1]];
  const pulso = noOsso(cot, mao, 0.98);
  // o deslocamento dos dedos não passa pelos ajudantes do boneco: sem o `k`, na escala 1,5 os
  // dedos ficavam do tamanho antigo, enterrados na palma já crescida
  const em = (a: number, l = 0): P => [pulso[0] + (d[0] * a + n[0] * l) * k, pulso[1] + (d[1] * a + n[1] * l) * k];
  return { em, ang: braco + dobra };
}

function formasDaMaoAberta(cot: P, mao: P, k: number): Forma[] {
  const { em, ang } = referencialDaMao(cot, mao, k);
  return [
    { tipo: 'elipse', c: em(2.4), rx: 2.9, ry: 2.6, ang: 90 - ang },
    { tipo: 'capsula', a: em(3.4, -0.3), b: em(6.0, -0.5), ra: 2.2, rb: 1.7 },
    { tipo: 'capsula', a: em(1.2, 2), b: em(3.2, 3.6), ra: 1.1, rb: 0.9 },
  ];
}

/** Dois cortes na ponta da mão aberta, que viram três dedos. Sem eles a palma é uma raquete. */
function dedos(q: Quadro, cot: P, mao: P, k: number, t: Tinta) {
  const { em } = referencialDaMao(cot, mao, k);
  for (const l of [-1.35, 0.3]) {
    const a = em(5.4, l), b = em(7.6, l - 0.1);
    linha(q, a[0], a[1], b[0], b[1], t.sombra);
  }
}

/** O braço de cima, com o bíceps estufando do lado da mão, que é o de dentro da dobra. */
const formasDoBracoSuperior = ({ ombro, cot, mao }: Lado): Forma[] => [
  { tipo: 'capsula', a: ombro, b: noOsso(ombro, cot, 0.55), ra: 4, rb: 3.6 },
  { tipo: 'capsula', a: noOsso(ombro, cot, 0.55), b: cot, ra: 3.6, rb: 2.9 },
  { tipo: 'elipse', c: noOsso(ombro, cot, 0.5, ladoDe(ombro, cot, mao) * 1.1), rx: 3.6, ry: 3.0, ang: 90 - angulo(ombro, cot) },
];

function braco(p: Pintor, e: Esqueleto, frente: boolean) {
  const l = lado(e, frente);
  const pano = frente ? C.marinho : C.marinhoAtras;
  // manga do macacão, braço inteiro numa peça só: o cotovelo não ganha risco no meio
  p.peca([...formasDoBracoSuperior(l), ...formasDoAntebraco(l)], pano);
  const k = escalaDe(e);
  if (k > 1.2) dobra(p.q, l.ombro, l.cot, l.mao, 3.1 * k, pano.sombra);
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
const cruzados = (e: Esqueleto) => {
  // as folgas são em pixels do sprite, e o esqueleto chega escalado: sem o `k` elas encolheriam
  const k = escalaDe(e);
  return aFrente(e, e.maoF) < aFrente(e, e.cotoveloF) - 3 * k && aFrente(e, e.maoT) > aFrente(e, e.cotoveloT) + 3 * k
    // e as mãos juntas: sem isso, um soco de trás com o braço da frente recolhido também passaria
    && dist(e.maoF, e.maoT) < 8 * k;
};

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
function formaDaOmbreira(e: Esqueleto, sentido: 1 | -1, descida = 0): Forma {
  // A da frente é mais curta e recuada: ela se abre para o lado de quem olha, e de perfil isso
  // aparece encurtado. Do mesmo tamanho da de trás ela passava 8 px à frente do ombro e virava
  // uma banana dourada atravessada no peito, na frente do queixo.
  const t = (f: number, h: number) => noTronco(e, sentido > 0 ? f * 0.8 - 1.8 : -f - 0.6, h - descida);
  return {
    tipo: 'poligono',
    pts: [t(2.6, 14.8), t(6.4, 16.4), t(10.4, 17.8), t(12.6, 20.2), t(13.2, 16.2), t(11.4, 12), t(6.6, 10.8), t(2.8, 12)],
  };
}

/** O brilho da ombreira: um risco claro no meio da placa, paralelo à borda de cima, e a faísca na ponta. */
function brilhoDaOmbreira(q: Quadro, e: Esqueleto, sentido: 1 | -1) {
  const t = (f: number, h: number) => noTronco(e, sentido > 0 ? f * 0.8 - 1.8 : -f - 0.6, h);
  const luz = sentido > 0 ? C.dourado.luz ?? C.dourado.base : C.dourado.base;
  const a = t(4.4, 13.9), b = t(10.2, 15.8);
  linha(q, a[0], a[1], b[0], b[1], luz);
  if (sentido > 0) {
    const f = t(11.6, 17.2);
    pixel(q, f[0], f[1], cor('#fff6d2'));
  }
}

/**
 * Ombreira por cima do braço e, se o antebraço estiver dobrado na frente dela (a guarda, o soco
 * armado), o antebraço de novo por cima. Sem isso a ombreira engole o punho da guarda; com a ordem
 * ao contrário, o braço caído passaria por cima da ombreira. Quem decide é a sobreposição
 * medida em pixels, e não o ângulo: o mesmo braço cruza a ombreira ou não conforme o tronco.
 */
function ombreira(p: Pintor, e: Esqueleto, frente: boolean) {
  const sentido = frente ? 1 : -1;
  const k = escalaDe(e);
  const forma = formaDaOmbreira(e, sentido);
  // A placa tem espessura: a mesma forma, um pouco mais baixa e mais escura, aparece embaixo da
  // borda. Chapada, a ombreira era um adesivo dourado colado no braço.
  const fundo = k > 1.2 ? formaDaOmbreira(e, sentido, 1.3) : null;
  if (fundo) p.peca([fundo], frente ? C.douradoFundo : { ...C.douradoFundo, base: C.douradoAtras.sombra, sombra: C.douradoFundo.sombra });
  p.peca([forma], frente ? C.dourado : C.douradoAtras);
  if (k > 1.2) brilhoDaOmbreira(p.q, e, sentido);
  // de braços cruzados o antebraço da frente está POR BAIXO do braço; trazê-lo por cima da
  // ombreira o traria também por cima do braço, e desfaria o cruzado
  if (frente && cruzados(e)) return;
  const l = lado(e, frente);
  if (!cobreAOmbreira(p, fundo ? [forma, fundo] : [forma], formasDoAntebraco(l), k)) return;
  p.peca(formasDoAntebraco(l), frente ? C.marinho : C.marinhoAtras);
  luva(p, e, l);
}

let mascaraDeTeste: Mascara | null = null;

/**
 * O antebraço, sem contar o cotovelo, cai em cima da ombreira? A máscara do pintor serve de
 * rascunho para a ombreira — toda peça a zera antes de marcar —, e a do antebraço é uma segunda,
 * guardada entre chamadas para não alocar uma a cada quadro. Aqui as formas vão direto para a
 * máscara, sem passar pelo pintor, e por isso os raios são escalados à mão: sem isso o antebraço
 * testado era o fino da escala 1, e o de verdade passava por baixo da ombreira que ele cobria.
 */
function cobreAOmbreira(p: Pintor, ombreira: Forma[], antebraco: Forma[], k: number): boolean {
  if (!mascaraDeTeste || mascaraDeTeste.l !== p.q.largura || mascaraDeTeste.a !== p.q.altura) {
    mascaraDeTeste = new Mascara(p.q.largura, p.q.altura);
  }
  const raios = (f: Forma): Forma => (f.tipo === 'capsula' ? { ...f, ra: f.ra * k, rb: f.rb * k }
    : f.tipo === 'elipse' ? { ...f, rx: f.rx * k, ry: f.ry * k } : f);
  const a = p.m;
  a.zerar();
  for (const f of ombreira) marcarForma(a, f);
  const b = mascaraDeTeste;
  b.zerar();
  // o pedaço do cotovelo encosta na ombreira em quase toda pose; o que conta é o resto
  const [cotovelo, ...resto] = antebraco;
  if (cotovelo.tipo === 'capsula') marcarForma(b, raios({ ...cotovelo, a: noOsso(cotovelo.a, cotovelo.b, 0.9) }));
  // o músculo nasce colado ao cotovelo e tocaria a ombreira junto com ele: fica de fora do teste
  marcarForma(b, raios(resto[0]));
  // quatro pixels em comum na escala 1 são uma área: cresce com o quadrado da escala
  const bastam = Math.round(4 * k * k);
  let comum = 0;
  for (let y = Math.max(a.y0, b.y0); y <= Math.min(a.y1, b.y1); y++) {
    for (let x = Math.max(a.x0, b.x0); x <= Math.min(a.x1, b.x1); x++) {
      if (a.tem(x, y) && b.tem(x, y) && ++comum >= bastam) return true;
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
  const k = escalaDe(e);
  const pano = frente ? C.marinho : C.marinhoAtras;
  const branco = frente ? C.branco : C.brancoAtras;
  // macacão justo: coxa grossa e canela fina, sem a calça larga do Goiaba
  p.peca([
    { tipo: 'capsula', a: quadril, b: joelho, ra: 5, rb: 4 },
    { tipo: 'capsula', a: joelho, b: noOsso(joelho, tornozelo, 0.6), ra: 4, rb: 3.3 },
  ], pano);
  if (k > 1.2) dobra(p.q, quadril, joelho, tornozelo, 4 * k, pano.sombra);
  // bota por cima do macacão, com a boca mais larga que a canela
  p.peca([
    { tipo: 'capsula', a: noOsso(joelho, tornozelo, 0.4), b: tornozelo, ra: 3.9, rb: 3.3 },
    formaDoPe(tornozelo, 7, 3.4, angPe),
  ], branco);
  if (k > 1.2) {
    // a boca do cano, como a da luva: o risco logo abaixo da borda é a espessura do couro
    const b1 = noOsso(joelho, tornozelo, 0.5, 3.3), b2 = noOsso(joelho, tornozelo, 0.5, -3.3);
    linha(p.q, b1[0], b1[1], b2[0], b2[1], branco.sombra);
  }
  p.peca([pedacoDoPe(tornozelo, angPe, k, 'biqueira')], frente ? C.dourado : C.douradoAtras);
  if (k > 1.2) p.peca([pedacoDoPe(tornozelo, angPe, k, 'sola')], { ...(frente ? C.sola : C.solaAtras), semContorno: true });
}

/**
 * A ponta dourada e a sola, no mesmo referencial de `formaDoPe`: x ao longo da sola, y para baixo.
 * As medidas passam pelo `k` à mão, porque a forma é montada aqui e não no ajudante do boneco: sem
 * isso a biqueira ficou do tamanho da escala 1, um grão dourado na ponta de uma bota 1,5 vez maior.
 */
function pedacoDoPe(tornozelo: P, ang: number, k: number, qual: 'biqueira' | 'sola'): Forma {
  const comprimento = 7 * k, altura = 3.4 * k, recuo = 2 * k;
  const a = ang * RAD;
  const f: P = [Math.cos(a), -Math.sin(a)];
  const up: P = [Math.sin(a), Math.cos(a)];
  const p = (x: number, y: number): P => [tornozelo[0] + f[0] * x - up[0] * y, tornozelo[1] + f[1] * x - up[1] * y];
  const chao = altura - 0.5;
  if (qual === 'sola') {
    // uma fileira só: a borda de baixo do pé menos um pixel, do calcanhar à ponta
    return { tipo: 'poligono', pts: [p(-recuo - 0.4, chao - 1.1), p(comprimento + 0.2, chao - 1.1), p(comprimento, chao), p(-recuo, chao)] };
  }
  // a ponta cobre a metade da frente, seguindo o peito do pé (a borda de cima de `formaDoPe`)
  const xa = comprimento * 0.52;
  const ya = -1.5 + ((xa - comprimento * 0.45) / (comprimento * 0.55 + 0.5)) * (altura * 0.4 + 1.5);
  return {
    tipo: 'poligono',
    pts: [p(xa, ya), p(comprimento * 0.46, chao), p(comprimento, chao), p(comprimento + 0.5, altura * 0.4)],
  };
}

function tronco(p: Pintor, e: Esqueleto) {
  const t = (f: number, h: number) => noTronco(e, f, h);
  // macacão: aparece na gola e embaixo da armadura
  p.peca([{ tipo: 'poligono', pts: [t(-7, 13.5), t(-3.8, 18.6), t(3.6, 18.8), t(8, 15), t(8.4, 9.5), t(6.8, 2.6), t(-5.6, 1.2), t(-7.4, 7)] }], C.marinho);
  const k = escalaDe(e);
  const risco = (a: P, b: P, c: Cor) => linha(p.q, a[0], a[1], b[0], b[1], c);
  // barriga dourada, em gomos, embaixo do peitoral
  p.peca([{ tipo: 'poligono', pts: [t(-6.4, 8.6), t(8.8, 9), t(8.2, 4.4), t(-5.6, 3.8)] }], C.dourado);
  if (k > 1.2) {
    // três gomos, cada um com o vinco escuro atrás e o fio claro na frente: é o relevo, e não a cor,
    // que diz "armadura" — um vinco só lia como um risco no cinto
    for (const f of [-2.6, 1.5, 5.4]) {
      risco(t(f, 7.4), t(f, 4.6), C.dourado.sombra);
      risco(t(f + 0.75, 7.4), t(f + 0.75, 5.2), C.dourado.luz ?? C.dourado.base);
    }
  } else {
    risco(t(1.5, 8), t(1.5, 5), C.dourado.sombra);
  }
  // peitoral branco, com o decote baixo que deixa a gola azul aparecer
  p.peca([{ tipo: 'poligono', pts: [t(-7.4, 15.2), t(-4, 16.8), t(1.4, 15.4), t(4.4, 16.9), t(9, 14.8), t(9.8, 10.4), t(8.8, 7.4), t(-6.2, 6.8), t(-7.8, 10)] }], C.branco);
  if (k > 1.2) {
    // a borda da placa: um friso cinza a dois pixels da beirada, pelo decote e pela frente, e a
    // aba de baixo sobre a barriga. O branco chapado não tinha relevo nenhum
    const friso = cor('#c9cfdf');
    risco(t(-6.2, 13.9), t(-3.9, 15.2), friso);
    risco(t(-3.9, 15.2), t(1.4, 13.9), friso);
    risco(t(1.4, 13.9), t(4.4, 15.3), friso);
    risco(t(4.4, 15.3), t(8.2, 13.6), friso);
    risco(t(-5.4, 8.5), t(8.3, 9.1), C.branco.sombra);
  }
  // o emblema: um quadradinho marinho com o miolo dourado, no meio do peito — mais para a frente,
  // a ombreira da frente o cobre. Na escala grande ele cresce um pixel e ganha o brilho no miolo
  const s = t(0.6, 10.8);
  const r = k > 1.2 ? 2 : 1;
  for (let dx = -r; dx <= 1; dx++) for (let dy = -r; dy <= 1; dy++) {
    const miolo = r === 1 ? dx === 0 && dy === 0 : dx >= -1 && dx <= 0 && dy >= -1 && dy <= 0;
    const c = !miolo ? C.marinho.base : r === 2 && dx === 0 && dy === -1 ? C.dourado.luz ?? C.dourado.base : C.dourado.base;
    pixel(p.q, s[0] + dx, s[1] + dy, c);
  }
}

/**
 * A linha do cabelo, da frente para trás. O bico desce quase até a sobrancelha e a entrada atrás
 * dele sobe funda: a pele da entrada precisa de uns três pixels de largura, porque o contorno do
 * cabelo come um de cada lado — com menos, o bico some e sobra uma franja. É a mesma nas duas
 * formas: o bico e as entradas são dele, loiro ou não.
 */
const LINHA_DO_CABELO: P[] = [
  [6.6, 9.2], [5.6, 8.4], [4.3, 3.4], [3.2, 8.6], [0.6, 8.2], [-0.4, 3.2], [-1.2, -0.6], [-2.6, 1.4],
  [-4.6, 0.8], [-5.4, -2.2],
];

const CABELO_NORMAL: P[] = [
  ...LINHA_DO_CABELO,
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

/**
 * O Super Vegetalzin: da testa para cima a chama se levanta. Mais alta — a ponta sobe uns nove
 * pixels — e quase de pé, com as línguas de trás subindo em vez de ir para trás. É a silhueta, antes
 * da cor, que separa as duas formas: só pintada de amarelo, a chama normal parecia uma peruca.
 */
const CABELO_SUPER: P[] = [
  ...LINHA_DO_CABELO,
  [-7.6, -0.2], [-9.4, 8.2], [-6.2, 9.0], [-8.4, 17.0], [-4.6, 15.2], [-5.4, 24.6], [-2.0, 20.8],
  [-0.4, 28.4], [2.4, 22.2], [4.4, 18.6], [4.2, 15.6], [6.6, 13.2], [5.6, 10.6],
];

/**
 * As mechas, riscadas por cima do cabelo. A divisão sai de cada vão para dentro, e o fio de brilho
 * corre logo abaixo dela, na borda de cima da língua de baixo, até a ponta: a língua de cima faz
 * sombra e a de baixo pega a luz, e é esse par que separa uma mecha da outra. Riscos claros soltos
 * no meio, como antes, liam como arranhão num bloco. `fiosPequenos` são os três do retrato, em
 * escala 1, onde não cabe mais que isso.
 */
type Mechas = { divisoes: [P, P][]; fios: [P, P][]; fiosPequenos: [P, P][] };

const MECHAS_NORMAL: Mechas = {
  divisoes: [[[-6.4, 8.4], [-4.5, 5.6]], [[-4.8, 13.8], [-3.0, 10.2]], [[-2.4, 17.6], [-1.1, 13.2]], [[4.6, 13.0], [2.9, 11.6]]],
  fios: [
    [[-4.9, 4.9], [-8.4, 6.2]], [[-3.5, 9.9], [-7.8, 13.3]], [[-1.8, 12.9], [-4.9, 18.6]],
    [[1.3, 12.0], [-0.3, 20.2]], [[3.3, 10.4], [5.7, 10.9]],
  ],
  fiosPequenos: [[[-4.4, 5.2], [-7.4, 11.0]], [[-1.8, 9.6], [-3.8, 16.6]], [[1.4, 11.4], [0.0, 19.0]]],
};

const MECHAS_SUPER: Mechas = {
  divisoes: [[[-6.2, 9.0], [-4.3, 5.8]], [[-4.6, 15.2], [-2.8, 11.0]], [[-2.0, 20.8], [-0.8, 15.0]], [[4.2, 15.6], [2.6, 13.8]]],
  fios: [
    [[-4.7, 5.4], [-8.2, 7.4]], [[-3.3, 10.8], [-7.2, 15.6]], [[-1.5, 15.0], [-4.5, 23.2]],
    [[1.0, 13.0], [-0.4, 25.0]], [[3.4, 12.0], [5.6, 12.9]],
  ],
  fiosPequenos: [[[-4.4, 5.6], [-7.6, 13.0]], [[-1.8, 10.4], [-4.0, 19.4]], [[1.4, 12.0], [0.0, 23.0]]],
};

/**
 * O rosto na escala da luta, desenhado pixel a pixel (ver `decalque`), a casa do meio caindo na
 * âncora. B/b: sobrancelha e a fileira de baixo dela; L: pálpebra; W: branco do olho; P/p: íris em
 * cima e embaixo; i: brilho; s: sombra da pele; M/m: lábio e o canto dele; r: dentro da boca; w: dente.
 *
 * A sobrancelha desce da têmpora e ENGOLE o canto de dentro do olho — é a carranca dele —, mas no
 * canto de fora fica um pixel de pele entre ela e a pálpebra: colada inteira, a sobrancelha e o olho
 * viravam uma tarja preta só. O branco fica atrás da íris porque ele olha para a frente.
 */
const OLHOS: Record<'abertos' | 'fechados' | 'nocaute', readonly string[]> = {
  abertos: [
    '.BB......',
    '.bBBB....',
    '...bbBB..',
    '.....bbB.',
    '..LLLLLb.',
    '..LWWPiL.',
    '...sspp..',
  ],
  // o "hunf" da vitória: a pálpebra fechada é um risco que cai no canto de fora
  fechados: [
    '.BB......',
    '.bBBB....',
    '...bbBB..',
    '.....bbB.',
    '.......b.',
    '...LLLLL.',
    '..L......',
  ],
  // nocauteado não franze nada: a sobrancelha sobe e desfaz a ruga, e é o que abre espaço para
  // o X — com ela franzida no lugar de sempre, o X encosta nela e o olho vira um borrão
  nocaute: [
    '..BBBB...',
    '.b....b..',
    '.........',
    '.........',
    '...L.L...',
    '....L....',
    '...L.L...',
  ],
};

/** A boca e a sombra do nariz, que fica logo acima dela, embaixo da ponta. */
const BOCAS: Record<'seria' | 'grito' | 'hunf', readonly string[]> = {
  // séria: reta, com o canto de trás um tom mais claro para não virar um bigode
  seria: ['........', '......s.', '........', '..mMMM..', '........'],
  grito: ['........', '......s.', '...MMMM.', '..MrrwM.', '...MMM..'],
  // de olho fechado e boca fechada é o "hunf" da vitória: o canto de trás sobe
  hunf: ['........', '......s.', '..m.....', '...MMM..', '........'],
};

function cabeca(p: Pintor, e: Esqueleto) {
  const k = escalaDe(e);
  const grande = k > 1.2;
  const superForma = e.pose.forma === 1;
  const cab = superForma ? SUPER : NORMAL;
  // o vento só inclina as pontas: a chama é dura, e a raiz não sai do lugar
  const vento = e.pose.vento ?? 0;
  const h = (f: number, a: number) => naCabeca(e, f - vento * Math.max(0, a - 4) * 0.12, a);
  const r = (f: number, a: number) => naCabeca(e, f, a);
  // rosto de queixo quadrado e testa alta: sem a testa, as entradas não têm onde aparecer
  const rosto: Forma[] = [
    { tipo: 'elipse', c: r(0, 0.3), rx: 5.4, ry: 5.8, ang: e.angCabeca },
    { tipo: 'poligono', pts: [r(-3.6, -2), r(4.4, -1.2), r(5.3, -4), r(4, -6.3), r(-1.6, -6)] },
    { tipo: 'poligono', pts: [r(-1.5, 5.6), r(2.8, 7.8), r(5.6, 6.6), r(6, 1.6), r(3.5, -0.5)] },
  ];
  // A ponta do nariz, na escala grande: o perfil era uma parede reta da testa ao queixo, e é o
  // bico do nariz que vira o rosto para a direita. No retrato ele seria um pixel solto.
  if (grande) rosto.push({ tipo: 'poligono', pts: [r(5.2, -0.4), r(6.6, -2.0), r(5.4, -2.9), r(4.8, -2.4)] });
  p.peca(rosto, C.pele);
  p.peca([{ tipo: 'elipse', c: r(-2.6, -0.8), rx: 1.4, ry: 2, ang: e.angCabeca }], { ...C.pele, faixa: 1 });

  p.peca([{ tipo: 'poligono', pts: (superForma ? CABELO_SUPER : CABELO_NORMAL).map(([f, a]) => h(f, a)) }], cab.cabelo);
  const mechas = superForma ? MECHAS_SUPER : MECHAS_NORMAL;
  const risco = ([a, b]: [P, P], c: Cor, par?: Cor) => {
    const pa = h(...a), pb = h(...b);
    if (par !== undefined) {
      // O fio ganha um par meio-tom, um pixel para o lado da sombra e mais curto nas duas pontas:
      // sozinho, um risco de 1 px some a 1x, e a mecha volta a ser bloco.
      let nx = pa[1] - pb[1], ny = pb[0] - pa[0];
      if (nx * -0.55 + ny * 0.83 < 0) { nx = -nx; ny = -ny; }
      const l = Math.hypot(nx, ny) || 1;
      const ox = Math.round(nx / l), oy = Math.round(ny / l);
      const em = (t: number) => [pa[0] + (pb[0] - pa[0]) * t + ox, pa[1] + (pb[1] - pa[1]) * t + oy];
      const [x0, y0] = em(0.15), [x1, y1] = em(0.72);
      linha(p.q, x0, y0, x1, y1, par);
    }
    linha(p.q, pa[0], pa[1], pb[0], pb[1], c);
  };
  if (grande) {
    for (const d of mechas.divisoes) risco(d, cab.divisao);
    for (const fio of mechas.fios) risco(fio, cab.fio, cab.fioPar);
  } else {
    for (const fio of mechas.fiosPequenos) risco(fio, cab.cabelo.luz ?? cab.cabelo.base);
  }

  if (grande) {
    const olhos = e.pose.olhos ?? 'abertos';
    const cores: Record<string, Cor> = {
      B: cab.sobrancelha, b: cab.sobrancelhaFunda, L: C.olho, W: C.claraDoOlho, P: cab.iris, p: cab.irisClara,
      i: C.branquinho, s: C.pele.sombra, M: C.labio, m: C.boca, r: C.boca, w: C.claraDoOlho,
    };
    decalque(p.q, e, r(2.4, 0.4), OLHOS[olhos], cores);
    decalque(p.q, e, r(3.73, -3.6), e.pose.grito ? BOCAS.grito : olhos === 'fechados' ? BOCAS.hunf : BOCAS.seria, cores);
  } else {
    rostoPequeno(p.q, e, cab, r);
  }
}

/** O rosto do retrato do placar, em escala 1: a cabeça tem 12 px e o olho é um risco de dois. */
function rostoPequeno(q: Quadro, e: Esqueleto, cab: Cabeleira, r: (f: number, a: number) => P) {
  const olhos = e.pose.olhos ?? 'abertos';
  // na forma super o olho é a íris clara, e a sobrancelha, a fileira escura dela: a clara some na pele
  const olho = e.pose.forma === 1 ? cab.iris : C.olho;
  const sobrancelha = cab.sobrancelhaFunda;
  const o = r(2.9, 0.2);
  if (olhos === 'abertos') {
    pixel(q, o[0], o[1], olho); pixel(q, o[0], o[1] + 1, olho);
    pixel(q, o[0] - 1, o[1] + 1, C.branquinho);
  } else if (olhos === 'fechados') {
    linha(q, o[0] - 1, o[1] + 1, o[0] + 1, o[1] + 1, C.olho);
  } else {
    pixel(q, o[0] - 1, o[1], C.olho); pixel(q, o[0] + 1, o[1] + 2, C.olho);
    pixel(q, o[0], o[1] + 1, C.olho); pixel(q, o[0] + 1, o[1], C.olho); pixel(q, o[0] - 1, o[1] + 2, C.olho);
  }
  if (olhos === 'nocaute') {
    const s1 = r(0.8, 3.4), s2 = r(4.4, 2.6);
    linha(q, s1[0], s1[1], s2[0], s2[1], sobrancelha);
  } else {
    // sobrancelha franzida em qualquer outra pose: desce forte para o nariz
    const s1 = r(0.6, 2.9), s2 = r(4.8, 1.2);
    linha(q, s1[0], s1[1], s2[0], s2[1], sobrancelha);
    const s3 = r(3.4, 1.2);
    linha(q, s3[0], s3[1], s2[0], s2[1], sobrancelha);
  }
  const b = r(3.8, -3.6);
  if (e.pose.grito) {
    pixel(q, b[0] - 1, b[1], C.olho); pixel(q, b[0], b[1], C.olho); pixel(q, b[0] + 1, b[1], C.olho);
    pixel(q, b[0], b[1] + 1, C.boca); pixel(q, b[0] + 1, b[1] + 1, C.olho);
  } else if (olhos === 'fechados') {
    pixel(q, b[0] - 1, b[1] - 1, C.boca); pixel(q, b[0], b[1], C.boca); pixel(q, b[0] + 1, b[1], C.boca);
  } else {
    pixel(q, b[0], b[1], C.boca); pixel(q, b[0] + 1, b[1], C.boca);
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

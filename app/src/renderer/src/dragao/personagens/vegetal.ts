/**
 * Vegetal — o rival orgulhoso, em proporção CHIBI, como a arte que o dono mandou: cabeça com o
 * cabelo perto de metade da altura, tronco curto, pernas curtas e grossas, luvas e botas robustas.
 * Do pé à ponta da chama ele mede o mesmo de antes; quem encolheu foi o corpo, e é a chama que
 * devolve a altura. O especial é o Canhão de Alho.
 *
 * Nada de contorno preto: cada peça fecha com um tom bem escuro da PRÓPRIA cor — bordô na pele,
 * terra no dourado, marinho no azul, ardósia no branco —, e a sombra puxa para o roxo enquanto a
 * luz puxa para o amarelo. Com o preto, o chibi virava adesivo recortado. A silhueta continua
 * sendo da chama e das OMBREIRAS.
 */
import { type Cor, type Quadro, cor, linha, pixel } from '../quadro.ts';
import {
  type Corpo, type Esqueleto, type Personagem, type Pintor, type Pose, angulo, dir, dist, formaDoPe, naCabeca, noOsso, noTronco, tinta,
} from '../boneco.ts';
import { Mascara, type Forma, type P, type Tinta, marcarForma } from '../raster.ts';

const RAD = Math.PI / 180;

/** Tinta com a passagem de sombra e de luz em xadrez: o acabamento pintado, só nas peças grandes. */
const pintada = (base: Cor, sombra: Cor, contorno: Cor, luz?: Cor): Tinta => ({ ...tinta(base, sombra, contorno, luz, 2), pontilhado: true });

// os contornos, um por material
const BORDO = cor('#6b2230');
const MARINHO = cor('#141447');
const ARDOSIA = cor('#383a62');
const TERRA = cor('#5c2612');

const C = {
  pele: pintada(cor('#fbd0a4'), cor('#e2917d'), BORDO, cor('#fff0cc')),
  // o azul da sombra vai para o índigo e o da luz para o ciano: é o matiz andando, e não só o brilho
  marinho: pintada(cor('#2f4bab'), cor('#2c2a78'), MARINHO, cor('#4d86dc')),
  marinhoAtras: pintada(cor('#27327f'), cor('#211f5a'), MARINHO),
  branco: pintada(cor('#f7f3e8'), cor('#b2b1d8'), ARDOSIA, cor('#fffbe2')),
  brancoAtras: pintada(cor('#c3c1dd'), cor('#9290bd'), ARDOSIA),
  dourado: tinta(cor('#f7b733'), cor('#cf6b2e'), TERRA, cor('#fff29a'), 2),
  douradoAtras: tinta(cor('#c47d2a'), cor('#984a22'), TERRA, undefined, 2),
  // a sola assenta a bota no chão: branca até embaixo, o pé parecia flutuar sobre o piso claro
  sola: tinta(cor('#4d4168'), cor('#3c3257'), cor('#1d1535'), undefined, 1),
  solaAtras: tinta(cor('#3e3456'), cor('#322a48'), cor('#1d1535'), undefined, 1),
  // o lado de dentro da ombreira, que aparece embaixo dela e dá a espessura da placa
  douradoFundo: tinta(cor('#b1592a'), cor('#823a1c'), TERRA, undefined, 1),
  cilio: cor('#2b1426'),
  branquinho: cor('#ffffff'),
  claraDoOlho: cor('#fbf6ee'),
  bochecha: cor('#f29a8a'),
  boca: cor('#b54d4f'),
  labio: cor('#7a2735'),
  dentroDaBoca: cor('#5e1a2c'),
  friso: cor('#cfcde6'),
};

/**
 * O que muda da testa para cima quando ele vira o Super Vegetalzin: o cabelo, a sobrancelha e a
 * íris. A roupa fica igual de propósito — quem diz que transformou é a cabeça, e o dourado do
 * cabelo contra o marinho da roupa já grita isso do outro lado da tela.
 */
type Cabeleira = {
  cabelo: Tinta;
  /** O fio de brilho, o meio-tom que corre ao lado dele e a divisão entre duas mechas. */
  fio: Cor; fioPar: Cor; divisao: Cor;
  /** A sobrancelha tem duas fileiras: a de baixo mais escura, senão a dourada some na pele. */
  sobrancelha: Cor; sobrancelhaFunda: Cor;
  /** A íris: o escuro de cima e o reflexo de baixo. */
  iris: Cor; irisClara: Cor;
};

// preto de anime é índigo: com o preto de verdade a chama perdia as mechas e virava um buraco
const NORMAL: Cabeleira = {
  cabelo: pintada(cor('#2e2748'), cor('#1c1630'), cor('#150e2c'), cor('#4b416e')),
  fio: cor('#7263a0'), fioPar: cor('#4a3e6c'), divisao: cor('#120d20'),
  sobrancelha: cor('#221a36'), sobrancelhaFunda: cor('#221a36'),
  iris: cor('#1f1834'), irisClara: cor('#4f5aa0'),
};

const SUPER: Cabeleira = {
  cabelo: pintada(cor('#ffe35c'), cor('#e89a36'), cor('#7a3a0c'), cor('#fffbd4')),
  fio: cor('#fffbe8'), fioPar: cor('#fff08e'), divisao: cor('#cf7f1c'),
  sobrancelha: cor('#eaa52a'), sobrancelhaFunda: cor('#9a520e'),
  iris: cor('#0f6c68'), irisClara: cor('#4ee0c6'),
};

export const corpoDoVegetal: Corpo = {
  tronco: 12.5,
  // o pescoço some debaixo do queixo: é a medida até o centro da cabeça, que no chibi é grande
  pescoco: 8.8,
  bracoSup: 7.8,
  antebraco: 7.2,
  coxa: 8.5,
  canela: 8.5,
  ombroF: [3.8, 10.2],
  ombroT: [-4.2, 10.6],
  quadrilF: [2.5, 1],
  quadrilT: [-2.5, 1],
};

/** O pé, igual para a bota e para a biqueira e a sola, que são montadas à parte. */
const PE = { comprimento: 7.2, altura: 3.6, recuo: 2 };

/**
 * A escala do desenho em curso, lida do esqueleto, que já chega multiplicado. Serve para o que não
 * passa pelos ajudantes do boneco — limiar em pixels, raio marcado à mão, deslocamento de dedo —,
 * que de outro jeito ficaria do tamanho da escala 1 num lutador 1,5 vez maior.
 */
const escalaDe = (e: Esqueleto) => e.corpo.tronco / corpoDoVegetal.tronco;

/** 1 se o `lado` positivo de `noOsso(a, b, …)` aponta para `alvo`; -1 se aponta para longe. */
const ladoDe = (a: P, b: P, alvo: P) => (-(b[1] - a[1]) * (alvo[0] - a[0]) + (b[0] - a[0]) * (alvo[1] - a[1]) >= 0 ? 1 : -1);

/**
 * Um decalque: pixels escritos à mão, presos a um ponto da cabeça. O olho grande de anime é questão
 * de UM pixel — o brilho, o cílio —, e forma rasterizada nenhuma acerta isso. Ele acompanha a cabeça
 * por cisalhamento — cada coluna desce inteira — e por quartos de volta (caído), e não girando pixel
 * a pixel, que abre buraco no risco e amontoa o miolo. `ancora` cai na casa do meio do desenho.
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
 * O antebraço sozinho, do cotovelo ao pulso, sem a luva. O primeiro pedaço é o do cotovelo (quem
 * testa a ombreira o descarta). O músculo estufa perto do cotovelo, do lado de fora da dobra: com o
 * raio igual do cotovelo ao pulso, o braço era um cano.
 */
const formasDoAntebraco = ({ ombro, cot, mao }: Lado): Forma[] => {
  const fora = -ladoDe(cot, mao, ombro);
  return [
    { tipo: 'capsula', a: cot, b: noOsso(cot, mao, 0.4), ra: 2.6, rb: 2.8 },
    { tipo: 'capsula', a: noOsso(cot, mao, 0.4), b: mao, ra: 2.8, rb: 2.4 },
    { tipo: 'capsula', a: noOsso(cot, mao, 0.12, fora * 0.4), b: noOsso(cot, mao, 0.42, fora * 0.3), ra: 2.7, rb: 2.5 },
  ];
};

/** Onde fica o centro do punho fechado, ao longo do antebraço: passa do pulso, como luva de chibi. */
const PUNHO = 1.22;

function luva(p: Pintor, e: Esqueleto, l: Lado) {
  const { cot, mao, frente } = l;
  const k = escalaDe(e);
  const branco = frente ? C.branco : C.brancoAtras;
  // o cano da luva é mais largo que o braço: é o que faz ela parecer luva, e não mão pintada
  p.peca([{ tipo: 'capsula', a: noOsso(cot, mao, 0.56), b: noOsso(cot, mao, 0.94), ra: 3.5, rb: 3.1 }], branco);
  // a boca do cano virada para fora: um risco atravessado logo depois da borda dá a espessura dela
  // (na escala 1 do retrato não sobra pixel entre o risco e a borda, e ele só sujaria)
  if (k > 1.2) {
    const b1 = noOsso(cot, mao, 0.66, 3.0), b2 = noOsso(cot, mao, 0.66, -3.0);
    linha(p.q, b1[0], b1[1], b2[0], b2[1], branco.sombra);
  }
  const aberta = (frente ? e.pose.maoF : e.pose.maoT) === 'aberta';
  if (aberta) {
    p.peca(formasDaMaoAberta(cot, mao, k), branco);
    if (k > 1.2) dedos(p.q, cot, mao, k, branco);
  } else {
    // o punho do chibi é quase do tamanho do rosto de perfil: mão pequena some a 1x
    p.peca([{ tipo: 'elipse', c: noOsso(cot, mao, PUNHO), rx: 3.9, ry: 3.7, ang: 90 - angulo(cot, mao) }], branco);
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
  const alem = (PUNHO - 1) * dist(cot, mao) / k;
  const em = (a: number, l: number): P => [mao[0] + (d[0] * (a + alem) + n[0] * l) * k, mao[1] + (d[1] * (a + alem) + n[1] * l) * k];
  const risco = (a: P, b: P) => linha(q, a[0], a[1], b[0], b[1], t.sombra);
  risco(em(0.9, -2.5), em(0.9, 2.2));
  risco(em(1.9, -1.0), em(3.1, -1.0));
  risco(em(1.9, 0.8), em(3.1, 0.8));
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
    { tipo: 'elipse', c: em(2.6), rx: 3.4, ry: 3.0, ang: 90 - ang },
    { tipo: 'capsula', a: em(3.8, -0.3), b: em(6.8, -0.6), ra: 2.6, rb: 2.0 },
    { tipo: 'capsula', a: em(1.3, 2.3), b: em(3.6, 4.3), ra: 1.3, rb: 1.1 },
  ];
}

/** Dois cortes na ponta da mão aberta, que viram três dedos. Sem eles a palma é uma raquete. */
function dedos(q: Quadro, cot: P, mao: P, k: number, t: Tinta) {
  const { em } = referencialDaMao(cot, mao, k);
  for (const l of [-1.5, 0.4]) {
    const a = em(6.1, l), b = em(8.6, l - 0.1);
    linha(q, a[0], a[1], b[0], b[1], t.sombra);
  }
}

/** O braço de cima, com o bíceps estufando do lado da mão, que é o de dentro da dobra. */
const formasDoBracoSuperior = ({ ombro, cot, mao }: Lado): Forma[] => [
  { tipo: 'capsula', a: ombro, b: noOsso(ombro, cot, 0.55), ra: 3.4, rb: 3.1 },
  { tipo: 'capsula', a: noOsso(ombro, cot, 0.55), b: cot, ra: 3.1, rb: 2.6 },
  { tipo: 'elipse', c: noOsso(ombro, cot, 0.5, ladoDe(ombro, cot, mao) * 0.9), rx: 3.0, ry: 2.5, ang: 90 - angulo(ombro, cot) },
];

function braco(p: Pintor, e: Esqueleto, frente: boolean) {
  const l = lado(e, frente);
  const pano = frente ? C.marinho : C.marinhoAtras;
  // manga do macacão, braço inteiro numa peça só: o cotovelo não ganha risco no meio
  p.peca([...formasDoBracoSuperior(l), ...formasDoAntebraco(l)], pano);
  const k = escalaDe(e);
  if (k > 1.2) dobra(p.q, l.ombro, l.cot, l.mao, 2.8 * k, pano.sombra);
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
 * não cabe: o antebraço curto do chibi vai do cotovelo só até o meio do peito. Então o cruzado é uma
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
 * por baixo. `sentido` 1 é a da frente, que se abre para a frente; -1 é a de trás. No chibi ela é
 * baixa e deitada: o queixo mora logo acima do ombro, e a ponta erguida de antes entrava no rosto.
 */
function formaDaOmbreira(e: Esqueleto, sentido: 1 | -1, descida = 0): Forma {
  // A da frente é mais curta e recuada: ela se abre para o lado de quem olha, e de perfil isso
  // aparece encurtado. Do mesmo tamanho da de trás ela virava uma banana dourada no peito.
  const t = (f: number, h: number) => noTronco(e, sentido > 0 ? f * 0.75 - 1.2 : -f - 0.4, h - descida);
  return {
    tipo: 'poligono',
    pts: [t(2.0, 9.8), t(5.0, 10.7), t(8.0, 11.2), t(10.4, 12.2), t(10.6, 9.8), t(9.2, 7.2), t(5.4, 6.5), t(2.2, 7.6)],
  };
}

/** O brilho da ombreira: um risco claro no meio da placa, paralelo à borda de cima, e a faísca na ponta. */
function brilhoDaOmbreira(q: Quadro, e: Esqueleto, sentido: 1 | -1) {
  const t = (f: number, h: number) => noTronco(e, sentido > 0 ? f * 0.75 - 1.2 : -f - 0.4, h);
  const luz = sentido > 0 ? C.dourado.luz ?? C.dourado.base : C.dourado.base;
  const a = t(3.6, 9.5), b = t(8.6, 10.5);
  linha(q, a[0], a[1], b[0], b[1], luz);
  if (sentido > 0) {
    const f = t(9.8, 11.1);
    pixel(q, f[0], f[1], cor('#fffbe0'));
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
  const fundo = k > 1.2 ? formaDaOmbreira(e, sentido, 1.1) : null;
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
  // perna curta e grossa de chibi: a coxa quase do largo do quadril
  p.peca([
    { tipo: 'capsula', a: quadril, b: joelho, ra: 5.0, rb: 4.2 },
    { tipo: 'capsula', a: joelho, b: noOsso(joelho, tornozelo, 0.6), ra: 4.2, rb: 3.6 },
  ], pano);
  if (k > 1.2) dobra(p.q, quadril, joelho, tornozelo, 4.2 * k, pano.sombra);
  // bota alta por cima do macacão, com a boca mais larga que a canela; ela começa abaixo do joelho
  // porque a ponta redonda do cano sobe um raio inteiro e cobriria a junta
  p.peca([
    { tipo: 'capsula', a: noOsso(joelho, tornozelo, 0.5), b: tornozelo, ra: 4.3, rb: 3.8 },
    formaDoPe(tornozelo, PE.comprimento, PE.altura, angPe, PE.recuo),
  ], branco);
  if (k > 1.2) {
    // a boca do cano, como a da luva: o risco logo abaixo da borda é a espessura do couro
    const b1 = noOsso(joelho, tornozelo, 0.62, 4.0), b2 = noOsso(joelho, tornozelo, 0.62, -4.0);
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
  const comprimento = PE.comprimento * k, altura = PE.altura * k, recuo = PE.recuo * k;
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
  // macacão: aparece na gola e embaixo da armadura. Tronco de chibi: curto e em barril
  p.peca([{ tipo: 'poligono', pts: [t(-6.6, 10.7), t(-3.6, 13.5), t(3.4, 13.7), t(6.8, 11.3), t(7.4, 6.9), t(7.0, 0.9), t(-6.2, 0.0), t(-7.4, 5.1)] }], C.marinho);
  const k = escalaDe(e);
  const risco = (a: P, b: P, c: Cor) => linha(p.q, a[0], a[1], b[0], b[1], c);
  // barriga dourada, em gomos, embaixo do peitoral
  p.peca([{ tipo: 'poligono', pts: [t(-6.6, 6.3), t(7.8, 6.7), t(7.4, 2.6), t(-6.0, 2.0)] }], C.dourado);
  if (k > 1.2) {
    // três gomos, cada um com o vinco escuro atrás e o fio claro na frente: é o relevo, e não a cor,
    // que diz "armadura" — um vinco só lia como um risco no cinto
    for (const f of [-2.4, 1.4, 5.0]) {
      risco(t(f, 5.2), t(f, 3.1), C.dourado.sombra);
      risco(t(f + 0.75, 5.2), t(f + 0.75, 3.6), C.dourado.luz ?? C.dourado.base);
    }
  } else {
    risco(t(1.4, 5.6), t(1.4, 3.3), C.dourado.sombra);
  }
  // peitoral branco, com o decote baixo que deixa a gola azul aparecer
  p.peca([{ tipo: 'poligono', pts: [t(-7.0, 11.1), t(-3.8, 12.6), t(1.0, 11.5), t(3.6, 12.8), t(7.8, 11.1), t(8.6, 8.3), t(8.0, 5.7), t(-6.2, 5.2), t(-7.6, 7.8)] }], C.branco);
  if (k > 1.2) {
    // a borda da placa: um friso a dois pixels da beirada, pelo decote, e a aba de baixo sobre a
    // barriga. O branco chapado não tinha relevo nenhum
    risco(t(-6.0, 10.1), t(-3.7, 11.3), C.friso);
    risco(t(-3.7, 11.3), t(1.0, 10.2), C.friso);
    risco(t(1.0, 10.2), t(3.6, 11.4), C.friso);
    risco(t(3.6, 11.4), t(7.0, 10.0), C.friso);
    risco(t(-5.4, 6.5), t(7.8, 6.9), C.branco.sombra);
  }
  // o emblema: um quadradinho marinho com o miolo dourado, no meio do peito — mais para a frente,
  // a ombreira da frente o cobre. Na escala grande ele cresce um pixel e ganha o brilho no miolo
  const s = t(0.2, 8.7);
  const r = k > 1.2 ? 2 : 1;
  for (let dx = -r; dx <= 1; dx++) for (let dy = -r; dy <= 1; dy++) {
    const miolo = r === 1 ? dx === 0 && dy === 0 : dx >= -1 && dx <= 0 && dy >= -1 && dy <= 0;
    const c = !miolo ? C.marinho.base : r === 2 && dx === 0 && dy === -1 ? C.dourado.luz ?? C.dourado.base : C.dourado.base;
    pixel(p.q, s[0] + dx, s[1] + dy, c);
  }
}

/**
 * A linha do cabelo, da frente para trás. O bico desce até perto da sobrancelha e a entrada atrás
 * dele sobe funda: a pele da entrada precisa de uns três pixels de largura, porque o contorno do
 * cabelo come um de cada lado — com menos, o bico some e sobra uma franja. Depois a costeleta desce
 * na frente da orelha e a nuca fecha atrás. É a mesma nas duas formas: o bico é dele, loiro ou não.
 */
const LINHA_DO_CABELO: P[] = [
  [8.4, 4.4], [6.6, 6.0], [4.8, 2.6], [3.0, 6.0], [0.6, 5.4], [-1.4, 2.8], [-2.4, 0.2], [-3.6, 2.6],
  [-5.4, 2.0], [-6.8, -1.4],
];

const CABELO_NORMAL: P[] = [
  ...LINHA_DO_CABELO,
  // As costas: poucas línguas grandes subindo, com vão fundo entre elas. O que diz "chama" é a
  // diferença entre as línguas, não a quantidade — oito pontas iguais viravam serrote.
  [-9.8, 0.6], [-8.6, 4.2], [-12.2, 8.6], [-8.0, 10.6], [-10.0, 16.4], [-5.4, 15.8], [-5.6, 21.6], [-2.4, 19.4],
  // A ponta, puxada um pouco para trás, e a frente descendo em dois topetes até a testa. A chama
  // é alta e estreita de propósito: é o que se reconhece dele.
  [-1.2, 25.4], [2.0, 20.0], [4.8, 17.6], [4.4, 15.2], [7.6, 13.0], [6.6, 11.0], [9.4, 8.6], [8.2, 7.4],
];

/**
 * O Super Vegetalzin: da testa para cima a chama se levanta. Mais alta — a ponta sobe uns seis
 * pontos — e quase de pé, com as línguas de trás subindo em vez de ir para trás. É a silhueta, antes
 * da cor, que separa as duas formas: só pintada de amarelo, a chama normal parecia uma peruca.
 */
const CABELO_SUPER: P[] = [
  ...LINHA_DO_CABELO,
  [-9.6, 1.4], [-8.0, 5.2], [-11.0, 11.4], [-7.2, 12.2], [-8.8, 19.6], [-4.8, 18.0], [-4.6, 25.8], [-1.8, 22.6],
  [-0.4, 31.0], [2.6, 24.2], [4.6, 20.8], [4.2, 17.8], [7.2, 15.2], [6.4, 12.8], [9.0, 10.2], [8.2, 8.0],
];

/**
 * As mechas, riscadas por cima do cabelo. A divisão sai de cada vão para dentro, e o fio de brilho
 * corre logo abaixo dela, na borda de cima da língua de baixo, até a ponta: a língua de cima faz
 * sombra e a de baixo pega a luz, e é esse par que separa uma mecha da outra. `fiosPequenos` são os
 * três do retrato, em escala 1, onde não cabe mais que isso.
 */
type Mechas = { divisoes: [P, P][]; fios: [P, P][]; fiosPequenos: [P, P][] };

const MECHAS_NORMAL: Mechas = {
  divisoes: [
    [[-8.6, 4.2], [-6.4, 3.0]], [[-8.0, 10.6], [-5.6, 7.6]], [[-5.4, 15.8], [-3.6, 11.6]], [[-2.4, 19.4], [-1.4, 14.6]],
    [[4.4, 15.2], [2.4, 13.4]], [[6.6, 11.0], [4.6, 9.8]],
  ],
  fios: [
    [[-6.2, 2.0], [-9.0, 0.9]], [[-5.4, 6.8], [-11.0, 8.4]], [[-3.8, 10.6], [-9.0, 15.8]], [[-1.8, 13.6], [-5.0, 20.6]],
    [[0.8, 13.0], [-0.8, 23.6]], [[3.2, 12.2], [6.8, 12.4]], [[5.2, 8.8], [8.6, 8.4]],
  ],
  fiosPequenos: [[[-5.4, 6.8], [-9.6, 8.6]], [[-2.0, 12.0], [-4.6, 19.0]], [[1.0, 12.4], [-0.6, 22.0]]],
};

const MECHAS_SUPER: Mechas = {
  divisoes: [
    [[-8.0, 5.2], [-5.8, 3.8]], [[-7.2, 12.2], [-5.0, 8.8]], [[-4.8, 18.0], [-3.0, 13.4]], [[-1.8, 22.6], [-0.8, 16.8]],
    [[4.2, 17.8], [2.2, 15.8]], [[6.4, 12.8], [4.4, 11.4]],
  ],
  fios: [
    [[-5.6, 2.8], [-8.8, 1.6]], [[-4.8, 8.0], [-10.0, 11.2]], [[-3.2, 12.4], [-8.0, 19.0]], [[-1.2, 15.8], [-4.2, 24.8]],
    [[1.0, 15.0], [-0.2, 29.0]], [[3.0, 14.6], [6.6, 15.0]], [[4.8, 10.4], [8.2, 10.0]],
  ],
  fiosPequenos: [[[-4.8, 8.0], [-9.4, 11.0]], [[-1.4, 13.0], [-4.0, 23.0]], [[1.0, 14.0], [0.0, 27.0]]],
};

/**
 * O olho de anime, na escala da luta, desenhado pixel a pixel (ver `decalque`), a casa do meio caindo
 * na âncora. B/b: sobrancelha e a fileira de baixo dela; L: cílio; W: branco do olho; P/p: íris e o
 * reflexo de baixo; i: brilho; k: bochecha.
 *
 * Grande e alto como o da arte do dono, mas com a sobrancelha descendo para o nariz por cima dele —
 * é a carranca que faz um olho de chibi ser do Vegetal. Na ponta de fora sobra pele entre a
 * sobrancelha e o cílio: colados inteiros, os dois viravam uma tarja escura só. O branco fica atrás
 * da íris porque ele olha para a frente.
 */
const OLHOS: Record<'abertos' | 'fechados' | 'nocaute', readonly string[]> = {
  abertos: [
    'BBb........',
    '.bBBBb.....',
    '....bBBBb..',
    '........bb.',
    '.LLLLLLLLL.',
    'LLWWPPiPPL.',
    '..WWPPPPP..',
    '..WWPppPP..',
    '...WPpppP..',
    '....PPPP...',
    '.kk........',
  ],
  // o "hunf" da vitória: o cílio fechado é um arco que cai no canto de fora
  fechados: [
    'BBb........',
    '.bBBBb.....',
    '....bBBBb..',
    '........bb.',
    '...........',
    '...........',
    '..LLLLLLLL.',
    '.LL........',
    'L..........',
    '...........',
    '.kk........',
  ],
  // nocauteado não franze nada: a sobrancelha sobe e desfaz a ruga, e é o que abre espaço para o X
  nocaute: [
    '..BBBB.....',
    '.b....b....',
    '...........',
    '...........',
    '...........',
    '...L...L...',
    '....L.L....',
    '.....L.....',
    '....L.L....',
    '...L...L...',
    '...........',
  ],
};

/** A boca, pequena e perto do queixo: colada no olho, o grito virava uma mancha vermelha no rosto. */
const BOCAS: Record<'seria' | 'grito' | 'hunf', readonly string[]> = {
  seria: ['.......', '..mMM..', '.......'],
  grito: ['..MMMM.', '..MrrM.', '...MM..'],
  // de olho fechado e boca fechada é o "hunf" da vitória: o canto de trás sobe
  hunf: ['.m.....', '..MMM..', '.......'],
};

/**
 * O rosto do retrato do placar, em escala 1: o olho é o branco e a íris lado a lado, dois pixels de
 * altura, como na arte do dono. Sem cílio: com ele, sobrancelha e olho viravam uma mancha só.
 */
const OLHOS_PEQUENOS: Record<'abertos' | 'fechados' | 'nocaute', readonly string[]> = {
  abertos: ['BB...', '..BB.', '.WP..', '.WP..', '.....'],
  fechados: ['BB...', '..BB.', '.....', 'LLL..', '.....'],
  nocaute: ['.BB..', '.....', 'L.L..', '.L...', 'L.L..'],
};
const BOCAS_PEQUENAS: Record<'seria' | 'grito' | 'hunf', readonly string[]> = {
  seria: ['...', '.MM', '...'],
  grito: ['MMM', 'MrM', '.M.'],
  hunf: ['M..', '.MM', '...'],
};

/**
 * A cabeça cresce inteira — crânio, chama e mechas — por este fator, e só os decalques ficam no
 * tamanho de pixel. É a cabeça grande que faz o chibi; o corpo encolheu para a altura não mudar.
 */
const CABECA = 1.1;

function cabeca(p: Pintor, e: Esqueleto) {
  const k = escalaDe(e);
  const grande = k > 1.2;
  const superForma = e.pose.forma === 1;
  const cab = superForma ? SUPER : NORMAL;
  // o vento só inclina as pontas: a chama é dura, e a raiz não sai do lugar
  const vento = e.pose.vento ?? 0;
  const h = (f: number, a: number) => naCabeca(e, (f - vento * Math.max(0, a - 6) * 0.12) * CABECA, a * CABECA);
  const r = (f: number, a: number) => naCabeca(e, f * CABECA, a * CABECA);
  // cabeça de chibi: o crânio é quase um círculo, e a bochecha desce para a frente num queixo pequeno
  p.peca([
    { tipo: 'elipse', c: r(-0.4, 0.6), rx: 8.0 * CABECA, ry: 7.7 * CABECA, ang: e.angCabeca },
    { tipo: 'poligono', pts: [r(-4.6, -3.0), r(-1.0, -6.6), r(3.0, -7.6), r(5.8, -6.2), r(7.4, -3.2), r(7.6, 0.2), r(3.0, 1.0)] },
  ], C.pele);
  // a orelha é um risco rosado dentro do rosto: com o contorno bordô de peça ela virava um aro
  p.peca([{ tipo: 'elipse', c: r(-3.8, -1.4), rx: 1.6, ry: 2.2, ang: e.angCabeca }], { ...C.pele, faixa: 1, pontilhado: false, linha: C.pele.sombra });

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

  const olhos = e.pose.olhos ?? 'abertos';
  const boca = e.pose.grito ? 'grito' : olhos === 'fechados' ? 'hunf' : 'seria';
  const cores: Record<string, Cor> = {
    B: cab.sobrancelha, b: cab.sobrancelhaFunda, L: C.cilio, W: C.claraDoOlho, P: cab.iris, p: cab.irisClara,
    i: C.branquinho, k: C.bochecha, s: C.pele.sombra, M: C.labio, m: C.boca, r: C.dentroDaBoca, w: C.claraDoOlho,
  };
  if (grande) {
    decalque(p.q, e, r(3.2, -1.6), OLHOS[olhos], cores);
    decalque(p.q, e, r(4.4, -6.2), BOCAS[boca], cores);
  } else {
    // no retrato a íris é a cor inteira: o reflexo não cabe, e a íris clara some na pele
    decalque(p.q, e, r(3.2, -1.4), OLHOS_PEQUENOS[olhos], { ...cores, P: superForma ? cab.iris : C.cilio, b: cab.sobrancelhaFunda, B: cab.sobrancelhaFunda });
    decalque(p.q, e, r(4.6, -5.2), BOCAS_PEQUENAS[boca], cores);
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
 * As três poses de apresentação, medidas para o corpo chibi dele. Os braços do especial vão por
 * alvo, porque o que importa ali é onde as palmas param; os da vitória, por ângulo, porque o cruzado
 * é a relação entre os ossos, e ângulo acompanha o ombro se a pose respirar.
 */
export const vitrine: { parado: Pose; especial: Pose; vitoria: Pose } = {
  // base firme, guarda com os punhos logo abaixo do queixo: mais alto, o punho da frente tapava a
  // boca e o de trás sumia atrás da cabeça grande
  parado: {
    quadril: [-1, -17], tronco: 8, cabeca: -8,
    pernaF: { alvo: [7, -3] }, pernaT: { alvo: [-7, -3] },
    bracoF: { alvo: [13.5, -26.5] }, bracoT: { alvo: [9, -24.5] },
  },
  // Canhão de Alho: tronco jogado para a frente, os dois braços esticados e as duas palmas de pé,
  // a de trás por cima e um palmo atrás. Uma exatamente sobre a outra não cabe de braço esticado:
  // o boneco não gira o tronco, e a mão de trás só alcança até o cotovelo do outro braço.
  especial: {
    quadril: [-3, -16], tronco: 10, cabeca: -10,
    pernaF: { alvo: [9, -3] }, pernaT: { alvo: [-11, -3] },
    bracoF: { alvo: [21, -24] }, bracoT: { alvo: [21, -28] },
    maoF: 'aberta', maoT: 'aberta', grito: true,
  },
  // braços cruzados de cotovelo a cotovelo, queixo para cima, olho fechado e o canto da boca subindo
  vitoria: {
    quadril: [0, -18.5], tronco: -2, cabeca: -8,
    pernaF: { alvo: [5, -3] }, pernaT: { alvo: [-6, -3] },
    bracoF: { ang: [41, -145] }, bracoT: { ang: [-24, 125] },
    olhos: 'fechados',
  },
};

/**
 * Os efeitos do Dragão Quadrado: o ki (a bola que voa, a onda, o raio com espiral, a aura de quem
 * carrega) e o que marca o golpe (a estrela do impacto, a poeira do chão, o escudo da defesa).
 *
 * Tudo em pixels no mesmo `Quadro` dos lutadores, com as regras deles: borda dura, poucos tons e
 * nada de transparência de verdade. Um efeito com meio-tom suavizado ao lado de um lutador de
 * contorno de um pixel parece colado de outro jogo — e o quadro não tem alfa, então "translúcido"
 * aqui é pontilhado, como no fliperama.
 *
 * Cada efeito de ki tem QUATRO tons, do miolo para fora: núcleo quase branco, meio, borda e um
 * escuro que só aparece como contorno. O escuro é o que faz a onda azul existir sobre o céu azul
 * do torneio; sobre o planeta escuro ele some, e o miolo claro é que segura a leitura.
 *
 * A animação anda em QUADROS DISCRETOS contados do `tique` (60 por segundo): a onda muda de desenho
 * a cada 2 tiques, a bola a cada 3, a aura a cada 5. Mexer um pouco a cada tique é o jeito de o
 * efeito parecer desenho de programa; trocar de desenho em degraus é o que o fliperama fazia. E nada
 * sorteia de verdade: o mesmo `tique` desenha o mesmo efeito em todo computador, como o cenário.
 *
 * O ki é desenhado em coordenadas da TELA, mas as ondulações são contadas a partir de onde o efeito
 * nasce (a mão): assim a onda não "escorrega" por dentro de si mesma quando a câmera anda.
 */
import { type Cor, type Quadro, cor, linha, pixel } from './quadro.ts';
import { Mascara, type Forma, type P, marcarForma, pintarMascara } from './raster.ts';
import { pontilhar } from './cenario.ts';
import type { IdDoLutador } from './tipos.ts';

export type CoresDeKi = { nucleo: Cor; meio: Cor; borda: Cor; escuro: Cor };

/**
 * A cor do ki de cada lutador. O Vegetal é violeta com o miolo AMARELO: dois tons complementares
 * é o que separa o raio dele do da Geladeira, que também puxa para o rosa — com os dois em
 * roxo-e-branco, uma onda contra a outra viraria uma mancha só no meio da tela.
 */
export const CORES_DE_KI: Record<IdDoLutador, CoresDeKi> = {
  goiaba: { nucleo: cor('#f2fdff'), meio: cor('#9ce6ff'), borda: cor('#38a9ee'), escuro: cor('#1b4f9c') },
  vegetal: { nucleo: cor('#fff8c4'), meio: cor('#d7a2ff'), borda: cor('#9446e0'), escuro: cor('#431a82') },
  picole: { nucleo: cor('#fffff0'), meio: cor('#ffe75e'), borda: cor('#f4a519'), escuro: cor('#94500c') },
  geladeira: { nucleo: cor('#fff0fa'), meio: cor('#ff9ddd'), borda: cor('#e2359c'), escuro: cor('#7a124f') },
  // o Blue é anil, mais fundo que o azul-céu do Goiaba: os dois raios se encontrando não viram um só
  goiabaSuper: { nucleo: cor('#eef4ff'), meio: cor('#86a8ff'), borda: cor('#3b5cf0'), escuro: cor('#1a268a') },
  // a Alface Final é verde: é o único ki verde, e o nome pede
  vegetalSuper: { nucleo: cor('#f6fff0'), meio: cor('#b9f59c'), borda: cor('#4cc23a'), escuro: cor('#1d5e1a') },
  // o fantasma é branco e lilás, mais pálido que o violeta do Vegetal
  goteira: { nucleo: cor('#ffffff'), meio: cor('#eeeaff'), borda: cor('#ada0ee'), escuro: cor('#4d3f9c') },
  // a onda do Gotinha é turquesa: a do pai é azul-céu, e as duas se encontrando não viram uma só
  gotinha: { nucleo: cor('#effffb'), meio: cor('#8ff5e0'), borda: cor('#22c4b0'), escuro: cor('#0b5e5a') },
  // o Ataque Tostado é laranja-queimado: nenhum outro ki puxa para o vermelho
  tronco: { nucleo: cor('#fff4e8'), meio: cor('#ffb27a'), borda: cor('#f0602a'), escuro: cor('#7a2408') },
};

/** As cores de fora do ki: a estrela do golpe é sempre branca e amarela, venha de quem vier. */
const IMPACTO = { branco: cor('#ffffff'), claro: cor('#fff4a0'), amarelo: cor('#ffcc2e'), laranja: cor('#ee7a14'), escuro: cor('#8c3308') };
/** O escudo da defesa é azul-gelo, frio de propósito: quem defendeu não tomou o golpe. */
const DEFESA = { branco: cor('#ffffff'), claro: cor('#c8f0ff'), meio: cor('#6cc0ff'), borda: cor('#2e6ad6'), escuro: cor('#142f7a') };
/** A poeira é clara e de contorno médio: contorno escuro e sombra forte a transformavam em pedra. */
const POEIRA = { luz: cor('#fdfaf2'), base: cor('#e8dfce'), sombra: cor('#c7b9a2'), contorno: cor('#94826b') };

/** Quantos quadros cada efeito de golpe tem: quem chama sabe quando parar de desenhar. */
export const QUADROS = { faiscaForte: 6, faiscaFraca: 4, poeira: 5, bloqueio: 5 } as const;

// ─── O que todo efeito usa ─────────────────────────────────────────────────────────────────────

/** Duas máscaras do tamanho da tela, reaproveitadas: efeito é desenhado a cada quadro, e alocar custa. */
let mascaraA: Mascara | null = null;
let mascaraB: Mascara | null = null;
function mascaras(q: Quadro): [Mascara, Mascara] {
  if (!mascaraA || !mascaraB || mascaraA.l !== q.largura || mascaraA.a !== q.altura) {
    mascaraA = new Mascara(q.largura, q.altura);
    mascaraB = new Mascara(q.largura, q.altura);
  }
  return [mascaraA, mascaraB];
}

const lisa = (base: Cor, contorno?: Cor) =>
  ({ base, sombra: base, contorno: contorno ?? base, faixa: 0, semContorno: contorno === undefined });

/**
 * Uma camada de um efeito: as formas viram uma mancha só, de uma cor, com contorno de um pixel se
 * vier `contorno`. As faixas do ki são camadas uma dentro da outra, pintadas de fora para dentro —
 * é a mesma regra da peça do lutador, e é por isso que o raio e o boneco parecem do mesmo desenho.
 */
function mancha(q: Quadro, formas: Forma[], base: Cor, contorno?: Cor) {
  if (formas.length === 0) return;
  const [m] = mascaras(q);
  m.zerar();
  for (const f of formas) marcarForma(m, f);
  pintarMascara(q, m, lisa(base, contorno));
}

/** Um anel: as formas de fora menos as de dentro. O contorno sai dos dois lados, como num aro de verdade. */
function anel(q: Quadro, fora: Forma[], dentro: Forma[], base: Cor, contorno?: Cor) {
  const [a, b] = mascaras(q);
  a.zerar(); b.zerar();
  for (const f of fora) marcarForma(a, f);
  for (const f of dentro) marcarForma(b, f);
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (b.tem(x, y)) a.m[y * a.l + x] = 0;
  pintarMascara(q, a, lisa(base, contorno));
}

/** Sorteio sem estado: o mesmo `(a, b, c)` dá sempre o mesmo número entre 0 e 1. */
function sorte(a: number, b = 0, c = 0): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Em que quadro de um ciclo de `n` desenhos o efeito está, trocando a cada `passo` tiques. Nunca
 * negativo: índice negativo numa tabela de desenhos derrubaria a luta inteira por um efeito.
 */
const ciclo = (tique: number, passo: number, n: number) => ((Math.floor(tique / passo) % n) + n) % n;

/** O referencial do efeito: `u` para onde ele vai, `v` para baixo. É o que espelha tudo de uma vez. */
const noEfeito = (x0: number, y0: number, direcao: 1 | -1) => (u: number, v: number): P => [x0 + u * direcao, y0 + v];

/** Uma estrela: pontas longas e curtas alternadas em volta de um centro. */
function estrela(c: P, pontas: number, rLonga: number, rCurta: number, giro: number): Forma {
  const pts: P[] = [];
  for (let i = 0; i < pontas * 2; i++) {
    const ang = giro + (i * Math.PI) / pontas;
    const r = i % 2 === 0 ? rLonga : rCurta;
    pts.push([c[0] + Math.cos(ang) * r, c[1] + Math.sin(ang) * r]);
  }
  return { tipo: 'poligono', pts };
}

const circulo = (c: P, r: number): Forma => ({ tipo: 'elipse', c, rx: r, ry: r });

/**
 * Uma bola de beirada irregular, que muda a cada `quadro`: energia não tem borda de compasso.
 * `esticar` alonga na horizontal, que é para onde o raio anda.
 */
function bolaCrespa(c: P, r: number, lados: number, crespo: number, quadro: number, esticar = 1): Forma {
  const pts: P[] = [];
  for (let i = 0; i < lados; i++) {
    const ang = (i * 2 * Math.PI) / lados;
    const rr = r * (1 + (sorte(i, quadro, 23) - 0.5) * 2 * crespo);
    pts.push([c[0] + Math.cos(ang) * rr * esticar, c[1] + Math.sin(ang) * rr]);
  }
  return { tipo: 'poligono', pts };
}

// ─── A bola de ki ──────────────────────────────────────────────────────────────────────────────

/**
 * A rajada pequena que voa. O miolo branco fica na FRENTE da bola e as línguas de chama ficam
 * atrás, como no desenho à mão de uma coisa rápida: bola com o miolo no centro parece parada no
 * ar, e um rabo único e liso parece uma gota. `x, y` é o centro da bola.
 */
export function desenharRajada(q: Quadro, x: number, y: number, tique: number, cores: CoresDeKi, direcao: 1 | -1) {
  const quadro = ciclo(tique, 3, 4);
  const p = noEfeito(Math.round(x), Math.round(y), direcao);
  const pulso = quadro % 2 === 0 ? 0 : 0.5;

  // três línguas para trás — a do meio mais comprida —, e o comprimento de cada uma troca por quadro
  const COMPRIMENTOS = [[11, 16, 9], [9, 13, 12], [12, 17, 8], [8, 14, 11]][quadro];
  const lingua = (i: number, largura: number, escala: number): Forma => {
    const ang = Math.PI + (i - 1) * 0.45 + (sorte(i, quadro, 3) - 0.5) * 0.2;
    const perp: P = [-Math.sin(ang), Math.cos(ang)];
    const r = COMPRIMENTOS[i] * escala;
    return {
      tipo: 'poligono',
      pts: [p(perp[0] * largura, perp[1] * largura), p(Math.cos(ang) * r, Math.sin(ang) * r), p(-perp[0] * largura, -perp[1] * largura)],
    };
  };

  mancha(q, [circulo(p(0, 0), 6.3 + pulso), lingua(0, 3, 1), lingua(1, 4, 1), lingua(2, 3, 1)], cores.borda, cores.escuro);
  mancha(q, [circulo(p(1, 0), 4.5 + pulso), lingua(1, 2.3, 0.62)], cores.meio);
  mancha(q, [circulo(p(2, -0.5), 2.6 + pulso * 0.6)], cores.nucleo);

  // o rastro: fagulhas que ficam para trás e apagam, cada uma no próprio ritmo
  for (let i = 0; i < 4; i++) {
    const vida = (tique + i * 6) % 18;
    const volta = Math.floor((tique + i * 6) / 18);
    const u = -12 - vida * 0.8 - sorte(i, 3) * 4;
    const v = Math.round((sorte(i, volta, 5) - 0.5) * 10);
    const [px, py] = p(u, v);
    if (vida < 6) { pixel(q, px, py, cores.nucleo); pixel(q, px - direcao, py, cores.meio); }
    else if (vida < 12) pixel(q, px, py, cores.meio);
    else pixel(q, px, py, cores.borda);
  }
}

// ─── A onda ────────────────────────────────────────────────────────────────────────────────────

/**
 * O raio grande: a bola que brilha na mão, o corpo que pulsa e a cabeça na ponta. Cada faixa tem a
 * PRÓPRIA ondulação, com fase diferente: faixas paralelas ondulando juntas parecem um cano; fora de
 * fase, parecem energia. A ondulação anda para a frente — é o que conta para onde o raio empurra.
 *
 * A cabeça é uma bola bem maior que o corpo, de beirada crespa. Não tem ponta nem farpa: cabeça
 * pontuda lia como seta, e labareda varrida para trás virava as farpas de um arpão. O tamanho é
 * que diz qual ponta é a cabeça — a bola da mão é quase da grossura do corpo.
 *
 * `x0` é a mão e `x1` a ponta; `espessura` é a altura do corpo sem contar o contorno.
 */
export function desenharOnda(q: Quadro, x0: number, x1: number, y: number, tique: number, cores: CoresDeKi, direcao: 1 | -1, espessura = 20) {
  x0 = Math.round(x0); x1 = Math.round(x1); y = Math.round(y);
  const comprimento = Math.max(0, (x1 - x0) * direcao);
  const p = noEfeito(x0, y, direcao);
  const fluxo = Math.floor(tique / 2) * 3;
  const quadro = Math.floor(tique / 3);
  // o pulso: um pixel a mais e a menos, em quatro tempos
  const h = espessura / 2 + [0, 1, 0, -1][ciclo(tique, 4, 4)];
  // A cabeça CRESCE com o raio: nascendo já com o tamanho final, a bola da largada tinha quase
  // quarenta pixels e engolia o lutador do peito ao joelho. Curta, ela é pouco maior que a da mão.
  const crescer = Math.min(1, comprimento / (h * 7));
  const rCabeca = h * (1.15 + 0.5 * crescer);
  const rMao = h * 1.2;
  // A bola da mão fica À FRENTE das palmas, só encostando nelas. Centrada na mão, ela cobria o
  // antebraço inteiro, e o lutador parecia soltar o raio pelo ombro.
  const uMao = rMao * 0.8;
  // a cabeça encosta a frente na ponta; enquanto o raio ainda é curto, ela nasce da bola da mão
  const centro = Math.max(uMao, comprimento - rCabeca * 1.05);
  // O trecho do corpo, antes da cabeça, em que ele vai alargando até ela. Num raio curto o trecho
  // é o corpo todo, e sem esse teto ele saía da mão já aberto como uma corneta.
  const abrir = Math.min(rCabeca * 2.4, Math.max(1, (centro - uMao) * 0.7));

  const faixas = [
    { corpo: 1, cabeca: 1, amp: 1.4, fase: 0, cor: cores.borda, contorno: cores.escuro },
    { corpo: 0.68, cabeca: 0.74, amp: 1.1, fase: 2.1, cor: cores.meio, contorno: undefined },
    { corpo: 0.34, cabeca: 0.5, amp: 0.7, fase: 4.4, cor: cores.nucleo, contorno: undefined },
  ];
  faixas.forEach((f, i) => {
    const formas: Forma[] = [];
    // o corpo: bordas de cima e de baixo amostradas de 2 em 2 pixels, cada uma com duas ondas somadas.
    // Perto da cabeça ele ALARGA até ela, como um cometa: corpo reto espetado numa bola era uma colher
    if (centro > uMao + 1) {
      const cima: P[] = [], baixo: P[] = [];
      for (let u = uMao; ; u = Math.min(centro, u + 2)) {
        const t = Math.max(0, Math.min(1, (u - (centro - abrir)) / abrir));
        const meia = h * f.corpo + (rCabeca * f.cabeca * 0.9 - h * f.corpo) * t * t;
        const onda = (lado: number) =>
          f.amp * (0.65 * Math.sin((2 * Math.PI * (u - fluxo)) / 19 + f.fase + lado * 1.9) +
                   0.35 * Math.sin((2 * Math.PI * (u - fluxo * 1.5)) / 8 + f.fase * 1.7 + lado * 0.8));
        cima.push(p(u, -(meia + onda(0))));
        baixo.push(p(u, meia + onda(1)));
        if (u >= centro) break;
      }
      formas.push({ tipo: 'poligono', pts: [...cima, ...baixo.reverse()] });
    }
    // a cabeça, com o miolo puxado para a frente. A beirada crespa é a MESMA nas três faixas
    // (o sorteio não depende da faixa), senão as camadas se cruzam e a bola vira remendo
    formas.push(bolaCrespa(p(centro + i * 1.5, 0), rCabeca * f.cabeca, 22, 0.12, quadro, 1.1));
    // a bola da mão
    formas.push(bolaCrespa(p(uMao, 0), rMao * f.cabeca + (i === 0 ? 0.5 : 0), 12, 0.1, quadro + 7));
    mancha(q, formas, f.cor, f.contorno);
  });

  // riscos de velocidade no meio: pedaços de núcleo que correm para a ponta
  for (const v of [-Math.round(h * 0.5), Math.round(h * 0.5)]) {
    for (let u = ((fluxo * 2 + (v > 0 ? 9 : 0)) % 18) + uMao + rMao; u < centro - rCabeca * 0.6; u += 18) {
      const [ax, ay] = p(u, v);
      for (let k = 0; k < 6; k++) pixel(q, ax + k * direcao, ay, cores.nucleo);
    }
  }
  // fagulhas que escapam da borda e ficam para trás
  for (let i = 0; i < Math.floor(comprimento / 20); i++) {
    const vida = (tique + i * 13) % 18;
    const volta = Math.floor((tique + i * 13) / 18);
    const u = sorte(i, volta, 17) * Math.max(1, centro) - vida;
    if (u < uMao + rMao) continue;
    const lado = sorte(i, volta, 19) < 0.5 ? -1 : 1;
    const [fx, fy] = p(u, lado * (h + 3 + vida * 0.35));
    pixel(q, fx, fy, vida < 9 ? cores.meio : cores.borda);
    if (vida < 6) pixel(q, fx - direcao, fy, cores.nucleo);
  }
}

// ─── O raio com espiral ────────────────────────────────────────────────────────────────────────

/**
 * O especial do Picolé: um raio fino e reto com uma espiral enrolada nele. A espiral é uma fita
 * em volta de um cilindro, então tem FRENTE e COSTAS: a parte de trás é pintada antes do raio e
 * mais escura, a da frente depois e clara. Sem essa ordem ela vira uma senoide desenhada por cima,
 * e ninguém lê "enrolada".
 */
export function desenharEspiral(q: Quadro, x0: number, x1: number, y: number, tique: number, cores: CoresDeKi, direcao: 1 | -1) {
  x0 = Math.round(x0); x1 = Math.round(x1); y = Math.round(y);
  const comprimento = Math.max(0, (x1 - x0) * direcao);
  const p = noEfeito(x0, y, direcao);
  const LAMBDA = 16;
  const giro = Math.floor(tique / 2) * ((2 * Math.PI) / 8);

  // a amplitude abre ao sair dos dedos e fecha antes da ponta, que é onde a espiral aperta o raio
  const pontos: { p: P; frente: number }[] = [];
  for (let u = 2; u <= comprimento - 3; u += 1) {
    const amp = Math.min(6.5, 1.5 + u * 0.35, 1 + (comprimento - u) * 0.5);
    const fase = (2 * Math.PI * u) / LAMBDA - giro;
    pontos.push({ p: p(u, Math.sin(fase) * amp), frente: Math.cos(fase) });
  }
  const fita = (dela: (f: number) => boolean): Forma[] => {
    const formas: Forma[] = [];
    for (let i = 1; i < pontos.length; i++) {
      if (dela(pontos[i].frente)) formas.push({ tipo: 'capsula', a: pontos[i - 1].p, b: pontos[i].p, ra: 1.1, rb: 1.1 });
    }
    return formas;
  };

  // as costas da espiral, atrás do raio
  mancha(q, fita((f) => f <= 0), cores.borda, cores.escuro);
  // o raio, com a ponta de lança que fura
  const brilho = ciclo(tique, 3, 2);
  const lanca = (k: number): Forma => ({
    tipo: 'poligono',
    pts: [p(comprimento + (5 + brilho * 2) * k, 0), p(comprimento - 1, -3.4 * k), p(comprimento - 6 * k, 0), p(comprimento - 1, 3.4 * k)],
  });
  mancha(q, [{ tipo: 'capsula', a: p(0, 0), b: p(comprimento, 0), ra: 2.2, rb: 2.2 }, lanca(1)], cores.meio, cores.escuro);
  mancha(q, [{ tipo: 'capsula', a: p(0, 0), b: p(comprimento, 0), ra: 1, rb: 1 }, lanca(0.5)], cores.nucleo);
  // a frente da espiral
  mancha(q, fita((f) => f > 0), cores.meio, cores.escuro);
  for (const pt of pontos) if (pt.frente > 0.8) pixel(q, pt.p[0], pt.p[1], cores.nucleo);
  // o clarão nos dedos: um estouro de pontas finas que gira meio passo por quadro. Redondo e liso,
  // parecia a cabeça de um alfinete; de pontas curtas e rombudas, uma engrenagem; em cruz, o
  // punho de uma espada
  mancha(q, [estrela(p(0, 0), 8, 6.5 + (1 - brilho), 2, brilho * (Math.PI / 8))], cores.meio, cores.borda);
  mancha(q, [circulo(p(0.5, 0), 2.3)], cores.nucleo);
}

// ─── A aura ────────────────────────────────────────────────────────────────────────────────────

/** A grade de distâncias da aura, o custo de subir de cada coluna e as pontas de cada linha, reaproveitados entre quadros. */
let distancias = new Float32Array(0);
let custos = new Float32Array(0);
let pontaEsq = new Int32Array(0);
let pontaDir = new Int32Array(0);

/**
 * A aura de quem carrega ki, desenhada ATRÁS do sprite (quem chama cola o sprite depois). A forma
 * sai da SILHUETA do próprio sprite, não de um molde: é o que faz a aura abraçar o braço esticado
 * e o cabelo espetado sem ninguém desenhar uma aura por pose.
 *
 * Mas ela não segue a silhueta à risca. Com a distância medida até cada pixel do sprite, a aura
 * era o lutador engordado — o vão entre as pernas, o dente embaixo do braço —, com o mesmo aro em
 * volta de tudo, e lia como figurinha recortada. Então primeiro vem um ENVELOPE: cada linha cheia
 * da ponta esquerda à direita das linhas vizinhas, sem buraco nenhum, e a distância é até ele.
 *
 * Depois a conta que faz chama:
 * - nos pés ela AFINA e nunca passa da sola: aura larga embaixo pisava no chão como uma poça;
 * - nos lados, um dente de serra que sobe com o tempo — as lambidas —, defasado entre os dois
 *   lados. Sem ele, só o alto tinha chama e os lados eram um aro liso;
 * - por fim a distância "sobe": cada pixel herda a distância do de baixo mais um custo por linha,
 *   e onde o custo é pequeno a chama vai alto. O custo muda de coluna em coluna em dentes — são
 *   as línguas —, e os dentes se sorteiam de novo a cada 5 tiques.
 *
 * A beirada é cheia (contorno escuro, borda, meio) e o miolo é pontilhado, mais denso junto da
 * beirada e ralo perto do corpo: miolo sólido tapa o cenário, e xadrez de meio a meio por igual
 * era uma peneira em volta do lutador. Não há fio de núcleo por dentro da beirada: sobre o céu
 * claro ele fazia um segundo contorno, e a aura voltava a ser adesivo.
 *
 * `x, y` é o canto do sprite, o mesmo de `colar`.
 */
export function desenharAura(q: Quadro, s: Quadro, x: number, y: number, espelhar: boolean, tique: number, cores: CoresDeKi) {
  x = Math.round(x); y = Math.round(y);
  const LADO = 18, TOPO = 44, BAIXO = 2;
  const L = s.largura + LADO * 2, A = s.altura + TOPO + BAIXO;
  if (distancias.length < L * A) distancias = new Float32Array(L * A);
  if (custos.length < L) custos = new Float32Array(L);
  if (pontaEsq.length < A) { pontaEsq = new Int32Array(A); pontaDir = new Int32Array(A); }
  const d = distancias;
  const LONGE = 64;
  d.fill(LONGE, 0, L * A);
  pontaEsq.fill(L, 0, A);
  pontaDir.fill(-1, 0, A);
  let bx0 = L, bx1 = -1, by0 = A, by1 = -1;
  for (let sy = 0; sy < s.altura; sy++) {
    for (let sx = 0; sx < s.largura; sx++) {
      if (s.px[sy * s.largura + sx] === 0) continue;
      const gx = (espelhar ? s.largura - 1 - sx : sx) + LADO, gy = sy + TOPO;
      if (gx < pontaEsq[gy]) pontaEsq[gy] = gx;
      if (gx > pontaDir[gy]) pontaDir[gy] = gx;
      if (gx < bx0) bx0 = gx;
      if (gx > bx1) bx1 = gx;
      if (gy < by0) by0 = gy;
      if (gy > by1) by1 = gy;
    }
  }
  if (bx1 < 0) return;

  // o envelope: três linhas para cima e para baixo decidem até onde cada linha vai
  const JANELA = 3;
  for (let gy = by0; gy <= by1; gy++) {
    let e = L, di = -1;
    for (let k = Math.max(by0, gy - JANELA); k <= Math.min(by1, gy + JANELA); k++) {
      if (pontaEsq[k] < e) e = pontaEsq[k];
      if (pontaDir[k] > di) di = pontaDir[k];
    }
    if (di >= e) d.fill(0, gy * L + e, gy * L + di + 1);
  }

  // chanfro 1 / 1,4: perto o bastante de um círculo para uma aura, e duas passadas só
  const D = 1.4;
  for (let gy = 0; gy < A; gy++) {
    for (let gx = 0; gx < L; gx++) {
      const i = gy * L + gx;
      let v = d[i];
      if (v === 0) continue;
      if (gx > 0) v = Math.min(v, d[i - 1] + 1);
      if (gy > 0) {
        v = Math.min(v, d[i - L] + 1);
        if (gx > 0) v = Math.min(v, d[i - L - 1] + D);
        if (gx < L - 1) v = Math.min(v, d[i - L + 1] + D);
      }
      d[i] = v;
    }
  }
  for (let gy = A - 1; gy >= 0; gy--) {
    for (let gx = L - 1; gx >= 0; gx--) {
      const i = gy * L + gx;
      let v = d[i];
      if (v === 0) continue;
      if (gx < L - 1) v = Math.min(v, d[i + 1] + 1);
      if (gy < A - 1) {
        v = Math.min(v, d[i + L] + 1);
        if (gx < L - 1) v = Math.min(v, d[i + L + 1] + D);
        if (gx > 0) v = Math.min(v, d[i + L - 1] + D);
      }
      d[i] = v;
    }
  }

  const quadro = Math.floor(tique / 5);
  const respira = ciclo(tique, 5, 2);
  const R = 8 + respira;

  // Os pés, o bojo e as lambidas, somados só FORA do envelope: somados dentro, o miolo entre as
  // pernas caía na faixa da beirada e virava uma barra acesa no chão. Abaixo da sola sobra uma
  // linha, para a aura fechar embaixo quando o lutador está no ar. O bojo alarga a altura do peito
  // e dos ombros: sem ele, numa guarda de pernas abertas a aura era mais larga nos pés que no
  // corpo, um trapézio, e chama é ovo com as línguas em cima.
  const AFINAR = 14, LAMBIDA = 3, PASSO = 11, BOJO = 4;
  const meioX = (bx0 + bx1) >> 1;
  const serra = (gy: number, defasagem: number) => ((((gy + defasagem + quadro * 3) % PASSO) + PASSO) % PASSO) / PASSO * LAMBIDA;
  for (let gy = 0; gy < A; gy++) {
    const acima = by1 - gy;
    const pes = acima < 0 ? R - 1.2 - acima * 2.5 : acima < AFINAR ? (1 - acima / AFINAR) * (R - 1.5) : 0;
    const altura = acima / Math.max(1, by1 - by0);
    const bojo = altura > 0.2 && altura < 1.05 ? BOJO * Math.sin((Math.PI * (altura - 0.2)) / 0.85) : 0;
    const esquerda = pes - bojo + serra(gy, 0), direita = pes - bojo + serra(gy, PASSO >> 1);
    for (let gx = 0; gx < L; gx++) {
      const i = gy * L + gx;
      if (d[i] > 0) d[i] += gx < meioX ? esquerda : direita;
    }
  }

  // as línguas: o custo de subir, coluna a coluna. Quem se escolhe é a ALTURA da língua, em
  // triângulo, e o custo sai dela (a beirada sobe `R / custo`): escolher o custo direto em
  // triângulo fazia a ponta subir como 1/x e cada língua virava uma agulha de 1 px
  const DENTE = 9, LINGUA = 22;
  const deslocar = Math.floor(sorte(quadro, 31) * DENTE);
  for (let gx = 0; gx < L; gx++) {
    const k = Math.floor((gx + deslocar) / DENTE);
    const t = (gx + deslocar) / DENTE - k;
    const ponta = 1 - Math.abs(2 * t - 1);
    const altura = LINGUA * (0.25 + 0.75 * sorte(k, quadro, 37)) * ponta;
    custos[gx] = R / (R + altura);
  }
  for (let gy = A - 2; gy >= 0; gy--) {
    for (let gx = 0; gx < L; gx++) {
      const i = gy * L + gx;
      const deBaixo = d[i + L] + custos[gx];
      if (deBaixo < d[i]) d[i] = deBaixo;
    }
  }

  // as faixas, de fora para dentro: escuro, borda e meio cheios; depois o miolo, cada vez mais ralo
  const ox = x - LADO, oy = y - TOPO;
  for (let gy = 0; gy < A; gy++) {
    const ty = oy + gy;
    if (ty < 0 || ty >= q.altura) continue;
    for (let gx = 0; gx < L; gx++) {
      const tx = ox + gx;
      if (tx < 0 || tx >= q.largura) continue;
      const v = d[gy * L + gx];
      if (v > R + 1) continue;
      let c: Cor;
      if (v > R) c = cores.escuro;
      else if (v > R - 1.6) c = cores.borda;
      else if (v > R - 3.2) c = cores.meio;
      else {
        const dentro = R - 3.2 - v;
        if (!pontilhar(tx, ty, dentro < 1.5 ? 0.5 : dentro < 4.5 ? 0.25 : 0.125)) continue;
        c = cores.meio;
      }
      q.px[ty * q.largura + tx] = c;
    }
  }

  // as fagulhas que sobem em volta do corpo, cada uma no próprio relógio
  const alturaDoCorpo = by1 - by0;
  for (let i = 0; i < 10; i++) {
    const ciclo = 24 + Math.floor(sorte(i, 41) * 16);
    const t = tique + Math.floor(sorte(i, 43) * ciclo);
    const vida = t % ciclo, volta = Math.floor(t / ciclo);
    const gx = Math.floor(bx0 - 6 + sorte(i, volta, 47) * (bx1 - bx0 + 12));
    const gy = Math.floor(by1 - sorte(i, volta, 53) * alturaDoCorpo * 0.7 - vida * 1.5);
    const tx = ox + gx, ty = oy + gy;
    const c = vida < ciclo * 0.4 ? cores.nucleo : vida < ciclo * 0.75 ? cores.meio : cores.borda;
    pixel(q, tx, ty, c);
    if (vida < ciclo * 0.4) pixel(q, tx, ty + 1, cores.meio);
  }
}

// ─── A estrela do golpe ────────────────────────────────────────────────────────────────────────

/**
 * A faísca de impacto, do clarão ao sumiço. O forte tem seis quadros e é maior; o fraco, quatro,
 * e pula os do meio — golpe fraco que brilha tanto quanto o forte tira o peso do forte.
 * `x, y` é o ponto do golpe. Quadro fora do intervalo não desenha nada.
 */
export function desenharFaisca(q: Quadro, x: number, y: number, quadro: number, forte: boolean) {
  const total = forte ? QUADROS.faiscaForte : QUADROS.faiscaFraca;
  quadro = Math.floor(quadro);
  if (quadro < 0 || quadro >= total) return;
  const etapa = forte ? quadro : [0, 1, 3, 4][quadro];
  const k = forte ? 1 : 0.62;
  const c: P = [Math.round(x), Math.round(y)];
  const C = IMPACTO;
  // o giro muda de quadro em quadro: estrela parada parece carimbo
  const giro = (etapa % 2) * (Math.PI / 8) + Math.PI / 16;
  const raios = (r0: number, r1Longo: number, r1Curto: number, grossura: number): Forma[] =>
    Array.from({ length: 8 }, (_, i) => {
      const ang = giro + (i * Math.PI) / 4;
      const r1 = i % 2 === 0 ? r1Longo : r1Curto;
      return { tipo: 'capsula', a: [c[0] + Math.cos(ang) * r0, c[1] + Math.sin(ang) * r0], b: [c[0] + Math.cos(ang) * r1, c[1] + Math.sin(ang) * r1], ra: grossura, rb: 0.5 } as Forma;
    });

  switch (etapa) {
    case 0: {
      // o clarão: um sol branco de pontas curtas
      mancha(q, [estrela(c, 8, 14 * k, 8.5 * k, giro)], C.amarelo, C.laranja);
      mancha(q, [circulo(c, 8 * k)], C.claro);
      mancha(q, [circulo(c, 6 * k)], C.branco);
      break;
    }
    case 1: {
      mancha(q, [estrela(c, 4, 22 * k, 5.5 * k, giro), estrela(c, 4, 13 * k, 5 * k, giro + Math.PI / 4)], C.amarelo, C.laranja);
      mancha(q, [estrela(c, 4, 16 * k, 3 * k, giro), estrela(c, 4, 9 * k, 3 * k, giro + Math.PI / 4)], C.claro);
      mancha(q, [circulo(c, 4.5 * k)], C.branco);
      break;
    }
    case 2: {
      // o miolo se abre: a estrela vira aro, com o centro vazio
      const oco = [circulo(c, 5 * k)];
      anel(q, [estrela(c, 4, 25 * k, 4 * k, giro), estrela(c, 4, 15 * k, 3.5 * k, giro + Math.PI / 4), circulo(c, 8.5 * k)], oco, C.amarelo, C.laranja);
      anel(q, [circulo(c, 7.4 * k)], oco, C.claro);
      break;
    }
    case 3: {
      // os raios se soltam do centro e continuam indo
      mancha(q, raios(12 * k, 25 * k, 18 * k, 1.5 * k + 0.3), C.amarelo, C.laranja);
      if (forte) anel(q, [circulo(c, 10.5)], [circulo(c, 9)], C.claro, C.laranja);
      break;
    }
    case 4: {
      // Os raios viram riscos de um pixel, sem contorno e com a cabeça clara: rastro de coisa
      // voando. Com grossura e contorno escuro, cada raio solto era um grão de arroz.
      riscos(20 * k, 29 * k, 24 * k, 2);
      break;
    }
    default: {
      // só as cabeças, longe e em metade dos raios: o que sobrou do estouro
      riscos(29, 32, 28, 1, true);
    }
  }

  function riscos(r0: number, r1Longo: number, r1Curto: number, cabeca: number, metade = false) {
    for (let i = 0; i < 8; i++) {
      if (metade && i % 2 === 1) continue;
      const ang = giro + (i * Math.PI) / 4;
      const cos = Math.cos(ang), sin = Math.sin(ang);
      const r1 = i % 2 === 0 ? r1Longo : r1Curto;
      const r = Math.max(r0, r1 - cabeca);
      if (r > r0) linha(q, c[0] + cos * r0, c[1] + sin * r0, c[0] + cos * r, c[1] + sin * r, C.laranja);
      linha(q, c[0] + cos * r, c[1] + sin * r, c[0] + cos * r1, c[1] + sin * r1, C.amarelo);
    }
  }
}

// ─── A poeira ──────────────────────────────────────────────────────────────────────────────────

/**
 * A nuvenzinha do chão, no pouso e na arrancada: bolotas de tamanhos diferentes que abrem para os
 * lados, sobem um pouco e se desfazem. Bolotas iguais lado a lado liam como salsicha; é a bolota
 * pequena por cima da grande que faz nuvem. `x, y` é o ponto no chão.
 *
 * O sumiço não é pontilhado: com a luz, a sombra e o contorno pulando pixel a pixel, a nuvem
 * virava uma tela de arame — sobre o chão escuro, um "#" cinza. Ela se desfaz como fumaça: as
 * bolotas se soltam umas das outras e encolhem, o contorno clareia e depois some.
 */
export function desenharPoeira(q: Quadro, x: number, y: number, quadro: number) {
  quadro = Math.floor(quadro);
  if (quadro < 0 || quadro >= QUADROS.poeira) return;
  x = Math.round(x); y = Math.round(y);
  // por quadro: o afastamento do cacho e o raio da bolota do meio; o cacho abre, cresce e murcha
  const AFASTA = [4, 8, 12, 15, 17], RAIO = [2.6, 3.4, 4, 3.8, 3.2], SOBE = [0, 0.5, 1.5, 2.5, 3.5];
  // e no fim o cacho se solta: cada bolota se afasta do meio dele e encolhe
  const SOLTA = [0, 0, 0, 0.45, 0.9], ENCOLHE = [1, 1, 1, 0.78, 0.66];
  const dx = AFASTA[quadro], r = RAIO[quadro], sobe = SOBE[quadro];
  const [m] = mascaras(q);
  m.zerar();
  for (const lado of [-1, 1]) {
    // um cúmulo: a bolota do meio, duas de ombro e uma de cima. As de baixo encostam no chão sem
    // atravessá-lo — cortada reta no chão, a nuvem virava uma pedra de fundo chato
    const cacho: [number, number, number][] = [[0, 0.95, 1], [-0.9, 0.62, 0.66], [0.85, 0.66, 0.72], [0.15, 1.65, 0.62]];
    for (const [bx, by, br] of cacho) {
      const solta = 1 + SOLTA[quadro] * 1.6;
      marcarForma(m, {
        tipo: 'elipse', c: [x + (dx + bx * r * solta) * lado, y - by * r * (1 + SOLTA[quadro] * 0.5) - sobe],
        rx: br * r * 1.1 * ENCOLHE[quadro], ry: br * r * ENCOLHE[quadro],
      });
    }
  }
  pintarPoeira(q, m, quadro < 3 ? POEIRA.contorno : quadro < 4 ? POEIRA.sombra : undefined);
}

/**
 * Pinta a poeira como `pintarMascara` pintaria — luz em cima, sombra embaixo, contorno —, com o
 * contorno numa cor escolhida por quadro, ou nenhum: é assim que ela fica mais rala sem furo.
 */
function pintarPoeira(q: Quadro, m: Mascara, contorno: Cor | undefined) {
  const W = q.largura;
  for (let y = Math.max(0, m.y0 - 1); y <= Math.min(q.altura - 1, m.y1 + 1); y++) {
    for (let x = Math.max(0, m.x0 - 1); x <= Math.min(W - 1, m.x1 + 1); x++) {
      let c: Cor;
      if (m.tem(x, y)) {
        c = !m.tem(x, y + 1) ? POEIRA.sombra : !m.tem(x, y - 1) || !m.tem(x - 1, y - 1) ? POEIRA.luz : POEIRA.base;
      } else if (contorno !== undefined && (m.tem(x - 1, y) || m.tem(x + 1, y) || m.tem(x, y - 1) || m.tem(x, y + 1))) {
        c = contorno;
      } else continue;
      q.px[y * W + x] = c;
    }
  }
}

// ─── A defesa ──────────────────────────────────────────────────────────────────────────────────

/**
 * O golpe defendido: um clarão frio que abre num aro de seis lados, com o reflexo de vidro por
 * dentro, e se quebra. Hexágono porque lê "escudo" num relance e não se parece com nada da estrela
 * do golpe que entrou — quem olha a luta tem de saber, sem ler barra nenhuma, se o golpe pegou.
 * Nada de cruz no meio (cruz branca em fundo azul é o desenho de "cura"), e nada de miolo
 * pontilhado: num escudo, pontilhado lia como tela de galinheiro.
 */
export function desenharBloqueio(q: Quadro, x: number, y: number, quadro: number) {
  quadro = Math.floor(quadro);
  if (quadro < 0 || quadro >= QUADROS.bloqueio) return;
  const c: P = [Math.round(x), Math.round(y)];
  const C = DEFESA;
  const vertice = (i: number, r: number): P => {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r * 1.1];
  };
  const hexagono = (r: number): Forma => ({ tipo: 'poligono', pts: Array.from({ length: 6 }, (_, i) => vertice(i, r)) });
  // o brilho do meio é um losango de lados RETOS: estrela de quatro pontas finas, a 5 px, virava cruz
  const losango = (r: number): Forma => ({ tipo: 'poligono', pts: [[c[0], c[1] - r * 1.15], [c[0] + r * 0.75, c[1]], [c[0], c[1] + r * 1.15], [c[0] - r * 0.75, c[1]]] });
  // os lados soltos do aro que se quebra: cada lado encurta em volta do próprio meio
  const lados = (r: number, sobra: number, grossura: number): Forma[] =>
    Array.from({ length: 6 }, (_, i) => {
      const a = vertice(i, r), b = vertice(i + 1, r);
      const ponto = (t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      return { tipo: 'capsula', a: ponto(0.5 - sobra / 2), b: ponto(0.5 + sobra / 2), ra: grossura, rb: grossura } as Forma;
    });
  // o reflexo: riscos diagonais claros no alto à esquerda, o brilho de uma placa de vidro
  const reflexo = (r: number, riscos: number) => {
    for (let k = 0; k < riscos; k++) {
      const o = -r * 0.5 + k * 3;
      linha(q, c[0] + o - r * 0.15, c[1] - r * 0.2 + k * 1.5, c[0] + o + r * 0.25, c[1] - r * 0.6 + k * 1.5, C.claro);
    }
  };

  switch (quadro) {
    case 0: {
      mancha(q, [hexagono(8.5)], C.meio, C.borda);
      mancha(q, [hexagono(6.5)], C.claro);
      mancha(q, [losango(6)], C.branco);
      break;
    }
    case 1: {
      anel(q, [hexagono(13)], [hexagono(10)], C.meio, C.borda);
      anel(q, [hexagono(12)], [hexagono(11)], C.claro);
      // o miolo já vazio: um brilho no meio, a este tamanho, voltava a ler como cruz
      reflexo(10, 2);
      break;
    }
    case 2: {
      anel(q, [hexagono(15)], [hexagono(12.5)], C.meio, C.borda);
      reflexo(12, 1);
      break;
    }
    case 3: {
      mancha(q, lados(17, 0.55, 1.2), C.meio, C.borda);
      break;
    }
    default: {
      mancha(q, lados(19, 0.22, 0.8), C.borda, C.escuro);
    }
  }
}

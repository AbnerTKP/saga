/**
 * Torneio — a arena do grande torneio de artes marciais, de dia: ringue de lajotas claras,
 * arquibancada cheia, templo de telhados vermelhos, palmeiras e montanha no fundo.
 *
 * O PISO é a peça que decide se a arena tem fundo ou é papel de parede, e ele não é uma camada só:
 * é uma FATIA por linha da tela, cada uma andando no fator da própria profundidade — o "line
 * scroll" dos jogos de luta de 16 bits. Com a câmera andando de lado isso não é truque, é a conta
 * exata: um ponto do chão a uma distância D anda na tela o deslocamento vezes f/D, e f/D é a
 * escala daquela linha. A linha da luta (CHAO) anda no fator 1, junto dos lutadores; o fundo do
 * ringue anda menos, a borda de baixo anda mais, e as juntas das lajotas giram em volta do centro
 * da tela como num chão de verdade. Um piso de fator único teria as juntas pintadas numa
 * perspectiva só, e ela se desmancharia no primeiro passo da câmera.
 *
 * Pelo mesmo motivo a arquibancada anda no fator da linha em que a base do muro dela pisa, e não
 * num número escolhido de olho: é o que a mantém colada na grama quando a câmera anda.
 */
import { type Cor, type Quadro, colar, cor, criarQuadro, misturar, pixel, retangulo } from '../quadro.ts';
import { type Camada, type Cenario, degrade, larguraDaCamada, pontilhar, sorteio } from '../cenario.ts';
import { Mascara, type Forma, type P, type Tinta, marcarForma, pintarPeca } from '../raster.ts';
import { CHAO, TELA } from '../medidas.ts';

/** A largura do mundo na linha da luta: a câmera anda de 0 a 256. */
const MUNDO = 640;
/** O centro da tela, para onde as juntas do piso convergem. */
const MEIO = TELA.largura / 2;
/**
 * O horizonte: a altura do olho da câmera, na altura do peito dos lutadores e não acima deles —
 * o sprite é desenhado de lado, e um horizonte alto pediria vê-los de cima.
 */
const HORIZONTE = 84;
/**
 * Distância da câmera à linha da luta, em pixels do mundo. Ela diz o quanto a lajota se achata
 * (a 300, a da linha da luta tem 40 de largura e 15 de altura); a CONVERGÊNCIA não depende dela,
 * só do horizonte e das linhas em que o ringue começa e acaba.
 */
const DISTANCIA = 300;
/** Lado da lajota, em pixels do mundo (na linha da luta, 1 pixel do mundo é 1 da tela). */
const LAJE = 40;
/** A pedra de beirada que contorna o ringue, mais estreita que a lajota. */
const BORDA = 12;
const PEDRA_DA_BORDA = 20;
/** A base do muro da arquibancada e a borda do fundo do ringue, em linhas da tela. */
const Y_MURO = 142;
const Y_RINGUE = 158;
/**
 * O ringue cobre o mundo inteiro na linha da luta e a beirada fica um pouco para fora: nos
 * extremos da câmera aparece a quina dele no fundo, e é essa diagonal que mais conta profundidade.
 */
const RINGUE_X0 = -BORDA;
const RINGUE_X1 = MUNDO + BORDA;

/**
 * A escala do chão numa altura da tela, relativa à linha da luta — e o fator da fatia dessa linha.
 * Cada fatia usa a escala do CENTRO da sua linha, e é o centro da linha CHAO que vale 1: assim a
 * fatia em que os pés pisam anda exatamente com os lutadores, e não um pixel a mais no fim da
 * câmera.
 */
const escala = (y: number) => (y - HORIZONTE) / (CHAO + 0.5 - HORIZONTE);
/** A distância até o chão visto numa linha da tela. */
const profundidade = (y: number) => DISTANCIA / escala(y);
/** O x do mundo que cai no pixel `px` da imagem de uma camada de fator `s` (câmera em 0). */
const xDoMundo = (px: number, s: number) => MEIO + (px - MEIO) / s;
/** O contrário: onde um x do mundo cai na imagem de uma camada de fator `s`. */
const naCamada = (x: number, s: number) => MEIO + (x - MEIO) * s;

/**
 * Do muro de trás da arquibancada para baixo a tela é toda opaca — muro, fileiras, mureta, piso —,
 * e a câmera só anda de lado. Céu, montanha, templo e árvores só precisam existir até aqui: cada
 * linha a mais seria colada 60 vezes por segundo para ficar escondida.
 */
const FIM_DO_FUNDO = 84;

const D_FUNDO = profundidade(Y_RINGUE);
const FATOR_ARQUIBANCADA = escala(Y_MURO);

/**
 * Um número "aleatório" preso a uma posição: o mesmo em todo computador e em toda chamada. É o
 * sorteio com a posição como semente, para cada lajota ter o seu tom sem guardar tabela nenhuma.
 */
const acaso = (a: number, b: number, c = 0) =>
  sorteio((Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791)) >>> 0)();

/** Existe `origem + k * passo` no intervalo [a, b)? É a junta caindo dentro do pixel. */
const cruza = (a: number, b: number, passo: number, origem: number) =>
  Math.floor((b - origem) / passo) !== Math.floor((a - origem) / passo);

// ---------------------------------------------------------------------------------------------
// Paleta. Cada camada tem a sua, e quanto mais longe, mais perto do azul do céu: é a névoa que
// deixa o lutador, de contorno quase preto, saltar na frente de tudo.

const CEU = ['#3a82d5', '#4d95df', '#66a9e8', '#84bdef', '#a6d1f3'].map(cor);
const NEVOA = CEU[4];
const NUVEM = { luz: cor('#ffffff'), base: cor('#edf5fc'), sombra: cor('#cde1f2'), barriga: cor('#b6d2eb') };
const MONTANHA = {
  longe: cor('#98c2e0'), longeLuz: cor('#afd3eb'),
  perto: cor('#78a9c6'), pertoLuz: cor('#90bdd5'), pertoSombra: cor('#6897b8'),
};
/** O templo leva um véu de névoa: é o mesmo vermelho do camarote, mas mais longe. */
const nevoa = (hex: string, t = 0.16) => misturar(cor(hex), NEVOA, t);
const TEMPLO = {
  telha: nevoa('#d4503a'), telhaSombra: nevoa('#ac3c30'), telhaLuz: nevoa('#ee7a57'),
  escuro: nevoa('#7a3436'), parede: nevoa('#f3e7cd'), paredeSombra: nevoa('#d6c5a4'), ouro: nevoa('#efbd55'),
};
const ARVORE = { base: nevoa('#5b9d60', 0.22), sombra: nevoa('#468254', 0.22), luz: nevoa('#78b96b', 0.22), contorno: nevoa('#3a6d4e', 0.22) };
/**
 * A arquibancada é a camada de mais cores — dezesseis, o tamanho de uma paleta de 16 bits —,
 * porque a plateia vive de camisa diferente. O resto se paga reaproveitando: tronco de palmeira e
 * cabelo grisalho são as pedras, camisa branca é a quina do degrau, camisa vermelha e estandarte
 * são a telha do camarote, e o mesmo breu faz cabelo, fundo do túnel e contorno do telhado.
 */
const PEDRA_LUZ = cor('#f2e8d0'), PEDRA_SOMBRA = cor('#b9a684'), ESCURO = cor('#8c7660');
const TELHA = cor('#c8402f'), BREU = cor('#3a2c30');
const ARQ = {
  pedraLuz: PEDRA_LUZ, pedra: cor('#dccbaa'), pedraSombra: PEDRA_SOMBRA, escuro: ESCURO,
  vao: cor('#57443f'), breu: BREU,
  telha: TELHA, telhaSombra: cor('#942c27'), telhaLuz: cor('#e86647'),
  ouro: cor('#f0c04e'),
  camisas: [...['#d8735a', '#6a97d0', '#e9c85a', '#88bb6e'].map(cor), PEDRA_LUZ, TELHA],
  peles: ['#efc39a', '#c78d62'].map(cor),
  cabelos: [BREU, ESCURO],
};
const PALMEIRA = {
  tronco: PEDRA_SOMBRA, troncoSombra: ESCURO, anel: ARQ.vao,
  folha: { base: cor('#4d9f4f'), sombra: cor('#347a3e'), luz: cor('#79c562'), contorno: cor('#24532f'), faixa: 2 } as Tinta,
};
/**
 * A lajota é pedra clara, mas NÃO branca: quase branca, ela tinha o valor do lutador de branco e ele
 * só se separava do chão pelo contorno. Um degrau abaixo, o chão continua o mais claro da arena e
 * quem pisa nele salta.
 */
const PISO = {
  luz: cor('#eadcc0'), clara: cor('#dccbab'), base: cor('#d0bd9b'), escura: cor('#c1ad8b'),
  junta: cor('#8c785f'), racha: cor('#a89274'),
  grama: cor('#76ac48'), gramaSombra: cor('#56893a'), gramaLuz: cor('#91c55a'),
  beirada: cor('#44683a'),
};

// ---------------------------------------------------------------------------------------------
// Céu (fator 0) e nuvens

function camadaDoCeu(): Camada {
  const q = criarQuadro(TELA.largura, FIM_DO_FUNDO);
  degrade(q, 0, FIM_DO_FUNDO, CEU, 6);
  return { quadro: q, fator: 0 };
}

/** Nuvem de pixel: bolhas numa máscara só, luz em cima, barriga achatada e sombra embaixo. */
function nuvem(semente: number, largura: number): Quadro {
  const alt = Math.round(largura * 0.42);
  const q = criarQuadro(largura, alt);
  const m = new Mascara(largura, alt);
  const r = sorteio(semente);
  const n = 3 + Math.floor(largura / 22);
  m.zerar();
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const rx = largura * (0.12 + 0.1 * Math.sin(t * Math.PI)) + r() * 3;
    const cy = alt * 0.62 - Math.sin(t * Math.PI) * alt * 0.28 + r() * 2;
    marcarForma(m, { tipo: 'elipse', c: [largura * (0.12 + 0.76 * t), cy], rx, ry: rx * 0.8 });
  }
  const base = Math.floor(alt * 0.78);
  for (let y = m.y0; y <= Math.min(m.y1, base); y++) {
    for (let x = m.x0; x <= m.x1; x++) {
      if (!m.tem(x, y)) continue;
      let c = NUVEM.base;
      if (!m.tem(x + 1, y - 2) || !m.tem(x, y - 2)) c = NUVEM.luz;
      if (y >= base - 1 || !m.tem(x - 2, y + 2)) c = NUVEM.sombra;
      if (y === base) c = NUVEM.barriga;
      pixel(q, x, y, c);
    }
  }
  return q;
}

// ---------------------------------------------------------------------------------------------
// Montanhas (fator 0.1)

/** Um pico: onde fica o cume, e quanto a encosta cai por pixel de cada lado. */
type Pico = { x: number; y: number; esq: number; dir: number };

/**
 * Uma serra é a união dos triângulos dos picos, com a borda roída um pixel para cá e para lá. A
 * face que olha para a direita pega luz, e quem divide as duas faces é a crista, que desce do cume
 * inclinada — e não a vertical do cume, que deixava cada montanha com cara de pirâmide cortada.
 */
function serra(q: Quadro, picos: Pico[], base: Cor, luz: Cor, sombra: Cor, semente: number) {
  const r = sorteio(semente);
  let roido = 0;
  for (let x = 0; x < q.largura; x++) {
    if (r() < 0.35) roido = Math.max(-1, Math.min(1, roido + (r() < 0.5 ? -1 : 1)));
    let topo = Infinity, dono = picos[0];
    for (const p of picos) {
      const y = p.y + Math.abs(x - p.x) * (x < p.x ? p.esq : p.dir);
      if (y < topo) { topo = y; dono = p; }
    }
    const y0 = Math.max(0, Math.round(topo) + (Math.abs(x - dono.x) > 2 ? roido : 0));
    for (let y = y0; y < q.altura; y++) {
      const crista = dono.x + (y - dono.y) * 0.45;
      let c = x > crista ? luz : base;
      // a aresta de cima do lado da sombra ganha um risco mais escuro: é o recorte contra o céu
      if (x <= crista && y === y0) c = sombra;
      q.px[y * q.largura + x] = c;
    }
  }
}

function camadaDasMontanhas(): Camada {
  const fator = 0.1;
  const l = larguraDaCamada({ largura: MUNDO }, fator);
  const Y = 16;
  const q = criarQuadro(l, FIM_DO_FUNDO - Y);
  // Os cumes são postos à mão, onde o templo deixa ver: dos lados do salão e acima dos pavilhões.
  const r = sorteio(0x5e77a);
  const pico = (x: number, y: number): Pico => ({ x, y, esq: 0.55 + r() * 0.3, dir: 0.5 + r() * 0.3 });
  serra(q, [pico(20, 26), pico(108, 12), pico(196, 30), pico(300, 6), pico(392, 22)],
    MONTANHA.longe, MONTANHA.longeLuz, MONTANHA.longe, 11);
  serra(q, [pico(-10, 34), pico(62, 30), pico(150, 40), pico(246, 34), pico(340, 28), pico(420, 38)],
    MONTANHA.perto, MONTANHA.pertoLuz, MONTANHA.pertoSombra, 23);
  return { quadro: q, fator, y: Y };
}

// ---------------------------------------------------------------------------------------------
// Templo (fator 0.3)

type CoresDoTelhado = { telha: Cor; telhaSombra: Cor; telhaLuz: Cor; escuro: Cor; ouro: Cor };

/**
 * Telhado oriental: cumeeira reta, águas côncavas e a ponta do beiral levantada. A curva é o que
 * faz ser "templo" e não "casa"; por isso o beiral é desenhado ponto a ponto e não num triângulo.
 */
function telhado(q: Quadro, m: Mascara, c: CoresDoTelhado, cx: number, topo: number, meiaCumeeira: number, meioBeiral: number, altura: number) {
  const pts: P[] = [];
  const passos = 10;
  const agua = (t: number) => Math.pow(t, 0.55);
  for (let i = 0; i <= passos; i++) {
    const t = i / passos;
    pts.push([cx + meiaCumeeira + (meioBeiral - meiaCumeeira) * t, topo + altura * agua(t)]);
  }
  pts.push([cx + meioBeiral + 5, topo + altura - 4]);
  // a barriga do beiral, de uma ponta à outra, cai no meio
  for (let i = 0; i <= passos; i++) {
    const t = i / passos;
    pts.push([cx + meioBeiral + 2 - (2 * meioBeiral + 4) * t, topo + altura + 2 - Math.pow(Math.abs(0.5 - t) * 2, 2) * 3]);
  }
  pts.push([cx - meioBeiral - 5, topo + altura - 4]);
  for (let i = passos; i >= 0; i--) {
    const t = i / passos;
    pts.push([cx - meiaCumeeira - (meioBeiral - meiaCumeeira) * t, topo + altura * agua(t)]);
  }
  pintarPeca(q, m, [{ tipo: 'poligono', pts }], { base: c.telha, sombra: c.telhaSombra, luz: c.telhaLuz, contorno: c.escuro, faixa: 2 });
  // as fileiras de telha: riscos verticais de três em três
  for (let x = Math.round(cx - meioBeiral + 2); x <= cx + meioBeiral - 2; x += 3) {
    for (let y = topo + 2; y < topo + altura + 2; y++) {
      if (m.tem(x, y) && m.tem(x, y + 3) && m.tem(x - 1, y - 1) && m.tem(x + 1, y - 1)) pixel(q, x, y, c.telhaSombra);
    }
  }
  // beiral: faixa escura com o friso de ouro em cima
  for (let x = Math.round(cx - meioBeiral - 3); x <= cx + meioBeiral + 3; x++) {
    for (let y = topo + altura + 3; y > topo; y--) {
      if (!m.tem(x, y)) continue;
      pixel(q, x, y, c.escuro);
      if (m.tem(x, y - 1)) pixel(q, x, y - 1, c.ouro);
      break;
    }
  }
  // cumeeira com os enfeites das pontas
  retangulo(q, cx - meiaCumeeira - 1, topo - 2, meiaCumeeira * 2 + 3, 2, c.escuro);
  retangulo(q, cx - meiaCumeeira, topo - 2, meiaCumeeira * 2 + 1, 1, c.telhaLuz);
  for (const lado of [-1, 1]) {
    const x = cx + lado * (meiaCumeeira + 1);
    pixel(q, x, topo - 3, c.escuro); pixel(q, x + lado, topo - 4, c.escuro); pixel(q, x + lado, topo - 5, c.ouro);
  }
}

/** Corpo de um pavilhão: parede clara, colunas vermelhas e vãos com treliça entre elas. */
function paredes(q: Quadro, cx: number, topo: number, meia: number, altura: number, colunas: number) {
  retangulo(q, cx - meia, topo, meia * 2, altura, TEMPLO.parede);
  retangulo(q, cx - meia, topo, 3, altura, TEMPLO.paredeSombra);
  retangulo(q, cx - meia, topo, meia * 2, 2, TEMPLO.escuro);
  const passo = (meia * 2) / colunas;
  for (let i = 0; i <= colunas; i++) {
    const x = Math.round(cx - meia + passo * i);
    retangulo(q, x - 1, topo + 2, 3, altura - 2, TEMPLO.telha);
    retangulo(q, x - 1, topo + 2, 1, altura - 2, TEMPLO.telhaSombra);
    if (i < colunas && passo > 8) {
      const vx = x + 3, vl = Math.round(passo - 5);
      retangulo(q, vx, topo + 5, vl, altura - 7, TEMPLO.escuro);
      for (let yy = topo + 7; yy < topo + altura - 2; yy += 3) retangulo(q, vx + 1, yy, vl - 2, 1, TEMPLO.telhaSombra);
    }
  }
}

function camadaDoTemplo(): Camada {
  const fator = 0.3;
  const l = larguraDaCamada({ largura: MUNDO }, fator);
  const Y = 8;
  const A = FIM_DO_FUNDO - Y;
  const q = criarQuadro(l, A);
  const m = new Mascara(l, A);
  const cx = Math.round(naCamada(MUNDO / 2, fator));
  // pavilhões dos lados, mais baixos que o salão
  for (const lado of [-1, 1]) {
    const px = cx + lado * 132;
    paredes(q, px, 62, 34, A - 62, 4);
    telhado(q, m, TEMPLO, px, 46, 16, 44, 14);
  }
  // pagode numa ponta: a silhueta alta que quebra a linha dos telhados (o térreo fica atrás da arquibancada)
  const pg = cx + 196;
  for (let i = 0; i < 3; i++) {
    const topo = 22 + i * 18;
    paredes(q, pg, topo + 10, 11 + i * 2, 10, 2);
    telhado(q, m, TEMPLO, pg, topo, 3, 17 + i * 3, 9);
  }
  retangulo(q, pg, 6, 1, 14, TEMPLO.escuro);
  pixel(q, pg, 5, TEMPLO.ouro); pixel(q, pg - 1, 12, TEMPLO.ouro); pixel(q, pg + 1, 12, TEMPLO.ouro);
  // o salão principal: dois andares, o de cima menor
  paredes(q, cx, 64, 54, A - 64, 6);
  telhado(q, m, TEMPLO, cx, 42, 30, 76, 20);
  paredes(q, cx, 30, 32, 14, 4);
  telhado(q, m, TEMPLO, cx, 12, 14, 52, 18);
  // o enfeite da cumeeira: uma pérola de ouro na base escura
  retangulo(q, cx - 2, 7, 5, 3, TEMPLO.escuro);
  retangulo(q, cx - 1, 4, 3, 3, TEMPLO.ouro);
  pixel(q, cx + 1, 4, TEMPLO.parede);
  return { quadro: q, fator, y: Y };
}

// ---------------------------------------------------------------------------------------------
// Árvores entre o templo e a arquibancada (fator 0.4)

function camadaDasArvores(): Camada {
  const fator = 0.4;
  const l = larguraDaCamada({ largura: MUNDO }, fator);
  const Y = 58;
  const A = FIM_DO_FUNDO - Y;
  const q = criarQuadro(l, A);
  const m = new Mascara(l, A);
  const r = sorteio(0xa4b0);
  const tinta: Tinta = { ...ARVORE, faixa: 3 };
  for (let x = -10; x < l + 10; x += 16 + Math.floor(r() * 18)) {
    const rx = 8 + r() * 7;
    const cy = 16 + r() * 12;
    pintarPeca(q, m, [
      { tipo: 'elipse', c: [x, cy], rx, ry: rx * 0.9 },
      { tipo: 'elipse', c: [x - rx * 0.7, cy + 5], rx: rx * 0.7, ry: rx * 0.6 },
      { tipo: 'elipse', c: [x + rx * 0.7, cy + 6], rx: rx * 0.7, ry: rx * 0.6 },
      { tipo: 'poligono', pts: [[x - rx * 1.3, cy + 6], [x + rx * 1.3, cy + 6], [x + rx * 1.3, A], [x - rx * 1.3, A]] },
    ], tinta);
  }
  return { quadro: q, fator, y: Y };
}

// ---------------------------------------------------------------------------------------------
// Arquibancada (fator da base do muro)

/** `jeito`: 0 quieto, 1 torce com os dois braços, 2 pula no lugar, 3 acena com um braço. */
type Espectador = { x: number; topo: number; camisa: Cor; pele: Cor; cabelo: Cor; jeito: number; fase: number };
type Palmeira = { x: number; y: number; quadros: Quadro[] };
type Bandeira = { x: number; y: number; cor: Cor; sombra: Cor; fase: number };
type Arquibancada = { camada: Camada; espectadores: Espectador[]; palmeiras: Palmeira[]; bandeiras: Bandeira[] };

const ARQ_Y = 16;
const FILEIRAS = 6;
const DEGRAU = 7;
/** A linha do assento da fileira da frente e o topo da mureta que a separa da grama. */
const Y_FILEIRA0 = 127;
const Y_MURETA = 128;
/** Meia largura do bloco do portão, no meio da arquibancada. */
const PORTAO = 26;
/** De quantos em quantos pixels corre um corredor de escada. */
const CORREDOR = 128;

function montarArquibancada(): Arquibancada {
  const fator = FATOR_ARQUIBANCADA;
  const l = larguraDaCamada({ largura: MUNDO }, fator);
  const A = Y_MURO - ARQ_Y;
  const q = criarQuadro(l, A);
  const m = new Mascara(l, A);
  const r = sorteio(0x70e10);
  const cx = Math.round(naCamada(MUNDO / 2, fator));
  /** A camada começa em ARQ_Y; aqui se escreve em linhas da tela e se converte. */
  const Y = (yTela: number) => yTela - ARQ_Y;
  const noCorredor = (x: number) => ((x + 60) % CORREDOR) < 7;

  // Palmeiras atrás da arquibancada: o tronco fica na camada e a copa balança em `animar`.
  const palmeiras: Palmeira[] = [];
  const lugares = [[30, 72, -6], [cx - 74, 60, 4], [cx + 82, 66, -3], [l - 40, 74, 7], [cx - 196, 54, 3], [cx + 186, 58, -5]];
  for (const [n, [px, alt, inclina]] of lugares.entries()) {
    const base: P = [px, Y(96)];
    const topo: P = [px + inclina, Y(96) - alt];
    pintarPeca(q, m, [{ tipo: 'capsula', a: base, b: topo, ra: 3, rb: 2 }], {
      base: PALMEIRA.tronco, sombra: PALMEIRA.troncoSombra, contorno: PALMEIRA.anel, faixa: 2,
    });
    for (let i = 4; i < alt; i += 4) {
      const t = i / alt;
      pixel(q, base[0] + (topo[0] - base[0]) * t - 1, base[1] + (topo[1] - base[1]) * t, PALMEIRA.anel);
      pixel(q, base[0] + (topo[0] - base[0]) * t, base[1] + (topo[1] - base[1]) * t, PALMEIRA.anel);
    }
    palmeiras.push({ x: topo[0], y: topo[1] + ARQ_Y, quadros: [copa(0, n), copa(1, n)] });
  }

  // muro de trás, com ameias e os mastros das bandeirolas
  retangulo(q, 0, Y(82), l, 10, ARQ.pedra);
  retangulo(q, 0, Y(82), l, 1, ARQ.pedraLuz);
  retangulo(q, 0, Y(81), l, 1, ARQ.escuro);
  retangulo(q, 0, Y(91), l, 1, ARQ.pedraSombra);
  for (let x = 2; x < l; x += 6) {
    retangulo(q, x, Y(78), 3, 3, ARQ.pedra);
    pixel(q, x + 2, Y(78), ARQ.pedraLuz);
    retangulo(q, x, Y(77), 3, 1, ARQ.escuro);
  }
  const bandeiras: Bandeira[] = [];
  let bi = 0;
  for (let x = 20; x < l; x += 48) {
    if (Math.abs(x - cx) < PORTAO + 10) continue;
    retangulo(q, x, Y(58), 1, 22, ARQ.escuro);
    pixel(q, x, Y(57), ARQ.ouro);
    // vermelha com a dobra na sombra, ou amarela com a barra de baixo vermelha
    const amarela = bi++ % 2 === 1;
    bandeiras.push({ x, y: 59, cor: amarela ? ARQ.ouro : ARQ.telha, sombra: amarela ? ARQ.telha : ARQ.telhaSombra, fase: bi * 5 });
  }

  // As fileiras, de trás para a frente: espelho do degrau na sombra, a quina clara do assento e
  // gente sentada com a camisa encostando na do vizinho — plateia com vão entre cada pessoa
  // parecia planilha.
  const espectadores: Espectador[] = [];
  for (let k = FILEIRAS - 1; k >= 0; k--) {
    const yb = Y_FILEIRA0 - k * DEGRAU;
    retangulo(q, 0, Y(yb - DEGRAU + 1), l, DEGRAU - 1, ARQ.pedraSombra);
    retangulo(q, 0, Y(yb - 1), l, 1, ARQ.escuro);
    retangulo(q, 0, Y(yb), l, 1, ARQ.pedraLuz);
    let x = (k * 3) % 4;
    while (x < l - 3) {
      const passo = 4 + (r() < 0.25 ? 1 : 0);
      // perto do portão não senta ninguém: o estandarte tapa, e o braço erguido em `animar` o atravessaria
      if (Math.abs(x + 2 - cx) < PORTAO + 10 || noCorredor(x) || noCorredor(x + 3)) { x += 1; continue; }
      if (r() < 0.05) { x += passo; continue; }
      const camisa = ARQ.camisas[Math.floor(r() * ARQ.camisas.length)];
      const pele = ARQ.peles[r() < 0.7 ? 0 : 1];
      const cabelo = ARQ.cabelos[r() < 0.72 ? 0 : 1];
      const v = r();
      let topo = yb - 6;
      if (v < 0.07 && k > 0) {
        // de pé: mais alto, tapando um pedaço da fileira de trás
        topo = yb - 9;
        retangulo(q, x, Y(yb - 7), 4, 6, camisa);
        pixel(q, x, Y(yb - 7), ARQ.pedraSombra); pixel(q, x + 3, Y(yb - 7), ARQ.pedraSombra);
      } else if (v < 0.15) {
        // criança: uma linha mais baixa
        topo = yb - 5;
        retangulo(q, x + 1, Y(yb - 3), 2, 2, camisa);
      } else {
        retangulo(q, x, Y(yb - 4), 4, 3, camisa);
        pixel(q, x, Y(yb - 4), ARQ.pedraSombra); pixel(q, x + 3, Y(yb - 4), ARQ.pedraSombra);
      }
      pixel(q, x + 1, Y(topo), cabelo); pixel(q, x + 2, Y(topo), cabelo);
      pixel(q, x + 1, Y(topo + 1), pele); pixel(q, x + 2, Y(topo + 1), pele);
      const enfeite = r();
      if (enfeite < 0.1) {
        // chapéu de palha
        retangulo(q, x, Y(topo), 4, 1, ARQ.pedraLuz);
        pixel(q, x + 1, Y(topo - 1), ARQ.pedraLuz); pixel(q, x + 2, Y(topo - 1), ARQ.pedraLuz);
      } else if (enfeite < 0.22) {
        // cabelo comprido caindo dos lados do rosto
        pixel(q, x, Y(topo + 1), cabelo); pixel(q, x + 3, Y(topo + 1), cabelo);
      }
      const sorte = r();
      const jeito = enfeite < 0.1 ? (sorte < 0.35 ? 1 : 0) : sorte < 0.22 ? 1 : sorte < 0.36 ? 2 : sorte < 0.46 ? 3 : 0;
      espectadores.push({ x, topo, camisa, pele, cabelo, jeito, fase: Math.floor(r() * 997) });
      x += passo;
    }
  }
  // corredores: degraus claros e o corrimão escuro dos lados
  for (let x = 0; x < l; x++) {
    if (!noCorredor(x)) continue;
    const i = (x + 60) % CORREDOR;
    for (let y = Y(Y_FILEIRA0 - FILEIRAS * DEGRAU + 1); y < Y(Y_MURETA); y++) {
      const degrau = (Y_FILEIRA0 - (y + ARQ_Y)) % 4;
      q.px[y * l + x] = i === 0 || i === 6 ? ARQ.escuro : degrau === 0 ? ARQ.pedraLuz : degrau === 1 ? ARQ.pedraSombra : ARQ.pedra;
    }
  }

  // mureta da frente, com os painéis rebaixados
  retangulo(q, 0, Y(Y_MURETA), l, Y_MURO - Y_MURETA, ARQ.pedra);
  retangulo(q, 0, Y(Y_MURETA), l, 2, ARQ.pedraLuz);
  retangulo(q, 0, Y(Y_MURETA + 2), l, 1, ARQ.pedraSombra);
  retangulo(q, 0, Y(Y_MURO - 1), l, 1, ARQ.pedraSombra);
  for (let x = 10; x < l; x += 32) {
    retangulo(q, x, Y(Y_MURETA + 4), 20, 7, ARQ.pedraSombra);
    retangulo(q, x + 1, Y(Y_MURETA + 5), 19, 6, ARQ.pedra);
  }

  portao(q, m, cx, Y);
  return { camada: { quadro: q, fator, y: ARQ_Y }, espectadores, palmeiras, bandeiras };
}

/**
 * O bloco do meio: o túnel por onde os lutadores entram e, em cima, o camarote dos juízes com o
 * telhado. O telhado é de um vermelho mais fundo que o do templo — os dois se sobrepõem na tela,
 * e só a névoa do templo separa um do outro.
 */
function portao(q: Quadro, m: Mascara, cx: number, Y: (y: number) => number) {
  const topo = 90;
  retangulo(q, cx - PORTAO, Y(topo), PORTAO * 2, Y_MURO - topo, ARQ.pedra);
  retangulo(q, cx - PORTAO, Y(topo), 2, Y_MURO - topo, ARQ.pedraSombra);
  // o camarote: vão escuro de cantos arredondados, três juízes sentados e o parapeito
  const cy0 = 96, cy1 = 113;
  retangulo(q, cx - 17, Y(cy0 + 1), 34, cy1 - cy0 - 1, ARQ.vao);
  retangulo(q, cx - 16, Y(cy0), 32, 1, ARQ.vao);
  retangulo(q, cx - 17, Y(cy0 + 1), 34, 2, ARQ.breu);
  for (const dx of [-10, -1, 8]) {
    retangulo(q, cx + dx, Y(106), 4, 5, ARQ.escuro);
    retangulo(q, cx + dx + 1, Y(103), 2, 2, ARQ.pedraSombra);
  }
  retangulo(q, cx - 19, Y(cy1), 38, 2, ARQ.pedraLuz);
  retangulo(q, cx - 19, Y(cy1 + 2), 38, 1, ARQ.escuro);
  for (let x = cx - 16; x < cx + 17; x += 4) retangulo(q, x, Y(cy1 - 3), 1, 3, ARQ.pedraLuz);
  // o túnel: arco em cima e escuro mais fundo no meio, pontilhado
  const tx = 10, ty = Y_MURETA - 3;
  for (let y = ty; y < Y_MURO; y++) {
    for (let x = -tx; x < tx; x++) {
      const arco = y - ty < 3 && Math.abs(x + 0.5) > tx - 3 + (y - ty);
      if (arco) continue;
      const fundo = Math.abs(x + 0.5) < tx - 3 && y > ty + 1 && pontilhar(cx + x, y, 0.7);
      pixel(q, cx + x, Y(y), fundo ? ARQ.breu : ARQ.vao);
    }
  }
  for (let x = -tx - 1; x <= tx; x++) {
    const y = ty - 1 + (Math.abs(x + 0.5) > tx - 2 ? Math.round(Math.abs(x + 0.5) - (tx - 2)) : 0);
    pixel(q, cx + x, Y(y), ARQ.escuro);
  }
  // colunas vermelhas com capitel de ouro e estandarte pendurado por fora
  for (const lado of [-1, 1]) {
    const x = cx + lado * (PORTAO - 4);
    retangulo(q, x - 2, Y(86), 5, Y_MURO - 86, ARQ.telha);
    retangulo(q, x - 2, Y(86), 1, Y_MURO - 86, ARQ.telhaSombra);
    retangulo(q, x + 2, Y(86), 1, Y_MURO - 86, ARQ.telhaLuz);
    retangulo(q, x - 3, Y(88), 7, 2, ARQ.ouro);
    retangulo(q, x - 3, Y(Y_MURO - 3), 7, 3, ARQ.pedraSombra);
    const ex = cx + lado * (PORTAO + 1) - (lado < 0 ? 6 : 0);
    // o estandarte é um tom acima da coluna, senão os dois vermelhos viram uma peça só
    retangulo(q, ex, Y(92), 6, 20, ARQ.telhaLuz);
    retangulo(q, ex, Y(92), 6, 1, ARQ.ouro);
    retangulo(q, lado < 0 ? ex : ex + 5, Y(93), 1, 19, ARQ.telha);
    pixel(q, ex, Y(112), ARQ.telhaLuz); pixel(q, ex + 2, Y(112), ARQ.telhaLuz); pixel(q, ex + 3, Y(112), ARQ.telhaLuz); pixel(q, ex + 5, Y(112), ARQ.telhaLuz);
    retangulo(q, ex + 2, Y(99), 2, 2, ARQ.ouro);
  }
  telhado(q, m, { telha: ARQ.telha, telhaSombra: ARQ.telhaSombra, telhaLuz: ARQ.telhaLuz, escuro: ARQ.breu, ouro: ARQ.ouro },
    cx, Y(76), 10, PORTAO + 5, 11);
}

/**
 * A copa da palmeira em dois quadros: as folhas sobem e descem um pouco, e isso basta. Cada
 * palmeira sorteia o comprimento e o ângulo das suas — seis copas iguais lado a lado denunciam o
 * carimbo.
 */
function copa(quadro: number, semente: number): Quadro {
  const L = 52, A = 32, cx = 26, cy = 10;
  const q = criarQuadro(L, A);
  const m = new Mascara(L, A);
  const r = sorteio(0xc0c0 + semente);
  const folhas: [number, number][] = [[-155, 17], [-115, 20], [-70, 18], [-25, 14], [20, 14], [70, 18], [118, 21], [160, 17]]
    .map(([a, c]) => [a + (r() - 0.5) * 16, c + Math.round((r() - 0.5) * 4)]);
  for (const [ang0, comp] of folhas) {
    const formas: Forma[] = [];
    let p: P = [cx, cy];
    // quadro 1: as folhas de lado caem mais, como numa lufada que passou
    let a = ang0 + (quadro && Math.abs(ang0) > 40 ? Math.sign(ang0) * 7 : 0);
    for (let i = 0; i < 4; i++) {
      const seg = comp / 4;
      a += Math.sign(a) * (Math.abs(a) < 150 ? 13 : 0);
      const rad = (a * Math.PI) / 180;
      const n: P = [p[0] + Math.sin(rad) * seg, p[1] - Math.cos(rad) * seg + i * 0.7];
      formas.push({ tipo: 'capsula', a: p, b: n, ra: 2.7 - i * 0.55, rb: 2.2 - i * 0.55 });
      p = n;
    }
    pintarPeca(q, m, formas, PALMEIRA.folha);
  }
  pintarPeca(q, m, [{ tipo: 'elipse', c: [cx, cy + 1], rx: 3, ry: 2.5 }], PALMEIRA.folha);
  // cocos
  pixel(q, cx - 1, cy + 4, PALMEIRA.anel); pixel(q, cx + 1, cy + 4, PALMEIRA.anel); pixel(q, cx, cy + 5, PALMEIRA.troncoSombra);
  return q;
}

// ---------------------------------------------------------------------------------------------
// Lanternas de pedra na grama

/** A linha da grama em que as lanternas pisam. */
const Y_LANTERNA = 151;
/** Onde elas ficam no mundo: longe do lugar em que os lutadores começam, e duas só nas pontas. */
const LANTERNAS_X = [-70, 110, 530, 710];
const LANTERNA = [
  '....o....',
  '...omo...',
  '..ommmo..',
  '.ommmmmo.',
  'ommmmmmmo',
  '.ooooooo.',
  '..ommmo..',
  '..ovvvo..',
  '..ovvvo..',
  '..ommmo..',
  '.ooooooo.',
  '...omo...',
  '...omo...',
  '...omo...',
  '...omo...',
  '..ommmo..',
  '.ommmmmo.',
  'ooooooooo',
];
const PEDRA = { luz: cor('#e2dccb'), base: cor('#c4bdab'), sombra: cor('#a09887'), contorno: cor('#6c655d'), vao: cor('#3e3733') };

/**
 * As lanternas moram numa camada própria, no fator da linha em que pisam, e entram na lista ENTRE
 * as fatias do piso: as linhas de grama de trás delas já foram coladas, as da frente vêm depois.
 * É o que as põe no chão sem máscara nenhuma — e, com a câmera andando, elas deslizam mais que o
 * muro e menos que os lutadores, que é mais uma régua de profundidade no meio do caminho.
 */
function camadaDasLanternas(): Camada {
  const s = escala(Y_LANTERNA + 0.5);
  const l = larguraDaCamada({ largura: MUNDO }, s);
  const A = LANTERNA.length;
  const q = criarQuadro(l, A);
  for (const X of LANTERNAS_X) {
    const x0 = Math.round(naCamada(X, s)) - 4;
    // a sombra cai para trás e para a esquerda, longe da luz: sobra só uma nesga na grama
    retangulo(q, x0 - 2, A - 2, 3, 2, PISO.gramaSombra);
    retangulo(q, x0 - 3, A - 3, 3, 1, PISO.gramaSombra);
    for (let y = 0; y < A; y++) {
      const linha = LANTERNA[y];
      for (let x = 0; x < linha.length; x++) {
        const ch = linha[x];
        if (ch === '.') continue;
        let c = ch === 'o' ? PEDRA.contorno : ch === 'v' ? PEDRA.vao : PEDRA.base;
        // luz da direita: a borda direita da pedra clareia, a esquerda escurece
        if (ch === 'm' && linha[x + 1] === 'o') c = PEDRA.luz;
        else if (ch === 'm' && linha[x - 1] === 'o') c = PEDRA.sombra;
        pixel(q, x0 + x, y, c);
      }
    }
  }
  return { quadro: q, fator: s, y: Y_LANTERNA - A + 1 };
}

// ---------------------------------------------------------------------------------------------
// O piso: uma fatia por linha

type Racha = { a: P; b: P; c: P };

/** As rachaduras de uma lajota, em coordenadas dela (0 a LAJE nos dois sentidos). */
function rachasDaLajota(i: number, j: number): Racha | null {
  if (acaso(i, j, 5) > 0.28) return null;
  const r = sorteio((Math.imul(i, 2654435761) ^ Math.imul(j, 40503)) >>> 0);
  const a: P = r() < 0.5 ? [r() * LAJE, r() < 0.5 ? 0 : LAJE] : [r() < 0.5 ? 0 : LAJE, r() * LAJE];
  const c: P = [LAJE * (0.3 + r() * 0.4), LAJE * (0.3 + r() * 0.4)];
  const b: P = [(a[0] + c[0]) / 2 + (r() - 0.5) * 8, (a[1] + c[1]) / 2 + (r() - 0.5) * 8];
  return { a, b, c };
}

/**
 * O segmento passa pela pegada do pixel? A pegada é um retângulo de `du` por `dv` (em pixels do
 * mundo) — larga no fundo, onde uma linha da tela cobre vários pixels de chão, e estreita na
 * frente. Medir pela pegada, e não pelo centro, é o que deixa a rachadura inteira nas duas pontas.
 */
function naPegada(u: number, v: number, du: number, dv: number, a: P, b: P) {
  const ax = (a[0] - u) / du, ay = (a[1] - v) / dv, bx = (b[0] - u) / du, by = (b[1] - v) / dv;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
  const px = ax + dx * t, py = ay + dy * t;
  return px * px + py * py <= 1;
}

function fatiaDoPiso(y: number): Camada {
  const s = escala(y + 0.5);
  const l = larguraDaCamada({ largura: MUNDO }, s);
  const q = criarQuadro(l, 1);
  const dLonge = profundidade(y), dPerto = profundidade(y + 1), d = profundidade(y + 0.5);

  // As juntas que correm para o fundo (x constante no mundo) são marcadas pela extensão que
  // percorrem dentro da linha, e não pelo centro: perto da quina elas deitam mais de um pixel por
  // linha, e marcar só o centro as picotava.
  const marca = new Uint8Array(l);
  const marcar = (X: number, valor: number) => {
    const xa = naCamada(X, escala(y)), xb = naCamada(X, escala(y + 1));
    const p0 = Math.floor(Math.min(xa, xb)), p1 = Math.max(p0, Math.floor(Math.max(xa, xb) - 0.001));
    for (let p = Math.max(0, p0); p <= Math.min(l - 1, p1); p++) marca[p] = Math.max(marca[p], valor);
  };
  const dentroDaBorda = d > D_FUNDO - BORDA;
  if (d < D_FUNDO) {
    marcar(RINGUE_X0, 3); marcar(RINGUE_X1, 3);
    marcar(RINGUE_X0 + BORDA, 2); marcar(RINGUE_X1 - BORDA, 2);
    if (dentroDaBorda) {
      for (let X = RINGUE_X0 + BORDA; X < RINGUE_X1 - BORDA; X += PEDRA_DA_BORDA) marcar(X, 2);
    } else {
      for (let X = 0; X <= MUNDO; X += LAJE) marcar(X, 2);
    }
  }
  const juntaNaLinha = cruza(dPerto, dLonge, LAJE, D_FUNDO - BORDA);
  const luzDaJunta = !dentroDaBorda && cruza(profundidade(y + 2), dPerto, LAJE, D_FUNDO - BORDA);
  const du = 0.5 / s, dv = (dLonge - dPerto) / 2;

  for (let px = 0; px < l; px++) {
    const x = xDoMundo(px + 0.5, s);
    let c: Cor;
    if (d >= D_FUNDO) {
      // grama entre a mureta e o ringue; a linha colada no ringue é a sombra da beirada
      c = gramado(x, d, px, y);
      if (y === Y_RINGUE - 1) c = PISO.beirada;
      else if (y === Y_MURO) c = PISO.gramaSombra;
    } else if (x < RINGUE_X0 || x >= RINGUE_X1) {
      c = marca[px] === 3 ? PISO.beirada : gramado(x, d, px, y);
      const fora = x < RINGUE_X0 ? RINGUE_X0 - x : x - RINGUE_X1;
      if (fora < 2.5 / s) c = PISO.beirada;
    } else if (dentroDaBorda || x < RINGUE_X0 + BORDA || x >= RINGUE_X1 - BORDA) {
      // a beirada de pedra: clara em cima, riscada a cada pedra
      c = PISO.clara;
      if (d > D_FUNDO - 2.2 / s || x < RINGUE_X0 + 1.2 / s || x > RINGUE_X1 - 1.2 / s) c = PISO.luz;
      const lateral = !dentroDaBorda;
      if (lateral && cruza(dPerto, dLonge, PEDRA_DA_BORDA, D_FUNDO - BORDA)) c = PISO.junta;
      // a junta entre a beirada do fundo e a primeira fileira de lajotas cai numa linha só, e ela
      // pode ser classificada como beirada pelo centro — por isso é conferida aqui também
      if (dPerto <= D_FUNDO - BORDA && D_FUNDO - BORDA < dLonge && x >= RINGUE_X0 + BORDA && x < RINGUE_X1 - BORDA) c = PISO.junta;
      if (dentroDaBorda && marca[px] >= 2) c = PISO.junta;
      if (lateral && marca[px] === 2) c = PISO.junta;
      if (marca[px] === 3) c = PISO.junta;
    } else {
      const i = Math.floor(x / LAJE), j = Math.floor((D_FUNDO - BORDA - d) / LAJE);
      const tom = acaso(i, j, 1);
      c = tom < 0.22 ? PISO.clara : tom > 0.8 ? PISO.escura : PISO.base;
      const u = x - i * LAJE, v = (D_FUNDO - BORDA - d) - j * LAJE;
      const racha = rachasDaLajota(i, j);
      if (racha && (naPegada(u, v, du, dv, racha.a, racha.b) || naPegada(u, v, du, dv, racha.b, racha.c))) c = PISO.racha;
      else if (acaso(Math.floor(x / 2), Math.floor(d / 2), 2) < 0.012) c = PISO.racha;
      if (luzDaJunta || marca[px + 1] === 2) c = PISO.luz;
      if (juntaNaLinha || marca[px] === 2) c = PISO.junta;
    }
    q.px[px] = c;
  }
  return { quadro: q, fator: s, y };
}

/**
 * Grama cortada em faixas que correm para o fundo — mais uma linha de fuga, agora no gramado. A
 * faixa é só pontilhado da sombra, sem cor própria: a paleta do piso já carrega pedra e grama.
 */
function gramado(x: number, d: number, px: number, y: number): Cor {
  const tufo = acaso(Math.floor(x / 3), Math.floor(d / 5), 3);
  if (tufo < 0.1) return PISO.gramaSombra;
  if (tufo > 0.93) return PISO.gramaLuz;
  const faixa = Math.floor((x + 400) / 32) % 2 === 0;
  return !faixa && pontilhar(px, y, 0.25) ? PISO.gramaSombra : PISO.grama;
}

// ---------------------------------------------------------------------------------------------
// O que se mexe

type Nuvem = { quadro: Quadro; x: number; y: number; passo: number };

function ehCeu(c: Cor) {
  for (let i = 0; i < CEU.length; i++) if (CEU[i] === c) return true;
  return false;
}

/** Cola a nuvem só onde ainda é céu: assim ela passa atrás da montanha e do templo sem camada própria. */
function colarNoCeu(q: Quadro, s: Quadro, x: number, y: number) {
  const x0 = Math.max(0, x), x1 = Math.min(q.largura, x + s.largura);
  const y0 = Math.max(0, y), y1 = Math.min(q.altura, y + s.altura);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const c = s.px[(yy - y) * s.largura + (xx - x)];
      if (c === 0) continue;
      const i = yy * q.largura + xx;
      if (ehCeu(q.px[i])) q.px[i] = c;
    }
  }
}

/** Ave de longe, de asa para cima e de asa aberta: três pixels de largura já dizem "pássaro". */
const AVE = [
  ['a...a', '.a.a.', '..a..'],
  ['.....', 'aa.aa', '..a..'],
];
const COR_DA_AVE = cor('#2f5584');

function ave(q: Quadro, x: number, y: number, i: number) {
  const f = AVE[i];
  for (let yy = 0; yy < f.length; yy++) {
    for (let xx = 0; xx < f[yy].length; xx++) {
      if (f[yy][xx] !== 'a') continue;
      const px = x + xx, py = y + yy;
      if (px < 0 || py < 0 || px >= q.largura || py >= q.altura) continue;
      if (ehCeu(q.px[py * q.largura + px])) q.px[py * q.largura + px] = COR_DA_AVE;
    }
  }
}

const BANDEIROLA = [
  ['aaaaaa..', 'aaaaaaaa', 'bbbbbb..'],
  ['aaaa....', 'aaaaaaa.', 'bbbbbbbb', '....bb..'],
  ['aaaaaaa.', 'aaaaaaab', 'bbbbb...'],
];

function bandeirola(q: Quadro, x: number, y: number, c: Cor, s: Cor, i: number) {
  const f = BANDEIROLA[i];
  for (let yy = 0; yy < f.length; yy++) {
    for (let xx = 0; xx < f[yy].length; xx++) {
      const ch = f[yy][xx];
      if (ch === 'a') pixel(q, x + 1 + xx, y + yy, c);
      else if (ch === 'b') pixel(q, x + 1 + xx, y + yy, s);
    }
  }
}

/** A plateia troca de desenho a cada tantos quadros: ~6,7 por segundo, o ritmo de sprite. */
const QUADROS_POR_DESENHO = 9;

export function cenarioTorneio(): Cenario {
  const arq = montarArquibancada();
  const camadas: Camada[] = [camadaDoCeu(), camadaDasMontanhas(), camadaDoTemplo(), camadaDasArvores(), arq.camada];
  for (let y = Y_MURO; y < TELA.altura; y++) {
    camadas.push(fatiaDoPiso(y));
    if (y === Y_LANTERNA) camadas.push(camadaDasLanternas());
  }

  const nuvens: Nuvem[] = [
    { quadro: nuvem(1, 70), x: 20, y: 8, passo: 50 },
    { quadro: nuvem(2, 46), x: 150, y: 34, passo: 70 },
    { quadro: nuvem(3, 90), x: 250, y: 2, passo: 40 },
    { quadro: nuvem(4, 40), x: 360, y: 48, passo: 90 },
    { quadro: nuvem(5, 58), x: 460, y: 22, passo: 60 },
  ];
  const volta = TELA.largura + 140;
  // Só quem se mexe entra no laço de todo quadro; os quietos já estão pintados na camada.
  const agitados = arq.espectadores.filter((e) => e.jeito !== 0);
  const fatorArq = arq.camada.fator;

  return {
    id: 'torneio',
    nome: 'Torneio',
    largura: MUNDO,
    camadas,
    clarao: cor('#fff8e4'),
    animar(q, camX, tique) {
      // nuvens: um pixel de cada vez, cada uma no seu passo
      for (const n of nuvens) {
        const andou = Math.floor(tique / n.passo) + Math.round(camX * 0.02);
        const x = ((((n.x - andou + 100) % volta) + volta) % volta) - 100;
        colarNoCeu(q, n.quadro, x, n.y);
      }
      // duas aves atravessando devagar, bem no alto, batendo asa de vez em quando
      for (let i = 0; i < 2; i++) {
        const andou = Math.floor(tique / 7) + i * 23;
        const x = ((((andou + i * 260) % (volta + 200)) + volta + 200) % (volta + 200)) - 100 - Math.round(camX * 0.04);
        const bate = Math.floor((tique + i * 40) / 14) % 4;
        ave(q, x, 40 + i * 9 + (bate === 1 ? 1 : 0), bate < 2 ? bate : 1);
      }
      // o que mora na arquibancada anda com ela: o mesmo arredondamento de `colarCamada`
      const dx = -Math.round(camX * fatorArq);
      const desenho = Math.floor(tique / QUADROS_POR_DESENHO);
      for (let i = 0; i < arq.palmeiras.length; i++) {
        const p = arq.palmeiras[i];
        colar(q, p.quadros[Math.floor((tique + i * 23) / 40) % 2], p.x + dx - 26, p.y - 10);
      }
      for (const b of arq.bandeiras) bandeirola(q, b.x + dx, b.y, b.cor, b.sombra, (desenho + b.fase) % 3);
      for (const e of agitados) {
        const x = e.x + dx;
        if (x < -4 || x > q.largura + 4) continue;
        const t = desenho + e.fase;
        const o = e.topo;
        if (e.jeito === 1) {
          // torce em rajadas de ~2,4 s, metade do tempo: braços para cima dois desenhos, para o lado dois
          if ((((t >> 4) + e.fase) & 1) !== 0) continue;
          if (t % 4 < 2) {
            pixel(q, x, o, e.pele); pixel(q, x, o - 1, e.pele); pixel(q, x, o + 1, e.camisa);
            pixel(q, x + 3, o, e.pele); pixel(q, x + 3, o - 1, e.pele); pixel(q, x + 3, o + 1, e.camisa);
          } else {
            pixel(q, x - 1, o + 2, e.pele); pixel(q, x + 4, o + 2, e.pele);
            pixel(q, x, o + 1, e.camisa); pixel(q, x + 3, o + 1, e.camisa);
          }
        } else if (e.jeito === 2) {
          // pula no lugar: a cabeça sobe um pixel e o pescoço vira camisa
          if ((((t >> 3) + e.fase) & 1) !== 0 || t % 3 !== 0) continue;
          pixel(q, x + 1, o - 1, e.cabelo); pixel(q, x + 2, o - 1, e.cabelo);
          pixel(q, x + 1, o, e.pele); pixel(q, x + 2, o, e.pele);
          pixel(q, x + 1, o + 1, e.camisa); pixel(q, x + 2, o + 1, e.camisa);
        } else {
          // acena com o braço da frente
          if ((((t >> 5) + e.fase) & 1) !== 0) continue;
          pixel(q, x + 3, o + 1, e.camisa);
          if (t % 2 === 0) { pixel(q, x + 3, o, e.pele); pixel(q, x + 3, o - 1, e.pele); }
          else { pixel(q, x + 4, o, e.pele); pixel(q, x + 4, o - 1, e.pele); }
        }
      }
    },
  };
}

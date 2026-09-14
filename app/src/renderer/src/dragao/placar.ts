/**
 * O placar da luta — vida, ki, relógio, retratos e rodadas —, desenhado no mesmo quadro de pixels
 * que o resto do jogo, por cima do cenário e dos lutadores. Não é HTML por cima do `canvas`: um
 * placar de navegador teria outra nitidez, outra fonte e outro tamanho de pixel que o lutador ao
 * lado, e é esse descompasso que faz jogo de pixel parecer montado.
 *
 * Tudo é desenhado para o LADO 1 (à esquerda) e espelhado para o lado 2: a barra do lado 2 enche
 * do outro lado porque é o mesmo desenho virado, e não uma segunda conta que poderia discordar da
 * primeira por um pixel. Só o texto não vira — ele troca de alinhamento.
 *
 * As três variantes existem para o dono escolher olhando; a que ficar é a que o jogo usa, e as
 * outras saem. Todas seguem a mesma regra de leitura: moldura escura com contorno em volta de tudo,
 * porque o placar passa por céu claro, chão escuro e clarão de especial na mesma luta.
 */
import { type Cor, type Quadro, colar, cor, pixel, retangulo } from './quadro.ts';
import { escrever } from './fonte.ts';
import { type Retrato, apertarRetrato } from './retrato.ts';
import { pontilhar } from './cenario.ts';

export type LadoDoPlacar = {
  nome: string;
  retrato: Quadro | Retrato;
  /** 0 a 1. */
  vida: number;
  /** 0 a 1: até onde a vida ia há pouco. O pedaço entre `vida` e isto aparece em vermelho, e o jogo o faz descer devagar. */
  vidaAtrasada: number;
  /** 0 a 3, em barras cheias; o que passa de um inteiro enche a barra seguinte. */
  ki: number;
  /** 0 a 2. */
  vitorias: number;
  /** A fase acesa do pisca-pisca do ki cheio; quem alterna é o jogo, a cada tantos quadros. */
  piscar?: boolean;
};

export type EstadoDoPlacar = {
  /** Segundos que faltam; `null` é luta sem relógio. */
  tempo: number | null;
  rodada: number;
  lados: [LadoDoPlacar, LadoDoPlacar];
};

export type VarianteDoPlacar = 'a' | 'b' | 'c';

type Tons = { luz: Cor; base: Cor; sombra: Cor };
const tons = (luz: string, base: string, sombra: string): Tons => ({ luz: cor(luz), base: cor(base), sombra: cor(sombra) });

const T = {
  contorno: cor('#1b1022'),
  /** O aro claro entre o contorno e o miolo: é ele que separa a moldura de um chão escuro. */
  aro: cor('#bdb3d9'),
  branco: cor('#ffffff'),
  // A vida é verde enquanto sobra mais da metade e amarela depois — o semáforo que se lê sem
  // olhar o comprimento. Vermelho não entra na conta: é a cor do dano que acabou de sair.
  verde: tons('#dcff9e', '#7ee04a', '#3c9a3c'),
  amarelo: tons('#fff5a6', '#ffd23a', '#d68a1c'),
  atraso: tons('#ff9c8c', '#e8323c', '#a01c34'),
  vazio: tons('#3b2d50', '#241a35', '#170f24'),
  ki: tons('#e8fcff', '#55d6ff', '#1f8ee0'),
  /** A barra de ki que ainda está enchendo: mais apagada que a cheia, para "quase" não parecer "pronto". */
  kiEnchendo: tons('#4aa6ea', '#2c74c8', '#1f4f96'),
  kiClarao: tons('#ffffff', '#d4f7ff', '#8ee0ff'),
  kiVazio: tons('#24324e', '#172238', '#0f1728'),
  /**
   * O algarismo do ki zerado. Apagado, mas LEGÍVEL: no tom da barra vazia ele virava um borrão
   * escuro sobre o chão escuro, e "0" é justamente a informação de que ainda não dá para soltar.
   */
  kiZero: { cima: cor('#7d8db4'), baixo: cor('#52608a') },
  ouro: tons('#fff3a8', '#ffc83a', '#cf7618'),
  ouroApagado: tons('#4a3d5e', '#33284a', '#241b36'),
  relogio: { cima: cor('#ffe27a'), baixo: cor('#f59c22') },
  /** Os últimos dez segundos. */
  relogioAcabando: { cima: cor('#ff8a78'), baixo: cor('#d62a3c') },
  // Fundo do retrato: azul de um lado, vinho do outro, como nos fliperamas — com dois Goiabas na
  // tela, é a cor atrás do rosto que diz qual barra é de qual.
  fundoRetrato: [
    { cima: cor('#3b5aa8'), baixo: cor('#1e2c62') },
    { cima: cor('#a83b55'), baixo: cor('#5e1c34') },
  ],
};

const limitar = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
/** Folga para a conta de ponto flutuante: 3 barras vezes 7/3 dá 6,999…, e a sétima esfera nunca acenderia. */
const QUASE = 1e-6;

// ————— o pincel de um lado —————

type Alinhar = 'esquerda' | 'centro' | 'direita';

/** Desenha em coordenadas do lado 1; no lado 2, o mesmo desenho sai espelhado no meio do quadro. */
type Pincel = {
  q: Quadro;
  espelhado: boolean;
  ret: (x: number, y: number, l: number, a: number, c: Cor) => void;
  px: (x: number, y: number, c: Cor) => void;
  texto: (t: string, x: number, y: number, c: Cor, alinhar: Alinhar, extra?: { grande?: boolean; corDeBaixo?: Cor }) => number;
  quadro: (s: Quadro, x: number, y: number) => void;
};

function pincel(q: Quadro, espelhado: boolean): Pincel {
  const W = q.largura;
  const trocar: Record<Alinhar, Alinhar> = { esquerda: 'direita', centro: 'centro', direita: 'esquerda' };
  return {
    q,
    espelhado,
    ret: (x, y, l, a, c) => { if (l > 0 && a > 0) retangulo(q, espelhado ? W - x - l : x, y, l, a, c); },
    px: (x, y, c) => pixel(q, espelhado ? W - 1 - x : x, y, c),
    // O texto não vira: no lado 2 ele troca de alinhamento e cai no lugar espelhado.
    texto: (t, x, y, c, alinhar, extra = {}) => escrever(q, t, espelhado ? W - x : x, y, c, {
      contorno: T.contorno,
      alinhar: espelhado ? trocar[alinhar] : alinhar,
      tamanho: extra.grande ? 'grande' : 'pequena',
      corDeBaixo: extra.corDeBaixo,
    }),
    quadro: (s, x, y) => colar(q, s, espelhado ? W - x - s.largura : x, y, espelhado),
  };
}

// ————— formas de barra —————

/** Onde cada linha de uma forma começa e termina (exclusivo). Recebe linhas fora da forma também, para o contorno seguir a diagonal. */
type Linhas = (r: number) => [number, number];

/** A forma inflada `margem` pixels para todo lado, numa cor só: o contorno é a forma com margem 2, o aro com margem 1. */
function forma(p: Pincel, y: number, altura: number, linhas: Linhas, margem: number, c: Cor) {
  for (let r = -margem; r < altura + margem; r++) {
    const [ini, fim] = linhas(r);
    p.ret(ini - margem, y + r, fim - ini + 2 * margem, 1, c);
  }
}

/**
 * O miolo de uma barra: cheio a partir do começo, depois o atraso vermelho, depois o vazio. A
 * divisa corre paralela à ponta de dentro, então numa barra de ponta cortada ela também é
 * cortada — divisa reta numa barra diagonal parece erro de desenho. Linha de cima com luz e as
 * de baixo com sombra, como o volume das peças do lutador.
 */
function miolo(p: Pincel, y: number, altura: number, linhas: Linhas, comprimento: number,
  valor: number, atrasado: number, cheio: Tons, atraso: Tons, vazio: Tons, sombra = 2) {
  valor = limitar(valor, 0, 1);
  atrasado = limitar(Math.max(valor, atrasado), 0, 1);
  const tom = (t: Tons, r: number) => (r === 0 && altura > 2 ? t.luz : r >= altura - sombra ? t.sombra : t.base);
  for (let r = 0; r < altura; r++) {
    const [ini, fim] = linhas(r);
    // Quase morto ainda é vivo: sobra um pixel, senão a barra diria "acabou" antes da hora.
    let fc = limitar(fim - Math.round(comprimento * (1 - valor)), ini, fim);
    if (valor > 0 && fc === ini) fc = ini + 1;
    const fa = limitar(Math.max(fc, fim - Math.round(comprimento * (1 - atrasado))), ini, fim);
    p.ret(ini, y + r, fc - ini, 1, tom(cheio, r));
    p.ret(fc, y + r, fa - fc, 1, tom(atraso, r));
    p.ret(fa, y + r, fim - fa, 1, tom(vazio, r));
  }
}

const tonsDaVida = (v: number) => (v > 0.5 ? T.verde : T.amarelo);

/** Barra de vida inteira: contorno, aro e miolo. */
function barraDeVida(p: Pincel, y: number, altura: number, linhas: Linhas, comprimento: number, lado: LadoDoPlacar) {
  forma(p, y, altura, linhas, 2, T.contorno);
  forma(p, y, altura, linhas, 1, T.aro);
  miolo(p, y, altura, linhas, comprimento, lado.vida, lado.vidaAtrasada, tonsDaVida(lado.vida), T.atraso, T.vazio);
}

// ————— retrato —————

/**
 * O retrato recortado para cada tamanho fica guardado: o placar é desenhado sessenta vezes por
 * segundo e o retrato não muda durante a luta.
 */
const recortes = new WeakMap<Quadro, Map<number, Quadro>>();
function noTamanho(r: Quadro, lado: number): Quadro {
  if (r.largura === lado && r.altura === lado) return r;
  let m = recortes.get(r);
  if (!m) { m = new Map(); recortes.set(r, m); }
  let s = m.get(lado);
  if (!s) { s = apertarRetrato(r, lado); m.set(lado, s); }
  return s;
}

/** Fundo em dois tons com pontilhado na passagem — o degradê de pixel art, sem cor inventada no meio. */
function fundoDegrade(p: Pincel, x: number, y: number, l: number, a: number, cima: Cor, baixo: Cor) {
  for (let r = 0; r < a; r++) {
    const t = r / Math.max(1, a - 1);
    for (let c = 0; c < l; c++) p.px(x + c, y + r, pontilhar(c, r, t) ? baixo : cima);
  }
}

function retrato(p: Pincel, x: number, y: number, lado: number, l: LadoDoPlacar, aro: boolean) {
  const m = aro ? 2 : 1;
  p.ret(x - m, y - m, lado + 2 * m, lado + 2 * m, T.contorno);
  if (aro) p.ret(x - 1, y - 1, lado + 2, lado + 2, T.aro);
  const f = T.fundoRetrato[p.espelhado ? 1 : 0];
  fundoDegrade(p, x, y, lado, lado, f.cima, f.baixo);
  p.quadro(noTamanho(l.retrato, lado), x, y);
}

// ————— relógio —————

function textoDoTempo(tempo: number | null) {
  if (tempo === null) return '∞';
  return String(limitar(Math.ceil(tempo), 0, 99)).padStart(2, '0');
}

function coresDoTempo(tempo: number | null) {
  return tempo !== null && tempo <= 10 ? T.relogioAcabando : T.relogio;
}

/** A caixa do relógio: contorno, aro e miolo escuro, centrada em `cx`. */
function caixa(q: Quadro, cx: number, y: number, l: number, a: number, aro: Cor = T.aro) {
  const x = Math.round(cx - l / 2);
  retangulo(q, x, y, l, a, T.contorno);
  retangulo(q, x + 1, y + 1, l - 2, a - 2, aro);
  retangulo(q, x + 2, y + 2, l - 4, a - 4, T.vazio.base);
  retangulo(q, x + 2, y + 2, l - 4, 1, T.vazio.luz);
  retangulo(q, x + 2, y + a - 3, l - 4, 1, T.vazio.sombra);
}

// ————— marcas —————

/** Um medalhão redondo de 7x7 (rodada vencida) com contorno. */
const MEDALHA = ['..XXX..', '.XXXXX.', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..'];
/** A estrelinha de 5x5, a mesma das esferas e das vitórias. */
const ESTRELA = ['..X..', '..X..', 'XXXXX', '.XXX.', '.X.X.'];
/** Estrela grande, 9x9, para as vitórias da variante B. */
const ESTRELA_GRANDE = ['....X....', '....X....', '...XXX...', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '..XXXXX..', '.XX...XX.', '.X.....X.'];

/**
 * Desenha uma grade de `X` com contorno em volta — vizinhança de 8, como o texto: a ponta da
 * estrela é diagonal e vazaria com a de 4 — e luz na borda de cima e da esquerda, sombra na de baixo e da direita.
 */
function desenho(p: Pincel, g: string[], x: number, y: number, t: Tons) {
  const tem = (c: number, r: number) => r >= 0 && r < g.length && g[r][c] === 'X';
  for (let r = -1; r <= g.length; r++) {
    for (let c = -1; c <= g[0].length; c++) {
      if (tem(c, r)) continue;
      let perto = false;
      for (let dy = -1; dy <= 1 && !perto; dy++) for (let dx = -1; dx <= 1; dx++) if (tem(c + dx, r + dy)) { perto = true; break; }
      if (perto) p.px(x + c, y + r, T.contorno);
    }
  }
  for (let r = 0; r < g.length; r++) {
    for (let c = 0; c < g[r].length; c++) {
      if (!tem(c, r)) continue;
      const tom = !tem(c, r - 1) || !tem(c - 1, r) ? t.luz : !tem(c, r + 1) || !tem(c + 1, r) ? t.sombra : t.base;
      p.px(x + c, y + r, tom);
    }
  }
}

// ————— variante A: clássico —————

/**
 * A: o placar de fliperama. As barras saem do relógio para as pontas, largas, com a ponta de
 * dentro cortada na diagonal apontando para ele; retrato na ponta, nome embaixo da barra e os
 * medalhões das rodadas encostados no relógio. O ki fica no RODAPÉ, nos cantos: é o que se olha
 * na hora de soltar o especial, e lá embaixo não disputa lugar com a vida.
 */
function classico(q: Quadro, e: EstadoDoPlacar) {
  const cx = q.largura / 2;
  e.lados.forEach((lado, i) => {
    const p = pincel(q, i === 1);
    retrato(p, 4, 4, 32, lado, true);
    // A barra encosta no retrato e no relógio: o contorno dela É o contorno deles.
    const ini = 39, fim = cx - 18, y = 7, altura = 10;
    const linhas: Linhas = (r) => [ini, fim - r];
    barraDeVida(p, y, altura, linhas, fim - ini, lado);
    p.texto(lado.nome, 42, 23, T.branco, 'esquerda');
    for (let k = 0; k < 2; k++) desenho(p, MEDALHA, fim - 8 - k * 10, 22, k < lado.vitorias ? T.ouro : T.ouroApagado);
    kiNoRodape(p, lado);
  });
  const cores = coresDoTempo(e.tempo);
  caixa(q, cx, 1, 34, 28);
  escrever(q, textoDoTempo(e.tempo), cx, 8, cores.cima, { tamanho: 'grande', contorno: T.contorno, alinhar: 'centro', corDeBaixo: cores.baixo });
  escrever(q, `ROUND ${e.rodada}`, cx, 33, T.branco, { contorno: T.contorno, alinhar: 'centro' });
}

/** O ki da variante A: o número de barras cheias, grande, e três segmentos inclinados. */
function kiNoRodape(p: Pincel, lado: LadoDoPlacar) {
  const ki = limitar(lado.ki, 0, 3);
  const cheias = Math.floor(ki + QUASE);
  const cheio = lado.piscar ? T.kiClarao : T.ki;
  const base = p.q.altura - 16;
  p.texto(String(cheias), 5, base, cheias > 0 ? cheio.base : T.kiZero.cima, 'esquerda', {
    grande: true, corDeBaixo: cheias > 0 ? cheio.sombra : T.kiZero.baixo,
  });
  const altura = 6, largura = 30, y = base + 5;
  for (let k = 0; k < 3; k++) {
    const x = 19 + k * (largura + 3);
    // Paralelogramo: cada linha de cima anda um pixel para a frente.
    const linhas: Linhas = (r) => [x + (altura - 1 - r), x + largura + (altura - 1 - r)];
    const v = limitar(ki - k, 0, 1);
    const pronta = v >= 1 - QUASE;
    forma(p, y, altura, linhas, 2, T.contorno);
    // A barra pronta ganha o aro aceso: é o "pode soltar" visto de canto de olho.
    forma(p, y, altura, linhas, 1, pronta ? cheio.luz : T.aro);
    miolo(p, y, altura, linhas, largura, pronta ? 1 : v, 0, pronta ? cheio : T.kiEnchendo, T.kiVazio, T.kiVazio);
  }
}

// ————— variante B: esferas quadradas —————

const ESFERAS = 7;
const LADO_DA_ESFERA = 11;

/**
 * Uma esfera quadrada, 11x11 por dentro. Apagada, é um quadrado escuro com a estrela quase
 * sumindo. Acesa, é azul de ki com a sombra em faixa embaixo e à direita, um reflexo redondo no
 * canto de cima e a estrela escura no meio — a estrela vermelha da esfera laranja, trocada para
 * as cores do ki. É o reflexo que faz o quadrado ler como ESFERA e não como ladrilho: sem ele
 * seria um botão. A que está enchendo sobe de baixo para cima, no azul apagado.
 */
function esfera(p: Pincel, x: number, y: number, v: number, piscar: boolean) {
  const n = LADO_DA_ESFERA;
  p.ret(x - 1, y - 1, n + 2, n + 2, T.contorno);
  const acesa = v >= 1 - QUASE;
  const t = acesa ? (piscar ? T.kiClarao : T.ki) : T.kiVazio;
  p.ret(x, y, n, n, t.base);
  if (!acesa && v > QUASE) {
    const h = Math.max(1, Math.round(n * v));
    p.ret(x, y + n - h, n, h, T.kiEnchendo.base);
    p.ret(x, y + n - h, n, 1, T.kiEnchendo.luz);
  }
  p.ret(x, y + n - 2, n, 2, t.sombra);
  p.ret(x + n - 2, y, 2, n, t.sombra);
  if (acesa) {
    // o reflexo: um gomo claro no canto de cima, com o ponto branco dentro
    p.ret(x + 2, y + 1, 3, 1, t.luz);
    p.ret(x + 1, y + 2, 1, 2, t.luz);
    p.px(x + 2, y + 2, T.branco);
  }
  const estrela = acesa ? (piscar ? cor('#3f9fe6') : cor('#12357c')) : v > QUASE ? T.kiEnchendo.sombra : T.kiVazio.luz;
  ESTRELA.forEach((linha, r) => {
    for (let c = 0; c < linha.length; c++) if (linha[c] === 'X') p.px(x + 3 + c, y + 3 + r, estrela);
  });
}

/**
 * B: o ki são SETE esferas quadradas — a piada do nome. Três barras de ki enchem as sete: cada
 * barra vale 7/3 de esfera, e a que está enchendo sobe de baixo. As rodadas vencidas são estrelas
 * junto do relógio.
 */
function esferasQuadradas(q: Quadro, e: EstadoDoPlacar) {
  const cx = q.largura / 2;
  e.lados.forEach((lado, i) => {
    const p = pincel(q, i === 1);
    retrato(p, 4, 4, 32, lado, true);
    const ini = 39, fim = cx - 18, y = 6, altura = 7;
    const linhas: Linhas = () => [ini, fim];
    barraDeVida(p, y, altura, linhas, fim - ini, lado);
    p.texto(lado.nome, 42, 19, T.branco, 'esquerda');
    const acesas = (limitar(lado.ki, 0, 3) * ESFERAS) / 3;
    for (let k = 0; k < ESFERAS; k++) esfera(p, 41 + k * (LADO_DA_ESFERA + 3), 26, limitar(acesas - k, 0, 1), !!lado.piscar);
    for (let k = 0; k < 2; k++) desenho(p, ESTRELA_GRANDE, fim - 11 - k * 12, 18, k < lado.vitorias ? T.ouro : T.ouroApagado);
  });
  const cores = coresDoTempo(e.tempo);
  caixa(q, cx, 1, 34, 26);
  escrever(q, textoDoTempo(e.tempo), cx, 7, cores.cima, { tamanho: 'grande', contorno: T.contorno, alinhar: 'centro', corDeBaixo: cores.baixo });
  escrever(q, `ROUND ${e.rodada}`, cx, 31, T.branco, { contorno: T.contorno, alinhar: 'centro' });
}

// ————— variante C: compacto —————

/**
 * C: tudo numa faixa de 24 px no alto, para sobrar cenário. Retrato só do rosto, vida fina, e
 * embaixo dela o nome junto do retrato e o ki como um fio contínuo com marcas nos terços, que
 * termina nas rodadas vencidas. O relógio é o menor dos três e não tem letreiro de rodada — mas
 * continua com os algarismos grandes: com os de 5 px, "87" num relance era um borrão amarelo.
 *
 * Compacto não quer dizer sem aro. Só com o contorno, a barra vazia era da cor do chão escuro, e
 * a vida baixa não tinha comprimento que se lesse: o aro claro é o que desenha onde a barra acaba.
 * O fio do ki divide o contorno de baixo da barra, e o retrato divide o da ponta — é o que deixa
 * a faixa com a mesma altura de antes.
 */
function compacto(q: Quadro, e: EstadoDoPlacar) {
  const cx = q.largura / 2;
  e.lados.forEach((lado, i) => {
    const p = pincel(q, i === 1);
    retrato(p, 3, 3, 20, lado, true);
    const ini = 26, fim = cx - 13, y = 3, altura = 7;
    const linhas: Linhas = () => [ini, fim];
    barraDeVida(p, y, altura, linhas, fim - ini, lado);
    p.texto(lado.nome, 28, 15, T.branco, 'esquerda');
    // O ki começa num lugar FIXO, e não logo depois do nome: amarrado ao nome, o fio do Goiaba e o
    // da Geladeira começariam em lugares diferentes, e comparar os dois lados seria procurar.
    const kiIni = 76, kiFim = fim - 17, kiY = y + altura + 3, kiAlt = 3;
    const kiLinhas: Linhas = () => [kiIni, kiFim];
    const ki = limitar(lado.ki, 0, 3);
    const cheias = Math.floor(ki + QUASE);
    const cheio = lado.piscar ? T.kiClarao : T.ki;
    forma(p, kiY, kiAlt, kiLinhas, 2, T.contorno);
    // o aro acende quando há barra inteira para gastar, como o dos segmentos da A
    forma(p, kiY, kiAlt, kiLinhas, 1, cheias > 0 ? cheio.luz : T.aro);
    // O que já é barra inteira brilha, e o pedaço que ainda enche vai no azul apagado — que é
    // exatamente o lugar do "atraso" da barra de vida: o trecho entre o cheio e onde se chega.
    miolo(p, kiY, kiAlt, kiLinhas, kiFim - kiIni, cheias / 3, ki / 3, cheio, T.kiEnchendo, T.kiVazio, 1);
    // Marcas nos terços, por cima do miolo: é onde uma barra termina e a próxima começa.
    for (let k = 1; k < 3; k++) p.ret(kiIni + Math.round(((kiFim - kiIni) * k) / 3), kiY, 1, kiAlt, T.contorno);
    for (let k = 0; k < 2; k++) {
      const x = fim - 6 - k * 7, yy = kiY - 1;
      p.ret(x - 1, yy - 1, 7, 7, T.contorno);
      const t = k < lado.vitorias ? T.ouro : T.ouroApagado;
      p.ret(x, yy, 5, 5, t.base);
      p.ret(x, yy, 4, 1, t.luz);
      p.ret(x, yy, 1, 4, t.luz);
      p.ret(x, yy + 4, 5, 1, t.sombra);
      p.ret(x + 4, yy, 1, 5, t.sombra);
    }
  });
  const cores = coresDoTempo(e.tempo);
  caixa(q, cx, 1, 26, 19);
  escrever(q, textoDoTempo(e.tempo), cx, 4, cores.cima, { tamanho: 'grande', contorno: T.contorno, alinhar: 'centro', corDeBaixo: cores.baixo });
}

export function desenharPlacar(q: Quadro, estado: EstadoDoPlacar, variante: VarianteDoPlacar) {
  if (variante === 'a') classico(q, estado);
  else if (variante === 'b') esferasQuadradas(q, estado);
  else compacto(q, estado);
}

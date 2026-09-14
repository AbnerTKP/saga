/**
 * Planeta Verde — céu verde-água com três sóis pequenos, um mar parado cheio de agulhas de pedra,
 * um platô com um vilarejo de casas-domo no meio da água e o campo de grama verde-azulada, com
 * trilhas de terra, onde se luta. É o planeta calmo onde a luta estraga a paz.
 *
 * O CHÃO É PERSPECTIVA DE VERDADE, e é isso que decide o desenho do arquivo inteiro. Cada linha do
 * plano — água e grama — é uma camada de um pixel de altura andando no próprio fator: 1 na linha
 * onde os lutadores pisam, menos para o fundo e mais para a frente, que é o que os pisos de
 * fliperama faziam trocando o deslocamento a cada linha de varredura. Com um fator só, o piso
 * inteiro deslizaria como papel de parede, e a mancha de grama pintada "em perspectiva" dentro dele
 * deixaria de fazer sentido no primeiro passo da câmera. Como a camada já tem `fator` e `y`, isto
 * cabe no contrato de `cenario.ts` sem mexer nele.
 *
 * Por isso nada que tenha ALTURA mora numa linha: um tufo de cinco pixels pintado em cinco linhas
 * seria cortado em cinco fatores e entortaria 13 px de uma ponta à outra da câmera. O que fica de
 * pé mora numa camada no fator do chão onde está plantado, ou é colado em `animar` nesse fator.
 *
 * O REFLEXO TAMBÉM NÃO CABE NUMA CAMADA. A imagem da agulha na água está na profundidade da agulha,
 * mas é pintada sobre linhas de água mais perto, que andam noutro fator: presa às linhas, ela
 * escorregaria para longe da pedra quando a câmera anda. Então o reflexo é colado em `animar`, no
 * fator de quem reflete, e só onde ainda é água — e é isso mesmo que o deixa tremer.
 *
 * Tudo é posto no mundo por duas coordenadas: `W`, a posição lateral em pixels da linha da luta, e
 * o fator da profundidade (1 na linha da luta). O que está em `W` aparece, na camada de fator `f`,
 * em `naCamada(W, f)` — e com isso o ponto de fuga fica no meio da tela para qualquer câmera.
 */
import { type Cor, type Quadro, colar, cor, criarQuadro, linha, pixel } from '../quadro.ts';
import { type Camada, type Cenario, degrade, larguraDaCamada, pontilhar, sorteio } from '../cenario.ts';
import { CHAO, TELA } from '../medidas.ts';

// ─── A geometria da perspectiva ────────────────────────────────────────────────────────────────

const MUNDO = { largura: 640 };
const MEIO_DA_TELA = TELA.largura / 2;
/** Onde o mar encontra o céu: 80 linhas acima de onde se pisa, na altura do peito dos lutadores. */
const HORIZONTE = 118;
const PROFUNDIDADE = CHAO - HORIZONTE;
/** A distância da câmera à linha da luta, na unidade do mundo: só serve para a escala do relevo. */
const FOCO = 330;

/** Quanto uma linha do plano anda com a câmera. Na linha dos pés é exatamente 1: ninguém escorrega. */
const fatorDaLinha = (y: number) => (y - HORIZONTE) / PROFUNDIDADE;
/** A linha onde pisa o que está na profundidade `f`. */
const linhaDoFator = (f: number) => Math.round(HORIZONTE + f * PROFUNDIDADE);
/** O x, dentro de uma camada de fator `f`, de quem está na posição lateral `W` do mundo. */
const naCamada = (W: number, f: number) => MEIO_DA_TELA * (1 - f) + W * f;

/**
 * Arredonda uma profundidade para a de uma linha do plano. Quem está de pé tem de andar no fator
 * EXATO da linha em que pisa: 0.53 numa linha de 0.525 escorrega pixel e meio pelo chão ao longo
 * da câmera, e árvore que patina é pior que árvore torta.
 */
const naLinha = (f: number) => fatorDaLinha(linhaDoFator(f));

/** As profundidades em que mora o que está de pé. */
const PLANO = {
  serraLonge: naLinha(0.04), serraPerto: naLinha(0.1), agulhas: naLinha(0.19), plato: naLinha(0.31),
  meio: naLinha(0.53), perto: naLinha(0.7), moitas: naLinha(0.84),
  /** A última linha da tela: o capim da frente nasce nela. */
  frente: fatorDaLinha(TELA.altura - 1),
};

// ─── As paletas ────────────────────────────────────────────────────────────────────────────────
// Cada faixa de distância tem as suas cores, e quanto mais longe, mais perto do céu: o contraste
// alto fica com o campo e com os lutadores. As cores do céu e da água não se repetem em nenhuma
// outra camada — é por elas que nuvem, reflexo e brilho sabem onde podem pintar (ver `animar`).

const C = (...hex: string[]) => hex.map(cor);

const CEU = C('#35a08a', '#47ae92', '#5dbb9a', '#77c8a1', '#93d4a7', '#b0dfab', '#c9e8ad');
/** Um degrau mais claro que o céu, só em volta dos sóis. */
const CEU_CLARO = cor('#dbf0bd');
const SOL = { nucleo: cor('#fffdf0'), anel: cor('#fbf3bd') };
const NUVEM = C('#9cd3b0', '#bfe5c2', '#dcf2d6', '#f3fbea');

const SERRA_LONGE = { corpo: cor('#a3d2b0'), sombra: cor('#97c9a9'), luz: cor('#b4dcb6') };
const SERRA_PERTO = { corpo: cor('#80bfa8'), sombra: cor('#71b3a0'), luz: cor('#96cdb1'), estrato: cor('#79b9a4') };

/** A água, de longe (devolve o céu do horizonte, claro) para perto (devolve o alto, mais fundo). */
const AGUA = C('#b8e2bf', '#98d6b9', '#7bc8b3', '#62b9ad', '#4eaaa8');
/** A névoa rente ao horizonte, onde o mar vira céu. */
const BRUMA = cor('#cfeab6');
const ESPUMA = cor('#e2f6df');
const BRILHO = cor('#f4fdf0');
const REFLEXO = { escuro: cor('#3f8e92'), medio: cor('#5ea6a3'), claro: cor('#a3d6c2'), nevoa: cor('#a2d3b6') };

type TomDePedra = { tons: Cor[]; borda: Cor; estrato: Cor; grama: Cor[]; bordaGrama: Cor };
type TomDeArvore = { copa: Cor[]; borda: Cor; tronco: Cor[] };
type TomDeDomo = { tons: Cor[]; borda: Cor; janela?: Cor; vidro?: Cor };

const PEDRA_LONGE: TomDePedra = {
  tons: C('#98b9a8', '#aec9b3', '#c2d6bc', '#d4e1c5'), borda: cor('#88ab9d'), estrato: cor('#a3c0ad'),
  grama: C('#5aab96', '#6dbda2', '#86ceb1'), bordaGrama: cor('#509d8b'),
};
const PEDRA_PLATO: TomDePedra = {
  tons: C('#6b877f', '#839d8f', '#9fb49e', '#b9c9aa', '#d0d9b5'), borda: cor('#58746f'), estrato: cor('#7a9488'),
  grama: C('#3a9886', '#4cad91', '#66c29f'), bordaGrama: cor('#33867a'),
};
const PEDRA_PERTO: TomDePedra = {
  tons: C('#566a69', '#71837b', '#8f9c8e', '#adb4a0', '#c9cbb3'), borda: cor('#415455'), estrato: cor('#617673'),
  grama: C('#2a8577', '#379c86', '#4fb593'), bordaGrama: cor('#236f67'),
};

const ARVORE_LONGE: TomDeArvore = {
  copa: C('#57a591', '#69b79b', '#80c8aa', '#9ad6b9'), borda: cor('#4d9785'),
  tronco: C('#7b9788', '#8ea796', '#a3b9a6'),
};
const ARVORE_MEIO: TomDeArvore = {
  copa: C('#2b837a', '#389884', '#4dae91', '#69c29f', '#8dd6b4'), borda: cor('#24716c'),
  tronco: C('#526b66', '#6a857a', '#89a093'),
};
const ARVORE_PERTO: TomDeArvore = {
  copa: C('#19626a', '#217b78', '#2e9684', '#46b091', '#6ec9a5', '#9bdebe'), borda: cor('#134f58'),
  tronco: C('#3a4e50', '#566c66', '#788e84'),
};

const DOMO: TomDeDomo = {
  tons: C('#97bfc0', '#bcd9d7', '#dcede8', '#f6fbf4'), borda: cor('#769fa5'),
  janela: cor('#285362'), vidro: cor('#4b8b97'),
};
const DOMO_PLATO: TomDeDomo = {
  tons: C('#a8cdc6', '#c6e1d9', '#e1f1e9', '#f1f9f1'), borda: cor('#8fb8b3'),
  janela: cor('#4f808b'), vidro: cor('#6e9fa5'),
};

/**
 * O campo, do claro (longe, na margem) ao escuro (perto). É verde-azulado, e a água é turquesa: com
 * o campo no mesmo turquesa da água, a grama com tufos lia como um raso cheio de alga, e os
 * lutadores pareciam lutar dentro do mar. O que separa terra de água é o matiz, o valor mais escuro
 * onde se pisa e a faixa de areia e terra da beira entre os dois.
 */
const CAMPO = C('#6cc28c', '#55ae80', '#439a78', '#378670', '#2e7266', '#28605c', '#225052', '#1d4147');
/** A areia da beira, entre a espuma e a grama. */
const ORLA = cor('#d8e3ad');
/**
 * Terra batida em manchas no campo, do claro ao escuro: um quente apagado no meio de um cenário
 * todo frio. Sem ela o planeta inteiro era um matiz só, e cenário de uma cor só não tem para onde
 * o olho ir.
 */
const TERRA = C('#c9c294', '#b0a97f', '#958f6d', '#7b775d', '#63624f');
/**
 * Flor é um ponto de grama clara, e só de vez em quando um amarelo apagado. Branco e amarelo vivos
 * no chão, perto dos pés, leem como faísca de golpe — e faísca num jogo de luta quer dizer "acertou".
 */
const FLOR = { clara: cor('#8fcb94'), amarela: cor('#c6d58e') };
const TUFO = { escuro: cor('#1b3d3c'), meio: cor('#2d6653'), claro: cor('#8cc98f') };
const MOITA = { tons: C('#1f4c47', '#2a6656', '#3a8263', '#56a174', '#86c792'), borda: cor('#183c3b') };

// ─── Ruído e degraus ───────────────────────────────────────────────────────────────────────────

/**
 * Ruído de valor numa grade de 64x64 sorteada com semente. Serve para o relevo do campo, a folhagem
 * e a pedra: sem ele, tudo sai liso como desenho vetorial ampliado.
 */
class Ruido {
  readonly t = new Float32Array(64 * 64);
  constructor(semente: number) {
    const r = sorteio(semente);
    for (let i = 0; i < this.t.length; i++) this.t[i] = r();
  }
  em(x: number, y: number): number {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const t = this.t;
    const a = t[((yi & 63) << 6) | (xi & 63)], b = t[((yi & 63) << 6) | ((xi + 1) & 63)];
    const c = t[(((yi + 1) & 63) << 6) | (xi & 63)], d = t[(((yi + 1) & 63) << 6) | ((xi + 1) & 63)];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
}

/** Um número de 0 a 1 que depende só do pixel: o salpicado fixo das flores e dos pedregulhos. */
function acaso(x: number, y: number, semente = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(semente + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Um valor contínuo vira o índice de um tom da paleta. O pontilhado só aparece numa faixa estreita
 * no meio da passagem: pontilhado largo em tudo vira chuvisco, e o que se quer são manchas de cor
 * com a borda trançada.
 */
function degrau(v: number, x: number, y: number, n: number): number {
  const i = Math.floor(v), fr = v - i;
  const t = fr < 0.3 ? 0 : fr > 0.7 ? 1 : (fr - 0.3) / 0.4;
  const k = pontilhar(x, y, t) ? i + 1 : i;
  return k < 0 ? 0 : k >= n ? n - 1 : k;
}

const entre01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ─── Pincéis ───────────────────────────────────────────────────────────────────────────────────

/** A luz do planeta vem dos sóis: do alto à direita, e um pouco de frente. x direita, y baixo, z quem olha. */
const LUZ = (() => {
  const v = [0.62, -0.6, 0.5];
  const n = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / n, v[1] / n, v[2] / n] as const;
})();

type OpcoesDeEsfera = {
  /** Contorno só do lado da sombra: do lado da luz a borda fica clara e a forma respira. */
  borda?: Cor;
  /** Corta a esfera nessa linha (o domo é meia esfera). */
  ateY?: number;
  /** Soma ao tom de cada pixel: é o que dá tufo à copa e rugosidade à pedra. */
  textura?: (x: number, y: number) => number;
  /** Empurra a luz toda para o escuro (positivo) ou para o claro. */
  peso?: number;
};

function esfera(q: Quadro, cx: number, cy: number, rx: number, ry: number, tons: Cor[], o: OpcoesDeEsfera = {}) {
  const n = tons.length;
  const dentro = (x: number, y: number) => {
    if (o.ateY !== undefined && y >= o.ateY) return false;
    const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
    return u * u + v * v <= 1;
  };
  const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1);
  const y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!dentro(x, y)) continue;
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
      const nz = Math.sqrt(Math.max(0, 1 - u * u - v * v));
      const l = u * LUZ[0] + v * LUZ[1] + nz * LUZ[2];
      const val = ((l + 0.3) / 1.25) * (n - 0.5) - (o.peso ?? 0) + (o.textura ? o.textura(x, y) : 0);
      const k = degrau(val, x, y, n);
      let c = tons[k];
      if (o.borda !== undefined && k < (n - 1) / 2 &&
        (!dentro(x - 1, y) || !dentro(x + 1, y) || !dentro(x, y - 1) || !dentro(x, y + 1))) c = o.borda;
      pixel(q, x, y, c);
    }
  }
}

/**
 * A árvore do planeta: tronco fino e alto, levemente torto, e uma bola de copa lá em cima. A copa
 * ganha uma bola menor atrás, deslocada, para a silhueta não ser um círculo de compasso.
 */
function arvore(q: Quadro, x: number, base: number, altura: number, raio: number, tom: TomDeArvore, semente: number) {
  const r = sorteio(semente);
  const folha = new Ruido(semente + 7);
  const inclina = (r() - 0.5) * altura * 0.14;
  const esp = raio >= 13 ? 3 : raio >= 6 ? 2 : 1;
  const cy = base - altura, cx = x + inclina;
  for (let y = Math.floor(cy + raio * 0.4); y <= base; y++) {
    const k = Math.max(0, (base - y) / altura);
    const xc = x + inclina * k * k;
    // o pé do tronco alarga um pixel, senão a árvore parece espetada no chão
    const e = esp + (k < 0.04 && esp > 1 ? 1 : 0);
    const xi = Math.round(xc - e / 2);
    for (let i = 0; i < e; i++) {
      const c = e === 1 ? tom.tronco[1] : i === 0 ? tom.tronco[0] : i === e - 1 ? tom.tronco[2] : tom.tronco[1];
      pixel(q, xi + i, y, c);
    }
  }
  const textura = (px: number, py: number) => (folha.em(px / 2.6, py / 2.6) - 0.5) * 1.5;
  const lado = r() < 0.5 ? -1 : 1;
  esfera(q, cx + lado * raio * 0.55, cy + raio * 0.3, raio * 0.6, raio * 0.56, tom.copa, { borda: tom.borda, textura, peso: 0.4 });
  esfera(q, cx, cy, raio, raio * 0.94, tom.copa, { borda: tom.borda, textura });
}

/**
 * A casa-domo: meia esfera branca com uma fileira de janelas redondas, porta em arco no meio e um
 * botão no topo. As janelas descem pela curva do domo — reto, parece adesivo colado na frente.
 */
function domo(q: Quadro, x: number, base: number, larg: number, alt: number, tom: TomDeDomo) {
  const rx = larg / 2;
  // o peso tira o domo do branco chapado: com a luz de frente, meia esfera branca vira um disco
  esfera(q, x, base, rx, alt, tom.tons, { borda: tom.borda, ateY: base, peso: 0.55 });
  if (larg >= 9) {
    const grande = larg >= 24;
    esfera(q, x + 0.5, base - alt - (grande ? 1 : 0.5), grande ? 2.4 : 1.6, grande ? 2 : 1.3, tom.tons, { borda: tom.borda });
  }
  // a cinta perto do chão, que acompanha a curva e some no lado da luz
  if (larg >= 16) {
    const yc = base - Math.max(2, Math.round(alt * 0.16));
    for (let px = Math.ceil(x - rx + 1); px < x + rx - 1; px++) {
      const u = (px + 0.5 - x) / rx;
      if (u > 0.55 && !pontilhar(px, yc, 0.5)) continue;
      pixel(q, px, yc, tom.tons[1]);
    }
  }
  if (!tom.janela || larg < 10) return;
  const vidro = tom.vidro ?? tom.janela;
  const lado = larg >= 30 ? 4 : larg >= 22 ? 3 : 2;
  // as janelas ficam dos dois lados da porta, nunca em cima dela
  const us = larg >= 30 ? [-0.7, -0.36, 0.36, 0.7] : larg >= 16 ? [-0.55, 0.55] : [-0.5, 0.5];
  const yj = base - alt * (lado > 2 ? 0.58 : 0.55);
  for (const u of us) {
    const xj = Math.round(x + u * rx * 0.82 - lado / 2);
    const yy = Math.round(yj + u * u * alt * 0.16 - lado / 2);
    if (lado > 2) {
      // Janela redonda em pixel: 4x4 sem os cantos; a de 3x3 leva os cantos no contorno do domo,
      // meio-tom que arredonda. Tirar os cantos de um 3x3, ou de um 4x3, desenha uma cruz.
      for (let dy = 0; dy < lado; dy++) for (let dx = 0; dx < lado; dx++) {
        const canto = (dx === 0 || dx === lado - 1) && (dy === 0 || dy === lado - 1);
        if (canto && lado === 4) continue;
        const c = canto ? tom.borda : dy === lado - 1 || (dx === lado - 1 && dy > 0) ? vidro : tom.janela;
        pixel(q, xj + dx, yy + dy, c);
      }
    } else {
      pixel(q, xj, yy, tom.janela); pixel(q, xj + 1, yy, tom.janela);
      pixel(q, xj, yy + 1, vidro); pixel(q, xj + 1, yy + 1, vidro);
    }
  }
  // porta em arco, no meio: topo mais estreito que o vão
  const ap = Math.max(3, Math.round(alt * (lado > 2 ? 0.42 : 0.4)));
  const lp = larg >= 20 ? 4 : 2;
  const xp = Math.round(x - lp / 2);
  for (let y = base - ap; y < base; y++) {
    const topo = y === base - ap;
    for (let dx = topo ? 1 : 0; dx < (topo ? lp - 1 : lp); dx++) pixel(q, xp + dx, y, tom.janela);
  }
}

/**
 * O pilar de rocha: coluna em fiadas, com a cintura comida pela erosão, o chapéu que sobra para os
 * lados e grama por cima. `cintura` 0 é um platô reto; perto de 0.35, a agulha fina do mar.
 */
function pilar(
  q: Quadro, x: number, base: number, altura: number, largura: number, cintura: number,
  tom: TomDePedra, semente: number,
) {
  const rn = new Ruido(semente);
  const topo = Math.round(base - altura);
  const n = tom.tons.length;
  const r = sorteio(semente + 3);
  // fendas verticais em lugares sorteados: numa pedra larga, são elas que dizem "rocha" e não "parede"
  const fendas: [number, number, number][] = [];
  const largo = largura > 30;
  for (let i = Math.round(largura / (largo ? 6 : 9)); i > 0; i--) {
    const y0 = topo + 3 + r() * altura * (largo ? 0.35 : 0.6);
    fendas.push([0.1 + r() * 0.8, y0, y0 + 3 + r() * altura * (largo ? 0.7 : 0.45)]);
  }
  let bordaDoTopo: [number, number] = [x - largura / 2, x + largura / 2];
  for (let y = topo; y <= base; y++) {
    const k = Math.min(1, (y - topo) / altura);
    let w = largura * (1 - cintura * Math.sin(Math.PI * Math.min(1, k * 1.05))) + (rn.em(0.5, y / 4) - 0.5) * 2.2;
    if (k < 0.1) w *= 1 + cintura * 0.9 * (1 - k / 0.1); // o chapéu que a erosão deixou
    if (k > 0.9) w += (k - 0.9) * Math.min(largura, 30) * 0.8; // o pé espalha em cascalho
    const desvio = (rn.em(3.5, y / 13) - 0.5) * 3.5;
    const xl = x - w / 2 + desvio, xr = x + w / 2 + desvio;
    const a = Math.round(xl), b = Math.round(xr) - 1;
    if (y === topo + 1) bordaDoTopo = [a, b];
    // As fiadas não são regulares: cada linha sorteia se é junta entre duas camadas de pedra. Na
    // pedra larga elas são raras — juntas e fendas no mesmo tanto desenham parede de tijolo.
    const junta = rn.em(9.5, y * 0.93) > (largo ? 0.74 : 0.64);
    for (let px = a; px <= b; px++) {
      const t = (px + 0.5 - xl) / (xr - xl);
      const u = t * 2 - 1;
      const nz = Math.sqrt(Math.max(0, 1 - u * u));
      const l = u * LUZ[0] * 1.3 + nz * LUZ[2];
      let val = ((l + 0.35) / 1.25) * (n - 0.5) + (rn.em(px / 3, y / 7) - 0.5) * 1.1;
      // o chapéu faz sombra logo abaixo dele, e a água molha o pé
      if (y - topo < 4 + cintura * 6) val -= 1.3;
      if (base - y < 2) val -= 1;
      let c = tom.tons[degrau(val, px, y, n)];
      if (px === a) c = tom.borda;
      else if (junta && rn.em(px / 4 + 20, y / 5) > 0.42 && t > 0.08 && t < 0.92) c = tom.estrato;
      for (const [ft, fy0, fy1] of fendas) {
        if (y >= fy0 && y <= fy1 && px === Math.round(xl + ft * (xr - xl) + (y - fy0) * 0.08)) c = tom.borda;
      }
      pixel(q, px, y, c);
    }
  }
  // a grama do topo, com fios caindo pela beirada
  const [a, b] = bordaDoTopo;
  const cx = (a + b + 1) / 2, rx = (b - a + 1) / 2 + 1.5;
  esfera(q, cx, topo + 0.5, rx, 3, tom.grama, { borda: tom.bordaGrama, ateY: topo + 3 });
  for (let px = Math.round(cx - rx + 1); px < cx + rx - 1; px++) {
    if (r() < 0.32) {
      const comp = 1 + Math.floor(r() * 3);
      for (let k = 0; k < comp; k++) pixel(q, px, topo + 3 + k, k === comp - 1 ? tom.bordaGrama : tom.grama[0]);
    }
  }
  return { topo, cx, rx };
}

/** Uma pedra solta do campo: bola achatada, rugosa, com um risco de fenda. */
function pedra(q: Quadro, x: number, base: number, larg: number, alt: number, tom: TomDePedra, semente: number) {
  const rn = new Ruido(semente);
  const textura = (px: number, py: number) => (rn.em(px / 3, py / 3) - 0.5) * 1.3;
  esfera(q, x, base, larg / 2, alt, tom.tons, { borda: tom.borda, ateY: base + 1, textura });
  const r = sorteio(semente);
  let fx = x + (r() - 0.3) * larg * 0.3, fy = base - alt * 0.75;
  for (let k = 0; k < alt * 0.6; k++) {
    pixel(q, fx, fy, tom.estrato);
    fy += 1; fx += r() < 0.4 ? (r() < 0.5 ? -1 : 1) : 0;
  }
}

/** Corta as linhas vazias de cima e de baixo: camada menor é camada mais barata de colar. */
function recortar(q: Quadro, fator: number): Camada {
  let y0 = q.altura, y1 = -1;
  for (let y = 0; y < q.altura; y++) {
    const i = y * q.largura;
    for (let x = 0; x < q.largura; x++) {
      if (q.px[i + x] !== 0) { if (y < y0) y0 = y; y1 = y; break; }
    }
  }
  if (y1 < 0) return { quadro: criarQuadro(1, 1), fator, y: 0 };
  const r = criarQuadro(q.largura, y1 - y0 + 1);
  r.px.set(q.px.subarray(y0 * q.largura, (y1 + 1) * q.largura));
  return { quadro: r, fator, y: y0 };
}

// ─── Reflexos ──────────────────────────────────────────────────────────────────────────────────

/** A imagem de ponta-cabeça de quem está na água, pronta para `animar` colar no fator dele. */
type Reflexo = { q: Quadro; x: number; y: number; fator: number };

/**
 * Espelha o que foi desenhado em `fonte` a partir da linha `base`, em faixas que somem para baixo.
 * A cor não é copiada: vira um de três tons de água, pela claridade do original — reflexo com a
 * cor inteira da pedra parece outra pedra enterrada.
 */
function refletir(fonte: Quadro, base: number, alcance: number, fator: number, longe = false): Reflexo | null {
  let x0 = fonte.largura, x1 = -1;
  for (let k = 0; k < alcance; k++) {
    const ys = base - k;
    if (ys < 0) break;
    for (let x = 0; x < fonte.largura; x++) {
      if (fonte.px[ys * fonte.largura + x] !== 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    }
  }
  if (x1 < 0) return null;
  const q = criarQuadro(x1 - x0 + 1, alcance);
  for (let k = 0; k < alcance; k++) {
    const ys = base - k;
    if (ys < 0) break;
    // uma linha a cada quatro some: é o que diz "água" e não "espelho"
    if (k % 4 === 3) continue;
    for (let x = x0; x <= x1; x++) {
      const c = fonte.px[ys * fonte.largura + x];
      if (c === 0 || !pontilhar(x, k, 1.15 - k / alcance)) continue;
      const lum = (c & 255) * 0.3 + ((c >>> 8) & 255) * 0.55 + ((c >>> 16) & 255) * 0.15;
      // a serra do horizonte já é quase céu: o reflexo dela é um tom só, colado na água clara
      q.px[k * q.largura + (x - x0)] = longe ? REFLEXO.nevoa
        : lum > 205 ? REFLEXO.claro : lum > 160 ? REFLEXO.medio : REFLEXO.escuro;
    }
  }
  return { q, x: x0, y: base + 1, fator };
}

// ─── As camadas ────────────────────────────────────────────────────────────────────────────────

/** Os três sóis ficam juntos no alto à direita: é de lá que vem a luz de tudo o que está desenhado. */
const SOIS: [number, number, number][] = [[304, 36, 6], [273, 22, 3.5], [335, 17, 2.5]];

function camadaDoCeu(): Camada {
  const q = criarQuadro(TELA.largura, HORIZONTE + 1);
  degrade(q, 0, HORIZONTE + 1, CEU, 8);
  // o céu clareia um degrau em volta dos sóis, pontilhado pela distância
  const [sx, sy] = SOIS[0];
  for (let y = 0; y < 80; y++) {
    for (let x = 220; x < TELA.largura; x++) {
      const d = Math.hypot((x - sx) * 0.8, y - sy);
      const i = y * q.largura + x;
      const k = CEU.indexOf(q.px[i]);
      if (k < 0) continue;
      // o miolo do clarão é cheio; o pontilhado fica só num anel estreito em volta
      const t = entre01((24 - d) / 7);
      if (t > 0 && pontilhar(x, y, t)) q.px[i] = k < CEU.length - 1 ? CEU[k + 1] : CEU_CLARO;
    }
  }
  for (const [x, y, r] of SOIS) {
    for (let py = Math.floor(y - r - 5); py <= y + r + 5; py++) {
      for (let px = Math.floor(x - r - 5); px <= x + r + 5; px++) {
        if (py < 0 || px < 0 || px >= q.largura) continue;
        const d = Math.hypot(px + 0.5 - x, py + 0.5 - y);
        const i = py * q.largura + px;
        if (d <= r - 1) q.px[i] = SOL.nucleo;
        else if (d <= r) q.px[i] = SOL.anel;
        else if (d <= r + 4.5 && pontilhar(px, py, 1.1 - (d - r) / 4.5)) q.px[i] = CEU_CLARO;
      }
    }
  }
  // o banco de nuvens deitado no horizonte, atrás das serras: sem ele a serra encosta num céu liso
  // e parece recortada em papel
  const rb = sorteio(5);
  for (let x = -10; x < TELA.largura + 10; x += 5 + Math.floor(rb() * 9)) {
    const rx = 7 + rb() * 15, ry = 4 + rb() * 9;
    const cy = HORIZONTE + 2 - rb() * 4;
    for (let py = Math.floor(cy - ry); py <= HORIZONTE; py++) {
      for (let px = Math.floor(x - rx); px <= x + rx; px++) {
        if (px < 0 || px >= q.largura || py < 0) continue;
        const u = (px + 0.5 - x) / rx, v = (py + 0.5 - cy) / ry;
        if (u * u + v * v > 1) continue;
        const i = py * q.largura + px;
        const atual = NUVEM.indexOf(q.px[i]);
        // topo iluminado, o resto no tom do corpo; bola de trás não pinta por cima da da frente
        const k = v < -0.72 && u > -0.4 ? 2 : 1;
        q.px[i] = NUVEM[Math.max(k, atual)];
      }
    }
  }
  // fiapos de nuvem parados, bem baixos: é o que faz o céu ter fundo além das nuvens que passam
  const r = sorteio(7);
  for (let n = 0; n < 7; n++) {
    const y = 84 + Math.floor(r() * 26);
    const x0 = Math.floor(r() * TELA.largura) - 40;
    const comp = 30 + Math.floor(r() * 70);
    for (let k = 0; k < comp; k++) {
      const px = x0 + k;
      if (px < 0 || px >= q.largura) continue;
      const borda = k < 6 || k > comp - 7;
      if (borda && !pontilhar(px, y, 0.5)) continue;
      q.px[y * q.largura + px] = NUVEM[1];
      if (k > 8 && k < comp - 12 && pontilhar(px, y, 0.4)) q.px[(y - 1) * q.largura + px] = NUVEM[1];
    }
  }
  return { quadro: q, fator: 0, y: 0 };
}

type TomDeSerra = { corpo: Cor; sombra: Cor; luz: Cor; estrato?: Cor };

/**
 * Uma formação do horizonte, linha a linha: a meia largura de cada linha sai de um perfil (chapéu,
 * cintura, pé) com a erosão sorteada por cima. Serve para a mesa larga e para a agulha — a mesa é
 * uma agulha sem cintura. O lado da sombra ganha dois pixels escuros, o da luz um claro, e o topo
 * uma linha clara: longe assim, é todo o volume que cabe.
 */
function formacao(q: Quadro, x: number, base: number, altura: number, largura: number, cintura: number,
  tom: TomDeSerra, rn: Ruido, semente: number) {
  const topo = Math.round(base - altura);
  const l = q.largura;
  let ultimo: [number, number] | null = null;
  for (let y = topo; y <= base; y++) {
    const k = (y - topo) / altura;
    let meia = largura / 2;
    // ombros gastos: as primeiras linhas encolhem
    if (y - topo < 2) meia -= 2 - (y - topo);
    meia *= 1 - cintura * Math.sin(Math.PI * Math.min(1, Math.max(0, (k - 0.08) / 0.8)));
    if (cintura > 0 && k < 0.14) meia *= 1 + cintura * 0.7;
    meia += k * k * largura * 0.18; // o pé alarga, o entulho que caiu
    const eroE = (rn.em(semente + 0.3, y / 3.2) - 0.5) * 2.6;
    const eroD = (rn.em(semente + 7.7, y / 3.2) - 0.5) * 2.6;
    const a = Math.round(x - meia + eroE), b = Math.round(x + meia + eroD) - 1;
    if (b < a) continue;
    for (let px = Math.max(0, a); px <= Math.min(l - 1, b); px++) {
      let c = tom.corpo;
      if (y === topo || (ultimo && (px < ultimo[0] || px > ultimo[1]))) c = tom.luz; // borda de cima de cada degrau
      else if (px - a < 2) c = tom.sombra;
      else if (b - px < 1) c = tom.luz;
      else if (tom.estrato && (y - topo) % 5 === 3 && pontilhar(px, y, 0.6)) c = tom.estrato;
      q.px[y * l + px] = c;
    }
    ultimo = [a, b];
  }
}

/**
 * As serras do horizonte: mesas de topo reto e agulhas com chapéu, em duas fileiras em cima do mar.
 * A de trás quase some no céu; a da frente tem um degrau a mais de contraste — e é só isso que diz
 * que uma está atrás.
 */
function camadaDaSerra(fator: number, semente: number, topoMin: number, topoMax: number,
  tom: TomDeSerra): { camada: Camada; fonte: Quadro; base: number } {
  const l = larguraDaCamada(MUNDO, fator);
  const q = criarQuadro(l, TELA.altura);
  const base = linhaDoFator(fator);
  const r = sorteio(semente);
  const rn = new Ruido(semente);
  let x = -20 - r() * 20;
  while (x < l + 30) {
    const agulha = r() < 0.35;
    const larg = agulha ? 8 + r() * 6 : 20 + r() * 46;
    const alto = base - (topoMin + r() * (topoMax - topoMin)) * (agulha ? 1.05 : 0.8);
    formacao(q, x + larg / 2, base, base - alto, larg, agulha ? 0.42 : 0.04, tom, rn, r() * 60);
    x += larg * (agulha ? 1.4 : 0.8) + r() * 36;
  }
  return { camada: recortar(q, fator), fonte: q, base };
}

/** Uma agulha de pedra no mar: onde está, e o que cresce em cima. */
type Agulha = {
  W: number; alt: number; larg: number; cintura: number;
  /** [deslocamento, altura, raio da copa] de cada árvore lá em cima. */
  arvores: [number, number, number][];
  /** Uma casa-domo no topo, [largura, altura]: a do ancião, que mora no alto. */
  casa?: [number, number];
};

/**
 * Pedras que saem da água numa profundidade: cada uma é desenhada à parte para ganhar o próprio
 * reflexo, e só depois colada na camada.
 */
function camadaDeAgulhas(fator: number, agulhas: Agulha[], tom: TomDePedra, tomArvore: TomDeArvore,
  semente: number, reflexos: Reflexo[]): Camada {
  const l = larguraDaCamada(MUNDO, fator);
  const q = criarQuadro(l, TELA.altura);
  const base = linhaDoFator(fator);
  for (const [i, a] of agulhas.entries()) {
    const x = naCamada(a.W, fator);
    if (x < -40 || x > l + 40) continue;
    const tmp = criarQuadro(l, TELA.altura);
    const { topo, cx } = pilar(tmp, x, base, a.alt, a.larg, a.cintura, tom, semente + i * 13);
    for (const [dx, h, rc] of a.arvores) arvore(tmp, cx + dx, topo + 1, h, rc, tomArvore, semente + 50 + i * 7 + dx);
    if (a.casa) domo(tmp, cx + 0.5, topo + 2, a.casa[0], a.casa[1], DOMO_PLATO);
    const reflexo = refletir(tmp, base, Math.min(26, Math.round(a.alt * 0.55)), fator);
    if (reflexo) reflexos.push(reflexo);
    colar(q, tmp, 0, 0);
  }
  return recortar(q, fator);
}

/**
 * O platô do vilarejo: uma mesa de pedra larga no meio do mar, com as casas-domo e as árvores lá em
 * cima. É o ponto da tela que diz "aqui mora gente" — e por isso tem o maior contraste do fundo.
 */
function camadaDoPlato(reflexos: Reflexo[]): Camada {
  const f = PLANO.plato;
  const l = larguraDaCamada(MUNDO, f);
  const q = criarQuadro(l, TELA.altura);
  const base = linhaDoFator(f);
  const X = (W: number) => naCamada(W, f);

  const tmp = criarQuadro(l, TELA.altura);
  const p = pilar(tmp, X(-150), base, 25, 76, 0.13, PEDRA_PLATO, 610);
  const chao = p.topo + 1;
  arvore(tmp, p.cx - 34, chao, 26, 6, ARVORE_MEIO, 611);
  arvore(tmp, p.cx + 33, chao, 19, 4.5, ARVORE_MEIO, 612);
  domo(tmp, p.cx - 13, chao + 1, 26, 15, DOMO_PLATO);
  domo(tmp, p.cx + 14, chao + 1, 15, 9, DOMO_PLATO);
  domo(tmp, p.cx + 26, chao + 1, 9, 6, DOMO_PLATO);
  arvore(tmp, p.cx + 3, chao, 30, 5, ARVORE_MEIO, 613);
  const rf = refletir(tmp, base, 30, f);
  if (rf) reflexos.push(rf);
  colar(q, tmp, 0, 0);

  // agulhas soltas nessa profundidade, longe do platô
  const soltas: Agulha[] = [
    { W: 230, alt: 44, larg: 11, cintura: 0.34, arvores: [[0, 9, 4]] },
    { W: 470, alt: 58, larg: 14, cintura: 0.3, arvores: [[-2, 12, 5], [5, 7, 3]] },
    { W: 880, alt: 36, larg: 10, cintura: 0.36, arvores: [] },
  ];
  const outras = camadaDeAgulhas(f, soltas, PEDRA_PLATO, ARVORE_MEIO, 640, reflexos);
  colar(q, outras.quadro, 0, outras.y ?? 0);
  return recortar(q, f);
}

/** O que está de pé no campo, e onde a sombra de cada um cai no chão. */
type Sombra = { W: number; f: number; rw: number; rf: number };

/**
 * A margem de cá: o campo começa onde este fator termina. Nunca passa de 0.49, para tudo o que está
 * de pé no plano do meio (0.53) estar em terra firme.
 */
function margem(orla: Ruido, W: number) {
  return 0.445 + (orla.em(W / 80, 3) - 0.5) * 0.07 + (orla.em(W / 22, 9) - 0.5) * 0.025;
}

function camadaDoMeio(sombras: Sombra[]): Camada {
  const f = PLANO.meio;
  const l = larguraDaCamada(MUNDO, f);
  const q = criarQuadro(l, TELA.altura);
  const b = linhaDoFator(f);
  const X = (W: number) => naCamada(W, f);
  const sombra = (W: number, larg: number) => sombras.push({ W: W - larg * 0.3, f: f + 0.02, rw: larg * 0.75, rf: 0.035 });

  // à esquerda: um bosque de árvores altas, que emoldura o platô
  arvore(q, X(-210), b, 52, 10, ARVORE_MEIO, 201); sombra(-210, 18);
  arvore(q, X(-168), b, 36, 7, ARVORE_MEIO, 202); sombra(-168, 14);
  pedra(q, X(-186), b, 14, 6, PEDRA_PERTO, 203);
  arvore(q, X(60), b, 44, 8, ARVORE_MEIO, 204); sombra(60, 16);

  // à direita: o vilarejo da margem, com a casa grande
  arvore(q, X(470), b, 58, 11, ARVORE_MEIO, 220); sombra(470, 20);
  domo(q, X(540), b, 38, 23, DOMO); sombra(540, 70);
  domo(q, X(592), b, 18, 12, DOMO); sombra(592, 34);
  arvore(q, X(636), b, 40, 7.5, ARVORE_MEIO, 221); sombra(636, 14);
  domo(q, X(690), b, 24, 15, DOMO); sombra(690, 44);
  pedra(q, X(612), b, 12, 5, PEDRA_PERTO, 222);
  arvore(q, X(760), b, 50, 9, ARVORE_MEIO, 223); sombra(760, 18);
  domo(q, X(820), b, 14, 9, DOMO); sombra(820, 26);
  return recortar(q, f);
}

function camadaDePerto(sombras: Sombra[]): Camada {
  const f = PLANO.perto;
  const l = larguraDaCamada(MUNDO, f);
  const q = criarQuadro(l, TELA.altura);
  const b = linhaDoFator(f);
  const X = (W: number) => naCamada(W, f);
  const sombra = (W: number, larg: number, rf = 0.05) => sombras.push({ W: W - larg * 0.25, f: f + 0.025, rw: larg * 0.7, rf });

  // as duas árvores grandes moram nas pontas do mundo: emolduram sem cruzar o meio da luta
  arvore(q, X(-40), b, 118, 17, ARVORE_PERTO, 301); sombra(-40, 36);
  pedra(q, X(-6), b, 22, 11, PEDRA_PERTO, 302); sombra(-6, 40, 0.04);
  pedra(q, X(14), b, 10, 5, PEDRA_PERTO, 303);

  arvore(q, X(690), b, 104, 15, ARVORE_PERTO, 310); sombra(690, 32);
  pedra(q, X(650), b, 28, 15, PEDRA_PERTO, 311); sombra(650, 52, 0.06);
  pedra(q, X(672), b, 13, 6, PEDRA_PERTO, 312);
  return recortar(q, f);
}

/** Moita do campo: três bolas de folha encostadas, a do meio mais alta. */
function moita(q: Quadro, x: number, base: number, larg: number, alt: number, semente: number) {
  const folha = new Ruido(semente);
  const o = { borda: MOITA.borda, ateY: base + 1, textura: (px: number, py: number) => (folha.em(px / 2.2, py / 2.2) - 0.5) * 1.4 };
  esfera(q, x - larg * 0.26, base - alt * 0.36, larg * 0.3, alt * 0.46, MOITA.tons, { ...o, peso: 0.5 });
  esfera(q, x + larg * 0.24, base - alt * 0.4, larg * 0.3, alt * 0.52, MOITA.tons, { ...o, peso: 0.2 });
  esfera(q, x, base - alt * 0.56, larg * 0.34, alt * 0.56, MOITA.tons, o);
}

/** Capim alto, de lâminas compridas que se abrem em leque: o que fica na frente de tudo, embaixo. */
function capim(q: Quadro, x: number, base: number, h: number, semente: number) {
  const r = sorteio(semente);
  const laminas = 7 + Math.floor(r() * 4);
  for (let i = 0; i < laminas; i++) {
    const a = -1 + (2 * i) / (laminas - 1) + (r() - 0.5) * 0.3;
    const alt = h * (0.55 + r() * 0.45) * (1 - Math.abs(a) * 0.25);
    const topoX = x + a * h * 0.7 + (r() - 0.3) * 2;
    const pe = x + a * 2;
    const c = i % 3 === 0 ? TUFO.meio : TUFO.escuro;
    linha(q, pe, base, (pe + topoX) / 2 + a, base - alt * 0.6, c);
    linha(q, (pe + topoX) / 2 + a, base - alt * 0.6, topoX, base - alt, c);
    if (a > -0.3) pixel(q, topoX, base - alt, TUFO.claro);
  }
}

function camadaDeMoitas(sombras: Sombra[]): Camada {
  const f = PLANO.moitas;
  const l = larguraDaCamada(MUNDO, f);
  const q = criarQuadro(l, TELA.altura);
  const b = linhaDoFator(f);
  const r = sorteio(88);
  for (const W of [-120, 70, 205, 455, 590, 740, 880]) {
    const larg = 11 + r() * 8, alt = 7 + r() * 4;
    moita(q, naCamada(W, f), b, larg, alt, 900 + W);
    sombras.push({ W: W - larg * 0.2, f: f + 0.015, rw: larg * 0.9, rf: 0.02 });
    if (r() < 0.6) moita(q, naCamada(W + larg * 1.1, f), b, larg * 0.6, alt * 0.65, 950 + W);
  }
  return recortar(q, f);
}

/**
 * O capim da frente nasce na última linha da tela e não passa de 12 px de altura: fica sempre
 * abaixo da linha dos pés (CHAO), então emoldura a luta sem nunca tapar um lutador.
 */
function camadaDaFrente(): Camada {
  const f = PLANO.frente;
  const l = larguraDaCamada(MUNDO, f);
  const q = criarQuadro(l, TELA.altura);
  const b = TELA.altura - 1;
  for (const [W, h] of [[-30, 12], [-14, 8], [150, 10], [166, 7], [480, 11], [494, 7], [770, 12], [786, 9]]) {
    capim(q, naCamada(W, f), b, Math.min(h, TELA.altura - CHAO - 6), 700 + W);
  }
  return recortar(q, f);
}

/** Um ponto da água que pode brilhar: a linha, onde começa na camada dela e o tamanho. */
type Brilho = { y: number; x: number; comp: number; fase: number };

/**
 * O plano, linha por linha. Cada pixel sabe onde está no mundo (lateral e profundidade) e pergunta
 * a um relevo contínuo de que tom é: a mancha de grama que tem 40 px de largura perto da tela tem 20
 * no fundo, e achatada — a perspectiva sai do mundo, não de um desenho torto.
 */
function linhasDoPlano(sombras: Sombra[], orla: Ruido): { linhas: Camada[]; brilhos: Brilho[] } {
  const relevo = new Ruido(51);
  const miudo = new Ruido(52);
  const mancha = new Ruido(54);
  const ondas = new Ruido(55);
  const canteiro = new Ruido(56);
  const terra = new Ruido(57);
  // O relevo é mais largo que fundo no mundo. Redondo no mundo, a mancha da esquerda da tela sai
  // esticada na direção do ponto de fuga e o campo inteiro parece varrido por uma vassoura.
  const altura = (W: number, z: number) => relevo.em(W / 120, z / 62) * 0.65 + relevo.em(W / 44 + 17, z / 26 + 5) * 0.35;
  const passo = 1 / PROFUNDIDADE;
  const linhas: Camada[] = [];
  const brilhos: Brilho[] = [];
  const rb = sorteio(31);
  for (let y = HORIZONTE; y < TELA.altura; y++) {
    // a linha do próprio horizonte teria fator zero: meio passo a mais, e ela continua parada
    const f = Math.max(fatorDaLinha(y), 0.5 * passo);
    const l = larguraDaCamada(MUNDO, f);
    const q = criarQuadro(l, 1);
    const z = FOCO / f;
    // a água vai do tom do horizonte ao tom do alto conforme se aproxima da margem
    const tomDaAgua = entre01((f - 0.02) / 0.42) * (AGUA.length - 1);
    // o campo clareia na direção do céu longe e escurece perto
    const tomDoCampo = 0.8 + (f - 0.44) * 4.1;
    // a textura miúda só aparece onde ela é maior que um pixel — longe ela viraria chuvisco
    const nitidez = entre01((f - 0.55) / 0.35);
    // as ondas são traços de uma linha só, mais espaçados perto
    const linhaDeOnda = f > 0.05 && y % (f < 0.2 ? 2 : 3) === 0;
    // só as sombras que alcançam esta linha: o laço por pixel é o que pesa na montagem
    const sombrasDaLinha = sombras.filter((s) => Math.abs(f - s.f) < s.rf);
    for (let x = 0; x < l; x++) {
      const W = (x + 0.5 - MEIO_DA_TELA * (1 - f)) / f;
      const m = margem(orla, W);
      if (f < m) {
        let c: Cor;
        if (y <= HORIZONTE + 1) c = pontilhar(x, y, y === HORIZONTE ? 1 : 0.5) ? BRUMA : AGUA[0];
        // a espuma da margem vem em pedaços: pontilhado regular ali vira faixa pintada de estrada
        else if (f > m - passo * 1.2) c = ondas.em(W / 6, 40.5) > 0.42 ? ESPUMA : AGUA[AGUA.length - 1];
        else if (f > m - passo * 2.2 && ondas.em(W / 9 + 30, 12.5) > 0.6) c = ESPUMA;
        else {
          const k = degrau(tomDaAgua, x, y, AGUA.length);
          c = AGUA[k];
          if (linhaDeOnda && ondas.em(W / 12, y * 1.37) > 0.69 - f * 0.08) c = AGUA[Math.max(0, k - 1)];
        }
        q.px[x] = c;
        continue;
      }
      if (f < m + passo) { q.px[x] = ORLA; continue; }
      const h = altura(W, z);
      // a encosta virada para os sóis (à direita e para quem olha) clareia; a outra escurece
      const inclinacao = (altura(W - 6, z) - altura(W + 6, z)) * 3 + (altura(W, z + 6) - altura(W, z - 6)) * 2.2;
      let v = tomDoCampo - (h - 0.5) * 2 - inclinacao * 2.6;
      if (mancha.em(W / 50, z / 22) > 0.63) v += 1;
      v += (miudo.em(W / 7, z / 2.2) - 0.5) * 1.6 * nitidez;
      for (const s of sombrasDaLinha) {
        const du = (W - s.W) / s.rw, dv = (f - s.f) / s.rf;
        const d = du * du + dv * dv;
        if (d < 1) v += 1.4 * (1 - d * d);
      }
      // A terra aparece na beira (o barranco que a água lambeu) e em manchas largas no campo. A
      // borda da mancha é trançada num passo curto: reta, ela vira canteiro de jardim.
      const beiraDeTerra = f < m + passo * (3 + orla.em(W / 13, 21) * 4);
      const manchaDeTerra = terra.em(W / 64, z / 105) + (miudo.em(W / 5, z / 3) - 0.5) * 0.08 * nitidez;
      if (beiraDeTerra || (manchaDeTerra > 0.66 && (manchaDeTerra > 0.69 || pontilhar(x, y, 0.5)))) {
        let c = TERRA[degrau(v * 0.8 - 0.3, x, y, TERRA.length)];
        // pedrisco: um ponto escuro com o claro à direita, do lado dos sóis
        if (nitidez > 0.3 && acaso(x, y, 12) < 0.025) c = TERRA[TERRA.length - 1];
        else if (nitidez > 0.3 && x > 0 && q.px[x - 1] === TERRA[TERRA.length - 1] && acaso(x - 1, y, 12) < 0.025) c = TERRA[0];
        q.px[x] = c;
        continue;
      }
      let c = CAMPO[degrau(v, x, y, CAMPO.length)];
      // flores miúdas em canteiros, só onde um pixel ainda é pequeno
      const densidade = canteiro.em(W / 30, z / 18) - 0.72;
      if (f > 0.62 && densidade > 0 && acaso(x, y, 9) < densidade * (0.5 + nitidez * 0.5)) {
        c = acaso(x, y, 10) < 0.8 ? FLOR.clara : FLOR.amarela;
      }
      q.px[x] = c;
    }
    // brilhos: só sobre água lisa, sorteados agora que se sabe onde a água está
    if (f > 0.04 && f < 0.5) {
      for (let n = 0; n < 3; n++) {
        const x = Math.floor(rb() * l);
        const comp = 1 + Math.round(f * 6 + rb() * 2);
        let agua = true;
        for (let k = -1; k <= comp; k++) if (!AGUA.includes(q.px[Math.min(l - 1, Math.max(0, x + k))])) agua = false;
        if (agua && rb() < 0.55) brilhos.push({ y, x, comp, fase: Math.floor(rb() * 24) });
      }
    }
    linhas.push({ quadro: q, fator: f, y });
  }
  return { linhas, brilhos };
}

// ─── O que se mexe ─────────────────────────────────────────────────────────────────────────────

type Nuvem = { q: Quadro; x: number; y: number; passo: number };

/** Nuvem chata de planeta calmo: bolas achatadas lado a lado, barriga reta e sombra embaixo. */
function nuvem(largura: number, semente: number): Quadro {
  const r = sorteio(semente);
  const alt = Math.round(6 + largura / 11);
  const q = criarQuadro(largura, alt);
  const barriga = alt - 1;
  let x = 3;
  while (x < largura - 3) {
    const rx = 4 + r() * largura * 0.15;
    const ry = Math.min(alt - 1, 2.5 + r() * alt * 0.7);
    const cx = x + rx * 0.7;
    for (let py = 0; py < alt; py++) {
      for (let px = Math.floor(cx - rx); px <= cx + rx; px++) {
        if (px < 0 || px >= largura || py > barriga) continue;
        const u = (px + 0.5 - cx) / rx, v = (py + 0.5 - barriga) / ry;
        if (u * u + v * v > 1) continue;
        // de cima para baixo: brilho, corpo, sombra da barriga
        const k = py >= barriga - 1 ? 0 : v < -0.7 ? 3 : v < -0.32 ? 2 : 1;
        const i = py * largura + px;
        const atual = NUVEM.indexOf(q.px[i]);
        q.px[i] = NUVEM[Math.max(k, atual)];
      }
    }
    x += rx * (0.9 + r() * 0.5);
  }
  return q;
}

type Tufo = {
  /** Onde está na camada da linha dele, e no mundo (é o `W` que diz quando a rajada chega). */
  x: number; y: number; W: number; fator: number;
  /** Pisa numa linha em que ainda há coisa de pé mais perto: só pode pintar sobre o chão. */
  atras: boolean;
  quadros: [Quadro, Quadro];
};

/** Um tufo de grama em dois quadros, reto e deitado pelo vento. */
function tufo(h: number, deitado: boolean): Quadro {
  const l = h + 6;
  const q = criarQuadro(l, h + 1);
  const cx = Math.floor(l / 2);
  const laminas = h >= 6 ? 5 : h >= 4 ? 4 : 3;
  for (let i = 0; i < laminas; i++) {
    const a = -1 + (2 * i) / (laminas - 1);
    const alt = Math.round(h * (1 - Math.abs(a) * 0.4) * (i % 2 ? 0.8 : 1));
    const vento = deitado ? Math.max(1, Math.round(alt / 3)) : 0;
    const topoX = Math.round(cx + a * h * 0.45) + vento;
    const c = a > 0.3 ? TUFO.meio : TUFO.escuro;
    linha(q, cx + Math.round(a), h, topoX, h - alt, c);
    if (a > -0.2) pixel(q, topoX, h - alt, TUFO.claro);
  }
  return q;
}

/** Cola só onde a tela ainda tem uma das cores de `onde` — o jeito de pintar atrás do que já está na frente. */
function colarSobre(q: Quadro, s: Quadro, x0: number, y0: number, onde: (c: Cor) => boolean) {
  for (let y = 0; y < s.altura; y++) {
    const py = y0 + y;
    if (py < 0 || py >= q.altura) continue;
    for (let x = 0; x < s.largura; x++) {
      const c = s.px[y * s.largura + x];
      const px = x0 + x;
      if (c === 0 || px < 0 || px >= q.largura) continue;
      const i = py * q.largura + px;
      if (onde(q.px[i])) q.px[i] = c;
    }
  }
}

// ─── O cenário ─────────────────────────────────────────────────────────────────────────────────

export function cenarioPlaneta(): Cenario {
  const sombras: Sombra[] = [];
  const reflexos: Reflexo[] = [];
  // alturas da formação acima do pé, em pixels
  const serraLonge = camadaDaSerra(PLANO.serraLonge, 11, 26, 48, SERRA_LONGE);
  const serraPerto = camadaDaSerra(PLANO.serraPerto, 12, 14, 34, SERRA_PERTO);
  for (const s of [serraLonge, serraPerto]) {
    const rf = refletir(s.fonte, s.base, 4, s.camada.fator, true);
    if (rf) reflexos.push(rf);
  }
  const agulhas = camadaDeAgulhas(PLANO.agulhas, [
    { W: -620, alt: 52, larg: 11, cintura: 0.36, arvores: [[0, 8, 3.5]] },
    { W: -260, alt: 34, larg: 9, cintura: 0.3, arvores: [] },
    // a agulha do ancião fica no meio do mundo: é o que se vê entre os dois lutadores
    { W: 320, alt: 78, larg: 15, cintura: 0.3, arvores: [[-9, 9, 3.5], [10, 6, 2.5]], casa: [15, 10] },
    { W: 760, alt: 44, larg: 10, cintura: 0.32, arvores: [[1, 8, 3.5]] },
    { W: 1080, alt: 58, larg: 12, cintura: 0.35, arvores: [[0, 9, 4]] },
  ], PEDRA_LONGE, ARVORE_LONGE, 400, reflexos);
  const plato = camadaDoPlato(reflexos);
  const meio = camadaDoMeio(sombras);
  const perto = camadaDePerto(sombras);
  const moitas = camadaDeMoitas(sombras);
  const orla = new Ruido(53);
  const { linhas, brilhos } = linhasDoPlano(sombras, orla);

  // Tudo o que está de pé entra na pilha logo depois da linha em que pisa: as linhas mais perto,
  // coladas depois, cobrem o que passar do pé.
  const dePe: [Camada, number][] = [
    [serraLonge.camada, PLANO.serraLonge], [serraPerto.camada, PLANO.serraPerto], [agulhas, PLANO.agulhas],
    [plato, PLANO.plato], [meio, PLANO.meio], [perto, PLANO.perto], [moitas, PLANO.moitas],
  ];
  const pilha: [number, Camada][] = [
    ...linhas.map((c): [number, Camada] => [c.y ?? 0, c]),
    ...dePe.map(([c, f]): [number, Camada] => [linhaDoFator(f) + 0.5, c]),
  ];
  pilha.sort((a, b) => a[0] - b[0]);

  const nuvens: Nuvem[] = [
    { q: nuvem(70, 401), x: 20, y: 44, passo: 55 },
    { q: nuvem(44, 402), x: 210, y: 62, passo: 75 },
    { q: nuvem(92, 403), x: 330, y: 70, passo: 95 },
    { q: nuvem(34, 404), x: 140, y: 30, passo: 45 },
  ];

  const tufos: Tufo[] = [];
  const rt = sorteio(77);
  const ultimoDePe = linhaDoFator(PLANO.moitas);
  while (tufos.length < 54) {
    const y = linhaDoFator(PLANO.meio) + 4 + Math.floor(rt() * (TELA.altura - linhaDoFator(PLANO.meio) - 3));
    const f = fatorDaLinha(y);
    const l = larguraDaCamada(MUNDO, f);
    const x = Math.floor(rt() * l);
    const W = (x + 0.5 - MEIO_DA_TELA * (1 - f)) / f;
    if (f < margem(orla, W) + 0.04) continue;
    const h = Math.max(2, Math.round(f * 5.5 + rt() * 1.5));
    tufos.push({ x, y, W, fator: f, atras: y <= ultimoDePe, quadros: [tufo(h, false), tufo(h, true)] });
  }
  tufos.sort((a, b) => a.y - b.y);

  const ehCeu = (c: Cor) => c === CEU_CLARO || CEU.includes(c);
  const ehChao = (c: Cor) => CAMPO.includes(c) || TERRA.includes(c) || c === FLOR.clara || c === FLOR.amarela || c === ORLA ||
    c === TUFO.escuro || c === TUFO.meio || c === TUFO.claro;
  const ehAgua = (c: Cor) => AGUA.includes(c);
  const ehAguaOuReflexo = (c: Cor) =>
    ehAgua(c) || c === REFLEXO.escuro || c === REFLEXO.medio || c === REFLEXO.claro || c === REFLEXO.nevoa;

  return {
    id: 'planeta',
    nome: 'Planeta Verde',
    largura: MUNDO.largura,
    camadas: [camadaDoCeu(), ...pilha.map(([, c]) => c)],
    frente: [camadaDaFrente()],
    clarao: cor('#effff4'),
    animar(q, camX, tique) {
      // Nuvens andam um pixel a cada tantos quadros, e só pintam onde ainda é céu: passam por trás
      // das serras e das copas sem ninguém recortar nada.
      for (const n of nuvens) {
        const volta = TELA.largura + n.q.largura;
        const x0 = (((n.x + Math.floor(tique / n.passo)) % volta) + volta) % volta - n.q.largura;
        colarSobre(q, n.q, x0, n.y, ehCeu);
      }
      // Reflexos: cada linha treme um pixel para um lado, em degraus, e o tremor sobe pelo reflexo
      // como uma onda. Colados do mais longe para o mais perto, e o de perto cobre o de longe.
      const passoDaOnda = Math.floor(tique / 14);
      for (const r of reflexos) {
        const sx = r.x - Math.round(camX * r.fator);
        if (sx > q.largura || sx + r.q.largura < 0) continue;
        for (let k = 0; k < r.q.altura; k++) {
          const py = r.y + k;
          if (py < 0 || py >= q.altura) continue;
          const fase = (passoDaOnda + k) % 4;
          const desloca = k < 2 ? 0 : fase === 1 ? 1 : fase === 3 ? -1 : 0;
          const linhaQ = py * q.largura;
          const linhaR = k * r.q.largura;
          for (let x = 0; x < r.q.largura; x++) {
            const c = r.q.px[linhaR + x];
            const px = sx + x + desloca;
            if (c === 0 || px < 0 || px >= q.largura) continue;
            if (ehAguaOuReflexo(q.px[linhaQ + px])) q.px[linhaQ + px] = c;
          }
        }
      }
      // Brilhos da água: acendem, esticam e apagam em três passos, cada um na sua vez — só onde
      // ainda é água, então pé de pedra, reflexo e margem ficam por cima.
      const passo = Math.floor(tique / 7);
      for (const b of brilhos) {
        const fase = (passo + b.fase) % 24;
        if (fase > 2) continue;
        const comp = fase === 1 ? b.comp + 1 : b.comp;
        const sx = b.x - Math.round(camX * fatorDaLinha(b.y)) + (fase === 2 ? 1 : 0);
        for (let k = 0; k < comp; k++) {
          const px = sx + k;
          if (px < 0 || px >= q.largura) continue;
          const i = b.y * q.largura + px;
          if (ehAgua(q.px[i])) q.px[i] = fase === 1 && (k === 0 || k === comp - 1) ? ESPUMA : BRILHO;
        }
      }
      // Rajadas de vento atravessam o campo da esquerda para a direita e deitam os tufos por onde
      // passam. O tufo é colado depois de todas as camadas, então o que pisa atrás de uma pedra ou
      // de uma moita só pinta onde ainda é chão — escondido atrás dela, e não brotando na frente.
      const rajada = tique / 5;
      for (const t of tufos) {
        const sx = t.x - Math.round(camX * t.fator);
        if (sx < -12 || sx > q.largura + 12) continue;
        const fase = ((Math.floor(rajada - t.W / 9) % 64) + 64) % 64;
        const s = t.quadros[fase < 4 ? 1 : 0];
        if (t.atras) colarSobre(q, s, sx - (s.largura >> 1), t.y - s.altura + 1, ehChao);
        else colar(q, s, sx - (s.largura >> 1), t.y - s.altura + 1);
      }
    },
  };
}

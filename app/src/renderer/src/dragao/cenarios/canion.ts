/**
 * Cânion — o ermo de rocha vermelha onde as grandes lutas acontecem, no fim da tarde: mesas e
 * pilares de pedra, alguns partidos como se uma luta já tivesse passado por ali, crateras no barro
 * rachado, céu roxo com nuvens compridas, poeira correndo com o vento e pedrinhas que flutuam sozinhas
 * — energia de sobra no ar.
 *
 * O SOL decide o desenho inteiro. Ele está se pondo atrás das mesas, à direita do meio da tela, e
 * por isso: toda rocha acende no lado DIREITO e no topo, e escurece em roxo do lado de cá; as
 * nuvens pegam luz por baixo (dourada perto do horizonte, rosa lá em cima); a borda de cima de cada
 * cratera acende e o fundo dela fica no escuro; e as sombras das pedras compridas caem no chão
 * vindo na direção de quem olha, puxadas para a esquerda. Uma luz só, e o cenário se explica.
 *
 * O CHÃO É PERSPECTIVA DE VERDADE: cada linha do piso é uma camada de um pixel de altura andando no
 * próprio fator — 1 na linha dos pés, menos para o fundo, mais para a frente. Com um fator só, o
 * barro rachado deslizaria inteiro como papel de parede. Tudo o que está NO chão (placas, crateras,
 * fendas, sombras, cascalho) é posto em coordenadas do mundo e projetado linha a linha; o que está
 * EM PÉ (as rochas) é uma camada no fator da linha em que pisa, senão escorregaria pelo chão no
 * primeiro passo da câmera. Pelo mesmo motivo o cascalho do chão tem UM pixel de altura: um desenho
 * de duas linhas ficaria em duas camadas de fatores diferentes e se partiria ao meio nas bordas da
 * tela, quando a câmera anda.
 *
 * Quem se mexe em `animar` (nuvem, estrela, poeira, pedrinha) é desenhado depois de todas as
 * camadas, então precisa saber o que está NA FRENTE dele: cada um só pinta sobre as cores que moram
 * atrás da sua distância. As paletas de cada faixa não repetem cor entre si justamente para isso.
 */
import { type Cor, type Quadro, cor, criarQuadro } from '../quadro.ts';
import { type Camada, type Cenario, larguraDaCamada, pontilhar, sorteio } from '../cenario.ts';
import { CHAO, TELA } from '../medidas.ts';

// ─── A geometria da perspectiva ────────────────────────────────────────────────────────────────

const MUNDO = { largura: 640 };
const MEIO = TELA.largura / 2;
/** Onde o chão encontraria o céu: um pouco acima da cabeça de quem está de pé, que é onde o sol se põe. */
const HORIZONTE = 112;
const PROFUNDIDADE = CHAO - HORIZONTE;
/** A distância da câmera à linha da luta, na unidade do mundo. */
const FOCO = 330;

const fatorDaLinha = (y: number) => (y - HORIZONTE) / PROFUNDIDADE;
const linhaDoFator = (f: number) => HORIZONTE + f * PROFUNDIDADE;
/** O x, dentro de uma camada de fator `f`, de quem está na posição lateral `W` da linha da luta. */
const naCamada = (W: number, f: number) => MEIO * (1 - f) + W * f;
const naTela = (W: number, f: number, camX: number) => naCamada(W, f) - camX * f;

/**
 * As linhas onde pisam as quatro faixas de rocha. O fator sai da LINHA, e não o contrário: uma rocha
 * num fator e o chão debaixo dela noutro, mesmo que por um centésimo, escorregariam um sobre o outro.
 */
const BASE = { borda: 121, morros: 136, meio: 155, perto: 176 };
const FATOR = {
  borda: fatorDaLinha(BASE.borda),
  morros: fatorDaLinha(BASE.morros),
  meio: fatorDaLinha(BASE.meio),
  perto: fatorDaLinha(BASE.perto),
};
const ALTURA_DO_CEU = BASE.borda + 1;

// ─── As paletas ────────────────────────────────────────────────────────────────────────────────
// Quanto mais longe, mais a rocha puxa para a cor do céu baixo e menos contraste ela tem: o contraste
// alto fica com os lutadores. Nenhuma cor se repete entre faixas (ver `animar`).

const C = (...hex: string[]) => hex.map(cor);

/** Do alto (índigo) ao horizonte (brasa); o último só existe em volta do sol. */
const CEU = C('#170e2e', '#261644', '#3f1f58', '#5f2865', '#883365', '#b5435d', '#db5f50', '#f5904f');
const SOL = cor('#ffe7a6');
const ESTRELA = { fraca: cor('#8a74b8'), forte: cor('#dccbf5') };

type TomDeNuvem = { corpo: Cor; meio: Cor; aro: Cor; aro2: Cor };
/**
 * Lá em cima a nuvem é MAIS CLARA que o céu, que já é quase noite, e pega o rosa do sol; perto do
 * horizonte ela é MAIS ESCURA, silhueta contra o brilho, com a barriga dourada. Nuvem do mesmo
 * valor do céu atrás dela some — só a barriga acesa sobrava, e parecia risco de régua.
 */
const NUVEM_ALTA: TomDeNuvem = { corpo: cor('#4c2a66'), meio: cor('#6c3470'), aro: cor('#a84c78'), aro2: cor('#d46c7c') };
const NUVEM_BAIXA: TomDeNuvem = { corpo: cor('#3e1d52'), meio: cor('#5a2660'), aro: cor('#ea8360'), aro2: cor('#ffc47c') };

type TomDeRocha = {
  /** Do mais escuro ao mais claro. */
  tons: Cor[];
  /** Risco do lado da sombra. Longe não tem: rocha distante é mancha contra o céu, não desenho. */
  contorno?: Cor;
  /** O fio de luz na borda virada para o sol. */
  aro: Cor;
  fenda: Cor;
  /** A cor em que a base some, longe: poeira e ar entre quem olha e a rocha. */
  nevoa?: Cor;
};

const BORDA_TRAS = { corpo: cor('#9e4a68'), luz: cor('#c05c68') };
const BORDA: TomDeRocha = {
  tons: C('#6f345f', '#823d65', '#9a476a'), aro: cor('#e88a68'), fenda: cor('#633059'), nevoa: cor('#ad5269'),
};
const MORROS: TomDeRocha = {
  tons: C('#552550', '#6b2d55', '#843758', '#9e435b', '#bb565c'), aro: cor('#ee8a60'), fenda: cor('#461f48'),
  nevoa: cor('#8e4262'),
};
const MEIO_ROCHA: TomDeRocha = {
  tons: C('#3c1b40', '#562447', '#72304c', '#8f3c4f', '#ad4c50', '#cc644f'), contorno: cor('#2c1434'),
  aro: cor('#f59a5c'), fenda: cor('#2e1537'),
};
const PERTO: TomDeRocha = {
  tons: C('#2f1535', '#4a203d', '#662a43', '#843645', '#a64646', '#c95c47', '#e67d4d'), contorno: cor('#1f0e27'),
  aro: cor('#ffae6a'), fenda: cor('#230f2c'),
};

/** O barro do chão, do escuro ao claro. O fundo da fenda é o primeiro; a poeira jogada da cratera, o último. */
const CHAO_TONS = C('#24152e', '#3f2440', '#5a3049', '#763d51', '#915057', '#ac655e', '#c77f68', '#df9d76');
const POEIRA = { clara: cor('#f7cfa4'), rala: cor('#d9a080') };
/**
 * A pedrinha que flutua é mais clara que qualquer rocha atrás dela: no tom das rochas, em cima da mesa
 * furada ela lia como buraco na pedra, e não como pedra no ar.
 */
const PEDRINHA = { contorno: cor('#1c0f25'), sombra: cor('#a2524f'), base: cor('#e38a63'), luz: cor('#ffd39c'), faisca: cor('#fff0b0') };

// ─── Ruído, acaso e degraus ────────────────────────────────────────────────────────────────────

/** Ruído de valor numa grade 64x64 com semente: rocha e barro lisos denunciam desenho de programa. */
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

/** Um número "sorteado" preso a um par de inteiros: a mesma placa de barro em toda chamada. */
function acaso(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const entre = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

/**
 * Um valor contínuo vira o índice de um tom. O pontilhado mora só no meio da passagem: pontilhado
 * largo em tudo vira chuvisco, e o que se quer são manchas de cor com a borda trançada.
 */
function degrau(v: number, x: number, y: number, n: number): number {
  const i = Math.floor(v), fr = v - i;
  const t = fr < 0.3 ? 0 : fr > 0.7 ? 1 : (fr - 0.3) / 0.4;
  const k = pontilhar(x, y, t) ? i + 1 : i;
  return k < 0 ? 0 : k >= n ? n - 1 : k;
}

// ─── O molde: a silhueta antes da tinta ───────────────────────────────────────────────────────

/**
 * A forma de uma rocha antes de pintar: somar faixas, elipses e polígonos, e APAGAR com eles — é
 * assim que sai o buraco redondo da mesa e o topo partido do pilar. A tinta vem depois e lê a forma
 * pronta: a borda de um buraco é uma borda como outra qualquer, e acende do lado certo sozinha.
 */
class Molde {
  readonly l: number;
  readonly a: number;
  readonly m: Uint8Array;
  x0: number; y0: number; x1 = -1; y1 = -1;
  constructor(l: number, a: number) {
    this.l = l; this.a = a; this.m = new Uint8Array(l * a);
    this.x0 = l; this.y0 = a;
  }
  tem(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.l && y < this.a && this.m[y * this.l + x] === 1;
  }
  por(x: number, y: number, v: number) {
    if (x < 0 || y < 0 || x >= this.l || y >= this.a) return;
    this.m[y * this.l + x] = v;
    if (v === 0) return;
    if (x < this.x0) this.x0 = x;
    if (x > this.x1) this.x1 = x;
    if (y < this.y0) this.y0 = y;
    if (y > this.y1) this.y1 = y;
  }
  /** Os pixels da linha `y` cujo centro cai entre `xa` e `xb`. */
  faixa(y: number, xa: number, xb: number, v = 1) {
    for (let x = Math.ceil(xa - 0.5); x <= Math.floor(xb - 0.5); x++) this.por(x, y, v);
  }
  elipse(cx: number, cy: number, rx: number, ry: number, v = 1) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (dy * dy > 1) continue;
      const w = rx * Math.sqrt(1 - dy * dy);
      this.faixa(y, cx - w, cx + w, v);
    }
  }
  poligono(pts: [number, number][], v = 1) {
    let y0 = Infinity, y1 = -Infinity;
    for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const xs: number[] = [];
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const cy = y + 0.5;
      xs.length = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]; const [xj, yj] = pts[j];
        if ((yi > cy) !== (yj > cy)) xs.push(xi + ((cy - yi) * (xj - xi)) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) this.faixa(y, xs[k], xs[k + 1], v);
    }
  }
}

type Talhe = {
  semente: number;
  /** A altura de cada camada de sedimento; 0 é pedra sem estrato. */
  estrato?: number;
  /** A coordenada em que o estrato é contado — um pedaço caído tem as camadas tortas junto com ele. */
  estratoEm?: (x: number, y: number) => number;
  /** O quanto as ranhuras verticais da erosão marcam a pedra. */
  sulcos?: number;
  /** Fendas escuras descendo do topo: é o que diz que a rocha levou pancada. */
  fendas?: number;
  /** A linha da base, para a névoa de longe e para não contornar o pé que encosta no chão. */
  base: number;
  nevoaAltura?: number;
  /** Topo de pedra partida agora há pouco: a quebra é mais clara que a pedra curtida pelo tempo. */
  quebra?: boolean;
};

/**
 * A tinta da rocha, lida da forma pronta. Cada fileira de pixels é cortada em trechos, e a posição
 * dentro do trecho diz que face é: a esquerda está virada para longe do sol, o meio para quem
 * olha, a direita para o sol. As faces são DEGRAUS e não um degradê — rocha é quina, não cilindro —,
 * com a fronteira entre elas tremida por ranhuras verticais. Por cima vêm os estratos (camadas
 * alternadas mais escuras, cada uma com a borda de cima pegando luz), o topo aceso e o aro do sol.
 */
function pintarRocha(q: Quadro, mo: Molde, tom: TomDeRocha, t: Talhe) {
  if (mo.x1 < mo.x0) return;
  const n = tom.tons.length;
  const rn = new Ruido(t.semente);
  const niveis = [Math.round(0.2 * (n - 1)), Math.round(0.47 * (n - 1)), Math.round(0.78 * (n - 1)), n - 1];
  const estrato = t.estrato ?? 0;
  const sulcos = t.sulcos ?? 1;
  const W = mo.x1 - mo.x0 + 1;
  // quantos pixels de pedra há acima de cada um, sem buraco no meio
  const dTopo = new Int16Array(W * (mo.y1 - mo.y0 + 1));
  for (let y = mo.y0; y <= mo.y1; y++) {
    for (let x = mo.x0; x <= mo.x1; x++) {
      const i = (y - mo.y0) * W + (x - mo.x0);
      dTopo[i] = !mo.tem(x, y) ? -1 : y > mo.y0 && mo.tem(x, y - 1) ? dTopo[i - W] + 1 : 0;
    }
  }
  for (let y = mo.y0; y <= mo.y1; y++) {
    const desvio = (rn.em(5.5, y / 6) - 0.5) * 0.22;
    let x = mo.x0;
    while (x <= mo.x1) {
      if (!mo.tem(x, y)) { x++; continue; }
      let xb = x;
      while (xb < mo.x1 && mo.tem(xb + 1, y)) xb++;
      const xa = x, larg = xb - xa + 1;
      for (let px = xa; px <= xb; px++) {
        const u = (px - xa + 0.5) / larg + desvio + (rn.em(px / 2.2, y / 13) - 0.5) * 0.3 * sulcos;
        const face = u < 0.24 ? 0 : u < 0.6 ? 1 : 2;
        let v = niveis[face] + (rn.em(px / 1.4 + 9, y / 9) - 0.5) * 0.5 * sulcos;
        if (estrato > 0) {
          // Os estratos são um risco de luz na borda de cima de UMA camada a cada três, e não faixas
          // alternadas claro-escuro: alternando a cada seis pixels, com pontilhado na passagem, a
          // pedra inteira virou lasanha e o olho não achava mais a forma da rocha.
          const ey = (t.estratoEm ? t.estratoEm(px, y) : y) + (rn.em(px / 17, 3.3) - 0.5) * 4;
          const banda = Math.floor(ey / estrato);
          const dentro = ey - banda * estrato;
          const marcada = ((banda % 3) + 3) % 3 === 1;
          if (marcada && face > 0 && dentro < 1) v += 0.9;
          else if (marcada && dentro >= 1 && dentro < 2.2) v -= 0.9;
        }
        const dt = dTopo[(y - mo.y0) * W + (px - mo.x0)];
        if (dt === 0) v = face === 0 ? Math.max(v, niveis[2]) : n - 1 + 0.2;
        else if (dt === 1) v += face === 0 ? 0.5 : 1;
        else if (dt === 2 && !t.quebra) v -= 0.4; // a quina do topo faz uma sombrinha logo abaixo
        let c = tom.tons[degrau(v, px, y, n)];
        if (t.quebra && dt >= 0 && dt <= 1 && face > 0) c = tom.aro;
        if (px === xb && larg >= 3 && face === 2) c = tom.aro;
        else if (tom.contorno !== undefined && (px === xa || (y < t.base && !mo.tem(px, y + 1)))) c = tom.contorno;
        if (tom.nevoa !== undefined && t.nevoaAltura) {
          const k = (y - (t.base - t.nevoaAltura)) / t.nevoaAltura;
          if (k > 0 && pontilhar(px, y, k * 0.85)) c = tom.nevoa;
        }
        if (px >= 0 && naAltura(q, y) && px < q.largura) q.px[y * q.largura + px] = c;
      }
      x = xb + 1;
    }
  }
  // fendas: descem de perto do topo, tortas, e param antes do pé
  const r = sorteio(t.semente + 91);
  for (let k = 0; k < (t.fendas ?? 0); k++) {
    let fx = mo.x0 + 2 + Math.floor(r() * Math.max(1, W - 4));
    let fy = mo.y0;
    while (fy <= mo.y1 && !mo.tem(fx, fy)) fy++;
    fy += 1 + Math.floor(r() * 6);
    const comp = 5 + Math.floor(r() * 14);
    for (let i = 0; i < comp && mo.tem(fx - 1, fy) && mo.tem(fx, fy) && mo.tem(fx + 1, fy); i++) {
      q.px[fy * q.largura + fx] = tom.fenda;
      fy++;
      if (r() < 0.35) fx += r() < 0.5 ? -1 : 1;
    }
  }
}

const naAltura = (q: Quadro, y: number) => y >= 0 && y < q.altura;

/** Uma pedra solta: bola achatada de faces duras, acesa no alto à direita, com contorno do lado da sombra. */
function pedra(q: Quadro, cx: number, base: number, rx: number, ry: number, tom: TomDeRocha, semente: number) {
  const rn = new Ruido(semente);
  const n = tom.tons.length;
  const cy = base - ry + 1;
  const dentro = (x: number, y: number) => {
    if (y > base) return false;
    const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
    return u * u + v * v <= 1;
  };
  for (let y = Math.floor(cy - ry); y <= base; y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (!dentro(x, y) || x < 0 || x >= q.largura || !naAltura(q, y)) continue;
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
      const nz = Math.sqrt(Math.max(0, 1 - u * u - v * v));
      const l = u * 0.62 - v * 0.62 + nz * 0.3;
      // luz em três degraus secos, com um pouco de ruído para a pedra não sair de torno
      const val = (l < -0.25 ? 0.25 : l < 0.25 ? 0.47 : l < 0.62 ? 0.72 : 0.95) * (n - 1) + (rn.em(x / 2, y / 2) - 0.5) * 0.9;
      let c = tom.tons[degrau(val, x, y, n)];
      const borda = !dentro(x - 1, y) || !dentro(x, y - 1) || !dentro(x + 1, y) || (!dentro(x, y + 1) && y < base);
      if (borda && l > 0.45 && y < cy) c = tom.aro;
      else if (borda && tom.contorno !== undefined && l < 0.3) c = tom.contorno;
      q.px[y * q.largura + x] = c;
    }
  }
}

// ─── As formas de pedra ───────────────────────────────────────────────────────────────────────

type OpcoesDeMesa = { degraus?: number; talude?: number };

/**
 * A mesa: topo reto, paredes quase a prumo que alargam em degraus (cada degrau é uma camada mais
 * dura que resistiu) e um talude de cascalho no pé. O topo é mordido em alguns pontos: régua não
 * existe em pedra.
 */
function mesa(mo: Molde, cx: number, base: number, alto: number, larg: number, semente: number, o: OpcoesDeMesa = {}) {
  const r = sorteio(semente);
  const rn = new Ruido(semente + 1);
  const topo = Math.round(base - alto);
  const degraus: [number, number, number][] = [];
  for (let i = 0; i < (o.degraus ?? 2); i++) degraus.push([0.2 + r() * 0.55, 1 + r() * larg * 0.1, 1 + r() * larg * 0.1]);
  const talude = o.talude ?? 0.24;
  for (let y = topo; y <= base; y++) {
    const k = (y - topo) / Math.max(1, alto);
    let e = larg / 2, d = larg / 2;
    for (const [kd, ae, ad] of degraus) if (k > kd) { e += ae; d += ad; }
    if (k > 1 - talude) {
      const s = (k - (1 - talude)) / talude;
      e += s * s * larg * 0.32; d += s * s * larg * 0.26;
    }
    e += (rn.em(1.5, y / 3.5) - 0.5) * 2.4;
    d += (rn.em(7.5, y / 3.5) - 0.5) * 2.4;
    mo.faixa(y, cx - e, cx + d);
  }
  for (let x = Math.floor(cx - larg / 2 - 2); x <= cx + larg / 2 + 2; x++) {
    const m = rn.em(x / 4, 20);
    if (m < 0.32) mo.por(x, topo, 0);
    if (m < 0.2) mo.por(x, topo + 1, 0);
  }
  return { topo };
}

type OpcoesDePilar = { inclina?: number; chapeu?: number; pescoco?: number };

/**
 * O pilar (a "chaminé de fada" dos desertos): uma LAJE de pedra dura, chata e mais larga que tudo,
 * em cima de uma coluna que a erosão comeu, e o corpo alargando até o cascalho do pé.
 *
 * O chapéu é chato e sobra para os lados, nunca uma bola: a primeira versão tinha a cabeça redonda
 * em cima de um pescoço fino, e a silhueta que saía disso não é a de uma pedra. Laje com aba e a
 * sombra dela na coluna é o que diz "rocha dura que resistiu".
 */
function pilar(mo: Molde, cx: number, base: number, alto: number, larg: number, semente: number, o: OpcoesDePilar = {}) {
  const rn = new Ruido(semente);
  const topo = Math.round(base - alto);
  const chapeu = o.chapeu ?? 0.15;
  const pescoco = o.pescoco ?? 0.3;
  // a laje tem altura própria em pixels, não em fração: pilar alto não ganha chapéu de cartola
  const espessura = Math.max(3, Math.min(9, Math.round(alto * chapeu * 0.62)));
  const abaE = 0.52 + (rn.em(4.5, 1.5) - 0.5) * 0.12, abaD = 0.48 + (rn.em(6.5, 2.5) - 0.5) * 0.12;
  for (let y = topo; y <= base; y++) {
    const k = (y - topo) / alto;
    const c = cx + (o.inclina ?? 0) * (1 - k) ** 1.6 + (rn.em(3, y / 13) - 0.5) * 3;
    if (chapeu > 0.02 && y - topo < espessura) {
      // A laje: topo quase reto, as pontas arredondadas e caindo um pouco para a esquerda — laje
      // de régua, com a aba igual dos dois lados, lia como capitel de coluna e não como pedra.
      const d = y - topo;
      const quina = d === 0 ? 2.5 : d === 1 ? 0.8 : d === espessura - 1 ? 1.2 : 0;
      const cai = d * 0.35;
      mo.faixa(y, c - larg * abaE + quina - cai + (rn.em(y / 1.7, 7) - 0.5) * 2,
        c + larg * abaD - quina - cai * 0.5 + (rn.em(y / 1.7, 17) - 0.5) * 2);
      continue;
    }
    const kc = chapeu > 0.02 ? (y - topo - espessura) / Math.max(1, alto - espessura) : k;
    // Logo embaixo da laje a coluna é a mais fina — é o que a erosão come primeiro —, e ao longo
    // dela há barrigas e cinturas das camadas mais moles: cilindro de largura certinha é coluna de
    // templo.
    const s = Math.min(1, kc / 0.92);
    const barriga = (rn.em(5.5, y / 16) - 0.5) * 0.22;
    const meia = larg * (pescoco * (0.85 + barriga) + 0.18 * s * s) + (s > 0.84 ? ((s - 0.84) / 0.16) ** 2 * larg * 0.4 : 0);
    mo.faixa(y, c - meia - (rn.em(1, y / 3) - 0.5) * 1.8, c + meia + (rn.em(9, y / 3) - 0.5) * 1.8);
  }
  return { topo, fimDoChapeu: chapeu > 0.02 ? topo + espessura : topo };
}
/**
 * A sombra que a laje de um pilar faz na própria coluna: as linhas logo abaixo da aba descem dois
 * tons. Sem ela a laje e a coluna viram uma peça só, e o chapéu some.
 */
function sombraDoChapeu(q: Quadro, mo: Molde, tom: TomDeRocha, yDe: number, linhas: number) {
  const indice = new Map(tom.tons.map((c, i) => [c, i]));
  // a laje é pedra mais dura e mais escura que a coluna: um tom abaixo, fora a borda acesa do topo
  for (let y = mo.y0; y < yDe; y++) {
    for (let x = mo.x0; x <= mo.x1; x++) {
      if (!mo.tem(x, y) || y < 0 || y >= q.altura || x < 0 || x >= q.largura || !mo.tem(x, y - 1)) continue;
      const i = y * q.largura + x;
      const k = indice.get(q.px[i]);
      if (k !== undefined) q.px[i] = tom.tons[Math.max(0, k - 1)];
    }
  }
  for (let y = yDe; y < yDe + linhas; y++) {
    for (let x = mo.x0; x <= mo.x1; x++) {
      if (!mo.tem(x, y) || y < 0 || y >= q.altura || x < 0 || x >= q.largura) continue;
      const i = y * q.largura + x;
      const k = indice.get(q.px[i]);
      if (k !== undefined) q.px[i] = tom.tons[Math.max(0, k - (y - yDe < linhas - 1 ? 2 : 1))];
      else if (q.px[i] === tom.aro) q.px[i] = tom.tons[tom.tons.length - 3];
    }
  }
}

/** A agulha: afina até a ponta, torta, sem chapéu. */
function agulha(mo: Molde, cx: number, base: number, alto: number, larg: number, semente: number, inclina = 0) {
  const rn = new Ruido(semente);
  const topo = Math.round(base - alto);
  for (let y = topo; y <= base; y++) {
    const k = (y - topo) / alto;
    const meia = Math.max(0.7, larg * 0.5 * Math.pow(k, 0.65)) + (k > 0.86 ? ((k - 0.86) / 0.14) ** 2 * larg * 0.45 : 0);
    const c = cx + inclina * (1 - k) ** 1.4 + (rn.em(4, y / 9) - 0.5) * 2;
    mo.faixa(y, c - meia - (rn.em(2, y / 3) - 0.5) * 1.2, c + meia + (rn.em(8, y / 3) - 0.5) * 1.2);
  }
  return { topo };
}

/** Apaga tudo acima de uma linha dentada e inclinada: o topo de um pilar que se partiu. */
function partir(mo: Molde, cx: number, yCorte: number, inclinacao: number, semente: number) {
  const r = sorteio(semente);
  let dente = 0;
  for (let x = mo.x0; x <= mo.x1; x++) {
    if (r() < 0.45) dente = Math.round((r() - 0.5) * 5);
    const limite = Math.round(yCorte + (x - cx) * inclinacao + dente);
    for (let y = mo.y0; y < limite; y++) mo.por(x, y, 0);
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

// ─── O céu ─────────────────────────────────────────────────────────────────────────────────────

/** O sol, na tela: à direita do meio, meio engolido pelas mesas do horizonte. */
const SOL_EM = { x: 300, y: 117, r: 9 };

type Estrela = { x: number; y: number; fase: number };

function camadaDoCeu(): { camada: Camada; estrelas: Estrela[] } {
  const q = criarQuadro(TELA.largura, ALTURA_DO_CEU);
  // faixas mais largas no alto (a noite chegando) e mais apertadas perto do horizonte
  const paradas: [number, number][] = [[0, 0], [22, 1], [44, 2], [63, 3], [80, 4], [94, 5], [106, 6]];
  // passagem curta: com seis linhas de pontilhado em cada troca, e mais as do brilho do sol, metade
  // do céu virava tela de mosquiteiro
  const passagem = 4;
  for (let y = 0; y < q.altura; y++) {
    let i = 0;
    while (i + 1 < paradas.length && paradas[i + 1][0] <= y) i++;
    const prox = paradas[i + 1];
    for (let x = 0; x < q.largura; x++) {
      let k = paradas[i][1];
      if (prox && prox[0] - y <= passagem && pontilhar(x, y, 1 - (prox[0] - y) / (passagem + 1))) k = prox[1];
      // o céu sobe degraus de cor em volta do sol, largo na horizontal como todo pôr do sol
      const d = Math.hypot((x - SOL_EM.x) / 2.7, y - SOL_EM.y);
      if (pontilhar(x, y, entre((78 - d) / 5))) k++;
      if (pontilhar(x, y, entre((46 - d) / 4))) k++;
      if (pontilhar(x, y, entre((24 - d) / 3))) k++;
      q.px[y * q.largura + x] = CEU[Math.min(CEU.length - 1, k)];
    }
  }
  for (let y = SOL_EM.y - SOL_EM.r - 1; y <= SOL_EM.y + SOL_EM.r + 1; y++) {
    for (let x = SOL_EM.x - SOL_EM.r - 1; x <= SOL_EM.x + SOL_EM.r + 1; x++) {
      if (y < 0 || y >= q.altura) continue;
      const d = Math.hypot(x + 0.5 - SOL_EM.x, y + 0.5 - SOL_EM.y);
      if (d <= SOL_EM.r) q.px[y * q.largura + x] = SOL;
    }
  }
  // estrelas só no alto e longe do sol, onde o céu já é quase noite
  const estrelas: Estrela[] = [];
  const r = sorteio(7);
  for (let n = 0; n < 60 && estrelas.length < 30; n++) {
    const x = Math.floor(r() * q.largura), y = Math.floor(2 + r() * 50);
    if (Math.hypot((x - SOL_EM.x) / 2.7, y - SOL_EM.y) < 92 || y > 30 + x * 0.1) continue;
    const forte = r() < 0.3;
    q.px[y * q.largura + x] = forte ? ESTRELA.forte : ESTRELA.fraca;
    if (forte) estrelas.push({ x, y, fase: Math.floor(r() * 40) });
  }
  return { camada: { quadro: q, fator: 0, y: 0 }, estrelas };
}

type Nuvem = { q: Quadro; x: number; y: number; passo: number };

/**
 * A nuvem do crepúsculo: faixas compridas empilhadas, cada uma com a barriga acesa e as pontas
 * afinando. As de cima são pintadas primeiro e as de baixo por cima delas, e cada faixa tem a SUA
 * barriga acesa — é o degrau de luz entre uma faixa e a de baixo que dá volume, e não um calombo
 * redondo (esse saía como disco voador). A luz vem de baixo porque o sol já está abaixo delas; o
 * topo fica recortado contra o céu, sem contorno — nuvem com risco vira desenho animado.
 *
 * Nenhuma faixa é reta. A barriga sobe e desce um pixel e a espessura incha e afina ao longo do
 * comprimento: com a barriga de régua, a espessura igual e um fiapo de um pixel correndo embaixo,
 * as nuvens baixas — escuras contra o brilho do horizonte — liam como riscos atravessando o céu.
 */
function nuvem(largura: number, espessura: number, semente: number, tom: TomDeNuvem): Quadro {
  const r = sorteio(semente);
  const rn = new Ruido(semente);
  const alt = espessura * 3 + 6;
  const q = criarQuadro(largura, alt);
  type Faixa = { x0: number; x1: number; fundo: number; h: number; k: number };
  const faixas: Faixa[] = [{ x0: largura * 0.04, x1: largura * 0.96, fundo: alt - 3, h: espessura * 0.8, k: 0 }];
  let fundo = alt - 3;
  const quantas = 2 + Math.floor(r() * 3);
  for (let k = 1; k <= quantas; k++) {
    fundo -= 2 + Math.floor(r() * espessura * 0.6);
    const comp = largura * (0.3 + r() * 0.35);
    const x0 = largura * 0.06 + r() * (largura * 0.88 - comp);
    faixas.push({ x0, x1: x0 + comp, fundo, h: espessura * (0.6 + r() * 0.5), k });
  }
  faixas.sort((a, b) => a.fundo - b.fundo);
  for (const fa of faixas) {
    for (let x = Math.max(0, Math.floor(fa.x0)); x < Math.min(largura, fa.x1); x++) {
      const t = (x + 0.5 - fa.x0) / (fa.x1 - fa.x0);
      // pontas em cunha, uma mais comprida que a outra: nuvem simétrica parece carimbo
      const s = Math.min(1, t / 0.3, (1 - t) / 0.18);
      if (s <= 0) continue;
      const incha = 0.55 + rn.em(x / 9 + fa.k * 7, fa.k * 3.3) * 0.75;
      const h = Math.round(fa.h * Math.sqrt(s) * incha);
      const barriga = fa.fundo + (h >= 2 ? Math.round((rn.em(x / 13 + fa.k * 5, 9.5) - 0.5) * 2.4) : 0);
      for (let dy = 0; dy <= h; dy++) {
        const y = barriga - dy;
        if (y < 0 || y >= alt) continue;
        const c = dy === 0 ? (h >= 2 && pontilhar(x, y, 0.6) ? tom.aro2 : tom.aro)
          : dy === 1 && h >= 3 ? tom.aro
            : dy === h && h >= 3 ? tom.meio
              : tom.corpo;
        q.px[y * largura + x] = c;
      }
    }
  }
  return q;
}

// ─── As faixas de rocha ────────────────────────────────────────────────────────────────────────

/**
 * A borda do cânion, lá no horizonte: uma serra lisa quase da cor do céu e, na frente dela, mesas
 * baixas em silhueta com o aro do sol no topo. Fica um VÃO onde o sol se põe — é por ele que o
 * disco aparece em qualquer posição da câmera.
 */
function camadaDaBorda(): Camada {
  const f = FATOR.borda;
  const l = larguraDaCamada(MUNDO, f);
  const q = criarQuadro(l, TELA.altura);
  const base = BASE.borda;
  const rn = new Ruido(101);
  // o vão do sol, na posição da camada em que ele cai com a câmera no meio
  const vao = SOL_EM.x + 128 * f;
  // a serra de trás: platôs em degraus, dois tons
  let alto = 8;
  for (let x = 0; x < l; x++) {
    if (x % 9 === 0) alto = Math.round(5 + rn.em(x / 40, 1) * 14);
    const perto = Math.abs(x - vao) < 26 ? 4 - Math.round(Math.abs(x - vao) / 8) : 0;
    const topo = base - Math.max(2, alto - perto * 3);
    for (let y = topo; y <= base; y++) q.px[y * l + x] = y === topo ? BORDA_TRAS.luz : BORDA_TRAS.corpo;
  }
  // as mesas da frente
  const r = sorteio(103);
  let x = -12;
  let semente = 110;
  while (x < l + 12) {
    const larg = 14 + r() * 46;
    const cx = x + larg / 2;
    if (Math.abs(cx - vao) > larg / 2 + 22) {
      const mo = new Molde(l, TELA.altura);
      mesa(mo, cx, base, 6 + r() * 20, larg, semente++, { degraus: 1, talude: 0.4 });
      pintarRocha(q, mo, BORDA, { semente: semente++, base, sulcos: 0.5, nevoaAltura: 7 });
    }
    x += larg + r() * 26 - 6;
  }
  // duas agulhas finas, que é o que faz esta borda ser um cânion e não um morro
  for (const [ax, aa] of [[vao - 58, 26], [vao + 88, 20]]) {
    const mo = new Molde(l, TELA.altura);
    agulha(mo, ax, base, aa, 6, semente++, 1);
    pintarRocha(q, mo, BORDA, { semente: semente++, base, sulcos: 0.4, nevoaAltura: 8 });
  }
  return recortar(q, f);
}

/**
 * Os morros do meio do caminho: mesas largas e torres altas, ainda apagados pelo ar, com a base
 * sumindo na poeira. Deixam livre o vão do sol, como a borda.
 */
function camadaDosMorros(): Camada {
  const f = FATOR.morros;
  const l = larguraDaCamada(MUNDO, f);
  const q = criarQuadro(l, TELA.altura);
  const base = BASE.morros;
  const vao = SOL_EM.x + 128 * f;
  const pintar = (fn: (mo: Molde) => void, semente: number, estrato = 5) => {
    const mo = new Molde(l, TELA.altura);
    fn(mo);
    pintarRocha(q, mo, MORROS, { semente, base, estrato, sulcos: 0.7, nevoaAltura: 12 });
  };
  pintar((mo) => mesa(mo, 22, base, 38, 70, 201), 202);
  pintar((mo) => { const m = mesa(mo, 118, base, 56, 30, 203, { degraus: 3 }); agulha(mo, 104, m.topo + 2, 14, 5, 204, -1); }, 205, 6);
  pintar((mo) => mesa(mo, vao - 92, base, 22, 50, 206, { degraus: 1 }), 207);
  pintar((mo) => agulha(mo, vao - 52, base, 40, 10, 208, 2), 209);
  pintar((mo) => mesa(mo, vao + 70, base, 30, 44, 210), 211);
  pintar((mo) => { mesa(mo, vao + 124, base, 46, 60, 212, { degraus: 2 }); }, 213, 6);
  return recortar(q, f);
}

/** Uma sombra comprida no chão, do pé de uma rocha na direção de quem olha, puxada para a esquerda. */
type Sombra = { W: number; f: number; meia: number; comprimento: number };

/**
 * A faixa do meio: é aqui que mora a MESA FURADA, com um buraco redondo de lado a lado que só uma
 * rajada de energia faria — o sol passa por ele, e é por isso que a borda de dentro acende. Do
 * lado, o arco que desabou no meio e deixou os dois tocos apontando um para o outro.
 */
function camadaDoMeio(sombras: Sombra[]): Camada {
  const f = FATOR.meio;
  const l = larguraDaCamada(MUNDO, f);
  const q = criarQuadro(l, TELA.altura);
  const b = BASE.meio;
  const X = (W: number) => naCamada(W, f);
  const sombra = (W: number, meia: number, comprimento: number) => sombras.push({ W, f, meia, comprimento });
  const nova = () => new Molde(l, TELA.altura);

  // a mesa baixa da esquerda
  let mo = nova();
  mesa(mo, X(-190), b, 36, 64, 301);
  pintarRocha(q, mo, MEIO_ROCHA, { semente: 302, base: b, estrato: 6, fendas: 2 });
  sombra(-190, 70, 120);

  // a agulha alta, meio torta
  mo = nova();
  agulha(mo, X(40), b, 66, 13, 303, -5);
  pintarRocha(q, mo, MEIO_ROCHA, { semente: 304, base: b, estrato: 7, fendas: 1 });
  sombra(40, 14, 200);

  // a mesa furada
  mo = nova();
  const cx = X(330);
  // alta o bastante para o buraco ficar contra o CÉU, e não contra os morros: buraco que mostra
  // pedra atrás não se lê como buraco
  const { topo } = mesa(mo, cx, b, 92, 64, 305, { degraus: 2, talude: 0.2 });
  const buraco = { x: cx + 2, y: topo + 27, rx: 13, ry: 12 };
  mo.elipse(buraco.x, buraco.y, buraco.rx, buraco.ry, 0);
  // a borda do buraco não é de compasso: lascas arrancadas em volta
  const rl = sorteio(306);
  for (let k = 0; k < 6; k++) {
    const a = rl() * Math.PI * 2;
    mo.elipse(buraco.x + Math.cos(a) * buraco.rx, buraco.y + Math.sin(a) * buraco.ry, 1.2 + rl() * 1.6, 1 + rl() * 1.4, 0);
  }
  pintarRocha(q, mo, MEIO_ROCHA, { semente: 307, base: b, estrato: 6, fendas: 3 });
  // rachaduras saindo do buraco
  const rr = sorteio(308);
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI * 0.9 + rr() * Math.PI * 1.8;
    let fx = buraco.x + Math.cos(a) * (buraco.rx + 1), fy = buraco.y + Math.sin(a) * (buraco.ry + 1);
    const comp = 4 + rr() * 9;
    for (let i = 0; i < comp; i++) {
      const ix = Math.round(fx), iy = Math.round(fy);
      if (mo.tem(ix, iy) && mo.tem(ix - 1, iy) && mo.tem(ix + 1, iy)) q.px[iy * l + ix] = MEIO_ROCHA.fenda;
      fx += Math.cos(a) + (rr() - 0.5) * 0.8;
      fy += Math.sin(a) + (rr() - 0.5) * 0.8;
    }
  }
  sombra(330, 60, 260);
  pedra(q, cx - 38, b, 7, 5, MEIO_ROCHA, 309);
  pedra(q, cx - 29, b, 4, 3, MEIO_ROCHA, 310);
  pedra(q, cx + 41, b, 5, 4, MEIO_ROCHA, 311);

  // o arco desabado: dois tocos com a viga partida e o entulho no meio
  const ax = X(700);
  mo = nova();
  pilar(mo, ax - 26, b, 58, 18, 312, { chapeu: 0.01, pescoco: 0.42 });
  mo.poligono([[ax - 34, b - 58], [ax - 8, b - 55], [ax - 4, b - 50], [ax - 7, b - 46], [ax - 3, b - 42], [ax - 20, b - 40], [ax - 34, b - 44]]);
  pintarRocha(q, mo, MEIO_ROCHA, { semente: 313, base: b, estrato: 6, fendas: 2 });
  mo = nova();
  pilar(mo, ax + 30, b, 50, 20, 314, { chapeu: 0.01, pescoco: 0.42 });
  mo.poligono([[ax + 40, b - 50], [ax + 12, b - 49], [ax + 9, b - 45], [ax + 13, b - 42], [ax + 10, b - 37], [ax + 24, b - 35], [ax + 40, b - 38]]);
  pintarRocha(q, mo, MEIO_ROCHA, { semente: 315, base: b, estrato: 6, fendas: 2 });
  pedra(q, ax + 2, b, 9, 6, MEIO_ROCHA, 316);
  pedra(q, ax - 8, b, 5, 4, MEIO_ROCHA, 317);
  pedra(q, ax + 13, b, 4, 3, MEIO_ROCHA, 318);
  sombra(700, 50, 160);

  return recortar(q, f);
}

/**
 * A faixa de perto, que emoldura a luta: pilares altos nas duas pontas do mundo, uma agulha torta,
 * pedregulhos e o PILAR PARTIDO, com o topo caído do lado — a pedra fresca da quebra mais clara que
 * o resto, porque ainda não pegou sol.
 */
function camadaDePerto(sombras: Sombra[]): Camada {
  const f = FATOR.perto;
  const l = larguraDaCamada(MUNDO, f);
  const q = criarQuadro(l, TELA.altura);
  const b = BASE.perto;
  const X = (W: number) => naCamada(W, f);
  const sombra = (W: number, meia: number, comprimento: number) => sombras.push({ W, f, meia, comprimento });
  const nova = () => new Molde(l, TELA.altura);

  // os dois pilares da esquerda
  let mo = nova();
  let p = pilar(mo, X(20), b, 96, 22, 401, { inclina: 3 });
  pintarRocha(q, mo, PERTO, { semente: 402, base: b, estrato: 7, fendas: 2 });
  sombraDoChapeu(q, mo, PERTO, p.fimDoChapeu, 3);
  mo = nova();
  p = pilar(mo, X(-40), b, 150, 34, 403, { inclina: -4 });
  pintarRocha(q, mo, PERTO, { semente: 404, base: b, estrato: 8, fendas: 3 });
  sombraDoChapeu(q, mo, PERTO, p.fimDoChapeu, 4);
  sombra(-40, 22, 150);
  sombra(20, 14, 110);

  // a agulha torta
  mo = nova();
  agulha(mo, X(118), b, 72, 15, 405, 7);
  pintarRocha(q, mo, PERTO, { semente: 406, base: b, estrato: 6, fendas: 1 });
  sombra(118, 10, 90);

  // pedregulhos
  pedra(q, X(215), b, 9, 7, PERTO, 407);
  pedra(q, X(229), b, 5, 4, PERTO, 408);
  pedra(q, X(203), b, 4, 3, PERTO, 409);

  // o pilar partido e o pedaço caído
  const px = X(510);
  mo = nova();
  pilar(mo, px, b, 90, 26, 410, { chapeu: 0.12 });
  partir(mo, px, b - 50, -0.35, 411);
  pintarRocha(q, mo, PERTO, { semente: 412, base: b, estrato: 7, fendas: 2, quebra: true });
  sombra(510, 16, 90);
  // O topo caído: o chapéu e um pedaço do pescoço, deitado com o chapéu para a esquerda e a quebra
  // virada para o toco de onde saiu. É desenhado EM PÉ, num referencial próprio, e girado: assim as
  // camadas de pedra deitam junto com ele, e é isso que conta que ele caiu — pedra com estrato em
  // pé no chão é só uma pedra.
  const ang = -1.32;
  const cc = Math.cos(ang), ss = Math.sin(ang);
  const ox = px - 38, oy = b - 11;
  const local = (x: number, y: number): [number, number] => [ox + x * cc - y * ss, oy + x * ss + y * cc];
  const deLocal = (x: number, y: number): [number, number] => [(x - ox) * cc + (y - oy) * ss, -(x - ox) * ss + (y - oy) * cc];
  mo = nova();
  // a laje do chapéu, chata como a dos pilares em pé, e o toco da coluna com a quebra dentada
  mo.poligono([local(-13, -13), local(12, -13), local(13, -11), local(13, -7), local(-13, -7), local(-14, -10)]);
  mo.poligono([local(-8, -8), local(8, -8), local(9, 8), local(6, 11), local(3, 9), local(0, 12), local(-4, 9), local(-8, 11)]);
  // o que passaria do chão é enterrado: a pedra caída afunda no barro, não flutua
  for (let x = mo.x0; x <= mo.x1; x++) for (let y = b + 1; y <= mo.y1; y++) mo.por(x, y, 0);
  pintarRocha(q, mo, PERTO, { semente: 413, base: b, estrato: 6, estratoEm: (x, y) => deLocal(x, y)[1], fendas: 0 });
  // a quebra, pedra fresca e clara, com o risco de onde se partiu
  for (let y = mo.y0; y <= mo.y1; y++) {
    for (let x = mo.x0; x <= mo.x1; x++) {
      if (!mo.tem(x, y) || !mo.tem(x + 1, y) || !mo.tem(x, y - 1) || !mo.tem(x, y + 1)) continue;
      const [, ly] = deLocal(x + 0.5, y + 0.5);
      if (ly > 6.5 && pontilhar(x, y, (ly - 6.5) / 2.5)) q.px[y * l + x] = ly > 8.5 ? PERTO.aro : PERTO.tons[PERTO.tons.length - 1];
    }
  }
  pedra(q, px - 14, b, 4, 3, PERTO, 414);
  pedra(q, px + 18, b, 5, 3, PERTO, 415);
  pedra(q, px - 52, b, 3, 2, PERTO, 416);

  // a ponta direita: um paredão alto e um pilar na frente dele
  mo = nova();
  mesa(mo, X(712), b, 170, 50, 417, { degraus: 3, talude: 0.12 });
  pintarRocha(q, mo, PERTO, { semente: 418, base: b, estrato: 9, fendas: 3 });
  mo = nova();
  p = pilar(mo, X(670), b, 112, 26, 419, { inclina: 4 });
  pintarRocha(q, mo, PERTO, { semente: 420, base: b, estrato: 7, fendas: 2 });
  sombraDoChapeu(q, mo, PERTO, p.fimDoChapeu, 3);
  sombra(670, 16, 150);
  pedra(q, X(640), b, 6, 5, PERTO, 421);

  return recortar(q, f);
}

// ─── O chão ────────────────────────────────────────────────────────────────────────────────────

type Cratera = { W: number; f: number; R: number };
type Fenda = [number, number][];

/**
 * A primeira é a grande, logo atrás da linha da luta — é em volta dela que as pedrinhas flutuam e
 * dela que saem as fendas. A da frente fica cortada pela beira de baixo da tela, de propósito: é o
 * que diz que o chão continua para cá de quem luta.
 */
const CRATERAS: Cratera[] = [
  { W: 300, f: 0.8, R: 50 },
  { W: 30, f: 0.9, R: 26 },
  { W: 150, f: 0.5, R: 42 },
  { W: 545, f: 0.6, R: 34 },
  { W: 490, f: 1.14, R: 42 },
  { W: 650, f: 0.93, R: 20 },
];

/**
 * A célula de barro em que cai um ponto do chão (Voronoi numa grade tremida). Duas vizinhas de
 * célula diferente são uma rachadura — e a pergunta é feita em coordenadas do MUNDO, então a placa
 * que tem 40 pixels na linha dos pés tem 20 lá no fundo, e achatada.
 */
function celula(W: number, z: number): number {
  const S = 46;
  const gx = Math.floor(W / S), gz = Math.floor(z / S);
  let melhor = Infinity, id = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = gx + dx, cz = gz + dz;
      const px = (cx + 0.15 + acaso(cx, cz) * 0.7) * S;
      const pz = (cz + 0.15 + acaso(cz + 911, cx - 37) * 0.7) * S;
      const d = (W - px) ** 2 + (z - pz) ** 2;
      if (d < melhor) { melhor = d; id = cx * 7919 + cz; }
    }
  }
  return id;
}

/** O raio de uma cratera em que cai um ponto: as rachaduras em estrela em volta dela. */
const raioDaCratera = (du: number, dv: number) => Math.floor(((Math.atan2(dv, du) / (Math.PI * 2)) + 1) * 11) % 11;

function linhasDoChao(sombras: Sombra[], fendas: Fenda[]): Camada[] {
  const mancha = new Ruido(61);
  const miudo = new Ruido(62);
  const barro = new Ruido(63);
  const n = CHAO_TONS.length;
  const linhas: Camada[] = [];
  const crateras = CRATERAS.map((c) => ({ ...c, z: FOCO / c.f }));
  for (let y = BASE.borda; y < TELA.altura; y++) {
    const f = fatorDaLinha(y);
    const l = larguraDaCamada(MUNDO, f);
    const q = criarQuadro(l, 1);
    const z = FOCO / f;
    const zAcima = FOCO / fatorDaLinha(y - 1);
    const zAbaixo = FOCO / fatorDaLinha(y + 1);
    // longe o barro clareia com o brilho do horizonte; perto, afunda — e à frente dos pés afunda
    // mais depressa, que é o que emoldura a luta sem precisar de nada tapando a beira da tela
    // (meio degrau acima do que era: com o barro onde se pisa no mesmo valor escuro das calças e do
    // cabelo dos lutadores, tirando a cor eles se perdiam no chão)
    const longe = 6.5 - (f - 0.1) * 2.6 - Math.max(0, f - 0.95) * 2.8;
    // o miúdo só aparece onde é maior que um pixel; longe viraria chuvisco
    const nitidez = entre((f - 0.4) / 0.3);
    const passo = 1 / f;
    for (let x = 0; x < l; x++) {
      const W = (x + 0.5 - MEIO * (1 - f)) / f;
      let v = longe + (mancha.em(W / 110, z / 90) - 0.5) * 1.3 + (miudo.em(W / 7, z / 11) - 0.5) * 0.8 * nitidez;
      let naCratera = false;
      for (const c of crateras) {
        const du = (W - c.W) / c.R, dv = (z - c.z) / c.R;
        const d = Math.hypot(du, dv);
        if (d >= 2.2) continue;
        // -1 é a beira do lado de quem olha, +1 a do lado de lá; -1 e +1 de lado, esquerda e direita
        const lado = dv / Math.max(d, 0.001), lateral = du / Math.max(d, 0.001);
        if (d < 0.8) {
          // a bacia: a parede de lá está virada para quem olha e de costas para o sol, no escuro;
          // a de cá está virada para o sol
          const k = d / 0.8;
          v = longe - 1.1 - lado * k * 1.7 - lateral * k * 0.6;
          naCratera = true;
        } else if (d < 1) {
          // a crista levantada: a de lá pega o sol em cheio e desenha a boca da cratera; a de cá é
          // um fio claro no alto e a face de fora, virada para quem olha, no escuro
          if (lado > -0.2) v = longe + 2.1 + lado * 0.8 + lateral * 0.7;
          else v = d > 0.9 ? 1.2 : longe + 1;
          naCratera = true;
        } else {
          if (d < 1.4) v += ((1.4 - d) / 0.4) * 1.1; // a poeira que a pancada jogou para fora
          // rachaduras em estrela, cada uma com o seu comprimento
          const r0 = raioDaCratera(du, dv);
          if (nitidez > 0 && d < 1.25 + acaso(r0, c.W) * 0.95) {
            const dW = passo / c.R;
            const dz = (zAbaixo - z) / c.R;
            if (r0 !== raioDaCratera(du + dW, dv) || r0 !== raioDaCratera(du, dv + dz)) { v = 0.9 + (1 - nitidez) * 2; naCratera = true; }
          }
        }
      }
      // o barro rachado, em manchas: onde não há placa, é poeira lisa
      if (!naCratera && nitidez > 0 && barro.em(W / 150, z / 150) > 0.4) {
        const id = celula(W, z);
        if (id !== celula(W + passo, z) || id !== celula(W, zAbaixo)) v = 1 + (1 - nitidez) * 2.4;
        else if (id !== celula(W, zAcima)) v += 1.1;
        else if (id !== celula(W - passo, z)) v -= 0.7;
        else v += (acaso(id, 5) - 0.5) * 0.9;
      }
      for (const s of sombras) {
        const sz = FOCO / s.f;
        if (z > sz || z < sz - s.comprimento) continue;
        const t = (sz - z) / s.comprimento;
        const centro = s.W - (sz - z) * 0.45;
        const meia = s.meia * (1 - 0.45 * t);
        const dx = Math.abs(W - centro) / meia;
        // pontilhado só numa beira estreita: pontilhado largo no chão vira grade
        const forca = 1.6 - t * 1.3 - dx * 0.6;
        if (dx < 1 && (forca >= 1 || (forca > 0.6 && pontilhar(x, y, (forca - 0.6) / 0.4)))) v -= 1.6;
      }
      q.px[x] = CHAO_TONS[degrau(v, x, y, n)];
    }
    linhas.push({ quadro: q, fator: f, y });
  }

  const linhaDe = (y: number) => linhas[y - BASE.borda];
  const tomDe = (c: Cor) => CHAO_TONS.indexOf(c);
  // fendas grandes, de um ou dois pixels, com a beira de cá acesa
  const marcadas: [number, number][] = [];
  for (const fenda of fendas) {
    for (let i = 0; i + 1 < fenda.length; i++) {
      const [Wa, za] = fenda[i];
      const [Wb, zb] = fenda[i + 1];
      const passos = Math.ceil(Math.hypot(Wb - Wa, zb - za) / 0.35);
      for (let s = 0; s <= passos; s++) {
        const W = Wa + ((Wb - Wa) * s) / passos, z = za + ((zb - za) * s) / passos;
        const y = Math.round(linhaDoFator(FOCO / z));
        if (y < BASE.borda || y >= TELA.altura) continue;
        const fy = fatorDaLinha(y);
        const x = Math.floor(naCamada(W, fy));
        const c = linhaDe(y).quadro;
        const largura = fy > 0.95 ? 2 : 1;
        for (let k = 0; k < largura; k++) {
          if (x + k < 0 || x + k >= c.largura) continue;
          c.px[x + k] = CHAO_TONS[0];
          marcadas.push([x + k, y]);
        }
      }
    }
  }
  for (const [x, y] of marcadas) {
    if (y + 1 >= TELA.altura) continue;
    const c = linhaDe(y + 1).quadro;
    const fy = fatorDaLinha(y + 1);
    // a mesma posição do mundo na linha de baixo
    const W = (x + 0.5 - MEIO * (1 - fatorDaLinha(y))) / fatorDaLinha(y);
    const xb = Math.floor(naCamada(W, fy));
    const k = tomDe(c.px[xb]);
    if (k > 0 && k < n - 1) c.px[xb] = CHAO_TONS[Math.min(n - 1, k + 2)];
  }

  // cascalho: um pixel de altura, a sombra à esquerda e a luz à direita
  const r = sorteio(71);
  for (let y = BASE.meio; y < TELA.altura; y++) {
    const f = fatorDaLinha(y);
    const c = linhaDe(y).quadro;
    const quantos = Math.round(c.largura * 0.012 * f);
    for (let k = 0; k < quantos; k++) {
      const x = 1 + Math.floor(r() * (c.largura - 4));
      if (tomDe(c.px[x]) <= 1) continue;
      const grande = f > 0.85 && r() < 0.4;
      c.px[x] = CHAO_TONS[1];
      c.px[x + 1] = CHAO_TONS[grande ? 5 : 6];
      if (grande) c.px[x + 2] = CHAO_TONS[7];
    }
  }
  return linhas;
}

/**
 * As fendas grandes: saem da cratera do meio em zigue-zague, uma vindo na direção de quem olha e
 * outra correndo para o fundo à direita. Em coordenadas do mundo (lateral, distância).
 */
function tracarFendas(): Fenda[] {
  const r = sorteio(81);
  // O desvio é proporcional ao tamanho do pedaço e alterna de lado: com desvio pequeno e sorteado,
  // a fenda comprida que corre para o fundo saía quase reta e lia como uma lança largada no chão.
  const zigue = (a: [number, number], b: [number, number], pedacos: number): Fenda => {
    const pts: Fenda = [a];
    const passo = Math.hypot(b[0] - a[0], b[1] - a[1]) / pedacos;
    for (let i = 1; i < pedacos; i++) {
      const t = i / pedacos;
      const lado = (i % 2 ? 1 : -1) * (0.35 + r() * 0.4) * passo;
      pts.push([a[0] + (b[0] - a[0]) * t + lado, a[1] + (b[1] - a[1]) * t + (r() - 0.5) * passo * 0.5]);
    }
    pts.push(b);
    return pts;
  };
  const centro = CRATERAS[0];
  const zc = FOCO / centro.f;
  return [
    zigue([centro.W - 38, zc - 30], [150, 285], 9),
    zigue([centro.W + 48, zc + 14], [500, 700], 7),
    zigue([centro.W + 26, zc - 42], [390, 300], 4),
  ];
}

// ─── O que se mexe ─────────────────────────────────────────────────────────────────────────────

type Pedrinha = { W: number; f: number; altura: number; quadros: [Quadro, Quadro]; passo: number; fase: number; atras: Set<Cor> };
type Fiapo = { W: number; f: number; altura: number; comprimento: number; vel: number; fase: number; atras: Set<Cor> };

/** Uma pedrinha em dois quadros, desenhada a mão: letra é tom, e o contorno nasce sozinho em volta. */
function pedrinha(desenho: string[]): Quadro {
  const alt = desenho.length + 2, larg = desenho[0].length + 2;
  const q = criarQuadro(larg, alt);
  const tons: Record<string, Cor> = { s: PEDRINHA.sombra, b: PEDRINHA.base, l: PEDRINHA.luz };
  desenho.forEach((linha, y) => {
    for (let x = 0; x < linha.length; x++) if (tons[linha[x]]) q.px[(y + 1) * larg + x + 1] = tons[linha[x]];
  });
  for (let y = 0; y < alt; y++) {
    for (let x = 0; x < larg; x++) {
      if (q.px[y * larg + x] !== 0) continue;
      const cheio = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < larg && yy < alt && q.px[yy * larg + xx] !== 0 && q.px[yy * larg + xx] !== PEDRINHA.contorno;
      if (cheio(x - 1, y) || cheio(x + 1, y) || cheio(x, y - 1) || cheio(x, y + 1)) q.px[y * larg + x] = PEDRINHA.contorno;
    }
  }
  return q;
}

const PEDRINHAS: [string[], string[]][] = [
  [['.bl', 'sbb'], ['bl.', 'ssb']],
  [['.bbl', 'sbbl', '.ssb'], ['bbl.', 'sbbl', 'ssb.']],
  [['.bbbl', 'sbbbl', '.sss.'], ['..bl.', 'sbbbl', 'sssb.']],
  [['..bbl.', '.bbbbl', 'sbbbbl', '.ssss.'], ['.bbl..', 'sbbbl.', 'sbbbbl', '..sssb']],
];

export function cenarioCanion(): Cenario {
  const sombras: Sombra[] = [];
  const ceu = camadaDoCeu();
  const borda = camadaDaBorda();
  const morros = camadaDosMorros();
  const meio = camadaDoMeio(sombras);
  const perto = camadaDePerto(sombras);
  const linhas = linhasDoChao(sombras, tracarFendas());
  const ate = (a: number, b: number) => linhas.filter((c) => (c.y ?? 0) > a && (c.y ?? 0) <= b);

  // O que está atrás de cada distância: quem se mexe só pinta sobre essas cores. São quatro
  // conjuntos, um por vão entre faixas de rocha, e cada coisa que se mexe aponta para o seu.
  const cores = (t: TomDeRocha) => [...t.tons, t.aro, t.fenda, ...(t.contorno ? [t.contorno] : []), ...(t.nevoa ? [t.nevoa] : [])];
  const doCeu = new Set<Cor>([...CEU, SOL, ESTRELA.fraca, ESTRELA.forte]);
  const vaos: Set<Cor>[] = [];
  let atras: Cor[] = [...doCeu, ...CHAO_TONS, BORDA_TRAS.corpo, BORDA_TRAS.luz, ...cores(BORDA), POEIRA.clara, POEIRA.rala];
  for (const tom of [MORROS, MEIO_ROCHA, PERTO, null]) {
    vaos.push(new Set(atras));
    if (tom) atras = [...atras, ...cores(tom)];
  }
  const atrasDe = (f: number) => vaos[f > FATOR.perto ? 3 : f > FATOR.meio ? 2 : f > FATOR.morros ? 1 : 0];
  const escurecer = new Map<Cor, Cor>(CHAO_TONS.map((c, i) => [c, CHAO_TONS[Math.max(0, i - 2)]]));

  const nuvens: Nuvem[] = [
    { q: nuvem(160, 5, 501, NUVEM_ALTA), x: 60, y: 8, passo: 150 },
    { q: nuvem(100, 4, 502, NUVEM_ALTA), x: 330, y: 22, passo: 130 },
    { q: nuvem(130, 6, 503, NUVEM_ALTA), x: 200, y: 40, passo: 110 },
    { q: nuvem(90, 5, 504, NUVEM_BAIXA), x: 470, y: 62, passo: 90 },
    { q: nuvem(200, 7, 505, NUVEM_BAIXA), x: 300, y: 74, passo: 80 },
    { q: nuvem(80, 4, 506, NUVEM_BAIXA), x: 80, y: 88, passo: 70 },
  ];

  const rp = sorteio(601);
  const pedrinhas: Pedrinha[] = [
    // Todas baixas e em volta da cratera grande: é a pancada que as soltou do chão. Uma pedrinha
    // solta lá no alto, longe de tudo, lia como mosca na tela e não como energia no ar.
    [280, 0.8, 14, 2], [310, 0.78, 26, 3], [338, 0.82, 9, 1], [322, 0.84, 38, 0], [256, 0.79, 30, 1],
    [120, 0.88, 12, 2], [146, 0.86, 22, 0], [562, 0.95, 16, 1], [590, 0.9, 30, 0],
  ].map(([W, f, altura, tam]) => {
    const [a, b] = PEDRINHAS[tam];
    return { W, f, altura, quadros: [pedrinha(a), pedrinha(b)], passo: 18 + Math.floor(rp() * 14), fase: Math.floor(rp() * 400), atras: atrasDe(f) };
  });

  const rf = sorteio(701);
  const poeira: Fiapo[] = [];
  for (let k = 0; k < 64; k++) {
    const f = 0.62 + rf() * 0.58;
    poeira.push({
      W: -150 + rf() * 1100, f, altura: 1 + Math.floor(rf() * 10 * f), comprimento: Math.round((12 + rf() * 26) * f),
      vel: 2.5 + rf() * 2, fase: Math.floor(rf() * 64), atras: atrasDe(f),
    });
  }

  return {
    id: 'canion',
    nome: 'Cânion',
    largura: MUNDO.largura,
    camadas: [
      ceu.camada,
      ...ate(0, BASE.borda),
      borda,
      ...ate(BASE.borda, BASE.morros),
      morros,
      ...ate(BASE.morros, BASE.meio),
      meio,
      ...ate(BASE.meio, BASE.perto),
      perto,
      ...ate(BASE.perto, TELA.altura),
    ],
    clarao: cor('#fff0d8'),
    animar(q, camX, tique) {
      const L = q.largura;
      // Estrelas: cada uma pisca uma vez a cada tanto, em dois quadros — cruz e ponto.
      const passoE = Math.floor(tique / 12);
      for (const e of ceu.estrelas) {
        const fase = (passoE + e.fase) % 40;
        if (fase > 1) continue;
        if (!doCeu.has(q.px[e.y * L + e.x])) continue;
        if (fase === 0) {
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const ex = e.x + dx, ey = e.y + dy;
            if (ex < 0 || ex >= L || ey < 0) continue;
            if (doCeu.has(q.px[ey * L + ex])) q.px[ey * L + ex] = ESTRELA.fraca;
          }
        }
        q.px[e.y * L + e.x] = ESTRELA.forte;
      }
      // Nuvens: um pixel para a esquerda a cada tantos quadros, com o vento, e só onde é céu —
      // passam atrás das mesas sem ninguém recortar nada.
      for (const n of nuvens) {
        const volta = L + n.q.largura;
        const x0 = ((((n.x - Math.floor(tique / n.passo)) % volta) + volta) % volta) - n.q.largura;
        for (let y = 0; y < n.q.altura; y++) {
          const py = n.y + y;
          for (let x = 0; x < n.q.largura; x++) {
            const c = n.q.px[y * n.q.largura + x];
            const px = x0 + x;
            if (c === 0 || px < 0 || px >= L) continue;
            const i = py * L + px;
            if (doCeu.has(q.px[i])) q.px[i] = c;
          }
        }
      }
      // Poeira: fiapos rasteiros correndo para a esquerda, andando de 3 em 3 quadros. Sempre há
      // alguns, cada um no seu tempo de aparecer e sumir; de tempos em tempos passa uma RAJADA, uma
      // faixa que atravessa o mundo e acende, compridos, todos os fiapos dentro dela. O fiapo não é
      // régua: sobe e desce um pixel ao longo do comprimento, e a onda anda junto com ele.
      const passoP = Math.floor(tique / 3);
      const rajada = 1150 - ((tique * 0.9) % 1800);
      for (const p of poeira) {
        const W = ((((p.W - passoP * p.vel) % 1100) + 1100) % 1100) - 150;
        const d = W - rajada;
        const vida = (passoP + p.fase) % 64;
        let comp: number;
        if (d >= 0 && d <= 320) comp = Math.ceil(p.comprimento * (d < 40 ? 0.4 : d > 240 ? 0.6 : 1));
        else if (vida < 26) comp = Math.ceil(p.comprimento * (vida < 4 || vida > 22 ? 0.25 : 0.55));
        else continue;
        const sx = Math.round(naTela(W, p.f, camX));
        const sy = Math.round(linhaDoFator(p.f)) - p.altura;
        if (sx > L || sx + comp < 0 || sy < 2 || sy >= q.altura) continue;
        for (let k = 0; k < comp; k++) {
          const px = sx + k;
          if (px < 0 || px >= L) continue;
          const py = sy - (((k + p.fase) >> 3) & 1);
          const i = py * L + px;
          if (!p.atras.has(q.px[i])) continue;
          if (k < 3) q.px[i] = POEIRA.clara;
          else if (pontilhar(px, py, 0.9 - (k / comp) * 0.75)) q.px[i] = POEIRA.rala;
        }
      }
      // Pedrinhas: flutuam subindo e descendo um pixel por vez, viram de lado a cada volta, e de
      // vez em quando solta uma faísca. A sombra no chão fica parada — elas não saem do lugar.
      for (const p of pedrinhas) {
        const [s0] = p.quadros;
        const sx = Math.round(naTela(p.W, p.f, camX)) - (s0.largura >> 1);
        if (sx < -8 || sx > L + 8) continue;
        const t = tique + p.fase;
        const sobe = [0, 1, 2, 1][Math.floor(t / p.passo) % 4];
        const s = p.quadros[Math.floor(t / (p.passo * 4)) % 2];
        const chao = Math.round(linhaDoFator(p.f));
        for (let k = 1; k < s.largura - 1 && chao < q.altura; k++) {
          const i = chao * L + sx + k;
          const c = escurecer.get(q.px[i]);
          if (sx + k >= 0 && sx + k < L && c !== undefined) q.px[i] = c;
        }
        const sy = chao - p.altura - sobe - s.altura;
        for (let y = 0; y < s.altura; y++) {
          for (let x = 0; x < s.largura; x++) {
            const c = s.px[y * s.largura + x];
            const px = sx + x, pyy = sy + y;
            if (c === 0 || px < 0 || px >= L || pyy < 0 || pyy >= q.altura) continue;
            const i = pyy * L + px;
            if (p.atras.has(q.px[i])) q.px[i] = c;
          }
        }
        const faisca = Math.floor(t / 6) % 50;
        if (faisca < 2) {
          const fx = sx + (faisca === 0 ? -1 : s.largura), fy = sy + (faisca === 0 ? 1 : 0);
          if (fx >= 0 && fx < L && fy >= 0 && p.atras.has(q.px[fy * L + fx])) q.px[fy * L + fx] = PEDRINHA.faisca;
        }
      }
    },
  };
}

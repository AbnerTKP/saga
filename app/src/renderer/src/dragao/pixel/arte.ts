/**
 * A arte do lutador de pixel antes de virar sprite: cada pixel guarda a cor E o material. A cor é
 * a do Goiaba (a do zip, ou a de uma rampa dele); o material é o que deixa trocar a roupa depois,
 * sem perder o salpicado. Recortar, colar, espelhar e girar em quartos de volta é tudo o que se
 * faz com ela — nada de girar em ângulo qualquer, que em pixel art borra o traço.
 */
import { type Cor, cor } from '../quadro.ts';
import { BASE, CONTORNO, FUNDA, LETRAS, LUZ, MATERIAIS, type Material, type Roupa, SOMBRA } from './materiais.ts';

export type Arte = {
  largura: number;
  altura: number;
  cor: Uint32Array;
  /** 0 é vazio; senão o índice do material em `MATERIAIS`, mais um. */
  mat: Uint8Array;
  /** O ponto de encaixe: é ele que vai para a posição pedida ao colar. */
  pivo: [number, number];
};

export function criarArte(largura: number, altura: number, pivo: [number, number] = [0, 0]): Arte {
  return { largura, altura, cor: new Uint32Array(largura * altura), mat: new Uint8Array(largura * altura), pivo };
}

const indiceDaLetra = new Map<string, number>(MATERIAIS.map((m, i) => [LETRAS[m][0], i + 1]));
export const materialDe = (m: number): Material | null => (m ? MATERIAIS[m - 1] : null);
export const numeroDo = (m: Material) => MATERIAIS.indexOf(m) + 1;

/** A base do zip: as linhas com letra por cor, a paleta e o mapa de materiais. */
export function arteDaBase(linhas: string[], paleta: Record<string, string>, materiais: string[]): Arte {
  const a = criarArte(linhas[0].length, linhas.length);
  const cores = new Map(Object.entries(paleta).map(([l, h]) => [l, cor(h)]));
  for (let y = 0; y < a.altura; y++) for (let x = 0; x < a.largura; x++) {
    const ch = linhas[y][x];
    if (ch === '.') continue;
    a.cor[y * a.largura + x] = cores.get(ch)!;
    a.mat[y * a.largura + x] = indiceDaLetra.get(materiais[y][x]) ?? 0;
  }
  return a;
}

export function copiar(a: Arte): Arte {
  return { largura: a.largura, altura: a.altura, cor: a.cor.slice(), mat: a.mat.slice(), pivo: [a.pivo[0], a.pivo[1]] };
}

/** Só os pixels que o filtro aceita, no mesmo lugar (é recorte, não corte: o pivô não muda). */
export function recortar(a: Arte, filtro: (x: number, y: number, m: Material | null) => boolean): Arte {
  const r = criarArte(a.largura, a.altura, a.pivo);
  for (let y = 0; y < a.altura; y++) for (let x = 0; x < a.largura; x++) {
    const i = y * a.largura + x;
    if (a.mat[i] && filtro(x, y, materialDe(a.mat[i]))) { r.cor[i] = a.cor[i]; r.mat[i] = a.mat[i]; }
  }
  return r;
}

export type Colagem = {
  /** Vira na horizontal em torno do pivô. */
  espelhar?: boolean;
  /** Quartos de volta no sentido do relógio, em torno do pivô — só para peça pequena. */
  girar?: 0 | 1 | 2 | 3;
  /** Só pinta onde o destino está vazio: é o que fica atrás do que já foi colado. */
  porBaixo?: boolean;
};

/** Cola `p` em `d` com o pivô de `p` em (x, y). Vazio não pinta; `porBaixo` só pinta onde está vazio. */
export function colarArte(d: Arte, p: Arte, x: number, y: number, o: Colagem = {}) {
  const giro = o.girar ?? 0;
  for (let py = 0; py < p.altura; py++) for (let px = 0; px < p.largura; px++) {
    const i = py * p.largura + px;
    if (!p.mat[i]) continue;
    let rx = px - p.pivo[0], ry = py - p.pivo[1];
    if (o.espelhar) rx = -rx;
    for (let k = 0; k < giro; k++) [rx, ry] = [-ry, rx];
    const dx = x + rx, dy = y + ry;
    if (dx < 0 || dy < 0 || dx >= d.largura || dy >= d.altura) continue;
    const j = dy * d.largura + dx;
    if (o.porBaixo && d.mat[j]) continue;
    d.cor[j] = p.cor[i];
    d.mat[j] = p.mat[i];
  }
}

/** Um carimbo: linhas de símbolos (ver `materiais.ts`) e o ponto onde ele se prende ao corpo. */
export type Carimbo = { linhas: string[]; pivo: [number, number] };

const simbolos = new Map<string, [Material, number]>();
for (const m of MATERIAIS) {
  const [sombra, luz] = LETRAS[m];
  simbolos.set(sombra, [m, SOMBRA]);
  simbolos.set(sombra.toUpperCase(), [m, BASE]);
  simbolos.set(luz, [m, LUZ]);
}

/** Sorteio fixo por pixel: o mesmo carimbo sai com o mesmo salpicado em toda pose e todo computador. */
const sorte = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const sementeDe = (linhas: string[]) => {
  let s = 7;
  for (const l of linhas) for (let i = 0; i < l.length; i++) s = (Math.imul(s, 31) + l.charCodeAt(i)) >>> 0;
  return s;
};

/**
 * Pinta um carimbo com a roupa de um lutador. O `#` é contorno do material vizinho (o bordô em
 * volta do laranja, o preto em volta do azul), e `atras` desce tudo um degrau: é o membro do
 * outro lado do corpo, que a luz alcança menos.
 */
export function pintarCarimbo(c: Carimbo, roupa: Roupa, atras = false, salpico = 0.38): Arte {
  const altura = c.linhas.length, largura = Math.max(...c.linhas.map((l) => l.length));
  const a = criarArte(largura, altura, c.pivo);
  const semente = sementeDe(c.linhas);
  const ler = (x: number, y: number) => simbolos.get(c.linhas[y]?.[x] ?? '.');
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) {
    const ch = c.linhas[y][x] ?? '.';
    if (ch === '.' || ch === ' ') continue;
    let material: Material, degrau: number;
    if (ch === '#') {
      // o contorno é de quem está em volta: conta os vizinhos, os de lado valem mais que os de canto
      const conta = new Map<Material, number>();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const s = ler(x + dx, y + dy);
        if (s) conta.set(s[0], (conta.get(s[0]) ?? 0) + (dx === 0 || dy === 0 ? 2 : 1));
      }
      let melhor: Material | null = null, n = 0;
      for (const [m, k] of conta) if (k > n) { melhor = m; n = k; }
      if (!melhor) {
        // canto solto: o material mais perto
        let d = Infinity;
        for (let yy = 0; yy < altura; yy++) for (let xx = 0; xx < largura; xx++) {
          const s = ler(xx, yy), dd = (xx - x) ** 2 + (yy - y) ** 2;
          if (s && dd < d) { d = dd; melhor = s[0]; }
        }
      }
      if (!melhor) continue;
      material = melhor; degrau = CONTORNO;
    } else {
      const s = simbolos.get(ch);
      if (!s) throw new Error(`símbolo desconhecido no carimbo: ${ch}`);
      [material, degrau] = s;
      if (atras) degrau = Math.max(FUNDA, degrau - 1);
    }
    const tons = roupa[material][degrau];
    let hex = tons[0];
    if (tons.length > 1 && sorte(x, y, semente) < salpico) hex = tons[1 + Math.floor(sorte(y, x, semente + 1) * (tons.length - 1))];
    a.cor[y * largura + x] = cor(hex);
    a.mat[y * largura + x] = numeroDo(material);
  }
  return a;
}

/** Aplica uma troca de cor pixel a pixel, sabendo o material. */
export function tingir(a: Arte, troca: (c: Cor, m: Material, x: number, y: number) => Cor): Arte {
  const r = copiar(a);
  for (let y = 0; y < a.altura; y++) for (let x = 0; x < a.largura; x++) {
    const i = y * a.largura + x;
    if (a.mat[i]) r.cor[i] = troca(a.cor[i], MATERIAIS[a.mat[i] - 1], x, y);
  }
  return r;
}

/** Os limites do que está pintado: [x0, y0, x1, y1] inclusivos, ou null se vazia. */
export function limites(a: Arte): [number, number, number, number] | null {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < a.altura; y++) for (let x = 0; x < a.largura; x++) {
    if (!a.mat[y * a.largura + x]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

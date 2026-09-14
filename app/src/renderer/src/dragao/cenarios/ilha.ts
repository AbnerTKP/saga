/**
 * Ilha da Tartaruga — a ilhota do velho mestre no fim da tarde: casinha rosa de telhado vermelho,
 * palmeira torta, areia clara e o mar em volta até o horizonte, com o sol se pondo.
 *
 * O PISO é o que dá profundidade, e ele não é uma camada: cada linha de pixels do mar e da areia é
 * a sua, andando com a câmera no fator da própria distância — o horizonte fica parado, a linha dos
 * pés anda junto com os lutadores, a beira de baixo anda mais que eles. Não é truque, é a conta:
 * um ponto do chão a uma distância D anda na tela o deslocamento da câmera vezes f/D, e f/D é a
 * escala daquela linha. Por isso o que está NO chão (a beira da ilha, as sombras, as conchas, a
 * trilha) é posto em coordenadas do mundo e projetado linha a linha, e o que está EM PÉ nele (a
 * casa, a palmeira, a tartaruga) é uma camada inteira no fator da linha em que pisa: com a casa num
 * fator e a areia debaixo dela noutro, ela escorregaria pela ilha no primeiro passo da câmera.
 *
 * A água mexe sem redesenhar a água. O que anda por cima do mar em `animar` taparia a casa e a
 * palmeira, que ficam na frente dele; então cada pixel de mar sai das camadas MARCADO no canal
 * alfa (254 é mar, 253 a 250 são as quatro fases da crista, 249 a 246 as da espuma), com a cor de
 * base nos outros três. `animar` troca só os marcados pela cor do momento e devolve o alfa cheio —
 * a casa, pintada por cima com alfa 255, nunca é tocada. Esquecido o `animar`, o mar sai com a cor
 * de base, no máximo 4% menos opaco: nada quebra.
 */
import { type Cor, type Quadro, colar, cor, criarQuadro, linha, pixel, retangulo } from '../quadro.ts';
import { type Camada, type Cenario, degrade, larguraDaCamada, pontilhar, sorteio } from '../cenario.ts';
import { Mascara, type Forma, type P, type Tinta, pintarPeca } from '../raster.ts';
import { CHAO, TELA } from '../medidas.ts';

/** A largura do mundo na linha da luta: a câmera anda de 0 a 256. */
const MUNDO = 640;
/** O centro da tela, para onde as linhas do chão convergem. */
const MEIO = TELA.largura / 2;
/**
 * O horizonte fica logo ACIMA da cabeça de quem está de pé: o pôr do sol precisa de céu, e um
 * horizonte mais alto pediria ver os lutadores de cima — o sprite é desenhado de lado.
 */
const HORIZONTE = 120;

/** A escala do chão numa linha da tela, relativa à linha da luta — e o fator da fatia dessa linha. */
const escala = (y: number) => (y - HORIZONTE) / (CHAO - HORIZONTE);
/** A linha da tela de uma profundidade: `z` 1 é a linha da luta, 2 o dobro da distância. */
const linhaDe = (z: number) => Math.round(HORIZONTE + (CHAO - HORIZONTE) / z);
/** O x do mundo que cai no pixel `px` da imagem de uma fatia de escala `s` (com a câmera em 0). */
const xDoMundo = (px: number, s: number) => MEIO + (px - MEIO) / s;
/** O contrário: onde um x do mundo cai na imagem de uma camada de fator `s`. */
const naCamada = (x: number, s: number) => MEIO + (x - MEIO) * s;
/**
 * Quantos pixels do mundo cabem numa unidade de profundidade — o que deixa medir sombra e ilha no
 * chão sem achatá-las: 1 de `z` é tão comprido quanto 300 de x.
 */
const FUNDO = 300;

/** Um número "aleatório" preso a uma posição: o mesmo em todo computador e em toda chamada. */
const RUIDO = (() => {
  const r = sorteio(0x7a27a);
  return Float32Array.from({ length: 4096 }, () => r());
})();
const acaso = (a: number, b: number, c = 0) =>
  RUIDO[((Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791)) >>> 0) & 4095];

// ---------------------------------------------------------------------------------------------
// As marcas da água

const MAR = 1;
const CRISTA = 2;
const ESPUMA = 6;
const marcar = (c: Cor, tipo: number): Cor => ((c & 0xffffff) | ((255 - tipo) << 24)) >>> 0;
const opaca = (c: Cor): Cor => (c | 0xff000000) >>> 0;

// ---------------------------------------------------------------------------------------------
// Paletas. Do fundo para a frente, cada uma com poucas cores; o que é longe tem menos contraste.

const CEU = ['#2a1b4e', '#46276a', '#6f3479', '#a0447c', '#d25a7a', '#ef7c6c', '#f9a66a', '#ffd28c'].map(cor);
const SOL = { x: 300, y: 115, r: 17, miolo: cor('#fff6d6'), borda: cor('#ffe8a8') };
/** Os fiapos que cortam o sol são o próprio céu de umas faixas acima: nada de cor nova. */
const FAIXA_NO_SOL = CEU[4];

const ILHAS_LONGE = { corpo: cor('#d17485'), topo: cor('#e38e86') };

/**
 * A água é UMA rampa, do fundo escuro ao brilho do sol. A distância escolhe o degrau (o horizonte
 * é o mais claro, porque reflete o céu baixo), a crista acende um degrau acima e a sombra dela
 * fica um abaixo. O raso em volta da ilha é a outra rampa, e a espuma é o último degrau da água.
 */
const MAR_RAMPA = ['#5c3f80', '#7c4b87', '#a55987', '#cf6f83', '#f0937f', '#ffcf96', '#fff6d6'].map(cor);
/** Os degraus que a distância usa: do perto (0) ao horizonte (4). */
const DEGRAUS_DO_MAR = 5;
const RASO_RAMPA = ['#558b9d', '#6aa7aa', '#b6e2d2'].map(cor);
const CLARO = new Map<Cor, Cor>([
  ...MAR_RAMPA.slice(0, -1).map((c, i): [Cor, Cor] => [c, MAR_RAMPA[i + 1]]),
  ...RASO_RAMPA.slice(0, -1).map((c, i): [Cor, Cor] => [c, RASO_RAMPA[i + 1]]),
]);
const ESPUMA_COR = MAR_RAMPA[6];
const BRILHO = [MAR_RAMPA[6], MAR_RAMPA[5]];

/**
 * A areia também é uma rampa: longe é mais clara (pega o céu baixo), perto escurece; a marca do
 * vento é um degrau, a sombra são dois, e a areia molhada é o fim dela.
 */
const AREIA = ['#f7ddb0', '#eecc9c', '#e3bb8f', '#d3a887', '#c19889', '#a98683'].map(cor);
/** Degraus de profundidade usados pela areia seca; o resto da rampa é sombra e umidade. */
const DEGRAUS_DA_AREIA = 4;
const MOLHADA = AREIA[4];
const CONCHA = { clara: cor('#fff0e6'), rosa: cor('#ec9aa4'), escura: cor('#b8747e') };

/** A luz da cena vem do sol, baixo e à direita, atrás de tudo: o que encara a câmera fica na sombra. */
const LUZ: P = [0.92, -0.39];

// ---------------------------------------------------------------------------------------------
// A ilha no chão

/** O miolo da ilha e os raios: mais comprida para a frente, que é onde se luta. */
const ILHA = { x: 330, z: 2.2, raio: 500, atras: 1.3, frente: 2.7 };

/** Distância até a beira, em pixels do mundo: negativa na areia, positiva na água. */
function beira(x: number, z: number) {
  const dz = z - ILHA.z;
  const u = (x - ILHA.x) / ILHA.raio;
  const v = dz / (dz > 0 ? ILHA.atras : ILHA.frente);
  const recorte = 0.014 * Math.sin(x * 0.019 + 0.7) + 0.008 * Math.sin(x * 0.061);
  return (Math.hypot(u, v) - 1 + recorte) * ILHA.raio;
}

type Ponto = [number, number];

function dentro(pts: Ponto[], x: number, y: number) {
  let d = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]; const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < xi + ((y - yi) * (xj - xi)) / (yj - yi)) d = !d;
  }
  return d;
}

function distSegmento(px: number, py: number, a: Ponto, b: Ponto) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - a[0] - dx * t, py - a[1] - dy * t);
}

/** O que está em pé na ilha: onde pisa (x do mundo e linha da tela). */
const CASA = { x: 320, y: 146 };
const PALMEIRA = { x: 150, y: 150 };
const TARTARUGA = { x: 690, y: 155 };
const PEDRAS = { x: -30, y: 146 };
/**
 * O guarda-sol fica à direita de onde o segundo lutador começa: em 478, com a câmera no meio, a
 * cúpula listrada caía bem atrás da cabeça dele, e vermelho com branco atrás do cabelo é o pior
 * fundo que uma silhueta pode ter.
 */
const GUARDA_SOL = { x: 548, y: 152 };

/** A profundidade de uma linha da tela: o contrário de `linhaDe`. */
const zDaLinha = (y: number) => (CHAO - HORIZONTE) / (y - HORIZONTE);

/**
 * As sombras vão para a frente e para a esquerda — o sol está atrás e à direita —, compridas de
 * fim de tarde. Medidas no chão (x, z vezes FUNDO), para caírem no mesmo lugar com a câmera
 * em qualquer ponto.
 */
const SOMBRA_CASA: Ponto[] = (() => {
  // o contorno da casa deitado no chão: paredes, beiral e a ponta do telhado
  const z = zDaLinha(CASA.y) * FUNDO;
  const dx = -1.1, dz = -1.55;
  const p = (x: number, alt: number): Ponto => [CASA.x + x + alt * dx, z + alt * dz];
  return [p(-90, 0), p(90, 0), p(90, 110), p(120, 125), p(40, 190), p(40, 230), p(-40, 230), p(-40, 190), p(-120, 125), p(-90, 110)];
})();
const SOMBRA_PALMEIRA = (() => {
  const z = zDaLinha(PALMEIRA.y) * FUNDO;
  const pe: Ponto = [PALMEIRA.x, z];
  const copa: Ponto = [PALMEIRA.x - 290, z - 400];
  return { pe, copa };
})();

/**
 * As pedras chatas que vão da porta até onde se luta. De tudo no chão, é o que mais conta a
 * perspectiva numa imagem parada: do mesmo tamanho no mundo, elas encolhem e se achatam em
 * direção à casa. Cada uma é [x do mundo, profundidade no chão].
 */
const PEDRAS_DA_TRILHA: Ponto[] = (() => {
  const r = sorteio(0x9ed7a);
  const pts: Ponto[] = [];
  const zPorta = zDaLinha(CASA.y) * FUNDO - 16;
  for (let k = 0, z = zPorta - 14; z > 290; k++, z -= 62 + k * 7) {
    const curva = 26 * Math.sin(z / FUNDO * 2.4 - 1.4);
    pts.push([CASA.x + curva + (k % 2 ? 9 : -9) + (r() - 0.5) * 6, z]);
  }
  return pts;
})();
const PEDRA_CHATA = { rx: 17, rz: 22 };
const LAJE = { base: cor('#c9aea6'), luz: cor('#ead3c1'), sombra: cor('#9c8089') };

/** A laje em que o ponto do chão cai: -1 fora; 0 base, 1 borda acesa (a de trás), 2 borda de baixo. */
function naLaje(x: number, zc: number, zcSeguinte: number): number {
  for (const [px, pz] of PEDRAS_DA_TRILHA) {
    const u = (x - px) / PEDRA_CHATA.rx, v = (zc - pz) / PEDRA_CHATA.rz;
    if (u * u + v * v > 1) continue;
    // a linha de baixo da laje: a próxima linha da tela (mais perto) já está fora dela
    const v2 = (zcSeguinte - pz) / PEDRA_CHATA.rz;
    if (u * u + v2 * v2 > 1) return 2;
    if (u * u + v * v > 0.7) return u < 0 ? 2 : 1;
    return v > 0.45 ? 1 : 0;
  }
  return -1;
}

// ---------------------------------------------------------------------------------------------
// O piso, linha por linha

/**
 * A areia mistura as faixas de tom com grão sorteado, e não com o pontilhado ordenado do céu: as
 * linhas do chão deslizam umas sobre as outras quando a câmera anda, e um xadrez de 4x4 viraria
 * listra e voltaria a ser xadrez a cada passo. Grão solto não tem desenho para desmanchar.
 */
function tomDaAreia(px: number, y: number) {
  const cortes = [150, 176, 204];
  let i = 0;
  for (const c of cortes) if (y + (acaso(px, y, 3) - 0.5) * 8 >= c) i++;
  return i;
}

function areia(px: number, y: number, x: number, z: number, d: number, zSeguinte: number): Cor {
  let i = tomDaAreia(px, y);
  const chaoX = x, chaoZ = z * FUNDO;
  // sombra da casa e da palmeira, com a borda em grão
  let sombra = false;
  const grao = acaso(px, y, 9);
  if (dentro(SOMBRA_CASA, chaoX, chaoZ)) sombra = true;
  const dp = distSegmento(chaoX, chaoZ, SOMBRA_PALMEIRA.pe, SOMBRA_PALMEIRA.copa);
  if (dp < 7 + (grao - 0.5) * 3) sombra = true;
  const [cx, cz] = SOMBRA_PALMEIRA.copa;
  if (Math.hypot((chaoX - cx) / 70, (chaoZ - cz) / 55) < 1 + (grao - 0.5) * 0.12) sombra = true;
  const laje = naLaje(chaoX, chaoZ, zSeguinte * FUNDO);
  if (laje >= 0) return laje === 2 ? LAJE.sombra : laje === 1 && !sombra ? LAJE.luz : sombra ? LAJE.sombra : LAJE.base;
  // as marcas do vento na areia: cada uma é a linha escura onde ela cruza a tela e, logo à frente,
  // a clara; e só onde as linhas não se amontoam — perto do horizonte elas virariam listra
  let marca = 0;
  if (z < 2.5) {
    const fase = 0.3 * Math.sin(x * 0.029) + 0.15 * Math.sin(x * 0.083 + 1);
    const a = Math.floor(z * 4.3 + fase), b = Math.floor(zSeguinte * 4.3 + fase);
    const zAnterior = 1 / escala(y - 1);
    const c0 = Math.floor(zAnterior * 4.3 + fase);
    if (a !== b && acaso(Math.floor(x / 17), a, 5) > 0.35) marca = 1;
    else if (c0 !== a && acaso(Math.floor(x / 17), c0, 5) > 0.35 && z < 1.8) marca = -1;
  }
  i = Math.max(0, Math.min(DEGRAUS_DA_AREIA - 1, i + marca));
  let c = AREIA[sombra ? i + 2 : i];
  // a areia molhada, e a espuma que sobe nela
  if (d > -12 - grao * 8) c = MOLHADA;
  if (d > -8) return marcar(c, ESPUMA + 3);
  return c;
}

/**
 * Um traço deitado: o mesmo valor ao longo de `comp` pixels da linha, com o começo sorteado por
 * linha. Água em pixel art é feita de traços, nunca de grão — grão solto na água parece sujeira.
 */
function traco(px: number, y: number, comp: number, canal: number) {
  const desloca = Math.floor(acaso(y, canal, 11) * comp);
  return acaso(Math.floor((px + desloca) / comp), y, canal);
}

/** Onde está a crista de uma linha de cristas: o índice da fase, ou -1 fora dela. */
function crista(px: number, y: number): number {
  if (!CRISTAS.has(y)) return -1;
  const s = escala(y);
  const passo = 5 + Math.round(s * 18);
  const desloca = Math.floor(acaso(y, 0, 13) * passo);
  const celula = Math.floor((px + desloca) / passo);
  if (acaso(celula, y, 4) > 0.6) return -1;
  const tam = Math.max(2, Math.round(passo * (0.3 + acaso(celula, y, 6) * 0.35)));
  const ini = Math.floor(acaso(celula, y, 7) * (passo - tam));
  const dentroDoTraco = px + desloca - celula * passo;
  return dentroDoTraco >= ini && dentroDoTraco < ini + tam ? Math.floor(acaso(celula, y, 8) * 4) : -1;
}

function agua(px: number, y: number, d: number): Cor {
  // de longe para perto, em faixas, e a passagem de uma para a outra em traços
  const t = (y - HORIZONTE - 1) / 38 * (DEGRAUS_DO_MAR - 1);
  const i0 = Math.min(DEGRAUS_DO_MAR - 1, Math.floor(t));
  const perto = i0 + 1 < DEGRAUS_DO_MAR && traco(px, y, 7, 1) < t - i0 ? i0 + 1 : i0;
  const degrau = DEGRAUS_DO_MAR - 1 - perto;
  let base = MAR_RAMPA[degrau];
  // o raso em volta da ilha, também em traços na borda de fora
  if (d < 30) base = RASO_RAMPA[1];
  else if (d < 58 + traco(px, y, 5, 2) * 22) base = RASO_RAMPA[0];
  if (d < 8) return marcar(base, ESPUMA + 2);
  if (d < 17) return marcar(base, ESPUMA + 1);
  if (d < 26) return marcar(base, ESPUMA + 0);
  // a crista acende e apaga; embaixo dela, a sombra da onda fica sempre
  const fase = crista(px, y);
  if (fase >= 0) return marcar(base, CRISTA + fase);
  if (crista(px, y - 1) >= 0 && degrau > 0 && base === MAR_RAMPA[degrau]) return marcar(MAR_RAMPA[degrau - 1], MAR);
  return marcar(base, MAR);
}

/** As linhas que têm crista: juntas no horizonte, espaçadas perto — é a perspectiva da água. */
const CRISTAS = (() => {
  const s = new Set<number>();
  for (let y = HORIZONTE + 2; y < TELA.altura; y += 3 + Math.round(escala(y) * 10)) s.add(y);
  return s;
})();

type Fatia = { y: number; camada: Camada };

function piso(): { fatias: Fatia[]; ultimaMarcada: number } {
  const fatias: Fatia[] = [];
  let ultimaMarcada = HORIZONTE;
  const quadros = new Map<number, Quadro>();
  for (let y = HORIZONTE + 1; y < TELA.altura; y++) {
    const s = escala(y), z = 1 / s;
    const zSeguinte = 1 / escala(y + 1);
    const q = criarQuadro(larguraDaCamada({ largura: MUNDO }, s), 1);
    for (let px = 0; px < q.largura; px++) {
      const x = xDoMundo(px + 0.5, s);
      const d = beira(x, z);
      const c = d > 0 ? agua(px, y, d) : areia(px, y, x, z, d, zSeguinte);
      q.px[px] = c;
      if (c >>> 24 !== 255) ultimaMarcada = Math.max(ultimaMarcada, y);
    }
    quadros.set(y, q);
    fatias.push({ y, camada: { quadro: q, fator: s, y } });
  }
  enfeitarOChao(quadros);
  return { fatias, ultimaMarcada };
}

/**
 * Conchas e estrelas-do-mar: pequenos desenhos deitados no chão, postos no mundo e escritos em
 * cada linha que ocupam, cada linha na posição da sua própria escala. Tamanho pela distância: longe
 * é um pixel, perto é uma concha.
 */
function enfeitarOChao(quadros: Map<number, Quadro>) {
  const escrever = (x: number, y: number, dx: number, c: Cor) => {
    const q = quadros.get(y);
    if (!q) return;
    const px = Math.round(naCamada(x, escala(y))) + dx;
    if (px < 0 || px >= q.largura) return;
    if (q.px[px] >>> 24 !== 255) return; // nada de concha na água
    q.px[px] = c;
  };
  const r = sorteio(0x5eaa);
  for (let n = 0; n < 70; n++) {
    const x = -220 + r() * 1080;
    const z = 0.85 + r() * r() * 2.4;
    const y = linhaDe(z);
    const s = escala(y);
    if (beira(x, z) > -24 || PEDRAS_DA_TRILHA.some(([px, pz]) => Math.abs(px - x) < 30 && Math.abs(pz - z * FUNDO) < 26)) continue;
    const tipo = r();
    if (s > 0.85 && tipo < 0.12) {
      // estrela-do-mar
      const E = CONCHA.rosa, M = CONCHA.escura;
      escrever(x, y - 2, 0, E);
      escrever(x, y - 1, -1, E); escrever(x, y - 1, 0, E); escrever(x, y - 1, 1, E);
      escrever(x, y, -2, E); escrever(x, y, -1, E); escrever(x, y, 0, M); escrever(x, y, 1, E); escrever(x, y, 2, E);
      escrever(x, y + 1, -1, E); escrever(x, y + 1, 1, E);
      escrever(x, y + 2, -2, M); escrever(x, y + 2, 2, M);
    } else if (s > 0.7) {
      // concha em leque: clara em cima, rosada embaixo
      escrever(x, y - 1, 0, CONCHA.clara); escrever(x, y - 1, 1, CONCHA.clara);
      escrever(x, y, -1, CONCHA.clara); escrever(x, y, 0, CONCHA.rosa); escrever(x, y, 1, CONCHA.rosa); escrever(x, y, 2, CONCHA.clara);
      escrever(x, y + 1, 0, CONCHA.escura); escrever(x, y + 1, 1, CONCHA.escura);
    } else if (s > 0.45) {
      escrever(x, y, 0, CONCHA.clara); escrever(x, y, 1, CONCHA.rosa);
    } else {
      escrever(x, y, 0, tipo < 0.5 ? CONCHA.clara : CONCHA.rosa);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// O céu

function ceu(): Quadro {
  const q = criarQuadro(TELA.largura, HORIZONTE + 1);
  degrade(q, 0, HORIZONTE, CEU, 7);
  // o halo do sol: sobe o céu em volta um ou dois degraus da própria paleta, deitado no horizonte,
  // com a passagem estreita como a das faixas — pontilhado largo vira tela de mosquiteiro
  const indice = new Map(CEU.map((c, i) => [c, i]));
  for (let y = 0; y < HORIZONTE; y++) {
    for (let x = 0; x < q.largura; x++) {
      const d = Math.hypot(x - SOL.x, (y - SOL.y) * 2.4);
      if (d > 96) continue;
      const i = indice.get(q.px[y * q.largura + x]) ?? CEU.length - 1;
      const passo = (pontilhar(x, y, (96 - d) / 8) ? 1 : 0) + (pontilhar(x, y, (54 - d) / 7) ? 1 : 0);
      q.px[y * q.largura + x] = CEU[Math.min(CEU.length - 1, i + passo)];
    }
  }
  // o disco, afundando no mar
  for (let y = SOL.y - SOL.r; y < HORIZONTE; y++) {
    for (let x = SOL.x - SOL.r; x <= SOL.x + SOL.r; x++) {
      const d = Math.hypot(x + 0.5 - SOL.x, y + 0.5 - SOL.y);
      if (d <= SOL.r) q.px[y * q.largura + x] = d > SOL.r - 1.6 ? SOL.borda : SOL.miolo;
    }
  }
  // fiapos de nuvem cortando o sol
  const fiapos: [number, number, number][] = [[252, 336, 104], [270, 352, 109], [230, 300, 113]];
  for (const [x0, x1, y] of fiapos) {
    for (let x = x0; x <= x1; x++) {
      const ponta = Math.min(x - x0, x1 - x);
      if (ponta < 3 && (x & 1)) continue;
      q.px[y * q.largura + x] = FAIXA_NO_SOL;
      if (ponta > 8 && ponta < 30) q.px[(y + 1) * q.largura + x] = FAIXA_NO_SOL;
    }
  }
  // a linha do horizonte acesa
  for (let x = 0; x < q.largura; x++) {
    const d = Math.abs(x - SOL.x);
    q.px[HORIZONTE * q.largura + x] = d < 34 ? SOL.borda : CEU[CEU.length - 1];
  }
  return q;
}

/** Ilhas no horizonte, bem apagadas: servem para o mar não parecer uma parede. */
function ilhasLonge(): Camada {
  const fator = 0.03;
  const q = criarQuadro(larguraDaCamada({ largura: MUNDO }, fator), 14);
  const morros: [number, number, number][] = [[40, 30, 6], [66, 16, 3], [168, 12, 3], [352, 40, 8], [388, 18, 4]];
  for (const [cx, rx, alt] of morros) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      const h = Math.round(alt * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2)) * (1 + 0.15 * Math.sin(x * 0.9)));
      for (let k = 0; k < h; k++) pixel(q, x, 13 - k, k === h - 1 ? ILHAS_LONGE.topo : ILHAS_LONGE.corpo);
    }
  }
  // um rochedo em pé na ilha grande, para ela não parecer mais uma nuvem
  for (let k = 0; k < 7; k++) {
    for (let x = 347 + Math.floor(k / 3); x <= 350; x++) pixel(q, x, 13 - 8 - k, k > 4 ? ILHAS_LONGE.topo : ILHAS_LONGE.corpo);
  }
  return { quadro: q, fator, y: HORIZONTE - 14 };
}

// ---------------------------------------------------------------------------------------------
// O que está em pé: casa, guarda-sol, palmeira, tartaruga e pedras

const ret = (x0: number, y0: number, x1: number, y1: number): Forma =>
  ({ tipo: 'poligono', pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
const t4 = (base: string, sombra: string, luz: string | undefined, contorno: string, faixa = 2): Tinta =>
  ({ base: cor(base), sombra: cor(sombra), luz: luz ? cor(luz) : undefined, contorno: cor(contorno), faixa });

const CONTORNO_CASA = '#4a2344';
const T = {
  parede: t4('#ee9fb4', '#c97a98', '#ffd3c4', CONTORNO_CASA, 2),
  telhado: t4('#d63c4c', '#a3294a', '#ff8f6c', CONTORNO_CASA, 2),
  pedra: t4('#a87889', '#80586f', '#d4a39a', CONTORNO_CASA, 1),
  porta: t4('#7a3f55', '#5a2c46', undefined, CONTORNO_CASA, 1),
  moldura: t4('#fbe3d6', '#d9b0b0', undefined, CONTORNO_CASA, 0),
  vidro: t4('#ffd98c', '#f5a868', undefined, CONTORNO_CASA, 2),
  casco: t4('#6d8a4e', '#4d6843', '#b9bb6a', '#2c2a36', 1),
  pele: t4('#b7c47a', '#8a9a62', undefined, '#2c2a36', 1),
  capim: t4('#6f9a52', '#4d7349', '#c9c46a', '#2c3a36', 1),
  tronco: t4('#9a6a58', '#6e4854', '#e2a979', '#3a2238', 2),
  folha: t4('#3f7256', '#2b4e48', '#c7b861', '#1f2a33', 1),
  coco: t4('#6a4046', '#4a2c3c', '#a8705a', '#2a1a2a', 1),
  rocha: t4('#7f6379', '#5c475f', '#c79a93', '#2f2438', 2),
  madeira: t4('#b07d5c', '#7f5452', '#e3ae7c', '#3a2238', 1),
  lona: t4('#fbe8d8', '#d8b4b4', '#ffffff', CONTORNO_CASA, 2),
};
const TELHA = cor('#a3294a');

/** A casa, desenhada de frente. Vista a um terço do tamanho da linha da luta: a porta tem a altura de gente. */
function casa(): Quadro {
  const q = criarQuadro(100, 90);
  const m = new Mascara(q.largura, q.altura);
  const peca = (f: Forma[], t: Tinta) => pintarPeca(q, m, f, t, LUZ);
  // antena da TV, antes de tudo, para o telhado cobrir o pé dela
  const antena = cor(CONTORNO_CASA);
  linha(q, 62, 1, 62, 12, antena);
  linha(q, 58, 3, 66, 3, antena);
  linha(q, 59, 6, 65, 6, antena);
  // andar de cima e o telhado dele
  peca([ret(32, 18, 68, 40)], T.parede);
  retangulo(q, 33, 22, 35, 2, T.parede.sombra); // a sombra do beiral na parede
  peca([{ tipo: 'elipse', c: [41, 29], rx: 4.6, ry: 4.6 }], T.moldura);
  peca([{ tipo: 'elipse', c: [41, 29], rx: 3.1, ry: 3.1 }], { ...T.vidro, semContorno: true, faixa: 1 });
  linha(q, 41, 26, 41, 32, T.moldura.base); linha(q, 38, 29, 44, 29, T.moldura.base);
  // o emblema da casa é um casco de tartaruga, e não o nome escrito
  desenharCasco(q, 52, 25);
  peca([ret(26, 20, 74, 21), { tipo: 'poligono', pts: [[25, 21], [75, 21], [59, 7], [41, 7]] }], T.telhado);
  for (let y = 11; y <= 19; y += 3) {
    const recuo = (y - 7) * 16 / 14;
    linha(q, 42 - recuo + 2, y, 58 + recuo - 2, y, TELHA);
  }
  // térreo
  peca([ret(19, 84, 81, 90)], T.pedra);
  for (let x = 23; x < 80; x += 7) pixel(q, x, 86, T.pedra.sombra);
  peca([ret(21, 46, 79, 84)], T.parede);
  retangulo(q, 22, 49, 57, 2, T.parede.sombra);
  // janelas com luz acesa lá dentro
  for (const x of [26, 62]) {
    peca([ret(x, 55, x + 12, 68)], T.moldura);
    peca([ret(x + 1, 56, x + 11, 67)], { ...T.vidro, semContorno: true });
    linha(q, x + 6, 56, x + 6, 66, T.moldura.base);
    linha(q, x + 1, 61, x + 10, 61, T.moldura.base);
    peca([ret(x - 1, 68, x + 13, 70)], T.moldura);
  }
  // porta com toldo e degraus
  peca([ret(43, 58, 57, 84)], T.moldura);
  peca([ret(45, 60, 55, 84)], T.porta);
  pixel(q, 53, 72, T.vidro.base);
  peca([{ tipo: 'poligono', pts: [[40, 59], [60, 59], [57, 54], [43, 54]] }], T.telhado);
  peca([ret(42, 84, 58, 87), ret(40, 87, 60, 90)], T.pedra);
  // telhado do térreo, por cima do pé do andar de cima
  peca([{ tipo: 'poligono', pts: [[12, 48], [88, 48], [72, 34], [28, 34]] }], T.telhado);
  for (let y = 37; y <= 46; y += 3) {
    const recuo = (y - 34) * 16 / 14;
    linha(q, 28 - recuo + 2, y, 72 + recuo - 2, y, TELHA);
  }
  // capim na base
  const capim = (x: number, lado: number) => peca([
    { tipo: 'poligono', pts: [[x - 4, 90], [x - 3 * lado, 82], [x - 1, 88], [x + 1, 80], [x + 2, 88], [x + 4 * lado, 83], [x + 5, 90]] },
  ], T.capim);
  capim(15, 1); capim(86, -1); capim(64, 1);
  return q;
}

/** O casco do emblema, à mão: a 11 pixels, casco feito de elipse virava repolho. */
function desenharCasco(q: Quadro, x: number, y: number) {
  const desenho = [
    '...ooooo...',
    '.ooaaoaaoo.',
    'oaaoobooaao',
    'oaaobbboaao',
    'oaaoobooaao',
    '.ooaaoaaoo.',
    '...ooooo...',
  ];
  const cores: Record<string, Cor> = { o: cor(CONTORNO_CASA), a: cor('#7f9d55'), b: cor('#c2c46e') };
  desenho.forEach((l, dy) => [...l].forEach((ch, dx) => { if (cores[ch]) pixel(q, x + dx, y + dy, cores[ch]); }));
}

/** A janela da direita pisca a luz azul de uma TV ligada — o velho mestre está em casa. */
const TV = {
  x0: 63, y0: 56, x1: 73, y1: 67,
  /** [luz, sombra] de cada momento da tela: a sombra do vidro continua sombra. */
  cores: [['#a9d6ff', '#7aa6e0'], ['#7eb4f2', '#5a86c8'], ['#c8e6ff', '#96c0ea'], ['#90c4fa', '#6898d6']].map(([a, b]) => [cor(a), cor(b)]),
};

/** A curva do tronco: da base, inclinada para longe da casa. */
function pontoDoTronco(t: number): P {
  const base: P = [40, 108], topo: P = [10, 18], ctrl: P = [42, 58];
  const a = 1 - t;
  return [a * a * base[0] + 2 * a * t * ctrl[0] + t * t * topo[0], a * a * base[1] + 2 * a * t * ctrl[1] + t * t * topo[1]];
}

function tronco(): Quadro {
  const q = criarQuadro(64, 112);
  const m = new Mascara(q.largura, q.altura);
  const formas: Forma[] = [];
  const N = 14;
  for (let i = 0; i < N; i++) {
    const a = pontoDoTronco(i / N), b = pontoDoTronco((i + 1) / N);
    formas.push({ tipo: 'capsula', a, b, ra: 4.2 - 1.8 * (i / N), rb: 4.2 - 1.8 * ((i + 1) / N) });
  }
  pintarPeca(q, m, formas, T.tronco, LUZ);
  // os anéis do tronco
  for (let t = 0.05; t < 0.97; t += 0.055) {
    const [x, y] = pontoDoTronco(t);
    const [x2, y2] = pontoDoTronco(t + 0.01);
    const dx = x2 - x, dy = y2 - y, d = Math.hypot(dx, dy);
    const nx = -dy / d, ny = dx / d;
    const r = 3.6 - 1.6 * t;
    linha(q, x - nx * r, y - ny * r + 1, x + nx * (r - 1), y + ny * (r - 1) + 1, T.tronco.sombra);
  }
  return q;
}

/**
 * A copa em três quadros de balanço. A copa não vai nas camadas: balançando, cada quadro deixaria
 * no céu o resto do anterior; ela é colada inteira por `animar`, que roda depois de tudo.
 */
function copa(balanco: number): Quadro {
  const q = criarQuadro(96, 64);
  const m = new Mascara(q.largura, q.altura);
  const topo: P = [48, 22];
  const folhas: [number, number, number][] = [
    // ângulo (graus, 0 para a direita, positivo para cima), comprimento, caimento
    [160, 36, 0.5], [128, 28, 0.3], [95, 20, 0.15], [58, 26, 0.3], [22, 36, 0.5], [-8, 34, 0.75], [-40, 22, 0.8], [196, 30, 0.8], [230, 20, 0.8],
  ];
  const ordem = [...folhas].sort((a, b) => Math.sin(b[0] * Math.PI / 180) - Math.sin(a[0] * Math.PI / 180));
  for (const [ang0, comp, cai] of ordem) {
    const ang = (ang0 + balanco * (Math.cos(ang0 * Math.PI / 180) > 0 ? 1 : -1) * 4) * Math.PI / 180;
    const ponto = (t: number): P => [
      topo[0] + Math.cos(ang) * comp * t,
      topo[1] - Math.sin(ang) * comp * t + cai * comp * t * t + balanco * 1.4 * t * t,
    ];
    const formas: Forma[] = [];
    const N = 7;
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const a = ponto(t0), b = ponto(t1);
      formas.push({ tipo: 'capsula', a, b, ra: 2.4 * (1 - t0) + 0.5, rb: 2.4 * (1 - t1) + 0.5 });
      // folíolos: dentes para baixo dos dois lados, o que faz a folha virar folha de palmeira
      if (i > 0) {
        const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
        const nx = -dy / d, ny = dx / d;
        const larg = 5.5 * (1 - t0 * 0.7);
        for (const lado of [1, -1]) {
          const ponta: P = [a[0] + nx * larg * lado + dx * 0.8, a[1] + ny * larg * lado + Math.abs(ny * larg) * 0.2 + 2.5];
          formas.push({ tipo: 'poligono', pts: [a, b, ponta] });
        }
      }
    }
    pintarPeca(q, m, formas, T.folha, LUZ);
  }
  pintarPeca(q, m, [{ tipo: 'elipse', c: [45, 25], rx: 2.6, ry: 2.6 }, { tipo: 'elipse', c: [50, 26], rx: 2.6, ry: 2.6 }], T.coco, LUZ);
  pintarPeca(q, m, [{ tipo: 'elipse', c: [47, 28], rx: 2.6, ry: 2.6 }], T.coco, LUZ);
  return q;
}

/** A tartaruga que dá nome à ilha, a caminho da água. Casco para a câmera, cabeça para o mar. */
function tartaruga(): Quadro {
  const q = criarQuadro(34, 14);
  const m = new Mascara(q.largura, q.altura);
  const peca = (f: Forma[], t: Tinta) => pintarPeca(q, m, f, t, LUZ);
  peca([{ tipo: 'elipse', c: [9, 11], rx: 3.5, ry: 1.6, ang: -20 }, { tipo: 'elipse', c: [23, 11], rx: 3.5, ry: 1.6, ang: 20 }], T.pele);
  peca([{ tipo: 'elipse', c: [28, 8], rx: 3.2, ry: 2.5 }, { tipo: 'capsula', a: [24, 9], b: [27, 8], ra: 1.8, rb: 1.8 }], T.pele);
  pixel(q, 29, 7, cor('#2c2a36'));
  peca([{ tipo: 'elipse', c: [16, 8], rx: 10.5, ry: 5.2 }], T.casco);
  const risco = T.casco.sombra;
  linha(q, 12, 5, 11, 10, risco); linha(q, 20, 5, 21, 10, risco); linha(q, 12, 7, 20, 7, risco);
  return q;
}

function pedras(): Quadro {
  const q = criarQuadro(44, 20);
  const m = new Mascara(q.largura, q.altura);
  pintarPeca(q, m, [{ tipo: 'poligono', pts: [[3, 19], [6, 8], [13, 3], [20, 6], [24, 19]] }], T.rocha, LUZ);
  pintarPeca(q, m, [{ tipo: 'poligono', pts: [[18, 19], [22, 11], [30, 9], [36, 13], [39, 19]] }], T.rocha, LUZ);
  pintarPeca(q, m, [{ tipo: 'poligono', pts: [[30, 19], [33, 15], [38, 15], [42, 19]] }], T.rocha, LUZ);
  return q;
}

/** O guarda-sol listrado e a espreguiçadeira do velho mestre, virada para o pôr do sol. */
function guardaSol(): Quadro {
  const q = criarQuadro(48, 42);
  const m = new Mascara(q.largura, q.altura);
  const peca = (f: Forma[], t: Tinta) => pintarPeca(q, m, f, t, LUZ);
  // espreguiçadeira: pés, assento comprido e o encosto inclinado
  peca([ret(23, 36, 25, 41), ret(40, 37, 42, 41)], T.madeira);
  peca([{ tipo: 'poligono', pts: [[22, 34], [44, 36], [44, 38], [22, 37]] }, { tipo: 'poligono', pts: [[21, 37], [16, 27], [19, 26], [25, 35]] }], T.madeira);
  peca([{ tipo: 'poligono', pts: [[24, 34], [43, 36], [43, 37], [24, 36]] }, { tipo: 'poligono', pts: [[22, 35], [18, 28], [19, 27.5], [23.5, 34]] }], { ...T.lona, semContorno: true });
  // o cabo, cravado na areia e um pouco torto
  peca([{ tipo: 'capsula', a: [14, 41], b: [19, 9], ra: 1, rb: 1 }], T.madeira);
  // a cúpula: primeiro inteira, depois as listras trocando a tinta gomo por gomo
  const topo: P = [19.5, 7];
  peca([{ tipo: 'poligono', pts: [[3, 17], [7, 11], [13, 8], [19.5, 6.5], [27, 8], [33, 12], [36, 18], [31, 16.5], [25, 17.5], [19.5, 16.5], [13, 17.5], [8, 16.5]] }], T.telhado);
  const troca = new Map<Cor, Cor>([[T.telhado.base, T.lona.base], [T.telhado.sombra, T.lona.sombra], [T.telhado.luz!, T.lona.luz!]]);
  for (let y = 0; y < q.altura; y++) {
    for (let x = 0; x < q.largura; x++) {
      const i = y * q.largura + x;
      const nova = troca.get(q.px[i]);
      if (nova === undefined) continue;
      const gomo = Math.floor((Math.atan2(x + 0.5 - topo[0], (y + 0.5 - topo[1]) * 2.2) + Math.PI) / (Math.PI / 6));
      if (gomo % 2 === 0) q.px[i] = nova;
    }
  }
  pixel(q, 19, 5, cor(CONTORNO_CASA)); pixel(q, 19, 4, T.madeira.base);
  return q;
}

/** Uma coisa em pé vira camada no fator da linha em que pisa, já na posição do mundo. */
function emPe(sprite: Quadro, x: number, yChao: number, pe: P): Fatia {
  const s = escala(yChao);
  const px = Math.round(naCamada(x, s) - pe[0]);
  const q = criarQuadro(Math.max(1, px + sprite.largura), sprite.altura);
  colar(q, sprite, px, 0);
  return { y: yChao, camada: { quadro: q, fator: s, y: yChao - pe[1] } };
}

// ---------------------------------------------------------------------------------------------
// O que se mexe: nuvens, gaivotas, TV, copa, brilho e ondas

/** Quanto mais baixa, mais acesa: a nuvem de cima já está no roxo, a de perto do sol ainda pega luz. */
const NUVENS = [
  ['#6a3278', '#9c4680', '#d8657c', '#ffa586'],
  ['#8a3f7c', '#bd5680', '#ee8480', '#ffc39a'],
  ['#b85480', '#e27a82', '#ffab8c', '#ffe0b0'],
].map((p) => p.map(cor));

/**
 * Nuvem de fim de tarde: bolhas sobre uma base reta, acesas por baixo e pela direita — o sol já
 * está abaixo delas. A luz segue a diagonal até o sol, e não só a linha de baixo, senão cada nuvem
 * vira uma tira com a borda pintada.
 */
function nuvem(r: () => number, comprimento: number, altura: number, tons: Cor[]): Quadro {
  const q = criarQuadro(comprimento + 32, altura + 2);
  const cheio = new Uint8Array(q.largura * q.altura);
  const base = altura;
  const marcarElipse = (cx: number, rx: number, ry: number) => {
    for (let y = 0; y <= base; y++) {
      for (let x = 0; x < q.largura; x++) {
        const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - base) / ry;
        if (u * u + v * v <= 1) cheio[y * q.largura + x] = 1;
      }
    }
  };
  const bolhas = Math.round(comprimento / 13) + 2;
  for (let b = 0; b < bolhas; b++) {
    const t = b / (bolhas - 1);
    const alto = altura * (0.3 + 0.7 * Math.sin(Math.PI * (0.08 + 0.84 * t))) * (0.65 + r() * 0.35);
    marcarElipse(16 + comprimento * t + (r() - 0.5) * 6, Math.min(15, alto * (1.2 + r() * 0.7)), alto);
  }
  // O pé comprido e fino, que é o que faz a nuvem parecer deitada no vento — mas sem passar muito
  // das bolhas: comprido demais, ele virava um risco aceso de régua atravessando o céu, com um
  // gancho na ponta onde a luz da diagonal pegava.
  marcarElipse(16 + comprimento / 2 + comprimento * 0.04, comprimento * 0.46, 1.8);
  const tem = (x: number, y: number) => x >= 0 && y >= 0 && x < q.largura && y < q.altura && cheio[y * q.largura + x] === 1;
  for (let y = 0; y < q.altura; y++) {
    for (let x = 0; x < q.largura; x++) {
      if (!tem(x, y)) continue;
      let c = tons[1];
      if (!tem(x, y + 1) || !tem(x + 2, y + 1)) c = tons[3];
      else if (!tem(x + 3, y + 2) || !tem(x + 1, y + 2) || !tem(x + 5, y + 3)) c = tons[2];
      else if (!tem(x - 1, y - 1) || !tem(x, y - 1)) c = tons[0];
      q.px[y * q.largura + x] = c;
    }
  }
  return q;
}

/** Gaivota de cinco pixels: asa em cima, asa reta, asa embaixo. */
const GAIVOTA = [
  ['x...x', '.x.x.', '..x..'],
  ['.....', 'xx.xx', '..x..'],
  ['.....', '.xxx.', 'x.x.x'],
].map((linhas) => {
  const q = criarQuadro(5, 3);
  linhas.forEach((l, y) => [...l].forEach((ch, x) => { if (ch === 'x') q.px[y * 5 + x] = cor('#3a2350'); }));
  return q;
});

/** O rastro do sol no mar em quatro quadros: traços que acendem e apagam, mais largos perto. */
function brilhos(): Quadro[] {
  const alt = 34, larg = 48;
  return [0, 1, 2, 3].map((f) => {
    const q = criarQuadro(larg, alt);
    for (let y = 0; y < alt; y++) {
      const meia = 1.5 + y * 0.6;
      for (let x = 0; x < larg; x++) {
        const dx = Math.abs(x + 0.5 - larg / 2);
        if (dx > meia) continue;
        const celula = Math.floor((x + (y % 2)) / 2);
        const chance = 0.7 * (1 - dx / meia) * (1 - y / alt * 0.5);
        if (acaso(celula, y, 20 + f) < chance) q.px[y * larg + x] = acaso(celula, y, 40 + f) < 0.45 && dx < meia * 0.5 ? BRILHO[0] : BRILHO[1];
      }
    }
    return q;
  });
}

/** Cola o brilho só onde há mar marcado — por cima da casa ou da ilha, ele não existe. */
function brilharNoMar(q: Quadro, b: Quadro, x0: number, y0: number) {
  for (let y = 0; y < b.altura; y++) {
    const yy = y0 + y;
    if (yy < 0 || yy >= q.altura) continue;
    for (let x = 0; x < b.largura; x++) {
      const c = b.px[y * b.largura + x];
      const xx = x0 + x;
      if (c === 0 || xx < 0 || xx >= q.largura) continue;
      const tipo = 255 - (q.px[yy * q.largura + xx] >>> 24);
      if (tipo >= MAR && tipo < ESPUMA) q.px[yy * q.largura + xx] = c;
    }
  }
}

/** A onda que sobe na areia: longe, mais perto, na beira, em cima da areia, recuando e calma. */
const ONDA_NA_PRAIA = [0, 1, 2, 3, 3, 2, -1, -1, -1, -1];

export function cenarioIlha(): Cenario {
  const r = sorteio(0x11ba);
  const { fatias, ultimaMarcada } = piso();
  const sCasa = escala(CASA.y);
  const casaQ = casa();
  const pe: P = [50, 89];
  const objetos: Fatia[] = [
    emPe(pedras(), PEDRAS.x, PEDRAS.y, [22, 19]),
    emPe(casaQ, CASA.x, CASA.y, pe),
    emPe(guardaSol(), GUARDA_SOL.x, GUARDA_SOL.y, [14, 41]),
    emPe(tronco(), PALMEIRA.x, PALMEIRA.y, [40, 111]),
    emPe(tartaruga(), TARTARUGA.x, TARTARUGA.y, [16, 13]),
  ];
  // cada coisa em pé entra logo depois da linha em que pisa: o chão atrás dela vem antes, o da frente depois
  const camadas: Camada[] = [{ quadro: ceu(), fator: 0 }, ilhasLonge()];
  for (const f of fatias) {
    camadas.push(f.camada);
    for (const o of objetos) if (o.y === f.y) camadas.push(o.camada);
  }

  const xCasa = Math.round(naCamada(CASA.x, sCasa) - pe[0]);
  const yCasa = CASA.y - pe[1];
  const sPalmeira = escala(PALMEIRA.y);
  const topoDoTronco = pontoDoTronco(1);
  const xCopa = Math.round(naCamada(PALMEIRA.x, sPalmeira) - 40 + topoDoTronco[0] - 48);
  const yCopa = Math.round(PALMEIRA.y - 111 + topoDoTronco[1] - 22);
  const copas = [copa(0), copa(1), copa(-1)];
  const brilho = brilhos();
  const nuvens = [
    // todas acima da ponta da antena (linha 57): nuvem que anda passaria por cima da casa
    { q: nuvem(r, 150, 13, NUVENS[0]), x: 236, y: 4, fator: 0.008 },
    { q: nuvem(r, 110, 11, NUVENS[1]), x: 0, y: 17, fator: 0.012 },
    { q: nuvem(r, 70, 8, NUVENS[2]), x: 150, y: 38, fator: 0.02 },
    { q: nuvem(r, 48, 6, NUVENS[2]), x: 330, y: 46, fator: 0.025 },
  ];
  // gaivotas acima da ponta da antena, como as nuvens: passando pelo telhado, viravam risco na casa
  const gaivotas = [
    { x: 40, y: 50, v: 0.11, fase: 0 },
    { x: 180, y: 30, v: 0.09, fase: 17 },
    { x: 230, y: 42, v: 0.13, fase: 31 },
  ];

  return {
    id: 'ilha',
    nome: 'Ilha da Tartaruga',
    largura: MUNDO,
    camadas,
    clarao: cor('#ffe6b8'),
    animar(q, camX, tique) {
      // 1. o rastro do sol, antes de desfazer as marcas: é por elas que ele sabe onde é mar
      brilharNoMar(q, brilho[Math.floor(tique / 14) % brilho.length], SOL.x - 24, HORIZONTE + 1);
      // 2. ondas e espuma: cada pixel marcado vira a cor do momento e perde a marca
      const faseCrista = Math.floor(tique / 18) % 4;
      const faseEspuma = ONDA_NA_PRAIA[Math.floor(tique / 10) % ONDA_NA_PRAIA.length];
      const W = q.largura;
      for (let y = HORIZONTE + 1; y <= ultimaMarcada; y++) {
        for (let i = y * W, fim = i + W; i < fim; i++) {
          const c = q.px[i];
          const alfa = c >>> 24;
          if (alfa === 255) continue;
          const tipo = 255 - alfa;
          const base = opaca(c);
          if (tipo >= ESPUMA) q.px[i] = tipo - ESPUMA === faseEspuma ? ESPUMA_COR : base;
          else if (tipo >= CRISTA && (tipo - CRISTA === faseCrista || tipo - CRISTA === (faseCrista + 1) % 4)) q.px[i] = CLARO.get(base) ?? base;
          else q.px[i] = base;
        }
      }
      // 3. nuvens andando devagar, um pixel a cada dois segundos e meio
      for (const n of nuvens) {
        const volta = TELA.largura + n.q.largura;
        const x = ((((n.x + Math.floor(tique / 150) - Math.round(camX * n.fator)) % volta) + volta) % volta) - n.q.largura;
        colar(q, n.q, x, n.y);
      }
      // 4. a TV do velho mestre
      const [tvLuz, tvSombra] = TV.cores[acaso(Math.floor(tique / 11), 0, 50) < 0.5 ? Math.floor(tique / 23) % 2 : 2 + (Math.floor(tique / 7) % 2)];
      const xc = xCasa - Math.round(camX * sCasa);
      for (let y = TV.y0; y <= TV.y1; y++) {
        for (let x = TV.x0; x <= TV.x1; x++) {
          if (xc + x < 0 || xc + x >= W) continue;
          const i = (yCasa + y) * W + xc + x;
          const c = q.px[i];
          if (c === T.vidro.base) q.px[i] = tvLuz;
          else if (c === T.vidro.sombra) q.px[i] = tvSombra;
        }
      }
      // 5. a copa da palmeira balançando: 0, 1, 0, -1
      const quadroCopa = [0, 1, 0, 2][Math.floor(tique / 28) % 4];
      colar(q, copas[quadroCopa], xCopa - Math.round(camX * sPalmeira), yCopa);
      // 6. gaivotas
      for (const g of gaivotas) {
        const volta = TELA.largura + 20;
        const x = ((Math.round(g.x + tique * g.v - camX * 0.15) % volta) + volta) % volta - 10;
        const y = g.y + [0, 0, 1, 1, 1, 0][Math.floor((tique + g.fase) / 20) % 6];
        const asa = [0, 1, 2, 1, 0, 1, 2, 1, 1, 1, 1, 1][Math.floor((tique + g.fase) / 8) % 12];
        colar(q, GAIVOTA[asa], x, y);
      }
    },
  };
}

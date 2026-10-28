/**
 * O desenho da Garagem, em pixel: a cena inteira num canvas de 320×180 ampliado sem suavizar, e por
 * cima, na resolução da tela, o que tem de ler bem — os nomes, os letreiros, a legenda do parabéns, o
 * telão na festa — e a luz (o escuro com buracos onde há lâmpada, vela, farol e tela de fliperama).
 *
 * A sala é a da prancheta que o dono aprovou em 26/10/2026 — a parede de tijolo, o varal de luz, o
 * telão, o isopor, a mesa de salgados e o chão xadrez — e o que muda com o tema (os quadros, as duas
 * peças grandes, o vídeo do telão, o bolo e a roupa de festa) vem do `temasDaGaragem.ts`. Os dois
 * fliperamas, o bebedouro e a comida são de toda garagem, em qualquer tema.
 *
 * Quem anda e quando é do `garagem.ts`; aqui só se olha para ele e se pinta, e se guardam os efeitos
 * que não interessam a ninguém mais: confete, fumaça, as notinhas, o "glup!", a peça tremendo.
 */
import {
  ALTURA, APAGAO, BALCOES, FLIPERAMAS, LARGURA, MESA, ROTEIRO, TONTO,
  legendaEm, nomesNoTelao, novoBoneco,
  type Aparencia, type Boneco, type Comida, type Garagem, type Lado, type Ocorrencia, type Ponto, type Tema,
} from './garagem';
import { COMIDAS } from './garagem';
import { TEMA, TELA, mistura, trajeDe, type AcaoDaPeca, type Pincel, type Rotulo } from './temasDaGaragem';

const W = LARGURA, H = ALTURA;
const COR = {
  laranja: '#f28c28', preto: '#1d1d22', vermelho: '#d7263d', branco: '#f2f2f2',
  madeira: '#7a5232', madeira2: '#5a3a22', ambar: '#e8a33a', coxinha: '#d98a2b',
};
/**
 * Duas letras. A de pixel (Pixelify Sans) só nas palavras grandes que nós escrevemos e conferimos:
 * "PARABÉNS" no telão e "Você apagou!". Todo o resto — os nomes, os letreiros, a legenda, os gritos —
 * vai na Figtree, a letra da Saga: na Pixelify o "C" maiúsculo é um "O" com um entalhe e o "G" quase
 * um "B", e em tamanho de nome não há como separá-los (medido em 27/10/2026, pixel a pixel, de 8 a
 * 40 px: o "C" e o "O" diferem em 1 a 19 pixels, em qualquer peso). O Gustavo aparecia como
 * "Bustavo" em cima do boneco.
 */
const PIXEL = '"Pixelify Sans", Figtree, sans-serif';
const TEXTO = 'Figtree, sans-serif';
const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const volta = (v: number, n: number) => ((v % n) + n) % n;
const hex = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
const yVaral = (x: number) => 14 + 7 * (1 - ((x - 160) / 160) ** 2);
const LAMPADAS = Array.from({ length: 23 }, (_, i) => {
  const x = 7 + i * 14;
  return { x, y: yVaral(x) + 2, cor: ['#ffd27a', '#ff8a5c', '#ff5d8f', '#7ec8ff', '#9bff9b'][i % 5] };
});
/** As cores de cada fliperama: o corpo, a arte do lado e o letreiro aceso. */
const GABINETES = [
  { corpo: '#2a1446', arte: '#ff4fd8', letreiro: '#ff2e88', tela: '#ff9be8' },
  { corpo: '#0e2440', arte: '#3ad1ff', letreiro: '#0090e0', tela: '#9be8ff' },
];

type Particula = { tipo: 'confete' | 'fumaca' | 'brilho' | 'faisca'; cor: string; x: number; y: number; vx: number; vy: number; vida: number; tam: number; chao: number; fase: number };
type Texto = { texto: string; x: number; y: number; vy: number; vida: number; cor: string; tam: number };

export type Desenho = {
  redimensionar(): void;
  desenhar(g: Garagem, dt: number, luzes: boolean): void;
  ocorreu(o: Ocorrencia): void;
  /** Clicou na peça do tema: treme, solta fumaça e grita. Nulo se ela já estava tremendo. */
  acelerar(lado: Lado, tema: Tema): AcaoDaPeca | null;
  /** O ponto da cena (320×180) debaixo do mouse. */
  pontoDe(e: { clientX: number; clientY: number }): Ponto;
};

/** A comida na mão, perto da boca. */
function naMao(px: (x: number, y: number, w: number, h: number, c: string) => void, comida: Comida, x: number, y: number) {
  switch (comida) {
    case 'cerveja': px(x + 8, y + 4, 2, 3, COR.ambar); px(x + 8, y + 4, 2, 1, '#fff6df'); break;
    case 'refri': px(x + 8, y + 4, 2, 3, '#d7263d'); px(x + 8, y + 4, 2, 1, '#cfd6df'); break;
    case 'suco': px(x + 8, y + 4, 2, 3, '#ff9f2e'); px(x + 8, y + 4, 2, 1, '#ffd27a'); break;
    case 'agua': px(x + 8, y + 3, 2, 4, '#9fd8ff'); px(x + 8, y + 3, 2, 1, '#3a6fd1'); break;
    case 'pizza': px(x + 8, y + 4, 3, 1, '#c8853a'); px(x + 8, y + 5, 3, 1, '#f2b544'); px(x + 8, y + 6, 2, 1, '#f2b544'); px(x + 9, y + 5, 1, 1, '#b8322a'); break;
    case 'pastel': px(x + 8, y + 5, 3, 2, '#e8c27a'); px(x + 8, y + 5, 3, 1, '#d9a85a'); break;
    case 'cachorro': px(x + 7, y + 5, 4, 2, '#d9a05a'); px(x + 7, y + 5, 4, 1, '#b8322a'); break;
    case 'brigadeiro': px(x + 8, y + 5, 2, 2, '#4a2a1a'); px(x + 8, y + 5, 1, 1, '#a0613a'); break;
    case 'bolo': px(x + 8, y + 4, 3, 3, '#f4efe6'); px(x + 8, y + 5, 3, 1, '#ff8cc0'); break;
    default: px(x + 8, y + 5, 2, 2, COR.coxinha); px(x + 8, y + 4, 1, 1, COR.coxinha);
  }
}

/** Um boneco em pé, com os pés em (x0, y0), em qualquer contexto: a cena, o rascunho do deitado e o retrato. */
function pintarEmPe(ctx: CanvasRenderingContext2D, b: Boneco, x0: number, y0: number, relogio: number) {
  const px = (x: number, y: number, w: number, h: number, cor: string) => { ctx.fillStyle = cor; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const a = b.aparencia;
  const tr = a.roupa ? trajeDe(a.roupa) : null;
  const calca = tr?.calca ?? a.calca, bota = tr?.bota ?? '#18181c', camisa = tr?.camisa ?? a.camisa, manga = tr?.manga ?? camisa;
  const tonto = b.cheio >= TONTO && b.andando ? Math.round(Math.sin(relogio * 7 + b.id) * 1.2) : 0;
  const x = Math.round(x0) - 5 + tonto;
  const y = Math.round(y0) - 20 - (b.pulo ? 1 : 0);
  const passo = b.andando ? Math.floor(relogio * 8 + b.id) % 2 : -1;
  px(x + 2, y + 14, 2, passo === 0 ? 4 : 5, calca);
  px(x + 6, y + 14, 2, passo === 1 ? 4 : 5, calca);
  px(x + 2, y + (passo === 0 ? 17 : 18), 2, 1, bota);
  px(x + 6, y + (passo === 1 ? 17 : 18), 2, 1, bota);
  if (tr?.botaAlta) { px(x + 2, y + 16, 2, 2, bota); px(x + 6, y + 16, 2, 2, bota); }
  px(x + 1, y + 8, 8, 7, camisa);
  tr?.corpo?.(px, x, y, b.dir, relogio);
  const naBoca = !!b.acao && b.acao.t < 0.8;
  if (b.bracos) {
    px(x, y + 4, 1, 6, manga); px(x + 9, y + 4, 1, 6, manga);
    px(x, y + 3, 1, 1, a.pele); px(x + 9, y + 3, 1, 1, a.pele);
  } else {
    px(x, y + 9, 1, 5, manga); px(x, y + 14, 1, 1, a.pele);
    if (naBoca) px(x + 9, y + 7, 1, 4, manga); else { px(x + 9, y + 9, 1, 5, manga); px(x + 9, y + 14, 1, 1, a.pele); }
  }
  px(x + 1, y + 1, 8, 7, a.pele);
  const topo = tr?.topo ?? a.cabelo;
  if (b.dir === 'cima') {
    px(x + 1, y, 8, 7, a.cabelo); px(x + 1, y, 8, 2, topo);
  } else {
    px(x + 1, y, 8, 2, topo);
    const olhoY = y + 4;
    if (b.dir === 'baixo') {
      px(x + 1, y + 2, 1, 2, a.cabelo); px(x + 8, y + 2, 1, 2, a.cabelo);
      if (tr?.oculos) { px(x + 2, olhoY - 1, 6, 2, '#0e0e10'); px(x + 3, olhoY - 1, 1, 1, '#4a4a55'); }
      else if (b.cheio >= 4) {
        px(x + 3, olhoY + 1, 1, 1, '#1a1a1a'); px(x + 6, olhoY + 1, 1, 1, '#1a1a1a');
        px(x + 2, olhoY + 2, 1, 1, '#e88a8a'); px(x + 7, olhoY + 2, 1, 1, '#e88a8a');
      } else { px(x + 3, olhoY, 1, 2, '#1a1a1a'); px(x + 6, olhoY, 1, 2, '#1a1a1a'); }
    } else {
      const frente = b.dir === 'dir';
      px(frente ? x + 1 : x + 5, y + 2, 4, 3, a.cabelo);
      if (tr?.oculos) px(frente ? x + 5 : x + 1, olhoY - 1, 4, 2, '#0e0e10');
      else px(frente ? x + 7 : x + 2, olhoY, 1, 2, '#1a1a1a');
    }
    if (tr?.barba) px(x + 2, y + 6, 6, 2, '#3a2418');
    if (b.boca) px(x + 4, y + 6, 2, 1, '#6e1f24');
  }
  tr?.cabeca?.(px, x, y, b.dir, relogio);
  if (naBoca && !b.bracos && b.acao) naMao(px, b.acao.comida, x, y);
  if (b.chapeu) {
    if (a.roupa) {
      // quem faz aniversário ganha coroa, e não o chapéu de todo mundo
      px(x + 2, y - 3, 6, 2, '#f2c230'); px(x + 2, y - 5, 1, 2, '#f2c230'); px(x + 4, y - 6, 2, 3, '#f2c230'); px(x + 7, y - 5, 1, 2, '#f2c230');
      px(x + 4, y - 3, 2, 1, '#d7263d'); px(x + 2, y - 2, 6, 1, '#c9962a');
    } else {
      const cores = [['#3f7fe0', '#ffd27a'], ['#2ea36a', '#ffffff'], ['#a855f7', '#ffd27a'], [COR.laranja, COR.preto], [COR.vermelho, COR.branco]];
      const [c1, c2] = cores[b.id % cores.length];
      px(x + 4, y - 6, 2, 1, '#ffffff');
      px(x + 4, y - 5, 2, 1, c1); px(x + 3, y - 4, 4, 1, c2); px(x + 3, y - 3, 4, 1, c1);
      px(x + 2, y - 2, 6, 1, c2); px(x + 2, y - 1, 6, 1, c1);
    }
  }
}

/** O retrato de um boneco parado, de frente: 14×30, ampliado sem suavizar pelo CSS. */
export function pintarRetrato(canvas: HTMLCanvasElement, aparencia: Aparencia, id: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = 14; canvas.height = 30;
  ctx.clearRect(0, 0, 14, 30);
  pintarEmPe(ctx, { ...novoBoneco(id, '', { x: 7, y: 28 }), aparencia }, 7, 28, 0);
}

export function criarDesenho(tela: HTMLCanvasElement): Desenho {
  const c = tela.getContext('2d')!;
  const low = document.createElement('canvas'); low.width = W; low.height = H;
  const g = low.getContext('2d')!;
  const fundo = document.createElement('canvas'); fundo.width = W; fundo.height = H;
  const sombra = document.createElement('canvas');
  const sc = sombra.getContext('2d')!;
  const deitado = document.createElement('canvas'); deitado.width = 14; deitado.height = 30;
  const dc = deitado.getContext('2d')!;
  let S = 1;
  let relogio = 0;
  let luz = 0;
  let mesaA = 0;
  let modoDoTelao: string | null = null;
  let chiadoAte = 0;
  /** Os temas com que o fundo foi pintado, e os letreiros dos quadros deles. */
  let temasDoFundo = '';
  let rotulos: Rotulo[] = [];
  const agito: [number, number] = [0, 0];
  let fumacaDe: [Ponto | null, Ponto | null] = [null, null];
  let brilhoDe: [Ponto | null, Ponto | null] = [null, null];
  let faiscaDe: [Ponto | null, Ponto | null] = [null, null];
  let particulas: Particula[] = [];
  let textos: Texto[] = [];

  let G = g;
  const px = (x: number, y: number, w: number, h: number, cor: string) => { G.fillStyle = cor; G.fillRect(Math.round(x), Math.round(y), w, h); };
  const linha = (x0: number, y0: number, x1: number, y1: number, esp: number, cor: string) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, esp, esp, cor);
  };
  const pincel: Pincel = { px, linha, get ctx() { return G; }, get relogio() { return relogio; } };

  // --- o fundo: a sala, e os quadros do tema -----------------------------------------------
  function pintarFundo(temas: [Tema, Tema]) {
    const f = fundo.getContext('2d')!;
    const p = (x: number, y: number, w: number, h: number, cor: string) => { f.fillStyle = cor; f.fillRect(x, y, w, h); };
    p(0, 0, W, 64, '#43201a');
    const tons = ['#6b3326', '#73382a', '#653023', '#7a3d2d', '#5e2c21'];
    for (let lin = 0; lin * 6 < 64; lin++) {
      const off = lin % 2 ? 8 : 0;
      for (let col = -1; col * 16 < W + 16; col++) {
        const x = col * 16 + off, y = lin * 6;
        p(x + 1, y + 1, 15, 5, tons[Math.floor(hash(lin, col) * tons.length)]);
        p(x + 1, y + 1, 15, 1, 'rgba(255,210,180,.07)');
      }
    }
    p(0, 61, W, 5, '#2a1a14'); p(0, 61, W, 1, '#4a3024');
    for (let y = 66; y < H; y += 8) for (let x = 0; x < W; x += 16) {
      const par = (x / 16 + (y - 66) / 8) % 2 === 0;
      p(x, y, 16, 8, par ? '#a39c90' : '#423d48');
      p(x, y, 16, 1, par ? '#b3ac9f' : '#4b4652');
    }
    const gr = f.createLinearGradient(0, 66, 0, H);
    gr.addColorStop(0, 'rgba(10,5,10,.45)'); gr.addColorStop(0.35, 'rgba(10,5,10,.12)'); gr.addColorStop(1, 'rgba(10,5,10,0)');
    f.fillStyle = gr; f.fillRect(0, 66, W, H - 66);
    // os quadros: cada lado, o do seu tema
    G = f;
    rotulos = [...TEMA[temas[0]].quadro(pincel, 0), ...TEMA[temas[1]].quadro(pincel, 1)];
    G = g;
    // a moldura do telão (o vídeo roda por cima, a cada quadro)
    p(97, 24, 126, 36, '#0b0b0e'); p(98, 25, 124, 34, '#1c1c22'); p(98, 25, 124, 1, '#34343c');
    p(214, 58, 3, 1, '#ff3b3b');
    for (let x = 0; x <= W; x++) p(x, Math.round(yVaral(x)), 1, 1, '#2b2b2b');
    temasDoFundo = temas.join(',');
  }

  // --- o telão --------------------------------------------------------------------------
  /** O telão: o vídeo de cada lado, trocando a cada 12 s com chiado; na festa, o parabéns. */
  function telao(festa: boolean, temas: [Tema, Tema]) {
    const lado: Lado = Math.floor(relogio / 12) % 2 ? 1 : 0;
    const modo = festa ? 'festa' : `${temas[lado]}-${lado}`;
    if (modo !== modoDoTelao) { if (modoDoTelao) chiadoAte = relogio + 0.35; modoDoTelao = modo; }
    const { x: X, y: Y, w: L, h: A } = TELA;
    g.save(); g.beginPath(); g.rect(X, Y, L, A); g.clip();
    if (relogio < chiadoAte) {
      for (let y = Y; y < Y + A; y++) for (let x = X; x < X + L; x += 2) { const v = Math.floor(Math.random() * 170 + 40); px(x, y, 2, 1, `rgb(${v},${v},${v})`); }
    } else if (modo === 'festa') {
      px(X, Y, L, A, '#14060f');
      for (let i = 0; i < 22; i++) {
        px(X + volta(i * 37, L), Y + volta(i * 13 + Math.floor(relogio * 12) + i * 5, A), 1, 1, [COR.laranja, COR.vermelho, '#ffffff', '#ffd27a'][i % 4]);
      }
      for (let y = Y; y < Y + A; y += 2) px(X, y, L, 1, 'rgba(0,0,0,.16)');
    } else TEMA[temas[lado]].video(pincel, lado);
    g.restore();
  }

  // --- os móveis ------------------------------------------------------------------------
  function mesaDoBolo(velas: boolean, temas: [Tema, Tema]) {
    if (mesaA <= 0) return;
    g.globalAlpha = mesaA;
    px(MESA.x1, 109, MESA.x2 - MESA.x1, 2, 'rgba(0,0,0,.3)');
    px(MESA.x1, MESA.topo, MESA.x2 - MESA.x1, 12, '#f4efe6');
    px(MESA.x1, MESA.topo, MESA.x2 - MESA.x1, 1, '#fffaf2');
    px(MESA.x1, MESA.frente, MESA.x2 - MESA.x1, 12, '#e3dbcc');
    px(MESA.x1, MESA.frente, MESA.x2 - MESA.x1, 1, '#c9bfae');
    const [v0, v1] = [TEMA[temas[0]].velas[0], TEMA[temas[1]].velas[1]];
    for (let i = 0, x = MESA.x1; x < MESA.x2; i++, x += 6) {
      const cor = i % 2 ? v0[0] : v1[0];
      px(x, 104, 6, 3, cor); px(x + 1, 107, 4, 1, cor);
    }
    // os docinhos e os salgadinhos da festa, dos dois lados do bolo
    px(130, 88, 9, 2, '#cfd6df'); px(181, 88, 9, 2, '#cfd6df');
    for (const x of [131, 134, 137]) { px(x, 86, 2, 2, '#4a2a1a'); px(x, 86, 1, 1, '#a0613a'); }
    for (const x of [182, 185, 188]) { px(x, 86, 2, 2, COR.coxinha); px(x, 86, 1, 1, '#f0a845'); }
    px(141, 85, 2, 4, '#7ec8ff'); px(177, 85, 2, 4, '#ff8a5c');
    // o bolo: o andar de baixo é do lado esquerdo, o de cima do direito
    px(146, 91, 28, 2, '#cfd6df');
    TEMA[temas[0]].andarDoBolo(pincel, 0);
    TEMA[temas[1]].andarDoBolo(pincel, 1);
    for (const [x, [c1, c2]] of [[157, v0], [162, v1]] as const) {
      for (let y = 69; y < 75; y++) px(x, y, 2, 1, (y % 2) ? c1 : c2);
      if (velas) {
        const f = Math.floor(relogio * 10 + x) % 2;
        px(x, 65 + f, 2, 4 - f, '#ffb02e'); px(x + (f ? 1 : 0), 66 + f, 1, 2, '#fff2b8');
      }
    }
    g.globalAlpha = 1;
  }

  function mesinha(x0: number) {
    px(x0, 74, 28, 4, COR.madeira); px(x0, 74, 28, 1, '#946644'); px(x0 + 1, 78, 26, 1, COR.madeira2);
    px(x0 + 13, 79, 2, 13, COR.madeira2); px(x0 + 8, 92, 12, 2, COR.madeira2);
  }
  function bebidas() {
    px(14, 93, 56, 2, 'rgba(0,0,0,.28)');
    px(16, 82, 18, 12, '#eef2f4'); px(16, 82, 18, 1, '#ffffff'); px(16, 88, 18, 1, '#cfd8de');
    px(15, 80, 20, 3, '#3a6fd1'); px(15, 80, 20, 1, '#6b97e6');
    px(19, 78, 3, 3, '#d7263d'); px(23, 77, 3, 4, '#e8c547'); px(28, 78, 3, 3, '#d7263d');
    px(18, 79, 14, 1, '#cfe9f5');
    mesinha(40);
    px(43, 67, 2, 7, '#2f7a3a'); px(43, 65, 2, 2, '#245e2d');
    px(47, 66, 2, 8, '#6b3a1a'); px(47, 64, 2, 2, '#4e2a12');
    px(51, 70, 3, 4, COR.ambar); px(51, 69, 3, 1, '#fff6df');
    // a jarra de suco
    px(56, 67, 5, 7, '#ff9f2e'); px(56, 67, 5, 1, '#ffd27a'); px(55, 66, 7, 1, '#cfe6f5'); px(61, 68, 1, 4, '#cfe6f5');
    px(64, 70, 3, 4, '#ff9f2e'); px(64, 69, 3, 1, '#ffd27a');
  }
  function salgados() {
    px(250, 93, 36, 2, 'rgba(0,0,0,.28)');
    mesinha(254);
    // a caixa de pizza aberta
    px(255, 63, 15, 10, '#c89a5a'); px(255, 63, 15, 1, '#d8ad70'); px(257, 66, 11, 4, '#b48548');
    px(255, 72, 15, 2, '#b48548');
    px(256, 71, 13, 3, '#f2b544'); px(256, 71, 13, 1, '#e39b2b');
    for (const x of [258, 262, 266]) px(x, 72, 1, 1, '#b8322a');
    // a estufa de salgados: coxinha e pastel em cima, dogão e esfiha embaixo, com a luzinha quente
    px(271, 58, 15, 16, '#8d949e'); px(272, 59, 13, 14, 'rgba(255,214,150,.35)'); px(272, 59, 13, 1, '#ffd27a');
    px(272, 65, 13, 1, '#8d949e');
    for (const x of [273, 276]) { px(x, 62, 2, 3, COR.coxinha); px(x, 62, 1, 1, '#f0a845'); }
    px(279, 63, 4, 2, '#e8c27a'); px(279, 63, 4, 1, '#d9a85a');
    px(273, 69, 5, 2, '#d9a05a'); px(273, 69, 5, 1, '#b8322a');
    px(280, 69, 3, 3, '#d98a3a'); px(281, 69, 1, 1, '#b8322a');
    px(271, 73, 15, 1, '#6d737c');
    // os brigadeiros na frente
    for (const x of [257, 260, 263, 266]) { px(x, 74, 2, 1, '#4a2a1a'); }
  }
  function bebedouro() {
    px(289, 93, 18, 2, 'rgba(0,0,0,.28)');
    px(292, 63, 10, 11, 'rgba(159,216,255,.85)'); px(293, 63, 2, 10, 'rgba(255,255,255,.5)'); px(294, 61, 6, 2, '#3a6fd1'); px(292, 66, 10, 1, '#7ec2f0');
    px(291, 74, 12, 19, '#e8ecf0'); px(291, 74, 12, 1, '#ffffff'); px(302, 75, 1, 18, '#c5ccd4');
    px(293, 78, 2, 2, '#3a6fd1'); px(299, 78, 2, 2, '#d7263d');
    px(292, 82, 10, 1, '#9aa1ab'); px(293, 86, 8, 4, '#cfd6df');
    px(304, 76, 3, 10, '#cfd6df'); px(304, 76, 3, 1, '#ffffff');
  }
  function fliperama(i: number, ocupado: boolean) {
    const k = FLIPERAMAS[i], cor = GABINETES[i];
    const x0 = k.x1, w = k.x2 - k.x1;
    px(x0, 93, w, 2, 'rgba(0,0,0,.3)');
    px(x0, 52, w, 42, cor.corpo);
    px(x0, 52, 1, 42, cor.arte); px(x0 + w - 1, 52, 1, 42, cor.arte);
    // o letreiro, aceso
    px(x0 + 1, 52, w - 2, 6, cor.letreiro); px(x0 + 1, 52, w - 2, 1, mistura(cor.letreiro, '#ffffff', 0.4));
    // a tela, com o jogo esperando ficha (ou alguém jogando)
    px(x0 + 2, 59, w - 4, 13, '#0b0b0e');
    px(x0 + 3, 60, w - 6, 11, '#05050a');
    const sw = w - 6;
    for (let s = 0; s < 6; s++) px(x0 + 3 + volta(s * 5 + i * 3, sw), 60 + volta(Math.floor(relogio * (ocupado ? 18 : 6)) + s * 4, 11), 1, 1, '#c9d6ff');
    if (ocupado) {
      for (let c2 = 0; c2 < 4; c2++) px(x0 + 4 + c2 * 3 + Math.round(Math.sin(relogio * 3) * 1), 62, 2, 1, cor.tela);
      px(x0 + 3 + volta(Math.floor(relogio * 9), sw - 2), 69, 3, 1, '#ffffff');
      if (Math.floor(relogio * 6) % 2) px(x0 + 8, 66, 1, 2, '#ffd23f');
    } else if (Math.floor(relogio * 2) % 2) {
      px(x0 + 8, 68, 5, 1, cor.tela);
    }
    // o painel: a alavanca e os dois botões
    px(x0, 72, w, 2, mistura(cor.corpo, '#000000', 0.4)); px(x0 + 1, 74, w - 2, 3, '#1a1a22');
    px(x0 + 6, 71, 1, 3, '#9aa1ab'); px(x0 + 5, 70, 3, 2, '#e04852');
    px(x0 + 11, 74, 2, 1, '#ffd23f'); px(x0 + 15, 74, 2, 1, cor.arte);
    // a portinha da ficha
    px(x0 + 7, 81, 7, 9, '#151520'); px(x0 + 9, 83, 1, 3, '#ff8a2e'); px(x0 + 11, 83, 1, 3, '#ff8a2e');
  }

  // --- os bonecos -----------------------------------------------------------------------
  const emPe = (b: Boneco, x0: number, y0: number) => pintarEmPe(G, b, x0, y0, relogio);

  function boneco(b: Boneco) {
    if (b.caido > 0) {
      // Desenhado em pé no rascunho e deitado aqui: a cabeça para a esquerda, as costas no chão.
      dc.clearRect(0, 0, 14, 30);
      G = dc;
      emPe({ ...b, andando: false, dir: 'baixo', bracos: false, acao: null, pulo: false, chapeu: false }, 7, 28);
      G = g;
      px(b.x - 13, b.y - 1, 26, 2, 'rgba(0,0,0,.28)');
      g.save(); g.translate(Math.round(b.x), Math.round(b.y)); g.rotate(-Math.PI / 2); g.drawImage(deitado, -2, -15); g.restore();
      for (let k = 0; k < 3; k++) {
        const a = relogio * 5 + k * 2.1;
        px(b.x - 12 + Math.cos(a) * 5, b.y - 12 + Math.sin(a) * 2, 1, 1, '#ffe27a');
      }
      return;
    }
    px(b.x - 4, b.y - 1, 8, 2, 'rgba(0,0,0,.28)');
    emPe(b, b.x, b.y);
  }

  // --- os efeitos -----------------------------------------------------------------------
  function fumaca(x: number, y: number, n: number, cor = '#9aa1ab') {
    for (let i = 0; i < n; i++) {
      particulas.push({ tipo: 'fumaca', cor, x: x + (Math.random() - 0.5) * 2, y, vx: (Math.random() - 0.5) * 8, vy: -10 - Math.random() * 10, vida: 1.2 + Math.random() * 0.8, tam: 2, chao: 0, fase: 0 });
    }
  }
  function confete() {
    const cores = [COR.laranja, COR.vermelho, COR.branco, '#ffd27a', '#7ec8ff', '#9bff9b', '#ff5d8f'];
    for (let i = 0; i < 140; i++) {
      const doBolo = i < 60;
      particulas.push({
        tipo: 'confete', cor: cores[i % cores.length],
        x: doBolo ? 160 : Math.random() * W, y: doBolo ? 66 : -4 - Math.random() * 30,
        vx: doBolo ? (Math.random() - 0.5) * 140 : (Math.random() - 0.5) * 20,
        vy: doBolo ? -60 - Math.random() * 70 : 10 + Math.random() * 25,
        chao: 74 + Math.random() * 100, vida: 9 + Math.random() * 3, tam: 1, fase: Math.random() * 6,
      });
    }
  }

  function atualizarEfeitos(dt: number) {
    for (const lado of [0, 1] as const) {
      agito[lado] = Math.max(0, agito[lado] - dt);
      const f = fumacaDe[lado];
      if (agito[lado] > 0 && f && Math.random() < dt * 14) fumaca(f.x, f.y, 1);
      const k = faiscaDe[lado];
      if (agito[lado] > 0 && k) {
        for (let i = 0; i < 2; i++) {
          particulas.push({ tipo: 'faisca', cor: Math.random() < 0.5 ? '#ffd23f' : '#ff8a2e', x: k.x, y: k.y, vx: (Math.random() - 0.3) * 60, vy: -20 - Math.random() * 30, vida: 0.35 + Math.random() * 0.3, tam: 1, chao: 0, fase: 0 });
        }
      }
    }
    particulas = particulas.filter((q) => (q.vida -= dt) > 0);
    for (const q of particulas) {
      if (q.tipo === 'confete') {
        if (q.y < q.chao) {
          q.vy = Math.min(38, q.vy + 160 * dt); q.vx *= 1 - dt * 1.6;
          q.x += (q.vx + Math.sin(relogio * 6 + q.fase) * 10) * dt; q.y += q.vy * dt;
        }
      } else { q.x += q.vx * dt; q.y += q.vy * dt; if (q.tipo === 'fumaca') q.tam += dt * 2; if (q.tipo === 'faisca') q.vy += 120 * dt; }
    }
    textos = textos.filter((k) => (k.vida -= dt) > 0);
    for (const k of textos) k.y += k.vy * dt;
  }

  // --- o quadro ---------------------------------------------------------------------------
  function desenhar(gar: Garagem, dt: number, luzes: boolean) {
    relogio += dt;
    atualizarEfeitos(dt);
    const temas = gar.temas;
    if (temas.join(',') !== temasDoFundo) pintarFundo(temas);
    const festa = gar.festa;
    mesaA += ((gar.mesaNaTela ? 1 : 0) - mesaA) * Math.min(1, dt * 5);
    if (!gar.mesaNaTela && mesaA < 0.02) mesaA = 0;
    let alvoLuz = luzes ? 0.42 : 0;
    if (festa?.fase === 'reunindo') alvoLuz = Math.max(alvoLuz, 0.2);
    if (festa?.fase === 'cantando' && festa.t < ROTEIRO.ratimbum + 3.7) alvoLuz = 0.58;
    luz += (alvoLuz - luz) * Math.min(1, dt * 2.2);

    g.drawImage(fundo, 0, 0);
    telao(gar.mesaNaTela, temas);
    if (mesaA > 0) {
      // as bandeirinhas descem junto com a mesa
      g.globalAlpha = mesaA;
      const bandeira = [TEMA[temas[0]].velas[0][0], TEMA[temas[0]].velas[0][1], TEMA[temas[1]].velas[1][0], TEMA[temas[1]].velas[1][1]];
      for (let x = 0; x <= W; x++) px(x, 3 + 4 * (1 - ((x - 160) / 160) ** 2), 1, 1, '#2b2b2b');
      for (let i = 0, x = 2; x < W; i++, x += 10) {
        const y0 = Math.round(4 + 4 * (1 - ((x + 4 - 160) / 160) ** 2));
        for (let r = 0; r < 7; r++) { const w = 8 - Math.floor(r * 8 / 7); px(x + (8 - w) / 2, y0 + r, Math.max(1, w), 1, bandeira[i % 4]); }
      }
      g.globalAlpha = 1;
    }
    for (const l of LAMPADAS) { px(l.x, l.y - 1, 2, 1, '#2b2b2b'); px(l.x, l.y, 2, 3, l.cor); }
    const ocupado = [gar.noFliperama(0) !== null, gar.noFliperama(1) !== null];
    const coisas: { y: number; f: () => void }[] = [
      ...[...gar.bonecos.values()].map((b) => ({ y: b.y, f: () => boneco(b) })),
      { y: MESA.base, f: () => mesaDoBolo(gar.velas, temas) },
      { y: BALCOES[0].base, f: bebidas },
      { y: BALCOES[1].base, f: salgados },
      { y: BALCOES[2].base, f: bebedouro },
      { y: FLIPERAMAS[0].base, f: () => fliperama(0, ocupado[0]) },
      { y: FLIPERAMAS[1].base, f: () => fliperama(1, ocupado[1]) },
      { y: 150, f: () => TEMA[temas[0]].peca(pincel, 0, agito[0]) },
      { y: 150.1, f: () => TEMA[temas[1]].peca(pincel, 1, agito[1]) },
    ];
    coisas.sort((a, b) => a.y - b.y).forEach((k) => k.f());
    for (const q of particulas) {
      if (q.tipo === 'confete') {
        g.globalAlpha = Math.min(1, q.vida / 1.5);
        px(q.x, q.y, (Math.floor(relogio * 8 + q.fase) % 2) + 1, 1 + (Math.floor(relogio * 8 + q.fase + 1) % 2), q.cor);
      } else if (q.tipo === 'brilho' || q.tipo === 'faisca') {
        g.globalAlpha = Math.min(1, q.vida * 2); px(q.x, q.y, 1, 1, q.cor);
      } else {
        g.globalAlpha = Math.min(0.55, q.vida * 0.5); const s = Math.round(q.tam); px(q.x - s / 2, q.y - s / 2, s, s, q.cor);
      }
      g.globalAlpha = 1;
    }

    c.imageSmoothingEnabled = false;
    c.drawImage(low, 0, 0, tela.width, tela.height);

    const fonte = (tam: number, pixel = false) => (pixel ? `500 ${Math.round(tam * S)}px ${PIXEL}` : `750 ${Math.round(tam * S)}px ${TEXTO}`);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const r of rotulos) {
      c.font = fonte(r.tam);
      if (r.contorno) { c.lineWidth = Math.max(1, 0.8 * S); c.strokeStyle = r.contorno; c.strokeText(r.texto, r.x * S, r.y * S); }
      c.fillStyle = r.cor; c.fillText(r.texto, r.x * S, r.y * S);
    }
    c.font = fonte(3.4); c.fillStyle = '#ffffff';
    for (const k of FLIPERAMAS) c.fillText('NAVINHA', (k.x1 + k.x2) / 2 * S, 55.3 * S);

    // o escuro, com buracos onde há luz
    if (luz > 0.01) {
      sc.globalCompositeOperation = 'source-over';
      sc.clearRect(0, 0, sombra.width, sombra.height);
      sc.fillStyle = `rgba(8,5,18,${luz})`; sc.fillRect(0, 0, sombra.width, sombra.height);
      sc.globalCompositeOperation = 'destination-out';
      const furo = (x: number, y: number, r: number, a: number) => {
        const gr = sc.createRadialGradient(x * S, y * S, 0, x * S, y * S, r * S);
        gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        sc.fillStyle = gr; sc.fillRect((x - r) * S, (y - r) * S, 2 * r * S, 2 * r * S);
      };
      furo(160, 43, 46, 0.55);
      if (gar.mesaNaTela && gar.velas) { furo(160, 70, 44, 0.95); furo(160, 92, 60, 0.5); }
      if (festa?.fase === 'cantando') furo(160, 112, 96, 0.45);
      for (const l of LAMPADAS) furo(l.x + 1, l.y + 1, 9, 0.5);
      for (const k of FLIPERAMAS) furo((k.x1 + k.x2) / 2, 64, 16, 0.6);
      for (const lado of [0, 1] as const) { const b = brilhoDe[lado]; if (agito[lado] > 0 && b) furo(b.x, b.y, 30, 0.7); }
      c.drawImage(sombra, 0, 0);
    }

    // o que brilha
    c.save(); c.globalCompositeOperation = 'lighter';
    const brilho = (x: number, y: number, r: number, cor: string, a: number) => {
      const gr = c.createRadialGradient(x * S, y * S, 0, x * S, y * S, r * S);
      gr.addColorStop(0, cor.replace('A', String(a))); gr.addColorStop(1, cor.replace('A', '0'));
      c.fillStyle = gr; c.fillRect((x - r) * S, (y - r) * S, 2 * r * S, 2 * r * S);
    };
    const piscando = luzes || !!festa;
    LAMPADAS.forEach((l, i) => {
      const [r, gg, b] = hex(l.cor);
      brilho(l.x + 1, l.y + 1.5, 6, `rgba(${r},${gg},${b},A)`, (0.15 + luz * 0.5) * (piscando ? 0.55 + 0.45 * Math.sin(relogio * 3 + i * 1.7) : 1));
    });
    FLIPERAMAS.forEach((k, i) => {
      const [r, gg, b] = hex(GABINETES[i].letreiro);
      brilho((k.x1 + k.x2) / 2, 56, 12, `rgba(${r},${gg},${b},A)`, 0.12 + luz * 0.35);
      brilho((k.x1 + k.x2) / 2, 65, 10, 'rgba(160,190,255,A)', (0.06 + luz * 0.3) * (ocupado[i] ? 1.4 : 1));
    });
    if (gar.mesaNaTela && gar.velas) brilho(160, 67, 22 * (1 + Math.sin(relogio * 23) * 0.06), 'rgba(255,170,60,A)', (0.25 + luz * 0.55) * mesaA);
    if (luzes && !gar.festaAndando) {
      ['rgba(255,93,143,A)', 'rgba(126,200,255,A)', 'rgba(242,140,40,A)', 'rgba(155,255,155,A)'].forEach((cor, i) => {
        brilho(160 + Math.sin(relogio * 0.7 + i * 1.6) * 120, 124 + Math.cos(relogio * 0.9 + i * 2.1) * 40, 26, cor, 0.22);
      });
    }
    for (const lado of [0, 1] as const) { const b = brilhoDe[lado]; if (agito[lado] > 0 && b) brilho(b.x, b.y, 26, 'rgba(255,243,176,A)', 0.35); }
    c.restore();

    // o telão na festa: o parabéns no lugar do vídeo
    if (modoDoTelao === 'festa' && relogio >= chiadoAte) {
      c.save();
      c.font = fonte(10.5, true); c.shadowColor = '#ff4f9a'; c.shadowBlur = 6 * S;
      c.fillStyle = Math.floor(relogio * 3) % 9 === 0 ? 'rgba(255,120,180,.6)' : '#ff8cc0';
      c.fillText('PARABÉNS', 160 * S, 38 * S);
      const nomes = nomesNoTelao(gar.aniversariantes);
      c.font = fonte(nomes.length > 16 ? 4.6 : 5.6); c.shadowColor = '#ffb347'; c.shadowBlur = 4 * S; c.fillStyle = '#ffd9a0';
      c.fillText(nomes, 160 * S, 51 * S);
      c.restore();
    }

    for (const k of textos) {
      c.globalAlpha = Math.min(1, k.vida);
      c.font = fonte(k.tam); c.fillStyle = k.cor; c.fillText(k.texto, k.x * S, k.y * S);
      c.globalAlpha = 1;
    }

    // os nomes em cima das cabeças
    for (const b of gar.bonecos.values()) {
      const meu = b.id === gar.euId;
      const y = (b.caido > 0 ? b.y - 16 : b.y - 25 - (b.chapeu ? 7 : 0)) * S;
      c.font = fonte(4.4);
      const texto = meu ? `${b.nome} (você)` : b.nome;
      const w = c.measureText(texto).width + 4 * S, h = 6.4 * S;
      c.fillStyle = meu ? 'rgba(58,117,206,.92)' : 'rgba(12,10,20,.72)';
      c.beginPath(); c.roundRect(b.x * S - w / 2, y - h / 2, w, h, 1.5 * S); c.fill();
      c.fillStyle = '#ffffff'; c.fillText(texto, b.x * S, y + 0.3 * S);
    }

    // a legenda da música
    if (festa?.fase === 'cantando') {
      const leg = legendaEm(festa.t, gar.aniversariantes);
      if (leg) {
        c.font = fonte(leg.grito ? 11 : 8.5);
        const w = c.measureText(leg.texto).width + 12 * S, h = (leg.grito ? 16 : 13) * S;
        c.fillStyle = 'rgba(12,8,22,.78)';
        c.beginPath(); c.roundRect(160 * S - w / 2, 164 * S - h / 2, w, h, 3 * S); c.fill();
        c.fillStyle = leg.grito ? '#ffb347' : '#fff3d6';
        c.fillText(leg.texto, 160 * S, 164.5 * S);
      }
    }

    // o apagão de quem desmaiou: escurece rápido, 1 s de preto, e volta
    if (gar.apagao >= 0) {
      const a = gar.apagao;
      const preto = a < 0.15 ? a / 0.15 : a < 0.15 + APAGAO ? 1 : Math.max(0, 1 - (a - 0.15 - APAGAO) / 0.25);
      c.fillStyle = `rgba(0,0,0,${preto})`; c.fillRect(0, 0, tela.width, tela.height);
      if (a > 0.15 + APAGAO - 0.05) {
        c.globalAlpha = Math.max(0, 1 - (a - 0.15 - APAGAO) / 0.4);
        c.font = fonte(8, true); c.fillStyle = '#ffd27a'; c.fillText('Você apagou!', 160 * S, 90 * S);
        c.globalAlpha = 1;
      }
    }
  }

  return {
    redimensionar() {
      const r = tela.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      tela.width = Math.max(W, Math.round(r.width * dpr));
      tela.height = Math.round(tela.width * H / W);
      sombra.width = tela.width; sombra.height = tela.height;
      S = tela.width / W;
    },
    desenhar,
    ocorreu(o) {
      if (o.tipo === 'consumo') {
        const k = COMIDAS[o.comida];
        textos.push({ texto: k.grito, x: o.x + 6, y: o.y - 24, vy: -10, vida: 1, cor: k.tipo === 'beber' ? (o.comida === 'agua' ? '#9fd8ff' : '#ffd27a') : '#ffb36b', tam: 5 });
      } else if (o.tipo === 'soluco') {
        textos.push({ texto: 'hic!', x: o.x - 6, y: o.y - 24, vy: -8, vida: 0.9, cor: '#cfe6f5', tam: 4.5 });
      } else if (o.tipo === 'ocupado') {
        textos.push({ texto: 'ocupado!', x: o.x, y: o.y, vy: -8, vida: 1.2, cor: '#ff9be8', tam: 5 });
      } else if (o.tipo === 'nota') {
        textos.push({ texto: '♪', x: o.x + (Math.random() - 0.5) * 6, y: o.y - 26, vy: -14, vida: 1.4, cor: '#ffd27a', tam: 6 });
      } else if (o.tipo === 'mesa') {
        for (let i = 0; i < 26; i++) {
          particulas.push({ tipo: 'brilho', cor: ['#fff3b0', '#ffd27a', '#ffffff'][i % 3], x: 126 + Math.random() * 68, y: 70 + Math.random() * 38, vx: 0, vy: -6 - Math.random() * 8, vida: 0.5 + Math.random() * 0.6, tam: 1, chao: 0, fase: 0 });
        }
      } else if (o.tipo === 'ratimbum') {
        fumaca(158, 66, 6, '#cfd6df'); fumaca(163, 66, 6, '#cfd6df');
        confete();
      }
    },
    acelerar(lado, tema) {
      if (agito[lado] > 0) return null;
      const acao = TEMA[tema].acao(lado);
      agito[lado] = 1.3;
      fumacaDe = lado === 0 ? [acao.fumaca, fumacaDe[1]] : [fumacaDe[0], acao.fumaca];
      brilhoDe = lado === 0 ? [acao.brilho, brilhoDe[1]] : [brilhoDe[0], acao.brilho];
      faiscaDe = lado === 0 ? [acao.faiscas ?? null, faiscaDe[1]] : [faiscaDe[0], acao.faiscas ?? null];
      textos.push({ texto: acao.grito, x: lado === 0 ? 54 : 266, y: lado === 0 ? 100 : 90, vy: -10, vida: 1.2, cor: acao.cor, tam: 8 });
      return acao;
    },
    pontoDe(e) {
      const r = tela.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
    },
  };
}

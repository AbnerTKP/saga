/**
 * O desenho da Garagem, em pixel: a cena inteira num canvas de 320×180 ampliado sem suavizar, e por
 * cima, na resolução da tela, o que tem de ler bem — os nomes, a legenda do parabéns, o telão na
 * festa — e a luz (o escuro com buracos onde há lâmpada, vela e farol).
 *
 * É o desenho da prancheta que o dono aprovou em 26/10/2026, sem tirar nem pôr: a parede de tijolo,
 * o varal de luz, os quadros da Harley e da Sahara, o telão passando uma moto, o isopor e a mesa de
 * salgados, as duas motos e o chão xadrez. As cores do jogo moram aqui, como as do Catan moram no
 * desenho dele — o CSS fica com os tokens da Saga.
 *
 * Quem anda e quando é do `garagem.ts`; aqui só se olha para ele e se pinta, e se guardam os efeitos
 * que não interessam a ninguém mais: confete, fumaça, as notinhas, o "glup!", a moto tremendo.
 */
import {
  ALTURA, APAGAO, BALCOES, HARLEY, LARGURA, MESA, ROTEIRO, SAHARA, TONTO,
  legendaEm, novoBoneco, type Aparencia, type Boneco, type Garagem, type Ocorrencia, type Ponto,
} from './garagem';

const W = LARGURA, H = ALTURA;
const COR = {
  laranja: '#f28c28', preto: '#1d1d22', vermelho: '#d7263d', branco: '#f2f2f2',
  cromo: '#c9ced6', cromo2: '#9aa1ab', cromo3: '#6d737c', pneu: '#18181c',
  madeira: '#7a5232', madeira2: '#5a3a22', ambar: '#e8a33a', coxinha: '#d98a2b',
};
const FONTE = '"Pixelify Sans", Figtree, sans-serif';
const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const volta = (v: number, n: number) => ((v % n) + n) % n;
const hex = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
const mistura = (a: string, b: string, k: number) => {
  const [r1, g1, b1] = hex(a), [r2, g2, b2] = hex(b);
  return `rgb(${Math.round(r1 + (r2 - r1) * k)},${Math.round(g1 + (g2 - g1) * k)},${Math.round(b1 + (b2 - b1) * k)})`;
};
const yVaral = (x: number) => 14 + 7 * (1 - ((x - 160) / 160) ** 2);
const LAMPADAS = Array.from({ length: 23 }, (_, i) => {
  const x = 7 + i * 14;
  return { x, y: yVaral(x) + 2, cor: ['#ffd27a', '#ff8a5c', '#ff5d8f', '#7ec8ff', '#9bff9b'][i % 5] };
});
const TELA = { x: 100, y: 27, w: 120, h: 31 };

type Particula = { tipo: 'confete' | 'fumaca' | 'brilho'; cor: string; x: number; y: number; vx: number; vy: number; vida: number; tam: number; chao: number; fase: number };
type Texto = { texto: string; x: number; y: number; vy: number; vida: number; cor: string; tam: number };

export type Desenho = {
  redimensionar(): void;
  desenhar(g: Garagem, dt: number, luzes: boolean): void;
  ocorreu(o: Ocorrencia): void;
  /** Clicou na moto: treme, solta fumaça e grita "VRUM!". Falso se ela já estava acelerando. */
  acelerar(moto: 'harley' | 'sahara'): boolean;
  /** O ponto da cena (320×180) debaixo do mouse. */
  pontoDe(e: { clientX: number; clientY: number }): Ponto;
};

/** Um boneco em pé, com os pés em (x0, y0), em qualquer contexto: a cena, o rascunho do deitado e o retrato da porta. */
function pintarEmPe(ctx: CanvasRenderingContext2D, b: Boneco, x0: number, y0: number, relogio: number) {
  const px = (x: number, y: number, w: number, h: number, cor: string) => { ctx.fillStyle = cor; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const a = b.aparencia;
  const roupa = a.estilo === 'harley' ? { calca: '#2b3a55', bota: '#3a2418' }
    : a.estilo === 'sahara' ? { calca: '#555a66', bota: '#e6e6e6' } : { calca: a.calca, bota: '#18181c' };
  const tonto = b.cheio >= TONTO && b.andando ? Math.round(Math.sin(relogio * 7 + b.id) * 1.2) : 0;
  const x = Math.round(x0) - 5 + tonto;
  const y = Math.round(y0) - 20 - (b.pulo ? 1 : 0);
  const passo = b.andando ? Math.floor(relogio * 8 + b.id) % 2 : -1;
  px(x + 2, y + 14, 2, passo === 0 ? 4 : 5, roupa.calca);
  px(x + 6, y + 14, 2, passo === 1 ? 4 : 5, roupa.calca);
  px(x + 2, y + (passo === 0 ? 17 : 18), 2, 1, roupa.bota);
  px(x + 6, y + (passo === 1 ? 17 : 18), 2, 1, roupa.bota);
  if (a.estilo === 'sahara') { px(x + 2, y + 16, 2, 2, roupa.bota); px(x + 6, y + 16, 2, 2, roupa.bota); }
  px(x + 1, y + 8, 8, 7, a.camisa);
  if (a.estilo === 'harley') {
    if (b.dir === 'baixo') px(x + 4, y + 8, 2, 7, '#e8e8e8');
    px(x + 1, y + 11, 8, 1, COR.laranja);
    if (b.dir === 'cima') { px(x + 3, y + 9, 4, 4, COR.laranja); px(x + 4, y + 10, 2, 2, COR.preto); }
  }
  if (a.estilo === 'sahara') {
    px(x + 1, y + 8, 8, 2, COR.vermelho); px(x + 1, y + 12, 8, 1, COR.vermelho);
    if (b.dir === 'cima') { px(x + 4, y + 10, 1, 2, COR.vermelho); px(x + 5, y + 10, 1, 1, COR.vermelho); }
  }
  const manga = a.estilo === 'sahara' ? COR.vermelho : a.camisa;
  const naBoca = !!b.acao && b.acao.t < 0.8;
  if (b.bracos) {
    px(x, y + 4, 1, 6, manga); px(x + 9, y + 4, 1, 6, manga);
    px(x, y + 3, 1, 1, a.pele); px(x + 9, y + 3, 1, 1, a.pele);
  } else {
    px(x, y + 9, 1, 5, manga); px(x, y + 14, 1, 1, a.pele);
    if (naBoca) px(x + 9, y + 7, 1, 4, manga); else { px(x + 9, y + 9, 1, 5, manga); px(x + 9, y + 14, 1, 1, a.pele); }
  }
  px(x + 1, y + 1, 8, 7, a.pele);
  const topo = a.estilo === 'harley' ? COR.laranja : a.estilo === 'sahara' ? COR.vermelho : a.cabelo;
  if (b.dir === 'cima') {
    px(x + 1, y, 8, 7, a.cabelo); px(x + 1, y, 8, 2, topo);
    if (a.estilo === 'harley') px(x + 4, y + 2, 2, 2, COR.laranja);
  } else {
    px(x + 1, y, 8, 2, topo);
    const olhoY = y + 4;
    if (b.dir === 'baixo') {
      px(x + 1, y + 2, 1, 2, a.cabelo); px(x + 8, y + 2, 1, 2, a.cabelo);
      if (a.estilo === 'harley') { px(x + 2, olhoY - 1, 6, 2, '#0e0e10'); px(x + 3, olhoY - 1, 1, 1, '#4a4a55'); }
      else if (b.cheio >= 4) {
        px(x + 3, olhoY + 1, 1, 1, '#1a1a1a'); px(x + 6, olhoY + 1, 1, 1, '#1a1a1a');
        px(x + 2, olhoY + 2, 1, 1, '#e88a8a'); px(x + 7, olhoY + 2, 1, 1, '#e88a8a');
      } else { px(x + 3, olhoY, 1, 2, '#1a1a1a'); px(x + 6, olhoY, 1, 2, '#1a1a1a'); }
      if (a.estilo === 'sahara') px(x, y + 2, 10, 1, COR.vermelho);
    } else {
      const frente = b.dir === 'dir';
      px(frente ? x + 1 : x + 5, y + 2, 4, 3, a.cabelo);
      if (a.estilo === 'harley') px(frente ? x + 5 : x + 1, olhoY - 1, 4, 2, '#0e0e10');
      else px(frente ? x + 7 : x + 2, olhoY, 1, 2, '#1a1a1a');
      if (a.estilo === 'sahara') px(frente ? x + 5 : x - 1, y + 2, 5, 1, COR.vermelho);
    }
    if (a.estilo === 'harley') px(x + 2, y + 6, 6, 2, '#3a2418');
    if (b.boca) px(x + 4, y + 6, 2, 1, '#6e1f24');
  }
  if (naBoca && !b.bracos && b.acao) {
    if (b.acao.tipo === 'beber') { px(x + 8, y + 4, 2, 3, COR.ambar); px(x + 8, y + 4, 2, 1, '#fff6df'); }
    else { px(x + 8, y + 5, 2, 2, COR.coxinha); px(x + 8, y + 4, 1, 1, COR.coxinha); }
  }
  if (b.chapeu) {
    const cores = [[COR.laranja, COR.preto], [COR.vermelho, COR.branco], ['#3f7fe0', '#ffd27a'], ['#2ea36a', '#ffffff'], ['#a855f7', '#ffd27a']];
    const [c1, c2] = a.estilo === 'harley' ? cores[0] : a.estilo === 'sahara' ? cores[1] : cores[2 + (b.id % 3)];
    px(x + 4, y - 6, 2, 1, '#ffffff');
    px(x + 4, y - 5, 2, 1, c1); px(x + 3, y - 4, 4, 1, c2); px(x + 3, y - 3, 4, 1, c1);
    px(x + 2, y - 2, 6, 1, c2); px(x + 2, y - 1, 6, 1, c1);
  }
}

/** O retrato de um boneco parado, de frente, para a escolha da porta: 14×30, ampliado sem suavizar pelo CSS. */
export function pintarRetrato(canvas: HTMLCanvasElement, aparencia: Aparencia, id: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = 14; canvas.height = 30;
  ctx.clearRect(0, 0, 14, 30);
  pintarEmPe(ctx, { ...novoBoneco(id, '', aparencia.estilo, { x: 7, y: 28 }), aparencia }, 7, 28, 0);
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
  const motos = { harley: 0, sahara: 0 };
  let particulas: Particula[] = [];
  let textos: Texto[] = [];

  let G = g;
  const px = (x: number, y: number, w: number, h: number, cor: string) => { G.fillStyle = cor; G.fillRect(Math.round(x), Math.round(y), w, h); };
  const linha = (x0: number, y0: number, x1: number, y1: number, esp: number, cor: string) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, esp, esp, cor);
  };

  // --- o fundo, uma vez ------------------------------------------------------------------
  {
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
    // quadro da Harley: roda com asas, preto e laranja
    p(17, 25, 54, 35, '#2a1a14'); p(18, 26, 52, 33, '#121215');
    p(18, 26, 52, 1, COR.laranja); p(18, 58, 52, 1, COR.laranja);
    for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) {
      const d = Math.hypot(x, y);
      if ((d <= 6.3 && d > 4.2) || d <= 1.5) p(44 + x, 41 + y, 1, 1, COR.laranja);
      else if (d <= 4.2 && (x === 0 || y === 0)) p(44 + x, 41 + y, 1, 1, '#8a4c14');
    }
    for (let i = 0; i < 4; i++) {
      p(23 + i * 2, 37 + i * 2, 13 - i * 2, 1, i % 2 ? '#c96f1c' : COR.laranja);
      p(52, 37 + i * 2, 13 - i * 2, 1, i % 2 ? '#c96f1c' : COR.laranja);
    }
    // quadro da Sahara: sol sobre as dunas
    p(249, 25, 54, 35, '#2a1a14');
    const ceu = f.createLinearGradient(0, 26, 0, 58);
    ceu.addColorStop(0, '#ffe3a6'); ceu.addColorStop(1, '#f39a45');
    f.fillStyle = ceu; f.fillRect(250, 26, 52, 33);
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (Math.hypot(x, y) <= 5.2) p(289 + x, 40 + y, 1, 1, '#fff4cf');
    for (let x = 250; x < 302; x++) {
      const d1 = Math.round(48 + Math.sin((x - 250) / 9) * 3);
      const d2 = Math.round(52 + Math.sin((x - 240) / 6) * 2);
      p(x, d1, 1, 59 - d1, '#d9883a');
      p(x, d2, 1, 59 - d2, '#b8652a');
    }
    // a moldura do telão (o vídeo roda por cima, a cada quadro)
    p(97, 24, 126, 36, '#0b0b0e'); p(98, 25, 124, 34, '#1c1c22'); p(98, 25, 124, 1, '#34343c');
    p(214, 58, 3, 1, '#ff3b3b');
    for (let x = 0; x <= W; x++) p(x, Math.round(yVaral(x)), 1, 1, '#2b2b2b');
  }

  // --- o telão --------------------------------------------------------------------------
  function rodinha(cx: number, cy: number, r: number) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y);
      if (d <= r + 0.2 && d > r - 1.2) px(cx + x, cy + y, 1, 1, '#111114');
    }
    if (Math.floor(relogio * 14) % 2) { px(cx - 1, cy, 3, 1, '#9aa1ab'); px(cx, cy - 1, 1, 3, '#9aa1ab'); }
    else {
      for (const [dx, dy] of [[-1, -1], [1, 1], [1, -1], [-1, 1]]) px(cx + dx, cy + dy, 1, 1, '#9aa1ab');
      px(cx, cy, 1, 1, '#c9ced6');
    }
  }

  function video(trilha: boolean) {
    const { x: X, y: Y, w: L } = TELA;
    const t = relogio;
    const vel = trilha ? 46 : 62;
    const ceu = trilha ? ['#ffe6b0', '#ffae66'] : ['#2e2556', '#ff8a5c'];
    for (let i = 0; i < 6; i++) px(X, Y + i * 4, L, 4, mistura(ceu[0], ceu[1], i / 5));
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (Math.hypot(x, y) <= 4.2) px(X + 92 + x, Y + 12 + y, 1, 1, trilha ? '#fff4cf' : '#ffd27a');
    for (let x = X; x < X + L; x++) {
      const u = x + t * vel * 0.15;
      const h = Math.round(Y + 15 + Math.sin(u / 11) * 3 + Math.sin(u / 5.3) * 1.2);
      px(x, h, 1, Y + 22 - h, trilha ? '#e3a05a' : '#5a3a6e');
      const u2 = x + t * vel * 0.45;
      const h2 = Math.round(Y + 19 + Math.sin(u2 / 7) * 1.6);
      px(x, h2, 1, Y + 22 - h2, trilha ? '#c77c3a' : '#2f2a40');
    }
    if (trilha) {
      px(X, Y + 22, L, 9, '#b07a45'); px(X, Y + 22, L, 1, '#c99460');
      for (let k = 0; k < 16; k++) px(X + volta(k * 29 - t * vel, L), Y + 24 + (k % 4) * 2, 1 + (k % 2), 1, '#8a5a30');
      for (let k = 0; k < 3; k++) {
        const cx = X + volta(k * 55 + 20 - t * vel * 0.45, L + 20) - 10;
        px(cx, Y + 15, 2, 7, '#3f7a3a'); px(cx - 2, Y + 17, 2, 1, '#3f7a3a'); px(cx - 2, Y + 15, 1, 2, '#3f7a3a');
        px(cx + 2, Y + 18, 2, 1, '#3f7a3a'); px(cx + 3, Y + 16, 1, 2, '#3f7a3a');
      }
    } else {
      px(X, Y + 22, L, 9, '#2b2b31'); px(X, Y + 22, L, 1, '#5c6168');
      for (let k = -1; k < L / 12 + 1; k++) px(X + k * 12 - volta(t * vel, 12), Y + 26, 6, 1, '#f2e6a0');
      for (let k = 0; k < 5; k++) { const x = X + volta(k * 30 - t * vel, L + 10) - 5; px(x, Y + 18, 1, 4, '#8d949e'); px(x, Y + 18, 1, 1, '#f28c28'); }
    }
    const bx = X + 46;
    const by = Y + 28 + (trilha && Math.floor(t * 10) % 3 === 0 ? -1 : 0);
    for (let k = 0; k < 6; k++) {
      const d = volta(t * vel * 0.6 + k * 7, 30);
      g.globalAlpha = Math.max(0, 0.7 - d / 34);
      px(bx - 12 - d, by - 1 - (k % 2) - Math.floor(d / 10), 2, 1, trilha ? '#e8c08a' : '#9aa1ab');
    }
    g.globalAlpha = 1;
    if (!trilha) {
      rodinha(bx - 7, by, 3); rodinha(bx + 8, by, 3);
      px(bx - 9, by - 1, 10, 1, '#c9ced6'); px(bx - 2, by - 3, 5, 3, '#9aa1ab');
      px(bx - 10, by - 4, 4, 1, '#1d1d22'); px(bx - 6, by - 5, 6, 1, '#3b2a20');
      px(bx, by - 6, 6, 2, '#1d1d22'); px(bx + 1, by - 6, 4, 1, '#f28c28');
      linha(bx + 6, by - 7, bx + 8, by, 1, '#c9ced6'); px(bx + 5, by - 9, 3, 1, '#c9ced6'); px(bx + 8, by - 6, 1, 2, '#fff3b0');
      px(bx - 3, by - 7, 3, 2, '#2b3a55'); px(bx - 4, by - 12, 4, 5, '#1d1d22'); px(bx - 4, by - 10, 4, 1, '#f28c28');
      px(bx, by - 11, 5, 1, '#1d1d22'); px(bx - 4, by - 15, 4, 3, '#1d1d22'); px(bx - 1, by - 14, 1, 1, '#7a8090');
    } else {
      rodinha(bx - 8, by, 3); rodinha(bx + 8, by, 3);
      px(bx - 3, by - 5, 5, 3, '#2b2b31'); px(bx - 6, by - 2, 4, 1, '#3a3a44');
      px(bx - 11, by - 9, 7, 1, '#f2f2f2'); px(bx - 12, by - 10, 2, 1, '#d7263d');
      px(bx - 7, by - 9, 8, 1, '#1b1b1f'); px(bx - 1, by - 8, 6, 2, '#d7263d'); px(bx + 1, by - 7, 2, 1, '#f2f2f2');
      linha(bx + 5, by - 10, bx + 8, by, 1, '#d4a73a'); px(bx + 6, by - 6, 4, 1, '#f2f2f2'); px(bx + 5, by - 12, 2, 2, '#7fb2d6');
      px(bx - 3, by - 10, 3, 2, '#555a66'); px(bx - 4, by - 15, 4, 5, '#f2f2f2'); px(bx - 4, by - 15, 4, 1, '#d7263d');
      px(bx, by - 14, 5, 1, '#d7263d'); px(bx - 4, by - 18, 4, 3, '#d7263d'); px(bx - 3, by - 17, 2, 1, '#f2f2f2');
    }
    for (let y = Y; y < Y + TELA.h; y += 2) px(X, y, L, 1, 'rgba(0,0,0,.16)');
  }

  /** O telão: a Harley na estrada e a Sahara na trilha, trocando a cada 12 s com chiado; na festa, o parabéns. */
  function telao(festa: boolean) {
    const modo = festa ? 'festa' : Math.floor(relogio / 12) % 2 ? 'trilha' : 'estrada';
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
    } else video(modo === 'trilha');
    g.restore();
  }

  // --- os móveis ------------------------------------------------------------------------
  function mesaDoBolo(velas: boolean) {
    if (mesaA <= 0) return;
    g.globalAlpha = mesaA;
    px(MESA.x1, 109, MESA.x2 - MESA.x1, 2, 'rgba(0,0,0,.3)');
    px(MESA.x1, MESA.topo, MESA.x2 - MESA.x1, 12, '#f4efe6');
    px(MESA.x1, MESA.topo, MESA.x2 - MESA.x1, 1, '#fffaf2');
    px(MESA.x1, MESA.frente, MESA.x2 - MESA.x1, 12, '#e3dbcc');
    px(MESA.x1, MESA.frente, MESA.x2 - MESA.x1, 1, '#c9bfae');
    for (let i = 0, x = MESA.x1; x < MESA.x2; i++, x += 6) {
      const cor = i % 2 ? COR.laranja : COR.vermelho;
      px(x, 104, 6, 3, cor); px(x + 1, 107, 4, 1, cor);
    }
    px(130, 88, 6, 2, '#cfd6df'); px(184, 88, 6, 2, '#cfd6df');
    px(137, 86, 3, 4, '#7ec8ff'); px(180, 86, 3, 4, '#ff8a5c');
    // o bolo: o andar de baixo da Harley, o de cima da Sahara
    px(146, 91, 28, 2, '#cfd6df');
    px(149, 82, 22, 9, COR.preto); px(149, 82, 22, 2, COR.laranja);
    for (let x = 150; x < 171; x += 3) px(x, 84, 1, 1 + (x % 2), COR.laranja);
    px(149, 87, 22, 1, '#3a3a44');
    px(153, 75, 14, 7, COR.branco); px(153, 75, 14, 1, '#ffffff'); px(153, 79, 14, 2, COR.vermelho);
    for (const [x, c1, c2] of [[157, COR.laranja, COR.preto], [162, COR.vermelho, COR.branco]] as const) {
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
    px(52, 68, 2, 6, '#2f7a3a'); px(52, 66, 2, 2, '#245e2d');
    px(57, 70, 3, 4, COR.ambar); px(57, 69, 3, 1, '#fff6df');
    px(62, 70, 3, 4, COR.ambar); px(62, 69, 3, 1, '#fff6df');
  }
  function salgados() {
    px(250, 93, 36, 2, 'rgba(0,0,0,.28)');
    mesinha(254);
    px(255, 63, 15, 10, '#c89a5a'); px(255, 63, 15, 1, '#d8ad70'); px(257, 66, 11, 4, '#b48548');
    px(255, 72, 15, 2, '#b48548');
    px(256, 71, 13, 3, '#f2b544'); px(256, 71, 13, 1, '#e39b2b');
    for (const x of [258, 262, 266]) px(x, 72, 1, 1, '#b8322a');
    px(271, 73, 11, 1, '#cfd6df');
    for (const x of [272, 275, 278]) { px(x, 70, 2, 3, COR.coxinha); px(x, 70, 1, 1, '#f0a845'); }
    px(273, 68, 2, 2, COR.coxinha);
    px(283, 64, 2, 10, '#c22a2a'); px(283, 63, 2, 1, '#e8e8e8');
  }

  function roda(cx: number, cy: number, r: number, cravos = false) {
    for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
      const d = Math.hypot(x, y);
      let cor: string | null = null;
      if (d <= r + 0.3) {
        if (d > r - 2.5) cor = COR.pneu;
        else if (d > r - 3.6) cor = COR.cromo2;
        else if (d < 1.6) cor = COR.cromo;
        else if (x === 0 || y === 0 || Math.abs(x) === Math.abs(y)) cor = COR.cromo3;
      } else if (cravos && d <= r + 1.2 && Math.round(Math.atan2(y, x) * 8 / Math.PI) % 2 === 0) cor = COR.pneu;
      if (cor) px(cx + x, cy + y, 1, 1, cor);
    }
  }
  function harley() {
    g.save(); g.translate(motos.harley > 0 ? Math.floor(relogio * 30) % 2 : 0, 0);
    px(16, 149, 84, 3, 'rgba(0,0,0,.32)');
    px(14, 135, 40, 2, COR.cromo); px(16, 138, 36, 2, COR.cromo2); px(11, 134, 4, 4, COR.cromo3); px(13, 137, 4, 4, COR.cromo3);
    roda(32, 140, 10); roda(84, 140, 10);
    for (let a = Math.PI; a <= 2 * Math.PI; a += 0.05) px(32 + Math.cos(a) * 12, 140 + Math.sin(a) * 12, 2, 2, COR.preto);
    for (let a = Math.PI * 1.1; a <= 1.9 * Math.PI; a += 0.05) px(84 + Math.cos(a) * 12, 140 + Math.sin(a) * 12, 2, 1, COR.preto);
    linha(32, 140, 50, 131, 2, '#26262b');
    linha(72, 118, 60, 136, 2, '#26262b');
    px(47, 128, 18, 10, COR.cromo2);
    for (let i = 0; i < 4; i++) { px(46 + i, 126 - i * 2, 7, 2, i % 2 ? COR.cromo3 : COR.cromo); px(58 - i, 126 - i * 2, 7, 2, i % 2 ? COR.cromo3 : COR.cromo); }
    px(53, 131, 6, 4, '#5c6168');
    px(34, 117, 20, 5, '#3b2a20'); px(34, 117, 20, 1, '#5a4030'); px(31, 115, 4, 4, '#3b2a20');
    px(56, 112, 14, 1, COR.preto); px(52, 113, 22, 6, COR.preto); px(54, 119, 18, 2, COR.preto);
    px(54, 115, 18, 2, COR.laranja); px(58, 113, 8, 1, '#3a3a44');
    linha(77, 110, 84, 139, 2, COR.cromo);
    px(76, 101, 2, 10, COR.cromo); px(70, 100, 9, 2, COR.cromo); px(68, 100, 3, 2, '#111');
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (Math.hypot(x, y) <= 3.2) px(84 + x, 113 + y, 1, 1, Math.hypot(x, y) < 2 ? '#fff3b0' : COR.cromo);
    g.restore();
  }
  function sahara() {
    g.save(); g.translate(motos.sahara > 0 ? Math.floor(relogio * 34) % 2 : 0, 0);
    px(224, 149, 84, 3, 'rgba(0,0,0,.32)');
    roda(239, 139, 11, true); roda(292, 140, 10, true);
    linha(272, 127, 292, 140, 2, '#3a3a44');
    px(258, 116, 18, 13, '#2b2b31');
    for (let y = 118; y < 128; y += 2) px(260, y, 14, 1, '#8d949e');
    px(256, 129, 21, 3, COR.cromo2);
    linha(268, 104, 260, 126, 2, COR.vermelho);
    px(278, 108, 22, 4, '#26262b'); px(298, 108, 4, 4, COR.cromo2);
    px(272, 106, 26, 8, COR.branco); px(272, 110, 26, 2, COR.vermelho);
    px(294, 100, 11, 4, COR.vermelho); px(300, 98, 6, 2, COR.vermelho);
    px(264, 102, 34, 4, '#1b1b1f'); px(264, 102, 34, 1, '#34343a');
    px(252, 104, 20, 10, COR.vermelho); px(256, 107, 10, 3, COR.branco); px(254, 104, 14, 1, '#ef5468');
    linha(247, 104, 239, 138, 2, '#d4a73a');
    px(232, 112, 16, 3, COR.branco); px(232, 115, 14, 1, COR.vermelho);
    px(240, 97, 12, 14, COR.branco); px(240, 104, 12, 2, COR.vermelho);
    px(242, 100, 4, 4, '#fff3b0');
    px(243, 91, 7, 6, 'rgba(126,178,214,.85)'); px(243, 91, 7, 1, '#cfe6f5');
    px(250, 97, 10, 2, '#111'); px(256, 93, 1, 4, '#111'); px(255, 92, 3, 2, '#2a2a2a');
    g.restore();
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
    for (const k of ['harley', 'sahara'] as const) motos[k] = Math.max(0, motos[k] - dt);
    if (motos.harley > 0 && Math.random() < dt * 14) fumaca(10, 137, 1);
    if (motos.sahara > 0 && Math.random() < dt * 14) fumaca(303, 109, 1);
    particulas = particulas.filter((q) => (q.vida -= dt) > 0);
    for (const q of particulas) {
      if (q.tipo === 'confete') {
        if (q.y < q.chao) {
          q.vy = Math.min(38, q.vy + 160 * dt); q.vx *= 1 - dt * 1.6;
          q.x += (q.vx + Math.sin(relogio * 6 + q.fase) * 10) * dt; q.y += q.vy * dt;
        }
      } else { q.x += q.vx * dt; q.y += q.vy * dt; if (q.tipo === 'fumaca') q.tam += dt * 2; }
    }
    textos = textos.filter((k) => (k.vida -= dt) > 0);
    for (const k of textos) k.y += k.vy * dt;
  }

  // --- o quadro ---------------------------------------------------------------------------
  function desenhar(gar: Garagem, dt: number, luzes: boolean) {
    relogio += dt;
    atualizarEfeitos(dt);
    const festa = gar.festa;
    mesaA += ((gar.mesaNaTela ? 1 : 0) - mesaA) * Math.min(1, dt * 5);
    if (!gar.mesaNaTela && mesaA < 0.02) mesaA = 0;
    let alvoLuz = luzes ? 0.42 : 0;
    if (festa?.fase === 'reunindo') alvoLuz = Math.max(alvoLuz, 0.2);
    if (festa?.fase === 'cantando' && festa.t < ROTEIRO.ratimbum + 3.7) alvoLuz = 0.58;
    luz += (alvoLuz - luz) * Math.min(1, dt * 2.2);

    g.drawImage(fundo, 0, 0);
    telao(gar.mesaNaTela);
    if (mesaA > 0) {
      // as bandeirinhas descem junto com a mesa
      g.globalAlpha = mesaA;
      const bandeira = [COR.laranja, COR.preto, COR.vermelho, COR.branco];
      for (let x = 0; x <= W; x++) px(x, 3 + 4 * (1 - ((x - 160) / 160) ** 2), 1, 1, '#2b2b2b');
      for (let i = 0, x = 2; x < W; i++, x += 10) {
        const y0 = Math.round(4 + 4 * (1 - ((x + 4 - 160) / 160) ** 2));
        for (let r = 0; r < 7; r++) { const w = 8 - Math.floor(r * 8 / 7); px(x + (8 - w) / 2, y0 + r, Math.max(1, w), 1, bandeira[i % 4]); }
      }
      g.globalAlpha = 1;
    }
    for (const l of LAMPADAS) { px(l.x, l.y - 1, 2, 1, '#2b2b2b'); px(l.x, l.y, 2, 3, l.cor); }
    const coisas: { y: number; f: () => void }[] = [
      ...[...gar.bonecos.values()].map((b) => ({ y: b.y, f: () => boneco(b) })),
      { y: MESA.base, f: () => mesaDoBolo(gar.velas) },
      { y: BALCOES[0].base, f: bebidas },
      { y: BALCOES[1].base, f: salgados },
      { y: HARLEY.base, f: harley },
      { y: SAHARA.base + 0.1, f: sahara },
    ];
    coisas.sort((a, b) => a.y - b.y).forEach((k) => k.f());
    for (const q of particulas) {
      if (q.tipo === 'confete') {
        g.globalAlpha = Math.min(1, q.vida / 1.5);
        px(q.x, q.y, (Math.floor(relogio * 8 + q.fase) % 2) + 1, 1 + (Math.floor(relogio * 8 + q.fase + 1) % 2), q.cor);
      } else if (q.tipo === 'brilho') {
        g.globalAlpha = Math.min(1, q.vida * 2); px(q.x, q.y, 1, 1, q.cor);
      } else {
        g.globalAlpha = Math.min(0.55, q.vida * 0.5); const s = Math.round(q.tam); px(q.x - s / 2, q.y - s / 2, s, s, q.cor);
      }
      g.globalAlpha = 1;
    }

    c.imageSmoothingEnabled = false;
    c.drawImage(low, 0, 0, tela.width, tela.height);

    const fonte = (tam: number) => `700 ${Math.round(tam * S)}px ${FONTE}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = fonte(4.2); c.fillStyle = '#f2f2f2'; c.fillText('HARLEY', 44 * S, 31 * S);
    c.font = fonte(5.5); c.fillStyle = COR.laranja; c.fillText('ESTRADA', 44 * S, 53 * S);
    c.font = fonte(4.2); c.fillStyle = '#b3122e'; c.fillText('SAHARA', 276 * S, 31 * S);
    c.font = fonte(5.5); c.lineWidth = Math.max(1, 0.8 * S); c.strokeStyle = '#5a1a10'; c.strokeText('TRILHA', 276 * S, 53 * S);
    c.fillStyle = '#ffffff'; c.fillText('TRILHA', 276 * S, 53 * S);

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
      if (motos.harley > 0) furo(96, 118, 30, 0.7);
      if (motos.sahara > 0) furo(230, 104, 30, 0.7);
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
    if (gar.mesaNaTela && gar.velas) brilho(160, 67, 22 * (1 + Math.sin(relogio * 23) * 0.06), 'rgba(255,170,60,A)', (0.25 + luz * 0.55) * mesaA);
    if (luzes && !gar.festaAndando) {
      ['rgba(255,93,143,A)', 'rgba(126,200,255,A)', 'rgba(242,140,40,A)', 'rgba(155,255,155,A)'].forEach((cor, i) => {
        brilho(160 + Math.sin(relogio * 0.7 + i * 1.6) * 120, 124 + Math.cos(relogio * 0.9 + i * 2.1) * 40, 26, cor, 0.22);
      });
    }
    if (motos.harley > 0) brilho(92, 113, 26, 'rgba(255,243,176,A)', 0.35);
    if (motos.sahara > 0) brilho(236, 102, 26, 'rgba(255,243,176,A)', 0.35);
    c.restore();

    // o telão na festa: o parabéns no lugar do vídeo
    if (modoDoTelao === 'festa' && relogio >= chiadoAte) {
      c.save();
      c.font = fonte(10.5); c.shadowColor = '#ff4f9a'; c.shadowBlur = 6 * S;
      c.fillStyle = Math.floor(relogio * 3) % 9 === 0 ? 'rgba(255,120,180,.6)' : '#ff8cc0';
      c.fillText('PARABÉNS', 160 * S, 38 * S);
      c.font = fonte(5.6); c.shadowColor = '#ffb347'; c.shadowBlur = 4 * S; c.fillStyle = '#ffd9a0';
      c.fillText('TAVÃO & DONIS', 160 * S, 51 * S);
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
      const leg = legendaEm(festa.t);
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
        c.font = fonte(8); c.fillStyle = '#ffd27a'; c.fillText('Você apagou!', 160 * S, 90 * S);
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
      if (o.tipo === 'gole' || o.tipo === 'mordida') {
        textos.push({ texto: o.tipo === 'gole' ? 'glup!' : 'nhac!', x: o.x + 6, y: o.y - 24, vy: -10, vida: 1, cor: o.tipo === 'gole' ? '#ffd27a' : '#ffb36b', tam: 5 });
      } else if (o.tipo === 'soluco') {
        textos.push({ texto: 'hic!', x: o.x - 6, y: o.y - 24, vy: -8, vida: 0.9, cor: '#cfe6f5', tam: 4.5 });
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
    acelerar(moto) {
      if (motos[moto] > 0) return false;
      motos[moto] = 1.3;
      textos.push({ texto: 'VRUM!', x: moto === 'harley' ? 54 : 266, y: moto === 'harley' ? 100 : 90, vy: -10, vida: 1.2, cor: moto === 'harley' ? COR.laranja : '#ff5d6f', tam: 8 });
      return true;
    },
    pontoDe(e) {
      const r = tela.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
    },
  };
}

/**
 * Os temas da Garagem, em pixel: o que cada um põe na garagem (o dono, 27/10/2026: "moto, carro,
 * mecânica, jogos, pc gamer").
 *
 * Cada tema tem duas versões, uma para cada lado da garagem — o esquerdo é do primeiro aniversariante,
 * o direito do segundo, e com um só a garagem inteira é dele, com as duas versões do mesmo tema (como
 * a Harley e a Sahara, que eram o tema "moto" antes de haver temas). De cada lado o tema desenha:
 *
 * - o QUADRO na parede, com o letreiro (que vai em letra de verdade, na resolução da tela);
 * - a PEÇA grande no chão, que treme e faz barulho quando alguém clica (`agito`);
 * - o VÍDEO do telão, que alterna entre os dois lados a cada 12 s;
 * - o ANDAR DO BOLO (o de baixo é do lado esquerdo, o de cima do direito) e as velas;
 * - a ROUPA de festa de quem faz aniversário naquele lado.
 *
 * Tudo cabe nas caixas do `garagem.ts` (`PECAS`, `TELA` aqui): as peças trocam de desenho, mas o chão
 * que os pés não pisam é o mesmo em todo tema, e é isso que deixa o caminho e o servidor de fora.
 */
import type { Lado, Ponto, Roupa, Tema } from './garagem';

/** O que o desenho empresta ao tema: o pincel de pixel e o relógio. */
export type Pincel = {
  px(x: number, y: number, w: number, h: number, cor: string): void;
  linha(x0: number, y0: number, x1: number, y1: number, esp: number, cor: string): void;
  ctx: CanvasRenderingContext2D;
  relogio: number;
};
/** Letra de verdade por cima do pixel (o tamanho é em pixel da cena). */
export type Rotulo = { texto: string; x: number; y: number; tam: number; cor: string; contorno?: string };
export type SomDaPeca = 'harley' | 'sahara' | 'v8' | 'jipe' | 'elevador' | 'parafusadeira' | 'console' | 'danca' | 'teclado' | 'live';
/** O que a peça faz quando clicam: o grito, o som, onde a luz acende, e a fumaça ou as faíscas. */
export type AcaoDaPeca = { grito: string; cor: string; som: SomDaPeca; brilho: Ponto | null; fumaca: Ponto | null; faiscas?: Ponto | null };

export type DesenhoDoTema = {
  quadro(p: Pincel, lado: Lado): Rotulo[];
  peca(p: Pincel, lado: Lado, agito: number): void;
  acao(lado: Lado): AcaoDaPeca;
  video(p: Pincel, lado: Lado): void;
  andarDoBolo(p: Pincel, lado: Lado): void;
  velas: [[string, string], [string, string]];
};

export const TELA = { x: 100, y: 27, w: 120, h: 31 };
const COR = {
  laranja: '#f28c28', preto: '#1d1d22', vermelho: '#d7263d', branco: '#f2f2f2',
  cromo: '#c9ced6', cromo2: '#9aa1ab', cromo3: '#6d737c', pneu: '#18181c',
};
const volta = (v: number, n: number) => ((v % n) + n) % n;
const hex = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
export const mistura = (a: string, b: string, k: number) => {
  const [r1, g1, b1] = hex(a), [r2, g2, b2] = hex(b);
  return `rgb(${Math.round(r1 + (r2 - r1) * k)},${Math.round(g1 + (g2 - g1) * k)},${Math.round(b1 + (b2 - b1) * k)})`;
};

// --- peças que vários temas usam ------------------------------------------------------------

/** Uma roda grande de pixel: pneu, aro cromado e raios; com `cravos`, pneu de trilha. */
export function roda(p: Pincel, cx: number, cy: number, r: number, cravos = false, aro = COR.cromo2) {
  for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
    const d = Math.hypot(x, y);
    let cor: string | null = null;
    if (d <= r + 0.3) {
      if (d > r - 2.5) cor = COR.pneu;
      else if (d > r - 3.6) cor = aro;
      else if (d < 1.6) cor = COR.cromo;
      else if (x === 0 || y === 0 || Math.abs(x) === Math.abs(y)) cor = COR.cromo3;
    } else if (cravos && d <= r + 1.2 && Math.round(Math.atan2(y, x) * 8 / Math.PI) % 2 === 0) cor = COR.pneu;
    if (cor) p.px(cx + x, cy + y, 1, 1, cor);
  }
}

/** A rodinha do vídeo do telão, girando. */
function rodinha(p: Pincel, cx: number, cy: number, r: number) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.hypot(x, y);
    if (d <= r + 0.2 && d > r - 1.2) p.px(cx + x, cy + y, 1, 1, '#111114');
  }
  if (Math.floor(p.relogio * 14) % 2) { p.px(cx - 1, cy, 3, 1, '#9aa1ab'); p.px(cx, cy - 1, 1, 3, '#9aa1ab'); }
  else {
    for (const [dx, dy] of [[-1, -1], [1, 1], [1, -1], [-1, 1]]) p.px(cx + dx, cy + dy, 1, 1, '#9aa1ab');
    p.px(cx, cy, 1, 1, '#c9ced6');
  }
}

/** A moldura de madeira escura de todo quadro, com o fundo que o tema quiser dentro. */
function moldura(p: Pincel, x0: number, fundo: string) {
  p.px(x0, 25, 54, 35, '#2a1a14');
  p.px(x0 + 1, 26, 52, 33, fundo);
}
const QUADRO_X: Record<Lado, number> = { 0: 17, 1: 249 };
/** O centro do quadro de cada lado. */
const QX: Record<Lado, number> = { 0: 44, 1: 276 };

/** As linhas de TV por cima de todo vídeo. */
function linhasDeTv(p: Pincel) {
  for (let y = TELA.y; y < TELA.y + TELA.h; y += 2) p.px(TELA.x, y, TELA.w, 1, 'rgba(0,0,0,.16)');
}

/**
 * Os dois cenários de estrada do telão (o pôr do sol no asfalto, e a trilha no deserto), em que cada
 * tema põe o veículo dele: era o vídeo da Harley e da Sahara, e serve ao carro e ao guincho igual.
 */
function cenario(p: Pincel, trilha: boolean, vel: number) {
  const { x: X, y: Y, w: L } = TELA;
  const t = p.relogio;
  const ceu = trilha ? ['#ffe6b0', '#ffae66'] : ['#2e2556', '#ff8a5c'];
  for (let i = 0; i < 6; i++) p.px(X, Y + i * 4, L, 4, mistura(ceu[0], ceu[1], i / 5));
  for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (Math.hypot(x, y) <= 4.2) p.px(X + 92 + x, Y + 12 + y, 1, 1, trilha ? '#fff4cf' : '#ffd27a');
  for (let x = X; x < X + L; x++) {
    const u = x + t * vel * 0.15;
    const h = Math.round(Y + 15 + Math.sin(u / 11) * 3 + Math.sin(u / 5.3) * 1.2);
    p.px(x, h, 1, Y + 22 - h, trilha ? '#e3a05a' : '#5a3a6e');
    const u2 = x + t * vel * 0.45;
    const h2 = Math.round(Y + 19 + Math.sin(u2 / 7) * 1.6);
    p.px(x, h2, 1, Y + 22 - h2, trilha ? '#c77c3a' : '#2f2a40');
  }
  if (trilha) {
    p.px(X, Y + 22, L, 9, '#b07a45'); p.px(X, Y + 22, L, 1, '#c99460');
    for (let k = 0; k < 16; k++) p.px(X + volta(k * 29 - t * vel, L), Y + 24 + (k % 4) * 2, 1 + (k % 2), 1, '#8a5a30');
    for (let k = 0; k < 3; k++) {
      const cx = X + volta(k * 55 + 20 - t * vel * 0.45, L + 20) - 10;
      p.px(cx, Y + 15, 2, 7, '#3f7a3a'); p.px(cx - 2, Y + 17, 2, 1, '#3f7a3a'); p.px(cx - 2, Y + 15, 1, 2, '#3f7a3a');
      p.px(cx + 2, Y + 18, 2, 1, '#3f7a3a'); p.px(cx + 3, Y + 16, 1, 2, '#3f7a3a');
    }
  } else {
    p.px(X, Y + 22, L, 9, '#2b2b31'); p.px(X, Y + 22, L, 1, '#5c6168');
    for (let k = -1; k < L / 12 + 1; k++) p.px(X + k * 12 - volta(t * vel, 12), Y + 26, 6, 1, '#f2e6a0');
    for (let k = 0; k < 5; k++) { const x = X + volta(k * 30 - t * vel, L + 10) - 5; p.px(x, Y + 18, 1, 4, '#8d949e'); p.px(x, Y + 18, 1, 1, '#f28c28'); }
  }
  // a poeira (ou a fumaça) ficando para trás
  const bx = X + 46, by = Y + 28;
  for (let k = 0; k < 6; k++) {
    const d = volta(t * vel * 0.6 + k * 7, 30);
    p.ctx.globalAlpha = Math.max(0, 0.7 - d / 34);
    p.px(bx - 12 - d, by - 1 - (k % 2) - Math.floor(d / 10), 2, 1, trilha ? '#e8c08a' : '#9aa1ab');
  }
  p.ctx.globalAlpha = 1;
}

// --- moto: a Harley e a Sahara (o tema de antes dos temas) ----------------------------------

const moto: DesenhoDoTema = {
  quadro(p, lado) {
    const x0 = QUADRO_X[lado];
    if (lado === 0) {
      // roda com asas, preto e laranja
      p.px(x0, 25, 54, 35, '#2a1a14'); p.px(x0 + 1, 26, 52, 33, '#121215');
      p.px(x0 + 1, 26, 52, 1, COR.laranja); p.px(x0 + 1, 58, 52, 1, COR.laranja);
      for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) {
        const d = Math.hypot(x, y);
        if ((d <= 6.3 && d > 4.2) || d <= 1.5) p.px(44 + x, 41 + y, 1, 1, COR.laranja);
        else if (d <= 4.2 && (x === 0 || y === 0)) p.px(44 + x, 41 + y, 1, 1, '#8a4c14');
      }
      for (let i = 0; i < 4; i++) {
        p.px(23 + i * 2, 37 + i * 2, 13 - i * 2, 1, i % 2 ? '#c96f1c' : COR.laranja);
        p.px(52, 37 + i * 2, 13 - i * 2, 1, i % 2 ? '#c96f1c' : COR.laranja);
      }
      return [
        { texto: 'HARLEY', x: 44, y: 31, tam: 4.2, cor: '#f2f2f2' },
        { texto: 'ESTRADA', x: 44, y: 53, tam: 5.5, cor: COR.laranja },
      ];
    }
    // sol sobre as dunas
    p.px(x0, 25, 54, 35, '#2a1a14');
    const ceu = p.ctx.createLinearGradient(0, 26, 0, 58);
    ceu.addColorStop(0, '#ffe3a6'); ceu.addColorStop(1, '#f39a45');
    p.ctx.fillStyle = ceu; p.ctx.fillRect(x0 + 1, 26, 52, 33);
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (Math.hypot(x, y) <= 5.2) p.px(289 + x, 40 + y, 1, 1, '#fff4cf');
    for (let x = 250; x < 302; x++) {
      const d1 = Math.round(48 + Math.sin((x - 250) / 9) * 3);
      const d2 = Math.round(52 + Math.sin((x - 240) / 6) * 2);
      p.px(x, d1, 1, 59 - d1, '#d9883a');
      p.px(x, d2, 1, 59 - d2, '#b8652a');
    }
    return [
      { texto: 'SAHARA', x: 276, y: 31, tam: 4.2, cor: '#b3122e' },
      { texto: 'TRILHA', x: 276, y: 53, tam: 5.5, cor: '#ffffff', contorno: '#5a1a10' },
    ];
  },
  peca(p, lado, agito) {
    const { px, linha } = p;
    p.ctx.save(); p.ctx.translate(agito > 0 ? Math.floor(p.relogio * (lado ? 34 : 30)) % 2 : 0, 0);
    if (lado === 0) {
      px(16, 149, 84, 3, 'rgba(0,0,0,.32)');
      px(14, 135, 40, 2, COR.cromo); px(16, 138, 36, 2, COR.cromo2); px(11, 134, 4, 4, COR.cromo3); px(13, 137, 4, 4, COR.cromo3);
      roda(p, 32, 140, 10); roda(p, 84, 140, 10);
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
    } else {
      px(224, 149, 84, 3, 'rgba(0,0,0,.32)');
      roda(p, 239, 139, 11, true); roda(p, 292, 140, 10, true);
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
    }
    p.ctx.restore();
  },
  acao: (lado) => lado === 0
    ? { grito: 'VRUM!', cor: COR.laranja, som: 'harley', brilho: { x: 92, y: 113 }, fumaca: { x: 10, y: 137 } }
    : { grito: 'VRUM!', cor: '#ff5d6f', som: 'sahara', brilho: { x: 236, y: 102 }, fumaca: { x: 303, y: 109 } },
  video(p, lado) {
    const trilha = lado === 1;
    cenario(p, trilha, trilha ? 46 : 62);
    const { px, linha } = p;
    const bx = TELA.x + 46;
    const by = TELA.y + 28 + (trilha && Math.floor(p.relogio * 10) % 3 === 0 ? -1 : 0);
    if (!trilha) {
      rodinha(p, bx - 7, by, 3); rodinha(p, bx + 8, by, 3);
      px(bx - 9, by - 1, 10, 1, '#c9ced6'); px(bx - 2, by - 3, 5, 3, '#9aa1ab');
      px(bx - 10, by - 4, 4, 1, '#1d1d22'); px(bx - 6, by - 5, 6, 1, '#3b2a20');
      px(bx, by - 6, 6, 2, '#1d1d22'); px(bx + 1, by - 6, 4, 1, '#f28c28');
      linha(bx + 6, by - 7, bx + 8, by, 1, '#c9ced6'); px(bx + 5, by - 9, 3, 1, '#c9ced6'); px(bx + 8, by - 6, 1, 2, '#fff3b0');
      px(bx - 3, by - 7, 3, 2, '#2b3a55'); px(bx - 4, by - 12, 4, 5, '#1d1d22'); px(bx - 4, by - 10, 4, 1, '#f28c28');
      px(bx, by - 11, 5, 1, '#1d1d22'); px(bx - 4, by - 15, 4, 3, '#1d1d22'); px(bx - 1, by - 14, 1, 1, '#7a8090');
    } else {
      rodinha(p, bx - 8, by, 3); rodinha(p, bx + 8, by, 3);
      px(bx - 3, by - 5, 5, 3, '#2b2b31'); px(bx - 6, by - 2, 4, 1, '#3a3a44');
      px(bx - 11, by - 9, 7, 1, '#f2f2f2'); px(bx - 12, by - 10, 2, 1, '#d7263d');
      px(bx - 7, by - 9, 8, 1, '#1b1b1f'); px(bx - 1, by - 8, 6, 2, '#d7263d'); px(bx + 1, by - 7, 2, 1, '#f2f2f2');
      linha(bx + 5, by - 10, bx + 8, by, 1, '#d4a73a'); px(bx + 6, by - 6, 4, 1, '#f2f2f2'); px(bx + 5, by - 12, 2, 2, '#7fb2d6');
      px(bx - 3, by - 10, 3, 2, '#555a66'); px(bx - 4, by - 15, 4, 5, '#f2f2f2'); px(bx - 4, by - 15, 4, 1, '#d7263d');
      px(bx, by - 14, 5, 1, '#d7263d'); px(bx - 4, by - 18, 4, 3, '#d7263d'); px(bx - 3, by - 17, 2, 1, '#f2f2f2');
    }
    linhasDeTv(p);
  },
  andarDoBolo(p, lado) {
    const { px } = p;
    if (lado === 0) {
      px(149, 82, 22, 9, COR.preto); px(149, 82, 22, 2, COR.laranja);
      for (let x = 150; x < 171; x += 3) px(x, 84, 1, 1 + (x % 2), COR.laranja);
      px(149, 87, 22, 1, '#3a3a44');
    } else {
      px(153, 75, 14, 7, COR.branco); px(153, 75, 14, 1, '#ffffff'); px(153, 79, 14, 2, COR.vermelho);
    }
  },
  velas: [[COR.laranja, COR.preto], [COR.vermelho, COR.branco]],
};

// --- carro: o V8 vermelho e o jipe da trilha ------------------------------------------------

/** O carrinho do telão: o esportivo baixo (lado 0) ou o jipe alto (lado 1). */
function carrinho(p: Pincel, bx: number, by: number, jipe: boolean) {
  const { px } = p;
  if (!jipe) {
    rodinha(p, bx - 8, by, 3); rodinha(p, bx + 8, by, 3);
    px(bx - 13, by - 4, 26, 3, '#d7263d'); px(bx - 13, by - 4, 26, 1, '#ef5468');
    px(bx - 6, by - 7, 12, 3, '#d7263d'); px(bx - 4, by - 6, 4, 2, '#7fb2d6'); px(bx + 1, by - 6, 4, 2, '#7fb2d6');
    px(bx - 13, by - 2, 26, 1, '#1d1d22'); px(bx + 12, by - 4, 2, 1, '#fff3b0'); px(bx - 14, by - 4, 1, 1, '#ff4040');
  } else {
    rodinha(p, bx - 8, by, 4); rodinha(p, bx + 8, by, 4);
    px(bx - 12, by - 7, 24, 5, '#2a9d8f'); px(bx - 12, by - 7, 24, 1, '#47c0b1');
    px(bx - 4, by - 13, 15, 6, '#2a9d8f'); px(bx - 2, by - 12, 5, 4, '#cfe6f5'); px(bx + 4, by - 12, 5, 4, '#cfe6f5');
    px(bx - 5, by - 14, 17, 1, '#1d1d22'); px(bx + 11, by - 6, 2, 2, '#fff3b0');
    px(bx - 15, by - 10, 3, 6, '#1d1d22');
  }
}

const carro: DesenhoDoTema = {
  quadro(p, lado) {
    const x0 = QUADRO_X[lado];
    const { px } = p;
    if (lado === 0) {
      // as duas bandeiras quadriculadas cruzadas, e o troféu no meio
      moldura(p, x0, '#121215');
      px(x0 + 1, 26, 52, 1, COR.vermelho); px(x0 + 1, 58, 52, 1, COR.vermelho);
      for (let i = 0; i < 14; i++) { px(x0 + 9 + i, 48 - i, 1, 1, '#9aa1ab'); px(x0 + 44 - i, 48 - i, 1, 1, '#9aa1ab'); }
      for (const fx of [x0 + 13, x0 + 29]) {
        for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) {
          px(fx + x, 33 + y + Math.round(Math.sin(x / 3) * 0.6), 1, 1, ((x >> 1) + (y >> 1)) % 2 ? '#f2f2f2' : '#18181c');
        }
      }
      px(x0 + 24, 44, 6, 4, '#e8b93a'); px(x0 + 23, 43, 8, 1, '#ffd76a'); px(x0 + 26, 48, 2, 2, '#c9962a'); px(x0 + 24, 50, 6, 1, '#c9962a');
      return [
        { texto: 'V8', x: QX[0], y: 31, tam: 4.2, cor: '#f2f2f2' },
        { texto: 'CORRIDA', x: QX[0], y: 54, tam: 5.5, cor: COR.vermelho },
      ];
    }
    // o velocímetro com o ponteiro no vermelho
    moldura(p, x0, '#0f2a2c');
    const cx = QX[1], cy = 46;
    for (let a = Math.PI * 0.85; a <= Math.PI * 2.15; a += 0.06) {
      const vermelho = a > Math.PI * 1.85;
      px(cx + Math.cos(a) * 13, cy + Math.sin(a) * 13, 1, 1, vermelho ? '#ff4d4d' : '#9fe8df');
    }
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI * 0.85 + k * (Math.PI * 1.3 / 8);
      px(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11, 1, 1, '#f2f2f2');
    }
    p.linha(cx, cy, cx + Math.cos(Math.PI * 1.95) * 10, cy + Math.sin(Math.PI * 1.95) * 10, 1, '#ff4d4d');
    px(cx - 1, cy - 1, 3, 3, '#f2f2f2');
    return [
      { texto: '4X4', x: QX[1], y: 31, tam: 4.2, cor: '#9fe8df' },
      { texto: 'TERRA', x: QX[1], y: 54, tam: 5.5, cor: '#ffd27a', contorno: '#3a2410' },
    ];
  },
  peca(p, lado, agito) {
    const { px } = p;
    p.ctx.save(); p.ctx.translate(agito > 0 ? Math.floor(p.relogio * 30) % 2 : 0, agito > 0 ? Math.floor(p.relogio * 22) % 2 : 0);
    if (lado === 0) {
      // o V8: baixo, comprido, vermelho com a faixa preta, de frente para a direita
      px(14, 149, 84, 3, 'rgba(0,0,0,.32)');
      px(12, 127, 84, 14, '#c11f33'); px(12, 127, 84, 1, '#e24a5c');
      px(14, 125, 24, 2, '#c11f33'); px(72, 125, 22, 2, '#c11f33');
      px(36, 116, 38, 11, '#c11f33'); px(38, 115, 32, 1, '#e24a5c');
      px(40, 118, 13, 8, '#2a3550'); px(41, 118, 4, 2, '#5a6d93');
      px(55, 118, 15, 8, '#2a3550'); px(56, 118, 4, 2, '#5a6d93');
      px(53, 117, 2, 10, '#a3172a');
      px(12, 132, 84, 2, '#1d1d22');
      px(74, 127, 18, 1, '#1d1d22'); px(76, 126, 14, 1, '#1d1d22');
      px(93, 129, 3, 3, '#fff3b0'); px(11, 129, 2, 3, '#ff4040');
      px(92, 134, 5, 4, COR.cromo); px(10, 134, 4, 4, COR.cromo);
      px(6, 141, 8, 2, COR.cromo3);
      for (const cx of [28, 80]) {
        for (let a = Math.PI; a <= 2 * Math.PI; a += 0.05) px(cx + Math.cos(a) * 11, 140 + Math.sin(a) * 11, 2, 2, '#5a0d18');
        roda(p, cx, 140, 9, false, '#d7dbe2');
      }
      px(60, 135, 10, 2, '#e8e8e8');
    } else {
      // o jipe 4x4: alto, verde-água, pneu de trilha e estepe atrás, de frente para a esquerda
      px(226, 149, 82, 3, 'rgba(0,0,0,.32)');
      px(230, 116, 72, 18, '#2a9d8f'); px(230, 116, 72, 1, '#47c0b1');
      px(252, 104, 46, 12, '#2a9d8f'); px(252, 103, 46, 2, '#1d1d22');
      px(251, 101, 48, 1, '#4a4a55'); for (const x of [253, 274, 296]) px(x, 101, 1, 2, '#4a4a55');
      px(255, 106, 8, 9, '#cfe6f5'); px(255, 106, 8, 2, '#ffffff');
      px(266, 106, 13, 8, '#1f3a44'); px(282, 106, 13, 8, '#1f3a44'); px(267, 106, 4, 2, '#3f6a78');
      px(250, 106, 2, 14, '#1d1d22'); px(249, 105, 4, 2, '#1d1d22');
      px(227, 118, 4, 12, '#1d1d22'); for (let y = 119; y < 129; y += 2) px(228, y, 3, 1, '#4a4a55');
      px(229, 119, 3, 3, '#fff3b0');
      px(225, 129, 8, 5, '#1d1d22');
      px(232, 128, 70, 2, '#1f7a6f');
      for (const k of [[238, 131], [262, 130], [286, 132], [296, 129]]) px(k[0], k[1], 3, 2, '#8a5a30');
      px(302, 108, 5, 18, '#18181c'); px(303, 112, 3, 10, '#4a4a55');
      for (const cx of [244, 290]) {
        px(cx - 13, 125, 26, 3, '#1d1d22');
        roda(p, cx, 139, 10, true);
      }
    }
    p.ctx.restore();
  },
  acao: (lado) => lado === 0
    ? { grito: 'VRUUM!', cor: '#ff5d6f', som: 'v8', brilho: { x: 96, y: 130 }, fumaca: { x: 7, y: 141 } }
    : { grito: 'VRUM!', cor: '#47c0b1', som: 'jipe', brilho: { x: 228, y: 120 }, fumaca: { x: 306, y: 132 } },
  video(p, lado) {
    const jipe = lado === 1;
    cenario(p, jipe, jipe ? 46 : 70);
    carrinho(p, TELA.x + 46, TELA.y + 28 + (jipe && Math.floor(p.relogio * 10) % 3 === 0 ? -1 : 0), jipe);
    linhasDeTv(p);
  },
  andarDoBolo(p, lado) {
    const { px } = p;
    if (lado === 0) {
      // o pneu: preto com a banda de rodagem, e a faixa vermelha do V8
      px(149, 82, 22, 9, '#1d1d22'); px(149, 82, 22, 1, '#3a3a44');
      for (let x = 150; x < 171; x += 2) px(x, 83 + (x % 4 ? 0 : 1), 1, 2, '#4a4a55');
      px(149, 87, 22, 2, COR.vermelho);
    } else {
      // a bandeira quadriculada
      for (let y = 0; y < 7; y++) for (let x = 0; x < 14; x++) p.px(153 + x, 75 + y, 1, 1, ((x >> 1) + (y >> 1)) % 2 ? '#f2f2f2' : '#18181c');
    }
  },
  velas: [[COR.vermelho, COR.branco], ['#18181c', '#f2f2f2']],
};

// --- mecânica: o elevador com o carro e a bancada de ferramentas ----------------------------

/** Uma engrenagem de pixel: o anel com os dentes e o furo no meio. */
function engrenagem(p: Pincel, cx: number, cy: number, r: number, cor: string, furo: string, giro = 0) {
  for (let y = -r - 2; y <= r + 2; y++) for (let x = -r - 2; x <= r + 2; x++) {
    const d = Math.hypot(x, y);
    const dente = Math.cos(Math.atan2(y, x) * 8 + giro) > 0.3 && d <= r + 2 && d > r - 1;
    if ((d <= r && d > r * 0.45) || dente) p.px(cx + x, cy + y, 1, 1, cor);
    else if (d <= r * 0.45) p.px(cx + x, cy + y, 1, 1, furo);
  }
}
/** Uma chave de boca, de uma ponta à outra, com a boca aberta nas duas. */
function chave(p: Pincel, x0: number, y0: number, x1: number, y1: number, cor: string, fundo: string) {
  p.linha(x0, y0, x1, y1, 2, cor);
  for (const [x, y] of [[x0, y0], [x1, y1]]) { p.px(x - 2, y - 2, 5, 5, cor); p.px(x - 1, y - 2, 2, 2, fundo); }
}

const mecanica: DesenhoDoTema = {
  quadro(p, lado) {
    const x0 = QUADRO_X[lado];
    const { px } = p;
    if (lado === 0) {
      // a placa da oficina: as duas chaves cruzadas sobre a engrenagem
      moldura(p, x0, '#1e2128');
      px(x0 + 1, 26, 52, 1, '#f2a93a'); px(x0 + 1, 58, 52, 1, '#f2a93a');
      chave(p, 33, 36, 55, 47, '#c9ced6', '#1e2128');
      chave(p, 55, 36, 33, 47, '#c9ced6', '#1e2128');
      engrenagem(p, 44, 41, 5, '#f2a93a', '#1e2128');
      return [
        { texto: 'AUTO', x: QX[0], y: 31, tam: 4.2, cor: '#f2f2f2' },
        { texto: 'OFICINA', x: QX[0], y: 54, tam: 5.5, cor: '#f2a93a' },
      ];
    }
    // o pôster do pistão
    moldura(p, x0, '#13243a');
    px(270, 34, 13, 7, '#c9ced6'); px(270, 34, 13, 1, '#ffffff');
    px(270, 36, 13, 1, '#6d737c'); px(270, 38, 13, 1, '#6d737c');
    p.linha(276, 41, 276, 45, 2, '#9aa1ab');
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (Math.hypot(x, y) <= 2.3) px(277 + x, 47 + y, 1, 1, '#6d737c');
    px(284, 34, 1, 2, '#ffd23f'); px(285, 35, 1, 2, '#ffd23f'); px(268, 35, 1, 2, '#ffd23f');
    return [
      { texto: 'V6', x: QX[1], y: 30.5, tam: 4.2, cor: '#f2f2f2' },
      { texto: 'MOTOR', x: QX[1], y: 54, tam: 5.5, cor: '#7ec8ff' },
    ];
  },
  peca(p, lado, agito) {
    const { px } = p;
    if (lado === 0) {
      // o elevador: as duas colunas, os braços e o carro lá em cima (sobe um pouco quando clicam)
      const sobe = agito > 0 ? -Math.round(Math.sin((1.3 - agito) / 1.3 * Math.PI) * 5) : 0;
      px(10, 149, 88, 3, 'rgba(0,0,0,.32)');
      px(36, 146, 30, 3, '#2b2b31'); px(38, 149, 2, 1, '#111'); px(62, 149, 2, 1, '#111');
      px(52, 139, 12, 5, '#18181c'); px(52, 139, 12, 1, '#3a3a44'); px(55, 137, 6, 2, '#2b2b31');
      for (const cx of [12, 88]) {
        px(cx, 100, 6, 47, '#e0b030'); px(cx, 100, 6, 1, '#f5d36a'); px(cx + 4, 101, 2, 45, '#b88a1a');
        for (let y = 132; y < 146; y += 4) px(cx, y, 6, 2, '#1d1d22');
        px(cx - 2, 146, 10, 4, '#6d737c'); px(cx - 2, 146, 10, 1, '#9aa1ab');
      }
      const yb = 125 + sobe;
      px(18, yb, 14, 2, '#6d737c'); px(74, yb, 14, 2, '#6d737c'); px(16, yb - 1, 4, 4, '#9aa1ab'); px(86, yb - 1, 4, 4, '#9aa1ab');
      const yc = sobe;
      px(22, 111 + yc, 62, 12, '#4a6a8a'); px(22, 111 + yc, 62, 1, '#6d8fb3');
      px(36, 102 + yc, 32, 9, '#4a6a8a'); px(37, 101 + yc, 30, 1, '#6d8fb3');
      px(39, 104 + yc, 12, 6, '#1f3a44'); px(53, 104 + yc, 13, 6, '#1f3a44'); px(40, 104 + yc, 3, 2, '#3f6a78');
      px(20, 115 + yc, 3, 4, '#c9ced6'); px(83, 115 + yc, 3, 4, '#c9ced6'); px(83, 112 + yc, 2, 2, '#fff3b0'); px(22, 112 + yc, 1, 2, '#ff4040');
      px(24, 122 + yc, 58, 2, '#2a3a4a');
      roda(p, 33, 125 + yc, 6); roda(p, 73, 125 + yc, 6);
      // a lâmpada de trabalho pendurada embaixo
      p.linha(56, 124 + yc, 56, 129 + yc, 1, '#3a3a44'); px(55, 129 + yc, 3, 3, '#ffd23f');
    } else {
      // a bancada: o painel perfurado com as ferramentas, a morsa, o esmeril e o carrinho vermelho
      px(226, 149, 82, 3, 'rgba(0,0,0,.32)');
      px(227, 91, 60, 34, '#7a5232'); px(228, 92, 58, 32, '#c9a26b'); px(228, 92, 58, 1, '#e0bf8a');
      for (let y = 95; y < 122; y += 4) for (let x = 231; x < 285; x += 4) px(x, y, 1, 1, '#9a7a4a');
      for (const [x, h] of [[233, 14], [237, 18], [241, 10]] as const) { px(x, 98, 1, h, '#9aa1ab'); px(x - 1, 96, 3, 2, '#9aa1ab'); }
      px(250, 99, 2, 15, '#7a5232'); px(246, 96, 10, 4, '#6d737c'); px(246, 96, 10, 1, '#9aa1ab');
      for (const [x, cor] of [[260, '#d7263d'], [264, '#e0b030'], [268, '#3f7fe0']] as const) { px(x, 97, 2, 5, cor); px(x, 102, 1, 8, '#c9ced6'); }
      p.linha(274, 113, 278, 101, 1, '#d7263d'); p.linha(282, 113, 278, 101, 1, '#d7263d'); px(277, 97, 2, 4, '#6d737c');
      px(226, 124, 64, 4, '#7a5232'); px(226, 124, 64, 1, '#946644'); px(226, 128, 64, 2, '#5a3a22');
      px(228, 130, 3, 20, '#5a3a22'); px(285, 130, 3, 20, '#5a3a22'); px(228, 140, 60, 2, '#5a3a22');
      px(234, 134, 10, 6, '#2b4a7a'); px(248, 135, 8, 5, '#d7263d'); px(262, 133, 5, 7, '#e0b030'); px(263, 132, 2, 1, '#e0b030');
      px(231, 119, 10, 5, '#3a5a8a'); px(229, 121, 2, 2, '#6d737c'); px(241, 120, 3, 1, '#9aa1ab');
      const gira = agito > 0 && Math.floor(p.relogio * 30) % 2;
      px(270, 119, 10, 5, '#2a6a3a'); px(271, 119, 8, 1, '#3f8a52');
      px(267, 116, 3, 8, gira ? '#9aa1ab' : '#6d737c'); px(280, 116, 3, 8, gira ? '#6d737c' : '#9aa1ab');
      px(292, 108, 15, 40, '#c11f33'); px(292, 108, 15, 1, '#e24a5c');
      for (let y = 114; y < 146; y += 6) { px(293, y, 13, 1, '#7a1020'); px(297, y + 2, 5, 1, '#c9ced6'); }
      px(291, 105, 17, 2, '#c9ced6'); px(293, 148, 3, 2, '#111'); px(303, 148, 3, 2, '#111');
    }
  },
  acao: (lado) => lado === 0
    ? { grito: 'TSSS!', cor: '#f5d36a', som: 'elevador', brilho: { x: 56, y: 130 }, fumaca: null }
    : { grito: 'TRRRR!', cor: '#ffd23f', som: 'parafusadeira', brilho: { x: 275, y: 118 }, fumaca: null, faiscas: { x: 275, y: 118 } },
  video(p, lado) {
    const { x: X, y: Y, w: L } = TELA;
    const { px } = p;
    const t = p.relogio;
    if (lado === 1) {
      // o guincho na estrada, levando um carrinho
      cenario(p, false, 55);
      const bx = X + 46, by = Y + 28;
      rodinha(p, bx - 12, by, 3); rodinha(p, bx + 2, by, 3); rodinha(p, bx + 12, by, 3);
      px(bx - 18, by - 4, 26, 2, '#6d737c');
      px(bx - 16, by - 8, 18, 4, '#4a6a8a'); px(bx - 12, by - 11, 9, 3, '#4a6a8a');
      px(bx - 11, by - 10, 3, 2, '#cfe6f5'); px(bx - 7, by - 10, 3, 2, '#cfe6f5');
      px(bx - 14, by - 5, 3, 2, '#111'); px(bx - 2, by - 5, 3, 2, '#111');
      px(bx + 8, by - 11, 10, 9, '#e0b030'); px(bx + 12, by - 9, 5, 3, '#cfe6f5'); px(bx + 8, by - 4, 12, 2, '#b88a1a');
      px(bx + 10, by - 13, 6, 2, Math.floor(t * 6) % 2 ? '#ff8a2e' : '#ffd23f');
      linhasDeTv(p);
      return;
    }
    // o motor: os quatro pistões subindo e descendo, com a faísca da vela em cima
    px(X, Y, L, TELA.h, '#0e1420'); px(X, Y + 24, L, 7, '#141c2c');
    engrenagem(p, X + 12, Y + 10, 5, '#1f2a3d', '#0e1420', t * 3);
    engrenagem(p, X + 108, Y + 20, 6, '#1f2a3d', '#0e1420', -t * 2.5);
    px(X + 30, Y + 14, 60, 13, '#5c6168'); px(X + 30, Y + 14, 60, 1, '#8d949e');
    for (let i = 0; i < 4; i++) {
      const cx = X + 35 + i * 13;
      const fase = t * 14 + i * Math.PI / 2;
      const py = Y + 5 + Math.round((1 - Math.cos(fase)) * 3);
      px(cx - 1, Y + 3, 1, 12, '#3a3f48'); px(cx + 9, Y + 3, 1, 12, '#3a3f48');
      px(cx, py, 9, 5, '#c9ced6'); px(cx, py, 9, 1, '#ffffff'); px(cx, py + 2, 9, 1, '#9aa1ab');
      p.linha(cx + 4, py + 5, cx + 4 + Math.round(Math.sin(fase) * 2), Y + 24, 1, '#9aa1ab');
      if (Math.cos(fase) > 0.9) { px(cx + 3, Y + 1, 3, 2, '#ffd23f'); px(cx + 4, Y, 1, 1, '#ffffff'); }
    }
    px(X + 32, Y + 24, 56, 2, '#3a3f48');
    for (let k = 0; k < 5; k++) {
      const d = volta(t * 30 + k * 6, 28);
      p.ctx.globalAlpha = Math.max(0, 0.6 - d / 30);
      px(X + 92 + d, Y + 16 - Math.floor(d / 6), 2, 2, '#8d949e');
    }
    p.ctx.globalAlpha = 1;
    linhasDeTv(p);
  },
  andarDoBolo(p, lado) {
    const { px } = p;
    if (lado === 0) {
      // a engrenagem: cinza, com os dentes em cima e os parafusos
      px(149, 82, 22, 9, '#8d949e'); px(149, 82, 22, 1, '#c9ced6');
      for (let x = 149; x < 171; x += 4) px(x, 81, 2, 1, '#8d949e');
      for (const x of [152, 159, 166]) px(x, 85, 2, 2, '#4a4f58');
      px(149, 89, 22, 1, '#6d737c');
    } else {
      // o laranja da oficina, com a chave por cima
      px(153, 75, 14, 7, '#d9822b'); px(153, 75, 14, 1, '#f2a93a');
      p.linha(155, 80, 164, 77, 1, '#e8e8e8'); px(164, 76, 2, 2, '#e8e8e8');
    }
  },
  velas: [['#8d949e', '#1d1d22'], ['#d9822b', '#f2f2f2']],
};

// --- videogame: a TV com o console e a máquina de dança --------------------------------------

const CORACAO = ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....'];

/** O joguinho de plataforma (no telão e na TV): o herói de moletom correndo e pulando os canos. */
function plataforma(p: Pincel, X: number, Y: number, L: number, A: number, k = 1) {
  const { px } = p;
  const t = p.relogio;
  const vel = 30 * k;
  for (let i = 0; i < 5; i++) px(X, Y + Math.floor(i * A / 5), L, Math.ceil(A / 5), mistura('#5aa0ff', '#bfe3ff', i / 4));
  for (let c = 0; c < 3; c++) {
    const cx = X + volta(c * 47 + 10 - t * vel * 0.2, L + 20) - 10;
    px(cx, Y + 4 + (c % 2) * 3, 9, 2, '#ffffff'); px(cx + 2, Y + 3 + (c % 2) * 3, 5, 1, '#ffffff');
  }
  const chao = Y + A - 6;
  px(X, chao, L, 6, '#c8662a'); px(X, chao, L, 1, '#e58a4a');
  for (let x = 0; x < L; x += 6) px(X + volta(x - t * vel, L), chao + 3, 1, 3, '#8a3f14');
  for (let c = 0; c < 3; c++) {
    const cx = X + volta(c * 50 + 30 - t * vel, L + 20) - 10;
    px(cx, chao - 7, 8, 7, '#2fae4a'); px(cx - 1, chao - 8, 10, 2, '#3fce5a'); px(cx + 1, chao - 6, 1, 6, '#5fe07a');
  }
  for (let c = 0; c < 4; c++) {
    const cx = X + volta(c * 31 + 18 - t * vel, L + 10) - 5;
    if (Math.floor(t * 6 + c) % 3) px(cx, chao - 14, 2, 3, '#fde047');
  }
  const bx = X + Math.round(L * 0.35);
  const fase = volta(t * vel, 50) / 50;
  const pulo = fase > 0.55 && fase < 0.98 ? Math.round(Math.sin((fase - 0.55) / 0.43 * Math.PI) * 9) : 0;
  const by = chao - pulo;
  const passo = Math.floor(t * 10) % 2;
  px(bx, by - 7, 5, 4, '#22c55e'); px(bx + 1, by - 9, 3, 2, '#f0c09a'); px(bx, by - 10, 5, 1, '#16a34a');
  px(bx + (passo ? 0 : 1), by - 3, 1, 3, '#1d1d22'); px(bx + (passo ? 3 : 2), by - 3, 1, 3, '#1d1d22');
}

const jogos: DesenhoDoTema = {
  quadro(p, lado) {
    const x0 = QUADRO_X[lado];
    const { px } = p;
    if (lado === 0) {
      // o controle grandão
      moldura(p, x0, '#2a1446');
      px(32, 37, 24, 9, '#e5e7eb'); px(30, 39, 4, 9, '#e5e7eb'); px(54, 39, 4, 9, '#e5e7eb');
      px(32, 37, 24, 1, '#ffffff'); px(31, 46, 4, 2, '#c5c9d0'); px(53, 46, 4, 2, '#c5c9d0');
      px(34, 40, 5, 1, '#1d1d22'); px(36, 38, 1, 5, '#1d1d22');
      px(49, 38, 2, 2, '#ef4444'); px(52, 40, 2, 2, '#3b82f6'); px(46, 40, 2, 2, '#22c55e'); px(49, 42, 2, 2, '#facc15');
      px(41, 42, 2, 1, '#6b7280'); px(44, 42, 2, 1, '#6b7280');
      return [
        { texto: 'PLAYER 1', x: QX[0], y: 31, tam: 4.2, cor: '#ff9be8' },
        { texto: 'START', x: QX[0], y: 53.5, tam: 5.5, cor: '#fde047' },
      ];
    }
    // o coração de vida extra
    moldura(p, x0, '#0f2a1a');
    CORACAO.forEach((linha, y) => [...linha].forEach((c, x) => { if (c === 'X') px(272 + x, 36 + y, 1, 1, y < 2 && x % 4 === 1 ? '#ff8a8a' : '#ef4444'); }));
    return [
      { texto: 'PLAYER 2', x: QX[1], y: 31, tam: 4.2, cor: '#9bff9b' },
      { texto: '+1 VIDA', x: QX[1], y: 53.5, tam: 5.5, cor: '#4ade80' },
    ];
  },
  peca(p, lado, agito) {
    const { px } = p;
    const t = p.relogio;
    if (lado === 0) {
      // o rack com a TV, o console e os dois puffs na frente
      px(12, 149, 84, 3, 'rgba(0,0,0,.32)');
      px(16, 128, 66, 14, '#5a3a22'); px(16, 128, 66, 1, '#7a5232');
      px(18, 131, 30, 9, '#4a2f1c'); px(50, 131, 30, 9, '#4a2f1c'); px(46, 135, 1, 1, '#c9a26b'); px(52, 135, 1, 1, '#c9a26b');
      px(18, 142, 2, 5, '#3a2414'); px(78, 142, 2, 5, '#3a2414');
      px(22, 98, 54, 27, '#0b0b0e'); px(46, 125, 6, 3, '#1d1d22');
      p.ctx.save(); p.ctx.beginPath(); p.ctx.rect(24, 100, 50, 23); p.ctx.clip();
      if (agito > 0) {
        px(24, 100, 50, 23, Math.floor(t * 8) % 2 ? '#7c3aed' : '#facc15');
        for (let k = 0; k < 14; k++) px(24 + volta(k * 13 + Math.floor(t * 40), 50), 100 + volta(k * 7 + Math.floor(t * 30), 23), 2, 2, '#ffffff');
      } else plataforma(p, 24, 100, 50, 23, 0.8);
      p.ctx.restore();
      px(22, 98, 54, 1, '#2b2b31');
      px(56, 124, 14, 4, '#1d1d22'); px(56, 124, 14, 1, '#3a3a44'); px(68, 126, 1, 1, '#3ad1ff');
      for (const [x0, cor, claro] of [[14, '#7c3aed', '#9b6af5'], [62, '#f97316', '#fb9a4c']] as const) {
        px(x0, 140, 22, 10, cor); px(x0 + 2, 138, 18, 2, cor); px(x0 + 1, 139, 20, 1, claro); px(x0, 149, 22, 1, 'rgba(0,0,0,.25)');
        px(x0 + 8, 137, 6, 2, '#e5e7eb'); px(x0 + 9, 137, 1, 1, '#ef4444');
      }
    } else {
      // a máquina de dança: a tela com as setas subindo e a plataforma com os dois tapetes
      px(228, 149, 80, 3, 'rgba(0,0,0,.32)');
      px(250, 90, 42, 42, '#1b1b22'); px(250, 90, 42, 1, '#3a3a44');
      px(252, 92, 38, 4, '#ff2e88');
      for (let k = 0; k < 9; k++) px(253 + k * 4, 93, 2, 2, Math.floor(t * 4 + k) % 2 ? '#ffffff' : '#ffd23f');
      for (const cx of [255, 287]) for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
        const d = Math.hypot(x, y);
        if (d <= 4.2) px(cx + x, 122 + y, 1, 1, d < 1.6 ? '#6d737c' : d < 3 ? '#2b2b31' : '#3a3a44');
      }
      px(258, 98, 26, 18, '#05050c');
      const CORES = ['#ff4fd8', '#3ad1ff', '#4ade80', '#fde047'];
      for (let l = 0; l < 4; l++) {
        px(260 + l * 6, 99, 4, 1, '#3a3a44');
        for (let s = 0; s < 2; s++) {
          const y = 114 - volta(t * (agito > 0 ? 34 : 16) + l * 5 + s * 9, 15);
          px(260 + l * 6, y, 4, 2, CORES[l]); px(261 + l * 6, y - 1, 2, 1, CORES[l]);
        }
      }
      px(234, 124, 2, 10, '#9aa1ab'); px(304, 124, 2, 10, '#9aa1ab'); px(234, 124, 72, 1, '#9aa1ab');
      px(232, 134, 74, 14, '#c9ced6'); px(232, 134, 74, 1, '#ffffff'); px(232, 147, 74, 2, '#9aa1ab');
      for (let tapete = 0; tapete < 2; tapete++) {
        const x0 = 236 + tapete * 36, cor = tapete ? '#3ad1ff' : '#ff4fd8';
        px(x0, 135, 30, 12, '#2b2b31');
        const setas: [number, number][] = [[1, 0], [0, 1], [2, 1], [1, 2]];
        setas.forEach(([cx, cy], i) => {
          const aceso = agito > 0 ? Math.floor(t * 8 + tapete * 2) % 4 === i : Math.floor(t * 1.5 + i + tapete) % 4 === 0;
          px(x0 + 1 + cx * 10, 136 + cy * 4, 8, 3, aceso ? cor : mistura(cor, '#2b2b31', 0.6));
        });
      }
    }
  },
  acao: (lado) => lado === 0
    ? { grito: 'GG!', cor: '#fde047', som: 'console', brilho: { x: 49, y: 111 }, fumaca: null }
    : { grito: 'DANÇA!', cor: '#ff4fd8', som: 'danca', brilho: { x: 270, y: 107 }, fumaca: null },
  video(p, lado) {
    const { x: X, y: Y, w: L, h: A } = TELA;
    const { px } = p;
    const t = p.relogio;
    if (lado === 0) { plataforma(p, X, Y, L, A); linhasDeTv(p); return; }
    // a luta: dois lutadores trocando socos, com a barra de vida em cima
    for (let i = 0; i < 6; i++) px(X, Y + i * 4, L, 4, mistura('#3b1d5a', '#ff8a5c', i / 5));
    for (let k = 0; k < 9; k++) { const h = 6 + (k * 7) % 9; px(X + k * 14, Y + 22 - h, 10, h, '#24123a'); px(X + k * 14 + 3, Y + 22 - h + 2, 1, 1, '#ffd27a'); }
    px(X, Y + 22, L, 9, '#3a2a4a'); px(X, Y + 22, L, 1, '#5a4a6a');
    const golpe = Math.floor(t * 2.5) % 4;
    const vida1 = 46 - volta(Math.floor(t * 2.5 / 4) * 7, 40), vida2 = 46 - volta(Math.floor((t * 2.5 + 2) / 4) * 9, 40);
    px(X + 4, Y + 3, 48, 3, '#3a0d12'); px(X + 4, Y + 3, vida1, 3, '#f43f5e');
    px(X + 68, Y + 3, 48, 3, '#0d1a3a'); px(X + 68 + 48 - vida2, Y + 3, vida2, 3, '#3b82f6');
    const lutador = (x: number, cor: string, soco: boolean, esq: boolean) => {
      const y = Y + 28 + (Math.floor(t * 6) % 2);
      px(x - 2, y - 14, 5, 4, '#f0c09a'); px(x - 2, y - 15, 5, 1, '#1d1d22');
      px(x - 3, y - 10, 7, 6, cor); px(x - 3, y - 4, 3, 4, cor); px(x + 1, y - 4, 3, 4, cor);
      const d = esq ? -1 : 1;
      if (soco) px(esq ? x - 11 : x + 4, y - 9, 8, 2, '#f0c09a'); else px(x + d * 4, y - 9, 2, 3, '#f0c09a');
    };
    lutador(X + 50, '#e04852', golpe === 1, false);
    lutador(X + 70, '#3f7fe0', golpe === 3, true);
    if (golpe === 1 || golpe === 3) {
      const sx = golpe === 1 ? X + 64 : X + 56;
      px(sx - 2, Y + 18, 5, 1, '#ffffff'); px(sx, Y + 16, 1, 5, '#ffffff'); px(sx - 1, Y + 17, 3, 3, '#fde047');
    }
    linhasDeTv(p);
  },
  andarDoBolo(p, lado) {
    const { px } = p;
    if (lado === 0) {
      px(149, 82, 22, 9, '#7c3aed'); px(149, 82, 22, 2, '#9b6af5');
      for (const [x, cor] of [[156, '#ef4444'], [159, '#3b82f6'], [162, '#22c55e'], [165, '#facc15']] as const) px(x, 86, 2, 2, cor);
      px(151, 86, 3, 1, '#1d1d22'); px(152, 85, 1, 3, '#1d1d22');
    } else {
      px(153, 75, 14, 7, '#16a34a'); px(153, 75, 14, 1, '#4ade80');
      CORACAO.slice(0, 5).forEach((linha, y) => [...linha].forEach((c, x) => { if (c === 'X' && x % 2 === 0 && y % 2 === 0) px(156 + x, 76 + y, 1, 1, '#ef4444'); }));
      px(158, 77, 4, 3, '#ef4444');
    }
  },
  velas: [['#7c3aed', '#f2f2f2'], ['#16a34a', '#f2f2f2']],
};

// --- PC gamer: o setup com RGB e a mesa de quem faz live ------------------------------------

/** A cor do RGB que anda: cada ponto um pouco adiante no arco-íris. Clicado, anda mais rápido. */
const rgb = (p: Pincel, k: number, agito = 0) => `hsl(${Math.round((p.relogio * (agito > 0 ? 400 : 70) + k * 36) % 360)},95%,60%)`;

const pc: DesenhoDoTema = {
  quadro(p, lado) {
    const x0 = QUADRO_X[lado];
    const { px } = p;
    if (lado === 0) {
      // o teclado com as teclas em arco-íris
      moldura(p, x0, '#0d0f14');
      px(26, 35, 37, 13, '#1b1b20'); px(26, 35, 37, 1, '#3a3a44');
      for (let fil = 0; fil < 3; fil++) for (let col = 0; col < 11; col++) {
        px(28 + col * 3 + (fil === 1 ? 1 : 0), 37 + fil * 3, 2, 2, `hsl(${Math.round(col * 32 + fil * 20)},90%,60%)`);
      }
      px(34, 46, 20, 1, '#6b7280');
      return [
        { texto: 'PC', x: QX[0], y: 30.5, tam: 4.2, cor: '#e5e7eb' },
        { texto: 'GAMER', x: QX[0], y: 54, tam: 5.5, cor: '#3ad1ff', contorno: '#5b1a6f' },
      ];
    }
    // o microfone da live, com a luzinha de gravando
    moldura(p, x0, '#1a0d12');
    px(273, 34, 6, 9, '#c9ced6'); for (let y = 35; y < 42; y += 2) px(274, y, 4, 1, '#6d737c');
    px(271, 39, 1, 4, '#9aa1ab'); px(280, 39, 1, 4, '#9aa1ab'); px(271, 43, 10, 1, '#9aa1ab');
    px(275, 44, 2, 3, '#9aa1ab'); px(272, 47, 8, 2, '#6d737c');
    px(286, 34, 3, 3, '#ff3b3b'); px(287, 35, 1, 1, '#ffb3b3');
    return [
      { texto: 'STREAM', x: QX[1], y: 30.5, tam: 4.2, cor: '#f2f2f2' },
      { texto: 'AO VIVO', x: QX[1], y: 54, tam: 5.5, cor: '#ff4d4d' },
    ];
  },
  peca(p, lado, agito) {
    const { px } = p;
    const t = p.relogio;
    if (lado === 0) {
      // a mesa com os dois monitores, o gabinete de vidro e a cadeira de costas para nós
      px(10, 149, 88, 3, 'rgba(0,0,0,.32)');
      px(12, 118, 70, 4, '#18181c'); px(12, 118, 70, 1, '#3a3a44');
      for (let x = 12; x < 82; x += 2) px(x, 122, 2, 1, rgb(p, x / 6, agito));
      px(14, 122, 3, 28, '#18181c'); px(77, 122, 3, 28, '#18181c');
      for (const [mx, mw, tipo] of [[18, 30, 0], [50, 30, 1]] as const) {
        px(mx, 97, mw, 19, '#0b0b0e'); px(mx + mw / 2 - 2, 116, 4, 2, '#18181c');
        const sx = mx + 1, sy = 98, sw = mw - 2, sh = 16;
        if (tipo === 0) {
          px(sx, sy, sw, sh, '#2a3550'); px(sx, sy + 10, sw, 6, '#3a2a20');
          const ix = sx + 8 + Math.round(Math.sin(t * 1.4) * 8);
          px(ix, sy + 6, 3, 5, '#1d3a20'); px(ix, sy + 5, 3, 1, '#f0c09a');
          px(sx + sw / 2, sy + 6, 1, 3, '#ff3b3b'); px(sx + sw / 2 - 1, sy + 7, 3, 1, '#ff3b3b');
        } else {
          px(sx, sy, sw, sh, '#10151f');
          for (let k = 0; k < 5; k++) px(sx + 2, sy + 2 + k * 3, 6 + ((k * 7 + Math.floor(t * 2)) % 14), 1, k % 2 ? '#4ade80' : '#9aa1ab');
          px(sx + sw - 9, sy + 2, 7, 7, '#1f3a2a'); px(sx + sw - 6, sy + 5, 1, 1, '#ff3b3b');
        }
      }
      px(30, 116, 22, 2, '#1d1d22'); for (let x = 31; x < 51; x += 2) px(x, 116, 2, 1, rgb(p, x / 4, agito));
      px(56, 116, 3, 2, '#1d1d22'); px(57, 116, 1, 1, rgb(p, 3, agito));
      // o gabinete de vidro com as ventoinhas
      px(83, 108, 14, 42, '#111114'); px(84, 109, 12, 40, '#1b1d26'); px(83, 108, 14, 1, '#3a3a44');
      for (let k = 0; k < 3; k++) {
        const cy = 115 + k * 12;
        for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
          const d = Math.hypot(x, y);
          if (d <= 4.3 && d > 2.8) px(90 + x, cy + y, 1, 1, rgb(p, k * 2 + Math.atan2(y, x), agito));
        }
        px(89, cy - 1, 2, 2, '#3a3a44');
      }
      // a cadeira gamer, vermelha e preta, de costas
      px(38, 115, 18, 4, '#1d1d22'); px(40, 119, 14, 23, '#c11f33'); px(45, 119, 4, 23, '#1d1d22');
      px(38, 119, 2, 20, '#1d1d22'); px(54, 119, 2, 20, '#1d1d22');
      px(46, 142, 2, 4, '#3a3a44'); px(40, 146, 14, 2, '#3a3a44'); px(40, 148, 2, 2, '#111'); px(52, 148, 2, 2, '#111');
    } else {
      // a mesa da live: o ring light no tripé, o monitor curvo com a live, o microfone no braço e a cadeira
      px(228, 149, 80, 3, 'rgba(0,0,0,.32)');
      px(300, 110, 1, 38, '#3a3a44'); p.linha(300, 146, 294, 150, 1, '#3a3a44'); p.linha(300, 146, 306, 150, 1, '#3a3a44');
      for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) {
        const d = Math.hypot(x, y);
        if (d <= 7.3 && d > 5.2) px(300 + x, 103 + y, 1, 1, agito > 0 ? '#ffffff' : '#e8e4da');
      }
      px(236, 120, 70, 4, '#e8ecf0'); px(236, 120, 70, 1, '#ffffff'); px(236, 124, 70, 1, '#a855f7');
      px(238, 125, 3, 25, '#cfd6df'); px(301, 125, 3, 25, '#cfd6df');
      px(254, 96, 44, 22, '#0b0b0e'); px(255, 97, 42, 18, '#14161b');
      px(256, 98, 28, 16, '#1f3a5a'); px(256, 109, 28, 5, '#2f5a3a');
      px(262 + Math.round(Math.sin(t * 2) * 6), 104, 3, 5, '#e04852');
      px(286, 98, 9, 7, '#3a2a4a'); px(289, 99, 3, 3, '#f0c09a'); px(288, 102, 5, 3, '#a855f7');
      for (let k = 0; k < 3; k++) px(286, 107 + k * 2, 4 + ((k * 5 + Math.floor(t * 3)) % 5), 1, ['#9aa1ab', '#4ade80', '#fde047'][k]);
      if (Math.floor(t * 2) % 2) px(257, 99, 3, 2, '#ff3b3b');
      px(274, 118, 4, 2, '#18181c'); px(274, 94, 4, 2, '#1d1d22'); px(277, 94, 1, 1, '#ff3b3b');
      p.linha(249, 120, 249, 106, 1, '#3a3a44'); p.linha(249, 106, 252, 103, 1, '#3a3a44');
      px(250, 97, 4, 7, '#1d1d22'); px(251, 98, 2, 5, '#4a4a55');
      px(262, 116, 18, 4, '#e5e7eb'); px(264, 120, 14, 22, '#f472b6'); px(269, 120, 4, 22, '#e5e7eb');
      px(262, 120, 2, 20, '#e5e7eb'); px(278, 120, 2, 20, '#e5e7eb');
      px(270, 142, 2, 4, '#9aa1ab'); px(264, 146, 14, 2, '#9aa1ab'); px(264, 148, 2, 2, '#6d737c'); px(276, 148, 2, 2, '#6d737c');
    }
  },
  acao: (lado) => lado === 0
    ? { grito: 'GG EZ!', cor: '#3ad1ff', som: 'teclado', brilho: { x: 50, y: 106 }, fumaca: null }
    : { grito: 'AO VIVO!', cor: '#ff4d4d', som: 'live', brilho: { x: 300, y: 103 }, fumaca: null },
  video(p, lado) {
    const { x: X, y: Y, w: L, h: A } = TELA;
    const { px } = p;
    const t = p.relogio;
    if (lado === 0) {
      // o tiro em primeira pessoa: a mira no meio, o inimigo saindo de trás do caixote, a arma no canto
      for (let i = 0; i < 4; i++) px(X, Y + i * 4, L, 4, mistura('#9fc9f0', '#f3dcae', i / 3));
      px(X, Y + 16, L, A - 16, '#b08a52');
      for (let k = 0; k < 5; k++) { px(X + k * 26, Y + 8, 18, 10, '#d9b77a'); px(X + k * 26, Y + 8, 18, 1, '#e8cc95'); }
      px(X + 18, Y + 14, 14, 10, '#8a5a30'); px(X + 18, Y + 14, 14, 1, '#a8743f'); p.linha(X + 18, Y + 14, X + 31, Y + 23, 1, '#6a4020');
      const ix = X + 60 + Math.round(Math.sin(t * 1.3) * 34);
      px(ix, Y + 12, 4, 8, '#2f5a2a'); px(ix, Y + 10, 4, 2, '#f0c09a'); px(ix - 1, Y + 9, 6, 1, '#2f5a2a'); px(ix + 4, Y + 14, 4, 1, '#1d1d22');
      const tiro = Math.floor(t * 1.6) % 2 === 0 && volta(t * 1.6, 1) < 0.15;
      px(X + 59, Y + 11, 1, 3, '#ff3b3b'); px(X + 59, Y + 17, 1, 3, '#ff3b3b'); px(X + 55, Y + 15, 3, 1, '#ff3b3b'); px(X + 61, Y + 15, 3, 1, '#ff3b3b');
      px(X + 80, Y + 22, 28, 9, '#3a3f48'); px(X + 72, Y + 24, 10, 3, '#2b2f36'); px(X + 84, Y + 20, 8, 2, '#4a4f58');
      if (tiro) { px(X + 67, Y + 23, 5, 5, '#ffd23f'); px(X + 68, Y + 24, 3, 3, '#ffffff'); }
      for (let k = 0; k < 8; k++) px(X + 4 + k * 3, Y + 27, 2, 2, '#fde047');
      linhasDeTv(p);
      return;
    }
    // a corrida de frente: a estrada vindo na nossa direção, a montanha no fundo, o carro na frente
    for (let i = 0; i < 4; i++) px(X, Y + i * 3, L, 3, mistura('#ff9a5c', '#ffd27a', i / 3));
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (Math.hypot(x, y) <= 3.2) px(X + 88 + x, Y + 7 + y, 1, 1, '#fff4cf');
    for (let x = X; x < X + L; x++) { const h = Math.round(Y + 10 + Math.sin((x - X) / 9) * 2 + Math.sin((x - X) / 4) * 1); px(x, h, 1, Y + 13 - h, '#6a3a7a'); }
    for (let y = Y + 13; y < Y + A; y++) {
      const d = (y - (Y + 12)) / (A - 12);
      const meia = 4 + d * 56;
      const centro = X + 60 + Math.sin(t * 0.8) * (1 - d) * 12;
      const listra = Math.floor(1 / (d + 0.06) + t * 9) % 2;
      px(X, y, L, 1, listra ? '#3f8a3a' : '#57a84e');
      px(centro - meia, y, meia * 2, 1, listra ? '#5c6168' : '#6d737c');
      px(centro - meia, y, Math.max(1, d * 4), 1, listra ? '#f2f2f2' : '#e04852'); px(centro + meia - Math.max(1, d * 4), y, Math.max(1, d * 4), 1, listra ? '#f2f2f2' : '#e04852');
      if (listra) px(centro - Math.max(0.5, d * 1.5), y, Math.max(1, d * 3), 1, '#f2e6a0');
    }
    px(X + 52, Y + 23, 16, 5, '#d7263d'); px(X + 54, Y + 20, 12, 3, '#d7263d'); px(X + 55, Y + 21, 10, 2, '#1f3a44');
    px(X + 52, Y + 24, 3, 2, '#ffef5a'); px(X + 65, Y + 24, 3, 2, '#ffef5a');
    px(X + 50, Y + 27, 4, 3, '#111'); px(X + 66, Y + 27, 4, 3, '#111');
    linhasDeTv(p);
  },
  andarDoBolo(p, lado) {
    const { px } = p;
    if (lado === 0) {
      px(149, 82, 22, 9, '#1b1b20'); px(149, 82, 22, 1, '#3a3a44');
      for (let x = 149; x < 171; x++) px(x, 86, 1, 2, rgb(p, (x - 149) / 2.5));
    } else {
      px(153, 75, 14, 7, '#e8ecf0'); px(153, 75, 14, 1, '#ffffff');
      for (let x = 154; x < 166; x += 3) { px(x, 77, 2, 1, '#9aa1ab'); px(x + 1, 79, 2, 1, '#9aa1ab'); }
      px(153, 81, 14, 1, '#a855f7');
    }
  },
  velas: [['#1b1b20', '#3ad1ff'], ['#e8ecf0', '#a855f7']],
};

export const TEMA: Record<Tema, DesenhoDoTema> = { moto, carro, mecanica, jogos, pc };

// --- a roupa de festa -----------------------------------------------------------------------

type Px = (x: number, y: number, w: number, h: number, cor: string) => void;
/**
 * A roupa de festa de cada tema. O corpo é pintado com estas cores, e o resto — a faixa, o boné, o
 * fone — por cima, de frente, de costas ou de lado. A cara continua a da pessoa: a roupa é de festa,
 * não uma fantasia de outra pessoa.
 */
export type Traje = {
  camisa: string; manga: string; calca: string; bota: string;
  /** Bota alta (a da Sahara) cobre a canela. */
  botaAlta?: boolean;
  /** A cor do alto da cabeça (bandana, boné): substitui o cabelo de cima. */
  topo?: string;
  oculos?: boolean; barba?: boolean;
  corpo?(px: Px, x: number, y: number, dir: 'baixo' | 'cima' | 'esq' | 'dir', relogio: number): void;
  cabeca?(px: Px, x: number, y: number, dir: 'baixo' | 'cima' | 'esq' | 'dir', relogio: number): void;
};

const bone = (cor: string, aba: string) => (px: Px, x: number, y: number, dir: string) => {
  if (dir === 'baixo') { px(x + 1, y, 8, 2, cor); px(x, y + 2, 10, 1, aba); }
  else if (dir === 'cima') px(x + 1, y, 8, 2, cor);
  else { px(x + 1, y, 8, 2, cor); px(dir === 'dir' ? x + 6 : x - 1, y + 2, 5, 1, aba); }
};

/** O fone de quem joga: a tiara por cima, as conchas dos lados e a luz da cor do time (sem cor, o RGB andando). */
const fone = (luz: string | null) => (px: Px, x: number, y: number, dir: string, relogio: number) => {
  const cor = luz ?? `hsl(${Math.round(relogio * 90) % 360},95%,60%)`;
  px(x + 1, y - 1, 8, 1, '#1d1d22');
  if (dir === 'baixo' || dir === 'cima') { px(x, y + 2, 1, 4, '#1d1d22'); px(x + 9, y + 2, 1, 4, '#1d1d22'); px(x, y + 3, 1, 1, cor); px(x + 9, y + 3, 1, 1, cor); }
  else { px(dir === 'dir' ? x + 3 : x + 5, y + 2, 2, 4, '#1d1d22'); px(dir === 'dir' ? x + 3 : x + 6, y + 3, 1, 2, cor); }
  if (dir === 'baixo') px(x + 7, y + 6, 2, 1, '#1d1d22');
};
/** A camisa de time: o número nas costas e a faixa no peito. */
const camisaDeTime = (cor: string, numero: number) => (px: Px, x: number, y: number, dir: string) => {
  if (dir === 'cima') { px(x + 4, y + 9, 2, 1, cor); if (numero === 1) px(x + 5, y + 9, 1, 4, cor); else { px(x + 5, y + 10, 1, 1, cor); px(x + 4, y + 11, 1, 1, cor); px(x + 4, y + 12, 2, 1, cor); } }
  else px(x + 1, y + 10, 8, 1, cor);
};
/** O moletom: o cordão do capuz na frente, o bolso, e o capuz caído atrás. */
const moletom = (cordao: string) => (px: Px, x: number, y: number, dir: string) => {
  if (dir === 'baixo') { px(x + 3, y + 8, 1, 3, cordao); px(x + 6, y + 8, 1, 3, cordao); px(x + 2, y + 12, 6, 1, 'rgba(0,0,0,.25)'); }
  if (dir === 'cima') px(x + 2, y + 7, 6, 3, 'rgba(0,0,0,.2)');
};

const TRAJES: Record<Tema, [Traje, Traje]> = {
  moto: [
    {
      camisa: COR.preto, manga: COR.preto, calca: '#2b3a55', bota: '#3a2418', topo: COR.laranja, oculos: true, barba: true,
      corpo(px, x, y, dir) {
        if (dir === 'baixo') px(x + 4, y + 8, 2, 7, '#e8e8e8');
        px(x + 1, y + 11, 8, 1, COR.laranja);
        if (dir === 'cima') { px(x + 3, y + 9, 4, 4, COR.laranja); px(x + 4, y + 10, 2, 2, COR.preto); }
      },
      cabeca(px, x, y, dir) { if (dir === 'cima') px(x + 4, y + 2, 2, 2, COR.laranja); },
    },
    {
      camisa: COR.branco, manga: COR.vermelho, calca: '#555a66', bota: '#e6e6e6', botaAlta: true, topo: COR.vermelho,
      corpo(px, x, y, dir) {
        px(x + 1, y + 8, 8, 2, COR.vermelho); px(x + 1, y + 12, 8, 1, COR.vermelho);
        if (dir === 'cima') { px(x + 4, y + 10, 1, 2, COR.vermelho); px(x + 5, y + 10, 1, 1, COR.vermelho); }
      },
      cabeca(px, x, y, dir) {
        if (dir === 'baixo') px(x, y + 2, 10, 1, COR.vermelho);
        else if (dir !== 'cima') px(dir === 'dir' ? x + 5 : x - 1, y + 2, 5, 1, COR.vermelho);
      },
    },
  ],
  carro: [
    {
      camisa: '#c11f33', manga: '#c11f33', calca: '#c11f33', bota: '#18181c',
      corpo(px, x, y, dir) { px(x + 1, y + 12, 8, 1, '#f2f2f2'); if (dir === 'baixo') { px(x + 2, y + 9, 2, 1, '#f2f2f2'); px(x + 6, y + 9, 1, 1, '#e8b93a'); } },
      cabeca: bone('#c11f33', '#18181c'),
    },
    {
      camisa: '#1f7a6f', manga: '#1f7a6f', calca: '#1f7a6f', bota: '#18181c',
      corpo(px, x, y, dir) { px(x + 1, y + 12, 8, 1, '#ffd27a'); if (dir === 'baixo') px(x + 2, y + 9, 2, 1, '#ffd27a'); },
      cabeca: bone('#2a9d8f', '#ffd27a'),
    },
  ],
  mecanica: [
    {
      camisa: '#2b4a7a', manga: '#2b4a7a', calca: '#2b4a7a', bota: '#18181c',
      corpo(px, x, y, dir) {
        if (dir === 'baixo') { px(x + 5, y + 8, 1, 6, '#1f3a60'); px(x + 2, y + 10, 1, 1, '#1d1d22'); }
        px(x + (dir === 'esq' ? 7 : 1), y + 12, 1, 2, '#d7263d');
        px(x + 6, y + 13, 1, 1, '#1d1d22');
      },
      cabeca: bone('#2b4a7a', '#1d1d22'),
    },
    {
      camisa: '#d9822b', manga: '#d9822b', calca: '#d9822b', bota: '#18181c',
      corpo(px, x, y) { px(x + 1, y + 11, 8, 1, '#e8e8e8'); px(x + 2, y + 14, 2, 1, '#e8e8e8'); px(x + 6, y + 14, 2, 1, '#e8e8e8'); },
      cabeca: bone('#d9822b', '#1d1d22'),
    },
  ],
  jogos: [
    { camisa: '#7c3aed', manga: '#1d1d22', calca: '#2b3a55', bota: '#f2f2f2', corpo: camisaDeTime('#f2f2f2', 1), cabeca: fone('#ff4fd8') },
    { camisa: '#16a34a', manga: '#1d1d22', calca: '#2b3a55', bota: '#f2f2f2', corpo: camisaDeTime('#f2f2f2', 2), cabeca: fone('#3ad1ff') },
  ],
  pc: [
    { camisa: '#1b1b20', manga: '#1b1b20', calca: '#2b3a55', bota: '#f2f2f2', corpo: moletom('#e5e7eb'), cabeca: fone(null) },
    { camisa: '#d6d9df', manga: '#d6d9df', calca: '#3b3742', bota: '#18181c', corpo: moletom('#a855f7'), cabeca: fone('#f472b6') },
  ],
};
export const trajeDe = (r: Roupa): Traje => TRAJES[r.tema][r.lado];

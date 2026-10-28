/**
 * O desenho da Navinha: a tela do fliperama ocupando o palco inteiro, com a moldura do gabinete nas
 * cores dele, o campo de jogo de pé no meio (`CAMPO`, de `navinha.ts`) e, nos lados, o letreiro, os
 * pontos, o placar e as vidas. O pixel é o da garagem — 320×180 ampliado sem suavizar — e o que tem
 * de ler bem vai em letra de verdade por cima.
 */
import { CAMPO, PONTOS, type Bicho, type Navinha } from './navinha';
import type { Recorde } from './garagem';
import { mistura } from './temasDaGaragem';

const W = 320, H = 180;
/** Onde o campo começa na tela. */
export const CAMPO_X = Math.round((W - CAMPO.w) / 2), CAMPO_Y = 2;
/** A letra de pixel só no nome do jogo; o resto na Figtree, que não confunde "C" com "O" (ver desenhoDaGaragem.ts). */
const PIXEL = '"Pixelify Sans", Figtree, sans-serif';
const TEXTO = 'Figtree, sans-serif';
const MOLDURAS = [
  { corpo: '#2a1446', arte: '#ff4fd8', claro: '#ff9be8' },
  { corpo: '#0e2440', arte: '#3ad1ff', claro: '#9be8ff' },
];
/** As cores de cada bicho: o comandante, a guarda e o soldado. */
const BICHOS: Record<Bicho['tipo'], [string, string]> = { 0: ['#4ade80', '#facc15'], 1: ['#f43f5e', '#a855f7'], 2: ['#38bdf8', '#facc15'] };
const acaso = (i: number, k: number) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
const ESTRELAS = Array.from({ length: 46 }, (_, i) => ({
  x: Math.floor(acaso(i, 1) * CAMPO.w), y: Math.floor(acaso(i, 2) * CAMPO.h), v: 8 + (i % 3) * 14, cor: ['#3b4252', '#6b7590', '#c9d6ff'][i % 3],
}));

export type DesenhoDaNavinha = {
  desenhar(n: Navinha, qual: number, recordes: readonly Recorde[], recordeNovo: boolean, dt: number): void;
};

export function criarDesenhoDaNavinha(tela: HTMLCanvasElement): DesenhoDaNavinha {
  const c = tela.getContext('2d')!;
  const low = document.createElement('canvas'); low.width = W; low.height = H;
  const g = low.getContext('2d')!;
  const px = (x: number, y: number, w: number, h: number, cor: string) => { g.fillStyle = cor; g.fillRect(Math.round(x), Math.round(y), w, h); };
  let relogio = 0;

  function bicho(b: Bicho, t: number) {
    const x = CAMPO_X + b.x, y = CAMPO_Y + b.y;
    const [c1, c2] = b.piscando > 0 ? ['#ffffff', '#ffffff'] : BICHOS[b.tipo];
    const asa = Math.floor(t * 4 + b.col) % 2;
    if (b.tipo === 0) {
      px(x - 4, y - 3, 9, 4, c1); px(x - 2, y - 4, 5, 1, c1); px(x - 1, y - 2, 3, 2, c2);
      px(x - 5, y - 2 + asa, 1, 3, c2); px(x + 5, y - 2 + asa, 1, 3, c2);
      px(x - 3, y + 1, 2, 2 - asa, c1); px(x + 2, y + 1, 2, 2 - asa, c1);
      if (b.vida > 1) { px(x - 2, y - 2, 1, 1, '#ffffff'); px(x + 2, y - 2, 1, 1, '#ffffff'); }
    } else if (b.tipo === 1) {
      px(x - 3, y - 2, 7, 4, c1); px(x - 1, y - 3, 3, 1, c1); px(x - 1, y - 1, 3, 1, c2);
      px(x - 4 - asa, y - 3, 2, 2, c2); px(x + 3 + asa, y - 3, 2, 2, c2);
      px(x - 2, y + 2, 1, 1, c1); px(x + 2, y + 2, 1, 1, c1);
    } else {
      px(x - 2, y - 2, 5, 4, c1); px(x - 2, y, 5, 1, c2);
      px(x - 4, y - 3 + asa, 2, 3, '#e0f2fe'); px(x + 3, y - 3 + asa, 2, 3, '#e0f2fe');
      px(x - 1, y + 2, 3, 1, c2);
    }
  }

  function nave(n: Navinha) {
    if (!n.nave.viva) return;
    if (n.nave.protegida > 0 && Math.floor(relogio * 12) % 2) return;
    const x = CAMPO_X + n.nave.x, y = CAMPO_Y + n.naveY;
    px(x - 1, y - 6, 3, 2, '#e5e7eb'); px(x - 2, y - 4, 5, 4, '#e5e7eb'); px(x, y - 5, 1, 2, '#ef4444');
    px(x - 5, y - 1, 11, 2, '#93c5fd'); px(x - 5, y - 3, 1, 3, '#e5e7eb'); px(x + 5, y - 3, 1, 3, '#e5e7eb');
    px(x - 3, y + 1, 2, 1, '#60a5fa'); px(x + 2, y + 1, 2, 1, '#60a5fa');
    if (Math.floor(relogio * 20) % 2) px(x - 1, y + 1, 3, 2, '#fb923c'); else px(x, y + 1, 1, 3, '#fde047');
  }

  return {
    desenhar(n, qual, recordes, recordeNovo, dt) {
      relogio += dt;
      const m = MOLDURAS[qual] ?? MOLDURAS[0];
      // a moldura do gabinete: o corpo, a arte em faixas, e o vidro escuro em volta do campo
      px(0, 0, W, H, m.corpo);
      // a arte do gabinete: as faixas de velocidade embaixo, como a lateral pintada de um fliperama
      for (let i = 0; i < 5; i++) {
        const y = 140 + i * 8, cor = i % 2 ? m.arte : m.claro;
        px(0, y, CAMPO_X - 6 - i * 6, 2, cor);
        px(CAMPO_X + CAMPO.w + 6 + i * 6, y + 4, W - CAMPO_X - CAMPO.w - 6 - i * 6, 2, cor);
      }
      px(CAMPO_X - 6, 0, CAMPO.w + 12, H, '#0b0b0e');
      px(CAMPO_X - 4, 0, 1, H, m.arte); px(CAMPO_X + CAMPO.w + 3, 0, 1, H, m.arte);
      const painel = mistura(m.corpo, '#000000', 0.45);
      px(8, 34, CAMPO_X - 20, 80, painel);
      px(CAMPO_X + CAMPO.w + 12, 18, W - CAMPO_X - CAMPO.w - 20, 118, painel);
      // o campo: o espaço com as estrelas descendo
      px(CAMPO_X, CAMPO_Y, CAMPO.w, CAMPO.h, '#05050c');
      for (const e of ESTRELAS) {
        const y = (e.y + relogio * e.v) % CAMPO.h;
        px(CAMPO_X + e.x, CAMPO_Y + y, 1, 1, e.cor);
      }
      g.save(); g.beginPath(); g.rect(CAMPO_X, CAMPO_Y, CAMPO.w, CAMPO.h); g.clip();
      for (const b of n.bichos) bicho(b, n.t);
      for (const k of n.tiros) {
        if (k.meu) px(CAMPO_X + k.x, CAMPO_Y + k.y - 2, 1, 4, '#fde047');
        else px(CAMPO_X + k.x, CAMPO_Y + k.y - 1, 1, 3, Math.floor(relogio * 16) % 2 ? '#f87171' : '#ffffff');
      }
      nave(n);
      for (const e of n.explosoes) {
        const r = (e.grande ? 14 : 7) * Math.min(1, e.t / (e.grande ? 0.5 : 0.25));
        const vida = 1 - e.t / (e.grande ? 0.9 : 0.45);
        for (let k = 0; k < (e.grande ? 16 : 9); k++) {
          const a = k * 2.4 + e.x;
          px(CAMPO_X + e.x + Math.cos(a) * r, CAMPO_Y + e.y + Math.sin(a) * r, 1, 1, vida > 0.5 ? '#fde047' : '#f97316');
        }
        if (e.t < 0.12) px(CAMPO_X + e.x - 2, CAMPO_Y + e.y - 2, 5, 5, '#ffffff');
      }
      g.restore();
      // as vidas que sobram, em naves pequenas
      for (let i = 0; i < Math.max(0, n.vidas - (n.nave.viva ? 1 : 0)); i++) {
        const x = CAMPO_X + CAMPO.w + 18 + i * 10, y = 128;
        px(x - 1, y - 3, 3, 2, '#e5e7eb'); px(x - 3, y - 1, 7, 2, '#93c5fd');
      }

      const S = tela.width / W;
      c.imageSmoothingEnabled = false;
      c.drawImage(low, 0, 0, tela.width, tela.height);
      const fonte = (tam: number, pixel: boolean) => (pixel ? `500 ${Math.round(tam * S)}px ${PIXEL}` : `750 ${Math.round(tam * S)}px ${TEXTO}`);
      const texto = (t: string, x: number, y: number, tam: number, cor: string, alinhar: CanvasTextAlign = 'center', pixel = false) => {
        c.font = fonte(tam, pixel); c.textAlign = alinhar; c.fillStyle = cor; c.fillText(t, x * S, y * S);
      };
      c.textBaseline = 'middle';
      // o lado esquerdo: o nome do jogo, a onda e como se joga
      const ex = (CAMPO_X - 6) / 2;
      c.save(); c.shadowColor = m.arte; c.shadowBlur = 5 * S;
      texto('NAVINHA', ex, 22, 9, '#ffffff', 'center', true);
      c.restore();
      texto(`ONDA ${n.onda}`, ex, 44, 6, m.claro);
      texto('← →  mover', ex, 66, 4.6, '#e5e7eb');
      texto('ESPAÇO  atirar', ex, 76, 4.6, '#e5e7eb');
      texto('ou o mouse', ex, 86, 4.6, '#9aa1b0');
      texto('ESC  sair', ex, 104, 4.6, '#e5e7eb');
      if (n.tonto) texto('tonto…', ex, 124, 5, '#ffd27a');
      // o lado direito: os pontos e o placar
      const dx = CAMPO_X + CAMPO.w + 12;
      texto('PONTOS', dx, 26, 4.6, m.claro, 'left');
      texto(String(n.pontos).padStart(6, '0'), dx, 36, 7.5, '#ffffff', 'left');
      texto('RECORDES', dx, 54, 4.6, m.claro, 'left');
      recordes.slice(0, 5).forEach((r, i) => {
        texto(`${i + 1}. ${r.nome.slice(0, 9)}`, dx, 64 + i * 9, 4.2, '#e5e7eb', 'left');
        texto(String(r.pontos), W - 10, 64 + i * 9, 4.2, '#ffd27a', 'right');
      });
      if (!recordes.length) texto('ninguém ainda', dx, 64, 4.2, '#9aa1b0', 'left');
      texto('VIDAS', dx, 118, 4.6, m.claro, 'left');
      // o que vai por cima do campo: começar, a onda nova, o fim
      const cx = CAMPO_X + CAMPO.w / 2;
      const pisca = Math.floor(relogio * 2.5) % 2 === 0;
      if (n.fase === 'esperando') {
        c.save(); c.shadowColor = m.arte; c.shadowBlur = 8 * S;
        texto('NAVINHA', cx, 62, 13, '#ffffff', 'center', true);
        c.restore();
        texto(`comandante ${PONTOS[0]} · guarda ${PONTOS[1]} · soldado ${PONTOS[2]}`, cx, 82, 3.8, '#9aa1b0');
        if (pisca) texto('aperte ESPAÇO', cx, 112, 6.5, '#fde047');
      } else if (n.fase === 'entreOndas') {
        texto(`ONDA ${n.onda}`, cx, 84, 10, '#ffffff');
      } else if (n.fase === 'fim') {
        c.fillStyle = 'rgba(5,5,12,.6)'; c.fillRect(CAMPO_X * S, 50 * S, CAMPO.w * S, 74 * S);
        texto('FIM DE JOGO', cx, 64, 10, '#f87171');
        texto(`${n.pontos} pontos`, cx, 82, 6.5, '#ffffff');
        if (recordeNovo) texto('ENTROU NO PLACAR!', cx, 96, 5.5, '#fde047');
        if (pisca) texto('ESPAÇO joga de novo · ESC sai', cx, 114, 4.6, '#e5e7eb');
      }
    },
  };
}

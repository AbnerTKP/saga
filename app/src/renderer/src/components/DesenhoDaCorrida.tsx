import { equipeDoCarro, type Equipe } from '../corrida';
import {
  PASSO, idx, lugarNoGrid, pontoNaPista, pontosLimpos, sorteio, type Arquibancada, type Pista, type Posto,
} from '../pista';

/**
 * O desenho da corrida: o mundo em volta da pista (grama, brita, zebras, muros, arquibancadas,
 * boxes, cidade, mar), o carro visto de cima e o que se mexe por cima.
 *
 * O mundo não muda durante a corrida, então ele é desenhado em LADRILHOS (`Ladrilhos`) e cada
 * quadro só cola os que aparecem: redesenhar a pista inteira sessenta vezes por segundo seria
 * jogar fora a CPU de quem tem máquina fraca. O que se mexe — carros, bandeira do fiscal, luzes
 * da largada, poeira — vai por cima, a cada quadro.
 *
 * As medidas saem de `pista.ts`: o muro desenhado é o muro em que a física bate.
 */

type Vista = { x0: number; y0: number; x1: number; y1: number };
type Ctx = CanvasRenderingContext2D;
type P2 = [number, number];

const CORES = {
  campo: { fundo: '#4c8a39', asfalto: '#505358', borda: '#3b3e42', brita: '#d8c6a0', arvore: ['#2d6a2a', '#377a31', '#245a22'], muro: '#d5d9dc', noite: false },
  rua: { fundo: '#a9a293', asfalto: '#4b4e53', borda: '#34373b', brita: '#d8c6a0', arvore: ['#3f7a3a', '#4b8a44', '#346a30'], muro: '#e8ebee', noite: false },
  deserto: { fundo: '#d9b98a', asfalto: '#4d5055', borda: '#393c40', brita: '#e3cfa6', arvore: ['#5a7d34', '#6a8f3c', '#4a6a2a'], muro: '#dfe2e5', noite: false },
  noite: { fundo: '#0e1119', asfalto: '#2c2f36', borda: '#1c1e24', brita: '#2a2a2e', arvore: ['#0f2a1a', '#153421', '#0b2014'], muro: '#6b7384', noite: true },
};
export const corDoFundo = (p: Pista) => CORES[p.tema].fundo;

const CORES_DAS_GARAGENS = ['#1e2b63', '#dc0000', '#ff8000', '#c3cad1', '#2b4562', '#1e2b63', '#dc0000', '#ff8000', '#c3cad1', '#6c7a89'];

// ---- texturas ---------------------------------------------------------------------------------

let texturas: Record<'asfalto' | 'brita' | 'grama' | 'areia' | 'calcada', HTMLCanvasElement> | null = null;
function criarTexturas() {
  if (texturas) return texturas;
  const ruido = (w: number, h: number, cores: string[], qtd: number, tam: number) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    const r = sorteio(99);
    for (let k = 0; k < qtd; k++) {
      g.fillStyle = cores[Math.floor(r() * cores.length)];
      const s = tam * (0.5 + r());
      g.fillRect(r() * w, r() * h, s, s);
    }
    return c;
  };
  texturas = {
    asfalto: ruido(128, 128, ['rgba(255,255,255,.035)', 'rgba(0,0,0,.05)'], 900, 1.6),
    brita: ruido(96, 96, ['rgba(120,95,55,.22)', 'rgba(255,255,255,.3)', 'rgba(90,70,40,.16)'], 900, 2),
    grama: ruido(160, 160, ['rgba(0,0,0,.035)', 'rgba(255,255,160,.03)'], 500, 5),
    areia: ruido(200, 200, ['rgba(140,100,50,.07)', 'rgba(255,240,210,.10)'], 800, 4),
    calcada: ruido(64, 64, ['rgba(0,0,0,.05)', 'rgba(255,255,255,.06)'], 300, 3),
  };
  return texturas;
}

function padrao(ctx: Ctx, canvas: HTMLCanvasElement, escala = 1) {
  const pat = ctx.createPattern(canvas, 'repeat')!;
  if (escala !== 1) pat.setTransform(new DOMMatrix().scale(escala));
  return pat;
}

function linha(ctx: Ctx, pts: P2[], fechar = false) {
  ctx.beginPath();
  pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (fechar) ctx.closePath();
}

function caminho(ctx: Ctx, p: Pista, i0: number, i1: number, lado: number | ((i: number) => number), fechar = false) {
  ctx.beginPath();
  const ladoDe = typeof lado === 'function' ? lado : () => lado;
  for (let k = i0; k <= i1; k++) {
    const i = idx(p, k), o = ladoDe(i);
    const x = p.xs[i] + p.nx[i] * o, y = p.ys[i] + p.ny[i] * o;
    if (k === i0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  if (fechar) ctx.closePath();
}

function aparece(p: Pista, i0: number, i1: number, v: Vista) {
  const passo = Math.max(1, Math.floor((i1 - i0) / 24));
  for (let k = i0; k <= i1; k += passo) {
    const i = idx(p, k);
    if (p.xs[i] > v.x0 - 600 && p.xs[i] < v.x1 + 600 && p.ys[i] > v.y0 - 600 && p.ys[i] < v.y1 + 600) return true;
  }
  return false;
}

const perto = (x: number, y: number, v: Vista, folga: number) => x > v.x0 - folga && x < v.x1 + folga && y > v.y0 - folga && y < v.y1 + folga;

// ---- o mundo ------------------------------------------------------------------------------------

/**
 * O mundo parado, sob a transformação atual do ctx (mundo → tela). `vista` são os limites do
 * mundo que aparecem, e `zoom` quantos pixels vale uma unidade — abaixo de 0,28 os detalhes
 * pequenos (torcida, textura, placas) somem, porque viram ruído.
 */
export function desenharMundo(ctx: Ctx, p: Pista, vista: Vista, zoom: number) {
  const T = CORES[p.tema], meia = p.L / 2, tex = criarTexturas();
  const detalhe = zoom > 0.28;
  const { x0, y0, x1, y1 } = vista;

  ctx.fillStyle = T.fundo;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  if (p.tema === 'campo') {
    // listras de corte de grama, em faixas diagonais largas
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.045)';
    const faixa = 90, c = Math.cos(0.5), s = Math.sin(0.5);
    ctx.transform(c, s, -s, c, 0, 0);
    const R = Math.max(Math.abs(x0), Math.abs(x1)) + Math.max(Math.abs(y0), Math.abs(y1));
    for (let k = Math.floor(-R / faixa / 2) * 2; k * faixa < R; k += 2) ctx.fillRect(-R, k * faixa, 2 * R, faixa);
    ctx.restore();
    if (detalhe) { ctx.fillStyle = padrao(ctx, tex.grama, 2); ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
  }
  if (p.tema === 'deserto') { ctx.fillStyle = padrao(ctx, tex.areia, 2.5); ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
  if (p.tema === 'noite') {
    ctx.strokeStyle = '#161a25'; ctx.lineWidth = 26;
    for (let x = Math.floor(x0 / 300) * 300; x < x1; x += 300) { ctx.beginPath(); ctx.moveTo(x + 75, y0); ctx.lineTo(x + 75, y1); ctx.stroke(); }
    for (let y = Math.floor(y0 / 300) * 300; y < y1; y += 300) { ctx.beginPath(); ctx.moveTo(x0, y + 75); ctx.lineTo(x1, y + 75); ctx.stroke(); }
  }

  // Água
  if (p.marPoligono) {
    ctx.fillStyle = '#2c6f9c';
    linha(ctx, p.marPoligono, true); ctx.fill();
    ctx.lineWidth = 16; ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.stroke();
    ctx.lineWidth = 6; ctx.strokeStyle = '#cfc6b4'; ctx.stroke();
  }
  for (const l of p.def.lagos ?? []) {
    ctx.fillStyle = 'rgba(40,90,40,.5)';
    ctx.beginPath(); ctx.ellipse(l.x, l.y, l.rx + 16, l.ry + 16, l.a, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a7aa8';
    ctx.beginPath(); ctx.ellipse(l.x, l.y, l.rx, l.ry, l.a, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    ctx.beginPath(); ctx.ellipse(l.x - l.rx * 0.2, l.y - l.ry * 0.25, l.rx * 0.55, l.ry * 0.35, l.a, 0, Math.PI * 2); ctx.fill();
  }
  for (const b of p.barcos) {
    if (!perto(b.x, b.y, vista, 80)) continue;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(3, 4, b.t / 2, b.t / 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f7f7f5';
    ctx.beginPath(); ctx.moveTo(-b.t / 2, -b.t / 6); ctx.lineTo(b.t / 4, -b.t / 6); ctx.quadraticCurveTo(b.t / 2, 0, b.t / 4, b.t / 6); ctx.lineTo(-b.t / 2, b.t / 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9fb6c6'; ctx.fillRect(-b.t / 4, -b.t / 12, b.t / 3, b.t / 6);
    ctx.restore();
  }

  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';

  // O chão do corredor, até o muro
  ctx.fillStyle = p.tema === 'campo' ? 'rgba(255,255,255,.04)' : p.tema === 'deserto' ? 'rgba(120,80,30,.12)' : p.tema === 'rua' ? '#8d8f92' : '#171a22';
  ctx.beginPath();
  for (const s of [1, -1]) {
    const e = p.escape[s > 0 ? 0 : 1];
    for (let k = 0; k <= p.n; k++) {
      const i = k % p.n, o = s * (meia + e[i]);
      const x = p.xs[i] + p.nx[i] * o, y = p.ys[i] + p.ny[i] * o;
      if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  ctx.fill('evenodd');
  if (p.tema === 'rua' && detalhe) {
    ctx.save(); ctx.clip('evenodd'); ctx.fillStyle = padrao(ctx, tex.calcada); ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.restore();
  }

  // Brita e escape asfaltado
  for (const b of p.britas) {
    if (!aparece(p, b.i0, b.i1, vista)) continue;
    const lado = b.lado > 0 ? 0 : 1, s = b.lado;
    const larg = (i: number) => Math.max(0, p.escape[lado][i] - 32);
    const dentro = pontosLimpos(p, b.i0, b.i1, () => s * (meia + 16));
    const fora = pontosLimpos(p, b.i0, b.i1, (i) => s * (meia + 16 + larg(i)));
    linha(ctx, [...dentro, ...fora.reverse()], true);
    ctx.fillStyle = b.asfalto ? (p.tema === 'noite' ? '#23262d' : '#64676c') : T.brita;
    ctx.fill();
    if (detalhe && !b.asfalto) { ctx.save(); ctx.clip(); ctx.fillStyle = padrao(ctx, tex.brita); ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.restore(); }
    if (b.asfalto && !b.rua && zoom > 0.15) {
      ctx.save(); ctx.clip();
      ctx.setLineDash([28, 28]); ctx.lineWidth = 20; ctx.strokeStyle = 'rgba(206,44,44,.9)';
      caminho(ctx, p, b.i0, b.i1, s * (meia + 28)); ctx.stroke();
      ctx.setLineDash([]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.8)';
      caminho(ctx, p, b.i0, b.i1, s * (meia + 42)); ctx.stroke();
      ctx.restore();
    }
  }

  // Muros e pneus
  for (const m of p.muros) {
    let dentro = false;
    for (let k = 0; k < m.pts.length; k += 6) if (perto(m.pts[k][0], m.pts[k][1], vista, 100)) { dentro = true; break; }
    if (!dentro) continue;
    linha(ctx, m.pts);
    if (T.noite) {
      ctx.lineWidth = 8; ctx.strokeStyle = '#4a5162'; ctx.stroke();
      ctx.setLineDash([34, 12]); ctx.lineWidth = 4; ctx.strokeStyle = '#ff3fa4'; ctx.stroke(); ctx.setLineDash([]);
      continue;
    }
    if (p.tema === 'rua') {
      ctx.lineWidth = 7; ctx.strokeStyle = '#c9ced3'; ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = '#7d848b'; ctx.stroke();
    } else {
      ctx.lineWidth = 6; ctx.strokeStyle = T.muro; ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.stroke();
    }
    if (!detalhe || m.lado === 0) continue;
    // pilhas de pneu com cinta vermelha, por dentro do muro, onde há brita
    ctx.lineWidth = 9;
    let k0 = -1;
    for (let k = 0; k <= m.pneus.length; k++) {
      const ligado = k < m.pneus.length && m.pneus[k];
      if (ligado && k0 < 0) k0 = k;
      if (!ligado && k0 >= 0) {
        const pts: P2[] = [];
        for (let j = k0; j < k; j++) {
          const q = m.pts[Math.min(m.pts.length - 1, j + 1)], o = m.pts[Math.max(0, j - 1)];
          const dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1;
          pts.push([m.pts[j][0] + (dy / l) * 7 * m.lado, m.pts[j][1] - (dx / l) * 7 * m.lado]);
        }
        if (pts.length > 1) {
          linha(ctx, pts);
          ctx.strokeStyle = '#1b1c1f'; ctx.stroke();
          ctx.setLineDash([9, 9]); ctx.strokeStyle = '#d33b3b'; ctx.stroke(); ctx.setLineDash([]);
        }
        k0 = -1;
      }
    }
  }

  desenharBoxes(ctx, p, vista, detalhe);

  // Asfalto
  caminho(ctx, p, 0, p.n, 0, true);
  ctx.lineWidth = p.L + 6; ctx.strokeStyle = T.borda; ctx.stroke();
  ctx.lineWidth = p.L; ctx.strokeStyle = T.asfalto; ctx.stroke();
  if (detalhe) {
    ctx.save();
    // a borracha da trajetória: uma faixa escura cortando por dentro das curvas
    ctx.lineWidth = p.L * 0.34;
    ctx.strokeStyle = T.noite ? 'rgba(0,0,0,.22)' : 'rgba(20,20,22,.15)';
    caminho(ctx, p, 0, p.n, (i) => Math.max(-meia * 0.55, Math.min(meia * 0.55, p.curv[i] * 9000)), true);
    ctx.stroke();
    caminho(ctx, p, 0, p.n, 0, true);
    ctx.lineWidth = p.L;
    ctx.strokeStyle = padrao(ctx, tex.asfalto);
    ctx.stroke();
    ctx.restore();
  }
  ctx.lineWidth = detalhe ? 3 : 7;
  ctx.strokeStyle = '#eef0f2';
  caminho(ctx, p, 0, p.n, meia - 4, true); ctx.stroke();
  caminho(ctx, p, 0, p.n, -(meia - 4), true); ctx.stroke();

  // Zebras
  for (const z of p.zebras) {
    if (!aparece(p, z.i0, z.i1, vista)) continue;
    linha(ctx, pontosLimpos(p, z.i0, z.i1, () => z.lado * (meia + 6)));
    ctx.lineWidth = detalhe ? 13 : 16;
    ctx.strokeStyle = '#f2f2f0'; ctx.stroke();
    ctx.setLineDash(detalhe ? [15, 15] : [30, 30]);
    ctx.strokeStyle = '#d6282e'; ctx.stroke();
    ctx.setLineDash([]);
  }

  // Linha de chegada e as caixas do grid
  const l = pontoNaPista(p, 0);
  ctx.save();
  ctx.translate(l.x, l.y); ctx.rotate(l.angulo);
  const q = detalhe ? 6 : 14;
  for (let f = 0; f < 3; f++) for (let k = 0; k * q < p.L; k++) {
    ctx.fillStyle = (k + f) % 2 ? '#15171b' : '#f4f7fb';
    ctx.fillRect(-q * 1.5 + f * q, -meia + k * q, q, Math.min(q, p.L - k * q));
  }
  ctx.restore();
  if (detalhe) {
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2.5;
    for (let lugar = 0; lugar < 8; lugar++) {
      const g = lugarNoGrid(p, lugar);
      ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.angulo);
      ctx.beginPath(); ctx.moveTo(26, -14); ctx.lineTo(30, -14); ctx.lineTo(30, 14); ctx.lineTo(26, 14); ctx.stroke();
      ctx.restore();
    }
    // Placas de freada: 3, 2 e 1 riscos
    for (const pl of p.placas) {
      if (!perto(pl.x, pl.y, vista, 30)) continue;
      ctx.save(); ctx.translate(pl.x, pl.y); ctx.rotate(pl.a);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-2, -8, 9, 18);
      ctx.fillStyle = '#f4f4f2'; ctx.fillRect(-5, -10, 9, 18);
      ctx.fillStyle = '#1b1d21';
      for (let s = 0; s < pl.n; s++) ctx.fillRect(-3.5 + s * 2.4, -8, 1.3, 14);
      ctx.restore();
    }
    for (const g of p.garagens) {
      if (!perto(g.x, g.y, vista, 120)) continue;
      ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.a);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-g.w / 2 + 6, -g.h / 2 + 8, g.w, g.h);
      ctx.fillStyle = T.noite ? '#2a2f3b' : '#e3e7ea'; ctx.fillRect(-g.w / 2, -g.h / 2, g.w, g.h);
      ctx.fillStyle = CORES_DAS_GARAGENS[g.k % CORES_DAS_GARAGENS.length];
      ctx.fillRect(-g.w / 2, p.box.lado > 0 ? -g.h / 2 : g.h / 2 - 12, g.w, 12);
      ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(-2, -g.h / 2, 4, g.h);
      ctx.restore();
    }
  }

  for (const a of p.arquibancadas) if (perto(a.x, a.y, vista, 120)) desenharArquibancada(ctx, p, a, detalhe);

  // Postos de fiscal (a bandeira, quando há, vai por cima e se mexe)
  if (detalhe) for (const po of p.postos) {
    if (!perto(po.x, po.y, vista, 30)) continue;
    ctx.save(); ctx.translate(po.x, po.y); ctx.rotate(po.a);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-6, -4, 16, 14);
    ctx.fillStyle = '#f08a1c'; ctx.fillRect(-9, -8, 16, 14);
    ctx.fillStyle = '#fff'; ctx.fillRect(-9, -8, 16, 3);
    ctx.restore();
  }

  // Árvores: as sombras primeiro, para nenhuma cair por cima de outra copa
  const arvores = p.arvores.filter((t) => perto(t.x, t.y, vista, 60));
  ctx.fillStyle = T.noite ? 'rgba(0,0,0,.3)' : 'rgba(0,0,0,.22)';
  for (const t of arvores) { ctx.beginPath(); ctx.arc(t.x + t.r * 0.35, t.y + t.r * 0.45, t.r, 0, Math.PI * 2); ctx.fill(); }
  for (const t of arvores) {
    if (p.tema === 'deserto') { desenharPalmeira(ctx, t.x, t.y, t.r, t.c); continue; }
    ctx.fillStyle = T.arvore[t.c];
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    if (detalhe) {
      ctx.fillStyle = 'rgba(255,255,220,.10)';
      ctx.beginPath(); ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.55, 0, Math.PI * 2); ctx.fill();
    }
  }

  if (p.predios.length) desenharPredios(ctx, p, vista, detalhe, zoom);
  if (p.def.esfera) desenharEsfera(ctx, p.def.esfera);
  desenharTunel(ctx, p, zoom);
}

function desenharBoxes(ctx: Ctx, p: Pista, vista: Vista, detalhe: boolean) {
  const b = p.box, s = b.lado, T = CORES[p.tema];
  const i0 = Math.round(b.d0 / PASSO), i1 = Math.round(b.d1 / PASSO);
  if (!aparece(p, i0, i1, vista)) return;
  const meioDaFaixa = b.muro + 6 + b.faixa / 2;
  caminho(ctx, p, i0, i1, s * meioDaFaixa);
  ctx.lineWidth = b.faixa; ctx.strokeStyle = T.noite ? '#2c2f36' : '#5a5d62'; ctx.stroke();
  // entrada e saída: rampas até a pista
  ctx.lineWidth = 26;
  for (const [a, c, entra] of [[i0 - 14, i0 + 2, true], [i1 - 2, i1 + 14, false]] as const) {
    ctx.beginPath();
    for (let k = a; k <= c; k++) {
      const i = idx(p, k), t = (k - a) / (c - a);
      const de = p.L / 2 - 4, ate = meioDaFaixa;
      const o = s * (entra ? de + (ate - de) * t : ate - (ate - de) * t);
      const x = p.xs[i] + p.nx[i] * o, y = p.ys[i] + p.ny[i] * o;
      if (k === a) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  if (detalhe) {
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.7)';
    caminho(ctx, p, i0, i1, s * (b.muro + b.faixa - 6)); ctx.stroke();
  }
  caminho(ctx, p, i0, i1, s * b.muro);
  ctx.lineWidth = 7; ctx.strokeStyle = T.noite ? '#6b7384' : '#dfe3e6'; ctx.stroke();
  if (!detalhe) return;
  // painéis da Saga no muro dos boxes
  for (let d = b.d0 + 80; d < b.d1 - 60; d += 160) {
    const q = pontoNaPista(p, d, s * (b.muro - 5));
    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.angulo);
    ctx.fillStyle = '#17336d'; ctx.fillRect(-30, -3, 60, 6);
    ctx.fillStyle = '#b7e3fc'; ctx.font = 'bold 5px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SAGA', 0, 0.3);
    ctx.restore();
  }
}

function bandeiraDoBrasil(ctx: Ctx, x: number, y: number) {
  ctx.fillStyle = '#1f9a4a'; ctx.fillRect(x, y, 13, 9);
  ctx.fillStyle = '#ffd500'; ctx.beginPath(); ctx.moveTo(x + 6.5, y + 1.2); ctx.lineTo(x + 12, y + 4.5); ctx.lineTo(x + 6.5, y + 7.8); ctx.lineTo(x + 1, y + 4.5); ctx.fill();
  ctx.fillStyle = '#1d3f8f'; ctx.beginPath(); ctx.arc(x + 6.5, y + 4.5, 2, 0, Math.PI * 2); ctx.fill();
}

function desenharArquibancada(ctx: Ctx, p: Pista, a: Arquibancada, detalhe: boolean) {
  const noite = CORES[p.tema].noite;
  ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.a);
  const w = a.w, h = a.h, frente = a.lado > 0 ? -1 : 1;
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(-w / 2 + 7, -h / 2 + 9, w, h);
  ctx.fillStyle = noite ? '#262a36' : '#aab2ba'; ctx.fillRect(-w / 2, -h / 2, w, h);
  if (detalhe) {
    const r = sorteio(Math.floor(a.x * 13 + a.y * 7));
    const degraus = Math.floor((h - 8) / 9);
    const paleta = p.def.torcida ?? ['#e5484d', '#3f7fe0', '#f4f7fb', '#f5c518', '#2ea36a', '#ff8000', '#1b1d21'];
    for (let g = 0; g < degraus; g++) {
      const y = frente > 0 ? -h / 2 + 4 + g * 9 : h / 2 - 12 - g * 9;
      ctx.fillStyle = noite ? '#1d2029' : g % 2 ? '#98a1aa' : '#a5adb5';
      ctx.fillRect(-w / 2 + 2, y, w - 4, 8);
      for (let x = -w / 2 + 4; x < w / 2 - 4; x += 4.3) {
        if (r() < 0.18) continue;
        ctx.fillStyle = paleta[Math.floor(r() * paleta.length)];
        ctx.fillRect(x, y + 2.5, 2.7, 2.7);
      }
    }
    ctx.fillStyle = noite ? '#343947' : '#eef1f3';
    ctx.fillRect(-w / 2, frente > 0 ? h / 2 - 16 : -h / 2, w, 16);
    if (p.def.bandeira === 'br') {
      for (let k = 0; k < 1 + Math.floor(r() * 2); k++) bandeiraDoBrasil(ctx, -w / 2 + 6 + r() * (w - 22), -h / 2 + 10 + r() * (h - 36));
    }
  }
  ctx.restore();
}

function desenharPalmeira(ctx: Ctx, x: number, y: number, r: number, c: number) {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = '#557f30'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + c;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7 - 2, Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3);
    ctx.stroke();
  }
  ctx.fillStyle = '#6b4f2a'; ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function desenharPredios(ctx: Ctx, p: Pista, vista: Vista, detalhe: boolean, zoom: number) {
  const noite = CORES[p.tema].noite;
  const telhados = noite ? ['#1b2030', '#222838', '#191d29', '#252b3b', '#1f2435'] : ['#c46f4e', '#e5dac6', '#d9b58c', '#b9b4ab', '#efe8da'];
  const neon = ['#ff3fa4', '#27f4d2', '#ffc906', '#8b6cff', '#4d9bff'];
  for (const b of p.predios) {
    if (!perto(b.x, b.y, vista, 140)) continue;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
    const sombra = 6 + b.alto * 18;
    ctx.fillStyle = noite ? 'rgba(0,0,0,.4)' : 'rgba(0,0,0,.2)';
    ctx.fillRect(-b.w / 2 + sombra * 0.6, -b.h / 2 + sombra, b.w, b.h);
    ctx.fillStyle = telhados[b.c]; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    if (noite) {
      if (b.alto > 0.35) {
        ctx.strokeStyle = neon[b.c]; ctx.lineWidth = zoom > 0.28 ? 2.2 : 5; ctx.globalAlpha = 0.9;
        ctx.strokeRect(-b.w / 2 + 3, -b.h / 2 + 3, b.w - 6, b.h - 6);
        ctx.globalAlpha = 1;
      }
      if (detalhe) {
        ctx.fillStyle = 'rgba(255,214,120,.5)';
        const r = sorteio(Math.floor(b.x * 7 + b.y));
        for (let x = -b.w / 2 + 10; x < b.w / 2 - 10; x += 9) for (let y = -b.h / 2 + 10; y < b.h / 2 - 10; y += 9) if (r() < 0.3) ctx.fillRect(x, y, 3, 3);
      }
    } else if (detalhe) {
      ctx.fillStyle = 'rgba(0,0,0,.07)'; ctx.fillRect(-b.w / 2, 0, b.w, b.h / 2);
      ctx.strokeStyle = 'rgba(0,0,0,.13)'; ctx.lineWidth = 1.5; ctx.strokeRect(-b.w / 2 + 1, -b.h / 2 + 1, b.w - 2, b.h - 2);
      if (b.c === 1 && b.alto > 0.55) { ctx.fillStyle = '#5fb7d8'; ctx.fillRect(-b.w * 0.2, -b.h * 0.15, b.w * 0.35, b.h * 0.28); }
      if (b.c === 3) { ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(-b.w * 0.3, -b.h * 0.3, b.w * 0.2, b.h * 0.2); }
    }
    ctx.restore();
  }
}

function desenharEsfera(ctx: Ctx, e: { x: number; y: number; r: number }) {
  const g = ctx.createRadialGradient(e.x, e.y, e.r * 0.2, e.x, e.y, e.r * 2.2);
  g.addColorStop(0, 'rgba(255,190,70,.35)'); g.addColorStop(1, 'rgba(255,110,50,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 2.2, 0, Math.PI * 2); ctx.fill();
  const g2 = ctx.createRadialGradient(e.x - e.r * 0.3, e.y - e.r * 0.3, e.r * 0.1, e.x, e.y, e.r);
  g2.addColorStop(0, '#ffe07a'); g2.addColorStop(0.55, '#ff8a3d'); g2.addColorStop(1, '#b8305a');
  ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
}

/**
 * O túnel de Mônaco. Vai no mundo parado, então os carros passam POR CIMA dele: de cima não se
 * veria carro nenhum lá dentro, e sumir o carro de quem pilota não é opção.
 */
function desenharTunel(ctx: Ctx, p: Pista, zoom: number) {
  if (!p.def.tunel) return;
  const [a, b] = p.def.tunel;
  const i0 = Math.round(a / PASSO), i1 = Math.round(b / PASSO), meia = p.L / 2;
  caminho(ctx, p, i0, i1, 0);
  ctx.lineCap = 'butt';
  ctx.lineWidth = p.L + 90; ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.stroke();
  ctx.lineWidth = p.L + 76; ctx.strokeStyle = '#d9d0bd'; ctx.stroke();
  // o chão do túnel, escuro, e as luzes do teto
  ctx.lineWidth = p.L; ctx.strokeStyle = '#3b3d42'; ctx.stroke();
  if (zoom > 0.28) {
    ctx.setLineDash([6, 34]); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,220,150,.55)';
    caminho(ctx, p, i0, i1, 0); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.2)';
    caminho(ctx, p, i0, i1, meia + 38); ctx.stroke();
    caminho(ctx, p, i0, i1, -(meia + 38)); ctx.stroke();
  }
}

// ---- o que se mexe ------------------------------------------------------------------------------

/** À noite, a luz dos postes, por cima de tudo (inclusive dos carros). */
export function desenharLuzDaNoite(ctx: Ctx, p: Pista, vista: Vista) {
  if (!CORES[p.tema].noite) return;
  const meia = p.L / 2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let d = 0; d < p.volta; d += 170) {
    const q = pontoNaPista(p, d, (Math.floor(d / 170) % 2 ? 1 : -1) * (meia + 14));
    if (!perto(q.x, q.y, vista, 200)) continue;
    const g = ctx.createRadialGradient(q.x, q.y, 4, q.x, q.y, 130);
    g.addColorStop(0, 'rgba(255,210,150,.30)'); g.addColorStop(1, 'rgba(255,190,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, 130, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** O pórtico da largada, com as luzes que acendem e apagam junto com o cartão. */
export function desenharPortico(ctx: Ctx, p: Pista, luzes: number | null) {
  const meia = p.L / 2;
  const g = pontoNaPista(p, 70);
  ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.angulo);
  ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.fillRect(2, -meia - 22 + 8, 7, p.L + 44);
  ctx.fillStyle = 'rgba(42,45,51,.9)'; ctx.fillRect(-3, -meia - 22, 7, p.L + 44);
  for (let k = 0; k < 5; k++) {
    ctx.fillStyle = luzes !== null && k < luzes ? '#ff2b36' : '#5a1a1f';
    ctx.beginPath(); ctx.arc(0.5, -16 + k * 8, 2.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** A bandeira do fiscal no posto, balançando. */
export function desenharBandeiraNoPosto(ctx: Ctx, po: Posto, cor: string, t: number) {
  ctx.save(); ctx.translate(po.x, po.y); ctx.rotate(po.a);
  const dir = po.lado > 0 ? -1 : 1;
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, dir * 14); ctx.stroke();
  for (let a = 0; a < 4; a++) {
    const onda = Math.sin(a * 1.2 + t / 90) * 2.5;
    ctx.fillStyle = a % 2 ? shade(cor) : cor;
    ctx.fillRect(-10 + a * 6, dir * 14 + (dir < 0 ? -16 : 0) + onda, 6.3, 16);
  }
  ctx.restore();
}

const shade = (cor: string) => (cor === '#ffd400' ? '#e8bf00' : cor === '#2f7bf5' ? '#2466d0' : cor);

/** A quadriculada na mão do fiscal em cima do muro dos boxes, na linha de chegada. */
export function desenharBandeirada(ctx: Ctx, p: Pista, t: number) {
  const s = p.box.lado;
  const q = pontoNaPista(p, 40, s * (p.box.muro + 2));
  ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.angulo);
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.arc(3, 4, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f08a1c'; ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, Math.PI * 2); ctx.fill();
  const dir = -s, col = 8, lin = 6, tq = 9;
  ctx.strokeStyle = '#3a3d42'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, dir * 16); ctx.stroke();
  for (let a = 0; a < col; a++) {
    const fase = a * 1.1 + t / 110;
    const onda = Math.sin(fase) * 3.5, luz = 0.82 + 0.18 * Math.cos(fase);
    for (let b = 0; b < lin; b++) {
      const v = Math.round(((a + b) % 2 ? 22 : 246) * luz);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(-tq * 2.5 + a * tq + onda * 0.3, dir * (16 + b * tq) + (dir < 0 ? -tq : 0) + onda, tq + 0.4, tq + 0.4);
    }
  }
  ctx.restore();
}

/** O carro visto de cima, apontando para +x, com 36 de comprimento. */
export function desenharCarro(ctx: Ctx, e: Equipe, x: number, y: number, angulo: number, noite = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angulo);
  ctx.fillStyle = noite ? 'rgba(0,0,0,.45)' : 'rgba(0,0,0,.30)';
  ctx.beginPath(); ctx.ellipse(2.5, 3.5, 19, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#141518';
  for (const [rx, ry, rw, rh] of PECAS.pneus) { ctx.beginPath(); ctx.roundRect(rx, ry, rw, rh, 1.4); ctx.fill(); }
  ctx.strokeStyle = '#2a2c30'; ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(11, -5.5); ctx.lineTo(6, -2); ctx.moveTo(11, 5.5); ctx.lineTo(6, 2);
  ctx.moveTo(-12.5, -5.5); ctx.lineTo(-8, -3); ctx.moveTo(-12.5, 5.5); ctx.lineTo(-8, 3); ctx.stroke();
  ctx.fillStyle = '#1c1d21'; ctx.fill(new Path2D(PECAS.assoalho));
  ctx.fillStyle = e.pri; ctx.fill(new Path2D(PECAS.corpo)); ctx.fill(new Path2D(PECAS.bico));
  ctx.globalAlpha = 0.95; ctx.fillStyle = e.acc; ctx.fill(new Path2D(PECAS.faixa)); ctx.globalAlpha = 1;
  ctx.fillStyle = '#0c0d10'; ctx.beginPath(); ctx.ellipse(-0.5, 0, 4.2, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = e.cabine ?? e.acc; ctx.beginPath(); ctx.arc(-1.4, 0, 1.75, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2b2d31'; ctx.lineWidth = 1.1; ctx.stroke(new Path2D(PECAS.halo));
  ctx.fillStyle = e.sec;
  ctx.beginPath(); ctx.roundRect(...PECAS.asaTraseira, 1); ctx.fill();
  ctx.beginPath(); ctx.roundRect(...PECAS.asaDianteira, 1); ctx.fill();
  ctx.fillStyle = e.pri;
  ctx.fillRect(-19, -8.2, 4.2, 1.4); ctx.fillRect(-19, 6.8, 4.2, 1.4);
  ctx.fillRect(15.2, -9.4, 3.4, 1.3); ctx.fillRect(15.2, 8.1, 3.4, 1.3);
  if (noite) { ctx.fillStyle = '#ff2b36'; ctx.fillRect(-20.2, -1, 1.8, 2); }
  ctx.restore();
}

/**
 * As peças do carro, em números: o carro existe duas vezes — no canvas da pista e em SVG no
 * grid e no menu —, e as duas saem daqui, senão o carro que se escolhe não seria o que se pilota.
 */
const PECAS = {
  pneus: [[-17, -10.5, 8.5, 5.2], [-17, 5.3, 8.5, 5.2], [8, -9.6, 6.8, 4.4], [8, 5.2, 6.8, 4.4]] as const,
  assoalho: 'M-15,-6.4 L4,-6.4 L8,-3 L8,3 L4,6.4 L-15,6.4 Z',
  corpo: 'M-14.5,-3.2 C-10,-6.3 -2,-6.4 3,-4.6 L6.5,-2.2 L6.5,2.2 L3,4.6 C-2,6.4 -10,6.3 -14.5,3.2 Z',
  bico: 'M5,-2.3 L16.5,-1.1 Q17.6,0 16.5,1.1 L5,2.3 Z',
  faixa: 'M-13,-0.9 L15.8,-0.5 L15.8,0.5 L-13,0.9 Z',
  halo: 'M3.4,0 L1,-2.4 L-3.5,-2.4 M3.4,0 L1,2.4 L-3.5,2.4',
  asaTraseira: [-19, -8.2, 4.2, 16.4] as [number, number, number, number],
  asaDianteira: [15.2, -9.4, 3.4, 18.8] as [number, number, number, number],
};

/** O mesmo carro em SVG, de lado a lado do quadro, apontando para a direita. */
export function CarroDesenho({ carro, largura = 116 }: { carro: string; largura?: number }) {
  const e = equipeDoCarro(carro);
  return (
    <svg width={largura} height={largura / 2} viewBox="-21 -11 42 21" aria-hidden="true" style={{ flex: 'none', overflow: 'visible' }}>
      <ellipse cx="2.5" cy="3.5" rx="19" ry="9" fill="rgba(0,0,0,.3)" />
      {PECAS.pneus.map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} rx="1.4" fill="#141518" />)}
      <path d="M11,-5.5 L6,-2 M11,5.5 L6,2 M-12.5,-5.5 L-8,-3 M-12.5,5.5 L-8,3" stroke="#2a2c30" strokeWidth=".9" />
      <path d={PECAS.assoalho} fill="#1c1d21" />
      <path d={PECAS.corpo} fill={e.pri} />
      <path d={PECAS.bico} fill={e.pri} />
      <path d={PECAS.faixa} fill={e.acc} opacity=".95" />
      <ellipse cx="-0.5" cy="0" rx="4.2" ry="2.6" fill="#0c0d10" />
      <circle cx="-1.4" cy="0" r="1.75" fill={e.cabine ?? e.acc} />
      <path d={PECAS.halo} stroke="#2b2d31" strokeWidth="1.1" fill="none" />
      <rect x={PECAS.asaTraseira[0]} y={PECAS.asaTraseira[1]} width={PECAS.asaTraseira[2]} height={PECAS.asaTraseira[3]} rx="1" fill={e.sec} />
      <rect x={PECAS.asaDianteira[0]} y={PECAS.asaDianteira[1]} width={PECAS.asaDianteira[2]} height={PECAS.asaDianteira[3]} rx="1" fill={e.sec} />
      <rect x="-19" y="-8.2" width="4.2" height="1.4" fill={e.pri} /><rect x="-19" y="6.8" width="4.2" height="1.4" fill={e.pri} />
      <rect x="15.2" y="-9.4" width="3.4" height="1.3" fill={e.pri} /><rect x="15.2" y="8.1" width="3.4" height="1.3" fill={e.pri} />
    </svg>
  );
}

/** O nome de quem pilota, em cima do carro, sempre em pé na tela. Vai sem transformação. */
export function desenharEtiqueta(ctx: Ctx, texto: string, cor: string, x: number, y: number) {
  ctx.font = '650 11px -apple-system, "Segoe UI", system-ui, sans-serif';
  const w = ctx.measureText(texto).width + 20, h = 17;
  const ex = Math.round(x - w / 2), ey = Math.round(y - 30);
  ctx.fillStyle = 'rgba(20,22,27,.78)';
  ctx.beginPath(); ctx.roundRect(ex, ey, w, h, h / 2); ctx.fill();
  ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(ex + 8, ey + h / 2, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4f7fb'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(texto, ex + 14, ey + h / 2 + 0.5);
}

// ---- os ladrilhos -------------------------------------------------------------------------------

/**
 * O mundo parado, cortado em quadrados do tamanho da tela e guardados. Cada quadro cola os que
 * aparecem e desenha no máximo `porQuadro` que faltam — o resto fica da cor do chão por um
 * instante, em vez de o jogo engasgar quando a câmera anda.
 *
 * A câmera não gira (foi a escolha do dono) e o zoom é fixo, então um ladrilho feito continua
 * servindo até o fim da corrida.
 */
export class Ladrilhos {
  private cache = new Map<string, HTMLCanvasElement>();
  private usados = new Map<string, number>();
  private quadro = 0;
  readonly mundo: number;

  constructor(readonly pista: Pista, readonly escala: number, readonly tam = 512, readonly maximo = 48) {
    this.mundo = tam / escala;
  }

  /** Cola na tela os ladrilhos que cobrem `vista`, com o mundo deslocado `offX, offY` pixels. */
  desenhar(ctx: Ctx, vista: Vista, offX: number, offY: number, porQuadro = 2) {
    this.quadro++;
    const T = this.mundo;
    const i0 = Math.floor(vista.x0 / T), i1 = Math.floor(vista.x1 / T);
    const j0 = Math.floor(vista.y0 / T), j1 = Math.floor(vista.y1 / T);
    const cx = (i0 + i1) / 2, cy = (j0 + j1) / 2;
    const faltando: { i: number; j: number; d: number }[] = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const chave = `${i},${j}`;
      const pronto = this.cache.get(chave);
      const x = i * this.tam - offX, y = j * this.tam - offY;
      if (pronto) {
        ctx.drawImage(pronto, x, y);
        this.usados.set(chave, this.quadro);
      } else {
        ctx.fillStyle = corDoFundo(this.pista);
        ctx.fillRect(x, y, this.tam, this.tam);
        faltando.push({ i, j, d: Math.hypot(i - cx, j - cy) });
      }
    }
    faltando.sort((a, b) => a.d - b.d);
    for (const f of faltando.slice(0, porQuadro)) {
      const tela = this.fazer(f.i, f.j);
      ctx.drawImage(tela, f.i * this.tam - offX, f.j * this.tam - offY);
    }
    return faltando.length;
  }

  /** Faz de antemão os ladrilhos em volta de um ponto — antes da largada, com o carro parado. */
  prefazer(x: number, y: number, raio: number, quantos: number) {
    const T = this.mundo;
    let feitos = 0;
    for (let i = Math.floor((x - raio) / T); i <= Math.floor((x + raio) / T); i++) {
      for (let j = Math.floor((y - raio) / T); j <= Math.floor((y + raio) / T); j++) {
        if (this.cache.has(`${i},${j}`)) continue;
        this.fazer(i, j);
        if (++feitos >= quantos) return feitos;
      }
    }
    return feitos;
  }

  private fazer(i: number, j: number) {
    const chave = `${i},${j}`;
    const tela = document.createElement('canvas');
    tela.width = this.tam; tela.height = this.tam;
    const ctx = tela.getContext('2d')!;
    const T = this.mundo;
    ctx.setTransform(this.escala, 0, 0, this.escala, -i * this.tam, -j * this.tam);
    desenharMundo(ctx, this.pista, { x0: i * T, y0: j * T, x1: (i + 1) * T, y1: (j + 1) * T }, this.escala / (window.devicePixelRatio || 1));
    this.cache.set(chave, tela);
    this.usados.set(chave, this.quadro);
    if (this.cache.size > this.maximo) {
      const velho = [...this.usados.entries()].sort((a, b) => a[1] - b[1])[0];
      if (velho && velho[1] < this.quadro) { this.cache.delete(velho[0]); this.usados.delete(velho[0]); }
    }
    return tela;
  }
}

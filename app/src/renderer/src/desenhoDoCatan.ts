/**
 * O desenho do tabuleiro do Catan: terrenos, mar, portos, fichas e peças, como texto SVG.
 *
 * É o mesmo desenho que o dono aprovou na prancheta ("melhore as ilustrações", 27/09/2026),
 * gerado por código e não por imagem: cada terreno tem volume (gradiente com luz no alto, sombra
 * embaixo), e o que há dentro — pinheiros, ovelhas, trigo, barro e tijolos, picos com neve, dunas
 * — sai de um sorteio com semente pela POSIÇÃO do terreno, para que o mesmo tabuleiro seja o mesmo
 * desenho em todo computador e não mude a cada leitura.
 *
 * Sai como texto, e não como JSX, porque é só enfeite e são milhares de formas: a tela monta
 * isto uma vez por partida (o fundo) e uma vez por mudança de peça, e os alvos de clique ficam
 * numa camada de JSX por cima. Nada aqui vem de fora: é tudo número e cor escritos neste arquivo.
 */
import type { Partida, Recurso, Terreno } from './catan.ts';
import { COR_DO_JOGADOR, centroDoHex, chaveDoHex, lerHex, pontoDoCruzamento } from './catan.ts';

const R3 = Math.sqrt(3);

const hex2rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = (c: number[]) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const clarear = (h: string, k: number) => rgb2hex(hex2rgb(h).map((v) => v + (255 - v) * k));
export const escurecer = (h: string, k: number) => rgb2hex(hex2rgb(h).map((v) => v * (1 - k)));

function sorteio(semente: number) {
  let a = semente >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const f = (v: number) => +v.toFixed(3);

const TERRA: Record<Terreno, { a: string; b: string }> = {
  floresta: { a: '#4f8a3c', b: '#24542a' },
  pasto: { a: '#b4e07a', b: '#6fae45' },
  campo: { a: '#f6d56b', b: '#d9a532' },
  colina: { a: '#e08a5a', b: '#a8502d' },
  montanha: { a: '#a9b0bd', b: '#6b7280' },
  deserto: { a: '#f0e0b0', b: '#cfb57a' },
};

const canto = (cx: number, cy: number, s: number, i: number): [number, number] => {
  const a = (Math.PI / 180) * (60 * i - 30);
  return [cx + s * Math.cos(a), cy + s * Math.sin(a)];
};
export const poli = (cx: number, cy: number, s: number) => [0, 1, 2, 3, 4, 5].map((i) => canto(cx, cy, s, i).map((v) => v.toFixed(2)).join(',')).join(' ');
const HEX1 = poli(0, 0, 1);

export function defs(): string {
  const grad = Object.entries(TERRA).map(([t, c]) =>
    `<radialGradient id="g-${t}" cx="35%" cy="28%" r="85%"><stop offset="0" stop-color="${clarear(c.a, .12)}"/><stop offset=".55" stop-color="${c.a}"/><stop offset="1" stop-color="${c.b}"/></radialGradient>`).join('');
  return `<defs>${grad}
    <clipPath id="recorte" clipPathUnits="userSpaceOnUse"><polygon points="${HEX1}"/></clipPath>
    <radialGradient id="g-mar" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#3d8fc9"/><stop offset=".75" stop-color="#2a6aa3"/><stop offset="1" stop-color="#1f5486"/></radialGradient>
    <linearGradient id="g-moldura" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ecd9a6"/><stop offset="1" stop-color="#c7a86a"/></linearGradient>
    <radialGradient id="g-ficha" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fffaf0"/><stop offset=".7" stop-color="#f3e5c2"/><stop offset="1" stop-color="#dcc796"/></radialGradient>
    <linearGradient id="g-vela" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9d3c3"/></linearGradient>
  </defs>`;
}

// ---------- os terrenos (unidade: hexágono de raio 1, recortado) ----------
function pinheiro(x: number, y: number, h: number): string {
  const w = h * .42, esc = '#1b3f20', med = '#2b6331', cla = '#4d8f3f';
  let s = `<ellipse cx="${f(x + h * .08)}" cy="${f(y + .02)}" rx="${f(w * .9)}" ry="${f(h * .08)}" fill="rgba(0,0,0,.22)"/>`;
  s += `<rect x="${f(x - h * .035)}" y="${f(y - h * .12)}" width="${f(h * .07)}" height="${f(h * .14)}" fill="#5a3a20"/>`;
  for (let i = 0; i < 3; i++) {
    const topo = y - h * (1 - i * .22), base = y - h * (.1 + (2 - i) * .2) + h * .05, lw = w * (.55 + i * .23);
    s += `<path d="M${f(x)} ${f(topo)}L${f(x + lw)} ${f(base)}Q${f(x)} ${f(base + h * .07)} ${f(x - lw)} ${f(base)}Z" fill="${med}"/>`;
    s += `<path d="M${f(x)} ${f(topo)}L${f(x - lw)} ${f(base)}Q${f(x - lw * .4)} ${f(base + h * .04)} ${f(x)} ${f(base + h * .03)}Z" fill="${cla}"/>`;
    s += `<path d="M${f(x)} ${f(topo)}L${f(x + lw)} ${f(base)}Q${f(x + lw * .5)} ${f(base + h * .05)} ${f(x + lw * .15)} ${f(base + h * .04)}Z" fill="${esc}" opacity=".7"/>`;
  }
  return s;
}
function ovelha(x: number, y: number, k: number, virada: boolean): string {
  const d = virada ? -1 : 1;
  let s = `<ellipse cx="${f(x)}" cy="${f(y + k * .55)}" rx="${f(k * 1.1)}" ry="${f(k * .22)}" fill="rgba(0,0,0,.18)"/>`;
  s += [[-.45, .45], [.35, .45]].map(([dx]) => `<rect x="${f(x + dx * k)}" y="${f(y + k * .2)}" width="${f(k * .12)}" height="${f(k * .38)}" rx="${f(k * .05)}" fill="#2a2a2a"/>`).join('');
  for (const [dx, dy, r] of [[-.5, 0, .42], [0, -.18, .48], [.45, -.02, .42], [-.1, .18, .45], [.35, .2, .38]]) s += `<circle cx="${f(x + dx * k)}" cy="${f(y + dy * k)}" r="${f(r * k)}" fill="#e9e6dc"/>`;
  for (const [dx, dy, r] of [[-.45, -.1, .3], [0, -.3, .33], [.4, -.14, .28]]) s += `<circle cx="${f(x + dx * k)}" cy="${f(y + dy * k)}" r="${f(r * k)}" fill="#fbfaf5"/>`;
  s += `<ellipse cx="${f(x + d * .95 * k)}" cy="${f(y - .08 * k)}" rx="${f(k * .28)}" ry="${f(k * .22)}" fill="#2b2b2b"/>`;
  s += `<ellipse cx="${f(x + d * .82 * k)}" cy="${f(y - .26 * k)}" rx="${f(k * .1)}" ry="${f(k * .06)}" fill="#2b2b2b"/>`;
  s += `<circle cx="${f(x + d * 1.02 * k)}" cy="${f(y - .12 * k)}" r="${f(k * .04)}" fill="#fff"/>`;
  return s;
}
function tufo(x: number, y: number, k: number, cor: string): string { return `<path d="M${f(x - k)} ${f(y)}q${f(k * .3)} ${f(-k * 1.2)} ${f(k * .5)} ${f(-k * 1.5)}M${f(x)} ${f(y)}v${f(-k * 1.8)}M${f(x + k)} ${f(y)}q${f(-k * .3)} ${f(-k * 1.2)} ${f(-k * .5)} ${f(-k * 1.5)}" stroke="${cor}" stroke-width="${f(k * .35)}" stroke-linecap="round" fill="none"/>`; }
function feixe(x: number, y: number, k: number): string {
  let s = `<ellipse cx="${f(x)}" cy="${f(y + k * .95)}" rx="${f(k * .55)}" ry="${f(k * .12)}" fill="rgba(0,0,0,.2)"/>`;
  for (let i = -3; i <= 3; i++) s += `<path d="M${f(x + i * k * .05)} ${f(y + k * .9)}L${f(x + i * k * .16)} ${f(y - k * .55)}" stroke="#c99a2e" stroke-width="${f(k * .07)}" stroke-linecap="round"/>`;
  for (let i = -3; i <= 3; i++) s += `<ellipse cx="${f(x + i * k * .17)}" cy="${f(y - k * .62 - Math.abs(i) * k * -.03)}" rx="${f(k * .08)}" ry="${f(k * .2)}" fill="${i % 2 ? '#f7dc7a' : '#eec04c'}" transform="rotate(${i * 8} ${f(x + i * k * .17)} ${f(y - k * .62)})"/>`;
  s += `<rect x="${f(x - k * .22)}" y="${f(y + k * .12)}" width="${f(k * .44)}" height="${f(k * .12)}" rx="${f(k * .04)}" fill="#8a5a22"/>`;
  return s;
}
function tijolos(x: number, y: number, k: number): string {
  let s = `<ellipse cx="${f(x)}" cy="${f(y + k * .1)}" rx="${f(k * 1.05)}" ry="${f(k * .16)}" fill="rgba(0,0,0,.25)"/>`;
  const L = [[-.9, 0], [-.3, 0], [.3, 0], [-.6, -.3], [0, -.3], [-.3, -.6]];
  for (const [dx, dy] of L) {
    const bx = x + dx * k, by = y + dy * k;
    s += `<rect x="${f(bx)}" y="${f(by - k * .28)}" width="${f(k * .58)}" height="${f(k * .28)}" rx="${f(k * .03)}" fill="#b4522c"/>`;
    s += `<rect x="${f(bx)}" y="${f(by - k * .28)}" width="${f(k * .58)}" height="${f(k * .08)}" rx="${f(k * .03)}" fill="#dc7c4e"/>`;
    s += `<rect x="${f(bx)}" y="${f(by - k * .28)}" width="${f(k * .58)}" height="${f(k * .28)}" rx="${f(k * .03)}" fill="none" stroke="#7a3219" stroke-width="${f(k * .03)}"/>`;
  }
  return s;
}
function pico(x: number, y: number, w: number, h: number, neve: boolean): string {
  const cla = '#c9ced8', esc = '#5c6371', topo = [x, y - h];
  let s = `<path d="M${f(x - w)} ${f(y)}L${f(topo[0])} ${f(topo[1])}L${f(x + w)} ${f(y)}Z" fill="${esc}"/>`;
  s += `<path d="M${f(x - w)} ${f(y)}L${f(topo[0])} ${f(topo[1])}L${f(x + w * .1)} ${f(y)}Z" fill="${cla}"/>`;
  s += `<path d="M${f(x - w * .35)} ${f(y - h * .35)}L${f(x - w * .1)} ${f(y - h * .25)}L${f(x + w * .1)} ${f(y - h * .5)}" stroke="${esc}" stroke-width=".018" fill="none" opacity=".6"/>`;
  if (neve) s += `<path d="M${f(topo[0])} ${f(topo[1])}L${f(x - w * .3)} ${f(y - h * .7)}L${f(x - w * .12)} ${f(y - h * .64)}L${f(x + w * .02)} ${f(y - h * .74)}L${f(x + w * .14)} ${f(y - h * .62)}L${f(x + w * .3)} ${f(y - h * .7)}Z" fill="#f7f9fc"/>`;
  return s;
}
function pedra(x: number, y: number, k: number): string {
  return `<path d="M${f(x - k)} ${f(y)}L${f(x - k * .6)} ${f(y - k * .7)}L${f(x + k * .3)} ${f(y - k * .8)}L${f(x + k)} ${f(y - k * .2)}L${f(x + k * .7)} ${f(y + k * .15)}Z" fill="#4b515d"/><path d="M${f(x - k * .6)} ${f(y - k * .7)}L${f(x + k * .3)} ${f(y - k * .8)}L${f(x)} ${f(y - k * .2)}Z" fill="#7b8291"/><path d="M${f(x + k * .1)} ${f(y - k * .5)}l${f(k * .12)} ${f(k * .12)}l${f(-k * .12)} ${f(k * .12)}l${f(-k * .12)} ${f(-k * .12)}Z" fill="#9fd4ff"/>`;
}
function cacto(x: number, y: number, k: number): string {
  const c = '#5f8a3a', e = '#46692a';
  return `<ellipse cx="${f(x + k * .2)}" cy="${f(y)}" rx="${f(k * .5)}" ry="${f(k * .1)}" fill="rgba(0,0,0,.18)"/><rect x="${f(x - k * .12)}" y="${f(y - k)}" width="${f(k * .24)}" height="${f(k)}" rx="${f(k * .12)}" fill="${c}"/><path d="M${f(x - k * .1)} ${f(y - k * .5)}h${f(-k * .22)}v${f(-k * .3)}" stroke="${c}" stroke-width="${f(k * .16)}" stroke-linecap="round" fill="none"/><path d="M${f(x + k * .1)} ${f(y - k * .62)}h${f(k * .22)}v${f(-k * .22)}" stroke="${c}" stroke-width="${f(k * .16)}" stroke-linecap="round" fill="none"/><rect x="${f(x + k * .02)}" y="${f(y - k)}" width="${f(k * .08)}" height="${f(k)}" rx="${f(k * .04)}" fill="${e}"/>`;
}

// Posições em volta da ficha do número (o centro fica livre).
const ANEL: [number, number][] = [[-.55, -.52], [0, -.72], [.52, -.5], [-.7, .02], [.7, .04], [-.5, .56], [.02, .78], [.52, .58]];

export function terreno(t: Terreno, semente: number): string {
  const rnd = sorteio(semente);
  let s = `<polygon points="${HEX1}" fill="url(#g-${t})"/>`;
  switch (t) {
    case 'floresta': {
      s += `<ellipse cx="0" cy=".2" rx=".9" ry=".6" fill="#2d5c2a" opacity=".35"/>`;
      const arv: [number, number, number][] = [];
      for (const [x, y] of [...ANEL, [-.28, -.3], [.3, -.28], [-.25, .45], [.3, .42]] as [number, number][]) arv.push([x + (rnd() - .5) * .08, y + .18 + (rnd() - .5) * .08, .3 + rnd() * .14]);
      arv.sort((a, b) => a[1] - b[1]).forEach(([x, y, h]) => { s += pinheiro(x, y, h); });
      break;
    }
    case 'pasto': {
      s += `<path d="M-1 .1Q-.4 -.15 .2 .05T1 -.05V1H-1Z" fill="#8fcf5a" opacity=".55"/><path d="M-1 .55Q-.3 .35 .3 .55T1 .5V1H-1Z" fill="#78b949" opacity=".6"/>`;
      for (let i = 0; i < 16; i++) s += tufo(-.8 + rnd() * 1.6, -.7 + rnd() * 1.5, .05, '#5c9a36');
      s += `<g stroke="#8b6a45" stroke-width=".035" stroke-linecap="round"><path d="M-.85 -.28L-.3 -.52"/><path d="M-.85 -.2L-.3 -.44"/><path d="M-.8 -.16v-.2M-.57 -.27v-.2M-.35 -.36v-.2"/></g>`;
      s += ovelha(.46, -.42, .13, true) + ovelha(-.56, .22, .12, false) + ovelha(.6, .3, .115, true) + ovelha(-.08, .66, .12, false);
      break;
    }
    case 'campo': {
      for (let i = -6; i <= 6; i++) {
        const y = i * .16;
        s += `<path d="M-1 ${f(y + .25)}Q0 ${f(y - .1)} 1 ${f(y + .15)}" stroke="${i % 2 ? '#e8b943' : '#fbe08a'}" stroke-width=".07" fill="none" opacity=".85"/>`;
      }
      for (let i = 0; i < 26; i++) {
        const x = -.8 + rnd() * 1.6, y = -.7 + rnd() * 1.5;
        if (Math.hypot(x, y - .08) < .42) continue;
        s += `<path d="M${f(x)} ${f(y)}v-.12" stroke="#b98a24" stroke-width=".02"/><ellipse cx="${f(x)}" cy="${f(y - .15)}" rx=".022" ry=".05" fill="#fff0a8"/>`;
      }
      s += feixe(-.55, -.2, .26) + feixe(.56, -.18, .24) + feixe(0, .55, .22);
      break;
    }
    case 'colina': {
      s += `<path d="M-1 -.35Q-.5 -.6 0 -.4T1 -.45V-.2Q.5 -.35 0 -.15T-1 -.1Z" fill="#c96d42" opacity=".8"/>`;
      s += `<path d="M-1 .2Q-.4 -.05 .2 .15T1 .1V.35Q.4 .2 -.1 .38T-1 .45Z" fill="#b95b33" opacity=".8"/>`;
      s += `<path d="M-.6 -.72Q-.2 -.95 .3 -.72Z" fill="#c96d42"/><path d="M-.6 -.72Q-.2 -.95 .3 -.72" stroke="#f0a077" stroke-width=".03" fill="none"/>`;
      for (let i = 0; i < 8; i++) s += `<circle cx="${f(-.8 + rnd() * 1.6)}" cy="${f(-.6 + rnd() * 1.3)}" r="${f(.02 + rnd() * .025)}" fill="#8c3f1e" opacity=".6"/>`;
      s += tijolos(-.5, -.25, .3) + tijolos(.48, .72, .26);
      s += `<path d="M.35 -.35q.1 -.25 .3 -.2" stroke="#6f3a1f" stroke-width=".05" stroke-linecap="round" fill="none"/><rect x=".55" y="-.62" width=".06" height=".4" fill="#7a4a28" transform="rotate(20 .58 -.42)"/><path d="M.5 -.66l.18 -.04l-.02 .12z" fill="#9aa1ab"/>`;
      break;
    }
    case 'montanha': {
      s += pico(-.35, -.05, .5, .8, true) + pico(.4, -.12, .45, .7, true) + pico(.02, .1, .4, .55, false);
      s += `<path d="M-1 .15Q0 -.05 1 .12V1H-1Z" fill="#7d8492" opacity=".6"/>`;
      s += pedra(-.55, .5, .14) + pedra(.5, .48, .16) + pedra(.02, .8, .12) + pedra(-.2, .62, .08);
      break;
    }
    case 'deserto': {
      s += `<path d="M-1 -.2Q-.5 -.45 0 -.25T1 -.3V1H-1Z" fill="#e7cf92" opacity=".7"/><path d="M-1 .3Q-.3 .05 .3 .3T1 .25V1H-1Z" fill="#dcc07e" opacity=".7"/>`;
      s += `<path d="M-.8 -.3Q-.5 -.45 -.2 -.3" stroke="#f7ebc8" stroke-width=".04" fill="none"/><path d="M.1 .28Q.4 .12 .7 .28" stroke="#f7ebc8" stroke-width=".04" fill="none"/>`;
      s += cacto(.58, -.2, .38) + cacto(-.62, .52, .28);
      s += `<ellipse cx="-.45" cy="-.55" rx=".08" ry=".05" fill="#b89f6a"/><ellipse cx=".35" cy=".7" rx=".06" ry=".04" fill="#b89f6a"/>`;
      break;
    }
  }
  // Brilho no alto e sombra embaixo, para o hexágono ter volume.
  s += `<polygon points="${HEX1}" fill="none" stroke="rgba(255,255,255,.28)" stroke-width=".07" transform="scale(.93)"/>`;
  return `<g clip-path="url(#recorte)">${s}</g>`;
}

// ---------- os ícones de recurso (cartas e portos), unidade 1 ----------
export function icone(rec: Recurso): string {
  switch (rec) {
    case 'madeira':
      return [[-.32, .2], [.32, .2], [0, -.22]].map(([x, y]) =>
        `<rect x="${f(x - .5)}" y="${f(y - .2)}" width=".8" height=".4" rx=".08" fill="#8a5a2b"/><rect x="${f(x - .5)}" y="${f(y - .2)}" width=".8" height=".1" rx=".05" fill="#a8733d"/><ellipse cx="${f(x + .3)}" cy="${f(y)}" rx=".13" ry=".2" fill="#e2b77a" stroke="#6b421d" stroke-width=".03"/><ellipse cx="${f(x + .3)}" cy="${f(y)}" rx=".06" ry=".1" fill="none" stroke="#b98848" stroke-width=".025"/>`).join('');
    case 'tijolo': return tijolos(-.3, .5, .55).replace(/<ellipse[^>]*\/>/, '');
    case 'la': return ovelha(-.1, .05, .55, false).replace(/<ellipse[^>]*rgba[^>]*\/>/, '');
    case 'trigo': return feixe(0, -.05, .62).replace(/<ellipse[^>]*rgba[^>]*\/>/, '');
    case 'minerio': return pedra(-.2, .45, .45) + pedra(.3, .5, .3);
  }
  return '';
}
export const FUNDO_DA_CARTA: Record<Recurso, [string, string]> = { madeira: ['#3f7a3a', '#234c26'], tijolo: ['#d98458', '#9c4a28'], la: ['#a6dc6c', '#5f9f3a'], trigo: ['#f6d56b', '#c99426'], minerio: ['#a6adba', '#5d6472'] };

const PONTOS: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
function ficha(cx: number, cy: number, s: number, n: number, aceso: boolean): string {
  const r = s * 0.31;
  const vermelho = n === 6 || n === 8;
  const cor = vermelho ? '#b8322a' : '#2b2b2b';
  const pts = PONTOS[n];
  const dots = Array.from({ length: pts }, (_, i) => `<circle cx="${f(cx + (i - (pts - 1) / 2) * r * 0.2)}" cy="${f(cy + r * 0.55)}" r="${f(r * 0.075)}" fill="${cor}"/>`).join('');
  return `<g>${aceso ? `<circle cx="${cx}" cy="${cy}" r="${f(r * 1.32)}" fill="none" stroke="#fff3b0" stroke-width="${f(s * .06)}"/>` : ''}<circle cx="${cx}" cy="${f(cy + s * .04)}" r="${f(r)}" fill="rgba(0,0,0,.35)"/><circle cx="${cx}" cy="${cy}" r="${f(r)}" fill="url(#g-ficha)" stroke="#a88a55" stroke-width="${f(s * .025)}"/><circle cx="${cx}" cy="${cy}" r="${f(r * .84)}" fill="none" stroke="#d8c290" stroke-width="${f(s * .012)}"/><text x="${cx}" y="${f(cy + r * 0.24)}" text-anchor="middle" font-family="Figtree" font-weight="800" font-size="${f(r * (vermelho ? 1.02 : .9))}" fill="${cor}">${n}</text>${dots}</g>`;
}

export function casa(x: number, y: number, cor: string, s: number, cidade: boolean): string {
  const k = s / 58;
  const esc = escurecer(cor, .3), cla = clarear(cor, .25), contorno = escurecer(cor, .65);
  let g;
  if (!cidade) {
    g = `<ellipse cx="1" cy="9" rx="11" ry="3.2" fill="rgba(0,0,0,.4)"/>
      <path d="M-8 8V-2L-3 -9L2 -2V8Z" fill="${cor}"/><path d="M2 -2L8 -5V5L2 8Z" fill="${esc}"/>
      <path d="M-9.5 -1L-3 -10.5L3.5 -1Z" fill="${cla}"/><path d="M-3 -10.5L4 -13.5L10 -5L3.5 -1Z" fill="${escurecer(cor, .15)}"/>
      <path d="M-8 8V-2L-9.5 -1L-3 -10.5L4 -13.5L10 -5L8 -5V5L2 8Z" fill="none" stroke="${contorno}" stroke-width="1.3" stroke-linejoin="round"/>
      <rect x="-5" y="1" width="3.5" height="7" fill="${contorno}" opacity=".55"/>`;
  } else {
    g = `<ellipse cx="2" cy="10" rx="15" ry="3.6" fill="rgba(0,0,0,.4)"/>
      <path d="M-13 9V0H3V9Z" fill="${cor}"/><path d="M3 0L8 -3V6L3 9Z" fill="${esc}"/>
      <path d="M-13 0L-8 -3H8L3 0Z" fill="${cla}"/>
      <path d="M-3 0V-11L1 -17L5 -11V0Z" fill="${cor}"/><path d="M5 -11L9 -13V-2L5 0Z" fill="${esc}"/>
      <path d="M-4 -10.5L1 -17.5L6 -10.5Z" fill="${cla}"/><path d="M1 -17.5L5 -19L10 -12.5L6 -10.5Z" fill="${escurecer(cor, .15)}"/>
      <path d="M-13 9V0L-8 -3H-3V-11L-4 -10.5L1 -17.5L5 -19L10 -12.5L9 -13V-2L8 -3V6L3 9Z" fill="none" stroke="${contorno}" stroke-width="1.3" stroke-linejoin="round"/>
      <rect x="-10" y="3" width="3" height="3" fill="${contorno}" opacity=".5"/><rect x="-5" y="3" width="3" height="3" fill="${contorno}" opacity=".5"/><rect x="0" y="-8" width="2.5" height="3.5" fill="${contorno}" opacity=".5"/>`;
  }
  return `<g transform="translate(${f(x)} ${f(y + s * .02)}) scale(${f(k * 1.05)})">${g}</g>`;
}
export function estrada(a: [number, number], b: [number, number], cor: string, s: number): string {
  const [x1, y1] = a, [x2, y2] = b;
  const mx = x1 + (x2 - x1) * .2, my = y1 + (y2 - y1) * .2, nx = x1 + (x2 - x1) * .8, ny = y1 + (y2 - y1) * .8;
  const w = s * .13;
  return `<line x1="${f(mx)}" y1="${f(my + s * .04)}" x2="${f(nx)}" y2="${f(ny + s * .04)}" stroke="rgba(0,0,0,.4)" stroke-width="${f(w)}" stroke-linecap="round"/>`
    + `<line x1="${f(mx)}" y1="${f(my)}" x2="${f(nx)}" y2="${f(ny)}" stroke="${escurecer(cor, .6)}" stroke-width="${f(w + s * .03)}" stroke-linecap="round"/>`
    + `<line x1="${f(mx)}" y1="${f(my)}" x2="${f(nx)}" y2="${f(ny)}" stroke="${cor}" stroke-width="${f(w)}" stroke-linecap="round"/>`
    + `<line x1="${f(mx)}" y1="${f(my - w * .22)}" x2="${f(nx)}" y2="${f(ny - w * .22)}" stroke="${clarear(cor, .4)}" stroke-width="${f(w * .25)}" stroke-linecap="round" opacity=".8"/>`;
}
function barco(x: number, y: number, k: number, virado: boolean): string {
  const d = virado ? -1 : 1;
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${f(k * d)} ${f(k)})"><path d="M-14 2H14L9 9H-9Z" fill="#6b4423" stroke="#3d2511" stroke-width="1.2"/><path d="M-14 2H14" stroke="#8d5d33" stroke-width="2"/><path d="M0 2V-18" stroke="#3d2511" stroke-width="1.6"/><path d="M1 -17Q11 -8 1 0Z" fill="url(#g-vela)" stroke="#9c9481" stroke-width=".8"/><path d="M-1 -15Q-9 -8 -1 -1Z" fill="url(#g-vela)" stroke="#9c9481" stroke-width=".8"/><path d="M0 -18l5 1.5l-5 1.5" fill="#d8453b"/></g>`;
}
/**
 * O ladrão: o mascarado de pele escura (escolha do dono, 06/10/2026 — "quero algo mais ladrão
 * mesmo"; era um peão cinza). Touca, máscara nos olhos, camisa listrada e o saco de moedas nas
 * costas. O contorno claro (`ladrao-contorno`) é o que o separa da floresta e da montanha: sem ele,
 * a touca e a máscara somem no verde escuro. Ids fixos — só há um ladrão no tabuleiro.
 */
const TORSO = 'M-9.5 12C-10.5 2 -8.5 -3.4 -5 -5.4H5C8.5 -3.4 10.5 2 9.5 12Z';
const FIGURA_DO_LADRAO = `<ellipse cx="2" cy="19" rx="14" ry="3.8" fill="rgba(0,0,0,.42)"/>
  <defs><filter id="ladrao-contorno" x="-30%" y="-30%" width="160%" height="160%"><feMorphology in="SourceAlpha" operator="dilate" radius="1.3" result="d"/><feFlood flood-color="#fff6dc" flood-opacity=".8"/><feComposite in2="d" operator="in" result="borda"/><feMerge><feMergeNode in="borda"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <clipPath id="ladrao-listras"><path d="${TORSO}"/></clipPath></defs>
  <g filter="url(#ladrao-contorno)">
    <path d="M2 -14C1 -25 19 -26 19 -12C20 -1 6 0 4 -6Z" fill="#b8874c" stroke="#5e3f1d" stroke-width="1"/>
    <path d="M6 -19c2 -3 6 -3 7 -1" stroke="#5e3f1d" stroke-width=".9" fill="none"/>
    <circle cx="12.6" cy="-10.6" r="3" fill="#f0bd4f" stroke="#8a6526" stroke-width=".8"/><path d="M11.6 -10.6h2" stroke="#8a6526" stroke-width=".7"/>
    <rect x="-6.4" y="10" width="5" height="7.6" rx="1.6" fill="#2b2f3a"/><rect x="1.4" y="10" width="5" height="7.6" rx="1.6" fill="#2b2f3a"/>
    <ellipse cx="-4" cy="18" rx="3.8" ry="1.9" fill="#111115"/><ellipse cx="4.2" cy="18" rx="3.8" ry="1.9" fill="#111115"/>
    <path d="${TORSO}" fill="#f4f4f6"/>
    <g clip-path="url(#ladrao-listras)" fill="#1b1b22">${[-5, -1.6, 1.8, 5.2, 8.6].map((y) => `<rect x="-12" y="${y}" width="24" height="1.8"/>`).join('')}</g>
    <path d="${TORSO}" fill="none" stroke="#1b1b22" stroke-width="1"/>
    <path d="M-7.5 -2.5L-10.5 6" stroke="#f4f4f6" stroke-width="3.6" stroke-linecap="round"/><path d="M-7.5 -2.5L-10.5 6" stroke="#1b1b22" stroke-width="3.6" stroke-linecap="round" stroke-dasharray="1.6 1.6"/>
    <circle cx="-10.8" cy="7" r="2" fill="#1b1b22"/>
    <path d="M5.5 -3.5L6.5 -12.5" stroke="#f4f4f6" stroke-width="3.6" stroke-linecap="round"/><path d="M5.5 -3.5L6.5 -12.5" stroke="#1b1b22" stroke-width="3.6" stroke-linecap="round" stroke-dasharray="1.6 1.6"/>
    <circle cx="6.7" cy="-13.6" r="2" fill="#1b1b22"/>
    <circle cx="0" cy="-12" r="7.6" fill="#6e4428" stroke="#2e1a0e" stroke-width=".9"/>
    <path d="M-7.9 -12.6A7.9 7.9 0 0 1 7.9 -12.6Z" fill="#1d1d25"/><rect x="-8.4" y="-14.2" width="16.8" height="2.8" rx="1.3" fill="#33333f"/>
    <path d="M-8.2 -11.4Q0 -13.8 8.2 -11.4L7.8 -8Q0 -10.2 -7.8 -8Z" fill="#111114"/>
    <ellipse cx="-3.1" cy="-10.1" rx="1.9" ry="1.25" fill="#fff"/><ellipse cx="3.1" cy="-10.1" rx="1.9" ry="1.25" fill="#fff"/>
    <circle cx="-2.6" cy="-10" r=".85" fill="#111"/><circle cx="3.6" cy="-10" r=".85" fill="#111"/>
    <path d="M-2.4 -6.2q2.4 1.5 4.8 -.4" stroke="#2a140a" stroke-width=".9" fill="none" stroke-linecap="round"/>
    <path d="M-5.4 -6.6a2 1.2 0 0 0 1.6 1" stroke="#8f5c3a" stroke-width=".6" fill="none" opacity=".8"/>
  </g>`;
export function ladrao(x: number, y: number, s: number): string {
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s / 58)})">${FIGURA_DO_LADRAO}</g>`;
}


// ---------------------------------------------------------------------------------------------
// O tabuleiro da partida.
// ---------------------------------------------------------------------------------------------

/** O raio de um terreno, em unidades do SVG. */
export const S = 60;
const RM = 5.55;
export const LARGURA = S * RM * 2 + S * 0.5;
export const ALTURA = S * RM * R3 + S * 0.5;
/** Do sistema da partida (raio 1, centro 0) para o do SVG. */
export const noSvg = (p: { x: number; y: number }) => ({ x: LARGURA / 2 + p.x * S, y: ALTURA / 2 + p.y * S });

/** O fundo: moldura, mar, costa, portos e terrenos. Muda só com o tabuleiro — uma vez por partida. */
export function desenharFundo(p: Pick<Partida, 'hexes' | 'portos'>): string {
  const ox = LARGURA / 2, oy = ALTURA / 2, s = S;
  let out = defs();
  const marPts = (raio: number) => [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (Math.PI / 180) * (60 * i);
    return `${f(ox + s * raio * Math.cos(a))},${f(oy + s * raio * Math.sin(a))}`;
  }).join(' ');
  out += `<polygon points="${marPts(RM)}" fill="url(#g-moldura)" stroke="#9c7d45" stroke-width="2" stroke-linejoin="round"/>`;
  out += `<polygon points="${marPts(RM - 0.2)}" fill="url(#g-mar)" stroke="#8f7440" stroke-width="1.5" stroke-linejoin="round"/>`;
  for (const h of p.hexes) {
    const c = noSvg(centroDoHex(h.q, h.r));
    out += `<polygon points="${poli(c.x, c.y, s * 1.16)}" fill="#4aa3d6" opacity=".5"/>`;
  }
  const rnd = sorteio(7);
  for (let i = 0; i < 34; i++) {
    const a = rnd() * Math.PI * 2, rr = s * (4.25 + rnd() * 0.5);
    const x = ox + rr * Math.cos(a), y = oy + rr * Math.sin(a) * 0.88;
    out += `<path d="M${f(x - s * 0.14)} ${f(y)}q${f(s * 0.07)} ${f(-s * 0.06)} ${f(s * 0.14)} 0t${f(s * 0.14)} 0" stroke="#8cc4ea" stroke-width="${f(s * 0.025)}" fill="none" stroke-linecap="round" opacity=".7"/>`;
  }
  // Os portos: o píer sai dos dois cruzamentos do porto para o mar, na direção oposta ao terreno.
  p.portos.forEach((porto, i) => {
    const a = pontoDoCruzamento(porto.cruzamentos[0]);
    const b = pontoDoCruzamento(porto.cruzamentos[1]);
    const dono = p.hexes.map((h) => centroDoHex(h.q, h.r))
      .find((c) => Math.abs(Math.hypot(c.x - a.x, c.y - a.y) - 1) < 1e-6 && Math.abs(Math.hypot(c.x - b.x, c.y - b.y) - 1) < 1e-6) ?? { x: 0, y: 0 };
    const A = noSvg(a), B = noSvg(b), C = noSvg(dono);
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    const px = C.x + (mx - C.x) * 1.66, py = C.y + (my - C.y) * 1.66;
    for (const q of [A, B]) {
      const ix = q.x + (px - q.x) * 0.6, iy = q.y + (py - q.y) * 0.6;
      out += `<line x1="${f(q.x)}" y1="${f(q.y + s * 0.03)}" x2="${f(ix)}" y2="${f(iy + s * 0.03)}" stroke="rgba(0,0,0,.3)" stroke-width="${f(s * 0.11)}"/>`;
      out += `<line x1="${f(q.x)}" y1="${f(q.y)}" x2="${f(ix)}" y2="${f(iy)}" stroke="#a0763f" stroke-width="${f(s * 0.11)}"/>`;
      out += `<line x1="${f(q.x)}" y1="${f(q.y)}" x2="${f(ix)}" y2="${f(iy)}" stroke="#6b4a24" stroke-width="${f(s * 0.11)}" stroke-dasharray="${f(s * 0.02)} ${f(s * 0.07)}"/>`;
      out += `<circle cx="${f(ix)}" cy="${f(iy)}" r="${f(s * 0.05)}" fill="#5a3b1c"/>`;
    }
    const dx = px - C.x, dy = py - C.y, dl = Math.hypot(dx, dy);
    if (i % 3 === 0) out += barco(px + (-dy / dl) * s * 0.55 + (dx / dl) * s * 0.15, py + (dx / dl) * s * 0.55, (s / 58) * 0.9, dx < 0);
    const rp = s * 0.3;
    const fundo = porto.tipo === '3:1' ? '#f4e8c8' : FUNDO_DA_CARTA[porto.tipo][0];
    out += `<circle cx="${f(px)}" cy="${f(py + s * 0.04)}" r="${f(rp)}" fill="rgba(0,0,0,.35)"/><circle cx="${f(px)}" cy="${f(py)}" r="${f(rp)}" fill="${fundo}" stroke="#f7eed6" stroke-width="${f(s * 0.05)}"/>`;
    if (porto.tipo === '3:1') out += `<text x="${f(px)}" y="${f(py + s * 0.09)}" text-anchor="middle" font-family="Figtree" font-weight="800" font-size="${f(s * 0.25)}" fill="#3b2f1a">3:1</text>`;
    else out += `<g transform="translate(${f(px)} ${f(py - s * 0.06)}) scale(${f(s * 0.24)})">${icone(porto.tipo)}</g><text x="${f(px)}" y="${f(py + s * 0.24)}" text-anchor="middle" font-family="Figtree" font-weight="800" font-size="${f(s * 0.15)}" fill="#fff" stroke="rgba(0,0,0,.55)" stroke-width="${f(s * 0.04)}" paint-order="stroke">2:1</text>`;
  });
  for (const h of p.hexes) {
    const c = noSvg(centroDoHex(h.q, h.r));
    // A semente é a posição: o mesmo terreno no mesmo lugar é o mesmo desenho em toda tela.
    const semente = (h.q + 5) * 31 + (h.r + 5) * 7;
    out += `<polygon points="${poli(c.x, c.y + s * 0.05, s * 0.99)}" fill="rgba(0,0,0,.35)"/>`;
    out += `<g transform="translate(${f(c.x)} ${f(c.y)}) scale(${f(s * 0.97)})">${terreno(h.terreno, semente)}</g>`;
    out += `<polygon points="${poli(c.x, c.y, s * 0.985)}" fill="none" stroke="#f3e6c4" stroke-width="${f(s * 0.06)}" stroke-linejoin="round"/>`;
  }
  return out;
}

/**
 * O que muda na partida: fichas (acendem com o número que saiu), ladrão, estradas, aldeias e
 * cidades. `acesos` são os terrenos que acabaram de render.
 */
export function desenharPecas(p: Pick<Partida, 'hexes' | 'ladrao' | 'estradas' | 'construcoes' | 'jogadores'>, acesos: Set<string>): string {
  const s = S;
  let out = '';
  for (const h of p.hexes) {
    const k = chaveDoHex(h.q, h.r);
    const c = noSvg(centroDoHex(h.q, h.r));
    const aceso = acesos.has(k);
    if (aceso) out += `<polygon points="${poli(c.x, c.y, s * 0.9)}" fill="rgba(255,243,176,.16)" stroke="#fff3b0" stroke-width="${f(s * 0.07)}"/>`;
    if (h.numero) out += ficha(c.x, c.y + s * 0.08, s, h.numero, aceso);
  }
  const L = noSvg(centroDoHex(lerHex(p.ladrao).q, lerHex(p.ladrao).r));
  out += ladrao(L.x + (p.hexes.find((h) => chaveDoHex(h.q, h.r) === p.ladrao)?.numero ? s * 0.42 : 0), L.y + s * 0.05, s);
  const cor = (j: number) => COR_DO_JOGADOR[p.jogadores[j]?.cor ?? 'branco'];
  for (const e of p.estradas) {
    const [v, w] = e.a.split('|').map((x) => noSvg(pontoDoCruzamento(x)));
    out += estrada([v.x, v.y], [w.x, w.y], cor(e.j), s);
  }
  // De cima para baixo, para a casa de baixo cobrir a sombra da de cima.
  for (const c of [...p.construcoes].sort((a, b) => pontoDoCruzamento(a.v).y - pontoDoCruzamento(b.v).y)) {
    const q = noSvg(pontoDoCruzamento(c.v));
    out += casa(q.x, q.y, cor(c.j), s, c.tipo === 'cidade');
  }
  return out;
}

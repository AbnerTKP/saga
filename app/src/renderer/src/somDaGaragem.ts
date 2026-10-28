/**
 * Os sons da Garagem, sintetizados na hora como os do Catan (`somDoCatan.ts`): nenhum arquivo a
 * mais no pacote. São os da prancheta que o dono ouviu e aprovou em 26/10/2026:
 *
 * - o parabéns: a melodia em onda quadrada com a oitava de baixo em triângulo (o "chiptune" do
 *   jogo de pixel), as palmas do "é pique" e a gritaria do rá-tim-bum;
 * - gole: três "glub" descendo; mordida: dois estalos; soluço: um "hic" subindo;
 * - desmaio: o assobio caindo e o baque no chão;
 * - as motos: a Harley no "batata-batata" grave, a Sahara no ronco mais fino de monocilíndrica.
 *
 * E, desde os temas (27/10/2026, ainda não ouvidos pelo dono): o V8 rosnando e o jipe a diesel, o
 * hidráulico do elevador e a parafusadeira, a musiquinha do console e a batida da máquina de dança,
 * o teclado e o "plim" da live; a água do bebedouro; e os da Navinha — o tiro, o acerto, a explosão,
 * a nave caindo, a onda nova, o fim de jogo e a ficha entrando.
 *
 * Quem decide o que tocar é a tela (`TelaDaGaragem.tsx`), a partir das ocorrências do `garagem.ts`;
 * quem está de fone desligado não ouve nada daqui. Se ficou bom é de ouvido, e isso é do dono: a
 * bancada de teste é muda.
 */
import { ROTEIRO } from './garagem';
import type { SomDaPeca } from './temasDaGaragem';

let contexto: AudioContext | null = null;
const VOLUME = 0.2;

function ctx(): AudioContext | null {
  try {
    contexto ??= new AudioContext();
    if (contexto.state === 'suspended') void contexto.resume();
    return contexto;
  } catch {
    return null;
  }
}

let ruidoGuardado: AudioBuffer | null = null;
function ruido(c: AudioContext) {
  if (!ruidoGuardado || ruidoGuardado.sampleRate !== c.sampleRate) {
    ruidoGuardado = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = ruidoGuardado.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return ruidoGuardado;
}

function tom(c: AudioContext, saida: AudioNode, tipo: OscillatorType, f0: number, f1: number, ini: number, dur: number, vol: number) {
  const o = c.createOscillator();
  o.type = tipo;
  o.frequency.setValueAtTime(f0, ini);
  o.frequency.exponentialRampToValueAtTime(f1, ini + dur);
  const env = c.createGain();
  env.gain.setValueAtTime(0.001, ini);
  env.gain.linearRampToValueAtTime(vol, ini + 0.01);
  env.gain.exponentialRampToValueAtTime(0.001, ini + dur);
  o.connect(env).connect(saida);
  o.start(ini);
  o.stop(ini + dur + 0.02);
}

function estalo(c: AudioContext, saida: AudioNode, ini: number, freq: number, dur: number, vol: number) {
  const n = c.createBufferSource();
  n.buffer = ruido(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 0.9;
  const env = c.createGain();
  env.gain.setValueAtTime(0.001, ini);
  env.gain.linearRampToValueAtTime(vol, ini + 0.004);
  env.gain.exponentialRampToValueAtTime(0.001, ini + dur);
  n.connect(bp).connect(env).connect(saida);
  n.start(ini);
  n.stop(ini + dur + 0.02);
}

export type SomDaGaragem =
  | 'gole' | 'mordida' | 'soluco' | 'desmaio' | 'agua'
  | SomDaPeca
  | 'tiro' | 'acertou' | 'explodiu' | 'morreu' | 'onda' | 'fim' | 'comecou';

/** Um som curto. `forca` abaixa o dos OUTROS (o seu gole é mais perto que o do vizinho). */
export function tocarNaGaragem(som: SomDaGaragem, forca = 1) {
  const c = ctx();
  if (!c) return;
  const saida = c.createGain();
  saida.gain.value = VOLUME * forca;
  saida.connect(c.destination);
  const t = c.currentTime + 0.01;
  if (som === 'gole') for (let k = 0; k < 3; k++) tom(c, saida, 'sine', 320 - k * 30, 170, t + k * 0.12, 0.09, 0.5);
  else if (som === 'mordida') { estalo(c, saida, t, 2600, 0.06, 0.7); estalo(c, saida, t + 0.14, 2200, 0.07, 0.6); }
  else if (som === 'soluco') tom(c, saida, 'sine', 480, 950, t, 0.07, 0.35);
  else if (som === 'desmaio') {
    tom(c, saida, 'sine', 950, 210, t, 0.5, 0.35);
    tom(c, saida, 'sine', 95, 38, t + 0.5, 0.25, 0.9);
    estalo(c, saida, t + 0.5, 300, 0.18, 0.6);
  } else if (som === 'agua') {
    for (let k = 0; k < 2; k++) tom(c, saida, 'sine', 420 - k * 40, 260, t + k * 0.12, 0.08, 0.4);
    tom(c, saida, 'triangle', 330, 220, t + 0.3, 0.35, 0.2);
  } else if (som === 'harley' || som === 'sahara' || som === 'v8' || som === 'jipe') ronco(c, saida, som, t);
  else if (som === 'elevador') {
    chiado(c, saida, t, 0.9, 2400, 0.25);
    tom(c, saida, 'sawtooth', 55, 70, t, 1.0, 0.18);
  } else if (som === 'parafusadeira') {
    for (let k = 0; k < 14; k++) estalo(c, saida, t + k * 0.045, 3200, 0.03, 0.55);
    tom(c, saida, 'square', 380, 520, t, 0.65, 0.08);
  } else if (som === 'console') {
    [523, 659, 784, 1047].forEach((f, k) => tom(c, saida, 'square', f, f, t + k * 0.09, 0.12, 0.18));
  } else if (som === 'danca') {
    for (let k = 0; k < 4; k++) { tom(c, saida, 'sine', 140, 45, t + k * 0.25, 0.16, 0.9); estalo(c, saida, t + k * 0.25 + 0.125, 6000, 0.04, 0.4); }
    [659, 784, 988, 784].forEach((f, k) => tom(c, saida, 'square', f, f, t + k * 0.25, 0.1, 0.12));
  } else if (som === 'teclado') {
    for (let k = 0; k < 9; k++) estalo(c, saida, t + k * 0.07 + Math.random() * 0.02, 4200, 0.025, 0.5);
  } else if (som === 'live') {
    tom(c, saida, 'sine', 880, 880, t, 0.25, 0.3); tom(c, saida, 'sine', 1320, 1320, t + 0.12, 0.35, 0.25);
  } else if (som === 'tiro') tom(c, saida, 'square', 1200, 260, t, 0.09, 0.12);
  else if (som === 'acertou') tom(c, saida, 'square', 600, 900, t, 0.05, 0.12);
  else if (som === 'explodiu') { chiado(c, saida, t, 0.25, 900, 0.5); tom(c, saida, 'square', 180, 60, t, 0.2, 0.12); }
  else if (som === 'morreu') { chiado(c, saida, t, 0.8, 500, 0.6); tom(c, saida, 'sawtooth', 400, 40, t, 0.8, 0.2); }
  else if (som === 'onda') [523, 659, 784, 1047, 1319].forEach((f, k) => tom(c, saida, 'square', f, f, t + k * 0.07, 0.1, 0.14));
  else if (som === 'fim') [784, 659, 523, 392, 262].forEach((f, k) => tom(c, saida, 'square', f, f * 0.98, t + k * 0.16, 0.18, 0.16));
  else if (som === 'comecou') { tom(c, saida, 'square', 988, 988, t, 0.08, 0.15); tom(c, saida, 'square', 1319, 1319, t + 0.08, 0.3, 0.15); }
  setTimeout(() => saida.disconnect(), 2500);
}

/** Ruído passando num filtro: o chiado do hidráulico e o estouro da explosão. */
function chiado(c: AudioContext, saida: AudioNode, ini: number, dur: number, freq: number, vol: number) {
  const n = c.createBufferSource(); n.buffer = ruido(c); n.loop = true;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 0.6;
  const env = c.createGain();
  env.gain.setValueAtTime(0.001, ini);
  env.gain.linearRampToValueAtTime(vol, ini + 0.02);
  env.gain.exponentialRampToValueAtTime(0.001, ini + dur);
  n.connect(bp).connect(env).connect(saida);
  n.start(ini); n.stop(ini + dur + 0.05);
}

/** O ronco: a Harley no "batata-batata" grave, a Sahara mais fina, o V8 rosnando e o jipe a diesel. */
function ronco(c: AudioContext, saida: AudioNode, moto: 'harley' | 'sahara' | 'v8' | 'jipe', t: number) {
  const o = c.createOscillator();
  o.type = 'sawtooth';
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  const env = c.createGain();
  env.gain.value = 0;
  const lfo = c.createOscillator();
  lfo.type = 'square';
  const prof = c.createGain();
  if (moto === 'v8') {
    lp.frequency.value = 650;
    o.frequency.setValueAtTime(42, t); o.frequency.linearRampToValueAtTime(95, t + 0.3); o.frequency.linearRampToValueAtTime(60, t + 0.55);
    o.frequency.linearRampToValueAtTime(110, t + 0.8); o.frequency.linearRampToValueAtTime(45, t + 1.3);
    lfo.frequency.value = 11; prof.gain.value = 0.18;
  } else if (moto === 'jipe') {
    lp.frequency.value = 420;
    o.frequency.setValueAtTime(48, t); o.frequency.linearRampToValueAtTime(75, t + 0.4); o.frequency.linearRampToValueAtTime(50, t + 1.3);
    lfo.frequency.value = 6; prof.gain.value = 0.25;
  } else if (moto === 'harley') {
    lp.frequency.value = 520;
    o.frequency.setValueAtTime(36, t); o.frequency.linearRampToValueAtTime(68, t + 0.35); o.frequency.linearRampToValueAtTime(40, t + 1.3);
    lfo.frequency.setValueAtTime(8, t); lfo.frequency.linearRampToValueAtTime(15, t + 0.35); lfo.frequency.linearRampToValueAtTime(7, t + 1.3);
    prof.gain.value = 0.22;
  } else {
    lp.frequency.value = 1300;
    o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(190, t + 0.25); o.frequency.linearRampToValueAtTime(105, t + 0.5);
    o.frequency.linearRampToValueAtTime(205, t + 0.72); o.frequency.linearRampToValueAtTime(72, t + 1.25);
    lfo.frequency.value = 24;
    prof.gain.value = 0.1;
  }
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.42, t + 0.05);
  env.gain.setValueAtTime(0.42, t + 1.0);
  env.gain.linearRampToValueAtTime(0, t + 1.4);
  lfo.connect(prof).connect(env.gain);
  o.connect(lp).connect(env).connect(saida);
  o.start(t); lfo.start(t);
  o.stop(t + 1.45); lfo.stop(t + 1.45);
}

/**
 * O parabéns inteiro, agendado de uma vez a partir de `aPartirDe` segundos do canto — quem abre a
 * garagem com a música tocando ouve dali em diante, junto com os outros. Devolve o que o cala:
 * fechar a tela ou desligar o fone no meio não pode deixar a música tocando sozinha.
 */
export function cantarParabens(aPartirDe: number): () => void {
  const c = ctx();
  if (!c) return () => undefined;
  const saida = c.createGain();
  saida.gain.value = VOLUME;
  saida.connect(c.destination);
  const base = c.currentTime + 0.05 - aPartirDe;
  const quando = (t: number) => base + t;
  for (const n of ROTEIRO.notas) {
    if (n.t + n.dur <= aPartirDe) continue;
    const ini = Math.max(c.currentTime + 0.02, quando(n.t));
    const dur = quando(n.t) + n.dur - ini;
    if (dur < 0.06) continue;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = n.f;
    const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = n.f / 2;
    const g2 = c.createGain(); g2.gain.value = 0.6;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    const env = c.createGain();
    env.gain.setValueAtTime(0, ini);
    env.gain.linearRampToValueAtTime(0.32, ini + 0.012);
    env.gain.exponentialRampToValueAtTime(0.16, ini + Math.min(0.18, dur * 0.5));
    env.gain.setValueAtTime(0.16, ini + dur - 0.05);
    env.gain.linearRampToValueAtTime(0, ini + dur - 0.005);
    o.connect(lp); o2.connect(g2).connect(lp); lp.connect(env).connect(saida);
    o.start(ini); o2.start(ini); o.stop(ini + dur); o2.stop(ini + dur);
  }
  for (const p of ROTEIRO.palmas) if (p >= aPartirDe) estalo(c, saida, quando(p), 1300, 0.13, 0.9);
  if (ROTEIRO.ratimbum >= aPartirDe) {
    const ini = quando(ROTEIRO.ratimbum);
    const n = c.createBufferSource(); n.buffer = ruido(c); n.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.5;
    const env = c.createGain();
    env.gain.setValueAtTime(0.001, ini);
    env.gain.linearRampToValueAtTime(0.35, ini + 0.15);
    env.gain.exponentialRampToValueAtTime(0.001, ini + 1.8);
    n.connect(bp).connect(env).connect(saida);
    n.start(ini); n.stop(ini + 1.9);
    for (let i = 0; i < 9; i++) estalo(c, saida, ini + 0.05 + Math.random() * 1.2, 1300, 0.13, 0.45 + Math.random() * 0.35);
  }
  return () => { saida.gain.value = 0; saida.disconnect(); };
}

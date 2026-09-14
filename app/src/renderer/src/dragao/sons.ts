/**
 * Os sons da luta, sintetizados na hora como o motor da Fórmula 1: soco, chute, golpe forte,
 * defesa, ki, raio, sumir, nocaute e os letreiros. Nada de arquivo — são curtos, muitos e mudam de
 * lado na tela (`pan`), e arquivo pequeno cai na armadilha do `data:` que o CSP recusa (ver
 * `embutir.ts`).
 *
 * Tudo passa por um compressor antes da saída: dois golpes e um raio juntos não estouram.
 */

export type SomDaLuta = 'soco' | 'chute' | 'forte' | 'defesa' | 'rajada' | 'raio' | 'sumir' | 'nocaute' | 'round' | 'lutem' | 'vitoria';

type Receita = (ctx: AudioContext, saida: AudioNode, t: number) => void;

function ruido(ctx: AudioContext, duracao: number): AudioBufferSourceNode {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duracao), ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < d.length; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; d[i] = (s / 2147483648) - 1; }
  const n = ctx.createBufferSource();
  n.buffer = b;
  return n;
}

/** Envelope que fecha no zero antes de o som acabar: corte com som no meio é estalo. */
function envelope(ctx: AudioContext, t: number, pico: number, ataque: number, queda: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(pico, t + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ataque + queda);
  return g;
}

function baque(ctx: AudioContext, saida: AudioNode, t: number, de: number, ate: number, duracao: number, pico: number) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(de, t);
  o.frequency.exponentialRampToValueAtTime(ate, t + duracao);
  const g = envelope(ctx, t, pico, 0.004, duracao);
  o.connect(g).connect(saida);
  o.start(t);
  o.stop(t + duracao + 0.05);
}

function estalo(ctx: AudioContext, saida: AudioNode, t: number, corte: number, duracao: number, pico: number, tipo: BiquadFilterType = 'lowpass') {
  const n = ruido(ctx, duracao + 0.05);
  const f = ctx.createBiquadFilter();
  f.type = tipo;
  f.frequency.value = corte;
  const g = envelope(ctx, t, pico, 0.002, duracao);
  n.connect(f).connect(g).connect(saida);
  n.start(t);
  n.stop(t + duracao + 0.05);
}

function nota(ctx: AudioContext, saida: AudioNode, t: number, freq: number, duracao: number, pico: number, forma: OscillatorType = 'square') {
  const o = ctx.createOscillator();
  o.type = forma;
  o.frequency.value = freq;
  const g = envelope(ctx, t, pico, 0.005, duracao);
  o.connect(g).connect(saida);
  o.start(t);
  o.stop(t + duracao + 0.05);
}

const RECEITAS: Record<SomDaLuta, Receita> = {
  soco: (c, s, t) => { estalo(c, s, t, 1400, 0.07, 0.35); baque(c, s, t, 150, 60, 0.09, 0.4); },
  chute: (c, s, t) => { estalo(c, s, t, 1000, 0.1, 0.4); baque(c, s, t, 110, 45, 0.13, 0.5); },
  forte: (c, s, t) => { estalo(c, s, t, 800, 0.2, 0.5); baque(c, s, t, 90, 32, 0.28, 0.7); },
  defesa: (c, s, t) => { estalo(c, s, t, 2500, 0.05, 0.25, 'highpass'); nota(c, s, t, 880, 0.06, 0.08, 'triangle'); },
  rajada: (c, s, t) => {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.16);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
    const g = envelope(c, t, 0.14, 0.01, 0.2);
    o.connect(f).connect(g).connect(s); o.start(t); o.stop(t + 0.3);
  },
  raio: (c, s, t) => {
    estalo(c, s, t, 600, 0.7, 0.3, 'bandpass');
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    o.frequency.linearRampToValueAtTime(95, t + 0.6);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    const g = envelope(c, t, 0.25, 0.04, 0.7);
    o.connect(f).connect(g).connect(s); o.start(t); o.stop(t + 0.8);
  },
  sumir: (c, s, t) => {
    const o = c.createOscillator();
    o.frequency.setValueAtTime(1600, t);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.1);
    const g = envelope(c, t, 0.15, 0.003, 0.11);
    o.connect(g).connect(s); o.start(t); o.stop(t + 0.2);
  },
  nocaute: (c, s, t) => { estalo(c, s, t, 500, 0.5, 0.5); baque(c, s, t, 70, 28, 0.7, 0.8); },
  round: (c, s, t) => { nota(c, s, t, 523, 0.12, 0.12); nota(c, s, t + 0.14, 784, 0.18, 0.12); },
  lutem: (c, s, t) => { [523, 659, 784, 1046].forEach((f, i) => nota(c, s, t + i * 0.06, f, 0.14, 0.11)); },
  vitoria: (c, s, t) => { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => nota(c, s, t + i * 0.11, f, 0.16, 0.1)); },
};

/** O mesmo som não toca duas vezes em menos disto: dois quadros refeitos pela rede viram um. */
const INTERVALO_MINIMO = 0.04;

export function criarSonsDaLuta(volumeInicial = 1) {
  let ctx: AudioContext | null = null;
  let saida: AudioNode | null = null;
  let mestre: GainNode | null = null;
  let volume = volumeInicial;
  const ultimo = new Map<SomDaLuta, number>();
  const garantir = () => {
    if (ctx) return ctx;
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 6;
    mestre = ctx.createGain();
    mestre.gain.value = 0.7 * volume;
    comp.connect(mestre).connect(ctx.destination);
    saida = comp;
    return ctx;
  };
  return {
    /** De 0 a 1: o volume do jogo, regulado na arena. */
    set volume(v: number) {
      volume = Math.max(0, Math.min(1, v));
      if (mestre) mestre.gain.value = 0.7 * volume;
    },
    tocar(som: SomDaLuta, pan = 0) {
      if (volume <= 0) return;
      const c = garantir();
      if (c.state === 'suspended') void c.resume();
      const t = c.currentTime;
      if (t - (ultimo.get(som) ?? -1) < INTERVALO_MINIMO) return;
      ultimo.set(som, t);
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(saida!);
      RECEITAS[som](c, p, t);
    },
    fechar() { void ctx?.close(); ctx = null; },
  };
}

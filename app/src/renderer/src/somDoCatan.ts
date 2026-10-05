/**
 * Os sons do Catan, sintetizados na hora como os dos dados (`somDosDados.ts`): nenhum arquivo a
 * mais no pacote. O que tocar e quando é decidido fora daqui, puro e testado
 * (`oQueTocarNaPartida`, `deveTicar` em `catan.ts`); aqui é só o timbre de cada um, como está na
 * prancheta (04/10/2026):
 *
 * - sua vez: duas notas subindo, o mais alto de todos — é o aviso para olhar a tela;
 * - vez de outro: um toque curto e baixo;
 * - tique: os últimos 5 s da sua vez;
 * - troca: dois "plim" agudos, rápidos, quando chega uma oferta para você;
 * - estrada: uma batida de madeira; aldeia: duas marteladas; cidade: uma pancada grave, de pedra;
 * - carta: um "chhk" de carta deslizando; ganhou: um brilho curto, quando renderam cartas para você.
 *
 * Se ficou bom é de ouvido, e isso é do dono: a bancada de teste é muda.
 */
import type { SomDoCatan } from './catan';

let contexto: AudioContext | null = null;

export function tocarNoCatan(som: SomDoCatan, volume = 0.5) {
  try {
    contexto ??= new AudioContext();
    const ctx = contexto;
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime + 0.02;

    /** Uma nota com ataque curto e queda exponencial; `forca` relativa ao volume. */
    const nota = (quando: number, freq: number, dur: number, forca: number, tipo: OscillatorType = 'sine') => {
      const osc = ctx.createOscillator();
      osc.type = tipo;
      osc.frequency.value = freq;
      const ganho = ctx.createGain();
      ganho.gain.setValueAtTime(0.0001, quando);
      ganho.gain.exponentialRampToValueAtTime(volume * forca, quando + 0.006);
      ganho.gain.exponentialRampToValueAtTime(0.0001, quando + dur);
      osc.connect(ganho).connect(ctx.destination);
      osc.start(quando);
      osc.stop(quando + dur + 0.02);
    };
    /** Um baque grave que desce de tom: o corpo de uma batida. */
    const baque = (quando: number, de: number, para: number, dur: number, forca: number) => {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(de, quando);
      osc.frequency.exponentialRampToValueAtTime(para, quando + dur);
      const ganho = ctx.createGain();
      ganho.gain.setValueAtTime(volume * forca, quando);
      ganho.gain.exponentialRampToValueAtTime(0.0001, quando + dur);
      osc.connect(ganho).connect(ctx.destination);
      osc.start(quando);
      osc.stop(quando + dur + 0.02);
    };
    /** Ruído curto num filtro: o estalo de uma batida, ou o arrasto de uma carta. */
    const ruido = (quando: number, dur: number, filtro: BiquadFilterType, tom: number, q: number, forca: number, ateTom?: number) => {
      const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const fonte = ctx.createBufferSource();
      fonte.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = filtro;
      f.frequency.setValueAtTime(tom, quando);
      if (ateTom) f.frequency.exponentialRampToValueAtTime(ateTom, quando + dur);
      f.Q.value = q;
      const ganho = ctx.createGain();
      ganho.gain.setValueAtTime(0.0001, quando);
      ganho.gain.exponentialRampToValueAtTime(volume * forca, quando + Math.min(0.004, dur / 4));
      ganho.gain.exponentialRampToValueAtTime(0.0001, quando + dur);
      fonte.connect(f).connect(ganho).connect(ctx.destination);
      fonte.start(quando);
    };

    switch (som) {
      case 'suaVez':
        // Mi5 → Lá5, com a oitava de baixo dando corpo: subir é chamar.
        nota(t0, 659.3, 0.32, 0.32, 'triangle');
        nota(t0, 329.6, 0.28, 0.1);
        nota(t0 + 0.15, 880, 0.5, 0.36, 'triangle');
        nota(t0 + 0.15, 440, 0.45, 0.12);
        break;
      case 'vezDeOutro':
        nota(t0, 392, 0.14, 0.09);
        break;
      case 'tique':
        ruido(t0, 0.025, 'bandpass', 3200, 6, 0.35);
        nota(t0, 1600, 0.04, 0.06);
        break;
      case 'troca':
        // Dois "plim" iguais e agudos, com um harmônico leve: diferente do sino da conversa privada.
        for (const t of [t0, t0 + 0.11]) {
          nota(t, 1760, 0.22, 0.2);
          nota(t, 3520, 0.12, 0.05);
        }
        break;
      case 'estrada':
        ruido(t0, 0.06, 'bandpass', 750, 4, 0.7);
        baque(t0, 220, 120, 0.09, 0.3);
        break;
      case 'aldeia':
        for (const [t, k] of [[t0, 1], [t0 + 0.17, 0.8]] as const) {
          ruido(t, 0.05, 'bandpass', 1900, 2.5, 0.6 * k);
          baque(t, 180, 110, 0.1, 0.32 * k);
        }
        break;
      case 'cidade':
        ruido(t0, 0.18, 'lowpass', 500, 0.8, 0.5);
        baque(t0, 95, 45, 0.38, 0.5);
        break;
      case 'carta':
        // O arrasto sobe de tom, como papel deslizando sobre papel.
        ruido(t0, 0.13, 'bandpass', 1800, 1.5, 0.35, 6500);
        break;
      case 'ganhou':
        nota(t0, 1046.5, 0.22, 0.12);
        nota(t0 + 0.05, 1318.5, 0.22, 0.12);
        nota(t0 + 0.1, 1568, 0.3, 0.13);
        break;
    }
  } catch {
    // Sem áudio (máquina sem saída, contexto recusado): a partida segue calada, e está tudo bem.
  }
}

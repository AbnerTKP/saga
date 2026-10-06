/**
 * Os sons do Catan, sintetizados na hora como os dos dados (`somDosDados.ts`): nenhum arquivo a
 * mais no pacote. O que tocar e quando é decidido fora daqui, puro e testado
 * (`oQueTocarNaPartida`, `deveTicar` em `catan.ts`); aqui é só o timbre de cada um, como está na
 * prancheta (04/10/2026):
 *
 * - sua vez: quatro notas subindo (sol, si, ré, sol), a última sustentada — o CHAMADO do jogo, o
 *   mais alto e o mais longo de todos, porque é o aviso para voltar à tela;
 * - vez de outro: um toque curto e baixo;
 * - tique: os últimos 5 s da sua vez;
 * - troca: três "plim" agudos, rápidos, quando chega uma oferta para você — o outro chamado;
 * - estrada: uma batida de madeira; aldeia: duas marteladas; cidade: uma pancada grave, de pedra;
 * - carta: um "chhk" de carta deslizando; ganhou: um brilho curto, quando renderam cartas para você.
 *
 * Os dois chamados (sua vez e troca) subiram em 06/10/2026, a pedido do dono — "um som mais
 * evidente": a sua vez tinha pico de 0,21 e sumia embaixo de qualquer outra coisa tocando; agora
 * tem 0,71, com quatro notas no lugar de duas, e a troca foi de 0,11 a 0,38 — os dois ~11 dB acima,
 * medidos simulando este mesmo gráfico a 48 kHz. Os sons do tabuleiro (estrada, aldeia,
 * cidade, carta) continuam onde estavam: tocam a cada jogada de qualquer um.
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
      case 'suaVez': {
        // Sol5, si5, ré6 → sol6 sustentado: subir é chamar, e o acorde inteiro é o que se ouve por
        // cima de outro som. A oitava de baixo dá corpo; a de cima, brilho. Cada nota já quase
        // morreu quando a próxima entra, então o pico fica em ~0,7 e nada estoura.
        const notas = [[0, 784], [0.085, 987.8], [0.17, 1174.7], [0.27, 1568]] as const;
        notas.forEach(([t, f], i) => {
          const dur = i === notas.length - 1 ? 0.9 : 0.32;
          nota(t0 + t, f, dur, 1.15, 'triangle');
          nota(t0 + t, f / 2, dur * 0.9, 0.35);
          nota(t0 + t, f * 2, dur * 0.5, 0.14);
        });
        break;
      }
      case 'vezDeOutro':
        nota(t0, 392, 0.14, 0.09);
        break;
      case 'tique':
        ruido(t0, 0.025, 'bandpass', 3200, 6, 0.35);
        nota(t0, 1600, 0.04, 0.06);
        break;
      case 'troca':
        // Três "plim" iguais e agudos, com um harmônico em cima e a oitava embaixo dando corpo:
        // mesma nota repetida, e não dois tons como o sino da conversa privada.
        for (const t of [t0, t0 + 0.1, t0 + 0.2]) {
          nota(t, 1760, 0.26, 0.6);
          nota(t, 3520, 0.14, 0.14);
          nota(t, 880, 0.2, 0.16);
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

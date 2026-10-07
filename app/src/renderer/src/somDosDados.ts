/**
 * O som dos dados rolando no copo, sintetizado na hora —
 * nenhum arquivo a mais no pacote, e cada rolagem soa um pouco diferente, como à mesa. Vai no tempo
 * da animação de `DadosNoCopo` (1,45 s):
 *
 * - até ~0,45 s, o CHACOALHAR: estalos abafados (passa-baixa), os dados batendo DENTRO do copo de
 *   couro, e um baque surdo a cada virada de mão;
 * - ~0,55 s, os dados escorregando pela boca;
 * - ~1,06 s, os dois batendo na mesa; um rolar curto; e ~1,38 s, o assento final.
 *
 * Se ficou bom é de ouvido, e isso é do dono: a bancada de teste é muda.
 */
let contexto: AudioContext | null = null;

export function rolarOsDados(volume = 0.5) {
  try {
    contexto ??= new AudioContext();
    const ctx = contexto;
    if (ctx.state === 'suspended') void ctx.resume();
    const agora = ctx.currentTime + 0.02;
    const ruido = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const dados = ruido.getChannelData(0);
    for (let i = 0; i < dados.length; i++) dados[i] = (Math.random() * 2 - 1) * (1 - i / dados.length) ** 3;

    /** Um estalo de ruído curto numa faixa; `abafado` passa por um passa-baixa, como dentro do copo. */
    const estalo = (quando: number, forca: number, tom: number, abafado = 0) => {
      const fonte = ctx.createBufferSource();
      fonte.buffer = ruido;
      const filtro = ctx.createBiquadFilter();
      filtro.type = 'bandpass';
      filtro.frequency.value = tom;
      filtro.Q.value = 3;
      const ganho = ctx.createGain();
      ganho.gain.value = volume * forca;
      let saida: AudioNode = fonte.connect(filtro);
      if (abafado) {
        const baixa = ctx.createBiquadFilter();
        baixa.type = 'lowpass';
        baixa.frequency.value = abafado;
        saida = saida.connect(baixa);
      }
      saida.connect(ganho).connect(ctx.destination);
      fonte.start(quando);
    };
    const sorte = (a: number, b: number) => a + Math.random() * (b - a);

    // O chacoalhar: os dados batendo no couro, rápido e abafado, com um baque a cada virada.
    let t = 0.03;
    for (let i = 0; i < 11; i++) {
      t += sorte(0.028, 0.045);
      estalo(agora + t, sorte(0.45, 0.7), sorte(1100, 1700), 1600);
    }
    for (const virada of [0.1, 0.2, 0.3, 0.4]) estalo(agora + virada, 0.5, 260, 500);
    // Saindo pela boca do copo.
    for (const s of [0.53, 0.58, 0.62]) estalo(agora + s + sorte(0, 0.015), 0.35, sorte(2400, 3200));
    // Na mesa: as duas batidas, um rolar curto e o assento.
    estalo(agora + 1.05, 0.9, 1400);
    estalo(agora + 1.09, 0.75, 1200);
    for (let i = 0; i < 4; i++) estalo(agora + 1.13 + i * sorte(0.035, 0.05), 0.42 - i * 0.07, sorte(2000, 2800));
    estalo(agora + 1.37, 0.55, 1150);
    estalo(agora + 1.4, 0.4, 1000);
  } catch {
    // Sem áudio (máquina sem saída, contexto recusado): os dados rolam calados, e está tudo bem.
  }
}

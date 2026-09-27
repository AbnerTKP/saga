/**
 * O som dos dados rolando, sintetizado na hora como o motor da Fórmula 1 (`motor.ts`): uns doze
 * estalos de ruído curto, filtrados na faixa de um dado de plástico batendo na mesa, cada vez mais
 * espaçados e mais baixos — e as duas batidas do fim, quando eles param. Nenhum arquivo a mais no
 * pacote, e cada rolagem soa um pouco diferente, como à mesa.
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

    const estalo = (quando: number, forca: number, tom: number) => {
      const fonte = ctx.createBufferSource();
      fonte.buffer = ruido;
      const filtro = ctx.createBiquadFilter();
      filtro.type = 'bandpass';
      filtro.frequency.value = tom;
      filtro.Q.value = 3;
      const ganho = ctx.createGain();
      ganho.gain.value = volume * forca;
      fonte.connect(filtro).connect(ganho).connect(ctx.destination);
      fonte.start(quando);
    };

    let t = 0;
    for (let i = 0; i < 12; i++) {
      t += 0.035 + i * 0.012 + Math.random() * 0.02;
      estalo(agora + t, 0.9 - i * 0.05, 2200 + Math.random() * 1800);
    }
    // As duas batidas do fim: mais graves, uma para cada dado.
    estalo(agora + t + 0.09, 0.8, 1300);
    estalo(agora + t + 0.14, 0.6, 1100);
  } catch {
    // Sem áudio (máquina sem saída, contexto recusado): os dados rolam calados, e está tudo bem.
  }
}

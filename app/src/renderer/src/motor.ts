/**
 * O ronco do motor, sintetizado ao vivo: um som que muda de tom a cada quadro não cabe num
 * arquivo. Só o SEU carro ronca — oito motores juntos seriam uma parede de zumbido.
 *
 * O primeiro ronco foi recusado: "parece pouco, e fica insuportável na velocidade máxima". Ele
 * era uma serra e uma quadrada uma oitava ACIMA, por um filtro ressonante (Q 4) que abria até
 * ~2,2 kHz — no talo, um apito de 200 Hz com o pico do filtro em cima, e nada embaixo para dar
 * corpo. Como a velocidade só subia, o tom só subia, e cruzando uma reta ele ficava parado lá.
 *
 * Hoje ele tem MARCHAS: o giro sobe dentro de cada marcha e cai na troca, que é o que faz
 * "vrum, vrum, vrum" soar como aceleração mesmo com o carro chegando rápido à máxima; na última
 * marcha o giro para abaixo do topo, e o tom no talo é mais grave que o de antes. O corpo vem
 * de uma quadrada uma oitava ABAIXO, a textura de um ruído de admissão que só aparece
 * acelerando, e uma saturação suave junta tudo ANTES de um filtro sem ressonância que não passa
 * de ~1,1 kHz. Cada troca de marcha dá uma respirada curta no volume.
 */
export const VOLUME_DO_MOTOR = 0.12;

/** O topo de cada marcha, em fração da velocidade máxima. A última é longa: é a reta. */
export const MARCHAS = [0.14, 0.26, 0.38, 0.5, 0.62, 0.74, 0.86, 1.05];

/**
 * A marcha e o giro (0 a 1) para uma velocidade. Dentro de cada marcha o giro vai de 55% ao
 * topo; na troca cai de volta. A primeira começa na marcha lenta.
 */
export function rotacao(velocidade: number, maxima: number): { marcha: number; giro: number } {
  const s = Math.min(1, Math.abs(velocidade) / maxima);
  let g = MARCHAS.findIndex((topo) => s <= topo);
  if (g < 0) g = MARCHAS.length - 1;
  const de = g === 0 ? 0 : MARCHAS[g - 1], ate = MARCHAS[g];
  const t = (s - de) / (ate - de);
  const giro = g === 0 ? 0.2 + 0.8 * t : 0.55 + 0.45 * t;
  return { marcha: g + 1, giro: Math.min(1, giro) };
}

/** O tom fundamental para um giro: marcha lenta perto de 70 Hz, e ~180 Hz no topo. */
export const tomDoGiro = (giro: number) => 40 + 150 * giro;

type Nos = {
  serra: OscillatorNode; sub: OscillatorNode; harmonico: OscillatorNode; tremor: OscillatorNode;
  brilho: BiquadFilterNode; admissao: BiquadFilterNode; ruido: GainNode; alto: GainNode; volume: GainNode;
};

/**
 * Monta o motor num contexto de áudio qualquer — o do app ou um `OfflineAudioContext` para
 * ouvir a gravação antes de publicar — e devolve quem o comanda no tempo.
 */
export function montarMotor(ctx: BaseAudioContext, destino: AudioNode) {
  const serra = ctx.createOscillator();
  serra.type = 'sawtooth';
  const sub = ctx.createOscillator();
  sub.type = 'square';
  const harmonico = ctx.createOscillator();
  harmonico.type = 'triangle';
  // um tremor de poucos centésimos no tom: sem ele o som fica parado como um diapasão
  const tremor = ctx.createOscillator();
  tremor.frequency.value = 7.3;
  const fundoDoTremor = ctx.createGain();
  fundoDoTremor.gain.value = 9;
  tremor.connect(fundoDoTremor).connect(serra.detune);

  const brilho = ctx.createBiquadFilter();
  brilho.type = 'lowpass';
  brilho.Q.value = 0.5;
  const corpo = ctx.createBiquadFilter();
  corpo.type = 'lowpass';
  corpo.frequency.value = 300;
  corpo.Q.value = 0.5;

  const ruidoBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const amostras = ruidoBuffer.getChannelData(0);
  let semente = 17;
  for (let i = 0; i < amostras.length; i++) {
    semente = (semente * 16807) % 2147483647;
    amostras[i] = (semente / 2147483647) * 2 - 1;
  }
  const fonteDeRuido = ctx.createBufferSource();
  fonteDeRuido.buffer = ruidoBuffer;
  fonteDeRuido.loop = true;
  const admissao = ctx.createBiquadFilter();
  admissao.type = 'bandpass';
  admissao.Q.value = 0.8;
  const ruido = ctx.createGain();
  ruido.gain.value = 0;

  const gSerra = ctx.createGain(); gSerra.gain.value = 0.5;
  const gSub = ctx.createGain(); gSub.gain.value = 0.5;
  const alto = ctx.createGain(); alto.gain.value = 0;

  const saturacao = ctx.createWaveShaper();
  const curva = new Float32Array(1024);
  for (let i = 0; i < curva.length; i++) { const x = (i / (curva.length - 1)) * 2 - 1; curva[i] = Math.tanh(1.4 * x) / Math.tanh(1.4); }
  saturacao.curve = curva;
  saturacao.oversample = '2x';
  const volume = ctx.createGain();
  volume.gain.value = 0;

  // Satura primeiro e filtra depois: a saturação cria harmônicos, e filtrados antes eles
  // passariam direto — medido, era o que deixava o talo brilhante.
  serra.connect(gSerra).connect(saturacao);
  sub.connect(corpo).connect(gSub).connect(saturacao);
  harmonico.connect(alto).connect(saturacao);
  fonteDeRuido.connect(admissao).connect(ruido).connect(saturacao);
  saturacao.connect(brilho).connect(volume).connect(destino);
  serra.start(); sub.start(); harmonico.start(); tremor.start(); fonteDeRuido.start();

  const nos: Nos = { serra, sub, harmonico, tremor, brilho, admissao, ruido, alto, volume };
  let marchaAntes = 1;
  let trocandoAte = 0;

  return {
    /** Aplica o estado do carro no instante `t` do contexto. */
    aplicar(velocidade: number, maxima: number, acelerando: boolean, ligado: boolean, t: number) {
      const { marcha, giro } = rotacao(velocidade, maxima);
      const tom = tomDoGiro(giro);
      nos.serra.frequency.setTargetAtTime(tom, t, 0.025);
      nos.sub.frequency.setTargetAtTime(tom / 2, t, 0.025);
      nos.harmonico.frequency.setTargetAtTime(tom * 3, t, 0.025);
      nos.brilho.frequency.setTargetAtTime(320 + giro * (acelerando ? 780 : 420), t, 0.05);
      nos.admissao.frequency.setTargetAtTime(700 + giro * 900, t, 0.05);
      nos.ruido.gain.setTargetAtTime(acelerando ? 0.03 + 0.02 * giro : 0.008, t, 0.08);
      nos.alto.gain.setTargetAtTime(0.05 * giro, t, 0.05);
      // um pouco mais baixo no giro alto: agudo parece mais alto do que é
      const alvo = ligado ? VOLUME_DO_MOTOR * (acelerando ? 1 : 0.62) * (1.08 - 0.28 * giro) : 0;
      if (ligado && marcha > marchaAntes && acelerando) {
        // a troca: uma respirada curta, e o giro já caiu. O quadro seguinte não pode desfazê-la —
        // por isso o volume fica quieto até ela terminar.
        nos.volume.gain.cancelScheduledValues(t);
        nos.volume.gain.setTargetAtTime(alvo * 0.45, t, 0.012);
        nos.volume.gain.setTargetAtTime(alvo, t + 0.07, 0.04);
        trocandoAte = t + 0.12;
      } else if (t >= trocandoAte || !ligado) {
        nos.volume.gain.setTargetAtTime(alvo, t, 0.06);
      }
      marchaAntes = marcha;
    },
  };
}

export function criarMotor() {
  let ctx: AudioContext | null = null;
  let motor: ReturnType<typeof montarMotor> | null = null;

  return {
    /**
     * Chamado a cada quadro. `ligado` falso cala sem destruir — é o fone desligado, ou o carro
     * que já cruzou a bandeirada e parou.
     */
    atualizar(velocidade: number, maxima: number, acelerando: boolean, ligado: boolean) {
      if (!ctx) {
        ctx = new AudioContext();
        motor = montarMotor(ctx, ctx.destination);
      }
      // Contexto suspenso não toca nada e não reclama: entrar na corrida foi um clique, então
      // o `resume` passa — mas ele precisa estar aqui.
      if (ctx.state === 'suspended') void ctx.resume();
      motor!.aplicar(velocidade, maxima, acelerando, ligado, ctx.currentTime);
    },
    parar() {
      if (!ctx) return;
      void ctx.close();
      ctx = null;
      motor = null;
    },
  };
}

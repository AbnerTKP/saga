/**
 * O ronco do motor, sintetizado ao vivo: um som que muda de tom a cada quadro não cabe num
 * arquivo. Duas ondas (serra no tom e quadrada uma oitava acima, levemente desafinada) passam
 * por um filtro que abre com a velocidade — é o que faz o "vrrr" subir de tom e de brilho.
 *
 * Só o SEU carro ronca. Oito motores juntos seriam uma parede de zumbido, e o dos outros não
 * diz nada que a tela já não diga. Baixo de propósito, pelo mesmo motivo dos avisos.
 */
export const VOLUME_DO_MOTOR = 0.1;

/** O tom do motor para uma velocidade: marcha lenta em 46 Hz, e 200 Hz no talo. */
export function tomDoMotor(velocidade: number, maxima: number): number {
  const k = Math.min(1, Math.abs(velocidade) / maxima);
  return 46 + 154 * Math.pow(k, 0.85);
}

export function criarMotor() {
  let ctx: AudioContext | null = null;
  let nos: { serra: OscillatorNode; quadrada: OscillatorNode; filtro: BiquadFilterNode; ganho: GainNode } | null = null;

  function montar() {
    ctx = new AudioContext();
    const serra = ctx.createOscillator();
    serra.type = 'sawtooth';
    const quadrada = ctx.createOscillator();
    quadrada.type = 'square';
    quadrada.detune.value = 7;
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.Q.value = 4;
    const ganho = ctx.createGain();
    ganho.gain.value = 0;
    const mistura = ctx.createGain();
    mistura.gain.value = 0.35;
    serra.connect(filtro);
    quadrada.connect(mistura).connect(filtro);
    filtro.connect(ganho).connect(ctx.destination);
    serra.start();
    quadrada.start();
    nos = { serra, quadrada, filtro, ganho };
  }

  return {
    /**
     * Chamado a cada quadro. `ligado` falso cala sem destruir — é o fone desligado, ou o carro
     * que já cruzou a bandeirada e parou.
     */
    atualizar(velocidade: number, maxima: number, acelerando: boolean, ligado: boolean) {
      if (!ctx) montar();
      // Contexto suspenso não toca nada e não reclama: entrar na corrida foi um clique, então
      // o `resume` passa — mas ele precisa estar aqui.
      if (ctx!.state === 'suspended') void ctx!.resume();
      const agora = ctx!.currentTime;
      const tom = tomDoMotor(velocidade, maxima);
      nos!.serra.frequency.setTargetAtTime(tom, agora, 0.04);
      nos!.quadrada.frequency.setTargetAtTime(tom * 2, agora, 0.04);
      nos!.filtro.frequency.setTargetAtTime(380 + tom * (acelerando ? 9 : 5), agora, 0.06);
      const alvo = ligado ? VOLUME_DO_MOTOR * (acelerando ? 1 : 0.6) : 0;
      nos!.ganho.gain.setTargetAtTime(alvo, agora, 0.08);
    },
    parar() {
      if (!ctx) return;
      void ctx.close();
      ctx = null;
      nos = null;
    },
  };
}

/**
 * Quem está falando, decidido aqui e não no servidor.
 *
 * Medido contra a produção, do som começar até o anel poder acender:
 *
 * | caminho                                  | mediana |
 * |------------------------------------------|---------|
 * | eu, medindo o meu próprio microfone      |   25 ms |
 * | o outro, medindo o áudio que chega aqui  |  267 ms |
 * | o outro, esperando o LiveKit avisar      |  394 ms |
 *
 * (Sete voltas numa rodada só, contra a produção, pelo mesmo caminho que o app usa.)
 *
 * O servidor precisa juntar, decidir e mandar de volta; o meu microfone não sai da
 * máquina, e o áudio do outro já chegou aqui quando o LiveKit ainda está decidindo. Por
 * isso ninguém pergunta ao servidor: é o mesmo som, medido mais cedo.
 */

/** Acima disto é voz, e não o chiado do microfone aberto numa sala em silêncio. */
export const LIMIAR = 0.02;

/**
 * Quanto tempo o anel fica aceso depois do último pico.
 *
 * Sem isto ele pisca: fala tem pausa entre sílaba e sílaba, e cada pausa apagaria.
 * Meio segundo cobre a pausa e ainda apaga logo quando a pessoa cala de verdade.
 */
export const SUSTENTAR = 500;

/** Um pico agora acende na hora; o que apaga é o tempo sem pico. */
export function falando(nivel: number, ultimoPico: number, agora: number): boolean {
  if (nivel > LIMIAR) return true;
  return ultimoPico > 0 && agora - ultimoPico < SUSTENTAR;
}

/** O nível do trecho, para comparar com o limiar. Raiz da média dos quadrados. */
export function nivelDe(amostras: ArrayLike<number>): number {
  if (amostras.length === 0) return 0;
  let soma = 0;
  for (let i = 0; i < amostras.length; i++) soma += amostras[i] * amostras[i];
  return Math.sqrt(soma / amostras.length);
}

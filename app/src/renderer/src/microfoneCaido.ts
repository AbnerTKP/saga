/**
 * O microfone caiu e o LiveKit mutou a pessoa: tentar de volta, ou não?
 *
 * Quando o aparelho some — o fone Bluetooth pisca, o Windows troca o microfone padrão, o
 * headset entra em economia de energia —, a faixa termina. O livekit-client tenta reabrir
 * no padrão do sistema UMA vez e, se não der, MUTA ("could not restart track, muting
 * instead") e desiste. A pessoa aparece com o microfone riscado sem ter clicado, e só
 * descobre quando alguém avisa — era o "a Saga muta sozinha" do dono (08/10/2026; o
 * Blankito ficou 7 minutos mudo às 00:53 UTC, sem fone desligado nem nada na sala mudando).
 *
 * Só se tenta de volta o que foi o LiveKit que calou. O que separa é a FAIXA: o mudo de
 * moderador (e o seu, e o do fone desligado) cala uma faixa viva; o da queda, uma que
 * terminou. Reabrir o mudo de um moderador desfaria a moderação — o mesmo cuidado de
 * `queda.ts` com quem foi tirado da call.
 */

export type EstadoDoMicrofone = {
  /** A pessoa quer falar (não se mutou). É dela, não da sala — ver `querFalar` no useRoom. */
  querFalar: boolean;
  /** Fone desligado muta junto, de propósito. */
  surdo: boolean;
  conectado: boolean;
  /** A faixa crua do microfone terminou (`readyState === 'ended'`). */
  faixaAcabou: boolean;
};

export function deveReabrirMicrofone(e: EstadoDoMicrofone) {
  return e.querFalar && !e.surdo && e.conectado && e.faixaAcabou;
}

/**
 * Quanto esperar antes de cada tentativa. A primeira é logo: a troca de padrão do Windows
 * costuma estar pronta em meio segundo. As outras dão tempo de o Bluetooth voltar.
 */
export const ESPERAS_PARA_REABRIR_MS = [500, 2000, 5000, 10000] as const;

/**
 * O que o cartão de uma live oferece, visto da barra lateral.
 *
 * Entrar numa live era chato: o cartão com "assistir" só existia DENTRO do palco, então
 * quem via o ícone de tela ao lado de um nome na barra tinha de abrir a sala, achar o
 * cartão e só então clicar. Agora passar o mouse em quem transmite mostra o mesmo cartão
 * ali, e o botão dele diz exatamente o que vai acontecer — que depende de onde você está.
 */

export type AcaoDaLive = 'sua' | 'assistindo' | 'assistir' | 'entrarEAssistir';

export function acaoDaLive({ identity, minhaIdentity, salaId, salaDaVozId, assistindo }: {
  /** Quem está transmitindo. */
  identity: string;
  minhaIdentity: string | null;
  /** A sala de voz onde a live está. */
  salaId: number;
  /** A sala em que a SUA voz está, ou null. */
  salaDaVozId: number | null;
  /** A live que você escolheu assistir, ou null. */
  assistindo: string | null;
}): AcaoDaLive {
  // A própria transmissão não se assiste por aqui: o cartão só diz que ela está no ar.
  if (identity === minhaIdentity) return 'sua';
  // Noutra sala, assistir é entrar na call — a faixa só chega para quem está dentro.
  if (salaId !== salaDaVozId) return 'entrarEAssistir';
  return assistindo === identity ? 'assistindo' : 'assistir';
}

export const ROTULO_DA_ACAO: Record<AcaoDaLive, string> = {
  sua: 'Você está transmitindo',
  assistindo: 'Sair da live',
  assistir: 'Assistir',
  entrarEAssistir: 'Entrar e assistir',
};

/** Quantos estão vendo. O zero é informação — "ninguém ainda" —, não ausência dela. */
export function plateiaEmTexto(quantos: number): string {
  return quantos > 0 ? `${quantos} assistindo` : 'ninguém assistindo ainda';
}

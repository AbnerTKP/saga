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

/**
 * O selo na linha de quem transmite, na barra lateral — ele mesmo é o botão.
 *
 * Era um ícone vermelho que só dizia "tem live", e o caminho para assistir era esperar o
 * cartão abrir. Agora um clique no selo faz o que o cartão faria. `titulo` nulo quer dizer
 * que não é botão: a própria transmissão não se assiste por aqui.
 */
export function seloDaLive(acao: AcaoDaLive): { texto: string; assistindo: boolean; titulo: string | null } {
  if (acao === 'sua') return { texto: 'ao vivo', assistindo: false, titulo: null };
  if (acao === 'assistindo') return { texto: 'assistindo', assistindo: true, titulo: 'Abrir no palco' };
  return { texto: 'ao vivo', assistindo: false, titulo: acao === 'assistir' ? 'Assistir' : 'Entrar na call e assistir' };
}

/** Quantos estão vendo. O zero é informação — "ninguém ainda" —, não ausência dela. */
export function plateiaEmTexto(quantos: number): string {
  return quantos > 0 ? `${quantos} assistindo` : 'ninguém assistindo ainda';
}

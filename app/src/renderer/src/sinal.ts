// Como a leitura de conexão vira cor. Separado da tela para poder ser testado: um sinal
// que mente é pior que sinal nenhum, porque manda a pessoa procurar problema onde não há.

export type Cor = 'bom' | 'medio' | 'ruim' | 'sem';

/** Os valores de ConnectionQuality do LiveKit, sem depender do pacote aqui. */
export type Qualidade = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';

export const COMO_SE_LE: Record<Cor, string> = {
  bom: 'conexão boa',
  medio: 'conexão instável',
  ruim: 'conexão ruim',
  sem: 'medindo…',
};

export function corDe(qualidade: Qualidade, ping: number | null): Cor {
  if (qualidade === 'lost') return 'ruim';
  if (ping === null) return qualidade === 'unknown' ? 'sem' : 'bom';

  // Vale a pior das duas leituras. O LiveKit enxerga perda de pacote; o ping enxerga
  // distância. Uma conexão ruim costuma aparecer só num dos dois, e mostrar verde
  // porque o outro lado está bom seria justamente o sinal mentindo.
  //
  // Só o ping chega a 'ruim' sozinho: 'poor' do LiveKit significa picotando, não caiu —
  // quando cai de vez, vira 'lost', que já foi tratado acima.
  if (ping >= 250) return 'ruim';
  if (ping >= 100 || qualidade === 'poor') return 'medio';
  return 'bom';
}

export const barrasDe = (cor: Cor) => (cor === 'bom' ? 3 : cor === 'medio' ? 2 : cor === 'ruim' ? 1 : 0);

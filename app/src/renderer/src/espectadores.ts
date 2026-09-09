/**
 * Quem está assistindo à transmissão de quem.
 *
 * O LiveKit não conta a quem transmite quem está inscrito na faixa dele: não existe essa
 * pergunta na API, nem no cliente nem no servidor. Então cada app ANUNCIA o que escolheu
 * assistir, num atributo de participante, e todo mundo lê o de todo mundo — a conta é a
 * mesma em qualquer tela, e quem chega depois já recebe os atributos de quem estava lá.
 *
 * A conta mora aqui, longe do LiveKit e da tela, porque o que dá para errar nela é regra:
 * quem entra na lista, quem fica de fora e em que ordem.
 */

/**
 * O nome do atributo que viaja entre os apps. É protocolo, não texto de tela: app e
 * servidor sobem separados, e um amigo com a versão velha continua na mesma sala — ele
 * não anuncia nada e não aparece na lista, mas nada quebra.
 */
export const ASSISTINDO = 'assistindo';

export type NaCall = { identity: string; nome: string; assistindo: string | null };
export type Espectador = { identity: string; nome: string };

/** Para cada transmissão, quem está assistindo a ela. */
export function porTransmissao(pessoas: NaCall[]): Map<string, Espectador[]> {
  const mapa = new Map<string, Espectador[]>();
  for (const p of pessoas) {
    // Quem "assiste" à própria transmissão está olhando a prévia do que ele mesmo manda.
    // Isso não é plateia, e contaria uma pessoa a mais para quem quer saber se alguém está
    // vendo.
    if (!p.assistindo || p.assistindo === p.identity) continue;
    const lista = mapa.get(p.assistindo) ?? [];
    lista.push({ identity: p.identity, nome: p.nome });
    mapa.set(p.assistindo, lista);
  }
  // Por nome, não pela ordem de chegada: assim a lista fica quieta em vez de se
  // reembaralhar cada vez que alguém entra, sai ou troca de transmissão.
  for (const lista of mapa.values()) lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  return mapa;
}

/**
 * "Fulano", "Fulano e Beltrano", "Fulano, Beltrano e mais 2".
 *
 * O corte existe porque o lugar é apertado — a faixa de baixo tem 110 px de altura e o
 * quadro pequeno, 180 px de largura. Quem quiser a lista inteira passa o mouse: lá vai
 * com um limite bem maior.
 */
export function comoSeLe(nomes: string[], limite = 3): string {
  if (nomes.length === 0) return '';
  if (nomes.length === 1) return nomes[0];
  if (nomes.length > limite) return `${nomes.slice(0, limite).join(', ')} e mais ${nomes.length - limite}`;
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

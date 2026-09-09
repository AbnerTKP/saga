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
 * Os nomes dos atributos que viajam entre os apps. São protocolo, não texto de tela: app
 * e servidor sobem separados, e um amigo com a versão velha continua na mesma sala — ele
 * não anuncia nada e não aparece nas listas, mas nada quebra.
 */
export const ASSISTINDO = 'assistindo';

/**
 * Que a pessoa desligou o fone — ela não ouve NINGUÉM.
 *
 * Não dá para deduzir isso do LiveKit: surdez é decisão local, não é faixa. O que se via
 * de fora era só o microfone mudo, que é consequência (desligar o fone muta o microfone
 * junto) e diz a coisa errada: "ele não fala" em vez de "ele não te ouve".
 */
export const SURDO = 'surdo';

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

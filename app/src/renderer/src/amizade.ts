/**
 * O que o app oferece sobre uma pessoa, e o que ele avisa quando chega mensagem privada.
 *
 * Duas contas pequenas e puras, longe da tela, porque as duas erram calado: oferecer
 * "Mandar mensagem" a quem não é amigo dá um botão que o servidor recusa, e avisar da
 * conversa que está aberta na tela é barulho por uma coisa que a pessoa está lendo.
 */
import type { Conversa } from './api';

/**
 * O que dá para fazer com alguém, do ponto de vista da amizade.
 *
 * - `euMesmo`  — nada: ninguém se adiciona.
 * - `conversar`— já são amigos.
 * - `esperando`— você já mandou um pedido e ele não respondeu.
 * - `responder`— ele te mandou um pedido; a resposta é na tela de amigos.
 * - `adicionar`— ainda não há nada entre vocês.
 */
export type ComAPessoa = 'euMesmo' | 'conversar' | 'esperando' | 'responder' | 'adicionar';

export function comAPessoa(
  pessoaId: number | undefined,
  { euId, amigos, enviados, recebidos }: {
    euId: number;
    amigos: Set<number> | number[];
    /** Pedidos que EU mandei e ainda não foram respondidos. */
    enviados?: Set<number> | number[];
    /** Pedidos que chegaram para mim. */
    recebidos?: Set<number> | number[];
  },
): ComAPessoa | null {
  if (pessoaId === undefined || !(pessoaId > 0)) return null;
  if (pessoaId === euId) return 'euMesmo';
  const tem = (lista?: Set<number> | number[]) =>
    !!lista && (lista instanceof Set ? lista.has(pessoaId) : lista.includes(pessoaId));
  if (tem(amigos)) return 'conversar';
  if (tem(recebidos)) return 'responder';
  if (tem(enviados)) return 'esperando';
  return 'adicionar';
}

/** O que o botão diz em cada caso. `null` quer dizer "não mostra botão nenhum". */
export const COMO_SE_LE: Record<ComAPessoa, string | null> = {
  euMesmo: null,
  conversar: 'Mandar mensagem',
  esperando: 'Pedido enviado',
  responder: 'Responder pedido',
  adicionar: 'Adicionar amigo',
};

/** Nos dois casos que não agem, o botão fica visível e apagado: some seria pior. */
export const PODE_CLICAR: Record<ComAPessoa, boolean> = {
  euMesmo: false, conversar: true, esperando: false, responder: true, adicionar: true,
};

/**
 * Quais conversas ganharam mensagem nova desde a última volta da busca.
 *
 * Compara a última mensagem que cada conversa tinha com a que ela tem agora, e não o
 * contador de não lidas: o contador também sobe quando você marca algo como lido noutra
 * máquina, e cairia num aviso sem mensagem nenhuma por trás.
 *
 * Fica de fora a conversa ABERTA na tela — você está lendo —, e qualquer uma sem nada
 * novo. Na primeira volta (sem `antes`) ninguém é avisado: abrir o app não é acontecer.
 */
export function conversasComNovidade(
  antes: Map<number, number> | null,
  agora: Conversa[],
  abertaId: number | null,
): Conversa[] {
  if (!antes) return [];
  return agora.filter((c) => (
    c.id !== abertaId
    && c.ultimaId > 0
    && c.ultimaId > (antes.get(c.id) ?? 0)
    && c.naoLidas > 0
  ));
}

/** O que ficou na tela agora, para a próxima volta comparar. */
export const ultimasVistas = (conversas: Conversa[]) =>
  new Map(conversas.map((c) => [c.id, c.ultimaId]));

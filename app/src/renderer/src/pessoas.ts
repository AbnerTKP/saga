/**
 * Quem é a pessoa por trás de um identificador — uma resposta só, para a tela inteira.
 *
 * Clicar num nome abre o mesmo cartão em todo lugar: no chat, na call, na barra lateral
 * e na lista de pessoas. "O mesmo" era mentira: o cartão saía do mapa de quem está na
 * CALL, e quem não estivesse numa sala de voz naquele instante caía num objeto pelado
 * — sem foto, sem cargo, sem identificador. Do chat, onde quase ninguém está em call ao
 * mesmo tempo, era o caso normal: a mesma pessoa aparecia inteira pela lista da direita e
 * vazia pelo chat.
 *
 * O conserto não é copiar mais campos em cada lugar que abre o cartão: é ter UM lugar que
 * responde "quem é u12", olhando tudo que o app já sabe. Quem abre o cartão passa a só
 * perguntar.
 */
import type { Membro } from './api';
import type { PessoaNaCall } from './components/MenuDaPessoa';

/** Como a call chama uma conta. É o mesmo que o servidor emite no crachá do LiveKit. */
export const identidadeDe = (usuarioId: number) => `u${usuarioId}`;

/** O número da conta dentro de uma identidade da call, ou null se não for uma. */
export const contaDaIdentidade = (identity: string): number | null => {
  const n = Number(String(identity).replace(/^u/, ''));
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Um membro do servidor visto como pessoa. Mesmos campos que a call entrega. */
export const doMembro = (m: Membro): PessoaNaCall => ({
  identity: identidadeDe(m.id),
  nome: m.nome,
  usuarioId: m.id,
  cargo: m.cargo,
  foto: m.foto,
  banner: m.banner,
  enquadramento: m.enquadramento,
  entrouEm: m.entrouEm,
  turbo: m.turbo,
  idExibido: m.idExibido,
  status: m.status,
});

/**
 * Tudo que se sabe sobre quem tem esta identidade.
 *
 * Duas fontes, nessa ordem: quem está na CALL (vale para gente de qualquer servidor,
 * inclusive de um que não está aberto) e a lista de MEMBROS do servidor aberto (vale
 * para quem não está em call nenhuma, que é a maioria). `nome` de reserva existe para o
 * caso de as duas falharem — alguém que saiu do servidor e cuja mensagem continua no
 * chat —, e aí o cartão mostra o pouco que dá, em vez de não abrir.
 */
export function acharPessoa(
  identity: string,
  { naCall, membros, nome }: { naCall: Map<string, PessoaNaCall>; membros: Membro[]; nome?: string },
): PessoaNaCall {
  const daCall = naCall.get(identity);
  if (daCall) return daCall;

  const conta = contaDaIdentidade(identity);
  const membro = conta !== null ? membros.find((m) => m.id === conta) : undefined;
  if (membro) return doMembro(membro);

  return { identity, nome: nome ?? identity };
}

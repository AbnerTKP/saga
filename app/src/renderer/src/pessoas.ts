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
 *
 * E a pergunta nunca é só "quem é u12": é "quem é u12 NESTE servidor". A conta é global —
 * foto, banner, Berserk —, mas cargo, nome exibido, identificador e "desde quando" são do
 * vínculo com um servidor. O mapa de quem apareceu nas calls juntava todos os servidores
 * numa pilha só e era consultado ANTES da lista do servidor aberto: quem esteve numa call
 * do CORNUME continuava "Peixe Souris" com o cartão aberto no "teste", onde é "Moderador".
 * Medido no app de verdade: a lista da direita dizia Moderador e o cartão, na mesma tela,
 * Peixe Souris — com o nome e o identificador de lá. Por isso aqui tudo que é de servidor
 * anda com o servidor junto, e nada de um responde pelo outro.
 */
import type { Membro, RoomInfo } from './api';
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

/** Quem apareceu nas salas de voz, separado pelo servidor em cuja lista apareceu. */
export type Conhecidos = Map<number, Map<string, PessoaNaCall>>;

/**
 * Anota quem está nas salas de voz de UM servidor, debaixo dele.
 *
 * O mapa acumula em vez de refletir só o servidor aberto: com a voz num servidor e os
 * olhos noutro, quem está na sua call não vem na lista daqui, e sem guardar, os rostos da
 * conversa virariam iniciais no meio dela. O que chega depois sobrescreve — dentro do
 * mesmo servidor, e só nele.
 */
export function lembrarDasSalas(conhecidos: Conhecidos, servidorId: number, salas: RoomInfo[]): void {
  let daqui = conhecidos.get(servidorId);
  if (!daqui) {
    daqui = new Map();
    conhecidos.set(servidorId, daqui);
  }
  for (const sala of salas) {
    for (const p of sala.participants) {
      daqui.set(p.identity, {
        identity: p.identity, nome: p.name, usuarioId: p.usuarioId, cargo: p.cargo,
        foto: p.foto ?? null, banner: p.banner ?? null, enquadramento: p.enquadramento,
        entrouEm: p.entrouEm ?? null, turbo: p.turbo, idExibido: p.idExibido ?? null,
        status: p.status,
      });
    }
  }
}

/** Quem foi visto nas calls de um servidor. Vazio para servidor nenhum ou nunca visto. */
export const vistosEm = (conhecidos: Conhecidos, servidorId: number | null | undefined): Map<string, PessoaNaCall> =>
  (servidorId == null ? undefined : conhecidos.get(servidorId)) ?? new Map();

/**
 * Tudo que se sabe sobre quem tem esta identidade NUM servidor.
 *
 * `servidorId` é o servidor do lugar onde se clicou: o aberto, para a lista de pessoas, o
 * chat e as salas da barra; o da call, para quem está no palco — que pode ser outro,
 * porque trocar de servidor não desliga a voz.
 *
 * Duas fontes, as duas daquele servidor e nessa ordem. A lista de membros, que tem todo
 * mundo e é renovada — mas só se a lista na mão for DELE: trocar de servidor não troca a
 * lista na hora, e até a busca voltar ela ainda é a de onde se veio. E quem foi visto nas
 * calls dele, que é o que existe para a call de um servidor que não está aberto.
 *
 * Nenhuma das duas sabendo, sobra o nome que quem chamou tinha na mão — e NADA do que se
 * viu da pessoa noutro servidor: mostrar o cargo de lá é afirmar algo falso sobre este. É
 * o caso de quem saiu do servidor e cuja mensagem continua no chat.
 */
export function acharPessoa(
  identity: string,
  { servidorId, membros, conhecidos, nome }: {
    servidorId: number;
    /** A lista de membros que o app tem na mão, com o servidor a que ela pertence. */
    membros: { servidorId: number; lista: Membro[] } | null;
    conhecidos: Conhecidos;
    nome?: string;
  },
): PessoaNaCall {
  const conta = contaDaIdentidade(identity);
  if (conta !== null && membros?.servidorId === servidorId) {
    const membro = membros.lista.find((m) => m.id === conta);
    if (membro) return doMembro(membro);
  }

  const vista = conhecidos.get(servidorId)?.get(identity);
  if (vista) return vista;

  return { identity, nome: nome ?? identity };
}

/**
 * As mesas de xadrez vistas da busca de salas: quem está jogando agora (o controle ao lado
 * do nome), a mesa que é sua (a faixa da partida e o painel da voz) e quem dá para chamar.
 *
 * Sai do `/rooms`, que o app já pede de 4 em 4 s, e não de uma busca própria — o mesmo
 * motivo do "está digitando": outra busca periódica dobraria o trânsito para dizer uma coisa
 * que muda devagar. A partida em si, lance a lance, é outra busca, e só de quem a tem aberta.
 */
import type { Membro } from './api.ts';

export type ResumoDaMesa = {
  id: number;
  estado: 'lobby' | 'jogando' | 'fim';
  anfitriao: number;
  brancas: number | null;
  pretas: number | null;
  convidado: number | null;
  vez: 'w' | 'b' | null;
};

/** Quem está numa partida em andamento, e em qual mesa. */
export function jogandoAgora(mesas: ResumoDaMesa[]): Map<number, ResumoDaMesa> {
  const quem = new Map<number, ResumoDaMesa>();
  for (const mesa of mesas) {
    if (mesa.estado !== 'jogando') continue;
    if (mesa.brancas !== null) quem.set(mesa.brancas, mesa);
    if (mesa.pretas !== null) quem.set(mesa.pretas, mesa);
  }
  return quem;
}

/**
 * A mesa que é sua: a partida em que você joga; se não houver, a que você abriu e ainda
 * espera alguém; e, por último, a que acabou — é onde mora a revanche, até alguém fechar.
 */
export function minhaMesa(mesas: ResumoDaMesa[], euId: number): ResumoDaMesa | null {
  const joga = (m: ResumoDaMesa) => m.brancas === euId || m.pretas === euId;
  return mesas.find((m) => m.estado === 'jogando' && joga(m))
    ?? mesas.find((m) => m.estado === 'lobby' && m.anfitriao === euId)
    ?? mesas.find((m) => m.estado === 'fim' && joga(m))
    ?? null;
}

/** De quem é a vez numa mesa, dito para um dos jogadores. */
export function ehMinhaVez(mesa: ResumoDaMesa, euId: number): boolean {
  if (mesa.estado !== 'jogando' || !mesa.vez) return false;
  return (mesa.vez === 'w' ? mesa.brancas : mesa.pretas) === euId;
}

export type Situacao = 'livre' | 'jogando' | 'chamado' | 'recusou';
export type Chamavel = { membro: Membro; situacao: Situacao };

/**
 * Quem aparece para ser chamado, na ordem do lobby: primeiro quem está na sua call, depois
 * quem está online no servidor. Offline não aparece — convite para quem não está não chega
 * a ninguém —, e quem já joga outra partida aparece, apagado, como "jogando": sumir da lista
 * faria parecer que a pessoa saiu.
 */
export function quemChamar(membros: Membro[], o: {
  euId: number;
  naCall: Set<number>;
  jogando: Set<number>;
  convidado: number | null;
  recusou: number | null;
}): { naCall: Chamavel[]; online: Chamavel[] } {
  const situacao = (id: number): Situacao =>
    id === o.convidado ? 'chamado' : o.jogando.has(id) ? 'jogando' : id === o.recusou ? 'recusou' : 'livre';
  const porNome = (a: Membro, b: Membro) => a.nome.localeCompare(b.nome, 'pt-BR');
  const outros = membros.filter((m) => m.id !== o.euId && !m.banido).sort(porNome);
  const comSituacao = (m: Membro): Chamavel => ({ membro: m, situacao: situacao(m.id) });
  return {
    naCall: outros.filter((m) => o.naCall.has(m.id)).map(comSituacao),
    online: outros.filter((m) => !o.naCall.has(m.id) && (m.status ?? 'offline') !== 'offline').map(comSituacao),
  };
}

/**
 * O que a mesa tem a dizer entre uma busca e a seguinte, para quem está com a partida
 * FORA da tela — que é justamente quem precisa de som.
 *
 * Sai do resumo que vem na busca de salas, e não da tela do jogo: o lance do outro tem de
 * chegar enquanto você lê o chat, e a tela do jogo só existe quando ela está aberta.
 *
 * - `lance`  — o outro jogou, e a vez passou a ser sua. O seu próprio lance não toca nada:
 *              você acabou de fazê-lo, e o tabuleiro já respondeu.
 * - `fim`    — a partida acabou (mate, desistência, tempo, empate).
 *
 * Na primeira busca não toca nada: abrir o app não é acontecer. Mesa diferente também
 * não — a revanche é outra partida, e o começo dela não é um lance.
 */
export function oQueTocarNaMesa(
  antes: ResumoDaMesa | null,
  agora: ResumoDaMesa | null,
  euId: number,
): 'lance' | 'fim' | null {
  if (!antes || !agora || antes.id !== agora.id) return null;
  if (antes.estado === 'jogando' && agora.estado === 'fim') return 'fim';
  if (antes.estado !== 'jogando' || agora.estado !== 'jogando') return null;
  const minhaCor = agora.brancas === euId ? 'w' : agora.pretas === euId ? 'b' : null;
  if (!minhaCor || agora.vez !== minhaCor || antes.vez === agora.vez) return null;
  return 'lance';
}

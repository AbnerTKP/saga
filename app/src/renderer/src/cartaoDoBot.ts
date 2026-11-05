import type { EstadoDaMusica, ItemDaMusica, PlaylistDoBot } from './api';

/**
 * Em que pé está a música de um cartão do bot AGORA — não quando ele foi escrito.
 *
 * O cartão fica no chat depois que a música acaba, e um "tocando agora" com botões de pular,
 * lá em cima, sobre uma música que já passou, seria o chat mentindo. Por isso o cartão lê a
 * fila de agora: tocando, na fila (em que posição), ou já tocou — e só o que toca tem botões.
 *
 * `estado` undefined é "não sei" (a sala é de outro servidor, ou a fila ainda não chegou):
 * aí vale o que o cartão disse ao nascer, sem botões — não dá para prometer o que não se vê.
 */
export type SituacaoDoCartao =
  | { tipo: 'tocando'; botoes: boolean }
  | { tipo: 'na-fila'; posicao: number }
  | { tipo: 'tocou' };

export function situacaoDoCartao(
  item: ItemDaMusica,
  nasceu: { tipo: 'tocando' } | { tipo: 'na-fila'; posicao: number },
  estado: EstadoDaMusica | null | undefined,
): SituacaoDoCartao {
  if (estado === undefined) return nasceu.tipo === 'tocando' ? { tipo: 'tocando', botoes: false } : nasceu;
  if (estado?.tocando.uid === item.uid) return { tipo: 'tocando', botoes: true };
  const i = estado?.fila.findIndex((f) => f.uid === item.uid) ?? -1;
  if (i >= 0) return { tipo: 'na-fila', posicao: i + 1 };
  return { tipo: 'tocou' };
}

/**
 * Em que pé está uma playlist AGORA. Ela tem um cartão só no chat, escolha do dono na prancheta
 * (04/11/2026): em vez de um cartão por música, este acompanha a que está tocando.
 *
 * - tocando: uma música dela é a de agora;
 * - na fila: alguma música dela ainda vai tocar, depois de `depoisDe` outras. `continua` é ela já
 *   ter começado: enquanto as do Spotify chegam, o pedido de um amigo pode entrar no meio;
 * - tocou: não sobrou nenhuma na fila, porque acabou ou porque tiraram.
 */
export type SituacaoDaPlaylist =
  | { tipo: 'tocando'; item: ItemDaMusica; n: number; botoes: boolean }
  | { tipo: 'na-fila'; depoisDe: number; continua: boolean }
  | { tipo: 'tocou' };

export function situacaoDaPlaylist(p: PlaylistDoBot, estado: EstadoDaMusica | null | undefined): SituacaoDaPlaylist {
  if (estado === undefined) {
    return p.posicao === 0
      ? { tipo: 'tocando', item: p.primeira, n: 1, botoes: false }
      : { tipo: 'na-fila', depoisDe: p.posicao, continua: false };
  }
  if (estado?.tocando.lote?.id === p.id) {
    return { tipo: 'tocando', item: estado.tocando, n: estado.tocando.lote.n, botoes: true };
  }
  const i = estado?.fila.findIndex((f) => f.lote?.id === p.id) ?? -1;
  if (i >= 0) return { tipo: 'na-fila', depoisDe: i + 1, continua: estado!.fila[i].lote!.n > 1 };
  return { tipo: 'tocou' };
}

/** "só couberam 50 de 125", quando não coube tudo; o Spotify só diz as primeiras 100. */
export function avisoDeCorte(p: Pick<PlaylistDoBot, 'quantas' | 'total' | 'maisDe'>): string | null {
  if (p.total <= p.quantas) return null;
  return `só couberam ${p.quantas} de ${p.total}${p.maisDe ? ' ou mais' : ''}`;
}

/** 3 → "3 músicas"; 1 → "1 música". */
export const quantasMusicas = (n: number) => `${n} ${n === 1 ? 'música' : 'músicas'}`;

/** 213 → "3:33"; uma hora ou mais ganha as horas. */
export function duracao(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(r).padStart(2, '0')}`;
}

/**
 * "Artista — Título", sem repetir o artista quando o título do vídeo já o traz: é o caso comum
 * no YouTube ("Rick Astley - Never Gonna Give You Up"), e o selo dizia o nome duas vezes.
 */
export function nomeDaMusica(m: { titulo: string; autor: string }): string {
  if (!m.autor || m.titulo.toLowerCase().includes(m.autor.toLowerCase())) return m.titulo;
  return `${m.autor} — ${m.titulo}`;
}

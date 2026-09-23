import type { EstadoDaMusica, ItemDaMusica } from './api';

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

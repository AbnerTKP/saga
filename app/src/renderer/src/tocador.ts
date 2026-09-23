import type { EstadoDaMusica } from './api';

/**
 * As contas do tocador do bot de música (`useMusica`), sem React e sem áudio.
 *
 * A fila chega por dois caminhos: a busca de salas (de 4 em 4 s) e as respostas dos comandos
 * e do "acabou". Eles se cruzam: uma busca que saiu ANTES do "acabou" chega DEPOIS dele,
 * dizendo que a música velha ainda toca — e o anfitrião voltaria a tocá-la. Cada notícia vem
 * com a hora do servidor, e a mais velha que a que já se tem é descartada.
 */
export type Noticia = { estado: EstadoDaMusica | null; agora: number; recebidaEm: number };

export function maisNova(atual: Noticia | null | undefined, chegou: Noticia): Noticia {
  if (!atual) return chegou;
  return chegou.agora >= atual.agora ? chegou : atual;
}

/**
 * Onde a música está agora, em segundos. É o que deixa o anfitrião novo — quem ficou quando o
 * outro saiu da call — continuar do ponto, e não do começo. Conta com o relógio do servidor
 * (`agora - comecouEm`) mais o tempo que passou aqui desde que a notícia chegou: o relógio
 * deste computador pode estar errado, o intervalo não.
 */
export function posicao(n: Noticia, agoraAqui: number): number {
  if (!n.estado) return 0;
  return Math.max(0, (n.agora - n.estado.comecouEm + (agoraAqui - n.recebidaEm)) / 1000);
}

/**
 * Pular para o ponto só quando outra pessoa assumiu a música no meio. Poucos segundos são a
 * PARTIDA — achar, baixar, entrar na call —, e não a música andando: pulá-los cortava o
 * começo de toda música (medido em 23/09/2026: "tocando a partir de 2 s"). O anfitrião novo só
 * existe depois de o antigo sumir por 10 s (`AUSENTE`, musica.mjs), então abaixo disso não há
 * de onde continuar. Perto do fim também não: não sobra nada.
 */
export const RETOMA_A_PARTIR_DE = 10;
export function pontoDeEntrada(segundos: number, duracao: number): number {
  return segundos >= RETOMA_A_PARTIR_DE && segundos < duracao - 3 ? segundos : 0;
}

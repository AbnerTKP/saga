/**
 * Os comandos do bot de música, digitados no chat. Puro: quem executa é `musicaDoBot.ts`.
 *
 * Só vira comando o que começa com `/` E é um nome conhecido: "/shrug" ou "/ oi" seguem como
 * texto, do jeito que iam antes de haver bot — ninguém perde uma mensagem por ela ter barra.
 */

export type NomeDoComando = 'tocar' | 'pular' | 'parar' | 'fila';

/**
 * Desligado em 01/10/2026, a pedido do dono, até haver um jeito seguro (ver `LIGADO` em
 * `main/musica.ts`, que é quem de fato deixa de baixar e executar o `yt-dlp`). Na tela: o menu
 * de comandos some, e o `/tocar` responde só para quem digitou, em vez de ir para a sala como
 * mensagem. Pular, parar e ver a fila continuam: só mexem na fila do servidor, e é por eles
 * que se para uma música posta por uma Saga antiga, que ainda tem o bot.
 */
export const BOT_DE_MUSICA_LIGADO = false;

export type Comando = { nome: NomeDoComando; argumento?: string; descricao: string };

export const COMANDOS: Comando[] = [
  { nome: 'tocar', argumento: 'link ou nome', descricao: 'Toca na sua call. YouTube ou Spotify.' },
  { nome: 'pular', descricao: 'Passa para a próxima da fila.' },
  { nome: 'parar', descricao: 'Para a música e limpa a fila.' },
  { nome: 'fila', descricao: 'Mostra o que vem depois.' },
];

/** O texto enviado, como comando — ou null, e aí ele vai como mensagem normal. */
export function lerComando(texto: string): { nome: NomeDoComando; arg: string } | null {
  const m = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(texto.trim());
  if (!m) return null;
  const nome = m[1].toLowerCase();
  const conhecido = COMANDOS.find((c) => c.nome === nome);
  return conhecido ? { nome: conhecido.nome, arg: (m[2] ?? '').trim() } : null;
}

/**
 * O menu que aparece acima do campo enquanto se digita o nome do comando. Some quando vem o
 * espaço — dali em diante é o argumento, e o menu taparia a conversa à toa.
 */
export function comandosParaOMenu(texto: string, ligado = BOT_DE_MUSICA_LIGADO): Comando[] {
  if (!ligado) return [];
  const m = /^\/(\S*)$/.exec(texto);
  if (!m) return [];
  const comeco = m[1].toLowerCase();
  return COMANDOS.filter((c) => c.nome.startsWith(comeco));
}

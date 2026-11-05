/**
 * Os comandos do bot de música, digitados no chat. Puro: quem executa é `musicaDoBot.ts`.
 *
 * Só vira comando o que começa com `/` E é um nome conhecido: "/shrug" ou "/ oi" seguem como
 * texto, do jeito que iam antes de haver bot — ninguém perde uma mensagem por ela ter barra.
 */

export type NomeDoComando = 'tocar' | 'pular' | 'parar' | 'fila' | 'tirar';

/** `soNoCartao`: é o que um botão do cartão manda, e por isso não entra no menu de comandos. */
export type Comando = { nome: NomeDoComando; argumento?: string; descricao: string; soNoCartao?: boolean };

export const COMANDOS: Comando[] = [
  { nome: 'tocar', argumento: 'link ou nome', descricao: 'Música ou playlist do YouTube ou do Spotify.' },
  { nome: 'pular', descricao: 'Passa para a próxima da fila.' },
  { nome: 'parar', descricao: 'Para a música e limpa a fila.' },
  { nome: 'fila', descricao: 'Mostra o que vem depois.' },
  { nome: 'tirar', descricao: 'Tira uma playlist da fila.', soNoCartao: true },
];

/** Link de playlist, álbum ou vídeo de dentro de uma lista: só para a tela dizer o que está abrindo. */
export const pareceLinkDePlaylist = (arg: string) => /[?&]list=|open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:playlist|album)\//i.test(arg);

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
 * espaço — dali em diante é o argumento, e o menu taparia a conversa à toa. Onde o app não
 * consegue tocar (`tocaAqui`), o `/tocar` não é oferecido; pular, parar e ver a fila só mexem
 * na fila do servidor e valem em qualquer lugar.
 */
export function comandosParaOMenu(texto: string, tocaAqui = true): Comando[] {
  const m = /^\/(\S*)$/.exec(texto);
  if (!m) return [];
  const comeco = m[1].toLowerCase();
  return COMANDOS.filter((c) => !c.soNoCartao && c.nome.startsWith(comeco) && (tocaAqui || c.nome !== 'tocar'));
}

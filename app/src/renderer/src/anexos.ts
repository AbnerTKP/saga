/**
 * Imagem no chat: o que aparece NA conversa e o que vira cartão de baixar.
 *
 * Imagem colada com Ctrl+V (ou arrastada, ou escolhida no botão) ia como um anexo
 * qualquer — um cartão com nome e peso que era preciso salvar para ver. Hoje ela vai pelo
 * mesmo caminho do GIF e aparece na conversa. Só os quatro tipos que o servidor confere
 * pela assinatura dos bytes; o resto, e o que passar do teto, continua cartão, e nada se
 * perde.
 */

/** O mesmo teto do servidor (`LIMITES.imagemDoChat`). Acima disto, vai como arquivo. */
export const LIMITE_DA_IMAGEM = 15 * 1024 * 1024;

const TIPOS = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export function vaiComoImagem(a: { type: string; size: number }): boolean {
  return TIPOS.includes(a.type) && a.size > 0 && a.size <= LIMITE_DA_IMAGEM;
}

type AreaDeTransferencia = {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{ kind: string; getAsFile(): File | null }> | null;
};

/**
 * O arquivo que veio no colar, ou null quando só veio texto.
 *
 * O print de tela chega como arquivo (`image.png`); copiar uma imagem num navegador traz
 * ela JUNTO com o HTML dela, e é a imagem que interessa. Texto puro devolve null, e o colar
 * segue normal no campo.
 */
export function arquivoColado(dados: AreaDeTransferencia | null | undefined): File | null {
  if (!dados) return null;
  const arquivos = Array.from(dados.files ?? []);
  if (arquivos.length) return arquivos.find((f) => TIPOS.includes(f.type)) ?? arquivos[0];
  for (const item of Array.from(dados.items ?? [])) {
    if (item.kind !== 'file') continue;
    const f = item.getAsFile();
    if (f) return f;
  }
  return null;
}

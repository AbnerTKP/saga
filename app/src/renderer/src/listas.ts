/**
 * As linhas de uma mensagem, com os itens de lista separados do resto.
 *
 * O chat sempre guardou as quebras de linha (`white-space: pre-wrap`), mas um item comprido
 * de lista quebrava e a segunda linha voltava para a margem, embaixo do "•" — a lista virava
 * um bloco onde não se via onde um item acabava. O item vira uma linha com recuo pendurado:
 * o marcador fica na frente, e o que não coube continua embaixo do TEXTO, como no Discord.
 *
 * Item é a linha que começa com um marcador seguido de espaço: "•", "◦", "▪", "·", "-", "*",
 * "–", ou um número com ponto ou parêntese ("1.", "2)"). Os de bolinha são desenhados como a
 * bolinha do nível — "- comprar" aparece como "• comprar", que é o que o Discord faz com o
 * "-" do markdown —, e os números ficam como foram escritos. O nível vem do recuo: dois
 * espaços (ou uma tabulação) por nível, até o quarto. `**negrito**` não é item: depois do
 * asterisco não há espaço.
 *
 * Sem item nenhum, devolve `null`, e a mensagem é desenhada como sempre foi.
 */
export type Linha =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'item'; nivel: number; marcador: string; texto: string };

const ITEM = /^([ \t]*)([•◦▪·*\-–]|\d{1,3}[.)])[ \t]+(\S.*)$/;
const BOLINHAS = ['•', '◦', '▪'];
const NIVEL_MAXIMO = 3;

export function linhasComLista(texto: string): Linha[] | null {
  let temItem = false;
  const linhas = texto.split('\n').map((l): Linha => {
    const m = ITEM.exec(l);
    if (!m) return { tipo: 'texto', texto: l };
    temItem = true;
    const recuo = m[1].replace(/\t/g, '  ').length;
    const nivel = Math.min(NIVEL_MAXIMO, Math.floor(recuo / 2));
    const numero = /\d/.test(m[2]);
    const marcador = numero ? m[2] : BOLINHAS[Math.min(nivel, BOLINHAS.length - 1)];
    return { tipo: 'item', nivel, marcador, texto: m[3] };
  });
  return temItem ? linhas : null;
}

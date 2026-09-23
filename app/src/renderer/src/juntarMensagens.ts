/**
 * O que a busca de mensagens trouxe, somado ao que já estava na tela — sem repetir.
 *
 * A busca roda de 2 em 2 s e pergunta "o que veio depois da última?". Quando ela sai ANTES de
 * a resposta de um envio chegar e volta DEPOIS, traz a mensagem que o envio já mostrou (o
 * `mostrarJa`), e a tela a desenhava duas vezes. Aconteceu com o dono em 23/09/2026, com o
 * cartão do bot de música repetido, numa internet (Cloudflare WARP) que atrasava cada pedido
 * alguns segundos — mas vale para qualquer mensagem. Mesmo id é a mesma mensagem, e a ordem
 * é a do id, que é a ordem em que o servidor as gravou.
 */
export function juntarMensagens<M extends { id: number }>(antigas: M[], novas: M[], limite = 300): M[] {
  if (novas.length === 0) return antigas;
  const ja = new Set(antigas.map((m) => m.id));
  const deVerdade = novas.filter((m) => !ja.has(m.id));
  if (deVerdade.length === 0) return antigas;
  // As respostas locais do bot (id negativo, "só você vê") ficam no fim, onde nasceram; as do
  // servidor, pela ordem do id — a do envio pode ter entrado antes da de um amigo com id menor.
  const doServidor = [...antigas.filter((m) => m.id > 0), ...deVerdade.filter((m) => m.id > 0)].sort((a, b) => a.id - b.id);
  const locais = [...antigas.filter((m) => m.id < 0), ...deVerdade.filter((m) => m.id < 0)];
  return [...doServidor, ...locais].slice(-limite);
}

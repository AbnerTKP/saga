/**
 * Acha os endereços dentro de uma mensagem, para o chat poder torná-los clicáveis.
 *
 * Devolve pedaços em vez de HTML de propósito: quem escreve a mensagem é outra pessoa, e
 * montar HTML com texto de terceiro é como se escreve um buraco. Aqui o React recebe uma
 * lista e desenha `<a>` só onde ESTE código disse que é link.
 *
 * Só `http` e `https` viram link. `javascript:` e `data:` não são endereço de página —
 * são jeitos de rodar coisa clicando, e não têm o que fazer num chat de amigos.
 */
export type Pedaco =
  | { tipo: 'texto'; valor: string }
  | { tipo: 'link'; valor: string; href: string };

// Sem `<>` nem aspas, que nunca fazem parte do endereço; parênteses são tratados à parte.
const ACHAR = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;

// Pontuação que quase sempre é da frase, não do endereço: "veja em site.com/x." e
// "(site.com/x)". Cortar é mais certo do que incluir — link a mais quebra, texto a menos não.
const SOBRA = /[.,;:!?»”’]+$/;

const equilibrado = (url: string) => {
  let fim = url.length;
  // Um ")" só entra se houver um "(" antes dele: a Wikipédia usa, e a frase também.
  while (fim > 0 && url[fim - 1] === ')') {
    const dentro = url.slice(0, fim);
    if ((dentro.match(/\(/g) ?? []).length >= (dentro.match(/\)/g) ?? []).length) break;
    fim -= 1;
  }
  return url.slice(0, fim);
};

export function partirEmLinks(texto: string): Pedaco[] {
  const pedacos: Pedaco[] = [];
  let ultimo = 0;
  for (const achado of texto.matchAll(ACHAR)) {
    const cru = achado[0];
    const limpo = equilibrado(cru.replace(SOBRA, ''));
    if (!limpo) continue;
    const inicio = achado.index ?? 0;
    if (inicio > ultimo) pedacos.push({ tipo: 'texto', valor: texto.slice(ultimo, inicio) });
    pedacos.push({
      tipo: 'link',
      valor: limpo,
      href: /^www\./i.test(limpo) ? `https://${limpo}` : limpo,
    });
    ultimo = inicio + limpo.length;
  }
  if (ultimo < texto.length) pedacos.push({ tipo: 'texto', valor: texto.slice(ultimo) });
  return pedacos;
}

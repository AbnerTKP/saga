/**
 * O e-mail da conta, no que dá para decidir longe da tela.
 *
 * O e-mail serve para uma coisa só: recuperar a senha sem depender do dono da Saga. Ele só
 * vale confirmado — chega um código no endereço, e a pessoa o digita —, e quem decide se a
 * Saga pede é o servidor, que só pede com o envio de e-mail ligado.
 */
import { rotaQueNaoExiste } from './resposta.ts';

/**
 * A régua do servidor (`EMAIL_VALIDO`, em server/contas.mjs): um arroba, um ponto depois
 * dele, sem espaços. É cópia — app e servidor não importam um ao outro —, e o teste lê a de
 * lá e confere que são a mesma: divergindo, o botão acenderia para o que o servidor recusa,
 * ou apagaria para um endereço bom.
 */
export const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMAIL_MAXIMO = 254;

/** Dá para mandar: o botão acende. Quem prova que o endereço existe é o código, não isto. */
export function pareceEmail(texto: string): boolean {
  const limpo = String(texto ?? '').trim();
  return limpo.length <= EMAIL_MAXIMO && EMAIL_VALIDO.test(limpo);
}

/**
 * A falha foi do lado de cá — do servidor ou de quem manda os e-mails —, e não de quem
 * digitou?
 *
 * É o que decide se a tela oferece "entrar sem e-mail por agora". A Saga TRAVA quem não tem
 * e-mail, e é para travar: mas travar por um defeito nosso — o Resend fora, a conta dele em
 * modo de teste, o teto de envios da hora estourado — deixaria a pessoa do lado de fora sem
 * nada que ela possa fazer, e sem nem saber que a culpa não é dela. Quem digitou errado (400)
 * ou pôs o endereço de outra conta (409) conserta o campo; esses não passam.
 *
 * Sem internet (0) também passa: sem rede a Saga não funciona de qualquer jeito, e a próxima
 * abertura pede de novo.
 */
export function falhaDoLadoDeCa(status: number, mensagem: string): boolean {
  if (status === 0 || status === 429 || status >= 500) return true;
  // Servidor antigo que não conhece as rotas: ele nem deveria ter pedido.
  return rotaQueNaoExiste(status, mensagem);
}

/**
 * O código no campo de "Entrar com convite".
 *
 * O servidor ignora maiúsculas, espaço e hífen no convite, como no código de senha: quem
 * recuperou a senha digitando "K7QM-2XPA" digita o convite do mesmo jeito. Só que o campo
 * tinha `maxLength` 8 e cortava ANTES de o servidor ver — "ABCD-2345" saía "ABCD-234", e
 * " ABCD2345" colado de uma conversa saía " ABCD234". Os dois davam "Convite inválido ou
 * vencido.", com o código certo na mão. Aqui o campo guarda só o que conta, do jeito que
 * "Convidar gente" o mostra (sem hífen), e colar acha o código no meio do texto pela mesma
 * conta do código de senha.
 */
import { codigoNoColado } from './recuperacao.ts';

const TAMANHO = 8;

/** Letras e dígitos, em maiúsculas, até o tamanho de um convite. */
export const conviteDigitado = (texto: string): string =>
  String(texto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, TAMANHO);

/**
 * O que o campo passa a ter depois de colar `colado` sobre a seleção de `inicio` a `fim`.
 *
 * Com um código inteiro no colado, ele SUBSTITUI o campo — é o convite que acabou de chegar;
 * sem um inteiro, o colado entra onde está o cursor. Ver `codigoDepoisDeColar`.
 */
export const conviteDepoisDeColar = (valor: string, inicio: number, fim: number, colado: string): string =>
  codigoNoColado(colado)?.replace('-', '') ?? conviteDigitado(valor.slice(0, inicio) + colado + valor.slice(fim));

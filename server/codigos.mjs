// Os códigos que alguém lê numa tela e digita noutra: o convite de um servidor e o código
// de senha que o dono da Saga manda por fora.
//
// Um alfabeto e uma conta para os dois. Com uma cópia em cada lugar, um deles passa a gerar
// letra que o outro não espera, e ninguém vê.
import { randomBytes } from 'node:crypto';

// Sem letras que se confundem lidas em voz alta ou copiadas à mão: O e 0, I e 1.
export const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// São 32 símbolos, e 32 divide 256: `b % 32` não favorece letra nenhuma. Com um alfabeto de
// outro tamanho, o resto da divisão puxaria para as primeiras letras.
export const gerarCodigo = (tamanho = 8) =>
  [...randomBytes(tamanho)].map((b) => ALFABETO[b % ALFABETO.length]).join('');

/**
 * O código como foi gerado, a partir de como a pessoa o digitou: em maiúsculas, sem espaço
 * e sem o hífen que a tela põe no meio. O que não for texto vira código vazio, para que um
 * corpo malformado seja só um código errado, e não um erro de programa — e sem `String()`:
 * um array com milhares de níveis passa pelo `JSON.parse` e estoura a pilha ao virar texto.
 *
 * Serve aos dois códigos: com uma limpeza em cada lugar, "ABCD-EFGH" entraria como código
 * de senha e seria recusado como convite.
 */
export const limparCodigo = (texto) =>
  (typeof texto === 'string' ? texto.toUpperCase().replace(/[\s-]/g, '') : '');

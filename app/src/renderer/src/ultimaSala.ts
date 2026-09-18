/**
 * A última sala de texto aberta em cada servidor, para voltar a ela.
 *
 * Trocar de servidor (e abrir o app) caía sempre em "Escolha uma sala" — e voltar das
 * conversas para o MESMO servidor mantinha a sala: o comportamento mudava conforme o
 * caminho. Como no Discord, cada servidor lembra onde você estava lendo.
 *
 * Guardado neste computador, por conta e por servidor: outra conta no mesmo computador não
 * herda a sala de ninguém. Texto estragado é tratado como vazio — isto vem do localStorage.
 */
export const CHAVE_DA_ULTIMA_SALA = 'cantinho.ultimaSala';

type Guardadas = Record<string, number>;
const ler = (texto: string | null): Guardadas => {
  try {
    const v = JSON.parse(texto ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
};
const chave = (conta: number, servidor: number) => `${conta}:${servidor}`;

/** O texto a guardar, com esta sala como a última deste servidor para esta conta. */
export function comASala(texto: string | null, conta: number, servidor: number, sala: number): string {
  return JSON.stringify({ ...ler(texto), [chave(conta, servidor)]: sala });
}

/** A última sala desta conta neste servidor, ou null. */
export function salaGuardada(texto: string | null, conta: number, servidor: number): number | null {
  const v = ler(texto)[chave(conta, servidor)];
  return Number.isInteger(v) ? v : null;
}

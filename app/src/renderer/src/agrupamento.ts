/**
 * Quando uma mensagem CONTINUA a anterior, em vez de começar de novo.
 *
 * Quem manda três linhas seguidas mandou uma coisa só, e repetir a foto, o nome e a hora
 * em cada uma transforma um recado em três blocos — a conversa vira uma lista de fichas
 * e não se acha mais o começo de cada assunto. Continuando, a segunda linha entra
 * embaixo da primeira, alinhada com o texto, e a hora dela aparece na margem quando o
 * mouse passa: ela existe, só não ocupa espaço à toa.
 *
 * A conta mora aqui, e não no desenho, porque o que dá para errar são as bordas: dia
 * diferente, autor diferente, e o intervalo em que duas mensagens ainda são a mesma fala.
 */
import { mudouDeDia } from './dias.ts';

/** Depois disto a pessoa voltou depois de um tempo, e isso é outra fala. */
export const JUNTAS_ATE = 5 * 60_000;

type Falada = { autorId: number | null; criadoEm: number };

export function ehContinuacao(anterior: Falada | null | undefined, atual: Falada): boolean {
  if (!anterior) return false;
  // Sem autor não há de quem continuar: é a Saga falando na sala de notas, e cada versão
  // publicada é um recado inteiro, com o cabeçalho dela.
  if (anterior.autorId == null || atual.autorId == null) return false;
  if (anterior.autorId !== atual.autorId) return false;
  // Virou o dia: por mais perto que estejam no relógio (23:59 e 00:01), o separador entra
  // no meio e a mensagem de baixo precisa do próprio cabeçalho.
  if (mudouDeDia(anterior.criadoEm, atual.criadoEm)) return false;
  return atual.criadoEm - anterior.criadoEm <= JUNTAS_ATE;
}

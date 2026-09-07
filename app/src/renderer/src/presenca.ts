/**
 * O status que o app manda: o que a pessoa escolheu, ou "ausente" quando ela saiu de perto.
 *
 * A escolha manda no que é escolha — quem se pôs como **ocupado** continua ocupado mesmo
 * largando a máquina, porque "ocupado" é um recado para os outros, não uma medição. Já
 * quem está como **online** e some da máquina vira ausente sozinho: online é o padrão, e
 * um padrão que mente sobre você estar ali não serve para ninguém.
 */
export type Status = 'online' | 'ausente' | 'ocupado';

export const COMO_SE_LE: Record<Status, string> = {
  online: 'Online',
  ausente: 'Ausente',
  ocupado: 'Ocupado',
};

export const EXPLICACAO: Record<Status, string> = {
  online: 'Some sozinho para Ausente quando você larga a máquina.',
  ausente: 'Volta para Online assim que você mexer no computador.',
  ocupado: 'Fica assim mesmo que você saia de perto.',
};

/** Depois de quanto tempo parado a pessoa conta como ausente. */
export const OCIOSO_PARA_AUSENTE = 5 * 60;

export function statusParaMandar(escolhido: Status, ociosoSegundos: number): Status {
  if (escolhido === 'ocupado') return 'ocupado';
  return ociosoSegundos >= OCIOSO_PARA_AUSENTE ? 'ausente' : 'online';
}

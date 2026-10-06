/**
 * As chapas para Presidente no 2º turno, em 25/10/2026: as duas que o TSE deu como mais votadas no
 * 1º turno de 04/10 (com 99,99% das urnas apuradas na madrugada de 05/10). No 1º turno eram treze,
 * conferidas no DivulgaCandContas em 17/09 (eleição 20322002026, cargo 1); a lista inteira está no
 * histórico do git, se um dia a Urna voltar a ter 1º turno.
 *
 * O nome é o NOME NA URNA, sem acento quando o TSE grava sem (FLAVIO): é o que a urna mostra. O voto
 * num número que não existe vira NULO, como na urna — e no 2º turno isso inclui o de quem ficou no 1º.
 *
 * A ordem é a do número: nada aqui deve pôr um candidato na frente do outro.
 */
export type Candidato = {
  numero: number;
  nome: string;
  partido: string;
  vice: string;
};

/** O turno desta urna. O servidor guarda cada turno à parte (`server/urnas.mjs`). */
export const TURNO = 2;

export const CANDIDATOS: Candidato[] = [
  { numero: 13, nome: 'LULA', partido: 'PT', vice: 'GERALDO ALCKMIN' },
  { numero: 22, nome: 'FLAVIO BOLSONARO', partido: 'PL', vice: 'ALFREDO GASPAR' },
];

export const candidatoDoNumero = (numero: number): Candidato | null =>
  CANDIDATOS.find((c) => c.numero === numero) ?? null;

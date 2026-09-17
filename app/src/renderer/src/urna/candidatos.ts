/**
 * As chapas para Presidente na eleição de 04/10/2026, como estavam no TSE em 17/09/2026
 * (DivulgaCandContas, eleição 20322002026, cargo 1), conferidas por dois levantamentos feitos
 * por caminhos separados — o do TSE e o da imprensa — que bateram nome a nome.
 *
 * O nome é o NOME NA URNA, sem acento quando o TSE grava sem (FLAVIO, BARAO): é o que a urna
 * mostra. Leonardo Avalanche substituiu Pablo Marçal, indeferido em 11/09, e o registro dele
 * ainda estava pendente de julgamento — mas já constava da urna. Se alguém sair da disputa até a
 * eleição, sai daqui também; o voto num número que não existe vira NULO, como na urna.
 *
 * A ordem é a do número: nada aqui deve pôr um candidato na frente do outro.
 */
export type Candidato = {
  numero: number;
  nome: string;
  partido: string;
  vice: string;
};

export const CANDIDATOS: Candidato[] = [
  { numero: 13, nome: 'LULA', partido: 'PT', vice: 'GERALDO ALCKMIN' },
  { numero: 14, nome: 'RENAN SANTOS', partido: 'MISSÃO', vice: 'CORONEL MEDINA' },
  { numero: 16, nome: 'HERTZ DIAS', partido: 'PSTU', vice: 'VANESSA PORTUGAL' },
  { numero: 21, nome: 'EDMILSON COSTA', partido: 'PCB', vice: 'CLEUSA SANTOS' },
  { numero: 22, nome: 'FLAVIO BOLSONARO', partido: 'PL', vice: 'ALFREDO GASPAR' },
  { numero: 27, nome: 'CLARIANA BARAO', partido: 'DC', vice: 'FABIANA TORQUATO' },
  { numero: 28, nome: 'LEONARDO AVALANCHE', partido: 'PRTB', vice: 'SILVIA' },
  { numero: 29, nome: 'RUI COSTA PIMENTA', partido: 'PCO', vice: 'ANTÔNIO CARLOS' },
  { numero: 30, nome: 'ZEMA', partido: 'NOVO', vice: 'EDUARDO GIRÃO' },
  { numero: 35, nome: 'VETERINÁRIO WILSON GRASSI', partido: 'DEMOCRATA', vice: 'SUÊD HAIDAR' },
  { numero: 55, nome: 'RONALDO CAIADO', partido: 'PSD', vice: 'GILBERTO KASSAB' },
  { numero: 70, nome: 'ESCRITOR AUGUSTO CURY', partido: 'AVANTE', vice: 'JÚLIO DELGADO' },
  { numero: 80, nome: 'SAMARA', partido: 'UP', vice: 'RAQUEL BRÍCIO' },
];

export const candidatoDoNumero = (numero: number): Candidato | null =>
  CANDIDATOS.find((c) => c.numero === numero) ?? null;

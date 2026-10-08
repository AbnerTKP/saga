/**
 * A dama vista da tela: o que um clique faz, por onde a rota passa e quanto cada lado já tomou.
 *
 * A REGRA não mora aqui, como a do xadrez: é do servidor (`server/dama.mjs`), que manda junto da
 * mesa os lances que valem para quem tem a vez — já filtrados pela captura obrigatória e pela
 * lei da maioria. A tela só escolhe entre eles.
 *
 * O tabuleiro usa as mesmas casas do xadrez (`lerCasas`, `nomeDaCasa`, de `xadrez.ts`), com 'P'
 * e 'D' para as brancas e 'p' e 'd' para as pretas.
 */

export type LanceDaDama = {
  de: string;
  para: string;
  /** As casas onde a peça pousa, uma por captura, terminando em `para`. No lance simples, só `para`. */
  caminho: string[];
  /** As casas das peças que saem. */
  capturadas: string[];
  san: string;
};

export const ehDama = (letra: string | null) => letra === 'D' || letra === 'd';

/** Os lances da peça em `de` que passam pelas paradas já escolhidas, na ordem. */
export function candidatos(legais: LanceDaDama[], de: string, parcial: string[]): LanceDaDama[] {
  return legais.filter((l) => l.de === de && parcial.every((c, k) => l.caminho[k] === c) && l.caminho.length > parcial.length);
}

/**
 * Onde dá para clicar com a peça escolhida: as casas de CHEGADA, que jogam o lance de uma vez,
 * e as PARADAS do meio, que só servem quando dois caminhos chegam à mesma casa (só a dama faz
 * isso) e é preciso dizer por qual ir.
 */
export function alvos(legais: LanceDaDama[], de: string, parcial: string[]): { chegadas: string[]; paradas: string[] } {
  const cs = candidatos(legais, de, parcial);
  const chegadas = [...new Set(cs.map((l) => l.para))];
  const ambiguas = new Set(chegadas.filter((c) => cs.filter((l) => l.para === c).length > 1));
  const paradas = [...new Set(cs.filter((l) => ambiguas.has(l.para)).map((l) => l.caminho[parcial.length]))]
    .filter((c) => !chegadas.includes(c) || ambiguas.has(c));
  return { chegadas, paradas };
}

export type Clique = { jogar: LanceDaDama } | { parcial: string[] } | null;

/**
 * O que um clique numa casa faz, com a peça `de` escolhida e as paradas `parcial` já marcadas.
 * Chegada de um caminho só: joga. Parada do meio: marca, e se sobrar um caminho só, joga.
 * Qualquer outra casa: nada (quem chama decide se isso troca a peça escolhida).
 */
export function clicar(legais: LanceDaDama[], de: string, parcial: string[], casa: string): Clique {
  const cs = candidatos(legais, de, parcial);
  const chegam = cs.filter((l) => l.para === casa);
  if (chegam.length === 1) return { jogar: chegam[0] };
  const seguem = cs.filter((l) => l.caminho[parcial.length] === casa);
  if (!seguem.length) return null;
  const novo = [...parcial, casa];
  const restam = candidatos(legais, de, novo);
  // A parada que é a chegada de um caminho e o meio de outro: ainda é preciso escolher.
  const terminaAqui = seguem.filter((l) => l.caminho.length === novo.length);
  if (terminaAqui.length === 1 && !restam.length) return { jogar: terminaAqui[0] };
  if (restam.length === 1 && !terminaAqui.length) return { jogar: restam[0] };
  return { parcial: novo };
}

/** Quantas peças cada lado já tomou do outro: as doze do começo menos as que sobraram. */
export function tomadasNaDama(casas: (string | null)[]): { pelasBrancas: number; pelasPretas: number } {
  const brancas = casas.filter((c) => c === 'P' || c === 'D').length;
  const pretas = casas.filter((c) => c === 'p' || c === 'd').length;
  return { pelasBrancas: Math.max(0, 12 - pretas), pelasPretas: Math.max(0, 12 - brancas) };
}

/** Se os lances oferecidos são capturas — então a captura é obrigatória. */
export const capturaObrigatoria = (legais: LanceDaDama[]) => legais.some((l) => l.capturadas.length > 0);

/** O lance anotado para ler: "c3–d4", "d4×f6×h8". */
export const anotar = (san: string) => san.replace(/-/g, '–').replace(/x/g, '×');

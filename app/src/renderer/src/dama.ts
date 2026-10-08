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

/**
 * A animação de um lance: a peça que anda, as casas onde ela pousa (a primeira é a saída) e as
 * peças que ela salta, na ordem em que salta — cada uma some no meio do pulo sobre ela.
 *
 * Sai do lance ANOTADO ("d4xf6xh8") e do tabuleiro de ANTES dele, e não da lista de capturas:
 * o lance do outro chega pela busca só com a anotação. Entre duas paradas da captura há uma peça
 * só na diagonal; a dama pode tê-la longe, então ela é procurada no tabuleiro, e não no meio.
 */
export type Voo = {
  letra: string;
  /** A peça ao pousar: a pedra que termina na última fileira chega dama. */
  final: string;
  pontos: string[];
  tomadas: { casa: string; letra: string }[];
  captura: boolean;
};

const ARQUIVOS = 'abcdefgh';
const indice = (nome: string) => (8 - Number(nome[1])) * 8 + ARQUIVOS.indexOf(nome[0]);
const nome = (i: number) => `${ARQUIVOS[i % 8]}${8 - Math.floor(i / 8)}`;

export function montarVoo(antes: (string | null)[], san: string): Voo | null {
  const captura = san.includes('x');
  const pontos = san.split(/[x-]/);
  if (pontos.length < 2 || pontos.some((p) => !/^[a-h][1-8]$/.test(p))) return null;
  const letra = antes[indice(pontos[0])];
  if (!letra) return null;
  const tomadas: Voo['tomadas'] = [];
  if (captura) {
    for (let k = 0; k + 1 < pontos.length; k++) {
      const a = indice(pontos[k]), b = indice(pontos[k + 1]);
      const dl = Math.sign(Math.floor(b / 8) - Math.floor(a / 8)), dc = Math.sign((b % 8) - (a % 8));
      for (let i = a + dl * 8 + dc; i !== b && i >= 0 && i < 64; i += dl * 8 + dc) {
        const p = antes[i];
        if (p && !tomadas.some((t) => t.casa === nome(i))) { tomadas.push({ casa: nome(i), letra: p }); break; }
      }
    }
  }
  const fim = pontos.at(-1)!;
  const final = letra === 'P' && fim[1] === '8' ? 'D' : letra === 'p' && fim[1] === '1' ? 'd' : letra;
  return { letra, final, pontos, tomadas, captura };
}

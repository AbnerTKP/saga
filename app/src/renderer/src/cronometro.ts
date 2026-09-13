/**
 * A diferença em segundos entre os carros, como a cronometragem de verdade faz: marcas pela
 * pista, e cada carro anotado na hora em que passou por cada uma. A diferença entre dois é a
 * hora em que cada um passou pela ÚLTIMA marca que os dois já passaram.
 *
 * Adivinhar pela distância ("está 300 atrás, a 400 por segundo") erraria justamente nas curvas,
 * onde todo mundo anda devagar e as brigas acontecem. A hora de cada carro vem do relógio da
 * corrida — a minha pelo meu passo, a dos outros pela foto que eles mandam —, e por isso as
 * marcas de todos são comparáveis.
 */
export const MARCA = 250;

export type Cronometro = Map<number, number[]>;

export const criarCronometro = (): Cronometro => new Map();

/** Anota as marcas que o carro passou até `progresso`, na hora `t`. Andar para trás não desanota. */
export function registrar(c: Cronometro, id: number, progresso: number, t: number) {
  if (progresso < 0) return;
  const k = Math.floor(progresso / MARCA);
  let marcas = c.get(id);
  if (!marcas) c.set(id, (marcas = []));
  while (marcas.length <= k) marcas.push(t);
}

/**
 * Quanto `id` está atrás de `frente`, em ms, pela última marca que os dois passaram. `null`
 * quando ainda não há marca em comum — no começo da corrida, ou para quem acabou de chegar.
 */
export function intervalo(c: Cronometro, id: number, frente: number): number | null {
  const a = c.get(id), b = c.get(frente);
  if (!a || !b) return null;
  const k = Math.min(a.length, b.length) - 1;
  if (k < 0) return null;
  return Math.max(0, a[k] - b[k]);
}

/** Como a torre escreve a diferença: "+0,9", "+1 volta", "+2 voltas". */
export function escreverIntervalo(ms: number | null, voltasAtras: number): string {
  if (voltasAtras >= 1) return voltasAtras === 1 ? '+1 volta' : `+${voltasAtras} voltas`;
  if (ms === null) return '';
  return `+${(ms / 1000).toFixed(1).replace('.', ',')}`;
}

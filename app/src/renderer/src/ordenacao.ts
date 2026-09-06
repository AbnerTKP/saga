/**
 * A conta de arrastar uma sala para outro lugar.
 *
 * Fica aqui, longe da tela, porque é onde esse tipo de código erra: tirar da posição
 * velha desloca a nova, soltar no fim de um grupo não é o mesmo que soltar no começo do
 * seguinte, e uma gaveta vazia não aparece na lista mas precisa poder receber.
 */
export type ItemDeSala = { id: number; categoriaId: number | null };

/** Onde a sala vai cair: em que gaveta, e em que posição DENTRO dela. */
export type Alvo = { categoriaId: number | null; indice: number };

/**
 * Move uma sala e devolve a lista inteira na ordem nova, já com a gaveta de cada uma.
 *
 * `ordemDosGrupos` diz a sequência das gavetas na tela — `null` (as soltas) primeiro,
 * depois as categorias. Sem ela, uma gaveta vazia não teria como receber a primeira sala:
 * ela não aparece em `salas` justamente por estar vazia.
 */
export function moverSala(
  salas: ItemDeSala[],
  ordemDosGrupos: (number | null)[],
  id: number,
  alvo: Alvo,
): ItemDeSala[] {
  const grupos = new Map<number | null, ItemDeSala[]>();
  for (const g of ordemDosGrupos) grupos.set(g, []);
  for (const s of salas) {
    if (!grupos.has(s.categoriaId)) grupos.set(s.categoriaId, []);
    grupos.get(s.categoriaId)!.push(s);
  }
  if (!grupos.has(alvo.categoriaId)) grupos.set(alvo.categoriaId, []);

  const arrastada = salas.find((s) => s.id === id);
  if (!arrastada) return salas;

  // Tirar antes de inserir. Fazendo ao contrário, a própria sala conta na posição e ela
  // acaba caindo um lugar depois do que a pessoa apontou.
  const daOrigem = grupos.get(arrastada.categoriaId)!;
  const posicaoNaOrigem = daOrigem.findIndex((s) => s.id === id);
  daOrigem.splice(posicaoNaOrigem, 1);

  const destino = grupos.get(alvo.categoriaId)!;
  // Dentro da mesma gaveta, o índice foi medido com a sala ainda no lugar: tudo que
  // estava depois dela andou um para trás. O desconto vem ANTES de aparar o índice —
  // aparando primeiro, "soltar no fim" já chegava no limite e o desconto o puxava de
  // volta, deixando a sala em penúltimo.
  let onde = alvo.indice;
  if (arrastada.categoriaId === alvo.categoriaId && alvo.indice > posicaoNaOrigem) onde -= 1;
  onde = Math.max(0, Math.min(onde, destino.length));
  destino.splice(onde, 0, { id, categoriaId: alvo.categoriaId });

  const saida: ItemDeSala[] = [];
  for (const g of grupos.keys()) saida.push(...grupos.get(g)!);
  return saida;
}

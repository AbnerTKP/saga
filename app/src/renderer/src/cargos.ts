/**
 * Contas de cargo que dão para fazer longe da tela.
 *
 * O nível é a hierarquia: quem está mais alto age sobre quem está mais baixo, e NÍVEL
 * IGUAL é empate — ninguém age sobre ninguém. Permissão é outra coisa: um cargo sem
 * nenhuma pode estar acima de um cargo com todas, e a lista mostra o nível, não o poder.
 */

/**
 * O nível com que um cargo NOVO nasce.
 *
 * O formulário abria sempre em 20, fixo. Criar dois cargos sem tocar no número punha os
 * dois no mesmo nível — e aí a ordem passa a ser a de CRIAÇÃO, que ninguém vê: no CORNUME,
 * "BEN 10" (com todas as permissões) apareceu embaixo de "Peixe Souris" (com nenhuma),
 * ambos no 20, só porque o outro foi criado antes.
 *
 * Empate continua permitido — quem quiser dois cargos lado a lado põe o número na mão, e
 * o app não desempata cargo que alguém igualou de propósito. O que não pode é o empate
 * acontecer sem ninguém ter escolhido.
 *
 * Por isso o cargo novo nasce UM ACIMA do mais alto que existe: é a única posição que se
 * explica numa frase ("nasce em cima") e que não empata com nada. Quem quiser mais baixo
 * muda o número — que agora quer dizer alguma coisa em relação aos outros.
 *
 * O teto é o de quem cria: ninguém cria um cargo do próprio nível ou acima, e o dono do
 * servidor não tem teto (o cargo dele é montado com nível 1000). Sem espaço em cima,
 * pega-se o mais alto que estiver LIVRE embaixo.
 */
export function nivelParaCargoNovo(usados: number[], meuNivel: number, souDono: boolean): number {
  const teto = souDono ? 99 : Math.min(99, meuNivel - 1);
  // Sem espaço nenhum: devolve 1 e deixa o servidor recusar com a explicação dele. Mentir
  // um número que ele vai rejeitar é pior que mostrar o menor possível.
  if (teto < 1) return 1;
  // O primeiro cargo do servidor nasce no meio, para haver espaço acima e abaixo dele.
  if (usados.length === 0) return Math.min(20, teto);

  const acima = Math.max(...usados) + 1;
  if (acima <= teto) return acima;

  const ocupados = new Set(usados);
  for (let n = teto; n >= 1; n--) if (!ocupados.has(n)) return n;
  return teto;   // 99 cargos, um em cada nível: empatar é o que sobrou
}

/**
 * Os outros cargos que estão NESTE nível.
 *
 * Empate é permitido e às vezes é o que se quer, mas ele tem consequência invisível: quem
 * está num não age sobre quem está no outro. Dizer isso na hora de escolher o número é o
 * que faltava.
 */
export function empatadosCom(
  nivel: number,
  cargos: { id: number; nome: string; nivel: number }[],
  exceto?: number,
): string[] {
  return cargos.filter((c) => c.nivel === nivel && c.id !== exceto).map((c) => c.nome);
}

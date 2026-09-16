/**
 * O estado novo só entra se o conteúdo mudou; igual, fica o objeto de antes.
 *
 * As buscas de relógio (salas de 4 em 4 s, mensagens de 2 em 2, servidor de 10 em 10) gravavam
 * a resposta inteira a cada volta, e resposta nova é objeto novo mesmo com o mesmo conteúdo: o
 * React redesenhava o app todo, várias vezes por minuto, para mostrar exatamente a mesma tela.
 * Comparar o JSON de uma resposta de poucos KB custa menos que um desenho do app.
 */
export function mesmoSeIgual<T>(antes: T, novo: T): T {
  if (antes === novo) return antes;
  try {
    return JSON.stringify(antes) === JSON.stringify(novo) ? antes : novo;
  } catch {
    return novo;
  }
}

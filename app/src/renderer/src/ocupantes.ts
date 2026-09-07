/**
 * Quem a barra lateral mostra dentro de cada sala de voz.
 *
 * A lista vem de duas fontes com relógios diferentes: a sala em que a sua voz está sai
 * do LiveKit, na hora; as outras saem da busca de salas, que anda de 4 em 4 segundos e
 * ainda espera o LiveKit esquecer quem saiu. Sair de uma sala e entrar noutra fazia a
 * pessoa aparecer NAS DUAS até a busca alcançar.
 *
 * Sobre mim eu não preciso perguntar ao servidor: eu sei onde estou. Então a minha
 * presença na lista sai só do LiveKit, e a busca decide o resto — o que conserta as
 * duas queixas de uma vez, porque sair da call também some na hora.
 */
export function ocupantes<T extends { identity: string }>(
  daBusca: T[],
  { euSou, estouNesta }: { euSou: string | null; estouNesta: boolean },
): T[] {
  if (estouNesta || !euSou) return daBusca;
  return daBusca.filter((p) => p.identity !== euSou);
}

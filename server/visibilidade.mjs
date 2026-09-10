/**
 * Quem enxerga uma sala privada.
 *
 * Privada aqui quer dizer INVISÍVEL, e não trancada: uma sala que aparece na lista e
 * recusa a entrada é um convite a perguntar "por que eu não entro aí?" — e o assunto que
 * fez alguém criar a sala é justamente o que não se quer anunciar.
 *
 * A regra é por CARGO, e é pura de propósito: ela decide o que cada pessoa vê no servidor
 * inteiro — lista de salas, entrada na voz, leitura e escrita do chat —, e uma regra
 * dessas errada não dá erro nenhum, só mostra a alguém o que não era para ver.
 */

/**
 * `quem` é o membro com o cargo já montado (o mesmo que as permissões usam), e
 * `cargosComAcesso` são os ids escolhidos para a sala.
 *
 * Quem CRIOU o servidor enxerga tudo. Não é privilégio de cargo — é a saída para a sala
 * que ficou sem cargo nenhum por engano, que de outro modo não teria como ser consertada
 * por ninguém.
 */
export function podeVerASala(quem, sala, cargosComAcesso) {
  if (!sala?.privada) return true;
  if (quem?.cargo?.dono) return true;
  const meu = quem?.cargo?.id;
  return !!meu && cargosComAcesso.includes(meu);
}

/**
 * Filtra a lista de salas para os olhos de uma pessoa.
 *
 * `porSala` é um Map de salaId para os cargos com acesso — montado de uma vez só, porque
 * perguntar sala a sala era o tipo de coisa que já comeu um terço do núcleo desta VPS.
 */
export const salasQueVejo = (salas, quem, porSala) =>
  salas.filter((s) => podeVerASala(quem, s, porSala.get(s.id) ?? []));

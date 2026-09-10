/**
 * Caiu, ou fui tirado? A call só volta sozinha no primeiro caso.
 *
 * O LiveKit avisa a saída da sala com UM evento só, aconteça o que acontecer: a internet
 * piscou, o servidor reiniciou, você desligou, ou um moderador te tirou da call. Tratar
 * tudo como queda faria o app te pôr de volta na sala segundos depois de alguém te tirar
 * dela — desfazendo a moderação, e parecendo defeito dos dois lados.
 *
 * O motivo vem no evento, e é ele que decide. A regra mora aqui, longe do LiveKit e da
 * tela, porque o que dá para errar nela é a LISTA: esquecer um motivo novo do lado errado
 * é silencioso, e o preço é alto nos dois sentidos.
 */

/** Os números são do protocolo do LiveKit (DisconnectReason), e não mudam. */
export const MOTIVOS = {
  DESCONHECIDO: 0,
  /** Você desligou. */
  EU_DESLIGUEI: 1,
  /** A mesma conta entrou noutro lugar — voltar seria brigar com a outra janela. */
  ENTREI_NOUTRO_LUGAR: 2,
  /** O servidor de voz reiniciou. */
  SERVIDOR_REINICIOU: 3,
  /** Alguém te TIROU da call: expulsar, banir, castigo, desconectar. */
  ME_TIRARAM: 4,
  SALA_APAGADA: 5,
  ESTADO_DIVERGENTE: 6,
  NAO_CONSEGUI_ENTRAR: 7,
  MUDANCA_DE_SERVIDOR: 8,
  /** O cano da conexão fechou: é a queda de internet de verdade. */
  CONEXAO_FECHOU: 9,
  SALA_FECHADA: 10,
  PESSOA_INDISPONIVEL: 11,
  PESSOA_RECUSOU: 12,
} as const;

/**
 * Motivos em que a call volta sozinha: são os que ninguém escolheu.
 *
 * O que fica de FORA é o que interessa: `ME_TIRARAM` é moderação e voltar a desfaria;
 * `EU_DESLIGUEI` é decisão; `ENTREI_NOUTRO_LUGAR` faria duas janelas se empurrando; sala
 * apagada ou fechada não existe mais para onde voltar; e `NAO_CONSEGUI_ENTRAR` já falhou
 * uma vez — insistir sozinho só enche o registro.
 */
const VOLTA = new Set<number>([
  MOTIVOS.DESCONHECIDO,
  MOTIVOS.SERVIDOR_REINICIOU,
  MOTIVOS.ESTADO_DIVERGENTE,
  MOTIVOS.MUDANCA_DE_SERVIDOR,
  MOTIVOS.CONEXAO_FECHOU,
]);

/**
 * `undefined` conta como queda: versões do LiveKit que não mandam motivo nenhum caem no
 * caso comum, que é a internet ter piscado.
 */
export const deveVoltarParaACall = (motivo: number | undefined): boolean =>
  VOLTA.has(motivo ?? MOTIVOS.DESCONHECIDO);

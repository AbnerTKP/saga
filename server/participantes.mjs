// Como o LiveKit descreve um participante e como a barra lateral do app quer vê-lo.
//
// Os números do enum importam e já causaram bug: MICROPHONE é 2 e SCREEN_SHARE é 3,
// não o contrário. Trocá-los faz todo mundo aparecer compartilhando tela (porque
// todo mundo tem microfone) e mudo (porque a lista de faixas de tela vem vazia, e
// [].every() é true). Por isso ficam nomeados aqui, num lugar só.
export const FONTE = {
  DESCONHECIDA: 0,
  CAMERA: 1,
  MICROFONE: 2,
  TELA: 3,
  AUDIO_DA_TELA: 4,
};

// Uma faixa publicada mas mutada não conta: é assim que o LiveKit representa
// "desligou a câmera" e "parou de compartilhar" sem derrubar a publicação.
const ativa = (t) => !t.muted;

/**
 * Fone desligado não é faixa nenhuma: é decisão do app de quem desligou, e chega aqui
 * como ATRIBUTO do participante. O nome é protocolo, o mesmo do app (espectadores.ts) —
 * app e servidor sobem separados, então renomear aqui faz a marca sumir para quem estiver
 * com a versão de ontem, sem erro nenhum aparecer.
 */
export const ATRIBUTO_SURDO = 'surdo';

/**
 * A transmissão que a pessoa escolheu assistir — o mesmo atributo que os apps trocam
 * entre si (espectadores.ts). Vale aqui porque quem lê o CHAT de uma sala de texto
 * precisa saber quantos estão vendo a live da sala de voz sem estar dentro dela: de
 * fora da call não há LiveKit para perguntar, só esta lista.
 */
export const ATRIBUTO_ASSISTINDO = 'assistindo';

export function verParticipante(p) {
  const faixas = p.tracks ?? [];
  const microfones = faixas.filter((t) => t.source === FONTE.MICROFONE);
  return {
    identity: p.identity,
    name: p.name || p.identity,
    camera: faixas.some((t) => t.source === FONTE.CAMERA && ativa(t)),
    screen: faixas.some((t) => t.source === FONTE.TELA && ativa(t)),
    // Sem microfone publicado a pessoa também não está falando: conta como mudo.
    muted: microfones.length === 0 || microfones.every((t) => t.muted),
    // Quem não anuncia nada — versão velha do app — simplesmente não está surdo.
    surdo: p.attributes?.[ATRIBUTO_SURDO] === '1',
    // A quem esta pessoa está assistindo, ou null. Vazio e ausente são a mesma coisa:
    // "ninguém".
    assistindo: p.attributes?.[ATRIBUTO_ASSISTINDO] || null,
  };
}

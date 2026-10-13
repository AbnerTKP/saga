/**
 * No iPhone, a call sai no ALTO-FALANTE (pedido do dono, 13/10/2026: "deixa só alto-falante").
 *
 * O site não escolhe a saída do som no celular: no Android o Chrome só deixa a "padrão" (que já é
 * o alto-falante, ou o fone e o Bluetooth quando estão ligados), e no iPhone o Safari decide
 * sozinho — e, com o microfone aberto, ele manda o som do `<audio>` para o fone de pôr no ouvido,
 * baixinho. O que muda a rota no iPhone, pelo que quem passou por isso relatou:
 *  - tocar a call pela Web Audio (o `webAudioMix` do LiveKit), que o Safari manda para o
 *    alto-falante mesmo com o microfone aberto;
 *  - fechar o microfone de verdade quando a pessoa se muta (`stopMicTrackOnMute`): sem nada
 *    gravando, o iPhone volta a tocar como mídia, no alto-falante.
 *
 * Só no iPhone e no iPad: no Chrome, o cancelamento de eco não pega o som que sai pela Web
 * Audio, e ligar isto no computador ou no Android devolveria a call para quem fala.
 * Fone de ouvido e Bluetooth continuam ganhando: é o sistema que troca para eles.
 */
export function ehIphone(agente: string, plataforma: string, toques: number): boolean {
  if (/iPhone|iPad|iPod/.test(agente)) return true;
  // O iPad se apresenta como Mac desde o iPadOS 13; o que entrega é ter tela de toque.
  return plataforma === 'MacIntel' && toques > 1;
}

/** Se ESTA Saga é a do navegador num iPhone ou iPad. */
export function tocarNoAltoFalante(): boolean {
  if (typeof window === 'undefined' || window.desktop?.platform !== 'web') return false;
  return ehIphone(navigator.userAgent, navigator.platform, navigator.maxTouchPoints ?? 0);
}

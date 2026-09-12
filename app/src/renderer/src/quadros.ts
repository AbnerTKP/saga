/**
 * Como a imagem da live chega à janela do overlay.
 *
 * Ela não entra na sala de novo, e nem poderia: o LiveKit derruba a conexão anterior de
 * quem entra com a mesma identidade, e entrar com outra faria aparecer um participante
 * fantasma na lista de todo mundo. O que a janela recebe é a imagem que JÁ está chegando
 * aqui.
 *
 * Três caminhos foram medidos com o Electron deste projeto (39, Chromium 142):
 *
 * | caminho | resultado |
 * |---|---|
 * | `documentPictureInPicture` | não existe — é API de navegador, não do Electron |
 * | transferir a `MediaStreamTrack` | `DataCloneError: does not have a transferable type` |
 * | `MediaStreamTrackProcessor` + `ReadableStream` transferível | **26 quadros/s a 1280x720** |
 *
 * O terceiro é o que vale: o `ReadableStream` de `VideoFrame` é transferível, então os
 * quadros atravessam de uma janela para a outra sem codificar nada — nem H.264, nem VP8,
 * nem canvas serializado. O que atravessa é o mesmo quadro que já estava na memória.
 *
 * E ler os quadros NÃO tira a imagem de quem já a está exibindo: medido no Electron deste
 * projeto, com a mesma faixa num `<video>` e num processador ao mesmo tempo, o vídeo
 * recebeu 61 quadros nos mesmos 2 s em que o processador leu 61. Isso é o que faz a live
 * continuar no palco e no quadro flutuante enquanto ela também está por cima do jogo.
 *
 * O SOM não vai junto de propósito: ele continua saindo pela janela do app, que é onde
 * está o controle de volume da live e o resto do áudio da call. Mandar a faixa de áudio
 * também daria duas saídas tocando a mesma coisa.
 */

/** O que o app manda para a janela do overlay, e o que ela manda de volta. */
export type ParaOverlay =
  | { tipo: 'live'; leitura: ReadableStream<VideoFrame>; nome: string }
  | { tipo: 'quem'; nome: string }
  | { tipo: 'mudo'; mudo: boolean }
  /** A transmissão acabou, ou você saiu dela. A janela FICA: ela é o lugar onde a próxima
      aparece, e fechá-la sozinha tiraria da pessoa a janela que ela posicionou. */
  | { tipo: 'semLive' };

export type DoOverlay =
  | { tipo: 'pronto' }
  | { tipo: 'mudo' };

/**
 * Manda os quadros de uma faixa para a janela. Devolve como parar.
 *
 * Parar importa: sem cancelar a leitura, trocar de live deixaria o processador anterior
 * puxando quadros de uma faixa que ninguém mais vê — e o `VideoFrame` que não se fecha
 * segura memória de vídeo.
 */
export function mandarQuadros(janela: Window, faixa: MediaStreamTrack, nome: string): () => void {
  const processador = new MediaStreamTrackProcessor({ track: faixa });
  const leitura = processador.readable;
  const recado: ParaOverlay = { tipo: 'live', leitura, nome };
  janela.postMessage(recado, '*', [leitura as unknown as Transferable]);
  return () => {
    // Cancelar do lado de cá encerra a leitura do lado de lá: é um stream só, que mudou
    // de dono. O `catch` é porque a janela pode já ter fechado, e aí não há o que cancelar.
    try { processador.readable.cancel().catch(() => {}); } catch { /* já foi */ }
  };
}

/**
 * Lê os quadros que chegaram e desenha num canvas. Devolve como parar.
 *
 * O canvas segue o TAMANHO DO QUADRO, não o da janela: a janela é 16:9 e a transmissão
 * também, então o que sobra é o navegador esticar uma coisa na outra — e esticar é de
 * graça, enquanto redesenhar num canvas do tamanho errado custa uma cópia por quadro.
 */
export function desenharQuadros(
  leitura: ReadableStream<VideoFrame>,
  canvas: HTMLCanvasElement,
  aoPrimeiro?: () => void,
): () => void {
  const tela = canvas.getContext('2d');
  let parado = false;
  let primeiro = true;
  const leitor = leitura.getReader();
  (async () => {
    try {
      for (;;) {
        const { done, value } = await leitor.read();
        if (done || parado) { value?.close(); break; }
        if (canvas.width !== value.displayWidth) {
          canvas.width = value.displayWidth;
          canvas.height = value.displayHeight;
        }
        tela?.drawImage(value, 0, 0);
        // `close` em TODO quadro, inclusive quando não se desenhou: um VideoFrame que fica
        // aberto segura memória de vídeo, e a 30 por segundo isso acaba com a máquina.
        value.close();
        if (primeiro) { primeiro = false; aoPrimeiro?.(); }
      }
    } catch {
      // A leitura acaba quando o app troca de live ou fecha: não é erro, é o fim.
    } finally {
      try { leitor.releaseLock(); } catch { /* já solto */ }
    }
  })();
  return () => {
    parado = true;
    leitor.cancel().catch(() => {});
  };
}

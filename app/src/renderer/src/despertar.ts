/**
 * Quando o app tem de ir buscar tudo de novo, sem esperar o relógio.
 *
 * Todas as buscas do app são relógios: salas de 4 em 4 s, mensagens de 2 em 2 s, servidor
 * de 10 em 10 s. Enquanto tudo funciona, isso basta. Quando não funciona, é a única coisa
 * que existe — e relógio é justamente o que o sistema desliga primeiro:
 *
 *   - sem internet, cada volta falha e a seguinte só tenta no tempo dela;
 *   - com a janela atrás de outra, o Chromium estrangula os `setInterval` (e depois de
 *     alguns minutos escondida, congela quase tudo);
 *   - com a máquina dormindo, os relógios simplesmente param.
 *
 * O resultado é o que o dono viu: voltou, e o app estava do jeito que ficou. Aqui estão
 * os quatro momentos em que ele deve ir buscar AGORA — a internet voltou, a janela voltou
 * a ser vista, ela ganhou o foco, ou a máquina acordou. Nenhum deles é um relógio.
 */

/** Duas fontes podem gritar juntas (voltar o foco e voltar a rede): uma busca basta. */
const JUNTAR = 800;

export function aoDespertar(buscarAgora: () => void): () => void {
  let ultima = 0;
  const acordar = () => {
    const agora = Date.now();
    if (agora - ultima < JUNTAR) return;
    ultima = agora;
    buscarAgora();
  };

  const aoVerDeNovo = () => { if (document.visibilityState === 'visible') acordar(); };

  window.addEventListener('online', acordar);
  window.addEventListener('focus', acordar);
  document.addEventListener('visibilitychange', aoVerDeNovo);
  // A máquina acordou de dormir: só o processo principal sabe disso.
  const soltarOSistema = window.desktop?.aoAcordar?.(acordar);

  return () => {
    window.removeEventListener('online', acordar);
    window.removeEventListener('focus', acordar);
    document.removeEventListener('visibilitychange', aoVerDeNovo);
    soltarOSistema?.();
  };
}

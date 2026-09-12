import { useCallback, useEffect, useRef, useState } from 'react';
import { mandarQuadros, type DoOverlay, type ParaOverlay } from './quadros.ts';
import { anotar } from './registro';

/**
 * Mandar a live para FORA da Saga, numa janela por cima do jogo.
 *
 * O quadro flutuante resolve "estou no chat e não quero perder a transmissão"; ele não
 * resolve "estou jogando" — jogo em tela cheia tapa a Saga inteira, e alternar entre as
 * duas janelas é perder o jogo. A janela do overlay fica acima de tudo e deixa o clique
 * atravessar, então o mouse e o teclado continuam sendo do jogo.
 *
 * O vídeo vai daqui para lá pelos quadros (ver `quadros.ts`); o SOM não vai: ele continua
 * saindo pela janela do app, que é onde mora o volume da live e o resto do áudio da call.
 *
 * Quem abre a janela é esta tela, com `window.open`, e não o processo principal: só quem
 * tem a outra janela na mão consegue transferir o stream de quadros para dentro dela.
 */

/** O nome da janela: é por ele que o processo principal a reconhece e a prepara. */
const JANELA = 'overlay-da-live';

export type OverlayDaLive = {
  aberto: boolean;
  /** Falso onde a janela não pode existir — no navegador, por exemplo, em desenvolvimento. */
  disponivel: boolean;
  abrir: () => void;
  fechar: () => void;
};

export function useOverlayDaLive(
  faixa: MediaStreamTrack | null,
  nome: string | null,
  som?: { mudo: boolean; alternarMudo: () => void },
): OverlayDaLive {
  const [aberto, setAberto] = useState(false);
  const janela = useRef<Window | null>(null);
  const parar = useRef<null | (() => void)>(null);
  const pronta = useRef(false);
  // O som é lido dentro de um ouvinte que vive enquanto a janela viver: guardá-lo numa
  // referência é o que impede o ouvinte de nascer de novo a cada desenho — e cada
  // renascimento perderia a janela pelo caminho.
  const somAgora = useRef(som);
  somAgora.current = som;

  const disponivel = typeof window !== 'undefined' && !!window.desktop?.overlay;

  const pararDeMandar = useCallback(() => {
    parar.current?.();
    parar.current = null;
  }, []);

  const fechar = useCallback(() => {
    pararDeMandar();
    pronta.current = false;
    try { janela.current?.close(); } catch { /* já foi */ }
    janela.current = null;
    setAberto(false);
  }, [pararDeMandar]);

  const abrir = useCallback(() => {
    if (!disponivel) return;
    try {
      // O tamanho e a posição de verdade vêm do processo principal, que lembra onde a
      // janela estava da última vez; o que se passa aqui é só o nome.
      const nova = window.open('overlay.html', JANELA);
      if (!nova) { anotar('erro', 'overlay', 'a janela não abriu'); return; }
      janela.current = nova;
      pronta.current = false;
      setAberto(true);
    } catch (e) {
      anotar('erro', 'overlay', e);
    }
  }, [disponivel]);

  // Fechada pelo X dela, ou pelo app inteiro fechando: quem avisa é o processo principal.
  useEffect(() => {
    if (!disponivel) return;
    return window.desktop.overlay.aoFechar(() => {
      pararDeMandar();
      pronta.current = false;
      janela.current = null;
      setAberto(false);
    });
  }, [disponivel, pararDeMandar]);

  /**
   * Manda (ou remanda) a imagem de agora — quando a janela fica pronta, e a cada troca de
   * live. A faixa e o nome vêm de referências para que esta função não mude de identidade
   * a cada desenho: ela é a dependência do ouvinte e do efeito abaixo, e nascer de novo
   * ali significaria desmontar e remontar o ouvinte da janela — o mesmo defeito que
   * deixava a call em "Conectando…" por um minuto.
   */
  const faixaAgora = useRef<MediaStreamTrack | null>(null);
  const nomeAgora = useRef<string | null>(null);
  faixaAgora.current = faixa;
  nomeAgora.current = nome;

  const mandar = useCallback(() => {
    const alvo = janela.current;
    if (!alvo || !pronta.current) return;
    pararDeMandar();
    const f = faixaAgora.current;
    if (!f) {
      const recado: ParaOverlay = { tipo: 'semLive' };
      alvo.postMessage(recado, '*');
      return;
    }
    try {
      parar.current = mandarQuadros(alvo, f, nomeAgora.current ?? '');
    } catch (e) {
      anotar('erro', 'overlay', e);
    }
  }, [pararDeMandar]);

  // O que a janela do overlay manda de volta: "estou de pé" e o botão de mudo.
  useEffect(() => {
    if (!aberto) return;
    const ouvir = (e: MessageEvent<DoOverlay>) => {
      if (e.source !== janela.current) return;             // recado de outra janela não é nosso
      if (e.data?.tipo === 'pronto') { pronta.current = true; mandar(); return; }
      if (e.data?.tipo === 'mudo') somAgora.current?.alternarMudo();
    };
    window.addEventListener('message', ouvir);
    return () => window.removeEventListener('message', ouvir);
  }, [aberto, mandar]);

  // Trocou de live com o overlay aberto: a janela recebe a imagem nova, sem piscar de
  // fechar e abrir. Sem live nenhuma, a janela FICA — ela é o lugar onde a próxima
  // aparece, e fechá-la sozinha tiraria da pessoa a janela que ela posicionou.
  useEffect(() => {
    if (!aberto) return;
    mandar();
  }, [aberto, faixa, mandar]);

  // Trocar só o nome (a mesma pessoa mudou de apelido) não precisa remandar a imagem.
  useEffect(() => {
    if (!aberto || !pronta.current || !janela.current) return;
    const recado: ParaOverlay = { tipo: 'quem', nome: nome ?? '' };
    janela.current.postMessage(recado, '*');
  }, [aberto, nome]);

  // O overlay mostra o alto-falante cortado quando a live está muda — e quem sabe disso é
  // o app, não ele.
  useEffect(() => {
    if (!aberto || !janela.current) return;
    const recado: ParaOverlay = { tipo: 'mudo', mudo: !!som?.mudo };
    janela.current.postMessage(recado, '*');
  }, [aberto, som?.mudo]);

  return { aberto, disponivel, abrir, fechar };
}

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A Saga no celular: uma coisa na tela de cada vez — a lista (trilha e salas, com as abas
 * embaixo) ou o lugar aberto (a sala de texto, a conversa, o palco da call). É a opção A que
 * o dono escolheu na prancheta (12/10/2026), "como o Discord".
 *
 * Só vale no NAVEGADOR: a janela do app instalado pode ficar estreita, e nem por isso a Saga
 * do computador deve perder a soundboard ou a câmera. Medida de largura, e não de "é
 * celular": um tablet de pé usa o mesmo arranjo, e deitado, o do computador.
 */
export const LARGURA_DO_CELULAR = 760;

export type Recursos = {
  /**
   * Transmitir a tela. No app instalado, sempre. No navegador, onde ele sabe capturar
   * (`getDisplayMedia`) e fora do arranjo do celular — o navegador de celular não captura tela.
   */
  transmitir: boolean;
  /** Ligar a própria câmera. Ver a dos outros vale em qualquer lugar. */
  ligarCamera: boolean;
  /** Tocar os sons. Ouvir os dos outros vale em qualquer lugar. */
  soundboard: boolean;
  /** Abrir e ser chamado para os jogos. */
  jogos: boolean;
};

/**
 * O que cada tela oferece. No celular, a primeira versão deixa de fora os jogos, a
 * soundboard e a câmera própria (decisão do dono).
 *
 * Transmitir a tela no navegador do computador existe desde 28/11/2026: o criador de um
 * servidor usava a Saga pelo navegador e simplesmente não tinha o botão — "todos podem
 * streamar" valia para todo mundo, menos para ele. A captura é a do próprio navegador, com
 * o seletor dele; o som vai quando a pessoa marca "compartilhar áudio" lá.
 */
export function recursosDaTela({ web, celular, capturaNoNavegador = false }: {
  web: boolean; celular: boolean; capturaNoNavegador?: boolean;
}): Recursos {
  return {
    transmitir: !web || (capturaNoNavegador && !celular),
    ligarCamera: !celular,
    soundboard: !celular,
    jogos: !celular,
  };
}

const naWeb = () => typeof window !== 'undefined' && window.desktop?.platform === 'web';

/** Se este navegador sabe capturar a tela. Safari do iPhone e navegador do Android não sabem. */
export const navegadorCapturaTela = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function';

/** Se a Saga está no arranjo do celular agora. Muda ao girar o tablet ou estreitar a janela. */
export function useCelular(): boolean {
  const consulta = `(max-width: ${LARGURA_DO_CELULAR}px)`;
  const [celular, setCelular] = useState(() => naWeb() && window.matchMedia(consulta).matches);
  useEffect(() => {
    if (!naWeb()) return;
    const m = window.matchMedia(consulta);
    const mudou = () => setCelular(m.matches);
    mudou();
    m.addEventListener('change', mudou);
    return () => m.removeEventListener('change', mudou);
  }, [consulta]);
  return celular;
}

export type TelaDoCelular = 'lista' | 'lugar';

/**
 * Qual das duas telas está à mostra, com o "voltar" do celular indo de uma para a outra.
 *
 * Abrir um lugar ENTRA no histórico do navegador: sem isso, o gesto de voltar do Android (e
 * o deslizar da borda no iPhone) tiraria a pessoa da Saga em vez de levá-la de volta às
 * salas. O voltar do próprio app é o mesmo `history.back()`, para os dois caminhos nunca
 * discordarem sobre onde se está. Trocar de lugar estando num lugar não empilha nada: voltar
 * leva às salas, e não à sala anterior.
 */
export function useTelaDoCelular(celular: boolean) {
  const [tela, setTela] = useState<TelaDoCelular>('lista');
  const atual = useRef(tela);
  atual.current = tela;
  const empilhou = useRef(false);

  useEffect(() => {
    const voltou = () => { empilhou.current = false; setTela('lista'); };
    window.addEventListener('popstate', voltou);
    return () => window.removeEventListener('popstate', voltou);
  }, []);

  // Saiu do arranjo do celular (girou o tablet) com um lugar aberto: o computador mostra
  // tudo junto, e a volta ao celular começa pela lista.
  useEffect(() => { if (!celular) setTela('lista'); }, [celular]);

  const abrirLugar = useCallback(() => {
    if (!celular) return;
    if (atual.current !== 'lugar') {
      history.pushState({ saga: 'lugar' }, '');
      empilhou.current = true;
    }
    setTela('lugar');
  }, [celular]);

  const voltar = useCallback(() => {
    if (empilhou.current) { history.back(); return; }
    setTela('lista');
  }, []);

  return { tela, abrirLugar, voltar };
}

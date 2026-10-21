import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AjustesDaAtividade, JogoNoComputador, ProgramaAberto } from './desktop';
import {
  CHAVE_DOS_AJUSTES, CHAVE_DOS_VISTOS, anotarVisto, lerAjustes, lerVistos, paraMandar, type Atividade, type JogoVisto,
} from './atividade';

const ler = (chave: string) => { try { return localStorage.getItem(chave); } catch { return null; } };
const gravar = (chave: string, valor: unknown) => {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem storage, vale até fechar */ }
};

export type AtividadeDaTela = {
  /** O app de computador enxerga os programas abertos; a Saga do navegador, não. */
  disponivel: boolean;
  ajustes: AjustesDaAtividade;
  mudarAjustes: (f: (a: AjustesDaAtividade) => AjustesDaAtividade) => void;
  /** O jogo aberto agora, mesmo escondido — a página Atividade mostra os dois. */
  jogo: JogoNoComputador | null;
  vistos: JogoVisto[];
  /**
   * O que vai no sinal de vida. `undefined` no navegador: o sinal de lá não leva o campo, e
   * por isso não apaga o jogo que o computador da mesma pessoa contou.
   */
  paraOServidor: Atividade | null | undefined;
  janelas: () => Promise<ProgramaAberto[]>;
};

/**
 * O jogo aberto neste computador, do lado da tela. `ligado` é haver alguém logado: sem conta,
 * o processo principal não lê nada (ver `main/atividade.ts`).
 */
export function useAtividade(ligado: boolean): AtividadeDaTela {
  // Pego UMA vez: os efeitos abaixo dependem dele, e reconfigurar a cada desenho recomeçaria a
  // leitura dos programas a cada desenho — o oposto de "sem comprometer o desempenho".
  const [api] = useState(() => window.desktop.atividade);
  const [ajustes, setAjustes] = useState(() => lerAjustes(ler(CHAVE_DOS_AJUSTES)));
  const [jogo, setJogo] = useState<JogoNoComputador | null>(null);
  const [vistos, setVistos] = useState(() => lerVistos(ler(CHAVE_DOS_VISTOS)));

  useEffect(() => {
    if (!api) return;
    api.configurar(ligado ? ajustes : { ...ajustes, mostrar: false }).then(setJogo).catch(() => undefined);
  }, [api, ajustes, ligado]);
  useEffect(() => api?.aoMudar(setJogo), [api]);

  // Todo jogo que aparece entra na lista da página, para dar onde escondê-lo.
  const chave = jogo?.chave;
  useEffect(() => {
    if (!jogo) return;
    setVistos((v) => { const novo = anotarVisto(v, jogo, Date.now()); gravar(CHAVE_DOS_VISTOS, novo); return novo; });
    // Pela chave: o mesmo jogo chegando de novo não reescreve a lista.
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  const mudarAjustes = useCallback((f: (a: AjustesDaAtividade) => AjustesDaAtividade) => {
    setAjustes((a) => { const novo = f(a); gravar(CHAVE_DOS_AJUSTES, novo); return novo; });
  }, []);
  const janelas = useCallback(() => api?.janelas() ?? Promise.resolve([]), [api]);

  // O objeto é refeito só quando o que se manda muda: é dependência do sinal de vida no App.
  const mandar = api ? paraMandar(jogo, ajustes) : undefined;
  const texto = JSON.stringify(mandar ?? null);
  const paraOServidor = useMemo(() => mandar, [api, texto]); // eslint-disable-line react-hooks/exhaustive-deps

  return { disponivel: !!api, ajustes, mudarAjustes, jogo, vistos, paraOServidor, janelas };
}

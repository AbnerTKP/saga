import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  alturaDe, aoSoltar, esticar, guardarPouso, paraTela, pousoGuardado,
  type Area, type Caixa, type Pouso, type Quina,
} from '../flutuante.ts';

/**
 * O quadro da live que flutua sobre o chat: agora ele se arrasta e se estica.
 *
 * Ele nasceu chumbado no canto de baixo à direita, e chumbado ele tapa justamente o que
 * estiver ali — o fim da conversa, o campo de escrever, a lista da direita. A alça é a
 * BARRA de controles, como a barra de título de qualquer janela: a imagem continua sendo
 * imagem (um clique mostra, dois cliques abrem em tela cheia), e os botões dentro da barra
 * continuam sendo botões — arrastar só começa no que não é botão.
 *
 * A conta de onde ele pousa e de como ele estica mora em `flutuante.ts`, pura e testada.
 * Aqui ficam o mouse e a medida do palco.
 */
export function QuadroFlutuante({ children }: { children: ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [pouso, setPouso] = useState<Pouso>(pousoGuardado);
  const [area, setArea] = useState<Area>({ largura: 0, altura: 0 });
  /** Enquanto a mão está no quadro, quem manda é o pixel; ao soltar é que vira pouso. */
  const [movendo, setMovendo] = useState<Caixa | null>(null);

  // O palco é quem dá a medida — e ele muda de tamanho quando a janela muda, quando a
  // lista de pessoas abre e quando a barra lateral some.
  useEffect(() => {
    const pai = caixa.current?.parentElement;
    if (!pai) return;
    const medir = () => setArea({ largura: pai.clientWidth, altura: pai.clientHeight });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(pai);
    return () => observador.disconnect();
  }, []);

  const posicao = movendo ?? paraTela(pouso, area);

  const pousar = useCallback((fim: Caixa) => {
    const novo = aoSoltar(fim, area);
    setPouso(novo);
    guardarPouso(novo);
    setMovendo(null);
  }, [area]);

  /** Um gesto só, para arrastar e para esticar: muda a conta, não o mecanismo. */
  const pegar = (e: React.PointerEvent, conta: (dx: number, dy: number) => Caixa) => {
    e.preventDefault();
    const px = e.clientX;
    const py = e.clientY;
    let ultima = posicao;
    const mover = (ev: PointerEvent) => {
      ultima = conta(ev.clientX - px, ev.clientY - py);
      setMovendo(ultima);
    };
    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      pousar(ultima);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  };

  const arrastar = (e: React.PointerEvent) => {
    // A barra é a alça, menos o que já é botão: o volume e o sair continuam clicáveis.
    const alvo = e.target as HTMLElement;
    if (!alvo.closest('.mini-live-controles')) return;
    if (alvo.closest('button, input, a')) return;
    const inicio = posicao;
    pegar(e, (dx, dy) => ({ ...inicio, x: inicio.x + dx, y: inicio.y + dy }));
  };

  const esticarPela = (quina: Quina) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const inicio = posicao;
    pegar(e, (dx, dy) => esticar(inicio, quina, dx, dy, area));
  };

  /**
   * Os avisos do canto sobem para cima do quadro — mas só quando o quadro está NAQUELE
   * canto. Era uma conta chumbada no CSS (322 px), de quando o quadro só podia estar num
   * lugar e num tamanho; hoje ele anda e estica, e a medida vem daqui.
   */
  useEffect(() => {
    const embaixoADireita = pouso.deDireita && pouso.deBaixo && !movendo;
    const altura = alturaDe(posicao.largura) + pouso.dy + 12;
    document.body.style.setProperty('--avisos-fundo', embaixoADireita ? `${altura}px` : '');
    return () => { document.body.style.removeProperty('--avisos-fundo'); };
  }, [pouso, posicao.largura, movendo]);

  return (
    <div
      ref={caixa}
      className={`mini-live ${movendo ? 'movendo' : ''}`}
      style={{ left: posicao.x, top: posicao.y, right: 'auto', bottom: 'auto', width: posicao.largura }}
      onPointerDown={arrastar}
    >
      {children}
      {(['nw', 'ne', 'sw', 'se'] as Quina[]).map((q) => (
        <span key={q} className={`quadro-quina ${q}`} onPointerDown={esticarPela(q)} />
      ))}
    </div>
  );
}

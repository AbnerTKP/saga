import { useEffect, useRef } from 'react';
import { useFecharComEsc } from '../useFechar';
import { Peca } from './Tabuleiro';
import { CarroDesenho } from './DesenhoDaCorrida';

/**
 * Os jogos, abertos pelo controle do painel de voz: o xadrez e a Fórmula 1. Com uma mesa ou um
 * grid seu de pé, o item leva de volta a ele em vez de abrir outro.
 */
export function MenuDeJogos({ em, minha, corrida, onXadrez, onCorrida, onClose }: {
  /** Onde ele fica: acima do painel de voz, na largura da barra. */
  em: { left: number; bottom: number; width: number };
  minha: 'lobby' | 'jogando' | 'fim' | null;
  /** O que o item da Fórmula 1 diz embaixo do nome: abrir, voltar ao seu grid, ou assistir. */
  corrida: string;
  onXadrez: () => void;
  onCorrida: () => void;
  onClose: () => void;
}) {
  useFecharComEsc(onClose);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // O próprio controle abre e fecha: clicar nele não conta como clicar fora.
    const fora = (e: MouseEvent) => {
      const alvo = e.target as HTMLElement;
      if (!caixa.current?.contains(alvo) && !alvo.closest('[data-abre-jogos]')) onClose();
    };
    const id = setTimeout(() => document.addEventListener('mousedown', fora), 0);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', fora); };
  }, [onClose]);

  return (
    <div ref={caixa} className="menu-de-jogos" style={{ left: em.left, bottom: em.bottom, width: em.width }}>
      <div className="menu-de-jogos-titulo">Jogos</div>
      <button type="button" className="menu-de-jogos-item" onClick={() => { onXadrez(); onClose(); }}>
        <span className="peca-no-quadrado"><Peca letra="n" /></span>
        <span className="menu-de-jogos-textos">
          <span className="strong">Xadrez</span>
          <span className="muted small">
            {minha === 'jogando' ? 'voltar à sua partida' : minha ? 'voltar à sua mesa' : 'abrir uma mesa e chamar alguém'}
          </span>
        </span>
      </button>
      <button type="button" className="menu-de-jogos-item" onClick={() => { onCorrida(); onClose(); }}>
        <span className="carro-no-quadrado"><CarroDesenho carro="VER" largura={32} /></span>
        <span className="menu-de-jogos-textos">
          <span className="strong">Fórmula 1</span>
          <span className="muted small">{corrida}</span>
        </span>
      </button>
    </div>
  );
}

import { useEffect, useRef, type ReactNode } from 'react';
import { useFecharComEsc } from '../useFechar';
import { Peca } from './Tabuleiro';
import { CapaDoCatan } from './CapaDoCatan';
import { CapaDaDama } from './ConviteDeXadrez';
import type { JogoDeMesa } from '../jogos';

/**
 * Os jogos, abertos pelo controle do painel de voz, numa GRADE DE CAPAS de duas colunas — a opção A
 * que o dono escolheu quando chegou o quarto jogo, para não virar uma lista enorme. Cada capa diz
 * embaixo o que acontece ali; com uma partida ou mesa de pé, a frase fica azul e a capa ganha
 * o ponto, e clicar leva de volta a ela em vez de abrir outra.
 */
export function MenuDeJogos({ em, minha, jogoDaMinha, catan, onXadrez, onDama, onCatan, onClose }: {
  /** Onde ele fica: acima do painel de voz, na largura da barra. */
  em: { left: number; bottom: number; width: number };
  /** A sua mesa de xadrez ou de dama, e de qual dos dois ela é. */
  minha: 'lobby' | 'jogando' | 'fim' | null;
  jogoDaMinha: JogoDeMesa | null;
  /** O que a capa do Catan diz embaixo do nome: abrir uma mesa, voltar à sua, ou assistir. */
  catan: string;
  onXadrez: () => void;
  onDama: () => void;
  onCatan: () => void;
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

  // Parado, cada frase começa por "abrir"; qualquer outra coisa é algo de pé para voltar ou assistir.
  const daMesa = (jogo: JogoDeMesa) => (jogoDaMinha !== jogo || !minha ? 'abrir uma mesa'
    : minha === 'jogando' ? 'voltar à sua partida' : 'voltar à sua mesa');
  const capas: { nome: string; sub: string; capa: ReactNode; fundo: string; abrir: () => void }[] = [
    {
      nome: 'Xadrez',
      sub: daMesa('xadrez'),
      capa: <span className="capa-de-xadrez"><Peca letra="n" /></span>,
      fundo: '#eed8b4',
      abrir: onXadrez,
    },
    // No lugar da Fórmula 1, que saiu no mesmo dia em que a dama chegou (07/10/2026).
    { nome: 'Dama', sub: daMesa('dama'), capa: <CapaDaDama />, fundo: 'var(--madeira-clara)', abrir: onDama },
    { nome: 'Catan', sub: catan, fundo: '#2a6aa3', abrir: onCatan, capa: <CapaDoCatan className="capa-do-catan" /> },
  ];

  return (
    <div ref={caixa} className="menu-de-jogos" style={{ left: em.left, bottom: em.bottom, width: em.width }}>
      <div className="menu-de-jogos-titulo">Jogos</div>
      <div className="menu-de-jogos-grade">
        {capas.map((c) => {
          const agora = !c.sub.startsWith('abrir');
          return (
            <button key={c.nome} type="button" className="menu-de-jogos-item menu-de-jogos-capa" onClick={() => { c.abrir(); onClose(); }}>
              <span className="menu-de-jogos-imagem" style={{ background: c.fundo }}>
                {c.capa}
                {agora && <i className="menu-de-jogos-ponto" />}
              </span>
              <span className="menu-de-jogos-nome">{c.nome}</span>
              <span className={`menu-de-jogos-sub ${agora ? 'agora' : ''}`}>{c.sub}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

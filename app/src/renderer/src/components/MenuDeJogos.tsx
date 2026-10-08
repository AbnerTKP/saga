import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFecharComEsc } from '../useFechar';
import { apuracaoDaUrna } from '../api';
import { Peca } from './Tabuleiro';
import { QuadroNaTela } from './TelaDaLuta';
import { CapaDoCatan } from './CapaDoCatan';
import { CapaDaDama } from './ConviteDeXadrez';
import type { JogoDeMesa } from '../jogos';
import { retratoPronto } from '../dragao/desenho';
import { criarQuadro } from '../dragao/quadro';
import { desenharCapa } from '../urna/cabine';

/**
 * Os jogos, abertos pelo controle do painel de voz, numa GRADE DE CAPAS de duas colunas — a opção A
 * que o dono escolheu quando chegou o quarto jogo, para não virar uma lista enorme. Cada capa diz
 * embaixo o que acontece ali; com uma partida, mesa ou arena de pé, a frase fica azul e a capa ganha
 * o ponto, e clicar leva de volta a ela em vez de abrir outra.
 */
export function MenuDeJogos({ em, minha, jogoDaMinha, luta, catan, onXadrez, onDama, onLuta, onCatan, onUrna, onClose }: {
  /** Onde ele fica: acima do painel de voz, na largura da barra. */
  em: { left: number; bottom: number; width: number };
  /** A sua mesa de xadrez ou de dama, e de qual dos dois ela é. */
  minha: 'lobby' | 'jogando' | 'fim' | null;
  jogoDaMinha: JogoDeMesa | null;
  /** O que a capa do Dragão Quadrado diz embaixo do nome: abrir uma arena, voltar à sua, ou assistir. */
  luta: string;
  /** O mesmo para o Catan: abrir uma mesa, voltar à sua, ou assistir. */
  catan: string;
  onXadrez: () => void;
  onDama: () => void;
  onLuta: () => void;
  onCatan: () => void;
  onUrna: () => void;
  onClose: () => void;
}) {
  useFecharComEsc(onClose);
  const caixa = useRef<HTMLDivElement>(null);
  /** Os votos da Urna na Saga inteira: um pedido só, ao abrir o menu. */
  const [votos, setVotos] = useState<number | null>(null);

  useEffect(() => {
    // O próprio controle abre e fecha: clicar nele não conta como clicar fora.
    const fora = (e: MouseEvent) => {
      const alvo = e.target as HTMLElement;
      if (!caixa.current?.contains(alvo) && !alvo.closest('[data-abre-jogos]')) onClose();
    };
    const id = setTimeout(() => document.addEventListener('mousedown', fora), 0);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', fora); };
  }, [onClose]);

  useEffect(() => {
    let vivo = true;
    apuracaoDaUrna().then((a) => { if (vivo) setVotos(a.contagem.reduce((s, c) => s + c.votos, 0)); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

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
    {
      nome: 'Dragão Quadrado', sub: luta, fundo: '#6fa8dc', abrir: onLuta,
      capa: <QuadroNaTela chave="icone" className="capa-de-luta" quadro={() => retratoPronto('goiaba')} />,
    },
    { nome: 'Catan', sub: catan, fundo: '#2a6aa3', abrir: onCatan, capa: <CapaDoCatan className="capa-do-catan" /> },
    {
      nome: 'Urna', sub: votos === null ? '2º turno para presidente' : `2º turno · ${votos} ${votos === 1 ? 'voto' : 'votos'}`,
      fundo: '#2e6fb0', abrir: onUrna,
      capa: <QuadroNaTela chave="capa" className="capa-de-urna" quadro={() => { const q = criarQuadro(48, 32); desenharCapa(q); return q; }} />,
    },
  ];

  return (
    <div ref={caixa} className="menu-de-jogos" style={{ left: em.left, bottom: em.bottom, width: em.width }}>
      <div className="menu-de-jogos-titulo">Jogos</div>
      <div className="menu-de-jogos-grade">
        {capas.map((c) => {
          const agora = !c.sub.startsWith('abrir') && c.nome !== 'Urna';
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

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFecharComEsc } from '../useFechar';
import { apuracaoDaUrna } from '../api';
import { Peca } from './Tabuleiro';
import { QuadroNaTela } from './TelaDaLuta';
import { retratoPronto } from '../dragao/desenho';
import { criarQuadro } from '../dragao/quadro';
import { desenharCapa } from '../urna/cabine';
import interlagos from '../pistas/miniaturas/interlagos.webp';

/**
 * Os jogos, abertos pelo controle do painel de voz, numa GRADE DE CAPAS de duas colunas — a opção A
 * que o dono escolheu quando chegou o quarto jogo, para não virar uma lista enorme. Cada capa diz
 * embaixo o que acontece ali; com uma partida, grid ou arena de pé, a frase fica azul e a capa ganha
 * o ponto, e clicar leva de volta a ela em vez de abrir outra.
 */
export function MenuDeJogos({ em, minha, corrida, luta, onXadrez, onCorrida, onLuta, onUrna, onClose }: {
  /** Onde ele fica: acima do painel de voz, na largura da barra. */
  em: { left: number; bottom: number; width: number };
  minha: 'lobby' | 'jogando' | 'fim' | null;
  /** O que a capa da Fórmula 1 diz embaixo do nome: abrir, voltar ao seu grid, ou assistir. */
  corrida: string;
  /** O mesmo para o Dragão Quadrado: abrir uma arena, voltar à sua, ou assistir. */
  luta: string;
  onXadrez: () => void;
  onCorrida: () => void;
  onLuta: () => void;
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
  const capas: { nome: string; sub: string; capa: ReactNode; fundo: string; abrir: () => void }[] = [
    {
      nome: 'Xadrez',
      sub: minha === 'jogando' ? 'voltar à sua partida' : minha ? 'voltar à sua mesa' : 'abrir uma mesa',
      capa: <span className="capa-de-xadrez"><Peca letra="n" /></span>,
      fundo: '#eed8b4',
      abrir: onXadrez,
    },
    { nome: 'Fórmula 1', sub: corrida, capa: <img src={interlagos} alt="" className="capa-de-pista" />, fundo: '#2d5a2b', abrir: onCorrida },
    {
      nome: 'Dragão Quadrado', sub: luta, fundo: '#6fa8dc', abrir: onLuta,
      capa: <QuadroNaTela chave="icone" className="capa-de-luta" quadro={() => retratoPronto('goiaba')} />,
    },
    {
      nome: 'Urna', sub: votos === null ? 'votar para presidente' : `${votos} ${votos === 1 ? 'voto' : 'votos'} na Saga`,
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

import { useEffect, useRef } from 'react';
import type { Mensagem } from '../api';
import { Avatar } from './Avatar';
import { Nome } from './Nome';
import { useFecharComEsc } from '../useFechar';

/**
 * O menu do botão direito EM CIMA de uma mensagem.
 *
 * Apagar já foi uma lixeira que surgia em cada mensagem ao passar o mouse, e o dono a
 * recusou na hora: tinta pedindo clique por engano, num gesto que o app não usa em lugar
 * nenhum. Ações moram no botão direito — da sala, da pessoa, e agora da mensagem.
 *
 * O cabeçalho diz de quem é e o começo do que foi dito: o menu abre onde o clique caiu, e
 * numa conversa corrida ele pode ter caído na mensagem de cima.
 */
export function MenuDaMensagem({ mensagem, minha, quando, em, onApagar, onClose }: {
  mensagem: Mensagem;
  minha: boolean;
  /** A hora, escrita como no chat. */
  quando: string;
  em: { x: number; y: number };
  onApagar: () => void;
  onClose: () => void;
}) {
  useFecharComEsc(onClose);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) onClose(); };
    // No próximo tique: o próprio clique que abriu já fecharia o menu.
    const id = setTimeout(() => document.addEventListener('mousedown', fora), 0);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', fora); };
  }, [onClose]);

  const resumo = (mensagem.texto ?? '').trim() || (mensagem.imagem ? 'GIF' : mensagem.arquivo?.nome ?? '');
  const largura = 220;
  const x = Math.min(em.x, window.innerWidth - largura - 8);
  const y = Math.min(em.y, window.innerHeight - 120);

  return (
    <div ref={caixa} className="menu-pessoa menu-da-mensagem" style={{ left: x, top: Math.max(8, y), width: largura }}>
      <div className="menu-topo enxuto">
        <Avatar nome={mensagem.nome} foto={mensagem.foto} enquadramento={mensagem.enquadramento?.foto} tamanho="big" />
        <div className="quem">
          <div className="strong">
            {minha ? 'Sua mensagem' : <Nome nome={mensagem.nome} id={mensagem.idExibido} turbo={mensagem.turbo} />}
          </div>
          <div className="muted small">{quando}{resumo ? ` · ${resumo}` : ''}</div>
        </div>
      </div>
      <div className="menu-acoes">
        <button className="perigo" onClick={() => { onApagar(); onClose(); }}>Apagar mensagem</button>
      </div>
    </div>
  );
}

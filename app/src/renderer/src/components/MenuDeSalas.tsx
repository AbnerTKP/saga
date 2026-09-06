import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

export type AcaoDeSala =
  | { tipo: 'criar'; sala: 'voz' | 'texto' }
  | { tipo: 'categoria' }
  | { tipo: 'renomearCategoria'; id: number; nome: string }
  | { tipo: 'apagarCategoria'; id: number; nome: string };

/**
 * O menu do botão direito na lista de salas.
 *
 * Aberto no vazio, oferece criar; aberto em cima de uma categoria, oferece mexer nela.
 * É o mesmo menu porque é o mesmo gesto — o que muda é onde se clicou, e o menu já sabe.
 */
export function MenuDeSalas({ em, categoria, onAcao, onClose }: {
  em: { x: number; y: number };
  /** A categoria sob o cursor, quando o clique foi em cima de uma. */
  categoria: { id: number; nome: string } | null;
  onAcao: (a: AcaoDeSala) => void;
  onClose: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // No próximo tique: o próprio clique que abriu já fecharia o menu.
    const id = setTimeout(() => document.addEventListener('mousedown', fora), 0);
    document.addEventListener('keydown', esc);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  const largura = 216;
  const alto = categoria ? 190 : 140;
  const x = Math.min(em.x, window.innerWidth - largura - 8);
  const y = Math.min(em.y, window.innerHeight - alto);

  const fazer = (a: AcaoDeSala) => { onAcao(a); onClose(); };

  return (
    <div ref={caixa} className="menu-pessoa menu-salas" style={{ left: x, top: Math.max(8, y), width: largura }}>
      {categoria && (
        <div className="menu-titulo" title={categoria.nome}>{categoria.nome}</div>
      )}

      <button onClick={() => fazer({ tipo: 'criar', sala: 'voz' })}>
        <Icon name="speaker" size={15} /> Criar sala de voz
      </button>
      <button onClick={() => fazer({ tipo: 'criar', sala: 'texto' })}>
        <Icon name="texto" size={15} /> Criar sala de chat
      </button>
      <button onClick={() => fazer({ tipo: 'categoria' })}>
        <Icon name="pessoas" size={15} /> Criar categoria
      </button>

      {categoria && (
        <>
          <div className="menu-risco" />
          <button onClick={() => fazer({ tipo: 'renomearCategoria', ...categoria })}>
            Renomear “{categoria.nome}”
          </button>
          {/* Some a gaveta, ficam as conversas: é o que o servidor faz, e é o que o
              texto promete. Sem dizer isso, apagar categoria assusta. */}
          <button className="perigo" onClick={() => fazer({ tipo: 'apagarCategoria', ...categoria })}>
            Apagar “{categoria.nome}”
          </button>
          <div className="menu-dica muted small">As salas de dentro voltam para o topo, sem sumir.</div>
        </>
      )}
    </div>
  );
}

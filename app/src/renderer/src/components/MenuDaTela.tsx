import { useEffect, useRef } from 'react';

/** Volume de uma transmissão específica, aberto com o botão direito sobre ela. */
export function MenuDaTela({ nome, em, volume, onVolume, onClose }: {
  nome: string;
  em: { x: number; y: number };
  volume: number;
  onVolume: (v: number) => void;
  onClose: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // No próximo tique: o próprio clique que abriu já fecharia o menu.
    const id = setTimeout(() => document.addEventListener('mousedown', fora), 0);
    document.addEventListener('keydown', esc);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [onClose]);

  const largura = 220;
  const x = Math.min(em.x, window.innerWidth - largura - 8);
  const y = Math.min(em.y, window.innerHeight - 130);

  return (
    <div ref={caixa} className="menu-pessoa" style={{ left: x, top: Math.max(8, y), width: largura }}>
      <div className="menu-topo">
        <div className="quem">
          <div className="strong">Transmissão de {nome}</div>
          <div className="muted small">só a transmissão em destaque é ouvida</div>
        </div>
      </div>

      <label className="menu-volume">
        <span className="muted small">Volume · {Math.round(volume * 100)}%</span>
        <input
          type="range" min={0} max={150} value={Math.round(volume * 100)}
          onChange={(e) => onVolume(Number(e.target.value) / 100)}
        />
      </label>
    </div>
  );
}

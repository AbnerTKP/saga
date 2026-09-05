import { useEffect, useRef, useState } from 'react';
import { CARGO, type Acao, type Membro } from '../api';
import { Avatar } from './Avatar';

export type PessoaNaCall = {
  identity: string;
  nome: string;
  usuarioId?: number;
  cargo?: number;
  foto?: string | null;
};

// Espelho da regra do servidor, só para não mostrar botão que vai ser recusado.
const EXIGE: Record<Acao, number> = {
  mutar: CARGO.MODERADOR, desconectar: CARGO.MODERADOR, timeout: CARGO.MODERADOR,
  tirarTimeout: CARGO.MODERADOR, expulsar: CARGO.MODERADOR,
  banir: CARGO.DONO, desbanir: CARGO.DONO, cargo: CARGO.DONO,
};

export function MenuDaPessoa({ pessoa, eu, em, volume, onVolume, onAcao, onClose }: {
  pessoa: PessoaNaCall;
  eu: Membro;
  em: { x: number; y: number };
  volume: number;
  onVolume: (v: number) => void;
  onAcao: (acao: Acao, extra?: { minutos?: number; cargo?: number }) => Promise<void>;
  onClose: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const souEu = pessoa.usuarioId === eu.id;

  const posso = (acao: Acao) =>
    pessoa.usuarioId !== undefined && pessoa.cargo !== undefined &&
    !souEu && eu.cargo >= EXIGE[acao] && pessoa.cargo < eu.cargo;

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // No próximo tique, senão o clique que abriu o menu já o fecharia.
    const id = setTimeout(() => document.addEventListener('mousedown', fora), 0);
    document.addEventListener('keydown', esc);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [onClose]);

  const agir = async (acao: Acao, extra?: { minutos?: number; cargo?: number }) => {
    setOcupado(true);
    try { await onAcao(acao, extra); onClose(); } finally { setOcupado(false); }
  };

  // Mantém o menu dentro da janela.
  const largura = 220;
  const x = Math.min(em.x, window.innerWidth - largura - 8);
  const y = Math.min(em.y, window.innerHeight - 300);

  return (
    <div ref={caixa} className="menu-pessoa" style={{ left: x, top: Math.max(8, y), width: largura }}>
      <div className="menu-topo">
        <Avatar nome={pessoa.nome} foto={pessoa.foto} tamanho="big" />
        <div className="quem">
          <div className="strong">{pessoa.nome}</div>
          <div className="muted small">{souEu ? 'você' : nomeDoCargo(pessoa.cargo)}</div>
        </div>
      </div>

      {!souEu && (
        <label className="menu-volume">
          <span className="muted small">Volume · {Math.round(volume * 100)}%</span>
          <input
            type="range" min={0} max={150} value={Math.round(volume * 100)}
            onChange={(e) => onVolume(Number(e.target.value) / 100)}
          />
        </label>
      )}

      {souEu && <div className="menu-nota muted small">Ajuste o próprio volume nos Dispositivos.</div>}

      {(posso('mutar') || posso('desconectar') || posso('timeout') || posso('expulsar') || posso('banir') || posso('cargo')) && (
        <div className="menu-acoes">
          {posso('mutar') && <button disabled={ocupado} onClick={() => agir('mutar')}>Mutar para todos</button>}
          {posso('desconectar') && <button disabled={ocupado} onClick={() => agir('desconectar')}>Tirar da call</button>}
          {posso('timeout') && <button disabled={ocupado} onClick={() => agir('timeout', { minutos: 10 })}>Castigo de 10 min</button>}
          {posso('expulsar') && <button disabled={ocupado} onClick={() => agir('expulsar')}>Expulsar</button>}
          {posso('banir') && <button className="perigo" disabled={ocupado} onClick={() => agir('banir')}>Banir</button>}
          {posso('cargo') && (
            <label className="menu-cargo">
              <span className="muted small">Cargo</span>
              <select
                value={pessoa.cargo}
                disabled={ocupado}
                onChange={(e) => agir('cargo', { cargo: Number(e.target.value) })}
              >
                <option value={CARGO.MEMBRO}>Membro</option>
                <option value={CARGO.MODERADOR}>Moderador</option>
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

const nomeDoCargo = (cargo?: number) =>
  cargo === CARGO.DONO ? 'Dono' : cargo === CARGO.MODERADOR ? 'Moderador' : 'Membro';

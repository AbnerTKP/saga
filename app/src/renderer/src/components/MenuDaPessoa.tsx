import { useEffect, useRef, useState } from 'react';
import { podeSobre, type Acao, type AcaoDeModeracao, type Cargo, type Membro } from '../api';
import { Avatar } from './Avatar';
import { Nome } from './Nome';
import { urlDoArquivo } from '../api';
import { estilo, type Enquadramentos } from '../enquadramento';

export type PessoaNaCall = {
  identity: string;
  nome: string;
  usuarioId?: number;
  cargo?: Cargo | null;
  foto?: string | null;
  banner?: string | null;
  /** Como a pessoa enquadrou a própria foto e o próprio banner. */
  enquadramento?: Enquadramentos;
  /** Quando entrou neste servidor. */
  entrouEm?: number | null;
  turbo?: boolean;
  idExibido?: string | null;
};

export function MenuDaPessoa({ pessoa, eu, cargos, em, volume, onVolume, onAcao, onVerPerfil, onClose }: {
  pessoa: PessoaNaCall;
  eu: Membro;
  /** Os cargos que podem ser dados: os abaixo do meu, e nunca o de dono. */
  cargos: Cargo[];
  em: { x: number; y: number };
  volume: number;
  onVolume: (v: number) => void;
  onAcao: (acao: Acao, extra?: { minutos?: number; cargo?: number }) => Promise<void>;
  /** Clicar na foto abre o perfil inteiro: aqui ela é pequena demais para dizer algo. */
  onVerPerfil: () => void;
  onClose: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const souEu = pessoa.usuarioId === eu.id;
  const banner = urlDoArquivo(pessoa.banner);

  // Espelho da regra do servidor, só para não mostrar botão que será recusado. Tirar e
  // pôr castigo são a mesma permissão; desbanir é a mesma de banir.
  const permissaoDe: Record<AcaoDeModeracao, 'mutar' | 'desconectar' | 'timeout' | 'expulsar' | 'banir' | 'definirCargo'> = {
    mutar: 'mutar', desconectar: 'desconectar', timeout: 'timeout', tirarTimeout: 'timeout',
    expulsar: 'expulsar', banir: 'banir', desbanir: 'banir', cargo: 'definirCargo',
  };
  const posso = (acao: AcaoDeModeracao) =>
    pessoa.usuarioId !== undefined
    && podeSobre(eu, permissaoDe[acao], { id: pessoa.usuarioId, cargo: pessoa.cargo ?? null });

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
      {/* O banner vira o topo do cartão, como num perfil — é onde ele faz sentido. */}
      {banner && (
        <div className="cartao-banner">
          <img src={banner} alt="" draggable={false} style={estilo(pessoa.enquadramento?.banner)} />
        </div>
      )}

      <div className={`menu-topo ${banner ? 'sob-banner' : ''}`}>
        <Avatar
          nome={pessoa.nome}
          foto={pessoa.foto}
          enquadramento={pessoa.enquadramento?.foto}
          tamanho="big"
          titulo="Ver o perfil"
          onClick={() => { onVerPerfil(); onClose(); }}
        />
        <div className="quem">
          <div className="strong nome-do-cartao">
            <Nome nome={pessoa.nome} id={pessoa.idExibido} turbo={pessoa.turbo} />
          </div>
          <div className="muted small linha-do-cargo">
            <span style={pessoa.cargo?.cor ? { color: pessoa.cargo.cor } : undefined}>
              {souEu ? 'você' : (pessoa.cargo?.nome ?? 'Sem cargo')}
            </span>
            {pessoa.turbo && <span className="selo-berserk">BERSERK</span>}
          </div>
        </div>
      </div>

      {!souEu && (
        <label className="menu-volume">
          <span className="muted small">Volume · {Math.round(volume * 100)}%</span>
          <input
            type="range" min={0} max={100} value={Math.round(volume * 100)}
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
          {posso('cargo') && cargos.length > 0 && (
            <label className="menu-cargo">
              <span className="muted small">Cargo</span>
              <select
                value={pessoa.cargo?.id ?? ''}
                disabled={ocupado}
                onChange={(e) => agir('cargo', { cargo: Number(e.target.value) })}
              >
                {cargos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

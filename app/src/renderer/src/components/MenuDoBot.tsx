import { useEffect, useRef, useState } from 'react';
import type { EstadoDaMusica } from '../api';
import { duracao, nomeDaMusica } from '../cartaoDoBot';
import { useFecharComEsc } from '../useFechar';
import { Icon } from './Icon';

/**
 * O bot de música com o botão direito — o mesmo menu de uma PESSOA, pedido do dono (23/09/2026:
 * "que o bot tenha o mesmo comportamento de pessoa"). O volume é o da música, o mesmo das
 * configurações, e fica guardado neste computador. Pular é de quem tem "Tocar música"; tirar da
 * call (parar e limpar a fila), de quem tem "Tocar música" ou pode tirar pessoas da call.
 */
export function MenuDoBot({ estado, em, volume, onVolume, podePular, podeTirar, onPular, onTirar, onClose }: {
  estado: EstadoDaMusica;
  em: { x: number; y: number };
  volume: number;
  onVolume: (v: number) => void;
  podePular: boolean;
  podeTirar: boolean;
  onPular: () => Promise<void>;
  onTirar: () => Promise<void>;
  onClose: () => void;
}) {
  useFecharComEsc(onClose);
  const caixa = useRef<HTMLDivElement>(null);
  const [verFila, setVerFila] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Clicar fora fecha, como no menu de pessoa. No próximo tique, senão o clique que abriu o
  // menu já o fecharia.
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) onClose(); };
    const id = setTimeout(() => document.addEventListener('mousedown', fora), 0);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', fora); };
  }, [onClose]);
  const largura = 250;
  const x = Math.min(em.x, window.innerWidth - largura - 8);
  const y = Math.min(em.y, window.innerHeight - 320);
  const agir = async (f: () => Promise<void>) => {
    setOcupado(true); setErro(null);
    try { await f(); onClose(); } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  };

  return (
    <div ref={caixa} className="menu-pessoa menu-do-bot" style={{ left: x, top: Math.max(8, y), width: largura }}>
      <div className="menu-topo enxuto">
        <span className="avatar big avatar-do-bot"><Icon name="nota" size={18} /></span>
        <div className="quem">
          <div className="strong nome-do-cartao">Música <span className="selo-bot">BOT</span></div>
          <div className="small tocando-agora" title={nomeDaMusica(estado.tocando)}>{nomeDaMusica(estado.tocando)}</div>
        </div>
      </div>

      <label className="menu-volume">
        <span className="muted small">Volume · {Math.round(volume * 100)}%</span>
        <input type="range" min={0} max={100} value={Math.round(volume * 100)}
          onChange={(e) => onVolume(Number(e.target.value) / 100)} />
      </label>

      <div className="menu-acoes">
        {podePular && <button disabled={ocupado} onClick={() => agir(onPular)}>Pular esta música</button>}
        <button onClick={() => setVerFila((v) => !v)} aria-expanded={verFila}>
          {verFila ? 'Esconder a fila' : `Ver a fila${estado.fila.length ? ` (${estado.fila.length})` : ''}`}
        </button>
        {verFila && (
          <ol className="fila-no-menu">
            {estado.fila.length === 0 && <li className="muted small">Depois desta, nada.</li>}
            {estado.fila.slice(0, 8).map((f) => (
              <li key={f.uid} title={nomeDaMusica(f)}>
                <span className="fila-titulo">{nomeDaMusica(f)}</span>
                <span className="muted small">{duracao(f.duracao)} · {f.pediu.nome}</span>
              </li>
            ))}
            {estado.fila.length > 8 && <li className="muted small">E mais {estado.fila.length - 8}.</li>}
          </ol>
        )}
        {podeTirar && <button className="perigo" disabled={ocupado} onClick={() => agir(onTirar)}>Tirar da call</button>}
      </div>
      {erro && <div className="menu-nota small erro-no-menu">{erro}</div>}
    </div>
  );
}

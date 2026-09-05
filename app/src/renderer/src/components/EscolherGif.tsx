import { useEffect, useRef, useState } from 'react';
import { buscarGifs, type Gif } from '../api';
import { Icon } from './Icon';

/** Busca no Giphy. A chave fica no servidor; daqui só sai o termo. */
export function EscolherGif({ onEscolher, onClose }: {
  onEscolher: (url: string) => Promise<void>;
  onClose: () => void;
}) {
  const [termo, setTermo] = useState('');
  const [gifs, setGifs] = useState<Gif[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const digitando = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Espera a pessoa parar de digitar: uma busca por tecla gastaria a cota do grupo à toa.
  useEffect(() => {
    clearTimeout(digitando.current);
    digitando.current = setTimeout(() => {
      setErro(null);
      buscarGifs(termo).then(setGifs).catch((e) => { setGifs([]); setErro((e as Error).message); });
    }, termo ? 400 : 0);
    return () => clearTimeout(digitando.current);
  }, [termo]);

  const escolher = async (g: Gif) => {
    setEnviando(g.id);
    setErro(null);
    try { await onEscolher(g.arquivo); onClose(); }
    catch (e) { setErro((e as Error).message); }
    finally { setEnviando(null); }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal painel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="strong">Escolher um GIF</span>
          <button className="icon" onClick={onClose}><Icon name="close" /></button>
        </div>

        <div className="painel-bloco">
          <input
            autoFocus
            placeholder="Buscar no Giphy — vazio mostra os do momento"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
          />
          {erro && <div className="error" style={{ marginTop: 10 }}>{erro}</div>}
        </div>

        <div className="painel-bloco grade-gifs-area">
          {gifs === null && <p className="muted small">Procurando…</p>}
          {gifs?.length === 0 && !erro && <p className="muted small">Nada encontrado.</p>}
          <div className="grade-gifs">
            {gifs?.map((g) => (
              <button
                key={g.id}
                className={`gif ${enviando === g.id ? 'enviando' : ''}`}
                title={g.titulo || 'GIF'}
                disabled={!!enviando}
                onClick={() => escolher(g)}
              >
                <img src={g.previa ?? g.arquivo} alt={g.titulo} draggable={false} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

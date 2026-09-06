import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from './Icon';
import {
  arrastar, estilo, limpar, PADRAO, ZOOM_MAXIMO,
  type Enquadramento, type Papel,
} from '../enquadramento';

/**
 * Ajusta como a imagem aparece — arrastando e aproximando.
 *
 * Ela **não** é recortada: o arquivo enviado fica intacto e o que se guarda é a posição.
 * É o que deixa o GIF continuar animado depois de enquadrado. A prévia usa exatamente a
 * mesma conta do resto do app, então o que se vê aqui é o que aparece lá fora.
 */
export function Enquadrar({ url, papel, inicial, onSalvar, onClose }: {
  url: string;
  papel: Papel;
  inicial: Enquadramento | null | undefined;
  onSalvar: (valor: Enquadramento) => Promise<void>;
  onClose: () => void;
}) {
  const [valor, setValor] = useState<Enquadramento>(() => limpar(inicial ?? PADRAO));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const quadro = useRef<HTMLDivElement>(null);
  const arrastando = useRef<{ x: number; y: number } | null>(null);

  const comecar = (e: ReactPointerEvent) => {
    arrastando.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const mover = (e: ReactPointerEvent) => {
    const de = arrastando.current;
    const caixa = quadro.current?.getBoundingClientRect();
    if (!de || !caixa) return;
    arrastando.current = { x: e.clientX, y: e.clientY };
    setValor((v) => arrastar(v, e.clientX - de.x, e.clientY - de.y, caixa.width, caixa.height));
  };

  const soltar = () => { arrastando.current = null; };

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try { await onSalvar(valor); onClose(); }
    catch (e) { setErro((e as Error).message); }
    finally { setSalvando(false); }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="strong">Enquadrar {papel === 'foto' ? 'a foto' : 'o banner'}</span>
          <button className="icon" onClick={onClose}><Icon name="close" /></button>
        </div>

        <div className="pad form">
          <div
            ref={quadro}
            className={`enquadrar-quadro ${papel}`}
            onPointerDown={comecar}
            onPointerMove={mover}
            onPointerUp={soltar}
            onPointerCancel={soltar}
          >
            <img src={url} alt="" draggable={false} style={estilo(valor)} />
          </div>

          <label>
            Aproximação
            <input
              type="range"
              min={1}
              max={ZOOM_MAXIMO}
              step={0.05}
              value={valor.zoom}
              onChange={(e) => setValor((v) => limpar({ ...v, zoom: Number(e.target.value) }))}
            />
          </label>

          <p className="muted small">
            Arraste a imagem para escolher o que aparece. Ela não é cortada — o arquivo fica
            como veio, e um GIF continua animado.
          </p>

          {erro && <div className="error">{erro}</div>}

          <div className="linha-campo">
            <button type="button" onClick={() => setValor(PADRAO)}>Voltar ao normal</button>
            <button type="button" className="primary" disabled={salvando} onClick={salvar}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

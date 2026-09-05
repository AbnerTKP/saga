import { useRef, useState } from 'react';
import { urlDoArquivo } from '../api';

/**
 * Escolhe um arquivo e envia. O <input type="file"> fica escondido porque o botão
 * nativo do sistema não combina com o resto e não dá para estilizar.
 */
export function EscolherImagem({ rotulo, atual, formato, onEnviar }: {
  rotulo: string;
  atual: string | null;
  formato: 'redondo' | 'faixa';
  onEnviar: (arquivo: File | null) => Promise<void>;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const url = urlDoArquivo(atual);

  const enviar = async (arquivo: File | null) => {
    setOcupado(true);
    try { await onEnviar(arquivo); } finally {
      setOcupado(false);
      if (campo.current) campo.current.value = '';   // permite reescolher o mesmo arquivo
    }
  };

  return (
    <div className="escolher-imagem">
      <div className={`previa ${formato}`}>
        {url ? <img src={url} alt="" draggable={false} /> : <span className="muted small">sem imagem</span>}
      </div>
      <div className="escolher-acoes">
        <span className="muted small">{rotulo}</span>
        <div>
          <button type="button" disabled={ocupado} onClick={() => campo.current?.click()}>
            {ocupado ? 'Enviando…' : atual ? 'Trocar' : 'Escolher'}
          </button>
          {atual && (
            <button type="button" className="link" disabled={ocupado} onClick={() => enviar(null)}>remover</button>
          )}
        </div>
      </div>
      <input
        ref={campo}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={(e) => { const a = e.target.files?.[0]; if (a) enviar(a); }}
      />
    </div>
  );
}

import { useRef, useState } from 'react';
import { urlDoArquivo } from '../api';
import { EscolherGif } from './EscolherGif';
import { Enquadrar } from './Enquadrar';
import { estilo, type Enquadramento, type Papel } from '../enquadramento';

/**
 * Escolhe um arquivo e envia. O <input type="file"> fica escondido porque o botão
 * nativo do sistema não combina com o resto e não dá para estilizar.
 */
export function EscolherImagem({ rotulo, atual, formato, papel, enquadramento, onEnviar, onGif, onEnquadrar }: {
  rotulo: string;
  atual: string | null;
  formato: 'redondo' | 'faixa';
  /** Ausente esconde o botão de enquadrar: a imagem do servidor não é enquadrável. */
  papel?: Papel;
  enquadramento?: Enquadramento | null;
  onEnviar: (arquivo: File | null) => Promise<void>;
  /** Ausente esconde o botão de GIF — é assim que o servidor sem chave se comporta. */
  onGif?: (url: string) => Promise<void>;
  onEnquadrar?: (valor: Enquadramento) => Promise<void>;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const [buscandoGif, setBuscandoGif] = useState(false);
  const [enquadrando, setEnquadrando] = useState(false);
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
        {url
          ? <img src={url} alt="" draggable={false} style={estilo(enquadramento)} />
          : <span className="muted small">sem imagem</span>}
      </div>
      <div className="escolher-acoes">
        <span className="muted small">{rotulo}</span>
        <div>
          <button type="button" disabled={ocupado} onClick={() => campo.current?.click()}>
            {ocupado ? 'Enviando…' : atual ? 'Trocar' : 'Escolher'}
          </button>
          {onGif && (
            <button type="button" disabled={ocupado} onClick={() => setBuscandoGif(true)}>GIF</button>
          )}
          {atual && papel && onEnquadrar && (
            <button type="button" disabled={ocupado} onClick={() => setEnquadrando(true)}>Enquadrar</button>
          )}
          {atual && (
            <button type="button" className="link" disabled={ocupado} onClick={() => enviar(null)}>remover</button>
          )}
        </div>
      </div>
      {buscandoGif && onGif && (
        <EscolherGif onEscolher={onGif} onClose={() => setBuscandoGif(false)} />
      )}
      {enquadrando && url && papel && onEnquadrar && (
        <Enquadrar
          url={url}
          papel={papel}
          inicial={enquadramento}
          onSalvar={onEnquadrar}
          onClose={() => setEnquadrando(false)}
        />
      )}
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

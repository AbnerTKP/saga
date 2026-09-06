import { useEffect } from 'react';
import { Icon } from './Icon';

/**
 * Abre uma imagem em tamanho grande por cima de tudo. Serve ao GIF do chat e à foto de
 * perfil de quem está na call — em ambos, a versão pequena não deixa ver o que interessa.
 *
 * A imagem aparece inteira, sem corte: aqui o objetivo é ver, não enquadrar.
 */
export function VerImagem({ url, legenda, onClose }: {
  url: string;
  legenda?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onClose]);

  return (
    <div className="modal-back ver-imagem" onClick={onClose}>
      <button className="icon ver-imagem-fechar" title="Fechar" onClick={onClose}>
        <Icon name="close" />
      </button>
      {/* O clique na própria imagem não fecha: dá para arrastar para outro app sem sumir. */}
      <img src={url} alt={legenda ?? ''} onClick={(e) => e.stopPropagation()} />
      {legenda && <div className="ver-imagem-legenda">{legenda}</div>}
    </div>
  );
}

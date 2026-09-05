import { useEffect, useState } from 'react';
import { Icon } from './Icon';

/**
 * Mostra o registro para a pessoa poder copiar e mandar a quem vai ajudar. Existe
 * também na tela de entrada, de propósito: o erro mais difícil de investigar é o que
 * impede de entrar, e aí não daria para chegar até aqui de dentro do app.
 */
export function RegistroDeErros({ onClose }: { onClose: () => void }) {
  const [texto, setTexto] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => { window.desktop.lerRegistro().then(setTexto).catch(() => setTexto('')); }, []);

  const copiar = async () => {
    await window.desktop.copiarRegistro(texto ?? '');
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal painel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="strong">Registro de erros</span>
          <button className="icon" onClick={onClose}><Icon name="close" /></button>
        </div>

        <div className="painel-bloco">
          <p className="muted small">
            Copie e mande para quem for ajudar. Senhas e crachás de sessão são removidos antes
            de gravar, então dá para compartilhar sem medo.
          </p>
          <div className="linha-campo">
            <button onClick={copiar} disabled={!texto}>{copiado ? 'Copiado!' : 'Copiar tudo'}</button>
            <button onClick={() => window.desktop.abrirPastaDoRegistro()}>Abrir a pasta</button>
          </div>
        </div>

        <div className="painel-bloco registro-corpo">
          {texto === null && <p className="muted small">Lendo…</p>}
          {texto === '' && <p className="muted small">Nada registrado ainda — o que é uma boa notícia.</p>}
          {texto && <pre className="registro">{texto}</pre>}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import type { UpdateState } from '../desktop';

export function UpdateToast() {
  const [u, setU] = useState<UpdateState | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const aplicar = (s: UpdateState) =>
      setU((prev) => ({ ...(prev ?? { version: '' }), ...s, version: s.version || prev?.version || '' }));
    // Pergunta o que já foi anunciado antes deste componente existir, e só então escuta.
    window.desktop.updateAtual().then((s) => { if (s) aplicar(s); });
    window.desktop.onUpdate(aplicar);
  }, []);

  if (!u || hidden) return null;

  return (
    <div className="toast">
      {u.ready ? (
        <>
          <span>Versão {u.version} pronta.</span>
          <button className="primary sm" onClick={() => window.desktop.installUpdate()}>Reiniciar e atualizar</button>
        </>
      ) : u.url ? (
        <>
          <span>Versão {u.version} disponível.</span>
          <button className="primary sm" onClick={() => window.desktop.openExternal(u.url!)}>Baixar</button>
        </>
      ) : (
        <span>Baixando versão {u.version}… {u.progress ?? 0}%</span>
      )}
      <button className="link" onClick={() => setHidden(true)}>depois</button>
    </div>
  );
}

import { useEffect, useState } from 'react';

/** Marca discreta no canto, para saber qual versão está rodando sem abrir nada. */
export function Versao() {
  const [v, setV] = useState('');
  useEffect(() => { window.desktop.version().then(setV).catch(() => setV('')); }, []);
  if (!v) return null;
  return <span className="marca-versao" aria-label={`versão ${v}`}>v{v}</span>;
}

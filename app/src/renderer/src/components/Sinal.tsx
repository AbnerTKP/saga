import { useEffect, useState } from 'react';
import type { ConnectionQuality } from 'livekit-client';
import { medirPing } from '../api';
import { corDe, barrasDe, COMO_SE_LE, type Qualidade } from '../sinal';

// Mede de vez em quando, não o tempo todo: é informativo, e bater no servidor a cada
// segundo gastaria bateria e banda para mostrar um número que quase não muda.
const INTERVALO = 20_000;

export function Sinal({ qualidade }: { qualidade: ConnectionQuality }) {
  const [ping, setPing] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    const medir = () => medirPing().then((p) => { if (vivo) setPing(p); });
    medir();
    const id = setInterval(medir, INTERVALO);
    return () => { vivo = false; clearInterval(id); };
  }, []);

  const cor = corDe(qualidade as Qualidade, ping);
  const barras = barrasDe(cor);
  const titulo = ping === null
    ? `Sinal — ${COMO_SE_LE[cor]}`
    : `${ping} ms — ${COMO_SE_LE[cor]}`;

  return (
    // Mede de novo ao passar o mouse: é quando alguém quer o número atual.
    <span
      className={`sinal ${cor}`}
      title={titulo}
      onMouseEnter={() => medirPing().then(setPing)}
      aria-label={titulo}
    >
      <svg viewBox="0 0 14 12" width="14" height="12" aria-hidden="true">
        <rect x="0"  y="8" width="3" height="4"  rx="1" opacity={barras >= 1 ? 1 : 0.25} />
        <rect x="5"  y="5" width="3" height="7"  rx="1" opacity={barras >= 2 ? 1 : 0.25} />
        <rect x="10" y="1" width="3" height="11" rx="1" opacity={barras >= 3 ? 1 : 0.25} />
      </svg>
    </span>
  );
}

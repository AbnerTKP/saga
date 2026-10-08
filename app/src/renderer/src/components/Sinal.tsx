import { useEffect, useRef, useState } from 'react';
import type { ConnectionQuality, Room } from 'livekit-client';
import { corDe, barrasDe, COMO_SE_LE, type Qualidade } from '../sinal';
import { useConexao } from '../useConexao';
import { CartaoDaConexao } from './CartaoDaConexao';

/** Como no cartão da live: 60 ms só evitam acender com o mouse de passagem. */
const ABRIR_MS = 60;
/** O tempo de levar o mouse das barrinhas ao cartão sem ele sumir no caminho. */
const FECHAR_MS = 150;

/**
 * As barrinhas da voz e, ao passar o mouse, o cartão da conexão. A cor sai do ping da VOZ
 * quando ele existe (ver `conexao.ts`), e do tempo do servidor enquanto ele não chega.
 */
export function Sinal({ room, qualidade }: { room: Room; qualidade: ConnectionQuality }) {
  const [aberto, setAberto] = useState(false);
  const { resumo, servidor } = useConexao(room, aberto);
  const ancora = useRef<HTMLSpanElement>(null);
  const relogio = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(relogio.current), []);

  const marcar = (valor: boolean, ms: number) => {
    window.clearTimeout(relogio.current);
    relogio.current = window.setTimeout(() => setAberto(valor), ms);
  };

  const ping = resumo.agora ?? servidor;
  const cor = corDe(qualidade as Qualidade, ping);
  const barras = barrasDe(cor);
  const rotulo = ping === null ? `Sinal — ${COMO_SE_LE[cor]}` : `${ping} ms — ${COMO_SE_LE[cor]}`;

  return (
    // `title=""` cala o "Voltar para a call" do botão de fora, que nasceria por cima do
    // cartão um segundo depois.
    <span ref={ancora} className={`sinal ${cor}`} title="" aria-label={rotulo}
      onMouseEnter={() => marcar(true, aberto ? 0 : ABRIR_MS)} onMouseLeave={() => marcar(false, FECHAR_MS)}>
      <svg viewBox="0 0 14 12" width="14" height="12" aria-hidden="true">
        <rect x="0"  y="8" width="3" height="4"  rx="1" opacity={barras >= 1 ? 1 : 0.25} />
        <rect x="5"  y="5" width="3" height="7"  rx="1" opacity={barras >= 2 ? 1 : 0.25} />
        <rect x="10" y="1" width="3" height="11" rx="1" opacity={barras >= 3 ? 1 : 0.25} />
      </svg>
      {aberto && ancora.current && (
        <CartaoDaConexao ancora={ancora.current} cor={cor} resumo={resumo} servidor={servidor}
          onManter={() => window.clearTimeout(relogio.current)} onSoltar={() => marcar(false, FECHAR_MS)} />
      )}
    </span>
  );
}

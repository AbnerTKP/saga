import { useEffect, useState } from 'react';
import { Track, type Room } from 'livekit-client';
import { medirPing } from './api';
import { INTERVALO_MS, guardar, lerEstatisticas, resumir, type Amostra } from './conexao';

/** O pedido ao servidor vai de 20 em 20 s com o cartão fechado, e de 4 em 4 com ele aberto. */
const SERVIDOR_FECHADO_MS = 20_000;
const SERVIDOR_ABERTO_MS = 4000;

/**
 * As estatísticas de onde dá para tirar o ping da voz: as do seu microfone e, sem ele
 * (permissão negada, aparelho nenhum), as de quem você está ouvindo. As duas conexões vão
 * ao mesmo servidor de voz, então o ida e volta é o mesmo.
 */
async function estatisticas(room: Room): Promise<RTCStatsReport | null> {
  const mic = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
  const sender = (mic as { sender?: RTCRtpSender } | undefined)?.sender;
  if (sender) return sender.getStats();
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.audioTrackPublications.values()) {
      const receiver = (pub.track as { receiver?: RTCRtpReceiver } | undefined)?.receiver;
      if (receiver) return receiver.getStats();
    }
  }
  return null;
}

/**
 * Mede a conexão enquanto a call está de pé: o ping da voz a cada 2 s (de graça, nas
 * estatísticas do WebRTC; ver `conexao.ts`) e o tempo do servidor de vez em quando. Começa
 * vazio a cada call — quem usa só existe com a voz conectada.
 */
export function useConexao(room: Room, aberto: boolean) {
  const [historico, setHistorico] = useState<Amostra[]>([]);
  const [servidor, setServidor] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    const medir = () => estatisticas(room)
      .then((r) => r ? lerEstatisticas(r) : { rtt: null, enviados: null, perdidos: null })
      .catch(() => ({ rtt: null, enviados: null, perdidos: null }))
      .then((l) => { if (vivo) setHistorico((h) => guardar(h, l)); });
    medir();
    const id = setInterval(medir, INTERVALO_MS);
    return () => { vivo = false; clearInterval(id); };
  }, [room]);

  useEffect(() => {
    let vivo = true;
    const medir = () => medirPing().then((p) => { if (vivo) setServidor(p); });
    // Abrir o cartão mede na hora: é quando alguém quer o número atual.
    medir();
    const id = setInterval(medir, aberto ? SERVIDOR_ABERTO_MS : SERVIDOR_FECHADO_MS);
    return () => { vivo = false; clearInterval(id); };
  }, [aberto]);

  return { resumo: resumir(historico), servidor };
}

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  Participant,
  VideoPresets,
  type LocalParticipant,
} from 'livekit-client';

export type ChatMessage = { id: string; from: string; text: string; ts: number; mine: boolean };
export type Tile = { key: string; participant: Participant; track: Track; source: Track.Source; local: boolean };
export type Status = 'idle' | 'connecting' | 'connected' | 'reconnecting';

let audioRoot: HTMLDivElement | null = null;
function getAudioRoot() {
  if (!audioRoot) {
    audioRoot = document.createElement('div');
    audioRoot.id = 'audio-root';
    document.body.appendChild(audioRoot);
  }
  return audioRoot;
}

// Quanto esperar o servidor de voz antes de desistir. Sem um limite, uma rede que
// engole a porta 7880 deixa o app em "conectando" para sempre: as salas ficam
// desabilitadas e nada é dito, que por fora parece o clique não ter funcionado.
const LIMITE_DE_CONEXAO = 20_000;

function comLimite<T>(promessa: Promise<T>, ms: number, aviso: string): Promise<T> {
  let id: ReturnType<typeof setTimeout>;
  const limite = new Promise<never>((_, reject) => {
    id = setTimeout(() => reject(new Error(aviso)), ms);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(id)) as Promise<T>;
}

export function useRoom() {
  const roomRef = useRef<Room | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [status, setStatus] = useState<Status>('idle');
  const [roomName, setRoomName] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [deafened, setDeafenedState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deafenedRef = useRef(false);
  const micBeforeDeafen = useRef(true);

  const room = useMemo(() => {
    const r = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    roomRef.current = r;
    return r;
  }, []);

  useEffect(() => {
    const onSubscribed = (track: Track) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach() as HTMLMediaElement;
        el.muted = deafenedRef.current;
        getAudioRoot().appendChild(el);
      }
      bump();
    };
    const onUnsubscribed = (track: Track) => {
      track.detach().forEach((el) => el.remove());
      bump();
    };
    const onData = (payload: Uint8Array, participant?: Participant, _k?: unknown, topic?: string) => {
      if (topic !== 'chat') return;
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload)) as { text: string; ts: number };
        setMessages((m) => [
          ...m.slice(-499),
          { id: `${msg.ts}-${participant?.identity}`, from: participant?.name || participant?.identity || '?', text: msg.text, ts: msg.ts, mine: false },
        ]);
      } catch { /* ignora */ }
    };
    const onDisconnected = () => {
      getAudioRoot().innerHTML = '';
      setStatus('idle');
      setRoomName(null);
      setMessages([]);
      bump();
    };
    const onError = (e: Error) => setError(e.message);

    room
      .on(RoomEvent.TrackSubscribed, onSubscribed)
      .on(RoomEvent.TrackUnsubscribed, onUnsubscribed)
      .on(RoomEvent.DataReceived, onData)
      .on(RoomEvent.Disconnected, onDisconnected)
      .on(RoomEvent.Reconnecting, () => setStatus('reconnecting'))
      .on(RoomEvent.Reconnected, () => setStatus('connected'))
      .on(RoomEvent.ParticipantConnected, bump)
      .on(RoomEvent.ParticipantDisconnected, bump)
      .on(RoomEvent.ActiveSpeakersChanged, bump)
      .on(RoomEvent.TrackMuted, bump)
      .on(RoomEvent.TrackUnmuted, bump)
      .on(RoomEvent.TrackPublished, bump)
      .on(RoomEvent.TrackUnpublished, bump)
      .on(RoomEvent.LocalTrackPublished, bump)
      .on(RoomEvent.LocalTrackUnpublished, bump)
      .on(RoomEvent.ConnectionQualityChanged, bump)
      .on(RoomEvent.MediaDevicesError, onError);

    return () => {
      room.removeAllListeners();
    };
  }, [room]);

  const join = useCallback(async (url: string, token: string, name: string) => {
    setError(null);
    if (room.state !== 'disconnected') await room.disconnect();
    setStatus('connecting');
    try {
      await comLimite(
        room.connect(url, token),
        LIMITE_DE_CONEXAO,
        `O servidor de voz (${url}) não respondeu em ${LIMITE_DE_CONEXAO / 1000}s. ` +
          'A rede pode estar bloqueando essa porta — tente por outra rede, por exemplo o 4G do celular.',
      );
      setRoomName(name);
      setStatus('connected');
      await room.startAudio().catch(() => undefined);
      if (!deafenedRef.current) {
        await room.localParticipant.setMicrophoneEnabled(true).catch((e: Error) => setError(`Microfone: ${e.message}`));
      }
    } catch (e) {
      // Se o tempo estourou, a tentativa pode continuar viva por baixo; derruba antes
      // de voltar para 'idle', senão a próxima entrada encontra a sala num estado sujo.
      await room.disconnect().catch(() => undefined);
      setStatus('idle');
      setError(`Não conectou: ${(e as Error).message}`);
      throw e;
    }
  }, [room]);

  const leave = useCallback(async () => {
    await room.disconnect();
  }, [room]);

  const lp = (): LocalParticipant => room.localParticipant;

  const toggleMic = useCallback(async () => {
    if (deafenedRef.current) return;
    await lp().setMicrophoneEnabled(!lp().isMicrophoneEnabled).catch((e: Error) => setError(`Microfone: ${e.message}`));
    bump();
  }, [room]);

  const toggleCam = useCallback(async () => {
    await lp().setCameraEnabled(!lp().isCameraEnabled).catch((e: Error) => setError(`Câmera: ${e.message}`));
    bump();
  }, [room]);

  const startScreen = useCallback(async (sourceId: string, audio: boolean) => {
    setError(null);
    const opts = { resolution: { width: 1920, height: 1080, frameRate: 15 } };
    await window.desktop.chooseSource(sourceId, audio);
    try {
      await lp().setScreenShareEnabled(true, { ...opts, audio });
    } catch (e) {
      if (!audio) throw e;
      // sem áudio do sistema neste computador: tenta só o vídeo
      await window.desktop.chooseSource(sourceId, false);
      await lp().setScreenShareEnabled(true, { ...opts, audio: false });
      setError('Compartilhando sem o áudio do sistema (não disponível neste computador).');
    }
    bump();
  }, [room]);

  const stopScreen = useCallback(async () => {
    await lp().setScreenShareEnabled(false);
    bump();
  }, [room]);

  const toggleDeafen = useCallback(async () => {
    const next = !deafenedRef.current;
    deafenedRef.current = next;
    setDeafenedState(next);
    getAudioRoot().querySelectorAll('audio').forEach((el) => { el.muted = next; });
    if (room.state === 'connected') {
      if (next) {
        micBeforeDeafen.current = lp().isMicrophoneEnabled;
        await lp().setMicrophoneEnabled(false);
      } else if (micBeforeDeafen.current) {
        await lp().setMicrophoneEnabled(true);
      }
    }
    bump();
  }, [room]);

  const sendMessage = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || room.state !== 'connected') return;
    const ts = Date.now();
    await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ text: t, ts })), { reliable: true, topic: 'chat' });
    setMessages((m) => [...m.slice(-499), { id: `${ts}-me`, from: room.localParticipant.name || 'você', text: t, ts, mine: true }]);
  }, [room]);

  const participants: Participant[] = status === 'idle' ? [] : [room.localParticipant, ...room.remoteParticipants.values()];

  const tiles: Tile[] = [];
  for (const p of participants) {
    for (const pub of p.trackPublications.values()) {
      if (pub.kind !== Track.Kind.Video || !pub.track || pub.isMuted) continue;
      tiles.push({ key: pub.trackSid, participant: p, track: pub.track, source: pub.source, local: p === room.localParticipant });
    }
  }

  return {
    room, status, roomName, error, setError, messages, participants, tiles, deafened,
    micOn: status !== 'idle' && room.localParticipant.isMicrophoneEnabled,
    camOn: status !== 'idle' && room.localParticipant.isCameraEnabled,
    screenOn: status !== 'idle' && room.localParticipant.isScreenShareEnabled,
    join, leave, toggleMic, toggleCam, startScreen, stopScreen, toggleDeafen, sendMessage,
  };
}

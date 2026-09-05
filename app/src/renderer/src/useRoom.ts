import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { anotar } from './registro';
import { explicarFalhaDeAudio } from './erros';
import {
  Room,
  RoomEvent,
  Track,
  Participant,
  VideoPresets,
  VideoPreset,
  type LocalParticipant,
  type ScreenShareCaptureOptions,
  type TrackPublishOptions,
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

// Qualidades oferecidas para transmitir. O bitrate acompanha resolução e quadros: dobrar
// os quadros sem subir o teto só trocaria travamento por borrão.
export const QUALIDADES = {
  '720p30':  new VideoPreset(1280, 720, 2_500_000, 30, 'medium'),
  '1080p30': new VideoPreset(1920, 1080, 5_000_000, 30, 'medium'),
  '720p60':  new VideoPreset(1280, 720, 4_000_000, 60, 'medium'),
  '1080p60': new VideoPreset(1920, 1080, 8_000_000, 60, 'medium'),
} as const;

export type Qualidade = keyof typeof QUALIDADES;
export const QUALIDADE_PADRAO: Qualidade = '1080p60';

const CHAVE_QUALIDADE = 'cantinho.qualidade';

export function lerQualidade(): Qualidade {
  try {
    const v = localStorage.getItem(CHAVE_QUALIDADE);
    if (v && v in QUALIDADES) return v as Qualidade;
  } catch { /* sem storage */ }
  return QUALIDADE_PADRAO;
}

export function guardarQualidade(q: Qualidade) {
  try { localStorage.setItem(CHAVE_QUALIDADE, q); } catch { /* sem storage */ }
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

  // Soundboard. O som vai para a sala numa faixa própria, e não misturado ao microfone:
  // assim tocar não depende de estar com o microfone ligado, e mutar alguém não muta os
  // sons dele. A faixa é publicada uma vez e reaproveitada.
  const audio = useRef<AudioContext | null>(null);
  const destinoDoSom = useRef<MediaStreamAudioDestinationNode | null>(null);
  const faixaDoSom = useRef<MediaStreamTrack | null>(null);
  const buffers = useRef(new Map<string, AudioBuffer>());

  // Volume por pessoa. Aplicado nos elementos de áudio que nós mesmos criamos, e não pelo
  // setVolume do LiveKit: aquele só alcança microfone e áudio de tela, e deixaria o
  // soundboard de fora, que anda numa faixa própria.
  const volumes = useRef(new Map<string, number>());

  // Volume de cada transmissão, separado da voz e separado entre si: dá para baixar o
  // filme de um sem mexer no de outro, nem em quem está comentando.
  const volumesDaTela = useRef(new Map<string, number>());
  const [, redesenharVolumes] = useReducer((x: number) => x + 1, 0);

  // Só a transmissão em foco é ouvida. Com duas pessoas compartilhando, ouvir as duas ao
  // mesmo tempo seria uma sopa; quem manda é qual está em destaque no palco.
  const focoDaTela = useRef<string | null>(null);

  /**
   * Decide volume e mudo de cada elemento de áudio. Um lugar só: antes, cada ajuste
   * (surdez, volume da pessoa, foco) mexia num pedaço e eles se atropelavam.
   */
  const aplicarAudio = useCallback(() => {
    getAudioRoot().querySelectorAll<HTMLMediaElement>('audio').forEach((el) => {
      const identity = el.dataset.identity ?? '';
      const ehTela = el.dataset.source === Track.Source.ScreenShareAudio;
      if (ehTela) {
        el.volume = volumesDaTela.current.get(identity) ?? 1;
        el.muted = deafenedRef.current || (!!focoDaTela.current && identity !== focoDaTela.current);
      } else {
        el.volume = volumes.current.get(identity) ?? 1;
        el.muted = deafenedRef.current;
      }
    });
  }, []);

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
    const onSubscribed = (track: Track, _pub: unknown, participante: Participant) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach() as HTMLMediaElement;
        el.dataset.identity = participante.identity;
        el.dataset.source = track.source;
        getAudioRoot().appendChild(el);
        aplicarAudio();
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
      // A publicação morre junto com a sala; a próxima entrada publica de novo.
      faixaDoSom.current = null;
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
  }, [room, aplicarAudio]);

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

  // sourceId nulo = o macOS vai perguntar qual janela; não há fonte para reservar.
  const startScreen = useCallback(async (sourceId: string | null, audio: boolean) => {
    setError(null);
    const preset = QUALIDADES[lerQualidade()];
    const captura: ScreenShareCaptureOptions = {
      resolution: preset.resolution,
      // 'motion' avisa o codificador que ali corre vídeo. Sem isso ele assume texto e
      // protege a nitidez sacrificando quadros — que é exatamente o travamento em filme.
      contentHint: 'motion',
      audio,
    };
    const publicacao: TrackPublishOptions = {
      screenShareEncoding: preset.encoding,
      // Se a banda apertar, prefira borrar a imagem a perder fluidez.
      degradationPreference: 'maintain-framerate',
      // Sem simulcast. Com ele, o LiveKit publica versões menores da tela, e o
      // adaptiveStream de quem assiste escolhe a menor sempre que a janela do vídeo é
      // menor que a tela transmitida — o que é quase sempre. Era essa a imagem borrada.
      simulcast: false,
    };
    if (sourceId) await window.desktop.chooseSource(sourceId, audio);
    try {
      await lp().setScreenShareEnabled(true, captura, publicacao);
    } catch (e) {
      const motivo = (e as Error).message || String(e);
      // O erro real precisa ir para o registro. Antes ele era descartado aqui, e toda
      // falha — fosse ela qual fosse — virava "áudio não disponível neste computador",
      // o que mandava a pessoa investigar o lugar errado.
      anotar('erro', 'tela', `falhou com áudio=${audio}: ${motivo}`);

      // A captura do áudio do sistema depende do dispositivo de SAÍDA padrão. Listar o
      // que existe na máquina distingue "não tem saída definida" de "tem, mas recusou" —
      // e são conselhos opostos.
      if (audio) {
        navigator.mediaDevices.enumerateDevices()
          .then((ds) => {
            const saidas = ds.filter((d) => d.kind === 'audiooutput');
            anotar('info', 'tela', saidas.length
              ? `saídas de áudio: ${saidas.map((d) => `${d.deviceId === 'default' ? '[padrão] ' : ''}${d.label || '(sem nome)'}`).join(' | ')}`
              : 'nenhuma saída de áudio encontrada nesta máquina');
          })
          .catch((e) => anotar('info', 'tela', `não consegui listar as saídas: ${(e as Error).message}`));
      }

      if (!audio) {
        setError(`Não consegui compartilhar: ${motivo}`);
        throw e;
      }

      // Segunda tentativa sem o áudio do sistema. Se esta passar, o problema era mesmo
      // o áudio; se falhar também, o problema é outro e a mensagem diz qual.
      try {
        if (sourceId) await window.desktop.chooseSource(sourceId, false);
        await lp().setScreenShareEnabled(true, { ...captura, audio: false }, publicacao);
        setError(explicarFalhaDeAudio(motivo));
      } catch (e2) {
        const motivo2 = (e2 as Error).message || String(e2);
        anotar('erro', 'tela', `falhou também sem áudio: ${motivo2}`);
        setError(`Não consegui compartilhar: ${motivo2}`);
        throw e2;
      }
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
    aplicarAudio();
    if (room.state === 'connected') {
      if (next) {
        micBeforeDeafen.current = lp().isMicrophoneEnabled;
        await lp().setMicrophoneEnabled(false);
      } else if (micBeforeDeafen.current) {
        await lp().setMicrophoneEnabled(true);
      }
    }
    bump();
  }, [room, aplicarAudio]);

  /** Toca um som para todo mundo da sala, e também nos alto-falantes de quem tocou. */
  const tocarSom = useCallback(async (url: string) => {
    if (room.state !== 'connected') {
      setError('Entre numa sala antes de tocar um som.');
      return;
    }
    try {
      if (!audio.current) audio.current = new AudioContext();
      // O navegador começa o contexto suspenso até haver um gesto do usuário.
      if (audio.current.state === 'suspended') await audio.current.resume();
      if (!destinoDoSom.current) destinoDoSom.current = audio.current.createMediaStreamDestination();

      if (!faixaDoSom.current) {
        const faixa = destinoDoSom.current.stream.getAudioTracks()[0];
        // dtx cortaria o silêncio e, com ele, o comecinho de cada som.
        await room.localParticipant.publishTrack(faixa, {
          source: Track.Source.Unknown, name: 'soundboard', dtx: false,
        });
        faixaDoSom.current = faixa;
      }

      let buffer = buffers.current.get(url);
      if (!buffer) {
        const resposta = await fetch(url);
        if (!resposta.ok) throw new Error(`não consegui baixar o som (${resposta.status})`);
        buffer = await audio.current.decodeAudioData(await resposta.arrayBuffer());
        buffers.current.set(url, buffer);   // o nome do arquivo é o hash: nunca desatualiza
      }

      const fonte = audio.current.createBufferSource();
      fonte.buffer = buffer;
      fonte.connect(destinoDoSom.current);       // para a sala
      fonte.connect(audio.current.destination);  // e para quem tocou
      fonte.start();
    } catch (e) {
      setError(`Som: ${(e as Error).message}`);
    }
  }, [room]);

  const volumeDe = useCallback((identity: string) => volumes.current.get(identity) ?? 1, []);

  const definirVolume = useCallback((identity: string, valor: number) => {
    volumes.current.set(identity, Math.min(1.5, Math.max(0, valor)));
    aplicarAudio();
    bump();
  }, [aplicarAudio]);

  const volumeDaTelaDe = useCallback((identity: string) => volumesDaTela.current.get(identity) ?? 1, []);

  const definirVolumeDaTela = useCallback((identity: string, valor: number) => {
    volumesDaTela.current.set(identity, Math.min(1.5, Math.max(0, valor)));
    aplicarAudio();
    redesenharVolumes();
  }, [aplicarAudio]);

  /** Quem está em destaque no palco; só o áudio dessa transmissão é ouvido. */
  const definirFocoDaTela = useCallback((identity: string | null) => {
    if (focoDaTela.current === identity) return;
    focoDaTela.current = identity;
    aplicarAudio();
  }, [aplicarAudio]);

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
    join, leave, toggleMic, toggleCam, startScreen, stopScreen, toggleDeafen, sendMessage, tocarSom, volumeDe, definirVolume,
    volumeDaTelaDe, definirVolumeDaTela, definirFocoDaTela,
  };
}

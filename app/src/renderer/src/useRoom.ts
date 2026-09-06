import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { anotar } from './registro';
import { explicarFalhaDeAudio, explicarTelaMuda, pareceMixagemDoSistema } from './erros';
import { VOLUME } from './volume';
import { qualidadeValida, type Qualidade } from './qualidades';
import { criarAvisos } from './avisos';
import type { TipoDeAviso } from './avisosDeTela';
import { ARQUIVOS } from './sons';

type ModoDeAudio = 'nao' | 'loopback' | 'loopbackWithMute';
import {
  Room,
  RoomEvent,
  Track,
  Participant,
  VideoPresets,
  VideoPreset,
  type LocalParticipant,
  type RemoteTrackPublication,
  type ScreenShareCaptureOptions,
  type TrackPublishOptions,
} from 'livekit-client';

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

// O bitrate acompanha resolução e quadros: dobrar os quadros sem subir o teto só trocaria
// travamento por borrão. Quem alcança cada uma é decidido em qualidades.ts.
export const QUALIDADES = {
  '720p30':  new VideoPreset(1280, 720, 2_500_000, 30, 'medium'),
  '1080p30': new VideoPreset(1920, 1080, 5_000_000, 30, 'medium'),
  '720p60':  new VideoPreset(1280, 720, 4_000_000, 60, 'medium'),
  '1080p60': new VideoPreset(1920, 1080, 8_000_000, 60, 'medium'),
} as const;

const CHAVE_QUALIDADE = 'cantinho.qualidade';

/** O que está guardado, sem julgar: quem decide o que vale é qualidadeValida. */
export function lerQualidadeGuardada(): unknown {
  try { return localStorage.getItem(CHAVE_QUALIDADE); } catch { return null; }
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

/** Recebe se a pessoa é Turbo porque a qualidade de transmissão depende disso. */
export function useRoom(souTurbo = false) {
  const roomRef = useRef<Room | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [status, setStatus] = useState<Status>('idle');
  const [roomName, setRoomName] = useState<string | null>(null);
  const [deafened, setDeafenedState] = useState(false);
  const [error, setErrorCru] = useState<string | null>(null);
  // Nem tudo que a sala tem a dizer é falha: "compartilhando sem o áudio do sistema" é
  // aviso, e pintá-lo de vermelho faz parecer que o compartilhamento não funcionou.
  const [tipoDoAviso, setTipoDoAviso] = useState<TipoDeAviso>('erro');
  const setError = useCallback((texto: string | null) => {
    setTipoDoAviso('erro');
    setErrorCru(texto);
  }, []);
  const avisar = useCallback((tipo: TipoDeAviso, texto: string) => {
    setTipoDoAviso(tipo);
    setErrorCru(texto);
  }, []);
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

  // Quem não quer ver transmissão nenhuma. Não basta esconder: desinscrever para de
  // receber o vídeo, que é onde está o peso — esconder gastaria a banda do mesmo jeito.
  const [semTransmissoes, setSemTransmissoes] = useState(false);

  // Faixa do plano B do áudio da transmissão, publicada por fora do LiveKit.
  const faixaDeMixagem = useRef<MediaStreamTrack | null>(null);

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
      // Um elemento problemático não pode derrubar a tela inteira. Já derrubou: um volume
      // acima de 1 lançava exceção aqui dentro de um efeito do React, e a janela ficava
      // cinza. Ajustar áudio é acessório; ficar sem o app, não.
      try {
        const identity = el.dataset.identity ?? '';
        const ehTela = el.dataset.source === Track.Source.ScreenShareAudio;
        const guardado = (ehTela ? volumesDaTela : volumes).current.get(identity) ?? 1;
        el.volume = VOLUME(guardado);
        el.muted = ehTela
          ? deafenedRef.current || (!!focoDaTela.current && identity !== focoDaTela.current)
          : deafenedRef.current;
      } catch (e) {
        anotar('erro', 'audio', e);
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

  // Um por sala, criado uma vez: é ele que guarda quando cada aviso tocou pela última vez.
  const tocarAviso = useMemo(() => criarAvisos(ARQUIVOS), []);

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
    const onDisconnected = () => {
      // A publicação morre junto com a sala; a próxima entrada publica de novo.
      faixaDoSom.current = null;
      getAudioRoot().innerHTML = '';
      setStatus('idle');
      setRoomName(null);
      bump();
    };
    const onError = (e: Error) => setError(e.message);

    room
      .on(RoomEvent.TrackSubscribed, onSubscribed)
      .on(RoomEvent.TrackUnsubscribed, onUnsubscribed)
      .on(RoomEvent.Disconnected, onDisconnected)
      .on(RoomEvent.Reconnecting, () => setStatus('reconnecting'))
      .on(RoomEvent.Reconnected, () => setStatus('connected'))
      .on(RoomEvent.ParticipantConnected, () => { tocarAviso('entrou', deafenedRef.current); bump(); })
      .on(RoomEvent.ParticipantDisconnected, () => { tocarAviso('saiu', deafenedRef.current); bump(); })
      .on(RoomEvent.ActiveSpeakersChanged, bump)
      .on(RoomEvent.TrackMuted, bump)
      .on(RoomEvent.TrackUnmuted, bump)
      .on(RoomEvent.TrackPublished, (pub: RemoteTrackPublication) => {
        if (pub.source === Track.Source.ScreenShare) tocarAviso('live', deafenedRef.current);
        bump();
      })
      .on(RoomEvent.TrackUnpublished, bump)
      .on(RoomEvent.LocalTrackPublished, bump)
      .on(RoomEvent.LocalTrackUnpublished, bump)
      .on(RoomEvent.ConnectionQualityChanged, bump)
      .on(RoomEvent.MediaDevicesError, onError);

    return () => {
      room.removeAllListeners();
    };
  }, [room, aplicarAudio, tocarAviso]);

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
      // Quem entra também ouve: é o retorno de que a sala pegou de verdade.
      tocarAviso('entrou', deafenedRef.current);
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
  }, [room, tocarAviso]);

  const leave = useCallback(async () => {
    tocarAviso('saiu', deafenedRef.current);
    await room.disconnect();
  }, [room, tocarAviso]);

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
  /**
   * Plano B do áudio da transmissão. Publica como ScreenShareAudio, então do outro lado é
   * indistinguível do caminho normal — inclusive no volume e no foco.
   */
  const tentarMixagemDoSistema = useCallback(async (): Promise<boolean> => {
    try {
      const ds = await navigator.mediaDevices.enumerateDevices();
      const entradas = ds.filter((d) => d.kind === 'audioinput');
      anotar('info', 'tela', `entradas de áudio: ${entradas.map((d) => d.label || '(sem nome)').join(' | ') || 'nenhuma'}`);

      const mixagem = entradas.find((d) => pareceMixagemDoSistema(d.label));
      if (!mixagem) {
        anotar('info', 'tela', 'nenhuma entrada de mixagem do sistema nesta máquina');
        return false;
      }

      const fluxo = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: mixagem.deviceId },
          // Processamento de voz estragaria música e efeito: isto não é um microfone.
          echoCancellation: false, noiseSuppression: false, autoGainControl: false,
        },
      });
      const faixa = fluxo.getAudioTracks()[0];
      if (!faixa) return false;

      await lp().publishTrack(faixa, { source: Track.Source.ScreenShareAudio, dtx: false });
      faixaDeMixagem.current = faixa;
      anotar('info', 'tela', `áudio da transmissão indo pela entrada "${mixagem.label}"`);
      return true;
    } catch (e) {
      anotar('erro', 'tela', `mixagem do sistema falhou: ${(e as Error).message}`);
      return false;
    }
  }, [room]);

  const startScreen = useCallback(async (sourceId: string | null, audio: boolean) => {
    setError(null);
    const preset = QUALIDADES[qualidadeValida(lerQualidadeGuardada(), souTurbo)];
    const captura: ScreenShareCaptureOptions = {
      resolution: preset.resolution,
      // 'motion' avisa o codificador que ali corre vídeo. Sem isso ele assume texto e
      // protege a nitidez sacrificando quadros — que é exatamente o travamento em filme.
      contentHint: 'motion',
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

    // Os dois modos falham por motivos diferentes: quando a placa de som recusa o
    // 'loopback', o 'loopbackWithMute' às vezes passa. Só vale no Windows, onde nós
    // escolhemos a fonte; no Mac quem resolve o áudio é o seletor do próprio sistema.
    const modos: ModoDeAudio[] = !audio ? ['nao']
      : sourceId && window.desktop.platform === 'win32' ? ['loopback', 'loopbackWithMute', 'nao']
      : ['loopback', 'nao'];

    let ultimoMotivo = '';
    for (const modo of modos) {
      try {
        if (sourceId) await window.desktop.chooseSource(sourceId, modo);
        await lp().setScreenShareEnabled(true, { ...captura, audio: modo !== 'nao' }, publicacao);

        // Áudio recusado não lança erro: vira uma faixa morta, calada. É o que deixou o Mac
        // transmitindo mudo sem nada no registro. Quem sabe se veio ou não é a publicação.
        const veioAudio = !!lp().getTrackPublication(Track.Source.ScreenShareAudio);
        if (audio && modo !== 'nao' && !veioAudio) {
          anotar('aviso', 'tela', `modo "${modo}" foi aceito, mas nenhuma faixa de áudio foi publicada`);
          const permissao = await window.desktop.screenPermission().catch(() => 'unknown');
          avisar('aviso', explicarTelaMuda(window.desktop.platform, permissao));
        } else if (audio && veioAudio) {
          anotar('info', 'tela', `áudio da tela publicado no modo "${modo}"`);
        }

        if (modo === 'loopbackWithMute') {
          anotar('info', 'tela', 'áudio do sistema só passou no modo com silenciamento local');
          avisar('aviso', 'Compartilhando com o áudio, mas o Windows exigiu silenciar o som aqui no seu PC — os outros ouvem, você não. Foi o único jeito que sua placa de som aceitou.');
        } else if (modo === 'nao' && audio) {
          // O loopback do Chromium foi recusado. Tenta a porta dos fundos: capturar o
          // áudio da saída pela entrada "Mixagem estéreo", quando a máquina tiver uma.
          const pelaMixagem = await tentarMixagemDoSistema();
          avisar('aviso', pelaMixagem
            ? 'Compartilhando com o áudio pela "Mixagem estéreo", já que o caminho normal foi recusado por este computador.'
            : explicarFalhaDeAudio(ultimoMotivo));
        }
        bump();
        return;
      } catch (e) {
        ultimoMotivo = (e as Error).message || String(e);
        anotar('erro', 'tela', `modo "${modo}" falhou: ${ultimoMotivo}`);

        // A lista de saídas explica a maioria das recusas de áudio; sem áudio, não ajuda.
        if (modo === 'loopback') {
          navigator.mediaDevices.enumerateDevices()
            .then((ds) => {
              const saidas = ds.filter((d) => d.kind === 'audiooutput');
              anotar('info', 'tela', saidas.length
                ? `saídas de áudio: ${saidas.map((d) => `${d.deviceId === 'default' ? '[padrão] ' : ''}${d.label || '(sem nome)'}`).join(' | ')}`
                : 'nenhuma saída de áudio encontrada nesta máquina');
            })
            .catch(() => undefined);
        }
      }
    }

    // Nem sem áudio funcionou: aí o problema não era o áudio.
    setError(`Não consegui compartilhar: ${ultimoMotivo}`);
    throw new Error(ultimoMotivo);
  }, [room, souTurbo, avisar]);

  const stopScreen = useCallback(async () => {
    // A faixa de mixagem é nossa, publicada à parte: o LiveKit não a recolhe sozinho.
    if (faixaDeMixagem.current) {
      await lp().unpublishTrack(faixaDeMixagem.current, true).catch(() => undefined);
      faixaDeMixagem.current = null;
    }
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
      avisar('aviso', 'Entre numa sala antes de tocar um som.');
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
  }, [room, avisar]);

  /** Liga e desliga o recebimento das transmissões alheias. */
  const alternarTransmissoes = useCallback(() => {
    const novo = !semTransmissoes;
    setSemTransmissoes(novo);
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        if (pub.source === Track.Source.ScreenShare && 'setSubscribed' in pub) {
          (pub as { setSubscribed(v: boolean): void }).setSubscribed(!novo);
        }
      }
    }
    bump();
  }, [room, semTransmissoes]);

  const volumeDe = useCallback((identity: string) => volumes.current.get(identity) ?? 1, []);

  const definirVolume = useCallback((identity: string, valor: number) => {
    volumes.current.set(identity, VOLUME(valor));
    aplicarAudio();
    bump();
  }, [aplicarAudio]);

  const volumeDaTelaDe = useCallback((identity: string) => volumesDaTela.current.get(identity) ?? 1, []);

  const definirVolumeDaTela = useCallback((identity: string, valor: number) => {
    volumesDaTela.current.set(identity, VOLUME(valor));
    aplicarAudio();
    redesenharVolumes();
  }, [aplicarAudio]);

  /** Quem está em destaque no palco; só o áudio dessa transmissão é ouvido. */
  const definirFocoDaTela = useCallback((identity: string | null) => {
    if (focoDaTela.current === identity) return;
    focoDaTela.current = identity;
    aplicarAudio();
  }, [aplicarAudio]);

  const participants: Participant[] = status === 'idle' ? [] : [room.localParticipant, ...room.remoteParticipants.values()];

  const tiles: Tile[] = [];
  for (const p of participants) {
    for (const pub of p.trackPublications.values()) {
      if (pub.kind !== Track.Kind.Video || !pub.track || pub.isMuted) continue;
      if (semTransmissoes && pub.source === Track.Source.ScreenShare) continue;
      tiles.push({ key: pub.trackSid, participant: p, track: pub.track, source: pub.source, local: p === room.localParticipant });
    }
  }

  return {
    room, status, roomName, error, tipoDoAviso, setError, avisar, participants, tiles, deafened,
    micOn: status !== 'idle' && room.localParticipant.isMicrophoneEnabled,
    camOn: status !== 'idle' && room.localParticipant.isCameraEnabled,
    screenOn: status !== 'idle' && room.localParticipant.isScreenShareEnabled,
    join, leave, toggleMic, toggleCam, startScreen, stopScreen, toggleDeafen, tocarSom, volumeDe, definirVolume,
    semTransmissoes, alternarTransmissoes,
    volumeDaTelaDe, definirVolumeDaTela, definirFocoDaTela,
  };
}

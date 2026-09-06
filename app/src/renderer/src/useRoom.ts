import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { anotar } from './registro';
import { explicarFalhaDeAudio, explicarTelaMuda, pareceMixagemDoSistema } from './erros';
import { VOLUME } from './volume';
import { qualidadeValida, prioridadeDe, type Qualidade } from './qualidades';
import { criarAvisos } from './avisos';
import { mudo } from './audivel';
import type { TipoDeAviso } from './avisosDeTela';
import { ARQUIVOS } from './sons';

type ModoDeAudio = 'nao' | 'loopbackWithoutChrome' | 'loopback' | 'loopbackWithMute';

/** Captura sem o processamento de microfone, e em estéreo. Ver o comentário em startScreen. */
const SOM_DE_VERDADE: AudioCaptureOptions = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 2,
};
import {
  Room,
  RoomEvent,
  Track,
  Participant,
  VideoPresets,
  VideoPreset,
  type LocalParticipant,
  AudioPresets,
  type AudioCaptureOptions,
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
/**
 * `aoChegarAlguem` é chamado quando alguém entra na sala em que você está — é dali que
 * sai o aviso na tela. Vem de fora porque quem desenha aviso é o App, não este gancho.
 */
export function useRoom(souTurbo = false, aoChegarAlguem?: (nome: string) => void) {
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
  // Espelho em ref: aplicarAudio roda fora do ciclo do React — uma faixa que chega logo
  // depois do clique em "não assistir" seria julgada pelo valor velho e entraria tocando.
  const semTransmissoesRef = useRef(false);

  // Faixa do plano B do áudio da transmissão, publicada por fora do LiveKit.
  const faixaDeMixagem = useRef<MediaStreamTrack | null>(null);

  // Medições agendadas do que está saindo. Guardadas para poder cancelar: sem isso, uma
  // transmissão que acabou ainda anotaria no registro depois de encerrada.
  const medicoes = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Volume de cada transmissão, separado da voz e separado entre si: dá para baixar o
  // filme de um sem mexer no de outro, nem em quem está comentando.
  const volumesDaTela = useRef(new Map<string, number>());
  const [, redesenharVolumes] = useReducer((x: number) => x + 1, 0);

  // A live que está no palco — só ela é ouvida. Quem decide é o Stage; a regra de quem
  // cala mora em audivel.ts, testada.
  const liveNoPalco = useRef<string | null>(null);

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
        const ehLive = el.dataset.source === Track.Source.ScreenShareAudio;
        const guardado = (ehLive ? volumesDaTela : volumes).current.get(identity) ?? 1;
        el.volume = VOLUME(guardado);
        el.muted = mudo({ ehLive, identity }, {
          surdo: deafenedRef.current,
          semTransmissoes: semTransmissoesRef.current,
          liveNoPalco: liveNoPalco.current,
        });
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
        // A faixa é quem identifica o elemento na hora de tirá-lo; ver onUnsubscribed.
        el.dataset.sid = track.sid ?? '';
        getAudioRoot().appendChild(el);
        aplicarAudio();
      }
      bump();
    };
    const onUnsubscribed = (track: Track) => {
      // O `detach` sozinho não basta: medido, no momento do TrackUnsubscribed ele devolve
      // ZERO elementos — o LiveKit já esqueceu quais eram —, então o `<audio>` ficava na
      // página para sempre. Voltar a assistir criava outro, e a cada ida e volta sobrava
      // mais um. Por isso o elemento carrega o sid da faixa: é assim que se acha o dono.
      track.detach().forEach((el) => el.remove());
      if (track.sid) {
        getAudioRoot()
          .querySelectorAll(`audio[data-sid="${CSS.escape(track.sid)}"]`)
          .forEach((el) => el.remove());
      }
      bump();
    };
    const onDisconnected = () => {
      // A publicação morre junto com a sala; a próxima entrada publica de novo.
      medicoes.current.forEach(clearTimeout);
      medicoes.current = [];
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
      .on(RoomEvent.ParticipantConnected, (p: Participant) => {
        tocarAviso('entrou', deafenedRef.current);
        aoChegarAlguem?.(p.name || p.identity);
        bump();
      })
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
  }, [room, aplicarAudio, tocarAviso, aoChegarAlguem]);

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

  /**
   * Anota o que o codificador está mandando DE VERDADE, alguns segundos depois de começar.
   *
   * A resolução que sai não é a que se pediu: quando a cena pesa, o codificador entrega
   * menos do que o menu prometeu, e em silêncio. Sem esta linha no registro, "a imagem
   * está ruim" não tem como ser respondido — foi preciso montar uma sala de teste no
   * servidor de verdade para descobrir que saíam 960x540. Agora o registro de quem
   * transmite diz sozinho.
   *
   * Duas amostras: uma cedo, quando a banda ainda está subindo, e outra em regime.
   */
  const anotarComoEstaSaindo = useCallback((segundos: number) => {
    medicoes.current.push(setTimeout(() => {
      const faixa = lp().getTrackPublication(Track.Source.ScreenShare)?.videoTrack;
      const sender = (faixa as { sender?: RTCRtpSender } | undefined)?.sender;
      if (!sender) return;
      sender.getStats().then((stats) => {
        stats.forEach((s) => {
          const o = s as RTCStats & {
            kind?: string; frameWidth?: number; frameHeight?: number;
            framesPerSecond?: number; targetBitrate?: number; qualityLimitationReason?: string;
          };
          if (o.type !== 'outbound-rtp' || o.kind !== 'video') return;
          const cedendo = o.qualityLimitationReason && o.qualityLimitationReason !== 'none'
            ? `, cedendo por ${o.qualityLimitationReason}` : '';
          anotar('info', 'tela',
            `aos ${segundos}s saindo ${o.frameWidth ?? '?'}x${o.frameHeight ?? '?'} a `
            + `${Math.round(o.framesPerSecond ?? 0)} quadros, `
            + `${Math.round((o.targetBitrate ?? 0) / 1000)} kbps${cedendo}`);
        });
      }).catch(() => undefined);
    }, segundos * 1000));
  }, [room]);

  const pararMedicoes = useCallback(() => {
    medicoes.current.forEach(clearTimeout);
    medicoes.current = [];
  }, []);

  /**
   * O áudio da tela é SOM, não voz.
   *
   * Sem dizer isso, o Chromium entrega a captura com o processamento de microfone ligado:
   * ganho automático, cancelamento de eco e supressão de ruído, e ainda em mono. Medido
   * aqui: `{autoGainControl: true, echoCancellation: true, noiseSuppression: true,
   * channelCount: 1}`. Num filme, o ganho automático é justamente o que "estoura" — ele
   * empurra as partes altas para cima e bombeia. Era a queixa de som de cinema estourado.
   */
  const startScreen = useCallback(async (sourceId: string | null, audio: boolean) => {
    setError(null);
    const qualidade = qualidadeValida(lerQualidadeGuardada(), souTurbo);
    const preset = QUALIDADES[qualidade];

    // Quando a cena aperta, alguma coisa cede — e quem diz o quê é a escolha da pessoa.
    // Ver prioridadeDe, em qualidades.ts, para o que foi medido. Em resumo: 'motion'
    // deixa o codificador jogar fora resolução para segurar os quadros (era a imagem de
    // 360p), e 'detail' põe o codificador em modo de tela, onde a resolução é intocável
    // e os quadros é que cedem. A degradationPreference diz o mesmo pela porta da frente:
    // no modo de tela ela é ignorada, mas em 'motion' é ela que manda.
    const prioridade = prioridadeDe(qualidade);
    const captura: ScreenShareCaptureOptions = {
      resolution: preset.resolution,
      contentHint: prioridade === 'fluidez' ? 'motion' : 'detail',
    };
    const publicacao: TrackPublishOptions = {
      // 128 kbps em estéreo, em vez dos 48 kbps mono do preset de voz que vem por padrão.
      audioPreset: AudioPresets.musicHighQualityStereo,
      forceStereo: true,
      // DTX corta o que julga silêncio; em música isso vira bombeamento. RED repete
      // pedaços para aguentar perda, o que faz sentido em fala e atrapalha aqui.
      dtx: false,
      red: false,
      screenShareEncoding: preset.encoding,
      degradationPreference: prioridade === 'fluidez' ? 'maintain-framerate' : 'maintain-resolution',
      // Sem simulcast. Com ele, o LiveKit publica versões menores da tela, e o
      // adaptiveStream de quem assiste escolhe a menor sempre que a janela do vídeo é
      // menor que a tela transmitida — o que é quase sempre. Era essa a imagem borrada.
      simulcast: false,
    };

    // A ordem é a do melhor para o que ainda serve.
    //
    // 'loopbackWithoutChrome' vem primeiro porque é o único que não devolve a nossa
    // própria voz: ele captura a saída do sistema menos o que este app está tocando. Sem
    // ele, quem transmite manda de volta as vozes da call — e não é eco de microfone, é
    // cópia digital do mix, então fone de ouvido não muda nada. Ele exige Windows 11 ou
    // macOS 14.2; onde não houver, ou falha (e caímos no seguinte) ou vem sem faixa
    // nenhuma — e faixa que não veio é justamente o que a conferência abaixo pega.
    //
    // Depois dele, o caminho de sempre: 'loopback', e no Windows o 'loopbackWithMute' para
    // quando a placa de som recusa o primeiro. Ver o comentário de ModoDeAudio no main.
    const modos: ModoDeAudio[] = !audio ? ['nao']
      : sourceId && window.desktop.platform === 'win32'
        ? ['loopbackWithoutChrome', 'loopback', 'loopbackWithMute', 'nao']
        : ['loopbackWithoutChrome', 'loopback', 'nao'];

    let ultimoMotivo = '';
    for (const modo of modos) {
      try {
        if (sourceId) await window.desktop.chooseSource(sourceId, modo);
        await lp().setScreenShareEnabled(
          true,
          { ...captura, audio: modo !== 'nao' ? SOM_DE_VERDADE : false },
          publicacao,
        );

        // Áudio recusado não lança erro: vira uma faixa morta, calada. É o que deixou o Mac
        // transmitindo mudo sem nada no registro. Quem sabe se veio ou não é a publicação.
        const veioAudio = !!lp().getTrackPublication(Track.Source.ScreenShareAudio);

        // Aceito e mudo é a cara da falha do 'loopbackWithoutChrome' em máquina velha
        // demais para captura por processo: nada lança, e vem faixa nenhuma. Aí não dá
        // para parar aqui — sem cair para o modo seguinte, trocaríamos "todo mundo se
        // ouve" por "ninguém ouve nada", que é pior. Só desfaz e tenta o próximo.
        //
        // Só este modo cai. Faixa muda no 'loopback' continua como sempre foi: avisa e
        // fica assim. Cair dali para o 'loopbackWithMute' silenciaria a máquina inteira de
        // quem transmite, que é remédio pior que a doença.
        if (audio && !veioAudio && modo === 'loopbackWithoutChrome') {
          anotar('aviso', 'tela', `modo "${modo}" foi aceito mas veio mudo; tentando o próximo`);
          await lp().setScreenShareEnabled(false).catch(() => undefined);
          continue;
        }

        if (audio && modo !== 'nao' && !veioAudio) {
          anotar('aviso', 'tela', `modo "${modo}" foi aceito, mas nenhuma faixa de áudio foi publicada`);
          avisar('aviso', explicarTelaMuda(window.desktop.platform));
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
        pararMedicoes();
        anotarComoEstaSaindo(10);
        anotarComoEstaSaindo(45);
        bump();
        return;
      } catch (e) {
        ultimoMotivo = (e as Error).message || String(e);
        // O modo que exclui o próprio app não existe em Windows 10 nem em macOS antigo, e
        // falhar ali é o esperado, não defeito: fica como informação para não encher o
        // registro de vermelho em máquina que nunca teve como aceitar.
        anotar(modo === 'loopbackWithoutChrome' ? 'info' : 'erro', 'tela',
          `modo "${modo}" falhou: ${ultimoMotivo}`);

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
  }, [room, souTurbo, avisar, anotarComoEstaSaindo, pararMedicoes]);

  const stopScreen = useCallback(async () => {
    pararMedicoes();
    // A faixa de mixagem é nossa, publicada à parte: o LiveKit não a recolhe sozinho.
    if (faixaDeMixagem.current) {
      await lp().unpublishTrack(faixaDeMixagem.current, true).catch(() => undefined);
      faixaDeMixagem.current = null;
    }
    await lp().setScreenShareEnabled(false);
    bump();
  }, [room, pararMedicoes]);

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

  /**
   * Liga e desliga o recebimento das transmissões alheias.
   *
   * O som da live anda numa publicação PRÓPRIA (`ScreenShareAudio`), separada do vídeo.
   * Desinscrever só o vídeo deixava o som de todas as lives entrando e tocando com a tela
   * apagada — e o botão promete parar de receber, não esconder.
   */
  const alternarTransmissoes = useCallback(() => {
    const novo = !semTransmissoes;
    setSemTransmissoes(novo);
    semTransmissoesRef.current = novo;
    const daLive = (f: Track.Source) => f === Track.Source.ScreenShare || f === Track.Source.ScreenShareAudio;
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        if (daLive(pub.source) && 'setSubscribed' in pub) {
          (pub as { setSubscribed(v: boolean): void }).setSubscribed(!novo);
        }
      }
    }
    aplicarAudio();
    bump();
  }, [room, semTransmissoes, aplicarAudio]);

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

  /** Qual live está no palco; só o som dela é ouvido, e `null` é silêncio. */
  const definirLiveNoPalco = useCallback((identity: string | null) => {
    if (liveNoPalco.current === identity) return;
    liveNoPalco.current = identity;
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
    volumeDaTelaDe, definirVolumeDaTela, definirLiveNoPalco,
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Track, type AudioProcessorOptions, type LocalAudioTrack, type LocalTrackPublication, type Room,
  type TrackProcessor,
} from 'livekit-client';
import { anotar } from './registro';
import { AJUSTES_PADRAO, CHAVE_DO_MICROFONE, ajustesGuardados, type AjustesDoMicrofone } from './sensibilidade';
import { MontagemDoMicrofone, type EstadoDoFiltro, type Medida } from './montagemDoMicrofone';

/**
 * Supressão de ruído e sensibilidade do SEU microfone, na call e fora dela.
 *
 * Na call, o caminho entra como processador da faixa do LiveKit: o que vai para os outros
 * é a saída dele, e trocar de microfone ou reconectar remonta sozinho (o LiveKit chama
 * `restart`). Fora da call — ou mutado, quando a faixa da call está calada — quem abre a
 * barra dos ajustes ganha uma prévia: o mesmo caminho sobre uma captura própria, que só
 * existe enquanto alguém está olhando a barra.
 */

export type MicrofoneDaCall = {
  ajustes: AjustesDoMicrofone;
  definir: (mudanca: Partial<AjustesDoMicrofone>) => void;
  estadoDoFiltro: EstadoDoFiltro;
  /** A barra: medidas a 20 por segundo. Devolve como parar. `null` é "sem microfone". */
  ouvir: (f: (m: Medida | null) => void) => () => void;
};

const restricoes = (a: AjustesDoMicrofone) => ({
  echoCancellation: true,
  autoGainControl: true,
  // "Padrão" é a supressão do navegador, que já vinha ligada; "Forte" soma o filtro de
  // voz a ela. Só "Desligada" a tira.
  noiseSuppression: a.supressao !== 'desligada',
});

function lerAjustes() {
  try { return ajustesGuardados(localStorage.getItem(CHAVE_DO_MICROFONE)); } catch { return AJUSTES_PADRAO; }
}

export function useMicrofone(room: Room): MicrofoneDaCall & {
  eventos: { aoPublicar: (pub: LocalTrackPublication) => void; reavaliar: () => void; trocouDeMicrofone: () => void };
} {
  const [ajustes, setAjustes] = useState(lerAjustes);
  const ajustesRef = useRef(ajustes);
  const [estadoDoFiltro, setEstadoDoFiltro] = useState<EstadoDoFiltro>('desligado');

  // O filtro de voz foi feito para 48 kHz; um contexto só, para a call e para a prévia.
  const ctxRef = useRef<AudioContext | null>(null);
  const contexto = () => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') ctxRef.current = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume().catch((e) => anotar('erro', 'microfone', e));
    return ctxRef.current;
  };

  const daCall = useRef<MontagemDoMicrofone | null>(null);
  const previa = useRef<{ montagem: MontagemDoMicrofone | null; captura: MediaStreamTrack | null; geracao: number } | null>(null);
  const ouvintes = useRef(new Set<(m: Medida | null) => void>());
  const fonteAtual = useRef<{ montagem: MontagemDoMicrofone; parar: () => void } | null>(null);

  const emitir = (m: Medida | null) => { for (const f of ouvintes.current) f(m); };

  /**
   * O estado do filtro é acompanhado desde que a montagem nasce, e não só com a barra
   * aberta: um Forte que falhasse com ninguém olhando a tela não chegaria nem ao registro.
   * O teste pela call de verdade é que mostrou isso.
   */
  const acompanharFiltro = useCallback((m: MontagemDoMicrofone) => {
    const contar = (e: EstadoDoFiltro) => {
      setEstadoDoFiltro(e);
      if (e === 'falhou') anotar('erro', 'microfone', `filtro de voz não carregou: ${m.erroDoFiltro?.message ?? 'sem som saindo dele'}`);
      if (e === 'vivo') anotar('info', 'microfone', 'filtro de voz funcionando');
    };
    contar(m.estadoDoFiltro);
    return m.aoMudarOFiltro(contar);
  }, []);

  const fecharPrevia = useCallback(() => {
    const p = previa.current;
    previa.current = null;
    p?.montagem?.fechar();
    p?.captura?.stop();
  }, []);

  /**
   * De onde a barra lê. Conserta-se sozinha a cada chamada, em vez de acompanhar a ordem
   * dos eventos: entrar, sair, mutar e trocar de microfone só pedem "confira de novo".
   */
  const reavaliar = useCallback(() => {
    const querem = ouvintes.current.size > 0;
    const falandoNaCall = daCall.current && room.localParticipant.isMicrophoneEnabled;
    const alvo = falandoNaCall ? daCall.current : null;

    if (alvo) fecharPrevia();
    else if (!querem) fecharPrevia();
    else if (!previa.current) {
      const geracao = Date.now();
      previa.current = { montagem: null, captura: null, geracao };
      const dispositivo = room.getActiveDevice('audioinput');
      navigator.mediaDevices.getUserMedia({
        audio: { ...restricoes(ajustesRef.current), ...(dispositivo && dispositivo !== 'default' ? { deviceId: { exact: dispositivo } } : {}) },
      }).then(async (stream) => {
        const captura = stream.getAudioTracks()[0];
        if (previa.current?.geracao !== geracao) { captura.stop(); return; }
        previa.current.captura = captura;
        const montagem = await MontagemDoMicrofone.criar(contexto(), captura, ajustesRef.current);
        if (previa.current?.geracao !== geracao) { montagem.fechar(); return; }
        acompanharFiltro(montagem);
        previa.current.montagem = montagem;
        reavaliar();
      }).catch((e) => {
        anotar('erro', 'microfone', e);
        if (previa.current?.geracao === geracao) emitir(null);
      });
    }

    const nova = alvo ?? previa.current?.montagem ?? null;
    if (fonteAtual.current?.montagem === nova) return;
    fonteAtual.current?.parar();
    fonteAtual.current = null;
    if (!nova) { emitir(null); return; }
    const pararDeMedir = nova.aoMedir(emitir);
    setEstadoDoFiltro(nova.estadoDoFiltro);
    fonteAtual.current = { montagem: nova, parar: pararDeMedir };
    if (nova.ultimaMedida) emitir(nova.ultimaMedida);
  }, [room, fecharPrevia, acompanharFiltro]);

  // O processador que o LiveKit chama. Um por faixa: `restart` remonta por cima da mesma.
  const criarProcessador = useCallback((): TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> => {
    let montagem: MontagemDoMicrofone | null = null;
    const processador: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> = {
      name: 'saga-microfone',
      init: async (opts) => {
        montagem = await MontagemDoMicrofone.criar(opts.audioContext, opts.track, ajustesRef.current);
        acompanharFiltro(montagem);
        processador.processedTrack = montagem.saida;
        daCall.current = montagem;
        reavaliar();
      },
      restart: async (opts) => {
        await processador.destroy();
        await processador.init(opts);
      },
      destroy: async () => {
        if (daCall.current === montagem) daCall.current = null;
        montagem?.fechar();
        montagem = null;
        processador.processedTrack = undefined;
        reavaliar();
      },
    };
    return processador;
  }, [reavaliar, acompanharFiltro]);

  /**
   * Os eventos da sala chegam pelo `useRoom`, e não por ouvintes registrados aqui: ele
   * limpa TODOS os ouvintes da sala quando o efeito dele se refaz (`removeAllListeners`),
   * e um ouvinte daqui sumiria calado — o microfone voltaria a ir cru sem erro nenhum.
   */
  const aoPublicar = useCallback(async (pub: LocalTrackPublication) => {
    if (pub.source !== Track.Source.Microphone || !pub.track) return;
    const faixa = pub.track as LocalAudioTrack;
    if (faixa.getProcessor()) return;
    try {
      faixa.setAudioContext(contexto());
      await faixa.setProcessor(criarProcessador());
      anotar('info', 'microfone', `caminho montado: ${JSON.stringify(ajustesRef.current)}`);
    } catch (e) {
      // Sem o caminho, o microfone continua indo cru — do jeito que ia antes disto.
      anotar('erro', 'microfone', e);
    }
  }, [criarProcessador]);
  const trocouDeMicrofone = useCallback(() => { fecharPrevia(); reavaliar(); }, [fecharPrevia, reavaliar]);

  const definir = useCallback((mudanca: Partial<AjustesDoMicrofone>) => {
    const antes = ajustesRef.current;
    const depois = { ...antes, ...mudanca };
    ajustesRef.current = depois;
    setAjustes(depois);
    try { localStorage.setItem(CHAVE_DO_MICROFONE, JSON.stringify(depois)); } catch { /* sem storage, vale até fechar */ }

    // A supressão do navegador é pedida ao abrir o microfone: mudar pede reabri-lo.
    room.options.audioCaptureDefaults = { ...room.options.audioCaptureDefaults, ...restricoes(depois) };
    const trocouONavegador = restricoes(antes).noiseSuppression !== restricoes(depois).noiseSuppression;
    if (trocouONavegador) {
      const faixa = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track as LocalAudioTrack | undefined;
      const dispositivo = room.getActiveDevice('audioinput');
      faixa?.restartTrack({ ...restricoes(depois), ...(dispositivo ? { deviceId: dispositivo } : {}) })
        .catch((e) => anotar('erro', 'microfone', e));
      fecharPrevia();
    }
    for (const m of [daCall.current, previa.current?.montagem]) {
      m?.ajustar(depois).catch((e) => anotar('erro', 'microfone', e));
    }
    reavaliar();
  }, [room, fecharPrevia, reavaliar]);

  const ouvir = useCallback((f: (m: Medida | null) => void) => {
    ouvintes.current.add(f);
    reavaliar();
    return () => {
      ouvintes.current.delete(f);
      reavaliar();
    };
  }, [reavaliar]);

  useEffect(() => () => { fecharPrevia(); fonteAtual.current?.parar(); }, [fecharPrevia]);

  return { ajustes, definir, estadoDoFiltro, ouvir, eventos: { aoPublicar, reavaliar, trocouDeMicrofone } };
}

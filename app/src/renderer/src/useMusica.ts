import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioPresets, Track, type Room } from 'livekit-client';
import { avisarQueAMusicaAcabou, type EstadoDaMusica, type ItemDaMusica } from './api';
import { aoMudarAMusica, contarQueAMusicaMudou } from './musicaDoBot';
import { maisNova, posicao, pontoDeEntrada, type Noticia } from './tocador';
import { NOME_DA_FAIXA_DE_MUSICA } from './useRoom';
import { VOLUME } from './volume';
import { anotar } from './registro';

/**
 * O tocador do bot de música.
 *
 * Quem toca é o app do ANFITRIÃO — quem pediu a primeira música, ou quem ficou quando ele saiu
 * da call (o servidor decide; ver musica.mjs). Esse app lê o áudio que o processo principal
 * baixou, toca num `<audio>` e manda a saída para a call como uma faixa própria, `musica`,
 * publicada como `unknown` — o mesmo caminho do soundboard, que o crachá sem a permissão de
 * transmitir continua deixando passar. Os outros só recebem a faixa, com volume próprio
 * (`volumeDaMusica`, no useRoom).
 *
 * Também guarda a fila de cada sala, juntando a busca de salas com as respostas dos comandos
 * — é o que o cartão do chat lê para dizer se a música ainda toca.
 */
export function useMusica({ room, conectado, salaVozId, filasDaBusca, agoraDaBusca, volume, surdo }: {
  room: Room;
  conectado: boolean;
  /** A sala de voz em que estou, ou null. */
  salaVozId: number | null;
  /** As filas das salas de voz do servidor aberto, como vieram na busca de salas. */
  filasDaBusca: Map<number, EstadoDaMusica | null>;
  /** A hora do servidor nessa busca. Servidor antigo não manda: aí vale 0, e a busca perde para o resto. */
  agoraDaBusca: number;
  volume: number;
  surdo: boolean;
}) {
  const [noticias, setNoticias] = useState<Map<number, Noticia>>(new Map());

  const receber = useCallback((sala: number, estado: EstadoDaMusica | null, agora: number) => {
    setNoticias((antes) => {
      const velha = antes.get(sala);
      const nova = maisNova(velha, { estado, agora, recebidaEm: Date.now() });
      if (nova === velha) return antes;
      return new Map(antes).set(sala, nova);
    });
  }, []);

  // As respostas dos comandos (o /tocar, o botão Pular) chegam por aqui.
  useEffect(() => aoMudarAMusica(receber), [receber]);
  // E a busca de salas, a cada volta.
  useEffect(() => {
    for (const [sala, estado] of filasDaBusca) receber(sala, estado, agoraDaBusca);
  }, [filasDaBusca, agoraDaBusca, receber]);

  const estadoDaSala = useCallback((sala: number) => {
    const n = noticias.get(sala);
    return n ? n.estado : filasDaBusca.has(sala) ? filasDaBusca.get(sala)! : undefined;
  }, [noticias, filasDaBusca]);

  // --- o som, no app do anfitrião ------------------------------------------------------

  const ctx = useRef<AudioContext | null>(null);
  const destino = useRef<MediaStreamAudioDestinationNode | null>(null);
  const ganhoLocal = useRef<GainNode | null>(null);
  const faixa = useRef<MediaStreamTrack | null>(null);
  const tocando = useRef<{ uid: string; audio: HTMLAudioElement; fonte: MediaElementAudioSourceNode; url: string } | null>(null);
  const geracao = useRef(0);

  // O que VOCÊ ouve da música que o seu app toca: o mesmo volume e a mesma surdez da faixa
  // dos outros. A sala recebe o som inteiro, tirado antes deste ganho.
  useEffect(() => {
    if (ganhoLocal.current) ganhoLocal.current.gain.value = surdo ? 0 : VOLUME(volume);
  }, [volume, surdo]);

  const pararOSom = useCallback(() => {
    const t = tocando.current;
    tocando.current = null;
    if (!t) return;
    t.audio.onended = null;
    t.audio.onerror = null;
    t.audio.pause();
    try { t.fonte.disconnect(); } catch { /* já desligada */ }
    URL.revokeObjectURL(t.url);
  }, []);

  const tirarDaCall = useCallback(async () => {
    const f = faixa.current;
    faixa.current = null;
    if (f && room.state === 'connected') await room.localParticipant.unpublishTrack(f, false).catch(() => undefined);
  }, [room]);

  /** O contexto de áudio e a faixa publicada, criados uma vez e reaproveitados entre músicas. */
  const garantirSaida = useCallback(async () => {
    if (!ctx.current || ctx.current.state === 'closed') {
      ctx.current = new AudioContext({ sampleRate: 48000 });
      destino.current = ctx.current.createMediaStreamDestination();
      destino.current.channelCount = 2;
      ganhoLocal.current = ctx.current.createGain();
      ganhoLocal.current.connect(ctx.current.destination);
    }
    if (ctx.current.state === 'suspended') await ctx.current.resume();
    ganhoLocal.current!.gain.value = surdo ? 0 : VOLUME(volume);
    if (!faixa.current) {
      const f = destino.current!.stream.getAudioTracks()[0];
      // Música, e não voz: estéreo e sem DTX nem RED, que foram feitos para fala — a mesma
      // lição do áudio da tela (main/CLAUDE.md, "O áudio da tela é som, não voz").
      await room.localParticipant.publishTrack(f, {
        source: Track.Source.Unknown, name: NOME_DA_FAIXA_DE_MUSICA,
        dtx: false, red: false, forceStereo: true, audioPreset: AudioPresets.musicHighQualityStereo,
      });
      faixa.current = f;
    }
  }, [room, volume, surdo]);

  const avisarQueAcabou = useCallback(async (sala: number, item: ItemDaMusica, erro: boolean) => {
    try {
      const r = await avisarQueAMusicaAcabou(sala, item.uid, erro);
      contarQueAMusicaMudou(sala, r.musica, r.agora ?? 0);
    } catch (e) {
      anotar('erro', 'musica', `avisar que acabou: ${(e as Error).message}`);
    }
  }, []);

  const noticiaDaMinhaSala = salaVozId !== null ? noticias.get(salaVozId) ?? null : null;
  const estado = noticiaDaMinhaSala?.estado ?? null;
  const souAnfitriao = conectado && !!estado && estado.anfitriao === room.localParticipant.identity;
  const uidQueToca = souAnfitriao ? estado!.tocando.uid : null;

  useEffect(() => {
    if (!souAnfitriao || !estado || salaVozId === null || !noticiaDaMinhaSala) {
      geracao.current += 1;
      pararOSom();
      void tirarDaCall();
      return;
    }
    if (tocando.current?.uid === estado.tocando.uid) return;

    const minha = ++geracao.current;
    const item = estado.tocando;
    const sala = salaVozId;
    const noticia = noticiaDaMinhaSala;
    pararOSom();
    (async () => {
      try {
        let dados = await window.desktop.musica.ler(item.id);
        if (!dados) {
          const r = await window.desktop.musica.preparar(item.id);
          if (!r.ok) throw new Error(r.erro ?? 'não baixou');
          dados = await window.desktop.musica.ler(item.id);
        }
        if (!dados) throw new Error('o áudio não ficou no disco');
        if (minha !== geracao.current) return;
        await garantirSaida();
        const url = URL.createObjectURL(new Blob([dados.bytes as BlobPart], { type: dados.tipo }));
        const audio = new Audio(url);
        const fonte = ctx.current!.createMediaElementSource(audio);
        fonte.connect(destino.current!);
        fonte.connect(ganhoLocal.current!);
        tocando.current = { uid: item.uid, audio, fonte, url };
        audio.onended = () => { if (tocando.current?.uid === item.uid) void avisarQueAcabou(sala, item, false); };
        audio.onerror = () => { if (tocando.current?.uid === item.uid) void avisarQueAcabou(sala, item, true); };
        await new Promise<void>((pronto) => { audio.onloadedmetadata = () => pronto(); });
        if (minha !== geracao.current) return;
        // Anfitrião que assumiu no meio (o outro saiu da call) continua do ponto.
        audio.currentTime = pontoDeEntrada(posicao(noticia, Date.now()), item.duracao);
        await audio.play();
        anotar('info', 'musica', `tocando ${item.id} a partir de ${Math.round(audio.currentTime)} s`);
      } catch (e) {
        if (minha !== geracao.current) return;
        anotar('erro', 'musica', `tocar ${item.id}: ${(e as Error).message}`);
        void avisarQueAcabou(sala, item, true);
      }
    })();
  // A música muda pelo uid; a notícia nova sobre a MESMA música não a recomeça.
  }, [uidQueToca, souAnfitriao, salaVozId]);

  // Quem toca adianta a próxima: sem isto, cada troca de música seria um silêncio de segundos.
  const proxima = souAnfitriao ? estado?.fila[0]?.id ?? null : null;
  useEffect(() => {
    if (proxima) void window.desktop.musica.preparar(proxima);
  }, [proxima]);

  // Saiu da call: o som para (a faixa já saiu junto com a sala).
  useEffect(() => {
    if (!conectado) { faixa.current = null; pararOSom(); }
  }, [conectado, pararOSom]);

  useEffect(() => () => { pararOSom(); void ctx.current?.close(); }, [pararOSom]);

  return { estadoDaSala };
}

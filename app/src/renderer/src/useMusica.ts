import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioPresets, Track, type Room } from 'livekit-client';
import { avisarQueAMusicaAcabou, avisarQueAMusicaComecou, lerMusica, type EstadoDaMusica, type ItemDaMusica } from './api';
import { aoMudarAMusica, contarQueAMusicaMudou, quandoForTocar } from './musicaDoBot';
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
export function useMusica({ room, conectado, euId, salaVozId, servidorDaVoz, filasDaBusca, agoraDaBusca, volume, surdo }: {
  room: Room;
  conectado: boolean;
  /** A minha conta: quem pediu a música toca do começo (ver `pontoDeEntrada`). */
  euId: number | null;
  /** A sala de voz em que estou, ou null. */
  salaVozId: number | null;
  /** O servidor dessa sala — pode não ser o aberto na tela. */
  servidorDaVoz: number | null;
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
      // A mesma fila de novo não é notícia: trocar o objeto redesenharia o App inteiro a cada
      // pergunta. O par velho (hora do servidor, hora de chegada) continua certo para a conta
      // da posição.
      if (velha && velha.agora <= agora && JSON.stringify(velha.estado) === JSON.stringify(estado)) return antes;
      const nova = maisNova(velha, { estado, agora, recebidaEm: Date.now() });
      if (nova === velha) return antes;
      return new Map(antes).set(sala, nova);
    });
  }, []);

  // As respostas dos comandos (o /tocar, o botão Pular) chegam por aqui.
  useEffect(() => aoMudarAMusica(receber), [receber]);
  // A call é de um servidor e a tela é de outro: a busca de salas não traz esta fila, então
  // pergunta direto, no mesmo ritmo dela. Sem isto, quem toca não ficava sabendo do /pular.
  const foraDaBusca = conectado && salaVozId !== null && servidorDaVoz !== null && !filasDaBusca.has(salaVozId);
  useEffect(() => {
    if (!foraDaBusca || salaVozId === null || servidorDaVoz === null) return;
    let vivo = true;
    const perguntar = () => lerMusica(salaVozId, servidorDaVoz)
      .then((r) => { if (vivo) receber(salaVozId, r.musica, r.agora ?? 0); })
      .catch(() => undefined);
    perguntar();
    const id = setInterval(perguntar, 4000);
    return () => { vivo = false; clearInterval(id); };
  }, [foraDaBusca, salaVozId, servidorDaVoz, receber]);
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
  const ganhoLocal = useRef<GainNode | null>(null);
  /**
   * A saída que vai para a call: o destino do áudio e a faixa dele. NÃO dura para sempre: ao
   * sair da sala (trocar, desligar, cair), o LiveKit ENCERRA as faixas locais, e publicar de
   * novo uma faixa encerrada não dá erro nenhum — só silêncio para os outros, enquanto quem
   * toca continua ouvindo normal pelo som local. Achado na revisão de 23/09/2026. Por isso a
   * faixa é conferida a cada uso, e a morta dá lugar a uma nova.
   */
  const saida = useRef<{ destino: MediaStreamAudioDestinationNode; faixa: MediaStreamTrack } | null>(null);
  /** A publicação em andamento: duas ao mesmo tempo publicariam a mesma faixa duas vezes. */
  const publicando = useRef<Promise<void> | null>(null);
  const tocando = useRef<{ uid: string; audio: HTMLAudioElement; fonte: MediaElementAudioSourceNode; url: string } | null>(null);
  const geracao = useRef(0);
  /** As músicas que ESTE app já começou: voltar a uma delas (caiu e voltou) é continuar do ponto. */
  const jaComecei = useRef(new Set<string>());

  // Volume e surdez em referência: quem usa é código que roda segundos depois (o fim de um
  // download), e com os valores de quando começou a esperar desfazia o fone desligado.
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const surdoRef = useRef(surdo);
  surdoRef.current = surdo;
  const ganhoCerto = () => (surdoRef.current ? 0 : VOLUME(volumeRef.current));

  // O que VOCÊ ouve da música que o seu app toca: o mesmo volume e a mesma surdez da faixa
  // dos outros. A sala recebe o som inteiro, tirado antes deste ganho.
  useEffect(() => {
    if (ganhoLocal.current) ganhoLocal.current.gain.value = ganhoCerto();
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

  const publicada = useCallback(() => {
    const f = saida.current?.faixa;
    return !!f && f.readyState === 'live'
      && room.localParticipant.getTrackPublications().some((p) => p.track?.mediaStreamTrack === f);
  }, [room]);

  const tirarDaCall = useCallback(async () => {
    const f = saida.current?.faixa;
    if (f && room.state === 'connected' && publicada()) {
      await room.localParticipant.unpublishTrack(f, false).catch(() => undefined);
    }
  }, [room, publicada]);

  /** O contexto de áudio e a faixa na call, prontos — refeitos se a sala os encerrou. */
  const garantirSaida = useCallback(async () => {
    if (!ctx.current || ctx.current.state === 'closed') {
      ctx.current = new AudioContext({ sampleRate: 48000 });
      ganhoLocal.current = ctx.current.createGain();
      ganhoLocal.current.connect(ctx.current.destination);
      saida.current = null;
    }
    const c = ctx.current;
    if (c.state === 'suspended') await c.resume();
    ganhoLocal.current!.gain.value = ganhoCerto();
    // Quem toca ouve na saída escolhida na Saga, e não no alto-falante padrão do sistema.
    const saidaEscolhida = room.getActiveDevice('audiooutput');
    const comSink = c as AudioContext & { sinkId?: string; setSinkId?: (id: string) => Promise<void> };
    const querido = !saidaEscolhida || saidaEscolhida === 'default' ? '' : saidaEscolhida;
    if (comSink.setSinkId && comSink.sinkId !== querido) await comSink.setSinkId(querido).catch(() => undefined);
    if (publicada()) return;
    publicando.current ??= (async () => {
      try {
        if (!saida.current || saida.current.faixa.readyState !== 'live') {
          const destino = c.createMediaStreamDestination();
          destino.channelCount = 2;
          // A música que já estava tocando passa a ir para a faixa nova.
          tocando.current?.fonte.connect(destino);
          saida.current = { destino, faixa: destino.stream.getAudioTracks()[0] };
        }
        // Na reconexão o próprio LiveKit republica a faixa: publicar de novo seria em dobro.
        if (!publicada()) {
          // Música, e não voz: estéreo e sem DTX nem RED, que foram feitos para fala — a mesma
          // lição do áudio da tela (main/CLAUDE.md, "O áudio da tela é som, não voz").
          await room.localParticipant.publishTrack(saida.current.faixa, {
            source: Track.Source.Unknown, name: NOME_DA_FAIXA_DE_MUSICA,
            dtx: false, red: false, forceStereo: true, audioPreset: AudioPresets.musicHighQualityStereo,
          });
        }
      } finally { publicando.current = null; }
    })();
    await publicando.current;
  }, [room, publicada]);

  const servidorDaVozRef = useRef(servidorDaVoz);
  servidorDaVozRef.current = servidorDaVoz;
  const avisarQueAcabou = useCallback(async (sala: number, item: ItemDaMusica, erro: boolean) => {
    const servidor = servidorDaVozRef.current;
    if (servidor === null) return;
    try {
      const r = await avisarQueAMusicaAcabou(sala, item.uid, erro, servidor);
      contarQueAMusicaMudou(sala, r.musica, r.agora ?? 0);
    } catch (e) {
      anotar('erro', 'musica', `avisar que acabou: ${(e as Error).message}`);
    }
  }, []);

  // O /tocar começou a procurar: a faixa já entra na call enquanto isso. Se a música não vier
  // para este app (foi para a fila de outro anfitrião), ela sai em meio minuto.
  //
  // Só o ÚLTIMO pedido conta, e quem é o anfitrião agora nunca perde a faixa por isso. Medido na
  // bancada em 23/09/2026: o prazo de um /tocar de 27 s antes venceu enquanto a música nova
  // carregava — nada "tocando" ainda — e tirou a faixa da call; a música tocou para ninguém.
  const conectadoRef = useRef(conectado);
  conectadoRef.current = conectado;
  const souAnfitriaoRef = useRef(false);
  const prazoDaFaixa = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => quandoForTocar(() => {
    if (!conectadoRef.current) return;
    garantirSaida().catch((e) => anotar('erro', 'musica', `adiantar a faixa: ${(e as Error).message}`));
    if (prazoDaFaixa.current) clearTimeout(prazoDaFaixa.current);
    prazoDaFaixa.current = setTimeout(() => {
      prazoDaFaixa.current = null;
      if (!tocando.current && !souAnfitriaoRef.current) void tirarDaCall();
    }, 30_000);
  }), [garantirSaida, tirarDaCall]);
  useEffect(() => () => { if (prazoDaFaixa.current) clearTimeout(prazoDaFaixa.current); }, []);

  const euIdRef = useRef(euId);
  euIdRef.current = euId;

  const noticiaDaMinhaSala = salaVozId !== null ? noticias.get(salaVozId) ?? null : null;
  const estado = noticiaDaMinhaSala?.estado ?? null;
  const souAnfitriao = conectado && !!estado && estado.anfitriao === room.localParticipant.identity;
  const uidQueToca = souAnfitriao ? estado!.tocando.uid : null;
  souAnfitriaoRef.current = souAnfitriao;

  useEffect(() => {
    if (!souAnfitriao || !estado || salaVozId === null || !noticiaDaMinhaSala) {
      geracao.current += 1;
      pararOSom();
      void tirarDaCall();
      return;
    }
    if (tocando.current?.uid === estado.tocando.uid) return;

    const minha = ++geracao.current;
    const comecei = performance.now();
    const item = estado.tocando;
    const sala = salaVozId;
    const noticia = noticiaDaMinhaSala;
    pararOSom();
    let url: string | null = null;
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
        // A vez pode ter mudado durante a publicação (uma piscada da internet): aí não toca.
        if (minha !== geracao.current) return;
        url = URL.createObjectURL(new Blob([dados.bytes as BlobPart], { type: dados.tipo }));
        const audio = new Audio(url);
        await new Promise<void>((pronto, falhou) => {
          audio.onloadedmetadata = () => pronto();
          audio.onerror = () => falhou(new Error('o áudio não abriu'));
        });
        if (minha !== geracao.current) { URL.revokeObjectURL(url); return; }
        // A faixa pode ter saído da call enquanto o áudio abria: confere de novo, logo antes.
        await garantirSaida();
        if (minha !== geracao.current) { URL.revokeObjectURL(url); return; }
        const fonte = ctx.current!.createMediaElementSource(audio);
        fonte.connect(saida.current!.destino);
        fonte.connect(ganhoLocal.current!);
        tocando.current = { uid: item.uid, audio, fonte, url };
        audio.onended = () => { if (tocando.current?.uid === item.uid) void avisarQueAcabou(sala, item, false); };
        audio.onerror = () => { if (tocando.current?.uid === item.uid) void avisarQueAcabou(sala, item, true); };
        // Anfitrião que assumiu no meio (o outro saiu da call), ou quem caiu e voltou, continua
        // do ponto. Quem PEDIU, na primeira vez, toca do começo — a espera do download é dele.
        const doComeco = item.pediu.id === euIdRef.current && !jaComecei.current.has(item.uid);
        audio.currentTime = doComeco ? 0 : pontoDeEntrada(posicao(noticia, Date.now()), item.duracao);
        jaComecei.current.add(item.uid);
        await audio.play();
        // O relógio da música passa a ser o do som de verdade — sem isto, a espera do download
        // contava como música tocada, e o servidor podia dá-la por acabada antes do fim.
        const servidor = servidorDaVozRef.current;
        if (servidor !== null) {
          avisarQueAMusicaComecou(sala, item.uid, audio.currentTime, servidor)
            .catch((e) => anotar('aviso', 'musica', `avisar que começou: ${(e as Error).message}`));
        }
        anotar('info', 'musica', `tocando ${item.id} a partir de ${Math.round(audio.currentTime)} s — ${Math.round(performance.now() - comecei)} ms depois de saber`);
      } catch (e) {
        if (minha !== geracao.current) return;
        if (url && tocando.current?.url !== url) URL.revokeObjectURL(url);
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

  // Saiu da call: o som para, e o contexto dorme. A faixa ficou encerrada pela sala — o
  // `garantirSaida` da próxima vez faz outra.
  useEffect(() => {
    if (conectado) return;
    pararOSom();
    if (ctx.current?.state === 'running') ctx.current.suspend().catch(() => undefined);
  }, [conectado, pararOSom]);

  useEffect(() => () => { pararOSom(); void ctx.current?.close(); }, [pararOSom]);

  return { estadoDaSala };
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Room, RoomEvent, type RemoteParticipant } from 'livekit-client';
import { abrirArena, agirNaArena, pedirTokenDaLuta, urlDoArquivo, verArena, type AcaoNaArena, type Arena, type Membro, type ResumoDaArena } from '../api';
import { quemChamar } from '../jogos';
import { contaDaIdentidade } from '../pessoas';
import { anotar } from '../registro';
import { volumeGuardado } from '../volume';
import { preaquecer } from '../dragao/animacoes';
import { desenharLuta } from '../dragao/desenho';
import { FICHAS } from '../dragao/fichas';
import { fotoEmPixel } from '../dragao/fotoEmPixel';
import {
  type DadosDaPergunta, type Regiao, desenharAvisoNaLuta, desenharConvite, desenharEscolha, desenharFim, desenharOpcoes,
  desenharPergunta, desenharTitulo, desenharVs, regiaoEm,
} from '../dragao/interface';
import { avancar, clonar, criarLuta, impressao } from '../dragao/luta';
import { TELA } from '../dragao/medidas';
import {
  type Comando, andarNaGrade, andarNaLista, aoConfirmarNaGrade, aoConfirmarPessoa, cenarioAoLado, comandoDaTecla, ehPessoa, itensDoFim,
  itensDoTitulo, ladoDoCursor, linhasDoConvite, montarEscolha, volumeAoLado, type ArenaNaTela,
} from '../dragao/menu';
import { sonsNovos } from '../dragao/ouvidos';
import { PROTOCOLO_DA_LUTA } from '../dragao/protocolo';
import { criarQuadro, type Quadro } from '../dragao/quadro';
import { EspectadorDaLuta, SessaoDaLuta, type Jogo, type Transporte } from '../dragao/rede';
import { criarSonsDaLuta, type SomDaLuta } from '../dragao/sons';
import { criarSonsGravados, ehGravado } from '../dragao/somDeArquivo';
import { ouvirTeclado } from '../dragao/teclado';
import type { EstadoDaLuta, IdDoLutador } from '../dragao/tipos';

const JOGO: Jogo<EstadoDaLuta> = { avancar, clonar, impressao };
const TOPICO = 'luta';
/** O volume do jogo neste computador. Prefixo antigo de propósito: é o de todas as chaves da Saga. */
const CHAVE_DO_VOLUME = 'cantinho.volumeDaLuta';

/** Um quadro de pixels numa `<canvas>`, ampliado sem suavizar. `desenhar` roda quando `chave` muda. */
export function QuadroNaTela({ quadro, chave, className, style, liso }: {
  quadro: () => Quadro; chave: string; className?: string; style?: React.CSSProperties;
  /** Miniatura reduzida: aí suavizar é melhor que perder pixel. */
  liso?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const q = quadro();
    c.width = q.largura;
    c.height = q.altura;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(q.px.buffer as ArrayBuffer, q.px.byteOffset, q.px.byteLength), q.largura, q.altura), 0, 0);
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className={className} style={{ imageRendering: liso ? 'auto' : 'pixelated', ...style }} />;
}

/** Leva um quadro para a canvas (que tem o tamanho da tela do jogo). */
function mostrar(c: HTMLCanvasElement | null, q: Quadro) {
  if (!c) return;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(q.px.buffer as ArrayBuffer, q.px.byteOffset, q.px.byteLength), q.largura, q.altura), 0, 0);
}

type QualPergunta = 'fechar' | 'sairDaArena' | 'desistir' | 'pararDeAssistir';
type Camada =
  | { tipo: 'convite'; sel: number }
  | { tipo: 'opcoes'; linha: number }
  | { tipo: 'pergunta'; qual: QualPergunta; sel: number }
  | null;
type LadoNoFim = { jogador: string; lutador: IdDoLutador } | null;

const PERGUNTAS: Record<QualPergunta, Omit<DadosDaPergunta, 'selecionado'>> = {
  fechar: { titulo: 'FECHAR A ARENA?', detalhe: 'QUEM ESTÁ NELA VOLTA AO TÍTULO', itens: [{ rotulo: 'CONTINUAR NA ARENA' }, { rotulo: 'FECHAR A ARENA' }] },
  sairDaArena: { titulo: 'SAIR DA ARENA?', detalhe: 'O SEU LUGAR FICA LIVRE', itens: [{ rotulo: 'FICAR' }, { rotulo: 'SAIR DA ARENA' }] },
  desistir: { titulo: 'DESISTIR?', detalhe: 'A LUTA CONTA COMO DERROTA', itens: [{ rotulo: 'CONTINUAR LUTANDO' }, { rotulo: 'DESISTIR' }] },
  pararDeAssistir: { titulo: 'PARAR DE ASSISTIR?', detalhe: 'A LUTA CONTINUA SEM VOCÊ', itens: [{ rotulo: 'CONTINUAR ASSISTINDO' }, { rotulo: 'PARAR' }] },
};

/** As fotos das pessoas em pixel, carregadas aos poucos: cada uma que chega pede um desenho novo. */
function useFotosEmPixel(urls: (string | null)[]) {
  const [, versao] = useState(0);
  const fotos = useRef(new Map<string, Quadro | null>());
  const chave = urls.filter(Boolean).join('|');
  useEffect(() => {
    let vivo = true;
    for (const url of new Set(urls.filter((u): u is string => !!u))) {
      if (fotos.current.has(url)) continue;
      fotos.current.set(url, null);
      void fotoEmPixel(url).then((q) => { if (!vivo) return; fotos.current.set(url, q); versao((v) => v + 1); });
    }
    return () => { vivo = false; };
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  return (url: string | null) => (url ? fotos.current.get(url) ?? null : null);
}

/**
 * O Dragão Quadrado inteiro, num palco só de pixel: título, escolha de lutador, convite, opções, VS,
 * luta e fim. Nada de HTML da Saga por cima do jogo — o dono pediu "como se fosse um jogo completo
 * dentro". Sem arena (`arenaId` nulo) é o título; com arena, a tela sai do estado dela no servidor.
 *
 * Os menus são desenhados quando algo muda, e não num laço: a tela parada não gasta nada (ver
 * `interface.ts`). Só a luta tem laço, e é o de sempre.
 */
export function TelaDaLuta({ arenaId, servidorId, euId, membros, naCall, arenas, surdo, live, onArena, onFechar }: {
  arenaId: number | null;
  servidorId: number;
  euId: number;
  membros: Membro[];
  naCall: Set<number>;
  /** As arenas deste servidor, da busca de salas: é o que o título oferece para entrar ou assistir. */
  arenas: ResumoDaArena[];
  surdo: boolean;
  live?: ReactNode;
  /** Troca a arena na tela; nulo volta ao título. */
  onArena: (id: number | null) => void;
  /** Sai do jogo, de volta à Saga. */
  onFechar: () => void;
}) {
  const [arena, setArena] = useState<Arena | null>(null);
  const [falhou, setFalhou] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const avisoRelogio = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const avisar = useCallback((texto: string) => {
    setAviso(texto.toUpperCase());
    clearTimeout(avisoRelogio.current);
    avisoRelogio.current = setTimeout(() => setAviso(null), 4500);
  }, []);
  useEffect(() => () => clearTimeout(avisoRelogio.current), []);
  const onArenaRef = useRef(onArena);
  onArenaRef.current = onArena;
  /**
   * As arenas que sumiram daqui (fechadas, ou que responderam "não existe"). A lista do título vem da
   * busca de salas, de quatro em quatro segundos: sem isto, logo depois de fechar, o título ainda
   * oferecia "VOLTAR À SUA ARENA" para uma arena que já não existe.
   */
  const sumidas = useRef(new Set<number>());
  const saindo = useRef(false);
  const arenaIdRef = useRef(arenaId);
  arenaIdRef.current = arenaId;
  /** A diferença entre o relógio do servidor e o daqui: a maior vista é a mais certa (a resposta chega depois de escrita). */
  const diferenca = useRef<number | null>(null);

  // ---- o servidor: a arena na tela, perguntada de segundo em segundo (de dois em dois na luta)
  const receber = useCallback((a: Arena | null) => {
    if (!a) { if (arenaIdRef.current !== null) sumidas.current.add(arenaIdRef.current); setArena(null); onArenaRef.current(null); return; }
    const d = a.agora - Date.now();
    diferenca.current = diferenca.current === null ? d : Math.max(diferenca.current, d);
    setArena(a);
    setFalhou(null);
  }, []);

  useEffect(() => { setArena(null); setFalhou(null); saindo.current = false; }, [arenaId]);

  const intervalo = arena?.estado === 'lutando' ? 2000 : 1000;
  useEffect(() => {
    if (arenaId === null) return;
    let vivo = true;
    const buscar = async () => {
      try {
        const a = await verArena(arenaId, servidorId);
        if (vivo) receber(a);
      } catch (e) {
        if (!vivo) return;
        if ((e as { status?: number }).status === 404) {
          if (!saindo.current) avisar('A arena foi fechada.');
          receber(null);
          return;
        }
        setFalhou((e as Error).message);
      }
    };
    buscar();
    const id = setInterval(buscar, intervalo);
    return () => { vivo = false; clearInterval(id); };
  }, [arenaId, servidorId, receber, intervalo, avisar]);

  const agir = useCallback(async (a: AcaoNaArena) => {
    if (arenaId === null) return;
    if (a.acao === 'fechar') saindo.current = true;
    setOcupado(true);
    try {
      receber(await agirNaArena(arenaId, a, servidorId));
      return true;
    } catch (e) {
      saindo.current = false;
      avisar((e as Error).message);
      return false;
    } finally {
      setOcupado(false);
    }
  }, [arenaId, servidorId, receber, avisar]);

  // ---- o volume do jogo, deste computador
  const [volume, setVolume] = useState(() => {
    try { return volumeGuardado(localStorage.getItem(CHAVE_DO_VOLUME)); } catch { return 1; }
  });
  const mudarVolume = useCallback((v: number) => {
    setVolume(v);
    try { localStorage.setItem(CHAVE_DO_VOLUME, String(v)); } catch { /* sem armazenamento, vale só agora */ }
  }, []);

  // ---- os sons dos menus e o teste de som (o mesmo soco, rajada e raio da luta, no volume escolhido)
  const surdoRef = useRef(surdo);
  surdoRef.current = surdo;
  const sonsDoMenu = useRef<{ sons: ReturnType<typeof criarSonsDaLuta>; gravados: ReturnType<typeof criarSonsGravados> } | null>(null);
  useEffect(() => () => { sonsDoMenu.current?.sons.fechar(); sonsDoMenu.current?.gravados.fechar(); }, []);
  const saidaDoMenu = () => {
    sonsDoMenu.current ??= { sons: criarSonsDaLuta(volume), gravados: criarSonsGravados(volume) };
    sonsDoMenu.current.sons.volume = volume;
    sonsDoMenu.current.gravados.volume = volume;
    return sonsDoMenu.current;
  };
  const bip = (som: SomDaLuta) => { if (!surdoRef.current && volume > 0) saidaDoMenu().sons.tocar(som); };
  const testarSom = () => {
    if (volume <= 0) return;
    const { gravados, sons } = saidaDoMenu();
    gravados.tocar('golpe-soco');
    setTimeout(() => gravados.tocar('golpe-chute'), 320);
    setTimeout(() => gravados.tocar('golpe-ar'), 480);
    setTimeout(() => gravados.tocar('golpe-defesa'), 640);
    setTimeout(() => { gravados.tocar('golpe-forte'); sons.tocar('forte'); }, 960);
    setTimeout(() => gravados.tocar('disparo-ki'), 1350);
    setTimeout(() => gravados.tocar('raio-disparo'), 1750);
  };

  // ---- o palco: a canvas do tamanho do jogo, ampliada em múltiplo inteiro quando não desperdiça muito
  const canvas = useRef<HTMLCanvasElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const div = caixa.current, c = canvas.current;
    if (!div || !c) return;
    const ajustar = () => {
      const k = Math.min(div.clientWidth / TELA.largura, div.clientHeight / TELA.altura);
      const escala = Math.floor(k) >= 1 && Math.floor(k) >= k * 0.85 ? Math.floor(k) : k;
      c.style.width = `${Math.floor(TELA.largura * escala)}px`;
      c.style.height = `${Math.floor(TELA.altura * escala)}px`;
    };
    ajustar();
    const obs = new ResizeObserver(ajustar);
    obs.observe(div);
    return () => obs.disconnect();
  }, []);

  // ---- o estado dos menus
  const tela = arenaId === null ? 'titulo' : !arena ? 'abrindo' : arena.estado === 'arena' ? 'escolha' : arena.estado === 'lutando' ? 'luta' : 'fim';
  const [selTitulo, setSelTitulo] = useState(0);
  const [selFim, setSelFim] = useState(0);
  const [cursor, setCursor] = useState<IdDoLutador>('goiaba');
  const [camada, setCamada] = useState<Camada>(null);
  const [piscar, setPiscar] = useState(false);
  useEffect(() => { setCamada(null); setSelFim(0); }, [tela]);

  const meuNome = membros.find((m) => m.id === euId)?.nome ?? 'VOCÊ';
  const nomeDe = useCallback((id: number) => membros.find((m) => m.id === id)?.nome ?? 'ALGUÉM', [membros]);
  // a arena que já saiu da lista do servidor deixa de ser lembrada: o número pode voltar depois que ele reinicia
  useEffect(() => { for (const id of sumidas.current) if (!arenas.some((a) => a.id === id)) sumidas.current.delete(id); }, [arenas]);
  const itensTitulo = useMemo(() => itensDoTitulo(arenas.filter((a) => !sumidas.current.has(a.id)), euId, nomeDe), [arenas, euId, nomeDe, arenaId]);

  // o cursor começa no lutador em que você já está sentado
  const sentadoCom = arena && arena.meuLado !== null ? arena.lados[arena.meuLado]?.lutador ?? null : null;
  const cursorDaArena = useRef<number | null>(null);
  useEffect(() => {
    if (!arena || cursorDaArena.current === arena.id) return;
    cursorDaArena.current = arena.id;
    if (sentadoCom) setCursor(sentadoCom);
  }, [arena, sentadoCom]);

  const naTela: ArenaNaTela | null = arena && {
    lados: arena.lados.map((l) => (l ? { pessoa: { id: l.pessoa.id, nome: l.pessoa.nome }, lutador: l.lutador } : null)) as ArenaNaTela['lados'],
    meuLado: arena.meuLado,
    souAnfitriao: arena.souAnfitriao,
    anfitriao: arena.anfitriao.nome,
    cenario: arena.cenario,
    rounds: arena.rounds,
  };

  const convidaveis = useMemo(() => {
    if (!arena) return [];
    const naArena = new Set(arena.lados.flatMap((l) => (l ? [l.pessoa.id] : [])));
    const g = quemChamar(membros, { euId, naCall, jogando: naArena, convidado: null, recusou: null });
    const simples = (c: { membro: Membro }) => ({ id: c.membro.id, nome: c.membro.nome, foto: urlDoArquivo(c.membro.foto) });
    return linhasDoConvite({ naCall: g.naCall.map(simples), online: g.online.map(simples) }, {
      lados: naTela!.lados, chamados: arena.chamados.map((p) => p.id), recusaram: arena.recusaram,
    });
  }, [arena, membros, euId, naCall]); // eslint-disable-line react-hooks/exhaustive-deps
  const fotoDe = useFotosEmPixel(camada?.tipo === 'convite' ? convidaveis.map((l) => (ehPessoa(l) ? l.foto : null)) : []);

  // o botão LUTAR pisca duas vezes por segundo — e só ele, e só quando está na tela
  const botaoPisca = tela === 'escolha' && !!naTela?.souAnfitriao && !!naTela.lados[0] && !!naTela.lados[1] && !camada;
  useEffect(() => {
    if (!botaoPisca) return;
    const id = setInterval(() => setPiscar((p) => !p), 500);
    return () => clearInterval(id);
  }, [botaoPisca]);

  const opcoesMudaArena = tela === 'escolha' && !!arena?.souAnfitriao;

  // ---- o desenho dos menus: a cada mudança, e não em laço
  const quadro = useMemo(() => criarQuadro(TELA.largura, TELA.altura), []);
  const regioes = useRef<Regiao[]>([]);
  useLayoutEffect(() => {
    if (tela === 'luta') return;
    let r: Regiao[] = [];
    if (tela === 'titulo' || tela === 'abrindo') {
      const recado = tela === 'abrindo' ? (falhou ? `NÃO CONSEGUI ABRIR A ARENA: ${falhou}` : 'ABRINDO A ARENA...') : aviso;
      r = desenharTitulo(quadro, { itens: tela === 'titulo' ? itensTitulo : [], selecionado: Math.min(selTitulo, itensTitulo.length - 1), aviso: recado });
    } else if (tela === 'escolha' && naTela) {
      r = desenharEscolha(quadro, { ...montarEscolha(naTela, cursor, meuNome, piscar), aviso });
    } else if (tela === 'fim' && arena) {
      r = desenharFim(quadro, {
        vencedor: arena.vencedor, motivo: arena.motivo, cenario: arena.cenario,
        lados: arena.lados.map((l): LadoNoFim => (l ? { jogador: l.pessoa.nome, lutador: l.lutador } : null)) as [LadoNoFim, LadoNoFim],
        itens: itensDoFim(arena.meuLado !== null), selecionado: selFim, aviso,
      });
    }
    if (camada?.tipo === 'convite') {
      r = desenharConvite(quadro, {
        selecionada: camada.sel,
        linhas: convidaveis.map((l) => (ehPessoa(l) ? { tipo: 'pessoa' as const, nome: l.nome, foto: fotoDe(l.foto), situacao: l.situacao } : l)),
      });
    } else if (camada?.tipo === 'opcoes') {
      r = desenharOpcoes(quadro, { linha: camada.linha, cenario: arena?.cenario ?? 'torneio', rounds: arena?.rounds ?? 2, volume, mudaArena: opcoesMudaArena });
    } else if (camada?.tipo === 'pergunta') {
      r = desenharPergunta(quadro, { ...PERGUNTAS[camada.qual], selecionado: camada.sel });
    }
    regioes.current = r;
    mostrar(canvas.current, quadro);
  });

  // ---- o que cada comando faz, tela por tela
  const perguntaNaLuta = useRef<DadosDaPergunta | null>(null);
  perguntaNaLuta.current = tela === 'luta' && camada?.tipo === 'pergunta' ? { ...PERGUNTAS[camada.qual], selecionado: camada.sel } : null;

  const primeiraPessoa = () => Math.max(0, convidaveis.findIndex((l) => ehPessoa(l)));
  const linhaPode = (i: number) => opcoesMudaArena || i >= 2;

  const executar = (c: Comando) => {
    // as camadas por cima valem primeiro
    if (camada?.tipo === 'pergunta') {
      if (c === 'cima' || c === 'baixo') { bip('cursor'); setCamada({ ...camada, sel: camada.sel === 0 ? 1 : 0 }); }
      else if (c === 'voltar') { bip('voltar'); setCamada(null); }
      else if (c === 'confirmar') {
        if (camada.sel === 0) { bip('voltar'); setCamada(null); return; }
        bip('escolher');
        setCamada(null);
        if (camada.qual === 'fechar') void agir({ acao: 'fechar' }).then((ok) => { if (ok) onArena(null); });
        else if (camada.qual === 'sairDaArena') void agir({ acao: 'levantar' }).then(() => onArena(null));
        else if (camada.qual === 'desistir') void agir({ acao: 'abandonar' });
        else onArena(null);
      }
      return;
    }
    if (camada?.tipo === 'convite') {
      if (c === 'cima' || c === 'baixo') {
        bip('cursor');
        setCamada({ ...camada, sel: andarNaLista(camada.sel, c === 'baixo' ? 1 : -1, convidaveis.length, (i) => ehPessoa(convidaveis[i])) });
      } else if (c === 'voltar' || c === 'convidar') { bip('voltar'); setCamada(null); }
      else if (c === 'confirmar') {
        const l = convidaveis[camada.sel];
        const o = ehPessoa(l) ? aoConfirmarPessoa(l) : null;
        if (!o || !ehPessoa(l)) return;
        bip('escolher');
        void agir({ acao: o, alvo: l.id });
      }
      return;
    }
    if (camada?.tipo === 'opcoes') {
      const mudar = (passo: 1 | -1) => {
        if (camada.linha === 0 && arena) { bip('cursor'); void agir({ acao: 'configurar', cenario: cenarioAoLado(arena.cenario, passo) }); }
        else if (camada.linha === 1 && arena) { bip('cursor'); void agir({ acao: 'configurar', rounds: arena.rounds === 1 ? 2 : 1 }); }
        else if (camada.linha === 2) { mudarVolume(volumeAoLado(volume, passo)); bip('cursor'); }
      };
      if (c === 'cima' || c === 'baixo') { bip('cursor'); setCamada({ ...camada, linha: andarNaLista(camada.linha, c === 'baixo' ? 1 : -1, 4, linhaPode) }); }
      else if (c === 'esquerda' || c === 'direita') mudar(c === 'direita' ? 1 : -1);
      else if (c === 'testar') testarSom();
      else if (c === 'voltar' || c === 'opcoes') { bip('voltar'); setCamada(null); }
      else if (c === 'confirmar') {
        if (camada.linha === 3) { bip('voltar'); setCamada(null); }
        else if (camada.linha === 2) testarSom();
        else mudar(1);
      }
      return;
    }
    // as telas
    if (tela === 'titulo') {
      if (c === 'cima' || c === 'baixo') { bip('cursor'); setSelTitulo((s) => andarNaLista(s, c === 'baixo' ? 1 : -1, itensTitulo.length)); }
      else if (c === 'voltar') onFechar();
      else if (c === 'opcoes') { bip('escolher'); setCamada({ tipo: 'opcoes', linha: 2 }); }
      else if (c === 'confirmar') {
        const item = itensTitulo[Math.min(selTitulo, itensTitulo.length - 1)];
        if (!item) return;
        bip('escolher');
        if (item.acao === 'sair') onFechar();
        else if (item.acao === 'opcoes') setCamada({ tipo: 'opcoes', linha: 2 });
        else if (item.acao === 'arena' && item.arena !== undefined) onArena(item.arena);
        else if (item.acao === 'lutar' && !ocupado) {
          setOcupado(true);
          abrirArena({}, servidorId)
            .then((a) => { setCursor('goiaba'); onArena(a.id); })
            .catch((e) => avisar((e as Error).message))
            .finally(() => setOcupado(false));
        }
      }
      return;
    }
    if (tela === 'abrindo') {
      if (c === 'voltar') onArena(null);
      return;
    }
    if (tela === 'escolha' && naTela) {
      const lado = ladoDoCursor(naTela);
      if (c === 'cima' || c === 'baixo' || c === 'esquerda' || c === 'direita') {
        if (lado === null) return;
        bip('cursor');
        setCursor((id) => andarNaGrade(id, c));
      } else if (c === 'confirmar') {
        const o = aoConfirmarNaGrade(naTela, cursor);
        if (!o || ocupado) return;
        bip('escolher');
        void agir(o === 'comecar' ? { acao: 'comecar' } : { acao: 'escolher', lutador: cursor, protocolo: PROTOCOLO_DA_LUTA });
      } else if (c === 'convidar') {
        if (!naTela.souAnfitriao) return;
        bip('escolher');
        setCamada({ tipo: 'convite', sel: primeiraPessoa() });
      } else if (c === 'opcoes') {
        bip('escolher');
        setCamada({ tipo: 'opcoes', linha: naTela.souAnfitriao ? 0 : 2 });
      } else if (c === 'voltar') {
        bip('voltar');
        if (naTela.souAnfitriao) setCamada({ tipo: 'pergunta', qual: 'fechar', sel: 0 });
        else if (naTela.meuLado !== null) setCamada({ tipo: 'pergunta', qual: 'sairDaArena', sel: 0 });
        else onArena(null);
      }
      return;
    }
    if (tela === 'luta' && arena) {
      if (c === 'voltar') { bip('voltar'); setCamada({ tipo: 'pergunta', qual: arena.meuLado !== null ? 'desistir' : 'pararDeAssistir', sel: 0 }); }
      return;
    }
    if (tela === 'fim' && arena) {
      const itens = itensDoFim(arena.meuLado !== null);
      if (c === 'cima' || c === 'baixo') { bip('cursor'); setSelFim((s) => andarNaLista(s, c === 'baixo' ? 1 : -1, itens.length)); }
      else if (c === 'confirmar' || c === 'voltar') {
        const item = c === 'voltar' ? itens[itens.length - 1] : itens[Math.min(selFim, itens.length - 1)];
        bip(c === 'voltar' ? 'voltar' : 'escolher');
        if (item.acao === 'revanche' || item.acao === 'trocar') {
          const comecarJa = item.acao === 'revanche' && arena.souAnfitriao;
          void agir({ acao: 'revanche' }).then((ok) => { if (ok && comecarJa) void agir({ acao: 'comecar' }); });
        } else if (arena.souAnfitriao) void agir({ acao: 'fechar' }).then((ok) => { if (ok) onArena(null); });
        else onArena(null);
      }
    }
  };
  const executarRef = useRef(executar);
  executarRef.current = executar;

  // ---- o teclado: nos menus, as teclas de menu; na luta, só o Esc (J, K e O lá são golpes)
  useEffect(() => {
    const aoApertar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return;
      const c = comandoDaTecla(e.code);
      if (!c) return;
      const naLuta = telaRef.current === 'luta' && camadaRef.current?.tipo !== 'pergunta';
      if (naLuta && e.code !== 'Escape') return;
      e.preventDefault();
      if (e.repeat && (c === 'confirmar' || c === 'voltar')) return;
      executarRef.current(c);
    };
    window.addEventListener('keydown', aoApertar);
    return () => window.removeEventListener('keydown', aoApertar);
  }, []);
  const telaRef = useRef(tela);
  telaRef.current = tela;
  const camadaRef = useRef(camada);
  camadaRef.current = camada;

  // ---- o mouse: apontar escolhe, clicar confirma — pelas regiões que o desenho devolveu
  const pontoNoJogo = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) * TELA.largura) / r.width, ((e.clientY - r.top) * TELA.altura) / r.height] as const;
  };
  const apontar = (e: React.MouseEvent<HTMLCanvasElement>, clicou: boolean) => {
    const [x, y] = pontoNoJogo(e);
    const reg = regiaoEm(regioes.current, x, y);
    e.currentTarget.style.cursor = reg ? 'pointer' : 'default';
    if (!reg) return;
    const a = reg.alvo;
    if (a.tipo === 'item') {
      if (camada?.tipo === 'pergunta') { if (camada.sel !== a.indice) setCamada({ ...camada, sel: a.indice }); }
      else if (tela === 'titulo' && selTitulo !== a.indice) setSelTitulo(a.indice);
      else if (tela === 'fim' && selFim !== a.indice) setSelFim(a.indice);
      if (clicou) {
        // o clique confirma o item apontado, e não o que estava escolhido antes
        if (camada?.tipo === 'pergunta') { const nova = { ...camada, sel: a.indice }; camadaRef.current = nova; setCamada(nova); }
        setTimeout(() => executarRef.current('confirmar'), 0);
      }
    } else if (a.tipo === 'lutador') {
      if (naTela && ladoDoCursor(naTela) !== null && cursor !== a.id) setCursor(a.id);
      if (clicou) setTimeout(() => executarRef.current('confirmar'), 0);
    } else if (a.tipo === 'pessoa') {
      if (camada?.tipo === 'convite' && camada.sel !== a.indice) setCamada({ ...camada, sel: a.indice });
      if (clicou) setTimeout(() => executarRef.current('confirmar'), 0);
    } else if (a.tipo === 'linha') {
      if (camada?.tipo === 'opcoes' && camada.linha !== a.indice && linhaPode(a.indice)) setCamada({ ...camada, linha: a.indice });
      if (clicou) setTimeout(() => executarRef.current(a.passo ? (a.passo === 1 ? 'direita' : 'esquerda') : 'confirmar'), 0);
    } else if (clicou) {
      if (a.tipo === 'botao') executar(naTela?.lados[0] && naTela.lados[1] ? 'confirmar' : 'convidar');
      else if (a.tipo === 'opcoes') executar('opcoes');
      else if (a.tipo === 'testar') testarSom();
    }
  };

  return (
    <div className="tela-da-luta">
      <div ref={caixa} className="luta-palco">
        <canvas ref={canvas} width={TELA.largura} height={TELA.altura} className="luta-canvas"
          onMouseMove={(e) => apontar(e, false)} onClick={(e) => apontar(e, true)} />
        {tela === 'luta' && arena && (
          <Luta key={`${arena.id}-${arena.rodada}`} arena={arena} servidorId={servidorId} diferenca={diferenca} surdo={surdo}
            volume={volume} canvas={canvas} pergunta={perguntaNaLuta} regioes={regioes} onAgir={agir} />
        )}
      </div>
      {live && <div className="xadrez-live">{live}</div>}
    </div>
  );
}

// ---- a luta ---------------------------------------------------------------------------------

function Luta({ arena, servidorId, diferenca, surdo, volume, canvas, pergunta, regioes, onAgir }: {
  arena: Arena; servidorId: number; diferenca: MutableRefObject<number | null>; surdo: boolean; volume: number;
  canvas: MutableRefObject<HTMLCanvasElement | null>;
  /** A pergunta de desistir, desenhada por cima da luta enquanto está aberta. */
  pergunta: MutableRefObject<DadosDaPergunta | null>;
  regioes: MutableRefObject<Regiao[]>;
  onAgir: (a: AcaoNaArena) => void;
}) {
  const [l0, l1] = arena.lados;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  /** Os sons desta luta, para o volume mudar o que já existe (eles nascem dentro do laço). */
  const saidas = useRef<{ sons: ReturnType<typeof criarSonsDaLuta>; gravados: ReturnType<typeof criarSonsGravados> } | null>(null);
  useEffect(() => {
    if (!saidas.current) return;
    saidas.current.sons.volume = volume;
    saidas.current.gravados.volume = volume;
  }, [volume]);
  const souLutador = arena.meuLado !== null;
  const inicial = useMemo(() => criarLuta({
    lutadores: [l0?.lutador ?? 'goiaba', l1?.lutador ?? 'goiaba'], cenario: arena.cenario, roundsParaVencer: arena.rounds, semente: arena.semente,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const arenaRef = useRef(arena);
  arenaRef.current = arena;
  const surdoRef = useRef(surdo);
  surdoRef.current = surdo;
  const agirRef = useRef(onAgir);
  agirRef.current = onAgir;

  useEffect(() => {
    let vivo = true;
    let conexao: 'conectando' | 'ok' | 'caiu' = 'conectando';
    preaquecer(inicial.lutadores[0].id, inicial.lutadores[0].cor);
    preaquecer(inicial.lutadores[1].id, inicial.lutadores[1].cor);

    // ---- a sala da luta no LiveKit: só dados, e volta sozinha se cair (como a da corrida)
    const ouvintes = new Set<(d: Uint8Array) => void>();
    let sala: Room | null = null;
    let tentativa = 0;
    let espera: ReturnType<typeof setTimeout> | undefined;
    const lados = () => arenaRef.current.lados.map((l) => l?.pessoa.id ?? null);
    const transporte: Transporte = {
      enviar(dados, confiavel) {
        const room = sala;
        if (!room || room.state !== 'connected') return;
        room.localParticipant.publishData(dados as Uint8Array<ArrayBuffer>, { reliable: confiavel, topic: TOPICO }).catch(() => { /* a redundância cobre */ });
      },
      aoReceber(cb) { ouvintes.add(cb); return () => ouvintes.delete(cb); },
    };
    const aoDado = (dados: Uint8Array, participante?: RemoteParticipant, _t?: unknown, topico?: string) => {
      if (topico !== TOPICO || !participante) return;
      const conta = contaDaIdentidade(participante.identity);
      // botões só de quem está lutando; pedido de estado pode vir da plateia
      if (conta === null) return;
      if (!lados().includes(conta) && dados[1] !== 3) return;
      for (const cb of ouvintes) cb(dados);
    };
    const conectar = async () => {
      if (!vivo) return;
      const room = new Room({ adaptiveStream: false, dynacast: false });
      sala = room;
      room.on(RoomEvent.DataReceived, aoDado);
      room.on(RoomEvent.Reconnecting, () => { if (sala === room) conexao = 'caiu'; });
      room.on(RoomEvent.Reconnected, () => { if (sala === room) conexao = 'ok'; });
      room.on(RoomEvent.Disconnected, (motivo) => {
        if (!vivo || sala !== room) return;
        anotar('aviso', 'luta', `caí da sala da luta (motivo ${motivo ?? 'nenhum'}); tentando de novo`);
        conexao = 'caiu';
        agendar();
      });
      try {
        const { url, token } = await pedirTokenDaLuta(arenaRef.current.id, servidorId);
        if (!vivo || sala !== room) return;
        await room.connect(url, token, { autoSubscribe: false });
        if (!vivo || sala !== room) { void room.disconnect(); return; }
        tentativa = 0;
        conexao = 'ok';
      } catch (e) {
        anotar('erro', 'luta', `não entrei na sala da luta (tentativa ${tentativa + 1}): ${(e as Error).message}`);
        if (vivo && sala === room) { conexao = 'caiu'; agendar(); }
      }
    };
    const agendar = () => {
      clearTimeout(espera);
      if (!vivo) return;
      espera = setTimeout(() => {
        const velha = sala;
        sala = null;
        velha?.removeAllListeners();
        void velha?.disconnect();
        void conectar();
      }, Math.min(8000, 1000 * 2 ** tentativa++));
    };
    void conectar();

    // ---- a simulação: quem luta roda a sessão com volta no tempo; quem assiste, só o confirmado
    const sessao = souLutador
      ? new SessaoDaLuta({
        jogo: JOGO, inicial, lado: arena.meuLado as 0 | 1, transporte,
        aoDessincronizar: (q) => anotar('erro', 'luta', `as duas telas da luta divergiram no quadro ${q}`),
      })
      : null;
    const plateia = souLutador ? null : new EspectadorDaLuta({ jogo: JOGO, inicial: null, transporte });
    const teclado = souLutador ? ouvirTeclado(window) : null;
    const sons = criarSonsDaLuta(volumeRef.current);
    const gravados = criarSonsGravados(volumeRef.current);
    saidas.current = { sons, gravados };
    const vistos = new Set<string>();
    const quadro = criarQuadro(TELA.largura, TELA.altura);
    let resultadoMandado = false;
    let tique = 0;
    const vs = {
      lados: arena.lados.map((l) => ({ jogador: l?.pessoa.nome ?? '?', lutador: l?.lutador ?? 'goiaba' })) as [{ jogador: string; lutador: IdDoLutador }, { jogador: string; lutador: IdDoLutador }],
      cenario: arena.cenario, rounds: arena.rounds,
    };

    const quadroDoRelogio = () => {
      const inicio = arenaRef.current.inicioEm ?? 0;
      return Math.floor(((Date.now() + (diferenca.current ?? 0)) - inicio) * 60 / 1000);
    };

    // A simulação anda num relógio próprio, e não no do desenho: com a janela escondida o
    // `requestAnimationFrame` para, e a luta do outro lado ficaria esperando por nós. Com a
    // pergunta de desistir aberta, os botões ficam soltos: quem pensa em sair não luta sem querer.
    const passo = setInterval(() => {
      const alvo = quadroDoRelogio();
      if (sessao) { if (alvo > 0) sessao.avancarAte(alvo, pergunta.current ? 0 : teclado!.botoes()); }
      else plateia!.avancar();
    }, 8);

    let pedido = 0;
    const desenhar = () => {
      pedido = requestAnimationFrame(desenhar);
      const estado = sessao ? sessao.estado : plateia!.estado;
      tique++;
      const antes = quadroDoRelogio() < 0;
      if (antes) {
        // os segundos entre o começar e a luta valer: a apresentação do confronto
        desenharVs(quadro, vs);
      } else if (!estado) {
        quadro.px.fill(0xff16121a);
      } else {
        const nomes: [string, string] = [FICHAS[estado.lutadores[0].id].nome.toUpperCase(), FICHAS[estado.lutadores[1].id].nome.toUpperCase()];
        desenharLuta(quadro, estado, { nomes, tique });
        const toques = sonsNovos(estado, vistos);
        if (!surdoRef.current) {
          for (const t of toques) {
            if (ehGravado(t.som)) gravados.tocar(t.som, t.chave);
            else sons.tocar(t.som, t.pan);
          }
        }
        // o grito cala quando a transformação completa ou é interrompida (e com o fone desligado)
        for (const chave of toques.calar ?? []) gravados.calar(chave);
        // Acabou para mim: manda o resultado uma vez, com a impressão digital para o servidor comparar.
        if (sessao && estado.fase === 'fimDaLuta' && estado.faseQuadro > 60 && !resultadoMandado && arenaRef.current.estado === 'lutando') {
          resultadoMandado = true;
          agirRef.current({ acao: 'resultado', vencedor: estado.vencedor as 0 | 1 | 2, quadros: estado.quadro, impressao: impressao(estado) });
        }
      }
      const semOuvir = sessao ? sessao.msSemOuvir() : plateia ? Date.now() - plateia.ouvidoEm : 0;
      const recado = conexao === 'caiu' ? 'A CONEXÃO CAIU. VOLTANDO...'
        : antes ? null
          : !estado ? 'PEGANDO A LUTA...'
            : estado.fase !== 'fimDaLuta' && semOuvir > 2500 ? (sessao ? 'SEM SINAL DO OUTRO LUTADOR...' : 'SEM SINAL DOS LUTADORES...')
              : null;
      if (recado) desenharAvisoNaLuta(quadro, recado);
      regioes.current = pergunta.current ? desenharPergunta(quadro, pergunta.current) : [];
      mostrar(canvas.current, quadro);
    };
    pedido = requestAnimationFrame(desenhar);

    return () => {
      vivo = false;
      clearInterval(passo);
      cancelAnimationFrame(pedido);
      clearTimeout(espera);
      teclado?.parar();
      sessao?.fechar();
      plateia?.fechar();
      sons.fechar();
      gravados.fechar();
      const room = sala;
      sala = null;
      room?.removeAllListeners();
      void room?.disconnect();
      regioes.current = [];
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

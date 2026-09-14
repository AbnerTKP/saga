import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Room, RoomEvent, type RemoteParticipant } from 'livekit-client';
import { agirNaArena, pedirTokenDaLuta, verArena, type AcaoNaArena, type Arena, type Membro } from '../api';
import { quemChamar } from '../jogos';
import { contaDaIdentidade } from '../pessoas';
import { anotar } from '../registro';
import { personagemDe, preaquecer } from '../dragao/animacoes';
import { sprite } from '../dragao/boneco';
import { desenharCenario } from '../dragao/cenario';
import { cenarioPronto, desenharLuta, retratoPronto } from '../dragao/desenho';
import { FICHAS } from '../dragao/fichas';
import { avancar, clonar, criarLuta, impressao } from '../dragao/luta';
import { MUNDO, TELA } from '../dragao/medidas';
import { sonsNovos } from '../dragao/ouvidos';
import { PROTOCOLO_DA_LUTA } from '../dragao/protocolo';
import { criarQuadro, limpar, type Quadro } from '../dragao/quadro';
import { EspectadorDaLuta, SessaoDaLuta, type Jogo, type Transporte } from '../dragao/rede';
import { criarSonsDaLuta } from '../dragao/sons';
import { criarSonsGravados, ehGravado } from '../dragao/somDeArquivo';
import { LEGENDA, ouvirTeclado } from '../dragao/teclado';
import { IDS_DOS_CENARIOS, IDS_DOS_LUTADORES, type EstadoDaLuta, type IdDoCenario, type IdDoLutador } from '../dragao/tipos';
import * as goiabaM from '../dragao/personagens/goiaba';
import * as vegetalM from '../dragao/personagens/vegetal';
import * as picoleM from '../dragao/personagens/picole';
import * as geladeiraM from '../dragao/personagens/geladeira';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

const JOGO: Jogo<EstadoDaLuta> = { avancar, clonar, impressao };
const TOPICO = 'luta';
const VITRINES = { goiaba: goiabaM.vitrine, vegetal: vegetalM.vitrine, picole: picoleM.vitrine, geladeira: geladeiraM.vitrine };
const NOMES_DOS_CENARIOS: Record<IdDoCenario, string> = { torneio: 'Torneio', planeta: 'Planeta Verde', ilha: 'Ilha da Tartaruga', canion: 'Cânion' };
const nomeDoLutador = (id: IdDoLutador) => FICHAS[id].nome;

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

/** O lutador de corpo inteiro, na pose parada da vitrine dele (a do lado 1 olha para a esquerda). */
function LutadorDePe({ id, espelhar }: { id: IdDoLutador; espelhar?: boolean }) {
  return (
    <QuadroNaTela chave={`${id}`} className="luta-sprite" style={espelhar ? { transform: 'scaleX(-1)' } : undefined}
      quadro={() => sprite(personagemDe(id), VITRINES[id].parado)} />
  );
}

/** Um pedaço do cenário, para escolher: o meio dele, onde se luta. */
export function miniaturaDoCenario(id: IdDoCenario): Quadro {
  const q = criarQuadro(TELA.largura, TELA.altura);
  desenharCenario(q, cenarioPronto(id), Math.round((MUNDO - TELA.largura) / 2), 0);
  return q;
}

/**
 * O Dragão Quadrado de uma arena, do começo ao fim: a arena (quem luta com quem, onde, e quem
 * chamar), a luta e o fim. Como a corrida, é a mesma tela, e ela pergunta ao servidor da arena.
 */
export function TelaDaLuta({ arenaId, servidorId, euId, membros, naCall, surdo, live, onFechar, onAviso }: {
  arenaId: number;
  servidorId: number;
  euId: number;
  membros: Membro[];
  naCall: Set<number>;
  surdo: boolean;
  live?: ReactNode;
  onFechar: () => void;
  onAviso: (tipo: 'erro' | 'info', texto: string) => void;
}) {
  const [arena, setArena] = useState<Arena | null>(null);
  const [falhou, setFalhou] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;
  const avisarRef = useRef(onAviso);
  avisarRef.current = onAviso;
  const saindo = useRef(false);
  /** A diferença entre o relógio do servidor e o daqui: a maior vista é a mais certa (a resposta chega depois de escrita). */
  const diferenca = useRef<number | null>(null);

  const receber = useCallback((a: Arena | null) => {
    if (!a) { fecharRef.current(); return; }
    const d = a.agora - Date.now();
    diferenca.current = diferenca.current === null ? d : Math.max(diferenca.current, d);
    setArena(a);
    setFalhou(null);
  }, []);

  const intervalo = arena?.estado === 'lutando' ? 2000 : 1000;
  useEffect(() => {
    let vivo = true;
    const buscar = async () => {
      try {
        const a = await verArena(arenaId, servidorId);
        if (vivo) receber(a);
      } catch (e) {
        if (!vivo) return;
        if ((e as { status?: number }).status === 404) {
          if (!saindo.current) avisarRef.current('info', 'A arena foi fechada.');
          fecharRef.current();
          return;
        }
        setFalhou((e as Error).message);
      }
    };
    buscar();
    const id = setInterval(buscar, intervalo);
    return () => { vivo = false; clearInterval(id); };
  }, [arenaId, servidorId, receber, intervalo]);

  const agir = useCallback(async (a: AcaoNaArena) => {
    if (a.acao === 'fechar') saindo.current = true;
    setOcupado(true);
    try {
      receber(await agirNaArena(arenaId, a, servidorId));
    } catch (e) {
      saindo.current = false;
      avisarRef.current('erro', (e as Error).message);
    } finally {
      setOcupado(false);
    }
  }, [arenaId, servidorId, receber]);

  const [armado, setArmado] = useState(false);
  useEffect(() => {
    if (!armado) return;
    const id = setTimeout(() => setArmado(false), 4000);
    return () => clearTimeout(id);
  }, [armado]);

  const lutador = arena?.meuLado !== null && arena?.meuLado !== undefined;
  const nome = (i: 0 | 1) => arena?.lados[i]?.pessoa.nome ?? '…';
  const titulo = !arena ? null : arena.estado === 'arena' ? `arena de ${arena.anfitriao.nome}` : `${nome(0)} × ${nome(1)}`;

  return (
    <div className="tela-do-xadrez tela-da-corrida tela-da-luta">
      <header className="stage-head">
        <Icon name="controle" />
        <span className="strong">Dragão Quadrado</span>
        {titulo && <span className="xadrez-titulo">{titulo}</span>}
        {arena && arena.estado !== 'arena' && !lutador && <span className="selo-assistindo"><Icon name="olho" size={12} /> assistindo</span>}
        <span style={{ flex: 1 }} />
        {arena && arena.plateia.length > 0 && (
          <span className="xadrez-plateia" title={`Assistindo: ${arena.plateia.map((p) => p.nome).join(', ')}`}>
            <Icon name="olho" size={13} />
            <span>{arena.plateia.length === 1 ? `${arena.plateia[0].nome} assistindo` : `${arena.plateia.length} assistindo`}</span>
          </span>
        )}
        {arena?.estado === 'lutando' && (lutador ? (
          armado ? (
            <button type="button" className="primary destrutivo sm" disabled={ocupado} autoFocus
              onClick={() => { setArmado(false); void agir({ acao: 'abandonar' }); }}>
              Confirmar: desistir
            </button>
          ) : (
            <button type="button" className="perigo sm" disabled={ocupado} onClick={() => setArmado(true)}>Desistir</button>
          )
        ) : (
          <button type="button" className="secundario sm" onClick={onFechar}>Parar de assistir</button>
        ))}
      </header>
      {!arena ? (
        <div className="corrida-area">
          <div className="xadrez-carregando muted">{falhou ? `Não consegui abrir a arena (${falhou}). Tentando de novo…` : 'Abrindo a arena…'}</div>
        </div>
      ) : arena.estado === 'arena' ? (
        <div className="corrida-area">
          <ArenaDeEscolha arena={arena} euId={euId} ocupado={ocupado} membros={membros} naCall={naCall} onAgir={agir} onSair={onFechar} />
        </div>
      ) : (
        <Luta key={`${arena.id}-${arena.rodada}`} arena={arena} servidorId={servidorId} diferenca={diferenca} surdo={surdo}
          ocupado={ocupado} live={live} onAgir={agir} onSair={onFechar} />
      )}
    </div>
  );
}

// ---- a arena: quem luta com quem, onde e quantos rounds -----------------------------------------

function ArenaDeEscolha({ arena, euId, ocupado, membros, naCall, onAgir, onSair }: {
  arena: Arena; euId: number; ocupado: boolean; membros: Membro[]; naCall: Set<number>;
  onAgir: (a: AcaoNaArena) => void; onSair: () => void;
}) {
  const sentados = arena.lados.filter(Boolean).length;
  const naArena = new Set(arena.lados.flatMap((l) => (l ? [l.pessoa.id] : [])));
  const chamados = new Set(arena.chamados.map((p) => p.id));
  const lista = quemChamar(membros, { euId, naCall, jogando: naArena, convidado: null, recusou: null });
  const meu = arena.meuLado !== null ? arena.lados[arena.meuLado]?.lutador ?? null : null;
  const podeEscolher = arena.meuLado !== null || arena.lados.some((l) => !l);
  const escolher = (id: IdDoLutador) => onAgir({ acao: 'escolher', lutador: id, protocolo: PROTOCOLO_DA_LUTA });
  const miniaturas = useMemo(() => Object.fromEntries(IDS_DOS_CENARIOS.map((id) => [id, () => miniaturaDoCenario(id)])), []);

  const linha = (m: Membro) => {
    const situacao = naArena.has(m.id) ? 'naArena' : chamados.has(m.id) ? 'chamado' : arena.recusaram.includes(m.id) ? 'recusou' : 'livre';
    return (
      <div key={m.id} className={`xadrez-chamavel ${situacao === 'naArena' ? 'apagada' : ''}`}>
        <Avatar nome={m.nome} foto={m.foto} enquadramento={m.enquadramento?.foto} />
        <span className="xadrez-chamavel-nome">{m.nome}</span>
        {situacao === 'naArena' ? (
          <span className="xadrez-jogando">na arena</span>
        ) : situacao === 'chamado' ? (
          <span className="xadrez-chamado">
            chamado…
            <button type="button" className="link" disabled={ocupado} onClick={() => onAgir({ acao: 'cancelarConvite', alvo: m.id })}>cancelar</button>
          </span>
        ) : (
          <span className="xadrez-chamado">
            {situacao === 'recusou' && <span>recusou</span>}
            <button type="button" className="botao-de-linha" disabled={ocupado || sentados === 2} onClick={() => onAgir({ acao: 'chamar', alvo: m.id })}>
              {situacao === 'recusou' ? 'De novo' : 'Chamar'}
            </button>
          </span>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="luta-arena">
        <div className="luta-lados">
          {([0, 1] as const).map((i) => {
            const lado = arena.lados[i];
            return (
              <div key={i} className={`luta-lado ${arena.meuLado === i ? 'meu' : ''} ${lado ? '' : 'livre'}`}>
                <span className="luta-lado-rotulo">{i === 0 ? 'Jogador 1' : 'Jogador 2'}</span>
                {lado ? (
                  <>
                    <LutadorDePe id={lado.lutador} espelhar={i === 1} />
                    <span className="luta-lado-nome">{nomeDoLutador(lado.lutador)}</span>
                    <span className="corrida-quem">
                      <Avatar nome={lado.pessoa.nome} foto={lado.pessoa.foto} />
                      <span className="corrida-quem-nome">{lado.pessoa.nome}</span>
                      {lado.pessoa.id === euId && <span className="muted">· você</span>}
                    </span>
                  </>
                ) : (
                  <span className="luta-lado-vazio">{arena.meuLado === null ? 'Lugar livre: escolha um lutador abaixo.' : 'Esperando alguém chegar.'}</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="luta-escolha">
          {IDS_DOS_LUTADORES.map((id) => (
            <button key={id} type="button" className={`luta-escolher ${meu === id ? 'escolhido' : ''}`} disabled={ocupado || !podeEscolher}
              onClick={() => meu !== id && escolher(id)} title={FICHAS[id].estilo}>
              <QuadroNaTela chave={`r-${id}`} className="luta-retrato" quadro={() => retratoPronto(id)} />
              <span className="luta-escolher-textos">
                <span className="luta-escolher-nome">{nomeDoLutador(id)}</span>
                <span className="muted small">{FICHAS[id].estilo}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="luta-legenda">
          {LEGENDA.map(([tecla, faz]) => <span key={tecla}><kbd>{tecla}</kbd> {faz}</span>)}
        </div>
      </div>
      <div className="xadrez-lateral xadrez-lobby corrida-lateral">
        <div className="xadrez-cabecalho">Arena</div>
        <div className="xadrez-escolha">
          <span className="xadrez-rotulo">Cenário</span>
          <div className="corrida-pistas">
            {IDS_DOS_CENARIOS.map((id) => (
              <button key={id} type="button" className={`corrida-pista-opcao ${arena.cenario === id ? 'escolhida' : ''}`}
                disabled={ocupado || !arena.souAnfitriao} onClick={() => arena.cenario !== id && onAgir({ acao: 'configurar', cenario: id })}>
                <QuadroNaTela chave={`c-${id}`} className="luta-miniatura" liso quadro={miniaturas[id]} />
                <span className="corrida-pista-nome">{NOMES_DOS_CENARIOS[id]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="xadrez-escolha">
          <span className="xadrez-rotulo">Rounds</span>
          <div className="xadrez-chips">
            {([1, 2] as const).map((r) => (
              <button key={r} type="button" className={`xadrez-escolher ${arena.rounds === r ? 'escolhido' : ''}`}
                disabled={ocupado || !arena.souAnfitriao} onClick={() => arena.rounds !== r && onAgir({ acao: 'configurar', rounds: r })}>
                {r === 1 ? 'Luta única' : 'Melhor de 3'}
              </button>
            ))}
          </div>
        </div>
        {arena.souAnfitriao ? (
          <>
            <div className="xadrez-risco" />
            <div className="xadrez-cabecalho">Chamar para lutar</div>
            <div className="xadrez-chamaveis">
              {lista.naCall.length > 0 && <span className="xadrez-grupo">Na call</span>}
              {lista.naCall.map((c) => linha(c.membro))}
              {lista.online.length > 0 && <span className="xadrez-grupo">Online no servidor</span>}
              {lista.online.map((c) => linha(c.membro))}
              {lista.naCall.length === 0 && lista.online.length === 0 && <span className="muted small">Ninguém online para chamar agora.</span>}
            </div>
          </>
        ) : (
          <span className="muted small corrida-espera">
            {arena.meuLado !== null ? `Esperando ${arena.anfitriao.nome} começar.` : 'Escolha um lutador para entrar no lugar livre.'}
          </span>
        )}
        <span className="corrida-contagem">{sentados} de 2 na arena</span>
        <div className="xadrez-botoes">
          {arena.souAnfitriao && (
            <button type="button" className="primary" disabled={ocupado || sentados < 2} onClick={() => onAgir({ acao: 'comecar' })}>Lutar</button>
          )}
          {arena.souAnfitriao ? (
            <button type="button" className="secundario" disabled={ocupado} onClick={() => onAgir({ acao: 'fechar' })}>Fechar arena</button>
          ) : arena.meuLado !== null ? (
            <button type="button" className="secundario" disabled={ocupado} onClick={() => { onAgir({ acao: 'levantar' }); onSair(); }}>Sair da arena</button>
          ) : (
            <button type="button" className="secundario" onClick={onSair}>Fechar</button>
          )}
        </div>
      </div>
    </>
  );
}

// ---- a luta ---------------------------------------------------------------------------------

function Luta({ arena, servidorId, diferenca, surdo, ocupado, live, onAgir, onSair }: {
  arena: Arena; servidorId: number; diferenca: MutableRefObject<number | null>; surdo: boolean; ocupado: boolean;
  live?: ReactNode; onAgir: (a: AcaoNaArena) => void; onSair: () => void;
}) {
  const [l0, l1] = arena.lados;
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
  const canvas = useRef<HTMLCanvasElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [conexao, setConexao] = useState<'conectando' | 'ok' | 'caiu'>('conectando');

  // O canvas cresce em múltiplo inteiro quando isso não desperdiça muito palco (pixel do mesmo
  // tamanho); senão ocupa o palco inteiro — pixel um pouco desigual é melhor que luta pequena.
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

  useEffect(() => {
    let vivo = true;
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
      room.on(RoomEvent.Reconnecting, () => { if (sala === room) setConexao('caiu'); });
      room.on(RoomEvent.Reconnected, () => { if (sala === room) setConexao('ok'); });
      room.on(RoomEvent.Disconnected, (motivo) => {
        if (!vivo || sala !== room) return;
        anotar('aviso', 'luta', `caí da sala da luta (motivo ${motivo ?? 'nenhum'}); tentando de novo`);
        setConexao('caiu');
        agendar();
      });
      try {
        const { url, token } = await pedirTokenDaLuta(arenaRef.current.id, servidorId);
        if (!vivo || sala !== room) return;
        await room.connect(url, token, { autoSubscribe: false });
        if (!vivo || sala !== room) { void room.disconnect(); return; }
        tentativa = 0;
        setConexao('ok');
      } catch (e) {
        anotar('erro', 'luta', `não entrei na sala da luta (tentativa ${tentativa + 1}): ${(e as Error).message}`);
        if (vivo && sala === room) { setConexao('caiu'); agendar(); }
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
    const sons = criarSonsDaLuta();
    const gravados = criarSonsGravados();
    const vistos = new Set<string>();
    const quadro = criarQuadro(TELA.largura, TELA.altura);
    const imagem = new ImageData(new Uint8ClampedArray(quadro.px.buffer as ArrayBuffer), TELA.largura, TELA.altura);
    let resultadoMandado = false;
    let tique = 0;

    const quadroDoRelogio = () => {
      const inicio = arenaRef.current.inicioEm ?? 0;
      return Math.floor(((Date.now() + (diferenca.current ?? 0)) - inicio) * 60 / 1000);
    };

    // A simulação anda num relógio próprio, e não no do desenho: com a janela escondida o
    // `requestAnimationFrame` para, e a luta do outro lado ficaria esperando por nós.
    const passo = setInterval(() => {
      const alvo = quadroDoRelogio();
      if (sessao) { if (alvo > 0) sessao.avancarAte(alvo, teclado!.botoes()); }
      else plateia!.avancar();
    }, 8);

    let pedido = 0;
    const desenhar = () => {
      pedido = requestAnimationFrame(desenhar);
      const c = canvas.current;
      const estado = sessao ? sessao.estado : plateia!.estado;
      tique++;
      if (!c) return;
      if (!estado) {
        limpar(quadro, 0xff1a1216);
      } else {
        const nomes: [string, string] = [nomeDoLutador(estado.lutadores[0].id).toUpperCase(), nomeDoLutador(estado.lutadores[1].id).toUpperCase()];
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
      c.getContext('2d')!.putImageData(imagem, 0, 0);
      const semOuvir = sessao ? sessao.msSemOuvir() : plateia ? Date.now() - plateia.ouvidoEm : 0;
      const antes = quadroDoRelogio() < 0;
      setAviso(antes ? null
        : !estado ? 'Pegando a luta…'
          : estado.fase !== 'fimDaLuta' && semOuvir > 2500 ? (sessao ? 'Sem sinal do outro lutador…' : 'Sem sinal dos lutadores…')
            : null);
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
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const vencedor = arena.vencedor;
  const nomeDoLado = (i: 0 | 1) => arena.lados[i]?.pessoa.nome ?? '?';

  return (
    <div className="corrida-area luta-area">
      <div ref={caixa} className="luta-palco">
        <canvas ref={canvas} width={TELA.largura} height={TELA.altura} className="luta-canvas" />
        {(aviso || conexao === 'caiu') && arena.estado === 'lutando' && (
          <div className="luta-aviso">{conexao === 'caiu' ? 'A conexão caiu. Voltando…' : aviso}</div>
        )}
        {arena.estado === 'fim' && (
          <div className="xadrez-fim">
            <div className="xadrez-fim-cartao">
              <span className="xadrez-fim-titulo">
                {vencedor === 2 || vencedor === null ? 'Empate' : `Vitória de ${nomeDoLado(vencedor)}`}
              </span>
              <span className="muted small">
                {arena.motivo === 'abandono' ? 'Alguém desistiu da luta.' : arena.motivo === 'semResultado' ? 'A luta terminou sem resultado.' : `${nomeDoLutador(arena.lados[vencedor === 1 ? 1 : 0]?.lutador ?? 'goiaba')} venceu no ${NOMES_DOS_CENARIOS[arena.cenario]}.`}
              </span>
              <div className="xadrez-fim-botoes">
                {souLutador && <button type="button" className="primary" disabled={ocupado} onClick={() => onAgir({ acao: 'revanche' })}>Revanche</button>}
                {arena.souAnfitriao
                  ? <button type="button" className="secundario" disabled={ocupado} onClick={() => onAgir({ acao: 'fechar' })}>Fechar arena</button>
                  : <button type="button" className="secundario" onClick={onSair}>Sair</button>}
              </div>
            </div>
          </div>
        )}
      </div>
      {live && <div className="xadrez-live">{live}</div>}
    </div>
  );
}


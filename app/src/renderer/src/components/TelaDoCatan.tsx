import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { agirNaMesaDoCatan, verMesaDoCatan, type Membro } from '../api';
import {
  CUSTOS, COR_DO_JOGADOR, NOME_DA_CARTA, NOME_DO_RECURSO, O_QUE_A_CARTA_FAZ, RECURSOS,
  PRAZO_DA_MONTAGEM, PRAZO_DA_TROCA, TEMPOS_DA_VEZ,
  cartasQueChegaram, centroDoHex, chaveDoHex, deveTicar, faixaDaVez, hexesQueProduziram, lerHex, meuPrazo, monteVazio, oQueEspera, oQueTocarNaPartida,
  pontasDaAresta, pontoDoCruzamento, segundosQueFaltam, somaDoMonte, tempoRestante, temTudo, textoDoEvento, textoDoMonte, vezParada, vezQueComecou,
  lugaresEmVolta, oQueDaParaConstruir, PONTOS_DA_CONSTRUCAO, chaveDaConstrucao, chaveDaEstrada, pecasQueChegaram,
  type Chegada,
  type AcaoNaMesaDoCatan, type CartaDeDesenvolvimento, type Construcao, type Jogada, type Lugar, type MesaDoCatan, type Monte, type Partida,
  type FaixaDaVez as Faixa, type PessoaNoCatan, type Recurso,
} from '../catan';
import { CORES_DA_MESA, SIMBOLO, simbolosDasCartas } from '../cartasDoCatan';
import { ALTURA, LARGURA, S, clarear, desenharFundo, desenharPecas, duracaoDaCorrida, noSvg, poli, posicaoDoLadrao } from '../desenhoDoCatan';
import { iconeDeConstruir } from '../iconesDoCatan';
import { rolarOsDados } from '../somDosDados';
import { Dado, DadosNoCopo, duracaoDaRolagem } from './DadosNoCopo';
import { tocarNoCatan } from '../somDoCatan';
import { CHEGADA_MS, POUSO_MS, SobreOTabuleiro, type Corrida } from './SobreOTabuleiro';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

/** De quanto em quanto a tela pergunta pela mesa: a jogada dos outros chega em até isto. */
const INTERVALO = 800;
/** Entre um som e o seguinte, quando a mesma leitura traz vários: juntos, viram um barulho só. */
const ENTRE_SONS = 180;
/** O aviso "Vez de Tava1" no meio do tabuleiro: entra, fica o bastante para ler, e some sozinho. */
const AVISO_DA_VEZ = 1600;
/** O "+1 lã" em cima da carta que chegou. */
const CHEGOU = 2500;
/** A faixa fica vermelha nos últimos segundos — os mesmos do tique. */
const ACABANDO = 5_000;

/**
 * Onde o relógio do servidor estava na última resposta, e quando ela chegou AQUI: a tela conta o
 * que falta para um prazo sem nunca comparar o relógio deste computador com o de lá.
 */
type BaseDoRelogio = { servidor: number; local: number };

/**
 * Quanto falta para `prazo`, redesenhando de quarto em quarto de segundo só enquanto há prazo
 * correndo — parado, nada anima (a mesma regra do `animacoes.test.ts`, que é do CSS).
 */
function useRestante(prazo: number | null | undefined, base: BaseDoRelogio): number | null {
  const [agora, setAgora] = useState(() => Date.now());
  const ms = tempoRestante(prazo, base.servidor, Math.max(agora, base.local) - base.local);
  const correndo = ms !== null && ms > 0;
  useEffect(() => {
    if (!correndo) return;
    const id = setInterval(() => setAgora(Date.now()), 250);
    return () => clearInterval(id);
  }, [correndo]);
  return ms;
}

/** Os últimos 5 s do prazo que corre contra você tiquetaqueiam. Não desenha nada. */
function TiqueDoRelogio({ prazo, base, surdo }: { prazo: number; base: BaseDoRelogio; surdo: boolean }) {
  const ms = useRestante(prazo, base);
  const antes = useRef<number | null>(null);
  useEffect(() => {
    const a = antes.current;
    antes.current = ms;
    if (!surdo && deveTicar(a, ms)) tocarNoCatan('tique');
  }, [ms, surdo]);
  return null;
}

/**
 * O microfone e o fone da call, para a barra da mesa: dentro da partida a Saga sai da frente, e
 * com ela o painel da conta onde esses dois moram. São os MESMOS controles (useRoom), não cópias.
 */
export type ControlesDaCall = {
  /** A sala de voz em que você está; null fora de call. */
  sala: string | null;
  conectado: boolean;
  micOn: boolean;
  alternarMic: () => void;
  alternarSurdo: () => void;
};

type Modo = 'aldeia' | 'estrada' | 'cidade' | null;
type Janela =
  | { tipo: 'troca'; aba: 'jogadores' | 'banco'; contra?: boolean }
  | { tipo: 'fartura' }
  | { tipo: 'monopolio' }
  | { tipo: 'vitima'; hex: string; vitimas: number[] }
  | null;

/**
 * O Catan, na tela da mesa — a disposição A que o dono escolheu (27/09/2026): o tabuleiro e a
 * sua mão à esquerda, a coluna dos jogadores, dos custos e do que está acontecendo à direita, como
 * o xadrez. É a mesma tela do começo ao fim: a mesa esperando gente, a partida e o fim.
 */
export function TelaDoCatan({ mesaId, servidorId, euId, membros, naCall, surdo, live, call, onFechar, onAviso }: {
  mesaId: number;
  /** O servidor DA MESA: é a ele que toda pergunta vai, mesmo com outro aberto. */
  servidorId: number;
  euId: number;
  membros: Membro[];
  naCall: Set<number>;
  /** Fone desligado: os dados rolam calados. */
  surdo: boolean;
  live?: ReactNode;
  call?: ControlesDaCall;
  onFechar: () => void;
  onAviso: (tipo: 'erro' | 'info', texto: string) => void;
}) {
  const [mesa, setMesa] = useState<MesaDoCatan | null>(null);
  const [falhou, setFalhou] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;
  const avisarRef = useRef(onAviso);
  avisarRef.current = onAviso;
  const saindo = useRef(false);

  // Resposta mais velha que a última aplicada não entra — o mesmo cuidado do xadrez: a busca
  // que saiu antes da sua jogada e voltou depois dela a desfaria na tela.
  const ultimoAgora = useRef(0);
  const recebidaEm = useRef(0);
  const receber = useCallback((m: MesaDoCatan | null) => {
    if (!m) { fecharRef.current(); return; }
    if (m.agora < ultimoAgora.current) return;
    ultimoAgora.current = m.agora;
    recebidaEm.current = Date.now();
    setMesa(m);
    setFalhou(null);
  }, []);

  useEffect(() => {
    let vivo = true;
    let indo = false;
    const buscar = async () => {
      if (!vivo || indo) return;
      indo = true;
      try {
        const m = await verMesaDoCatan(mesaId, servidorId);
        if (vivo) receber(m);
      } catch (e) {
        if (!vivo) return;
        if ((e as { status?: number }).status === 404) {
          vivo = false;
          if (!saindo.current) avisarRef.current('info', 'A mesa de Catan foi fechada.');
          fecharRef.current();
          return;
        }
        setFalhou((e as Error).message);
      } finally {
        indo = false;
      }
    };
    buscar();
    const id = setInterval(buscar, INTERVALO);
    return () => { vivo = false; clearInterval(id); };
  }, [mesaId, servidorId, receber]);

  const agir = useCallback(async (a: AcaoNaMesaDoCatan) => {
    if (a.acao === 'fechar') saindo.current = true;
    setOcupado(true);
    try {
      receber(await agirNaMesaDoCatan(mesaId, a, servidorId));
      return true;
    } catch (e) {
      saindo.current = false;
      avisarRef.current('erro', (e as Error).message);
      return false;
    } finally {
      setOcupado(false);
    }
  }, [mesaId, servidorId, receber]);
  const jogar = useCallback((jogada: Jogada) => agir({ acao: 'jogar', jogada }), [agir]);

  const souPlateia = !!mesa && mesa.eu === 'plateia';
  const partida = mesa?.partida ?? null;

  // Os sons da partida saem da DIFERENÇA entre a leitura anterior e esta — a regra é pura e
  // testada (`oQueTocarNaPartida`): a primeira leitura não toca nada, e nenhum evento toca duas vezes.
  const anterior = useRef<Partida | null>(null);
  useEffect(() => {
    const antes = anterior.current;
    anterior.current = partida;
    if (!partida || surdo) return;
    oQueTocarNaPartida(antes, partida).forEach((som, i) => {
      // A construção soa quando a peça bate no chão (POUSO_MS), e os passos do ladrão duram a corrida.
      // As cartas que renderam soam quando os dados PARAM: antes disso, o som entregava o número.
      const rolou = !!antes && partida.rolagens !== antes.rolagens;
      const opcoes = som === 'estrada' || som === 'aldeia' || som === 'cidade' ? { atraso: POUSO_MS }
        : som === 'ladrao' && antes ? { duracao: duracaoDaCorrida(posicaoDoLadrao(antes), posicaoDoLadrao(partida)) }
        : som === 'ganhou' && rolou ? { atraso: duracaoDaRolagem() } : {};
      if (i === 0) tocarNoCatan(som, undefined, opcoes);
      else setTimeout(() => tocarNoCatan(som, undefined, opcoes), i * ENTRE_SONS);
    });
  }, [partida, surdo]);
  const base: BaseDoRelogio = { servidor: mesa?.agora ?? 0, local: recebidaEm.current };
  const nome = useCallback((j: number) => mesa?.jogadores?.[j]?.nome ?? '…', [mesa?.jogadores]);
  const espera = partida ? oQueEspera(partida, nome) : null;

  // Começada a partida, a tela é só o jogo (a mesa em volta, 06/10/2026): a Saga sai da frente
  // pelo CSS (`.app:has(.catan-mesa)`, no catan.css). A mesa esperando gente fica dentro da Saga.
  if (mesa && mesa.estado !== 'lobby' && partida) {
    return (
      <Partida_ mesa={mesa} partida={partida} ocupado={ocupado} surdo={surdo} live={live} base={base} call={call}
        nome={nome} onJogar={jogar} onAgir={agir} onSair={onFechar} />
    );
  }

  return (
    <div className="tela-do-catan">
      <header className="stage-head">
        <Icon name="controle" />
        <span className="strong">Catan</span>
        {mesa && <span className="xadrez-titulo">{mesa.estado === 'lobby' ? 'mesa aberta' : partida?.fase === 'inicio' ? 'colocação' : `rodada ${Math.max(1, partida?.rodada ?? 1)}`}</span>}
        {espera && <span className={`xadrez-chip ${espera.minha ? 'vez' : ''}`}>{espera.texto}</span>}
        {souPlateia && <span className="selo-assistindo"><Icon name="olho" size={12} /> assistindo</span>}
        <span className="spacer" />
        <button type="button" className="secundario sm" onClick={onFechar} title="A partida continua; ela fica no alto do chat.">Sair da tela</button>
      </header>
      <div className="catan-area">
        {!mesa ? (
          <div className="xadrez-carregando muted">
            {falhou ? `Não consegui abrir a mesa (${falhou}). Tentando de novo…` : 'Abrindo a mesa…'}
          </div>
        ) : (
          <Lobby mesa={mesa} euId={euId} ocupado={ocupado} membros={membros} naCall={naCall} onAgir={agir} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// A mesa esperando gente.
// ---------------------------------------------------------------------------------------------

function Lobby({ mesa, euId, ocupado, membros, naCall, onAgir }: {
  mesa: MesaDoCatan; euId: number; ocupado: boolean; membros: Membro[]; naCall: Set<number>;
  onAgir: (a: AcaoNaMesaDoCatan) => Promise<boolean>;
}) {
  const souAnfitriao = mesa.eu === 'anfitriao';
  const sentados = new Set(mesa.lugares.map((p) => p.id));
  const chamados = new Set(mesa.chamados.map((p) => p.id));
  const vagas = 4 - mesa.lugares.length;
  const porNome = (a: Membro, b: Membro) => a.nome.localeCompare(b.nome, 'pt-BR');
  const outros = membros.filter((m) => m.id !== euId && !m.banido && !sentados.has(m.id)).sort(porNome);
  const grupos = [
    { titulo: 'Na call', lista: outros.filter((m) => naCall.has(m.id)) },
    { titulo: 'Online no servidor', lista: outros.filter((m) => !naCall.has(m.id) && (m.status ?? 'offline') !== 'offline') },
  ];
  const lotado = mesa.lugares.length + mesa.chamados.length >= 4;

  return (
    <div className="catan-lobby">
      <div className="catan-lobby-mesa">
        <div className="catan-lobby-titulo">Mesa de Catan</div>
        <p className="muted">De 2 a 4 jogadores. O tabuleiro é sorteado, e a ordem da mesa também.</p>
        <div className="catan-lugares">
          {[0, 1, 2, 3].map((i) => {
            const p = mesa.lugares[i];
            const chamado = !p ? mesa.chamados[i - mesa.lugares.length] : undefined;
            return (
              <div key={i} className={`catan-lugar ${p ? 'ocupado' : ''}`}>
                {p ? (
                  <>
                    <Avatar nome={p.nome} foto={p.foto} />
                    <span className="catan-lugar-nome">{p.nome}{p.id === euId ? ' (você)' : ''}</span>
                    {p.id === mesa.anfitriao.id ? <span className="catan-lugar-nota">abriu a mesa</span>
                      : souAnfitriao ? <button type="button" className="link" disabled={ocupado} onClick={() => onAgir({ acao: 'tirar', alvo: p.id })}>tirar</button>
                      : null}
                  </>
                ) : chamado ? (
                  <>
                    <Avatar nome={chamado.nome} foto={chamado.foto} />
                    <span className="catan-lugar-nome muted">{chamado.nome}</span>
                    <span className="catan-lugar-nota">chamado…</span>
                  </>
                ) : <span className="catan-lugar-vazio">lugar livre</span>}
              </div>
            );
          })}
        </div>
        <div className="catan-tempo">
          <span className="xadrez-rotulo">Tempo de cada vez</span>
          {/* Só quem abriu escolhe; quem está sentado vê a escolha, sem mexer. */}
          <div className="catan-segmento" role="group" aria-label="Tempo de cada vez">
            {TEMPOS_DA_VEZ.map((t) => (
              <button key={t.segundos} type="button" className={mesa.segundos === t.segundos ? 'ativo' : ''}
                aria-pressed={mesa.segundos === t.segundos} disabled={!souAnfitriao || ocupado}
                onClick={() => { if (mesa.segundos !== t.segundos) onAgir({ acao: 'tempo', segundos: t.segundos }); }}>
                {t.rotulo}
              </button>
            ))}
          </div>
          <span className="muted small">Acabou o tempo, o jogo rola os dados e passa a vez por você. Troca: 15 s para responder.</span>
        </div>
        <div className="catan-lobby-botoes">
          {souAnfitriao ? (
            <>
              <button type="button" className="primary" disabled={ocupado || mesa.lugares.length < 2} onClick={() => onAgir({ acao: 'comecar' })}>
                {mesa.lugares.length < 2 ? 'Chame alguém para começar' : `Começar com ${mesa.lugares.length}`}
              </button>
              <button type="button" className="secundario" disabled={ocupado} onClick={() => onAgir({ acao: 'fechar' })}>Fechar mesa</button>
            </>
          ) : mesa.eu === 'sentado' ? (
            <>
              <span className="muted">Esperando {mesa.anfitriao.nome} começar…</span>
              <button type="button" className="secundario" disabled={ocupado} onClick={() => onAgir({ acao: 'levantar' })}>Sair da mesa</button>
            </>
          ) : mesa.eu === 'chamado' ? (
            <button type="button" className="primary" disabled={ocupado} onClick={() => onAgir({ acao: 'aceitar' })}>Sentar</button>
          ) : <span className="muted">Só quem foi chamado senta nesta mesa.</span>}
        </div>
      </div>
      {souAnfitriao && (
        <div className="xadrez-lateral catan-lobby-chamar">
          <div className="xadrez-cabecalho">Chamar para jogar {vagas > 0 ? `· ${vagas} ${vagas === 1 ? 'lugar' : 'lugares'}` : ''}</div>
          <div className="xadrez-chamaveis">
            {grupos.map((g) => g.lista.length > 0 && (
              <div key={g.titulo}>
                <span className="xadrez-grupo">{g.titulo}</span>
                {g.lista.map((m) => (
                  <div key={m.id} className="xadrez-chamavel">
                    <Avatar nome={m.nome} foto={m.foto} enquadramento={m.enquadramento?.foto} />
                    <span className="xadrez-chamavel-nome">{m.nome}</span>
                    {chamados.has(m.id) ? (
                      <span className="xadrez-chamado">
                        chamado…
                        <button type="button" className="link" disabled={ocupado} onClick={() => onAgir({ acao: 'cancelarConvite', alvo: m.id })}>cancelar</button>
                      </span>
                    ) : (
                      <span className="xadrez-chamado">
                        {mesa.recusaram.includes(m.id) && <span>recusou</span>}
                        <button type="button" className="botao-de-linha" disabled={ocupado || lotado}
                          onClick={() => onAgir({ acao: 'chamar', alvo: m.id })}>
                          {mesa.recusaram.includes(m.id) ? 'De novo' : 'Chamar'}
                        </button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
            {grupos.every((g) => g.lista.length === 0) && <span className="muted small">Ninguém online para chamar agora.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// A partida.
// ---------------------------------------------------------------------------------------------

function Partida_({ mesa, partida: p, ocupado, surdo, live, base, call, nome, onJogar, onAgir, onSair }: {
  mesa: MesaDoCatan; partida: Partida; ocupado: boolean; surdo: boolean; live?: ReactNode; base: BaseDoRelogio; call?: ControlesDaCall;
  nome: (j: number) => string;
  onJogar: (j: Jogada) => Promise<boolean>;
  onAgir: (a: AcaoNaMesaDoCatan) => Promise<boolean>;
  onSair: () => void;
}) {
  const eu = p.eu;
  const minhaVez = eu !== null && p.vez === eu && p.fase !== 'fim';
  const [modo, setModo] = useState<Modo>(null);
  const [janela, setJanela] = useState<Janela>(null);

  // A janela de troca de quem está na vez para o relógio dela (pedido do dono, 06/10/2026): abrir
  // avisa o servidor, que dá 20 s para montar; fechar sem oferecer — por qualquer caminho: o
  // "cancelar", o Esc, outra janela, o "passar a vez" — devolve o relógio. Num lugar só, pela
  // MUDANÇA da janela, para nenhum caminho de fechar esquecer de avisar.
  const montando = useRef(false);
  montando.current = minhaVez && !!p.montagem;
  const trocaAberta = janela?.tipo === 'troca' && !janela.contra;
  const eraTroca = useRef(false);
  useEffect(() => {
    if (trocaAberta && !eraTroca.current) onJogar({ tipo: 'montarTroca' });
    if (!trocaAberta && eraTroca.current && montando.current) onJogar({ tipo: 'desistirDaTroca' });
    eraTroca.current = trocaAberta;
  }, [trocaAberta, onJogar]);
  // Os 20 s acabaram no servidor: a janela fecha sozinha. Oferecer também tira a montagem, mas aí
  // há oferta, e a janela já fechou por conta própria.
  const prazoDaMontagem = p.montagem?.prazo ?? null;
  const montagemAntes = useRef(prazoDaMontagem);
  useEffect(() => {
    if (montagemAntes.current !== null && prazoDaMontagem === null && !p.oferta) {
      setJanela((j) => (j?.tipo === 'troca' && !j.contra ? null : j));
    }
    montagemAntes.current = prazoDaMontagem;
  }, [prazoDaMontagem, p.oferta]);

  // Os dados rolam na tela a cada rolagem nova — inclusive a dos outros —, no copo
  // (`DadosNoCopo`), e o som vai junto. Antes da pintura (`useLayoutEffect`): com o efeito comum, a
  // leitura nova pintava UM quadro com o resultado já parado antes de o copo aparecer. O ouvido vai
  // por referência: ligar ou desligar o fone no meio da rolagem refazia o efeito, que cancelava o
  // relógio e deixava os dados rolando para sempre.
  const rolagens = useRef(p.rolagens);
  const [rolando, setRolando] = useState(false);
  const surdoNaRolagem = useRef(surdo);
  surdoNaRolagem.current = surdo;
  useLayoutEffect(() => {
    if (p.rolagens === rolagens.current) return;
    rolagens.current = p.rolagens;
    setRolando(true);
    if (!surdoNaRolagem.current) rolarOsDados();
    const id = setTimeout(() => setRolando(false), duracaoDaRolagem());
    return () => clearTimeout(id);
  }, [p.rolagens]);

  // A cada leitura: a vez que começou vira o aviso no meio do tabuleiro, e as cartas que chegaram
  // à sua mão sobem com o "+1". As duas regras são puras e testadas (`vezQueComecou`,
  // `cartasQueChegaram`); na primeira leitura, nenhuma das duas — abrir a tela não é acontecer.
  const anterior = useRef<Partida | null>(null);
  const [aviso, setAviso] = useState<{ j: number; n: number } | null>(null);
  const [chegou, setChegou] = useState<{ cartas: Partial<Monte>; n: number } | null>(null);
  // Com rolagem nova na mesma leitura, o "+1" espera os dados pararem: subir antes entregava o número.
  const esperaOsDados = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (esperaOsDados.current) clearTimeout(esperaOsDados.current); }, []);
  useEffect(() => {
    const antes = anterior.current;
    anterior.current = p;
    const j = vezQueComecou(antes, p);
    if (j !== null) setAviso((a) => ({ j, n: (a?.n ?? 0) + 1 }));
    const cartas = cartasQueChegaram(antes?.mao, p.mao);
    if (!Object.keys(cartas).length) return;
    const mostrar = () => setChegou((c) => ({ cartas, n: (c?.n ?? 0) + 1 }));
    if (antes && p.rolagens !== antes.rolagens) esperaOsDados.current = setTimeout(mostrar, duracaoDaRolagem());
    else mostrar();
  }, [p]);
  useEffect(() => {
    if (!aviso) return;
    const id = setTimeout(() => setAviso(null), AVISO_DA_VEZ);
    return () => clearTimeout(id);
  }, [aviso]);
  useEffect(() => {
    if (!chegou) return;
    const id = setTimeout(() => setChegou(null), CHEGOU);
    return () => clearTimeout(id);
  }, [chegou]);

  // Na sua vez de rolar, a barra de espaço rola — o botão grande diz isso. Nunca dentro de um
  // campo de texto nem sobre um botão (o espaço já o apertaria), e não com uma janela aberta.
  const podeRolar = minhaVez && p.fase === 'rolar' && !!p.pode.rolar;
  useEffect(() => {
    if (!podeRolar || janela || ocupado) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(alvo.tagName))) return;
      e.preventDefault();
      onJogar({ tipo: 'rolar' });
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [podeRolar, janela, ocupado, onJogar]);

  // O modo de construir só vale enquanto a regra oferece: a vez passou, ele sai sozinho.
  const oferecidos = modo === 'aldeia' ? p.pode.aldeias : modo === 'estrada' ? p.pode.estradas : modo === 'cidade' ? p.pode.cidades : undefined;
  useEffect(() => { if (modo && !oferecidos?.length) setModo(null); }, [modo, oferecidos?.length]);
  // Esc cancela o que estiver armado.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { setModo(null); setJanela(null); } };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  // No começo, na carta de estradas e no ladrão, o que se faz no tabuleiro é o que a fase pede.
  const modoDaVez: Modo | 'ladrao' = p.fase === 'ladrao' && p.pode.ladrao ? 'ladrao'
    : p.fase === 'inicio' ? (p.pode.aldeias ? 'aldeia' : p.pode.estradas ? 'estrada' : null)
    : p.fase === 'estradas' ? 'estrada'
    : modo;

  const clicarCruzamento = async (v: string) => {
    const ok = await onJogar(modoDaVez === 'cidade' ? { tipo: 'cidade', v } : { tipo: 'aldeia', v });
    if (ok) setModo(null);
  };
  const clicarAresta = async (a: string) => {
    const ok = await onJogar({ tipo: 'estrada', a });
    if (ok && p.fase === 'acoes') setModo(null);
  };
  const clicarTerreno = (hex: string) => {
    const vitimas = p.pode.ladrao?.[hex] ?? [];
    if (vitimas.length > 1) setJanela({ tipo: 'vitima', hex, vitimas });
    else onJogar({ tipo: 'ladrao', hex });
  };

  const acesos = useMemo(() => (rolando ? new Set<string>() : hexesQueProduziram(p)), [p, rolando]);
  const jogar = (c: CartaDeDesenvolvimento) => {
    if (c === 'fartura') setJanela({ tipo: 'fartura' });
    else if (c === 'monopolio') setJanela({ tipo: 'monopolio' });
    else onJogar({ tipo: c } as Jogada);
  };

  const oferta = p.oferta;
  const souQuemOferece = oferta && minhaVez;
  const prazoMeu = meuPrazo(p);
  const faixa = faixaDaVez(p, nome);

  // Quem senta onde: você embaixo, os outros em volta na ordem da vez (`lugaresEmVolta`).
  const lugares = lugaresEmVolta(p.jogadores.length, eu);
  const quem = (l: Lugar) => lugares.indexOf(l);
  const esquerda = quem('esquerda'), cima = quem('cima'), direita = quem('direita'), baixo = quem('baixo');
  const lugar = (k: number, onde: Lugar) => k < 0 ? null : (
    <LugarNaMesa partida={p} k={k} onde={onde} pessoa={mesa.jogadores?.[k]} nome={nome(k)}
      relogio={faixa && faixa.j === k ? faixa : null} base={base} />
  );
  const minhaCor = COR_DO_JOGADOR[p.jogadores[eu ?? 0].cor];
  const jogando = eu !== null && !p.jogadores[eu].fora && p.fase !== 'fim';
  // O sprite das cartas vai uma vez na mesa; cada carta é um `<use>` dele (ver cartasDoCatan.ts).
  const simbolos = useMemo(() => simbolosDasCartas(), []);

  return (
    <div className="catan-mesa" style={CORES_DA_MESA as CSSProperties}>
      <svg className="mesa-simbolos" aria-hidden="true" dangerouslySetInnerHTML={{ __html: simbolos }} />
      {prazoMeu !== null && <TiqueDoRelogio key={prazoMeu} prazo={prazoMeu} base={base} surdo={surdo} />}
      <BarraDaMesa mesa={mesa} partida={p} ocupado={ocupado} surdo={surdo} call={call} jogando={jogando} onAgir={onAgir} onSair={onSair} />

      <div className="mesa-lado esquerda">
        <Banco partida={p} />
        <div className="mesa-lado-meio">{lugar(esquerda, 'esquerda')}</div>
        <Cola partida={p} cor={minhaCor} />
      </div>

      <div className="mesa-centro">
        {lugar(cima, 'cima')}
        <div className="catan-tabuleiro-caixa">
          <TabuleiroDoCatan partida={p} acesos={acesos} modo={modoDaVez} corMinha={eu !== null ? COR_DO_JOGADOR[p.jogadores[eu].cor] : '#fff'}
            ocupado={ocupado} onCruzamento={clicarCruzamento} onAresta={clicarAresta} onTerreno={clicarTerreno} />
          {podeRolar && !rolando ? (
            <button type="button" className="catan-rolar" disabled={ocupado} onClick={() => onJogar({ tipo: 'rolar' })}>
              <Dado n={3} vermelho={false} giro={-8} />
              <Dado n={5} vermelho giro={10} />
              <span>Rolar os dados<small>ou aperte espaço</small></span>
            </button>
          ) : <DadosNoCopo dados={p.dados} rolando={rolando} rolagem={p.rolagens} />}
          {aviso && <AvisoDaVez key={aviso.n} partida={p} j={aviso.j} pessoa={mesa.jogadores?.[aviso.j]} nome={nome} />}
          {modoDaVez && modoDaVez !== 'ladrao' && p.fase === 'acoes' && (
            <div className="catan-dica">Escolha onde vai {modoDaVez === 'estrada' ? 'a estrada' : modoDaVez === 'cidade' ? 'a cidade' : 'a aldeia'} · <button type="button" className="link" onClick={() => setModo(null)}>cancelar</button></div>
          )}
          {modoDaVez === 'ladrao' && <div className="catan-dica">Clique no terreno para onde vai o ladrão</div>}
          {p.fase === 'estradas' && minhaVez && (
            <div className="catan-dica">
              Ponha {p.estradasGratis} {p.estradasGratis === 1 ? 'estrada' : 'estradas'} de graça ·{' '}
              <button type="button" className="link" disabled={ocupado} onClick={() => onJogar({ tipo: 'pararEstradas' })}>parar</button>
            </div>
          )}
          {/* Janela no meio do tabuleiro escurece o resto: é uma pergunta, e o tabuleiro espera. */}
          {(janela?.tipo === 'troca' || janela?.tipo === 'fartura' || janela?.tipo === 'monopolio' || janela?.tipo === 'vitima'
            || !!p.pode.descartar || p.fase === 'fim') && <div className="catan-veu" />}
          {oferta && !souQuemOferece && p.fase === 'acoes' && (
            <OfertaRecebida partida={p} nome={nome} ocupado={ocupado} base={base} onJogar={onJogar}
              onContra={() => setJanela({ tipo: 'troca', aba: 'jogadores', contra: true })} />
          )}
          {p.pode.descartar && <Descarte mao={p.mao!} quantas={p.pode.descartar} ocupado={ocupado} onJogar={onJogar} />}
          {janela?.tipo === 'troca' && (
            <Troca partida={p} nome={nome} ocupado={ocupado} aba={janela.aba} contra={!!janela.contra} base={base}
              onAba={(aba) => setJanela({ ...janela, aba })} onJogar={onJogar} onFechar={() => setJanela(null)} />
          )}
          {souQuemOferece && janela?.tipo !== 'troca' && (
            <Respostas partida={p} nome={nome} ocupado={ocupado} base={base} onJogar={onJogar} />
          )}
          {janela?.tipo === 'fartura' && <Fartura banco={p.banco} ocupado={ocupado} onJogar={onJogar} onFechar={() => setJanela(null)} />}
          {janela?.tipo === 'monopolio' && <Monopolio ocupado={ocupado} onJogar={onJogar} onFechar={() => setJanela(null)} />}
          {janela?.tipo === 'vitima' && (
            <div className="catan-janela">
              <div className="catan-janela-titulo">De quem roubar?</div>
              <div className="catan-vitimas">
                {janela.vitimas.map((j) => (
                  <button key={j} type="button" className="secundario" disabled={ocupado}
                    onClick={async () => { if (await onJogar({ tipo: 'ladrao', hex: janela.hex, vitima: j })) setJanela(null); }}>
                    <span className="catan-bolinha" style={{ background: COR_DO_JOGADOR[p.jogadores[j].cor] }} />
                    {nome(j)} · {p.jogadores[j].cartas} {p.jogadores[j].cartas === 1 ? 'carta' : 'cartas'}
                  </button>
                ))}
              </div>
              <button type="button" className="link" onClick={() => setJanela(null)}>escolher outro terreno</button>
            </div>
          )}
          {p.fase === 'fim' && <Fim mesa={mesa} partida={p} nome={nome} ocupado={ocupado} onAgir={onAgir} onSair={onSair} />}
        </div>
        <div className="mesa-baixo">
          {faixa && <PilulaDaVez faixa={faixa} partida={p} base={base} />}
          {eu !== null && p.mao ? (
            <MinhaMao partida={p} nome={nome(eu)} pessoa={mesa.jogadores?.[eu]} chegou={chegou?.cartas}
              relogio={faixa && faixa.j === eu ? faixa : null} base={base} ocupado={ocupado} onJogarCarta={jogar} />
          ) : lugar(baixo, 'baixo')}
        </div>
      </div>

      <div className="mesa-lado direita">
        <Acontecendo partida={p} nome={nome} />
        <div className="mesa-lado-meio">
          {lugar(direita, 'direita')}
          {live && <div className="xadrez-live mesa-live">{live}</div>}
        </div>
        {eu !== null && (
          <div className="mesa-acoes">
            {p.fase === 'fim' ? null : p.fase === 'inicio' ? (
              <span className="mesa-acoes-dica">
                {minhaVez ? (p.inicio?.falta === 'estrada' ? 'Agora a estrada, saindo da aldeia.' : 'Clique num cruzamento para pôr a aldeia.')
                  : 'Cada um põe uma aldeia e uma estrada; depois de novo, na volta.'}
                {p.inicio?.segunda && minhaVez && p.inicio.falta === 'aldeia' ? ' Esta já rende as cartas dos terrenos em volta.' : ''}
              </span>
            ) : p.fase === 'rolar' && minhaVez ? (
              <span className="mesa-acoes-dica">Role os dados para jogar</span>
            ) : (
              <>
                <button type="button" className={`mesa-b ${janela?.tipo === 'troca' ? 'ativo' : ''}`} disabled={!p.pode.trocar || ocupado}
                  onClick={() => setJanela(janela?.tipo === 'troca' ? null : { tipo: 'troca', aba: 'jogadores' })}>
                  <span className="mesa-b-icone"><Traco nome="trocar" tamanho={20} /></span>Trocar
                </button>
                <BotaoDeConstruir tipo="estrada" cor={minhaCor} ativo={modo === 'estrada'} pode={!!p.pode.estradas?.length && p.fase === 'acoes'} ocupado={ocupado} onClick={() => setModo(modo === 'estrada' ? null : 'estrada')} />
                <BotaoDeConstruir tipo="aldeia" cor={minhaCor} ativo={modo === 'aldeia'} pode={!!p.pode.aldeias?.length && p.fase === 'acoes'} ocupado={ocupado} onClick={() => setModo(modo === 'aldeia' ? null : 'aldeia')} />
                <BotaoDeConstruir tipo="cidade" cor={minhaCor} ativo={modo === 'cidade'} pode={!!p.pode.cidades?.length} ocupado={ocupado} onClick={() => setModo(modo === 'cidade' ? null : 'cidade')} />
                <BotaoDeConstruir tipo="desenvolvimento" cor={minhaCor} ativo={false} pode={!!p.pode.comprar} ocupado={ocupado} onClick={() => onJogar({ tipo: 'comprar' })} />
                <button type="button" className="mesa-b primario" disabled={!p.pode.passar || ocupado} onClick={() => { setModo(null); setJanela(null); onJogar({ tipo: 'passar' }); }}>Passar a vez</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const ROTULO_DE_CONSTRUIR: Record<Construcao, string> = { estrada: 'Estrada', aldeia: 'Aldeia', cidade: 'Cidade', desenvolvimento: 'Carta' };

/** O botão de construir, com a peça desenhada na sua cor (os ícones moram em iconesDoCatan.ts). */
function BotaoDeConstruir({ tipo, cor, ativo, pode, ocupado, onClick }: {
  tipo: Construcao; cor: string; ativo: boolean; pode: boolean; ocupado: boolean; onClick: () => void;
}) {
  const custo = CUSTOS[tipo];
  return (
    <button type="button" className={`mesa-b ${ativo ? 'ativo' : ''}`} disabled={!pode || ocupado} onClick={onClick}
      title={`${tipo === 'desenvolvimento' ? 'Carta de desenvolvimento' : ROTULO_DE_CONSTRUIR[tipo]}: ${textoDoMonte(custo.reduce((m, r) => ({ ...m, [r]: (m[r] ?? 0) + 1 }), {} as Partial<Monte>))}`}>
      <span className="mesa-b-icone">
        {tipo === 'desenvolvimento' ? <Carta simbolo={SIMBOLO.versoDeDesenvolvimento} className="no-botao" />
          : <span className="mesa-peca" dangerouslySetInnerHTML={{ __html: iconeDeConstruir(tipo, cor) }} />}
      </span>
      {ROTULO_DE_CONSTRUIR[tipo]}
    </button>
  );
}

/**
 * A pílula da vez, acima da sua mão — era a faixa acima do tabuleiro (04/10/2026) e mudou de lugar
 * com a mesa em volta: quem joga agora já acende na mesa, e o que sobra dizer (o que falta fazer,
 * o tempo, a troca parando a vez, o 7) fica junto da mão, onde se joga. Na sua vez ela acende; a
 * barra esvazia aos saltos e fica vermelha nos últimos 5 s.
 */
function PilulaDaVez({ faixa, partida: p, base }: { faixa: Faixa; partida: Partida; base: BaseDoRelogio }) {
  const ms = useRestante(faixa.prazo, base);
  const cor = COR_DO_JOGADOR[p.jogadores[faixa.j].cor];
  const s = ms === null ? null : segundosQueFaltam(ms);
  return (
    <div className={`mesa-pilula ${faixa.minha ? 'minha' : ''}`}>
      <Icon name="relogio" size={16} />
      <b>{faixa.titulo}</b>
      <span className="mesa-pilula-detalhe">{faixa.detalhe}</span>
      {s !== null && <b className={`mesa-pilula-tempo ${ms! <= ACABANDO ? 'acabando' : ''}`}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</b>}
      {ms !== null && <i className="mesa-pilula-barra" style={{ width: `${Math.min(1, ms / faixa.total) * 100}%`, background: cor }} />}
    </div>
  );
}
/**
 * "Sua vez!" ou "Vez de Tava1" no meio do tabuleiro, a cada vez que começa — pedido do dono
 * (04/10/2026), mostrado e não falado. Some sozinho e não pega clique: quem já está jogando não
 * pode ter a jogada barrada por um aviso.
 */
function AvisoDaVez({ partida: p, j, pessoa, nome }: { partida: Partida; j: number; pessoa?: PessoaNoCatan; nome: (j: number) => string }) {
  const minha = j === p.eu;
  const cor = COR_DO_JOGADOR[p.jogadores[j].cor];
  return (
    <div className={`catan-aviso ${minha ? 'minha' : ''}`} style={{ borderColor: cor }} aria-hidden="true">
      <span className="catan-anel" style={{ borderColor: cor }}><Avatar nome={pessoa?.nome ?? '?'} foto={pessoa?.foto} /></span>
      <b>{minha ? 'Sua vez!' : `Vez de ${nome(j)}`}</b>
      {minha && p.fase === 'rolar' && <span className="catan-aviso-detalhe">Role os dados</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// O tabuleiro: o desenho (texto SVG, montado uma vez por partida e uma vez por mudança de peça) e,
// por cima, a camada do que dá para clicar — só o que a regra oferece a você agora.
// ---------------------------------------------------------------------------------------------

function TabuleiroDoCatan({ partida: p, acesos, modo, corMinha, ocupado, onCruzamento, onAresta, onTerreno }: {
  partida: Partida; acesos: Set<string>; modo: Modo | 'ladrao'; corMinha: string; ocupado: boolean;
  onCruzamento: (v: string) => void; onAresta: (a: string) => void; onTerreno: (hex: string) => void;
}) {
  const chaveDoFundo = JSON.stringify([p.hexes, p.portos]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fundo = useMemo(() => desenharFundo(p), [chaveDoFundo]);

  // O que mudou desde a leitura anterior vira animação na camada de cima (`SobreOTabuleiro`): a peça
  // nova cai do alto com poeira, e o ladrão corre até o terreno novo. Calculado DURANTE o desenho
  // (o "estado da leitura anterior" do React), e não num efeito: num efeito, a peça nova apareceria
  // um quadro no tabuleiro antes de sumir para cair — um piscar. Na primeira leitura, nada.
  const chaves = [...p.construcoes.map(chaveDaConstrucao), ...p.estradas.map(chaveDaEstrada)].sort().join(' ');
  const [visto, setVisto] = useState<{ chaves: string; ladrao: string; pecas: Pick<Partida, 'construcoes' | 'estradas'> } | null>(null);
  const [chegando, setChegando] = useState<{ lista: Chegada[]; n: number }>({ lista: [], n: 0 });
  const [corrida, setCorrida] = useState<Corrida | null>(null);
  if (!visto || visto.chaves !== chaves || visto.ladrao !== p.ladrao) {
    if (visto) {
      const novas = pecasQueChegaram(visto.pecas, p);
      if (novas.length) setChegando((c) => ({ lista: [...c.lista.filter((x) => !novas.some((n) => n.chave === x.chave)), ...novas], n: c.n + 1 }));
      if (visto.ladrao !== p.ladrao) setCorrida((c) => ({ de: visto.ladrao, para: p.ladrao, n: (c?.n ?? 0) + 1 }));
    }
    setVisto({ chaves, ladrao: p.ladrao, pecas: { construcoes: p.construcoes, estradas: p.estradas } });
  }
  // Terminada a queda, a peça volta a morar no tabuleiro — no mesmo desenho, então não pula.
  useEffect(() => {
    if (!chegando.lista.length) return;
    const id = setTimeout(() => setChegando((c) => ({ ...c, lista: [] })), CHEGADA_MS);
    return () => clearTimeout(id);
  }, [chegando.n, chegando.lista.length]);
  const caindo = chegando.lista.map((c) => c.chave).join(' ');

  // O ladrão não entra aqui: ele mora na camada de cima. Assim, ele correr não redesenha as peças.
  const chaveDasPecas = JSON.stringify([p.construcoes, p.estradas, [...acesos], p.jogadores.map((j) => j.cor), caindo]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pecas = useMemo(() => desenharPecas(p, acesos, { semLadrao: true, esconder: new Set(chegando.lista.map((c) => c.chave)) }), [chaveDasPecas]);

  const cruzamentos = modo === 'aldeia' ? p.pode.aldeias : modo === 'cidade' ? p.pode.cidades : undefined;
  const arestas = modo === 'estrada' ? p.pode.estradas : undefined;
  const terrenos = modo === 'ladrao' && p.pode.ladrao ? Object.keys(p.pode.ladrao) : undefined;

  return (
    <>
    <svg className={`catan-tabuleiro ${ocupado ? 'ocupado' : ''}`} viewBox={`0 0 ${LARGURA.toFixed(0)} ${ALTURA.toFixed(0)}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Tabuleiro do Catan">
      <g dangerouslySetInnerHTML={{ __html: fundo }} />
      <g dangerouslySetInnerHTML={{ __html: pecas }} />
      {terrenos?.map((k) => {
        const { q, r } = lerHex(k);
        const c = noSvg(centroDoHex(q, r));
        return (
          <polygon key={k} className="catan-alvo-terreno" points={poli(c.x, c.y, S * 0.93)} onClick={() => !ocupado && onTerreno(k)}>
            <title>{p.pode.ladrao![k].length ? 'Pôr o ladrão aqui e roubar' : 'Pôr o ladrão aqui'}</title>
          </polygon>
        );
      })}
      {arestas?.map((a) => {
        const [v, w] = pontasDaAresta(a).map(noSvg);
        return (
          <g key={a} className="catan-alvo-aresta" onClick={() => !ocupado && onAresta(a)}>
            <line x1={v.x} y1={v.y} x2={w.x} y2={w.y} className="catan-alvo-largo" />
            <line x1={v.x + (w.x - v.x) * 0.22} y1={v.y + (w.y - v.y) * 0.22} x2={v.x + (w.x - v.x) * 0.78} y2={v.y + (w.y - v.y) * 0.78}
              className="catan-alvo-traco" style={{ stroke: corMinha }} />
          </g>
        );
      })}
      {cruzamentos?.map((v) => {
        const q = noSvg(pontoDoCruzamento(v));
        return (
          <g key={v} className="catan-alvo-cruzamento" onClick={() => !ocupado && onCruzamento(v)}>
            <circle cx={q.x} cy={q.y} r={S * 0.24} className="catan-alvo-largo" />
            <circle cx={q.x} cy={q.y} r={S * 0.15} className="catan-alvo-ponto" style={{ fill: clarear(corMinha, 0.1) }} />
          </g>
        );
      })}
    </svg>
    <SobreOTabuleiro partida={p} chegando={chegando.lista} corrida={corrida} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// As cartas.
// ---------------------------------------------------------------------------------------------

/** Uma carta do sprite (`cartasDoCatan.ts`): um `<svg>` com o `<use>` do símbolo dela. */
function Carta({ simbolo, className = '', estilo, titulo }: { simbolo: string; className?: string; estilo?: CSSProperties; titulo?: string }) {
  return (
    <svg className={`mesa-carta ${className}`} viewBox="0 0 100 140" style={estilo}
      role={titulo ? 'img' : undefined} aria-label={titulo} aria-hidden={titulo ? undefined : true}>
      <use href={`#${simbolo}`} />
    </svg>
  );
}

/** A carta pequena de recurso das janelas (troca, descarte, fartura, monopólio): a mesma arte, sem o nome. */
function CartaDeRecurso({ recurso, pequena = false }: { recurso: Recurso; pequena?: boolean }) {
  return <Carta simbolo={SIMBOLO.recursoPequeno(recurso)} className={pequena ? 'pequena' : 'media'} titulo={NOME_DO_RECURSO[recurso]} />;
}

/** As cartas de desenvolvimento juntas por tipo; as compradas neste turno à parte, porque ainda não valem. */
function agruparCartas(cartas: { tipo: CartaDeDesenvolvimento; nova: boolean }[]) {
  const grupos = new Map<string, { tipo: CartaDeDesenvolvimento; nova: boolean; n: number }>();
  for (const c of cartas) {
    const k = `${c.tipo}-${c.nova}`;
    const g = grupos.get(k);
    if (g) g.n++;
    else grupos.set(k, { ...c, n: 1 });
  }
  return [...grupos.values()];
}

/**
 * A carta de recurso na mão (a opção C, 04/10/2026, com a arte da mesa em volta): o terreno do
 * tabuleiro no medalhão, o nome na faixa e a quantidade no selo; zerada, apagada, para a mão não
 * parecer ter o que não tem. A que acabou de chegar sobe com "+1 lã" — antes a carta chegava sem
 * ninguém ver, e daí veio o "não ganhei carta nenhuma" que o dono relatou.
 */
function CartaDaMao({ recurso, n, chegou }: { recurso: Recurso; n: number; chegou?: number }) {
  return (
    <div className={`mesa-carta-mao ${chegou ? 'chegou' : ''} ${n === 0 ? 'zerada' : ''}`} title={`${n} ${NOME_DO_RECURSO[recurso]}`}>
      {chegou && <span className="catan-chegou">+{chegou} {NOME_DO_RECURSO[recurso]}</span>}
      <Carta simbolo={SIMBOLO.recurso(recurso)} className="na-mao" />
      <span className="mesa-carta-qtd">{n}</span>
    </div>
  );
}

/**
 * A carta de desenvolvimento na sua mão: a ilustração dela, a quantidade quando há mais de uma, e
 * "comprada agora" na que ainda não vale. Jogável, ela acende e um clique a joga.
 */
function CartaDeDesenvolvimento_({ carta, nova, n, podeJogar, onJogar }: {
  carta: CartaDeDesenvolvimento; nova: boolean; n: number; podeJogar: boolean; onJogar: () => void;
}) {
  const dica = `${NOME_DA_CARTA[carta]}: ${O_QUE_A_CARTA_FAZ[carta]}${nova && carta !== 'ponto' ? ' Comprada neste turno: vale a partir do próximo.' : ''}`;
  return (
    <button type="button" className={`mesa-dev ${podeJogar ? 'jogavel' : ''} ${nova ? 'nova' : ''}`} title={dica}
      aria-label={dica} disabled={!podeJogar} onClick={onJogar}>
      <Carta simbolo={SIMBOLO.desenvolvimentoCurto(carta)} className="na-mao" />
      {n > 1 && <span className="mesa-carta-qtd">{n}</span>}
      {nova && <span className="mesa-dev-nova">comprada agora</span>}
      {podeJogar && <span className="mesa-dev-jogar">jogar</span>}
    </button>
  );
}
/** Escolher cartas com − e +. `limite` é quanto se tem de cada uma. */
function Escolher({ valor, limite, onMudar }: { valor: Monte; limite?: Partial<Monte>; onMudar: (m: Monte) => void }) {
  return (
    <div className="catan-escolher">
      {RECURSOS.map((r) => (
        <div key={r} className="catan-escolher-item">
          <CartaDeRecurso recurso={r} pequena />
          <div className="catan-contador">
            <button type="button" className="catan-mais-menos" aria-label={`menos ${NOME_DO_RECURSO[r]}`} disabled={valor[r] === 0}
              onClick={() => onMudar({ ...valor, [r]: valor[r] - 1 })}>−</button>
            <b className={valor[r] ? 'marcado' : ''}>{valor[r]}</b>
            <button type="button" className="catan-mais-menos" aria-label={`mais ${NOME_DO_RECURSO[r]}`} disabled={limite !== undefined && valor[r] >= (limite[r] ?? 0)}
              onClick={() => onMudar({ ...valor, [r]: valor[r] + 1 })}>+</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// As janelas sobre o tabuleiro.
// ---------------------------------------------------------------------------------------------

function Troca({ partida: p, nome, ocupado, aba, contra, base, onAba, onJogar, onFechar }: {
  partida: Partida; nome: (j: number) => string; ocupado: boolean; aba: 'jogadores' | 'banco'; contra: boolean;
  base: BaseDoRelogio; onAba: (a: 'jogadores' | 'banco') => void; onJogar: (j: Jogada) => Promise<boolean>; onFechar: () => void;
}) {
  // Os 20 s de montar, com a mesma barra e os mesmos segundos da oferta.
  const ms = useRestante(!contra ? p.montagem?.prazo : null, base);
  const parada = vezParada(p);
  const mao = p.mao ?? monteVazio();
  // A contraproposta começa pelo avesso da oferta: o que ele pede é o que você daria.
  const [da, setDa] = useState<Monte>(() => (contra && p.oferta ? { ...p.oferta.quer } : monteVazio()));
  const [quer, setQuer] = useState<Monte>(() => (contra && p.oferta ? { ...p.oferta.da } : monteVazio()));
  const [bancoDa, setBancoDa] = useState<Recurso | null>(null);
  const [bancoQuer, setBancoQuer] = useState<Recurso | null>(null);
  const taxas = p.pode.banco;
  const valida = somaDoMonte(da) > 0 && somaDoMonte(quer) > 0 && RECURSOS.every((r) => !(da[r] && quer[r]));

  return (
    <div className="catan-janela catan-troca">
      {ms !== null && <i className="catan-oferta-barra" style={{ width: `${Math.min(1, ms / PRAZO_DA_MONTAGEM) * 100}%` }} />}
      <div className="catan-janela-cabeca">
        <span className="catan-janela-titulo">{contra ? `Propor outra troca a ${nome(p.vez)}` : 'Trocar'}</span>
        {ms !== null && <span className="catan-oferta-tempo">{segundosQueFaltam(ms)} s{parada ? ` · vez parada em ${parada}` : ''}</span>}
        {!contra && taxas && (
          <span className="catan-abas">
            <button type="button" className={aba === 'jogadores' ? 'primary sm' : 'secundario sm'} onClick={() => onAba('jogadores')}>Com os jogadores</button>
            <button type="button" className={aba === 'banco' ? 'primary sm' : 'secundario sm'} onClick={() => onAba('banco')}>Com o banco</button>
          </span>
        )}
      </div>
      {aba === 'jogadores' || contra ? (
        <>
          <div><div className="xadrez-rotulo">Você dá</div><Escolher valor={da} limite={mao} onMudar={setDa} /></div>
          <div><div className="xadrez-rotulo">Você quer</div><Escolher valor={quer} onMudar={setQuer} /></div>
          <div className="catan-janela-pe">
            <button type="button" className="link" onClick={onFechar}>cancelar</button>
            <button type="button" className="primary" disabled={!valida || ocupado}
              onClick={async () => { if (await onJogar({ tipo: contra ? 'contraproposta' : 'oferecer', da, quer })) onFechar(); }}>
              {contra ? 'Propor' : 'Oferecer a todos'}
            </button>
          </div>
        </>
      ) : taxas && (
        <>
          <div>
            <div className="xadrez-rotulo">Você dá</div>
            <div className="catan-escolher">
              {RECURSOS.map((r) => (
                <button key={r} type="button" className={`catan-escolher-item botao ${bancoDa === r ? 'escolhido' : ''}`}
                  disabled={mao[r] < taxas[r]} onClick={() => setBancoDa(r)}>
                  <CartaDeRecurso recurso={r} pequena />
                  <span className="catan-taxa">{taxas[r]}:1</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="xadrez-rotulo">Você recebe</div>
            <div className="catan-escolher">
              {RECURSOS.map((r) => (
                <button key={r} type="button" className={`catan-escolher-item botao ${bancoQuer === r ? 'escolhido' : ''}`}
                  disabled={r === bancoDa || p.banco[r] === 0} onClick={() => setBancoQuer(r)}>
                  <CartaDeRecurso recurso={r} pequena />
                  <span className="catan-taxa">{p.banco[r]} no banco</span>
                </button>
              ))}
            </div>
          </div>
          <div className="catan-janela-pe">
            <button type="button" className="link" onClick={onFechar}>fechar</button>
            <button type="button" className="primary" disabled={!bancoDa || !bancoQuer || ocupado}
              onClick={async () => { if (bancoDa && bancoQuer && await onJogar({ tipo: 'banco', da: bancoDa, quer: bancoQuer })) setBancoQuer(null); }}>
              {bancoDa && bancoQuer ? `Trocar ${taxas[bancoDa]} ${NOME_DO_RECURSO[bancoDa]} por 1 ${NOME_DO_RECURSO[bancoQuer]}` : 'Escolha as duas cartas'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Os 15 s da troca: a barra que esvazia no alto da janela e os segundos que faltam. Some quando
 * a oferta fecha para respostas — aí não há mais tempo correndo para ninguém.
 */
function useTempoDaTroca(p: Partida, base: BaseDoRelogio) {
  const o = p.oferta;
  const ms = useRestante(o?.aberta ? o.prazo : null, base);
  return ms === null ? null : { segundos: segundosQueFaltam(ms), fracao: Math.min(1, ms / PRAZO_DA_TROCA) };
}

/** As cartas de um monte, uma por carta: "2 minério" são duas cartas de minério. */
function CartasDoMonte({ monte, pequenas = false }: { monte: Partial<Monte>; pequenas?: boolean }) {
  return (
    <div className={`catan-oferta-cartas ${pequenas ? 'pequenas' : ''}`}>
      {expandir(monte).map((r, i) => <CartaDeRecurso key={i} recurso={r} pequena={pequenas} />)}
    </div>
  );
}

/** Quem ofereceu vê as respostas chegando, e fecha com quem quiser. */
function Respostas({ partida: p, nome, ocupado, base, onJogar }: {
  partida: Partida; nome: (j: number) => string; ocupado: boolean; base: BaseDoRelogio; onJogar: (j: Jogada) => Promise<boolean>;
}) {
  const o = p.oferta!;
  const tempo = useTempoDaTroca(p, base);
  const outros = p.jogadores.map((_, j) => j).filter((j) => j !== p.eu && !p.jogadores[j].fora);
  return (
    <div className="catan-janela catan-respostas">
      {tempo && <i className="catan-oferta-barra" style={{ width: `${tempo.fracao * 100}%` }} />}
      <div className="catan-oferta-cabeca">
        <span className="catan-janela-titulo">Você oferece</span>
        <CartasDoMonte monte={o.da} pequenas />
        <span className="catan-janela-titulo">por</span>
        <CartasDoMonte monte={o.quer} pequenas />
        {tempo && <span className="catan-oferta-tempo">{tempo.segundos} s</span>}
      </div>
      {outros.map((j) => {
        const r = o.respostas[j];
        const c = o.contras[j];
        return (
          <div key={j} className="catan-resposta">
            <span className="catan-bolinha" style={{ background: COR_DO_JOGADOR[p.jogadores[j].cor] }} />
            <b>{nome(j)}</b>
            {r === 'aceita' ? <span className="catan-aceita">aceita</span>
              : r === 'recusa' ? <span className="muted">recusou</span>
              : r === 'contra' && c ? <span className="muted">propõe {textoDoMonte(c.da)} por {textoDoMonte(c.quer)}</span>
              : <span className="muted">pensando…{tempo ? ` ${tempo.segundos} s para responder` : ''}</span>}
            <span className="spacer" />
            {r === 'aceita' && <button type="button" className="primary sm" disabled={ocupado} onClick={() => onJogar({ tipo: 'fecharTroca', com: j })}>Trocar</button>}
            {r === 'contra' && c && <button type="button" className="secundario sm" disabled={ocupado || !temTudo(p.mao, expandir(c.quer))} onClick={() => onJogar({ tipo: 'fecharTroca', com: j, contra: true })}>Aceitar a dele</button>}
          </div>
        );
      })}
      <div className="catan-janela-pe"><button type="button" className="link" disabled={ocupado} onClick={() => onJogar({ tipo: 'cancelarOferta' })}>cancelar a oferta</button></div>
    </div>
  );
}
const expandir = (m: Partial<Monte>): Recurso[] => RECURSOS.flatMap((r) => Array<Recurso>(m[r] ?? 0).fill(r));

/**
 * Para quem não está na vez: a oferta de quem está, com as cartas desenhadas — o que você recebe
 * e o que você dá —, a resposta a um clique e os 15 s escorrendo. Sem resposta, ela recusa sozinha.
 */
function OfertaRecebida({ partida: p, nome, ocupado, base, onJogar, onContra }: {
  partida: Partida; nome: (j: number) => string; ocupado: boolean; base: BaseDoRelogio;
  onJogar: (j: Jogada) => Promise<boolean>; onContra: () => void;
}) {
  const o = p.oferta!;
  const tempo = useTempoDaTroca(p, base);
  const minha = p.eu !== null ? o.respostas[p.eu] : undefined;
  if (p.eu === null) return <div className="catan-dica">{nome(p.vez)} oferece {textoDoMonte(o.da)} por {textoDoMonte(o.quer)}</div>;
  const tenho = temTudo(p.mao, expandir(o.quer));
  return (
    <div className="catan-janela catan-oferta">
      {tempo && !minha && <i className="catan-oferta-barra" style={{ width: `${tempo.fracao * 100}%` }} />}
      <div className="catan-oferta-cabeca">
        <span className="catan-bolinha" style={{ background: COR_DO_JOGADOR[p.jogadores[p.vez].cor] }} />
        <span className="catan-janela-titulo">{nome(p.vez)} quer trocar com você</span>
        {tempo && !minha && <span className="catan-oferta-tempo">recusa sozinha em {tempo.segundos} s</span>}
      </div>
      <div className="catan-oferta-troca">
        <div className="catan-oferta-lado"><span className="xadrez-rotulo">Você recebe</span><CartasDoMonte monte={o.da} /></div>
        <span className="catan-oferta-seta" aria-hidden="true">⇄</span>
        <div className="catan-oferta-lado"><span className="xadrez-rotulo">Você dá</span><CartasDoMonte monte={o.quer} /></div>
      </div>
      {minha ? (
        <span className="muted">{minha === 'aceita' ? 'Você aceitou: esperando a resposta.'
          : minha === 'recusa' ? (o.aberta ? 'Você recusou.' : 'O tempo acabou: recusada.') : 'Você propôs outra troca.'}</span>
      ) : (
        <div className="catan-janela-pe">
          {!tenho && <span className="muted small">Você não tem essas cartas.</span>}
          <button type="button" className="link" disabled={ocupado} onClick={() => onJogar({ tipo: 'responder', resposta: 'recusa' })}>recusar</button>
          <button type="button" className="secundario sm" disabled={ocupado} onClick={onContra}>Propor outra</button>
          <button type="button" className="primary sm" disabled={ocupado || !tenho}
            onClick={() => onJogar({ tipo: 'responder', resposta: 'aceita' })}>Aceitar</button>
        </div>
      )}
    </div>
  );
}

function Descarte({ mao, quantas, ocupado, onJogar }: { mao: Monte; quantas: number; ocupado: boolean; onJogar: (j: Jogada) => Promise<boolean> }) {
  const [escolha, setEscolha] = useState<Monte>(monteVazio());
  const n = somaDoMonte(escolha);
  return (
    <div className="catan-janela">
      <div className="catan-janela-titulo">Saiu 7 — devolva {quantas} cartas</div>
      <span className="muted">Quem tem mais de 7 cartas devolve metade ao banco.</span>
      <Escolher valor={escolha} limite={mao} onMudar={setEscolha} />
      <div className="catan-janela-pe">
        <span className="muted">{n} de {quantas}</span>
        <button type="button" className="primary" disabled={n !== quantas || ocupado} onClick={() => onJogar({ tipo: 'descartar', recursos: escolha })}>Devolver</button>
      </div>
    </div>
  );
}

function Fartura({ banco, ocupado, onJogar, onFechar }: { banco: Monte; ocupado: boolean; onJogar: (j: Jogada) => Promise<boolean>; onFechar: () => void }) {
  const [escolha, setEscolha] = useState<Monte>(monteVazio());
  const lista = expandir(escolha);
  return (
    <div className="catan-janela">
      <div className="catan-janela-titulo">Ano de fartura — escolha duas cartas</div>
      <Escolher valor={escolha} limite={RECURSOS.reduce((m, r) => ({ ...m, [r]: Math.min(banco[r], 2 - somaDoMonte(escolha) + escolha[r]) }), {} as Monte)} onMudar={setEscolha} />
      <div className="catan-janela-pe">
        <button type="button" className="link" onClick={onFechar}>cancelar</button>
        <button type="button" className="primary" disabled={lista.length !== 2 || ocupado}
          onClick={async () => { if (await onJogar({ tipo: 'fartura', recursos: [lista[0], lista[1]] })) onFechar(); }}>Pegar</button>
      </div>
    </div>
  );
}

function Monopolio({ ocupado, onJogar, onFechar }: { ocupado: boolean; onJogar: (j: Jogada) => Promise<boolean>; onFechar: () => void }) {
  return (
    <div className="catan-janela">
      <div className="catan-janela-titulo">Monopólio — todos te dão todas as cartas de…</div>
      <div className="catan-escolher">
        {RECURSOS.map((r) => (
          <button key={r} type="button" className="catan-escolher-item botao" disabled={ocupado}
            onClick={async () => { if (await onJogar({ tipo: 'monopolio', recurso: r })) onFechar(); }}>
            <CartaDeRecurso recurso={r} pequena />
            <span className="catan-taxa">{NOME_DO_RECURSO[r]}</span>
          </button>
        ))}
      </div>
      <div className="catan-janela-pe"><button type="button" className="link" onClick={onFechar}>cancelar</button></div>
    </div>
  );
}

function Fim({ mesa, partida: p, nome, ocupado, onAgir, onSair }: {
  mesa: MesaDoCatan; partida: Partida; nome: (j: number) => string; ocupado: boolean;
  onAgir: (a: AcaoNaMesaDoCatan) => Promise<boolean>; onSair: () => void;
}) {
  const ordem = p.jogadores.map((j, k) => ({ ...j, k })).sort((a, b) => b.pontos - a.pontos);
  const maior = Math.max(1, ...Object.values(p.contagem));
  const jogou = p.eu !== null;
  return (
    <div className="catan-janela catan-fim">
      <div className="catan-fim-titulo">{p.vencedor === null ? 'Partida encerrada' : p.vencedor === p.eu ? 'Você venceu!' : `${nome(p.vencedor)} venceu`}</div>
      <div className="catan-placar">
        {ordem.map((j) => (
          <div key={j.k} className={`catan-placar-linha ${j.k === p.vencedor ? 'venceu' : ''}`}>
            <span className="catan-bolinha" style={{ background: COR_DO_JOGADOR[j.cor] }} />
            <b>{nome(j.k)}</b>
            {j.fora && <span className="muted small">saiu</span>}
            <span className="spacer" />
            {(j.cartasDeDesenvolvimento ?? []).filter((c) => c === 'ponto').length > 0 && (
              <span className="muted small">{(j.cartasDeDesenvolvimento ?? []).filter((c) => c === 'ponto').length} de carta</span>
            )}
            <b>{j.pontos}</b>
          </div>
        ))}
      </div>
      <div>
        <div className="xadrez-rotulo">Os dados nesta partida ({p.rolagens} rolagens)</div>
        <div className="catan-histograma">
          {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
            <div key={n} className="catan-barra" title={`${n}: ${p.contagem[n] ?? 0} vezes`}>
              <span className="catan-barra-n">{p.contagem[n] ?? 0}</span>
              <i style={{ height: `${((p.contagem[n] ?? 0) / maior) * 100}%` }} className={n === 7 ? 'sete' : ''} />
              <span>{n}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="catan-janela-pe">
        {jogou ? (
          <>
            <button type="button" className="secundario" disabled={ocupado} onClick={() => onAgir({ acao: 'fechar' })}>Fechar a mesa</button>
            <button type="button" className="primary" disabled={ocupado} onClick={() => onAgir({ acao: 'jogarDeNovo' })}>Jogar de novo</button>
          </>
        ) : <button type="button" className="secundario" onClick={onSair}>Parar de assistir</button>}
      </div>
      {mesa.plateia.length > 0 && <span className="muted small">Assistiram: {mesa.plateia.map((x) => x.nome).join(', ')}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// A mesa em volta (06/10/2026): a barra do jogo, os lugares, o banco, o que está acontecendo, a
// cola de custos e a sua mão. Era a coluna da direita; o dono escolheu a mesa A — "pense no UNO
// de PC, o pessoal em volta da mesa, o baralho deles" —, e a coluna se espalhou pela mesa.
// ---------------------------------------------------------------------------------------------

const TRACOS = {
  voltar: 'M15 6l-6 6 6 6M9 12h11',
  trocar: 'M4 8h13l-3-3M20 16H7l3 3',
  estrada: 'M7 21 10 3M17 21 14 3M12 6v2M12 12v2M12 18v2',
} as const;
/** Os três ícones de traço que o `Icon` da casa não tem. */
function Traco({ nome, tamanho = 16 }: { nome: keyof typeof TRACOS; tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={TRACOS[nome]} /></svg>
  );
}

/**
 * A barra da mesa: voltar para a Saga (a partida continua, e fica no alto do chat), a call — a
 * sala, o microfone e o fone, que dentro do jogo não têm outro lugar —, a rodada e o "⋯" com o
 * desistir. Quem só assiste vê "assistindo" e volta pelo mesmo botão.
 */
function BarraDaMesa({ mesa, partida: p, ocupado, surdo, call, jogando, onAgir, onSair }: {
  mesa: MesaDoCatan; partida: Partida; ocupado: boolean; surdo: boolean; call?: ControlesDaCall; jogando: boolean;
  onAgir: (a: AcaoNaMesaDoCatan) => Promise<boolean>; onSair: () => void;
}) {
  const rodada = p.fase === 'fim' ? 'fim da partida' : p.fase === 'inicio' ? 'colocação' : `rodada ${Math.max(1, p.rodada)}`;
  return (
    <div className="mesa-barra">
      <button type="button" className="mesa-hud" onClick={onSair} title="A partida continua; ela fica no alto do chat.">
        <Traco nome="voltar" />Voltar para a Saga
      </button>
      {call?.sala && <span className="mesa-hud mesa-hud-call"><i />{call.sala}</span>}
      {call && (
        <>
          <button type="button" className={`mesa-hud icone ${!call.micOn && call.conectado ? 'off' : ''}`}
            aria-disabled={!call.conectado || surdo} onClick={() => { if (call.conectado && !surdo) call.alternarMic(); }}
            title={!call.conectado ? 'Fora de call' : call.micOn ? 'Mutar microfone' : 'Desmutar microfone'}>
            <Icon name={call.micOn || !call.conectado ? 'mic' : 'micOff'} size={18} />
          </button>
          <button type="button" className={`mesa-hud icone ${surdo ? 'off' : ''}`} onClick={call.alternarSurdo}
            title={surdo ? 'Voltar a ouvir' : 'Ensurdecer'}>
            <Icon name={surdo ? 'headOff' : 'head'} size={18} />
          </button>
        </>
      )}
      <span className="spacer" />
      {mesa.eu === 'plateia' && <span className="mesa-hud mesa-hud-texto"><Icon name="olho" size={14} />assistindo</span>}
      {mesa.plateia.length > 0 && mesa.eu !== 'plateia' && (
        <span className="mesa-hud mesa-hud-texto" title={`Assistindo: ${mesa.plateia.map((x) => x.nome).join(', ')}`}>
          <Icon name="olho" size={14} />{mesa.plateia.length} assistindo
        </span>
      )}
      <span className="mesa-hud mesa-hud-texto forte">Catan · {rodada}</span>
      {jogando && <MenuDaMesa ocupado={ocupado} onDesistir={() => onAgir({ acao: 'desistir' })} />}
    </div>
  );
}

/** O "⋯" da barra: desistir arma no próprio botão, como antes — abandonar não é coisa de um clique só. */
function MenuDaMesa({ ocupado, onDesistir }: { ocupado: boolean; onDesistir: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [armado, setArmado] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) { setArmado(false); return; }
    const fora = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAberto(false); };
    window.addEventListener('mousedown', fora);
    return () => window.removeEventListener('mousedown', fora);
  }, [aberto]);
  useEffect(() => {
    if (!armado) return;
    const id = setTimeout(() => setArmado(false), 4000);
    return () => clearTimeout(id);
  }, [armado]);
  return (
    <div className="mesa-menu" ref={raiz}>
      <button type="button" className="mesa-hud icone" aria-haspopup="menu" aria-expanded={aberto} onClick={() => setAberto((a) => !a)} title="Mais">
        <Icon name="pontos" size={18} />
      </button>
      {aberto && (
        <div className="mesa-menu-lista" role="menu">
          {armado ? (
            <button type="button" role="menuitem" className="primary destrutivo" disabled={ocupado} autoFocus
              onClick={() => { setAberto(false); onDesistir(); }}>Confirmar: sair da partida</button>
          ) : (
            <button type="button" role="menuitem" className="perigo" disabled={ocupado} onClick={() => setArmado(true)}>Desistir da partida</button>
          )}
        </div>
      )}
    </div>
  );
}

/** O disco dourado dos pontos, como as fichas do jogo de tabuleiro. */
function Disco({ n, pequeno = false, titulo = 'Pontos' }: { n: number | string; pequeno?: boolean; titulo?: string }) {
  return <span className={`mesa-disco ${pequeno ? 'pequeno' : ''}`} title={titulo}>{n}</span>;
}

/**
 * A foto no anel da cor do jogador. Na vez dele, o tempo corre em volta: o anel vai se fechando
 * conforme o prazo escorre — a pessoa da vez brilha na mesa, como no UNO.
 */
function AnelDaFoto({ pessoa, nome, cor, relogio, base, tamanho }: {
  pessoa?: PessoaNoCatan; nome: string; cor: string; relogio: Faixa | null; base: BaseDoRelogio; tamanho: number;
}) {
  const ms = useRestante(relogio?.prazo, base);
  const fracao = ms === null || !relogio ? null : Math.min(1, ms / relogio.total);
  return (
    <span className={`mesa-anel ${relogio ? 'vez' : ''}`} style={{ '--cor-do-jogador': cor, width: tamanho, height: tamanho } as CSSProperties}>
      {fracao !== null && (
        <span className={`mesa-anel-tempo ${ms! <= ACABANDO ? 'acabando' : ''}`}
          style={{ background: `conic-gradient(currentColor ${fracao * 360}deg, transparent 0)` }} />
      )}
      <span className="mesa-anel-foto"><Avatar nome={pessoa?.nome ?? nome} foto={pessoa?.foto} /></span>
    </span>
  );
}

/** As cartas viradas de quem não é você, em leque, com a quantidade num selo. */
function Leque({ n }: { n: number }) {
  const k = Math.min(n, 9);
  const meio = (k - 1) / 2;
  return (
    <span className="mesa-leque" style={{ width: `calc(var(--carta-l) + var(--passo) * ${Math.max(0, k - 1)})` }} title={`${n} ${n === 1 ? 'carta' : 'cartas'} na mão`}>
      {k === 0 ? <span className="mesa-carta-vazia" /> : Array.from({ length: k }, (_, i) => (
        <Carta key={i} simbolo={SIMBOLO.versoDeRecurso} className="no-leque"
          estilo={{ left: `calc(var(--passo) * ${i})`, transform: `translateY(${Math.abs(i - meio) * 1.5}px) rotate(${((i - meio) * (k > 1 ? 16 / (k - 1) : 0)).toFixed(1)}deg)` }} />
      ))}
      <span className="mesa-selo">{n}</span>
    </span>
  );
}

/** O montinho de desenvolvimento de alguém, à parte, com o outro verso e a quantidade. */
function Montinho({ n }: { n: number }) {
  return (
    <span className="mesa-montinho" title={`${n} ${n === 1 ? 'carta' : 'cartas'} de desenvolvimento`}>
      {n === 0 ? <span className="mesa-carta-vazia" /> : Array.from({ length: Math.min(n, 3) }, (_, i) => (
        <Carta key={i} simbolo={SIMBOLO.versoDeDesenvolvimento} className="no-montinho"
          estilo={{ left: `${i * 3}px`, top: `${6 - i * 3}px` }} />
      ))}
      <span className="mesa-selo dev">{n}</span>
    </span>
  );
}

/** Cavaleiros e tamanho da estrada, e as fitas de quem tem o maior exército ou a maior estrada. */
function Selos({ partida: p, k }: { partida: Partida; k: number }) {
  const j = p.jogadores[k];
  return (
    <span className="mesa-selos">
      <span className="mesa-selo-info" title="Cavaleiros jogados"><Icon name="escudo" size={13} />{j.cavaleiros}</span>
      <span className="mesa-selo-info" title="A estrada mais comprida"><Traco nome="estrada" tamanho={14} />{j.estrada}</span>
      {p.maiorEstrada?.j === k && <span className="mesa-fita" title={`Maior estrada: ${p.maiorEstrada.tamanho}`}>Maior estrada</span>}
      {p.maiorExercito?.j === k && <span className="mesa-fita" title={`Maior exército: ${p.maiorExercito.tamanho} cavaleiros`}>Maior exército</span>}
    </span>
  );
}

/**
 * O lugar de quem não é você: a foto no anel, o nome, os pontos, o leque de cartas viradas com a
 * quantidade, o montinho de desenvolvimento à parte e os selos. O de cima fica deitado, em linha,
 * para não roubar altura do tabuleiro.
 */
function LugarNaMesa({ partida: p, k, onde, pessoa, nome, relogio, base }: {
  partida: Partida; k: number; onde: Lugar; pessoa?: PessoaNoCatan; nome: string; relogio: Faixa | null; base: BaseDoRelogio;
}) {
  const j = p.jogadores[k];
  const cor = COR_DO_JOGADOR[j.cor];
  const vez = p.fase !== 'fim' && p.vez === k;
  return (
    <div className={`mesa-lugar ${onde} ${vez ? 'vez' : ''} ${j.fora ? 'fora' : ''}`} style={{ '--cor-do-jogador': cor } as CSSProperties}>
      <div className="mesa-lugar-cabeca">
        <AnelDaFoto pessoa={pessoa} nome={nome} cor={cor} relogio={relogio} base={base} tamanho={46} />
        <span className="mesa-lugar-nome">
          <b>{nome}</b>
          {j.fora ? <span className="mesa-lugar-nota">saiu</span> : <Selos partida={p} k={k} />}
        </span>
        <Disco n={j.pontos} />
      </div>
      <div className="mesa-lugar-cartas">
        <Leque n={j.cartas} />
        <Montinho n={j.desenvolvimento} />
        {j.descartar > 0 && <span className="mesa-deve">devolvendo {j.descartar}</span>}
      </div>
    </div>
  );
}

/** O banco na mesa: os cinco montes virados para cima com quantas sobram, e o baralho virado. */
function Banco({ partida: p }: { partida: Partida }) {
  return (
    <div className="mesa-placa mesa-banco">
      <span className="mesa-rotulo">Banco</span>
      <div className="mesa-banco-montes">
        {RECURSOS.map((r) => (
          <span key={r} className="mesa-banco-monte" title={`${p.banco[r]} ${NOME_DO_RECURSO[r]} no banco`}>
            <span className="mesa-pilha">
              {p.banco[r] === 0 ? <span className="mesa-carta-vazia" /> : (
                <>
                  {p.banco[r] > 1 && <Carta simbolo={SIMBOLO.recursoPequeno(r)} className="no-banco atras" />}
                  <Carta simbolo={SIMBOLO.recursoPequeno(r)} className="no-banco" />
                </>
              )}
            </span>
            <b>{p.banco[r]}</b>
          </span>
        ))}
        <span className="mesa-banco-monte" title={`${p.baralho} ${p.baralho === 1 ? 'carta' : 'cartas'} de desenvolvimento no baralho`}>
          <span className="mesa-pilha">
            {p.baralho === 0 ? <span className="mesa-carta-vazia" /> : (
              <>
                {p.baralho > 1 && <Carta simbolo={SIMBOLO.versoDeDesenvolvimento} className="no-banco atras" />}
                <Carta simbolo={SIMBOLO.versoDeDesenvolvimento} className="no-banco" />
              </>
            )}
          </span>
          <b>{p.baralho}</b>
        </span>
      </div>
    </div>
  );
}

/**
 * O que está acontecendo, pequeno no canto: as últimas linhas, e "abrir" mostra a partida inteira
 * por cima do lugar da direita — a coluna inteira de antes não cabe na mesa em volta.
 */
function Acontecendo({ partida: p, nome }: { partida: Partida; nome: (j: number) => string }) {
  const [aberto, setAberto] = useState(false);
  const lista = useRef<HTMLDivElement>(null);
  const eventos = p.historico.map((e, i) => ({ i, texto: textoDoEvento(e, nome, p.eu), t: e.t })).filter((e) => e.texto);
  const vistos = aberto ? eventos : eventos.slice(-4);
  useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [eventos.length, aberto]);
  return (
    <div className="mesa-acontecendo-lugar">
      <div className={`mesa-placa mesa-acontecendo ${aberto ? 'aberto' : ''}`}>
        <button type="button" className="mesa-acontecendo-cabeca" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
          <Icon name="lista" size={15} /><span className="mesa-rotulo">Acontecendo</span><span className="mesa-link">{aberto ? 'fechar' : 'abrir'}</span>
        </button>
        <div className="mesa-historico" ref={lista}>
          {vistos.map((e) => <div key={e.i} className={`catan-evento ${e.t}`}>{e.texto}</div>)}
        </div>
      </div>
    </div>
  );
}

const LINHAS_DA_COLA: [Construcao, string][] = [['estrada', 'Estrada'], ['aldeia', 'Aldeia'], ['cidade', 'Cidade'], ['desenvolvimento', 'Carta']];

/**
 * A cola de custos como a carta do jogo de tabuleiro: a peça na sua cor, as cartas que ela custa e
 * o disco com os pontos. O que as suas cartas já pagam acende em verde, o que falta fica apagado —
 * mesmo fora da sua vez (`oQueDaParaConstruir`). Para quem só assiste, inteira, sem acender nada.
 */
function Cola({ partida: p, cor }: { partida: Partida; cor: string }) {
  // Acabada a partida, não há mais o que construir: a cola fica inteira.
  const pode = p.fase === 'fim' ? null : oQueDaParaConstruir(p);
  return (
    <div className="mesa-cola">
      <div className="mesa-cola-titulo">Custos de construção</div>
      {LINHAS_DA_COLA.map(([c, rotulo]) => (
        <div key={c} className={`mesa-cola-linha ${pode === null ? '' : pode[c] ? 'pode' : 'falta'}`}
          title={`${rotulo}: ${textoDoMonte(CUSTOS[c].reduce((m, r) => ({ ...m, [r]: (m[r] ?? 0) + 1 }), {} as Partial<Monte>))}${pode?.[c] ? ' — dá para fazer' : ''}`}>
          <span className="mesa-cola-peca">
            {c === 'desenvolvimento' ? <Carta simbolo={SIMBOLO.versoDeDesenvolvimento} className="na-cola" />
              : <span className="mesa-peca" dangerouslySetInnerHTML={{ __html: iconeDeConstruir(c, cor) }} />}
          </span>
          <span className="mesa-cola-nome">{rotulo}</span>
          <span className="mesa-cola-custo">{CUSTOS[c].map((r, i) => <Carta key={i} simbolo={SIMBOLO.recursoPequeno(r)} className="na-cola" />)}</span>
          <Disco n={PONTOS_DA_CONSTRUCAO[c]} pequeno titulo={c === 'desenvolvimento' ? 'Algumas valem ponto' : 'Pontos'} />
        </div>
      ))}
    </div>
  );
}

/**
 * A sua mão, embaixo no meio: a sua foto no anel (com o tempo, na sua vez), os pontos e quantas
 * cartas você tem, as de recurso com a arte da mesa e, separadas, as de desenvolvimento.
 */
function MinhaMao({ partida: p, nome, pessoa, chegou, relogio, base, ocupado, onJogarCarta }: {
  partida: Partida; nome: string; pessoa?: PessoaNoCatan; chegou?: Partial<Monte>; relogio: Faixa | null; base: BaseDoRelogio;
  ocupado: boolean; onJogarCarta: (c: CartaDeDesenvolvimento) => void;
}) {
  const eu = p.eu!;
  const j = p.jogadores[eu];
  const total = somaDoMonte(p.mao);
  const grupos = agruparCartas(p.cartas ?? []);
  return (
    <div className={`mesa-eu ${relogio?.minha ? 'acesa' : ''}`} style={{ '--cor-do-jogador': COR_DO_JOGADOR[j.cor] } as CSSProperties}>
      <div className="mesa-eu-quem">
        <AnelDaFoto pessoa={pessoa} nome={nome} cor={COR_DO_JOGADOR[j.cor]} relogio={relogio} base={base} tamanho={54} />
        <Disco n={j.pontos} />
        <b>{nome}</b>
        <span>{total} {total === 1 ? 'carta' : 'cartas'}</span>
      </div>
      <div className="mesa-eu-cartas">
        {RECURSOS.map((r) => <CartaDaMao key={r} recurso={r} n={p.mao![r]} chegou={chegou?.[r]} />)}
      </div>
      {grupos.length > 0 && (
        <div className="mesa-eu-dev">
          <span className="mesa-rotulo">Desenvolvimento</span>
          <div className={`mesa-eu-dev-cartas ${grupos.length > 2 ? 'apertadas' : ''}`}>
            {grupos.map((c) => (
              <CartaDeDesenvolvimento_ key={`${c.tipo}-${c.nova}`} carta={c.tipo} nova={c.nova} n={c.n}
                podeJogar={!c.nova && !!p.pode.jogar?.includes(c.tipo) && !ocupado} onJogar={() => onJogarCarta(c.tipo)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

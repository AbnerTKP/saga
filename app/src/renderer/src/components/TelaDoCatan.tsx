import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { agirNaMesaDoCatan, verMesaDoCatan, type Membro } from '../api';
import {
  CUSTOS, COR_DO_JOGADOR, NOME_DA_CARTA, NOME_DO_RECURSO, O_QUE_A_CARTA_FAZ, RECURSOS,
  centroDoHex, chaveDoHex, hexesQueProduziram, lerHex, monteVazio, oQueEspera, pontasDaAresta, pontoDoCruzamento,
  somaDoMonte, temTudo, textoDoEvento, textoDoMonte,
  type AcaoNaMesaDoCatan, type CartaDeDesenvolvimento, type Jogada, type MesaDoCatan, type Monte, type Partida,
  type PessoaNoCatan, type Recurso,
} from '../catan';
import { ALTURA, FUNDO_DA_CARTA, LARGURA, S, clarear, desenharFundo, desenharPecas, icone, noSvg, poli } from '../desenhoDoCatan';
import { rolarOsDados } from '../somDosDados';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

/** De quanto em quanto a tela pergunta pela mesa: a jogada dos outros chega em até isto. */
const INTERVALO = 800;
/** Quanto os dados rolam na tela antes de parar no número que o servidor tirou. */
const ROLANDO = 900;

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
export function TelaDoCatan({ mesaId, servidorId, euId, membros, naCall, surdo, live, onFechar, onAviso }: {
  mesaId: number;
  /** O servidor DA MESA: é a ele que toda pergunta vai, mesmo com outro aberto. */
  servidorId: number;
  euId: number;
  membros: Membro[];
  naCall: Set<number>;
  /** Fone desligado: os dados rolam calados. */
  surdo: boolean;
  live?: ReactNode;
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
  const receber = useCallback((m: MesaDoCatan | null) => {
    if (!m) { fecharRef.current(); return; }
    if (m.agora < ultimoAgora.current) return;
    ultimoAgora.current = m.agora;
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
  const nome = useCallback((j: number) => mesa?.jogadores?.[j]?.nome ?? '…', [mesa?.jogadores]);
  const espera = partida ? oQueEspera(partida, nome) : null;

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
        ) : mesa.estado === 'lobby' || !partida ? (
          <Lobby mesa={mesa} euId={euId} ocupado={ocupado} membros={membros} naCall={naCall} onAgir={agir} />
        ) : (
          <Partida_ mesa={mesa} partida={partida} ocupado={ocupado} surdo={surdo} live={live}
            nome={nome} onJogar={jogar} onAgir={agir} onSair={onFechar} />
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

function Partida_({ mesa, partida: p, ocupado, surdo, live, nome, onJogar, onAgir, onSair }: {
  mesa: MesaDoCatan; partida: Partida; ocupado: boolean; surdo: boolean; live?: ReactNode;
  nome: (j: number) => string;
  onJogar: (j: Jogada) => Promise<boolean>;
  onAgir: (a: AcaoNaMesaDoCatan) => Promise<boolean>;
  onSair: () => void;
}) {
  const eu = p.eu;
  const minhaVez = eu !== null && p.vez === eu && p.fase !== 'fim';
  const [modo, setModo] = useState<Modo>(null);
  const [janela, setJanela] = useState<Janela>(null);

  // Os dados rolam na tela a cada rolagem nova — inclusive a dos outros —, e o som vai junto.
  const rolagens = useRef(p.rolagens);
  const [rolando, setRolando] = useState(false);
  useEffect(() => {
    if (p.rolagens === rolagens.current) return;
    rolagens.current = p.rolagens;
    setRolando(true);
    if (!surdo) rolarOsDados();
    const id = setTimeout(() => setRolando(false), ROLANDO);
    return () => clearTimeout(id);
  }, [p.rolagens, surdo]);

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

  return (
    <div className="catan-partida">
      <div className="catan-esquerda">
        <div className="catan-tabuleiro-caixa">
          <TabuleiroDoCatan partida={p} acesos={acesos} modo={modoDaVez} corMinha={eu !== null ? COR_DO_JOGADOR[p.jogadores[eu].cor] : '#fff'}
            ocupado={ocupado} onCruzamento={clicarCruzamento} onAresta={clicarAresta} onTerreno={clicarTerreno} />
          <Dados dados={p.dados} rolando={rolando} />
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
            <OfertaRecebida partida={p} nome={nome} ocupado={ocupado} onJogar={onJogar}
              onContra={() => setJanela({ tipo: 'troca', aba: 'jogadores', contra: true })} />
          )}
          {p.pode.descartar && <Descarte mao={p.mao!} quantas={p.pode.descartar} ocupado={ocupado} onJogar={onJogar} />}
          {janela?.tipo === 'troca' && (
            <Troca partida={p} nome={nome} ocupado={ocupado} aba={janela.aba} contra={!!janela.contra}
              onAba={(aba) => setJanela({ ...janela, aba })} onJogar={onJogar} onFechar={() => setJanela(null)} />
          )}
          {souQuemOferece && janela?.tipo !== 'troca' && (
            <Respostas partida={p} nome={nome} ocupado={ocupado} onJogar={onJogar} />
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
        {eu !== null && p.mao && (
          <div className="catan-mao">
            <div className="catan-cartas">
              {RECURSOS.map((r) => <CartaDeRecurso key={r} recurso={r} n={p.mao![r]} />)}
              {/* Iguais viram uma carta com a quantidade: oito cartas soltas empurravam o tabuleiro. */}
              {agruparCartas(p.cartas ?? []).map((c) => (
                <CartaDeDesenvolvimento_ key={`${c.tipo}-${c.nova}`} carta={c.tipo} nova={c.nova} n={c.n}
                  podeJogar={!c.nova && !!p.pode.jogar?.includes(c.tipo) && !ocupado} onJogar={() => jogar(c.tipo)} />
              ))}
            </div>
            <div className="catan-acoes">
              {p.fase === 'fim' ? null : p.fase === 'inicio' ? (
                <span className="muted small">
                  {minhaVez ? (p.inicio?.falta === 'estrada' ? 'Agora a estrada, saindo da aldeia.' : 'Clique num cruzamento para pôr a aldeia.')
                    : 'Cada um põe uma aldeia e uma estrada; depois de novo, na volta.'}
                  {p.inicio?.segunda && minhaVez && p.inicio.falta === 'aldeia' ? ' Esta já rende as cartas dos terrenos em volta.' : ''}
                </span>
              ) : p.fase === 'rolar' && minhaVez ? (
                <button type="button" className="primary" disabled={ocupado} onClick={() => onJogar({ tipo: 'rolar' })}>Rolar os dados</button>
              ) : (
                <>
                  <button type="button" className={`secundario ${janela?.tipo === 'troca' ? 'ativo' : ''}`} disabled={!p.pode.trocar || ocupado}
                    onClick={() => setJanela(janela?.tipo === 'troca' ? null : { tipo: 'troca', aba: 'jogadores' })}>Trocar</button>
                  <BotaoDeConstruir rotulo="Estrada" custo={CUSTOS.estrada} ativo={modo === 'estrada'} pode={!!p.pode.estradas?.length && p.fase === 'acoes'} ocupado={ocupado} onClick={() => setModo(modo === 'estrada' ? null : 'estrada')} />
                  <BotaoDeConstruir rotulo="Aldeia" custo={CUSTOS.aldeia} ativo={modo === 'aldeia'} pode={!!p.pode.aldeias?.length && p.fase === 'acoes'} ocupado={ocupado} onClick={() => setModo(modo === 'aldeia' ? null : 'aldeia')} />
                  <BotaoDeConstruir rotulo="Cidade" custo={CUSTOS.cidade} ativo={modo === 'cidade'} pode={!!p.pode.cidades?.length} ocupado={ocupado} onClick={() => setModo(modo === 'cidade' ? null : 'cidade')} />
                  <BotaoDeConstruir rotulo="Carta" custo={CUSTOS.desenvolvimento} ativo={false} pode={!!p.pode.comprar} ocupado={ocupado} onClick={() => onJogar({ tipo: 'comprar' })} />
                  <button type="button" className="primary" disabled={!p.pode.passar || ocupado} onClick={() => { setModo(null); setJanela(null); onJogar({ tipo: 'passar' }); }}>Passar a vez</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      <Coluna mesa={mesa} partida={p} nome={nome} ocupado={ocupado} live={live} onAgir={onAgir} onSair={onSair} />
    </div>
  );
}

function BotaoDeConstruir({ rotulo, custo, ativo, pode, ocupado, onClick }: {
  rotulo: string; custo: Recurso[]; ativo: boolean; pode: boolean; ocupado: boolean; onClick: () => void;
}) {
  return (
    <button type="button" className={`secundario ${ativo ? 'ativo' : ''}`} disabled={!pode || ocupado} onClick={onClick}
      title={`${rotulo}: ${textoDoMonte(custo.reduce((m, r) => ({ ...m, [r]: (m[r] ?? 0) + 1 }), {} as Partial<Monte>))}`}>
      {rotulo}
    </button>
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
  const chaveDasPecas = JSON.stringify([p.construcoes, p.estradas, p.ladrao, [...acesos], p.jogadores.map((j) => j.cor)]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pecas = useMemo(() => desenharPecas(p, acesos), [chaveDasPecas]);

  const cruzamentos = modo === 'aldeia' ? p.pode.aldeias : modo === 'cidade' ? p.pode.cidades : undefined;
  const arestas = modo === 'estrada' ? p.pode.estradas : undefined;
  const terrenos = modo === 'ladrao' && p.pode.ladrao ? Object.keys(p.pode.ladrao) : undefined;

  return (
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
  );
}

const FACES: Record<number, [number, number][]> = {
  1: [[.5, .5]], 2: [[.28, .28], [.72, .72]], 3: [[.26, .26], [.5, .5], [.74, .74]],
  4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]], 5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]],
  6: [[.28, .24], [.72, .24], [.28, .5], [.72, .5], [.28, .76], [.72, .76]],
};

function Dado({ n, vermelho, giro }: { n: number; vermelho: boolean; giro: number }) {
  const cor = vermelho ? '#d8453b' : '#f4efe4';
  const pip = vermelho ? '#ffffff' : '#1d1d1d';
  return (
    <svg className="catan-dado" viewBox="-6 -6 112 116" style={{ transform: `rotate(${giro}deg)` }} aria-hidden="true">
      <rect x="0" y="6" width="100" height="100" rx="22" fill="rgba(0,0,0,.4)" />
      <rect x="0" y="0" width="100" height="100" rx="22" fill={vermelho ? '#a8322b' : '#c9c3b6'} />
      <rect x="0" y="0" width="100" height="94" rx="22" fill={cor} />
      <rect x="6" y="5" width="88" height="20" rx="10" fill="#fff" opacity=".22" />
      {FACES[n].map(([x, y], i) => <circle key={i} cx={x * 100} cy={y * 100} r="9" fill={pip} />)}
    </svg>
  );
}

/** Os dois dados no canto do tabuleiro: rolando, trocam de face a cada 80 ms; parados, o número grande do lado. */
function Dados({ dados, rolando }: { dados: [number, number] | null; rolando: boolean }) {
  const [faces, setFaces] = useState<[number, number]>([1, 1]);
  useEffect(() => {
    if (!rolando) return;
    const id = setInterval(() => setFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]), 80);
    return () => clearInterval(id);
  }, [rolando]);
  if (!dados) return null;
  const [a, b] = rolando ? faces : dados;
  return (
    <div className={`catan-dados ${rolando ? 'rolando' : ''} ${!rolando && a + b === 7 ? 'sete' : ''}`}>
      <Dado n={a} vermelho={false} giro={rolando ? faces[1] * 40 : -6} />
      <Dado n={b} vermelho giro={rolando ? faces[0] * -40 : 8} />
      {!rolando && <span className="catan-soma">{a + b}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// As cartas.
// ---------------------------------------------------------------------------------------------

function CartaDeRecurso({ recurso, n, pequena = false }: { recurso: Recurso; n?: number; pequena?: boolean }) {
  const [a, b] = FUNDO_DA_CARTA[recurso];
  return (
    <div className={`catan-carta ${pequena ? 'pequena' : ''} ${n === 0 ? 'zerada' : ''}`} title={NOME_DO_RECURSO[recurso]}
      style={{ background: `radial-gradient(circle at 35% 25%, ${clarear(a, 0.15)}, ${a} 55%, ${b})` }}>
      <svg viewBox="-1 -1 2 2" dangerouslySetInnerHTML={{ __html: icone(recurso) }} />
      {n !== undefined && <span className="catan-carta-n">{n}</span>}
    </div>
  );
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

function CartaDeDesenvolvimento_({ carta, nova, n, podeJogar, onJogar }: {
  carta: CartaDeDesenvolvimento; nova: boolean; n: number; podeJogar: boolean; onJogar: () => void;
}) {
  const dica = `${NOME_DA_CARTA[carta]}: ${O_QUE_A_CARTA_FAZ[carta]}${nova && carta !== 'ponto' ? ' Comprada neste turno: vale a partir do próximo.' : ''}`;
  return (
    <button type="button" className={`catan-carta desenvolvimento ${podeJogar ? 'jogavel' : ''}`} title={dica}
      disabled={!podeJogar} onClick={onJogar}>
      <span className="catan-carta-nome">{NOME_DA_CARTA[carta]}</span>
      {nova && <span className="catan-carta-nova">nova</span>}
      {n > 1 && <span className="catan-carta-n">{n}</span>}
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

function Troca({ partida: p, nome, ocupado, aba, contra, onAba, onJogar, onFechar }: {
  partida: Partida; nome: (j: number) => string; ocupado: boolean; aba: 'jogadores' | 'banco'; contra: boolean;
  onAba: (a: 'jogadores' | 'banco') => void; onJogar: (j: Jogada) => Promise<boolean>; onFechar: () => void;
}) {
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
      <div className="catan-janela-cabeca">
        <span className="catan-janela-titulo">{contra ? `Propor outra troca a ${nome(p.vez)}` : 'Trocar'}</span>
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

/** Quem ofereceu vê as respostas chegando, e fecha com quem quiser. */
function Respostas({ partida: p, nome, ocupado, onJogar }: {
  partida: Partida; nome: (j: number) => string; ocupado: boolean; onJogar: (j: Jogada) => Promise<boolean>;
}) {
  const o = p.oferta!;
  const outros = p.jogadores.map((_, j) => j).filter((j) => j !== p.eu && !p.jogadores[j].fora);
  return (
    <div className="catan-janela catan-respostas">
      <div className="catan-janela-titulo">Você oferece {textoDoMonte(o.da)} por {textoDoMonte(o.quer)}</div>
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
              : <span className="muted">pensando…</span>}
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

/** Para quem não está na vez: a oferta de quem está, com a resposta a um clique. */
function OfertaRecebida({ partida: p, nome, ocupado, onJogar, onContra }: {
  partida: Partida; nome: (j: number) => string; ocupado: boolean; onJogar: (j: Jogada) => Promise<boolean>; onContra: () => void;
}) {
  const o = p.oferta!;
  const minha = p.eu !== null ? o.respostas[p.eu] : undefined;
  if (p.eu === null) return <div className="catan-dica">{nome(p.vez)} oferece {textoDoMonte(o.da)} por {textoDoMonte(o.quer)}</div>;
  return (
    <div className="catan-janela catan-oferta">
      <div className="catan-janela-titulo">{nome(p.vez)} oferece {textoDoMonte(o.da)} por {textoDoMonte(o.quer)}</div>
      {minha ? (
        <span className="muted">{minha === 'aceita' ? 'Você aceitou: esperando a resposta.' : minha === 'recusa' ? 'Você recusou.' : 'Você propôs outra troca.'}</span>
      ) : (
        <div className="catan-janela-pe">
          <button type="button" className="link" disabled={ocupado} onClick={() => onJogar({ tipo: 'responder', resposta: 'recusa' })}>recusar</button>
          <button type="button" className="secundario sm" disabled={ocupado} onClick={onContra}>Propor outra</button>
          <button type="button" className="primary sm" disabled={ocupado || !temTudo(p.mao, expandir(o.quer))}
            title={temTudo(p.mao, expandir(o.quer)) ? undefined : 'Você não tem essas cartas.'}
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
// A coluna: jogadores, custos, o que está acontecendo, plateia e desistir.
// ---------------------------------------------------------------------------------------------

function Coluna({ mesa, partida: p, nome, ocupado, live, onAgir, onSair }: {
  mesa: MesaDoCatan; partida: Partida; nome: (j: number) => string; ocupado: boolean; live?: ReactNode;
  onAgir: (a: AcaoNaMesaDoCatan) => Promise<boolean>; onSair: () => void;
}) {
  const lista = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [p.historico.length]);

  const [armado, setArmado] = useState(false);
  useEffect(() => {
    if (!armado) return;
    const id = setTimeout(() => setArmado(false), 4000);
    return () => clearTimeout(id);
  }, [armado]);

  const eventos = p.historico.map((e, i) => ({ i, texto: textoDoEvento(e, nome, p.eu), t: e.t })).filter((e) => e.texto);
  const pessoa = (j: number): PessoaNoCatan | undefined => mesa.jogadores?.[j];
  const jogando = p.eu !== null && !p.jogadores[p.eu].fora && p.fase !== 'fim';

  return (
    <div className="catan-coluna">
      <div className="catan-caixa catan-jogadores">
        {p.jogadores.map((j, k) => {
          const quem = pessoa(k);
          return (
            <div key={k} className={`catan-jogador ${p.vez === k && p.fase !== 'fim' ? 'vez' : ''} ${j.fora ? 'fora' : ''}`}>
              <span className="catan-anel" style={{ borderColor: COR_DO_JOGADOR[j.cor] }}>
                <Avatar nome={quem?.nome ?? '?'} foto={quem?.foto} />
              </span>
              <span className="catan-jogador-nome">
                {nome(k)}{k === p.eu && <span className="catan-voce">você</span>}
                {p.maiorEstrada?.j === k && <span className="catan-selo" title={`Maior estrada: ${p.maiorEstrada.tamanho}`}>ESTRADA</span>}
                {p.maiorExercito?.j === k && <span className="catan-selo" title={`Maior exército: ${p.maiorExercito.tamanho} cavaleiros`}>EXÉRCITO</span>}
              </span>
              <span className="catan-pontos">{j.pontos}<small>{j.pontos === 1 ? 'ponto' : 'pontos'}</small></span>
              <span className="catan-jogador-detalhe">
                <span title="Cartas na mão">{j.cartas} {j.cartas === 1 ? 'carta' : 'cartas'}</span>
                <span title="Cartas de desenvolvimento">{j.desenvolvimento} desenv.</span>
                <span title="Cavaleiros jogados">{j.cavaleiros} cav.</span>
                <span title="A estrada mais comprida">estrada {j.estrada}</span>
                {j.fora && <span>saiu</span>}
                {j.descartar > 0 && <span className="catan-deve">devolvendo {j.descartar}</span>}
              </span>
            </div>
          );
        })}
      </div>
      <div className="catan-caixa catan-custos">
        <span className="xadrez-rotulo">Custos</span>
        {([['Estrada', CUSTOS.estrada], ['Aldeia', CUSTOS.aldeia], ['Cidade', CUSTOS.cidade], ['Desenvolvimento', CUSTOS.desenvolvimento]] as const).map(([rotulo, custo]) => (
          <div key={rotulo} className="catan-custo">
            <span>{rotulo}</span>
            <span className="catan-custo-cartas">{custo.map((r, i) => <CartaDeRecurso key={i} recurso={r} pequena />)}</span>
          </div>
        ))}
      </div>
      <div className="catan-caixa catan-acontecendo">
        <span className="xadrez-rotulo">Acontecendo</span>
        <div className="catan-historico" ref={lista}>
          {eventos.map((e) => <div key={e.i} className={`catan-evento ${e.t}`}>{e.texto}</div>)}
        </div>
      </div>
      {live && <div className="xadrez-live">{live}</div>}
      {mesa.plateia.length > 0 && (
        <div className="xadrez-plateia" title={`Assistindo: ${mesa.plateia.map((x) => x.nome).join(', ')}`}>
          <Icon name="olho" size={13} /><span>{mesa.plateia.length} assistindo</span>
        </div>
      )}
      {jogando && (armado ? (
        <button type="button" className="primary destrutivo" disabled={ocupado} autoFocus
          onClick={() => { setArmado(false); onAgir({ acao: 'desistir' }); }}>Confirmar: sair da partida</button>
      ) : (
        <button type="button" className="perigo" disabled={ocupado} onClick={() => setArmado(true)}>Desistir</button>
      ))}
      {p.eu === null && p.fase !== 'fim' && <button type="button" className="secundario" onClick={onSair}>Parar de assistir</button>}
    </div>
  );
}

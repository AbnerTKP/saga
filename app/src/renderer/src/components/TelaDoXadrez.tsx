import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { agirNaMesa, verMesa, type AcaoNaMesa, type Membro, type Mesa, type PessoaDaMesa } from '../api';
import { quemChamar, type Chamavel } from '../jogos';
import {
  emPares, formatarRelogio, lerCasas, partesDoLance, plateiaDaPartida, POUCO_TEMPO, restante, TEMPOS,
  textoDoFim, tomadas, type CorEscolhida, type Lado,
} from '../xadrez';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Tabuleiro } from './Tabuleiro';

/** De quanto em quanto a tela pergunta pela mesa: o lance do outro chega em até isto. */
const INTERVALO = 800;
/** As barras de cima e de baixo do tabuleiro, o respiro entre elas e ele, e a coluna ao lado. */
const BARRA = 40;
const RESPIRO = 8;
const COLUNA = 240;
const VAO = 20;

const ROTULO_DA_COR: Record<CorEscolhida, string> = { brancas: 'Brancas', sorteio: 'Sorteio', pretas: 'Pretas' };

/**
 * A partida da dupla, na tela dela — e só ela: várias duplas jogam ao mesmo tempo, cada uma
 * na sua, e quem é de fora entra como plateia. É a mesma tela do começo ao fim: a mesa
 * aberta (o lobby), a partida e o fim, conforme o que o servidor diz da mesa.
 */
export function TelaDoXadrez({ mesaId, servidorId, euId, membros, naCall, jogando, live, onFechar, onAviso }: {
  mesaId: number;
  /** O servidor DA MESA: é a ele que toda pergunta vai, mesmo com outro aberto. */
  servidorId: number;
  euId: number;
  /** Quem faz parte do servidor da mesa — é daí que sai a lista de quem chamar. */
  membros: Membro[];
  /** Ids de quem está na sua call agora. */
  naCall: Set<number>;
  /** Ids de quem está numa partida em andamento, pela busca de salas. */
  jogando: Set<number>;
  /** A live que você assiste, pequena, na coluna — por cima do tabuleiro ela esconderia casas. */
  live?: ReactNode;
  onFechar: () => void;
  onAviso: (tipo: 'erro' | 'info', texto: string) => void;
}) {
  const [mesa, setMesa] = useState<Mesa | null>(null);
  const [falhou, setFalhou] = useState<string | null>(null);
  const [pendente, setPendente] = useState<{ de: string; para: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const recebidaEm = useRef(0);
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;
  const avisarRef = useRef(onAviso);
  avisarRef.current = onAviso;
  // Quem fecha a mesa daqui não precisa ouvir "a mesa foi fechada" da busca que ainda voltava.
  const saindo = useRef(false);

  /**
   * Resposta mais velha que a última aplicada não entra. A busca que saiu antes de um lance e
   * voltou depois dele desfaria o lance na tela até a busca seguinte; quem data a resposta é
   * o relógio do SERVIDOR, que é o único que viu as duas na ordem em que aconteceram.
   */
  const ultimoAgora = useRef(0);
  const receber = useCallback((m: Mesa | null) => {
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
        const m = await verMesa(mesaId, servidorId);
        if (vivo) receber(m);
      } catch (e) {
        if (!vivo) return;
        if ((e as { status?: number }).status === 404) {
          vivo = false;
          if (!saindo.current) avisarRef.current('info', 'A mesa de xadrez foi fechada.');
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

  const agir = useCallback(async (a: AcaoNaMesa) => {
    if (a.acao === 'fechar') saindo.current = true;
    if (a.acao === 'lance') setPendente({ de: a.de, para: a.para });
    setOcupado(true);
    try {
      receber(await agirNaMesa(mesaId, a, servidorId));
    } catch (e) {
      saindo.current = false;
      avisarRef.current('erro', (e as Error).message);
    } finally {
      setOcupado(false);
      if (a.acao === 'lance') setPendente(null);
    }
  }, [mesaId, servidorId, receber]);

  // O relógio anda de décimo em décimo só enquanto corre; parado, a tela fica quieta.
  const [agora, setAgora] = useState(() => Date.now());
  const correndo = mesa?.estado === 'jogando' ? mesa.relogio?.correndo ?? null : null;
  useEffect(() => {
    if (!correndo) return;
    const id = setInterval(() => setAgora(Date.now()), 100);
    return () => clearInterval(id);
  }, [correndo]);

  // O tabuleiro cresce com a janela: o maior que couber em altura e em largura, com a coluna.
  const area = useRef<HTMLDivElement>(null);
  const [casa, setCasa] = useState(52);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const medir = () => {
      const { width, height } = el.getBoundingClientRect();
      const porAltura = (height - 24 - 2 * BARRA - 2 * RESPIRO) / 8;
      const porLargura = (width - 24 - COLUNA - VAO) / 8;
      setCasa(Math.max(30, Math.min(88, Math.floor(Math.min(porAltura, porLargura)))));
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const souPlateia = !!mesa && (mesa.eu === 'plateia' || mesa.eu === 'convidado');
  const titulo = !mesa ? null
    : mesa.estado === 'lobby' ? 'mesa aberta'
    : `${mesa.brancas?.nome ?? '…'} × ${mesa.pretas?.nome ?? '…'}`;

  return (
    <div className="tela-do-xadrez">
      <header className="stage-head">
        <Icon name="controle" />
        <span className="strong">Xadrez</span>
        {titulo && <span className="xadrez-titulo">{titulo}</span>}
        {souPlateia && <span className="selo-assistindo"><Icon name="olho" size={12} /> assistindo</span>}
      </header>
      <div className="xadrez-area" ref={area}>
        {!mesa ? (
          <div className="xadrez-carregando muted">
            {falhou ? `Não consegui abrir a mesa (${falhou}). Tentando de novo…` : 'Abrindo a mesa…'}
          </div>
        ) : (
          <Partida
            mesa={mesa} euId={euId} casa={casa} passou={agora - recebidaEm.current}
            pendente={pendente} ocupado={ocupado} live={live}
            membros={membros} naCall={naCall} jogando={jogando}
            onAgir={agir} onSair={onFechar}
          />
        )}
      </div>
    </div>
  );
}

function Partida({ mesa, euId, casa, passou, pendente, ocupado, live, membros, naCall, jogando, onAgir, onSair }: {
  mesa: Mesa; euId: number; casa: number; passou: number;
  pendente: { de: string; para: string } | null;
  ocupado: boolean;
  live?: ReactNode;
  membros: Membro[]; naCall: Set<number>; jogando: Set<number>;
  onAgir: (a: AcaoNaMesa) => void;
  onSair: () => void;
}) {
  const minhaCor: Lado | null = mesa.eu === 'brancas' ? 'w' : mesa.eu === 'pretas' ? 'b' : null;
  // Quem joga vê a própria cor embaixo; quem abriu a mesa de pretas já a vê assim no lobby.
  const embaixo: Lado = minhaCor ?? (mesa.eu === 'anfitriao' && mesa.cor === 'pretas' ? 'b' : 'w');
  const emCima: Lado = embaixo === 'w' ? 'b' : 'w';
  const { pelasBrancas, pelasPretas } = tomadas(lerCasas(mesa.fen));
  const altura = casa * 8 + 2 * BARRA + 2 * RESPIRO;
  const noLobby = mesa.estado === 'lobby';
  const relogioDoLobby = mesa.tempo ? <Relogio ms={mesa.tempo * 1000} correndo={false} /> : null;

  const barraDe = (lado: Lado) => {
    const pessoa = lado === 'w' ? mesa.brancas : mesa.pretas;
    const voce = pessoa?.id === euId;
    const naVez = mesa.estado === 'jogando' && mesa.vez === lado;
    const venceu = !!mesa.fim && mesa.fim.vencedor !== null && mesa.fim.vencedor === pessoa?.id;
    const ms = mesa.relogio ? restante(mesa.relogio, lado, mesa.estado === 'jogando' ? passou : 0) : null;
    return (
      <BarraDoJogador
        pessoa={pessoa}
        detalhe={`${lado === 'w' ? 'brancas' : 'pretas'}${voce ? ' · você' : ''}`}
        tomou={lado === 'w' ? pelasBrancas : pelasPretas}
      >
        {venceu && <span className="xadrez-chip venceu">Venceu</span>}
        {ms !== null
          ? <Relogio ms={ms} correndo={naVez} />
          : naVez && <span className={`xadrez-chip ${voce ? 'vez' : ''}`}>{voce ? 'Sua vez' : 'Pensando…'}</span>}
      </BarraDoJogador>
    );
  };

  const fim = mesa.fim && mesa.brancas && mesa.pretas ? textoDoFim(mesa.fim, mesa.brancas, mesa.pretas, euId) : null;
  const souJogador = minhaCor !== null;
  const outro = mesa.brancas?.id === euId ? mesa.pretas : mesa.brancas;

  return (
    <>
      <div className="xadrez-coluna-do-tabuleiro">
        {noLobby ? (
          <div className="xadrez-barra">
            <span className="xadrez-lugar-vazio" />
            <span className="xadrez-esperando">
              {mesa.convidado ? `Esperando ${mesa.convidado.nome} responder…` : 'Esperando adversário…'}
            </span>
            <span className="spacer" />
            {relogioDoLobby}
          </div>
        ) : barraDe(emCima)}

        <div className="xadrez-tabuleiro-e-camada">
          <Tabuleiro
            fen={mesa.fen}
            embaixo={embaixo}
            legais={mesa.estado === 'jogando' ? mesa.legais : []}
            ultimo={mesa.ultimo}
            xeque={mesa.xeque}
            vez={mesa.vez}
            pendente={pendente}
            casa={casa}
            onLance={mesa.estado === 'jogando' && souJogador
              ? (de, para, promocao) => onAgir({ acao: 'lance', de, para, ...(promocao ? { promocao } : {}) })
              : undefined}
          />
          {fim && (
            <div className="xadrez-fim">
              <div className="xadrez-fim-cartao">
                <span className="xadrez-fim-titulo">{fim.titulo}</span>
                <span className="muted">{fim.frase}</span>
                <div className="xadrez-fim-botoes">
                  {souJogador && (
                    mesa.revanchePedidaPor === euId
                      ? <button type="button" className="primary sm" disabled>Revanche pedida…</button>
                      : (
                        <button type="button" className="primary sm" disabled={ocupado} onClick={() => onAgir({ acao: 'revanche' })}>
                          {mesa.revanchePedidaPor ? 'Aceitar revanche' : 'Revanche'}
                        </button>
                      )
                  )}
                  {souJogador ? (
                    <button type="button" className="secundario sm" disabled={ocupado} onClick={() => onAgir({ acao: 'fechar' })}>
                      Sair da mesa
                    </button>
                  ) : (
                    <button type="button" className="secundario sm" onClick={onSair}>Parar de assistir</button>
                  )}
                </div>
                {souJogador && mesa.revanchePedidaPor !== null && mesa.revanchePedidaPor !== euId && (
                  <span className="small muted">{outro?.nome ?? 'O adversário'} quer revanche, com as cores trocadas.</span>
                )}
              </div>
            </div>
          )}
        </div>

        {noLobby ? (
          <BarraDoJogador
            pessoa={mesa.anfitriao}
            detalhe={mesa.cor === 'sorteio' ? 'você' : `${mesa.cor} · você`}
            tomou=""
          >
            {relogioDoLobby}
          </BarraDoJogador>
        ) : barraDe(embaixo)}
      </div>

      {noLobby ? (
        <Lobby mesa={mesa} euId={euId} altura={altura} ocupado={ocupado} membros={membros}
          naCall={naCall} jogando={jogando} onAgir={onAgir} />
      ) : (
        <ColunaDosLances mesa={mesa} euId={euId} altura={altura} ocupado={ocupado} live={live}
          souJogador={souJogador} outro={outro} onAgir={onAgir} onSair={onSair} />
      )}
    </>
  );
}

function BarraDoJogador({ pessoa, detalhe, tomou, children }: {
  pessoa: PessoaDaMesa | null;
  detalhe: string;
  tomou: string;
  children?: ReactNode;
}) {
  return (
    <div className="xadrez-barra">
      <Avatar nome={pessoa?.nome ?? '?'} foto={pessoa?.foto} />
      <span className="xadrez-quem">
        <span className="xadrez-nome">{pessoa?.nome ?? '…'}</span>
        <span className="xadrez-lado">{detalhe}</span>
      </span>
      {tomou && <span className="xadrez-tomadas" title="Peças que já tomou">{tomou}</span>}
      <span className="spacer" />
      {children}
    </div>
  );
}

/** O relógio de quem está na vez fica aceso; abaixo de 20 s, vermelho. */
function Relogio({ ms, correndo }: { ms: number; correndo: boolean }) {
  const pouco = ms < POUCO_TEMPO;
  return (
    <span className={`xadrez-relogio ${correndo ? 'correndo' : ''} ${pouco ? 'pouco' : ''}`}>
      {formatarRelogio(ms)}
    </span>
  );
}

function Lance({ san, ultimo }: { san: string; ultimo: boolean }) {
  return (
    <span className={`xadrez-lance ${ultimo ? 'ultimo' : ''}`}>
      {partesDoLance(san).map((p, i) => <span key={i} className={p.figura ? 'figura' : undefined}>{p.texto}</span>)}
    </span>
  );
}

function ColunaDosLances({ mesa, euId, altura, ocupado, live, souJogador, outro, onAgir, onSair }: {
  mesa: Mesa; euId: number; altura: number; ocupado: boolean; live?: ReactNode;
  souJogador: boolean;
  outro: PessoaDaMesa | null;
  onAgir: (a: AcaoNaMesa) => void;
  onSair: () => void;
}) {
  const lista = useRef<HTMLDivElement>(null);
  // O último lance fica à vista: a lista desce sozinha quando chega mais um.
  useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mesa.lances.length]);

  // Desistir perde a partida e não tem volta: o primeiro clique arma, o segundo desiste.
  // Uma janela a mais seria pesada para a decisão; um clique só, fácil demais de errar.
  const [armado, setArmado] = useState(false);
  useEffect(() => {
    if (!armado) return;
    const id = setTimeout(() => setArmado(false), 4000);
    return () => clearTimeout(id);
  }, [armado]);

  const pares = emPares(mesa.lances);
  const ultimo = mesa.lances.length - 1;
  const plateia = plateiaDaPartida(mesa.plateia, euId);
  const empateDoOutro = mesa.empateOferecidoPor !== null && mesa.empateOferecidoPor !== euId;

  return (
    <div className="xadrez-lateral" style={{ height: altura }}>
      <div className="xadrez-cabecalho">Lances</div>
      <div className="xadrez-lances" ref={lista}>
        {pares.length === 0 ? <span className="muted small">As brancas começam.</span> : pares.map((p) => (
          <div key={p.numero} className="xadrez-par">
            <span className="xadrez-numero">{p.numero}.</span>
            <Lance san={p.brancas} ultimo={(p.numero - 1) * 2 === ultimo} />
            {p.pretas ? <Lance san={p.pretas} ultimo={(p.numero - 1) * 2 + 1 === ultimo} /> : <span />}
          </div>
        ))}
      </div>
      {live && <div className="xadrez-live">{live}</div>}
      {plateia && (
        <div className="xadrez-plateia" title={`Assistindo: ${mesa.plateia.map((p) => p.nome).join(', ')}`}>
          <Icon name="olho" size={13} /><span>{plateia}</span>
        </div>
      )}
      {souJogador && mesa.estado === 'jogando' && (
        <div className="xadrez-botoes">
          {empateDoOutro ? (
            <div className="xadrez-proposta">
              <span><strong>{outro?.nome ?? 'O adversário'}</strong> ofereceu empate</span>
              <div className="xadrez-proposta-botoes">
                <button type="button" className="primary sm" disabled={ocupado} onClick={() => onAgir({ acao: 'aceitarEmpate' })}>Aceitar</button>
                <button type="button" className="link" disabled={ocupado} onClick={() => onAgir({ acao: 'recusarEmpate' })}>recusar</button>
              </div>
            </div>
          ) : (
            <button type="button" className="secundario" disabled={ocupado || mesa.empateOferecidoPor === euId}
              onClick={() => onAgir({ acao: 'oferecerEmpate' })}>
              {mesa.empateOferecidoPor === euId ? 'Empate oferecido' : 'Oferecer empate'}
            </button>
          )}
          {armado ? (
            <button type="button" className="primary destrutivo" disabled={ocupado} autoFocus
              onClick={() => { setArmado(false); onAgir({ acao: 'desistir' }); }}>
              Confirmar desistência
            </button>
          ) : (
            <button type="button" className="perigo" disabled={ocupado} onClick={() => setArmado(true)}>Desistir</button>
          )}
        </div>
      )}
      {!souJogador && mesa.estado === 'jogando' && (
        <button type="button" className="secundario" onClick={onSair}>Parar de assistir</button>
      )}
    </div>
  );
}

function Lobby({ mesa, euId, altura, ocupado, membros, naCall, jogando, onAgir }: {
  mesa: Mesa; euId: number; altura: number; ocupado: boolean;
  membros: Membro[]; naCall: Set<number>; jogando: Set<number>;
  onAgir: (a: AcaoNaMesa) => void;
}) {
  const lista = quemChamar(membros, {
    euId, naCall, jogando, convidado: mesa.convidado?.id ?? null, recusou: mesa.recusou?.id ?? null,
  });

  const linha = (c: Chamavel) => (
    <div key={c.membro.id} className={`xadrez-chamavel ${c.situacao === 'jogando' ? 'apagada' : ''}`}>
      <Avatar nome={c.membro.nome} foto={c.membro.foto} enquadramento={c.membro.enquadramento?.foto} />
      <span className="xadrez-chamavel-nome">{c.membro.nome}</span>
      {c.situacao === 'chamado' ? (
        <span className="xadrez-chamado">
          chamado…
          <button type="button" className="link" disabled={ocupado} onClick={() => onAgir({ acao: 'cancelarConvite' })}>cancelar</button>
        </span>
      ) : c.situacao === 'jogando' ? (
        <span className="xadrez-jogando">jogando</span>
      ) : (
        <span className="xadrez-chamado">
          {c.situacao === 'recusou' && <span>recusou</span>}
          <button type="button" className="botao-de-linha" disabled={ocupado}
            onClick={() => onAgir({ acao: 'chamar', alvo: c.membro.id })}>
            {c.situacao === 'recusou' ? 'De novo' : 'Chamar'}
          </button>
        </span>
      )}
    </div>
  );

  return (
    <div className="xadrez-lateral xadrez-lobby" style={{ height: altura }}>
      <div className="xadrez-cabecalho">Mesa de xadrez</div>
      <div className="xadrez-escolha">
        <span className="xadrez-rotulo">Tempo para cada um</span>
        <div className="xadrez-chips">
          {TEMPOS.map((t) => (
            <button key={t.rotulo} type="button" className={`xadrez-escolher ${mesa.tempo === t.valor ? 'escolhido' : ''}`}
              disabled={ocupado} onClick={() => mesa.tempo !== t.valor && onAgir({ acao: 'configurar', tempo: t.valor })}>
              {t.rotulo}
            </button>
          ))}
        </div>
      </div>
      <div className="xadrez-escolha">
        <span className="xadrez-rotulo">Suas peças</span>
        <div className="xadrez-chips">
          {(['brancas', 'sorteio', 'pretas'] as CorEscolhida[]).map((c) => (
            <button key={c} type="button" className={`xadrez-escolher ${mesa.cor === c ? 'escolhido' : ''}`}
              disabled={ocupado} onClick={() => mesa.cor !== c && onAgir({ acao: 'configurar', cor: c })}>
              {ROTULO_DA_COR[c]}
            </button>
          ))}
        </div>
      </div>
      <div className="xadrez-risco" />
      <div className="xadrez-cabecalho">Chamar para jogar</div>
      <div className="xadrez-chamaveis">
        {lista.naCall.length > 0 && <span className="xadrez-grupo">Na call</span>}
        {lista.naCall.map(linha)}
        {lista.online.length > 0 && <span className="xadrez-grupo">Online no servidor</span>}
        {lista.online.map(linha)}
        {lista.naCall.length === 0 && lista.online.length === 0 && (
          <span className="muted small">Ninguém online para chamar agora.</span>
        )}
      </div>
      <button type="button" className="secundario" disabled={ocupado} onClick={() => onAgir({ acao: 'fechar' })}>
        Fechar mesa
      </button>
    </div>
  );
}

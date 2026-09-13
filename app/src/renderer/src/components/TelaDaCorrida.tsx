import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Room, RoomEvent, type RemoteParticipant } from 'livekit-client';
import {
  agirNoGrid, pedirTokenDaCorrida, verGrid, type AcaoNoGrid, type Grid, type Membro, type PessoaDaMesa,
} from '../api';
import type { Aviso } from '../avisos';
import { bandeiraDaVez, type Bandeira, type TipoDeBandeira } from '../bandeiras';
import {
  ATRASO_DE_DESENHO, EQUIPES, FISICA, PARADO, TOPICO, carroNoGrid, classificar, codificar, decodificar, dadosDoCarro,
  equipeDoCarro, formatarDiferenca, formatarTempo, guardarFoto, interpolar, kmh, luzesAcesas, passo,
  type Carro, type CodigoDoCarro, type Comandos, type Posicao,
} from '../corrida';
import { criarCronometro, escreverIntervalo, intervalo, registrar, type Cronometro } from '../cronometro';
import { quemChamar } from '../jogos';
import { criarMotor } from '../motor';
import {
  IDS_DAS_PISTAS, PISTAS, chaoEm, contorno, definicao, localizar, miniatura, pistaPronta, type Chao, type IdDaPista,
  type Pista,
} from '../pista';
import { contaDaIdentidade } from '../pessoas';
import { anotar } from '../registro';
import { Avatar } from './Avatar';
import {
  CarroDesenho, Ladrilhos, desenharBandeirada, desenharBandeiraNoPosto, desenharCarro, desenharEtiqueta,
  desenharLuzDaNoite, desenharPortico,
} from './DesenhoDaCorrida';
import { Icon } from './Icon';

/** De quanto em quanto a tela pergunta pelo grid. A corrida em si não passa por aqui. */
const INTERVALO_NO_GRID = 1000;
const INTERVALO_CORRENDO = 1500;
/** Posições por segundo que cada piloto manda. */
const ENVIOS_POR_SEGUNDO = 20;
/** Carro dos outros sem foto nova há isto some da pista: fechou o app, ou a rede caiu. */
const SEM_NOTICIA = 3000;
/**
 * Pixels por unidade do mundo: o carro de 36 fica com uns 31 px. Fixo — a câmera não gira nem
 * aproxima —, e é isso que deixa o mundo pronto em ladrilhos servir a corrida inteira.
 */
const ZOOM = 0.85;
/** O placar por cima da pista é redesenhado assim, e não a cada quadro: o React não precisa de 60. */
const PLACAR_POR_SEGUNDO = 8;

/**
 * O carro de quem saiu da tela no meio da corrida — foi ler o chat, por exemplo. Voltando, ele
 * continua de onde parou, em vez de renascer no grid. Por grid e por largada.
 */
const carrosGuardados = new Map<string, Carro>();

type Tocar = (qual: Aviso) => void;
const idDaPista = (grid: Grid): IdDaPista => definicao(grid.pista ?? 'interlagos').id;

/**
 * A corrida do grid, na tela dele: o grid de largada, a pista e o fim, conforme o que o
 * servidor diz. Como a partida de xadrez, é a mesma tela do começo ao fim.
 */
export function TelaDaCorrida({ gridId, servidorId, euId, membros, naCall, surdo, tocar, live, onFechar, onAviso }: {
  gridId: number;
  servidorId: number;
  euId: number;
  membros: Membro[];
  naCall: Set<number>;
  /** Fone desligado: nem motor, nem batida. */
  surdo: boolean;
  tocar: Tocar;
  live?: ReactNode;
  onFechar: () => void;
  onAviso: (tipo: 'erro' | 'info', texto: string) => void;
}) {
  const [grid, setGrid] = useState<Grid | null>(null);
  const [falhou, setFalhou] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;
  const avisarRef = useRef(onAviso);
  avisarRef.current = onAviso;
  const saindo = useRef(false);
  /**
   * A diferença entre o relógio do servidor e o desta máquina. A resposta chega sempre DEPOIS
   * de o servidor escrever `agora`, então `agora - Date.now()` só erra para menos: a maior
   * diferença vista é a mais perto da verdade.
   */
  const diferenca = useRef<number | null>(null);

  const receber = useCallback((g: Grid | null) => {
    if (!g) { fecharRef.current(); return; }
    const d = g.agora - Date.now();
    diferenca.current = diferenca.current === null ? d : Math.max(diferenca.current, d);
    setGrid(g);
    setFalhou(null);
  }, []);

  const intervaloDaBusca = grid?.estado === 'correndo' ? INTERVALO_CORRENDO : INTERVALO_NO_GRID;
  useEffect(() => {
    let vivo = true;
    const buscar = async () => {
      try {
        const g = await verGrid(gridId, servidorId);
        if (vivo) receber(g);
      } catch (e) {
        if (!vivo) return;
        const status = (e as { status?: number }).status;
        if (status === 404) {
          if (!saindo.current) avisarRef.current('info', 'O grid foi fechado.');
          fecharRef.current();
          return;
        }
        setFalhou((e as Error).message);
      }
    };
    buscar();
    const id = setInterval(buscar, intervaloDaBusca);
    return () => { vivo = false; clearInterval(id); };
  }, [gridId, servidorId, receber, intervaloDaBusca]);

  const agir = useCallback(async (a: AcaoNoGrid) => {
    if (a.acao === 'fechar') saindo.current = true;
    setOcupado(true);
    try {
      receber(await agirNoGrid(gridId, a, servidorId));
    } catch (e) {
      saindo.current = false;
      avisarRef.current('erro', (e as Error).message);
    } finally {
      setOcupado(false);
    }
  }, [gridId, servidorId, receber]);

  // Abandonar é perder a corrida: o primeiro clique arma, como o desistir do xadrez.
  const [armado, setArmado] = useState(false);
  useEffect(() => {
    if (!armado) return;
    const id = setTimeout(() => setArmado(false), 4000);
    return () => clearTimeout(id);
  }, [armado]);

  const def = grid ? definicao(idDaPista(grid)) : null;
  const titulo = !grid || !def ? null
    : grid.estado === 'grid' ? `grid de ${grid.anfitriao.nome}` : `${def.gp} · ${grid.voltas} voltas`;
  const souPiloto = !!grid?.meuCarro;
  const souPlateia = !!grid && grid.estado !== 'grid' && !grid.meuCarro;
  const abandonei = !!grid?.abandonos.includes(euId);
  const cheguei = !!grid?.chegadas.some((c) => c.pessoa.id === euId);

  return (
    <div className="tela-do-xadrez tela-da-corrida">
      <header className="stage-head">
        <Icon name="controle" />
        <span className="strong">Fórmula 1</span>
        {titulo && <span className="xadrez-titulo">{titulo}</span>}
        {souPlateia && <span className="selo-assistindo"><Icon name="olho" size={12} /> assistindo</span>}
        <span style={{ flex: 1 }} />
        {grid && grid.estado !== 'grid' && grid.plateia.length > 0 && (
          <span className="xadrez-plateia" title={`Assistindo: ${grid.plateia.map((p) => p.nome).join(', ')}`}>
            <Icon name="olho" size={13} />
            <span>{grid.plateia.length === 1 ? `${grid.plateia[0].nome} assistindo` : `${grid.plateia.length} assistindo`}</span>
          </span>
        )}
        {grid?.estado === 'correndo' && (
          souPiloto && !abandonei && !cheguei ? (
            armado ? (
              <button type="button" className="primary destrutivo sm" disabled={ocupado} autoFocus
                onClick={() => { setArmado(false); agir({ acao: 'abandonar' }); onFechar(); }}>
                Confirmar: abandonar
              </button>
            ) : (
              <button type="button" className="perigo sm" disabled={ocupado} onClick={() => setArmado(true)}>Abandonar</button>
            )
          ) : (
            <button type="button" className="secundario sm" onClick={onFechar}>{souPiloto ? 'Sair da pista' : 'Parar de assistir'}</button>
          )
        )}
      </header>
      {!grid ? (
        <div className="corrida-area">
          <div className="xadrez-carregando muted">
            {falhou ? `Não consegui abrir o grid (${falhou}). Tentando de novo…` : 'Abrindo o grid…'}
          </div>
        </div>
      ) : grid.estado === 'grid' ? (
        <div className="corrida-area">
          <GridDeLargada grid={grid} euId={euId} ocupado={ocupado} membros={membros} naCall={naCall}
            onAgir={agir} onSair={onFechar} />
        </div>
      ) : (
        <Corrida key={`${grid.id}-${grid.rodada}`} grid={grid} euId={euId} servidorId={servidorId}
          diferenca={diferenca} ocupado={ocupado} surdo={surdo} tocar={tocar} live={live}
          onAgir={agir} onSair={onFechar} />
      )}
    </div>
  );
}

// ---- o grid de largada -----------------------------------------------------------------

const FUNDO_DA_MINIATURA: Record<IdDaPista, string> = {
  interlagos: '#4c8a39', monza: '#2f6b2a', monaco: '#a9a293', spa: '#2f6b2a', bahrein: '#d9b98a', vegas: '#0e1119',
};

function GridDeLargada({ grid, euId, ocupado, membros, naCall, onAgir, onSair }: {
  grid: Grid; euId: number; ocupado: boolean; membros: Membro[]; naCall: Set<number>;
  onAgir: (a: AcaoNoGrid) => void;
  onSair: () => void;
}) {
  const sentados = grid.assentos.filter((a) => a.pessoa).length;
  const noGrid = new Set(grid.assentos.flatMap((a) => (a.pessoa ? [a.pessoa.id] : [])));
  const chamados = new Set(grid.chamados.map((p) => p.id));
  const lista = quemChamar(membros, { euId, naCall, jogando: noGrid, convidado: null, recusou: null });
  const pista = idDaPista(grid);
  const miniaturas = useMemo(() => Object.fromEntries(IDS_DAS_PISTAS.map((id) => [id, miniatura(id, 100, 44)])), []);

  const assento = (a: Grid['assentos'][number]) => {
    const d = dadosDoCarro(a.carro);
    const meu = a.pessoa?.id === euId;
    const livre = !a.pessoa;
    return (
      <button key={a.carro} type="button" className={`corrida-assento ${meu ? 'meu' : ''} ${livre ? 'livre' : ''}`}
        disabled={ocupado || !livre} onClick={() => onAgir({ acao: 'sentar', carro: a.carro })}
        title={livre ? `Sentar no carro de ${d.piloto}` : undefined}>
        <CarroDesenho carro={a.carro} largura={96} />
        <span className="corrida-assento-textos">
          <span className="corrida-piloto">
            <span className="corrida-piloto-nome">{d.piloto}</span>
            <span className="corrida-piloto-codigo">{a.carro}</span>
          </span>
          {a.pessoa ? (
            <span className="corrida-quem">
              <Avatar nome={a.pessoa.nome} foto={a.pessoa.foto} />
              <span className="corrida-quem-nome">{a.pessoa.nome}</span>
              {meu && <span className="muted">· você</span>}
            </span>
          ) : (
            <span className="corrida-quem vazio">
              <span className="corrida-lugar-vazio" />
              <span>livre</span>
              <span className="spacer" />
              <span className="botao-de-linha">Sentar</span>
            </span>
          )}
        </span>
      </button>
    );
  };

  const linha = (m: Membro) => {
    const situacao = noGrid.has(m.id) ? 'noGrid' : chamados.has(m.id) ? 'chamado' : grid.recusaram.includes(m.id) ? 'recusou' : 'livre';
    return (
      <div key={m.id} className={`xadrez-chamavel ${situacao === 'noGrid' ? 'apagada' : ''}`}>
        <Avatar nome={m.nome} foto={m.foto} enquadramento={m.enquadramento?.foto} />
        <span className="xadrez-chamavel-nome">{m.nome}</span>
        {situacao === 'noGrid' ? (
          <span className="xadrez-jogando">no grid</span>
        ) : situacao === 'chamado' ? (
          <span className="xadrez-chamado">
            chamado…
            <button type="button" className="link" disabled={ocupado} onClick={() => onAgir({ acao: 'cancelarConvite', alvo: m.id })}>cancelar</button>
          </span>
        ) : (
          <span className="xadrez-chamado">
            {situacao === 'recusou' && <span>recusou</span>}
            <button type="button" className="botao-de-linha" disabled={ocupado} onClick={() => onAgir({ acao: 'chamar', alvo: m.id })}>
              {situacao === 'recusou' ? 'De novo' : 'Chamar'}
            </button>
          </span>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="corrida-equipes">
        {(Object.keys(EQUIPES) as (keyof typeof EQUIPES)[]).map((eq) => (
          <div key={eq} className="corrida-equipe">
            <span className="corrida-equipe-nome">
              <span className="corrida-equipe-cor" style={{ background: EQUIPES[eq].cor }} />
              {EQUIPES[eq].nome}
            </span>
            <div className="corrida-equipe-carros">
              {grid.assentos.filter((a) => dadosDoCarro(a.carro).equipe === eq).map(assento)}
            </div>
          </div>
        ))}
      </div>
      <div className="xadrez-lateral xadrez-lobby corrida-lateral">
        <div className="xadrez-cabecalho">Grande Prêmio</div>
        <div className="xadrez-escolha">
          <span className="xadrez-rotulo">Pista</span>
          {/* Servidor antigo não conhece pista: a escolha fica só na tela e ele corre em Interlagos. */}
          <div className="corrida-pistas">
            {IDS_DAS_PISTAS.map((id) => (
              <button key={id} type="button" className={`corrida-pista-opcao ${pista === id ? 'escolhida' : ''}`}
                disabled={ocupado || !grid.souAnfitriao || grid.pista === undefined}
                title={`${PISTAS[id].nome} · ${PISTAS[id].pais} · ${PISTAS[id].km} de verdade`}
                onClick={() => pista !== id && onAgir({ acao: 'configurar', pista: id })}>
                <span className="corrida-pista-miniatura" style={{ background: FUNDO_DA_MINIATURA[id] }}>
                  <svg width="100" height="44" viewBox="0 0 100 44" aria-hidden="true">
                    <path d={miniaturas[id]} fill="none" stroke={id === 'monaco' || id === 'bahrein' ? '#3b3e42' : '#eef0f2'} strokeWidth="2.2" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="corrida-pista-nome">{id === 'spa' ? 'Spa' : PISTAS[id].nome}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="xadrez-escolha">
          <span className="xadrez-rotulo">Voltas</span>
          <div className="xadrez-chips">
            {[3, 5, 10].map((v) => (
              <button key={v} type="button" className={`xadrez-escolher ${grid.voltas === v ? 'escolhido' : ''}`}
                disabled={ocupado || !grid.souAnfitriao} onClick={() => grid.voltas !== v && onAgir({ acao: 'configurar', voltas: v })}>
                {v}
              </button>
            ))}
          </div>
        </div>
        {grid.souAnfitriao ? (
          <>
            <div className="xadrez-risco" />
            <div className="xadrez-cabecalho">Chamar para correr</div>
            <div className="xadrez-chamaveis">
              {lista.naCall.length > 0 && <span className="xadrez-grupo">Na call</span>}
              {lista.naCall.map((c) => linha(c.membro))}
              {lista.online.length > 0 && <span className="xadrez-grupo">Online no servidor</span>}
              {lista.online.map((c) => linha(c.membro))}
              {lista.naCall.length === 0 && lista.online.length === 0 && (
                <span className="muted small">Ninguém online para chamar agora.</span>
              )}
            </div>
          </>
        ) : (
          <span className="muted small corrida-espera">
            {grid.meuCarro ? `Esperando ${grid.anfitriao.nome} largar.` : 'Escolha um carro livre para correr.'}
          </span>
        )}
        <span className="corrida-contagem">{sentados} de 8 no grid</span>
        <div className="xadrez-botoes">
          {grid.souAnfitriao && (
            <button type="button" className="primary" disabled={ocupado || sentados === 0} onClick={() => onAgir({ acao: 'largar' })}>
              Largar
            </button>
          )}
          {grid.souAnfitriao ? (
            <button type="button" className="secundario" disabled={ocupado} onClick={() => onAgir({ acao: 'fechar' })}>Fechar grid</button>
          ) : grid.meuCarro ? (
            <button type="button" className="secundario" disabled={ocupado}
              onClick={() => { onAgir({ acao: 'levantar' }); onSair(); }}>
              Sair do grid
            </button>
          ) : (
            <button type="button" className="secundario" onClick={onSair}>Fechar</button>
          )}
        </div>
      </div>
    </>
  );
}

// ---- a corrida -------------------------------------------------------------------------

type Remoto = { fotos: Posicao[]; recebidaEm: number; indice: number | null };
type Linha = {
  id: number; carro: CodigoDoCarro; pessoa: PessoaDaMesa; progresso: number; volta: number; velocidade: number;
  chegouEm: number | null; punicao: number; abandonou: boolean; voce: boolean;
};
type Placar = {
  tempo: number;
  linhas: Linha[];
  diferencas: Map<number, string>;
  velocidade: number;
  voltaDoCarro: number;
  tempoDaVolta: number | null;
  setores: ('melhor' | 'pior' | 'andando' | 'falta')[];
  melhorVolta: number | null;
  pontos: { id: number; x: number; y: number; cor: string; destaque: boolean }[];
  bandeira: Bandeira | null;
  seguido: number | null;
};
type Poeira = { x: number; y: number; vx: number; vy: number; vida: number; cor: string };
type Rastro = { pts: [number, number, number][]; cor: string };

const TECLAS: Record<string, keyof Comandos> = {
  ArrowUp: 'acelera', KeyW: 'acelera', ArrowDown: 'freia', KeyS: 'freia',
  ArrowLeft: 'esquerda', KeyA: 'esquerda', ArrowRight: 'direita', KeyD: 'direita',
};

const COR_DA_POEIRA: Partial<Record<Chao, string>> = { brita: '222,200,150', grama: '120,150,70' };

function Corrida({ grid, euId, servidorId, diferenca, ocupado, surdo, tocar, live, onAgir, onSair }: {
  grid: Grid; euId: number; servidorId: number;
  diferenca: MutableRefObject<number | null>;
  ocupado: boolean; surdo: boolean; tocar: Tocar; live?: ReactNode;
  onAgir: (a: AcaoNoGrid) => void;
  onSair: () => void;
}) {
  // A pista é montada uma vez por largada; é uma fração de segundo, e a contagem tem sete.
  const pista = useMemo(() => pistaPronta(idDaPista(grid)), [grid.pista]); // eslint-disable-line react-hooks/exhaustive-deps
  const souPiloto = grid.meuCarro !== null;
  const chave = `${grid.id}-${grid.rodada}`;
  // Tudo que o laço de quadros lê mora em referência: o laço nasce uma vez, e o grid muda a
  // cada busca.
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const surdoRef = useRef(surdo);
  surdoRef.current = surdo;
  const tocarRef = useRef(tocar);
  tocarRef.current = tocar;
  const agirRef = useRef(onAgir);
  agirRef.current = onAgir;

  const carro = useRef<Carro | null>(null);
  if (carro.current === null && grid.meuCarro) {
    const lugar = Math.max(0, grid.ordem.indexOf(grid.meuCarro));
    carro.current = carrosGuardados.get(chave) ?? carroNoGrid(pista, lugar);
  }
  const comandos = useRef<Comandos>({ ...PARADO });
  const remotos = useRef(new Map<number, Remoto>());
  const cronometro = useRef<Cronometro>(criarCronometro());
  const corteEm = useRef<number | null>(null);
  const sala = useRef<Room | null>(null);
  /** Quem a câmera segue quando você assiste: o líder, até alguém clicar noutro na torre. */
  const [seguidoManual, setSeguidoManual] = useState<number | null>(null);
  const seguidoManualRef = useRef(seguidoManual);
  seguidoManualRef.current = seguidoManual;

  // ---- a sala da corrida no LiveKit
  const [semSala, setSemSala] = useState(false);
  useEffect(() => {
    const room = new Room({ adaptiveStream: false, dynacast: false });
    sala.current = room;
    let vivo = true;
    const decodificador = new TextDecoder();
    room.on(RoomEvent.DataReceived, (dados: Uint8Array, participante?: RemoteParticipant, _tipo?: unknown, topico?: string) => {
      if (topico !== TOPICO || !participante) return;
      const id = contaDaIdentidade(participante.identity);
      // Só quem está sentado corre: dado de mais alguém é descartado.
      if (id === null || id === euId || !gridRef.current.assentos.some((a) => a.pessoa?.id === id)) return;
      const foto = decodificar(decodificador.decode(dados));
      if (!foto) return;
      const atual = remotos.current.get(id);
      remotos.current.set(id, { fotos: guardarFoto(atual?.fotos ?? [], foto), recebidaEm: Date.now(), indice: atual?.indice ?? null });
      registrar(cronometro.current, id, foto.p, foto.t);
    });
    (async () => {
      try {
        const { url, token } = await pedirTokenDaCorrida(grid.id, servidorId);
        if (!vivo) return;
        await room.connect(url, token, { autoSubscribe: false });
        if (!vivo) void room.disconnect();
      } catch (e) {
        anotar('erro', 'corrida', `não entrei na sala da corrida: ${(e as Error).message}`);
        if (vivo) setSemSala(true);
      }
    })();
    return () => {
      vivo = false;
      sala.current = null;
      void room.disconnect();
    };
    // A sala é da largada: outra largada é outro componente (a `key`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- o teclado: só de quem pilota
  useEffect(() => {
    if (!souPiloto) return;
    const mudar = (e: KeyboardEvent, apertada: boolean) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return;
      const comando = TECLAS[e.code];
      if (!comando) return;
      // As setas rolariam a página por baixo da pista.
      e.preventDefault();
      comandos.current = { ...comandos.current, [comando]: apertada };
    };
    const desce = (e: KeyboardEvent) => mudar(e, true);
    const sobe = (e: KeyboardEvent) => mudar(e, false);
    // Perder o foco com uma tecla apertada deixaria o carro acelerando sozinho para sempre.
    const soltarTudo = () => { comandos.current = { ...PARADO }; };
    window.addEventListener('keydown', desce);
    window.addEventListener('keyup', sobe);
    window.addEventListener('blur', soltarTudo);
    return () => {
      window.removeEventListener('keydown', desce);
      window.removeEventListener('keyup', sobe);
      window.removeEventListener('blur', soltarTudo);
    };
  }, [souPiloto]);

  // ---- o quadro
  const caixa = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const medida = useRef({ w: 0, h: 0, dpr: 1 });
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => {
      const { width, height } = el.getBoundingClientRect();
      const w = Math.max(200, Math.floor(width)), h = Math.max(160, Math.floor(height));
      const dpr = window.devicePixelRatio || 1;
      const c = canvas.current!;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      medida.current = { w, h, dpr };
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ---- o laço: física, envio, sons e desenho
  const [placar, setPlacar] = useState<Placar | null>(null);
  useEffect(() => {
    const motor = souPiloto ? criarMotor() : null;
    const codificador = new TextEncoder();
    let ladrilhos: Ladrilhos | null = null;
    let ultimoQuadro = performance.now();
    let acumulado = 0;
    let ultimoEnvio = 0;
    let ultimoPlacar = 0;
    let luzesAntes: number | null = -1;
    let chegadaMandada = carro.current?.chegouEm != null;
    let pedido = 0;
    const camera = { x: NaN, y: NaN };
    const poeira: Poeira[] = [];
    const rastros: Rastro[] = [];
    let rastroAtual: Rastro | null = null;
    const mapaDoPlacar = contorno(pista, 176, 150);
    // Onde cada lugar do grid começa: buscar isso na pista inteira a cada quadro seria à toa.
    const noGrid = Array.from({ length: 8 }, (_, lugar) => carroNoGrid(pista, lugar));

    const tempoDeCorrida = () => {
      const g = gridRef.current;
      return Date.now() + (diferenca.current ?? 0) - (g.largadaEm ?? Date.now());
    };

    const soltarPoeira = (x: number, y: number, a: number, v: number, chao: Chao) => {
      const cor = COR_DA_POEIRA[chao];
      if (!cor || Math.abs(v) < 70 || poeira.length > 140) return;
      poeira.push({
        x: x - Math.cos(a) * 16 + (Math.random() - 0.5) * 12, y: y - Math.sin(a) * 16 + (Math.random() - 0.5) * 12,
        vx: -Math.cos(a) * 30 + (Math.random() - 0.5) * 40, vy: -Math.sin(a) * 30 + (Math.random() - 0.5) * 40, vida: 1, cor,
      });
    };

    const frame = () => {
      pedido = requestAnimationFrame(frame);
      const g = gridRef.current;
      const agoraPerf = performance.now();
      const dt = Math.min(0.1, (agoraPerf - ultimoQuadro) / 1000);
      ultimoQuadro = agoraPerf;
      const tempo = tempoDeCorrida();

      // As luzes. Os sons saem da CONTA do tempo, não de um relógio por luz: quem abriu a tela
      // no meio da contagem ouve só as que faltam.
      const luzes = g.estado === 'correndo' ? luzesAcesas(tempo) : null;
      if (luzesAntes !== -1 && luzes !== luzesAntes) {
        if (luzes !== null && luzes > 0 && luzesAntes !== null && luzes > luzesAntes) tocarRef.current('luz');
        if (luzes === null && luzesAntes !== null && tempo < 1500) tocarRef.current('largada');
      }
      luzesAntes = luzes;

      // Os outros, onde disseram estar um instante atrás.
      const outros: { id: number; carro: CodigoDoCarro; x: number; y: number; a: number; foto: Posicao; chao: Chao; distancia: number }[] = [];
      for (const [id, r] of remotos.current) {
        if (Date.now() - r.recebidaEm > SEM_NOTICIA) continue;
        const assento = g.assentos.find((a) => a.pessoa?.id === id);
        const p = interpolar(r.fotos, tempo - ATRASO_DE_DESENHO);
        if (!assento || !p || g.abandonos.includes(id)) continue;
        const local = localizar(pista, p.x, p.y, r.indice);
        r.indice = local.indice;
        outros.push({ id, carro: assento.carro, x: p.x, y: p.y, a: p.a, foto: r.fotos[r.fotos.length - 1], chao: chaoEm(pista, local), distancia: local.distancia });
      }

      // O meu carro.
      const eu = carro.current;
      const pilotando = !!eu && g.estado === 'correndo' && !g.abandonos.includes(euId);
      if (eu && pilotando && tempo >= 0) {
        acumulado += dt;
        let c = eu;
        while (acumulado >= 1 / 120) {
          acumulado -= 1 / 120;
          const r = passo(pista, c, comandos.current, 1 / 120, tempo, outros, g.voltas);
          c = r.carro;
          if (r.batida && r.batida.forca > 35 && !surdoRef.current) tocarRef.current('batida');
          if (r.cortou) corteEm.current = tempo;
        }
        carro.current = c;
        carrosGuardados.set(chave, c);
        registrar(cronometro.current, euId, c.progresso, tempo);
        if (c.chegouEm !== null && !chegadaMandada) {
          chegadaMandada = true;
          // Venceu quem chegou antes de todo mundo que já chegou — pelo que o servidor sabe e
          // pelo que os carros dos outros disseram.
          const antes = g.chegadas.length > 0 || outros.some((o) => o.foto.c !== null && o.foto.c < c.chegouEm!);
          if (!surdoRef.current) tocarRef.current(antes ? 'fimDaPartida' : 'vitoria');
          agirRef.current({ acao: 'chegada', tempo: Math.round(c.chegouEm), melhorVolta: c.melhorVolta, punicao: c.punicao });
        }
        // rastro de pneu na freada forte e fora da pista
        const marca = (comandos.current.freia && c.velocidade > 260 && c.chao === 'asfalto') || ((c.chao === 'grama' || c.chao === 'brita') && Math.abs(c.velocidade) > 60);
        if (marca) {
          const cor = c.chao === 'asfalto' ? 'rgba(15,15,18,.32)' : 'rgba(70,55,30,.35)';
          if (!rastroAtual || rastroAtual.cor !== cor) { rastroAtual = { pts: [], cor }; rastros.push(rastroAtual); if (rastros.length > 40) rastros.shift(); }
          const u = rastroAtual.pts[rastroAtual.pts.length - 1];
          if (!u || Math.hypot(c.x - u[0], c.y - u[1]) > 12) rastroAtual.pts.push([c.x, c.y, c.angulo]);
        } else rastroAtual = null;
        soltarPoeira(c.x, c.y, c.angulo, c.velocidade, c.chao);
      }
      for (const o of outros) soltarPoeira(o.x, o.y, o.a, o.foto.v, o.chao);
      if (motor && eu) {
        motor.atualizar(eu.velocidade, FISICA.maxima, comandos.current.acelera && tempo >= 0,
          pilotando && !surdoRef.current && (eu.chegouEm === null || Math.abs(eu.velocidade) > 5));
      }

      // Manda a posição.
      const room = sala.current;
      if (eu && pilotando && room?.state === 'connected' && agoraPerf - ultimoEnvio >= 1000 / ENVIOS_POR_SEGUNDO) {
        ultimoEnvio = agoraPerf;
        const bytes = codificador.encode(JSON.stringify(codificar(eu, Math.max(tempo, 0))));
        room.localParticipant.publishData(bytes, { reliable: false, topic: TOPICO }).catch(() => undefined);
      }

      // A classificação e quem a câmera segue.
      const linhas = montarLinhas(g, noGrid, euId, eu, remotos.current);
      const seguidoId = souPiloto && eu ? euId
        : seguidoManualRef.current !== null && linhas.some((l) => l.id === seguidoManualRef.current) ? seguidoManualRef.current
        : linhas[0]?.id ?? null;
      const alvo = seguidoId === euId && eu ? { x: eu.x, y: eu.y, a: eu.angulo, v: eu.velocidade }
        : (() => { const o = outros.find((q) => q.id === seguidoId); return o ? { x: o.x, y: o.y, a: o.a, v: o.foto.v } : null; })();

      // Desenha.
      const ctx = canvas.current?.getContext('2d');
      const { w, h, dpr } = medida.current;
      if (ctx && w > 0) {
        const escala = ZOOM * dpr;
        if (!ladrilhos || ladrilhos.escala !== escala) ladrilhos = new Ladrilhos(pista, escala);
        // A câmera vai um pouco à frente do carro, para ver a curva chegando, e anda macia.
        const inicio = noGrid[0];
        const ax = alvo ? alvo.x + Math.cos(alvo.a) * Math.min(170, Math.abs(alvo.v) * 0.35) : inicio.x;
        const ay = alvo ? alvo.y + Math.sin(alvo.a) * Math.min(170, Math.abs(alvo.v) * 0.35) : inicio.y;
        if (Number.isNaN(camera.x)) { camera.x = ax; camera.y = ay; }
        const k = 1 - Math.exp(-dt * 5);
        camera.x += (ax - camera.x) * k;
        camera.y += (ay - camera.y) * k;
        const wx0 = camera.x - w / 2 / ZOOM, wy0 = camera.y - h / 2 / ZOOM;
        const vista = { x0: wx0, y0: wy0, x1: wx0 + w / ZOOM, y1: wy0 + h / ZOOM };
        const offX = Math.round(wx0 * escala), offY = Math.round(wy0 * escala);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        // Antes da largada, com todo mundo parado, sobra quadro para fazer mais ladrilhos.
        ladrilhos.desenhar(ctx, vista, offX, offY, tempo < 0 ? 4 : 2);
        ctx.setTransform(escala, 0, 0, escala, -offX, -offY);

        for (const r of rastros) {
          if (r.pts.length < 2) continue;
          ctx.strokeStyle = r.cor; ctx.lineWidth = 3; ctx.lineCap = 'round';
          for (const lado of [-7.5, 7.5]) {
            ctx.beginPath();
            r.pts.forEach(([x, y, a], i) => { const px = x - Math.sin(a) * lado, py = y + Math.cos(a) * lado; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
            ctx.stroke();
          }
        }
        for (let i = poeira.length - 1; i >= 0; i--) {
          const q = poeira[i];
          q.vida -= dt * 1.3;
          if (q.vida <= 0) { poeira.splice(i, 1); continue; }
          q.x += q.vx * dt; q.y += q.vy * dt;
          ctx.fillStyle = `rgba(${q.cor},${(0.32 * q.vida).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(q.x, q.y, 6 + (1 - q.vida) * 16, 0, Math.PI * 2); ctx.fill();
        }

        desenharPortico(ctx, pista, luzes);
        // A amarela na mão dos fiscais perto de quem está parado; a quadriculada na linha
        // desde que o primeiro chegou.
        if (tempo > 5000) {
          const parados = outros.filter((o) => Math.abs(o.foto.v) < 50 && o.foto.c === null).map((o) => o.distancia);
          for (const po of pista.postos) {
            if (parados.some((d) => Math.abs(((po.d - d + pista.volta * 1.5) % pista.volta) - pista.volta / 2) < 700)) {
              desenharBandeiraNoPosto(ctx, po, '#ffd400', agoraPerf);
            }
          }
        }
        if (g.chegadas.length > 0 || outros.some((o) => o.foto.c !== null) || eu?.chegouEm != null) desenharBandeirada(ctx, pista, agoraPerf);

        const noite = pista.tema === 'noite';
        for (const o of outros) desenharCarro(ctx, equipeDoCarro(o.carro), o.x, o.y, o.a, noite);
        if (eu && g.meuCarro && !g.abandonos.includes(euId)) desenharCarro(ctx, equipeDoCarro(g.meuCarro), eu.x, eu.y, eu.angulo, noite);
        desenharLuzDaNoite(ctx, pista, vista);

        // O nome de cada um em cima do carro, sempre em pé.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (const o of outros) {
          const pessoa = g.assentos.find((a) => a.carro === o.carro)?.pessoa;
          if (!pessoa) continue;
          desenharEtiqueta(ctx, pessoa.nome, equipeDoCarro(o.carro).cor, (o.x * escala - offX) / dpr, (o.y * escala - offY) / dpr);
        }
      }

      // O placar, algumas vezes por segundo: redesenhar o React a cada quadro não diz nada a mais.
      if (agoraPerf - ultimoPlacar > 1000 / PLACAR_POR_SEGUNDO) {
        ultimoPlacar = agoraPerf;
        setPlacar(montarPlacar({ g, pista, mapa: mapaDoPlacar, euId, eu, tempo, linhas, cron: cronometro.current, seguidoId, corteEm: corteEm.current, outros }));
      }
    };
    pedido = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(pedido);
      motor?.parar();
    };
    // O laço nasce uma vez por largada: o que muda chega pelas referências.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mapa = useMemo(() => contorno(pista, 176, 150), [pista]);
  const tempo = placar?.tempo ?? -99999;
  const luzes = grid.estado === 'correndo' ? luzesAcesas(tempo) : null;
  const minhaChegada = grid.chegadas.findIndex((c) => c.pessoa.id === euId);

  return (
    <div className="corrida-quadro" ref={caixa}>
      <canvas ref={canvas} />
      {placar && (
        <>
          <div className="corrida-painel corrida-torre">
            <div className="corrida-torre-titulo">
              {grid.estado === 'fim' ? 'Bandeirada' : `Volta ${Math.min(grid.voltas, Math.max(1, placar.voltaDoCarro))} de ${grid.voltas}`}
            </div>
            {placar.linhas.map((l, i) => {
              const conteudo = (
                <>
                  <span className="corrida-torre-pos">{i + 1}</span>
                  <span className="corrida-torre-cor" style={{ background: equipeDoCarro(l.carro).cor }} />
                  <span className="corrida-torre-nome">{l.pessoa.nome}</span>
                  {l.punicao > 0 && <span className="corrida-torre-punicao">+{Math.round(l.punicao / 1000)} s</span>}
                  <span className="corrida-torre-dif">{placar.diferencas.get(l.id) ?? ''}</span>
                </>
              );
              const classe = `corrida-torre-linha ${l.voce ? 'voce' : ''} ${!souPiloto && placar.seguido === l.id ? 'seguido' : ''} ${l.abandonou ? 'fora' : ''}`;
              return souPiloto ? (
                <div key={l.id} className={classe}>{conteudo}</div>
              ) : (
                <button key={l.id} type="button" className={classe} title={`Seguir ${l.pessoa.nome}`}
                  onClick={() => setSeguidoManual(l.id)}>{conteudo}</button>
              );
            })}
          </div>
          {souPiloto && (
            <div className="corrida-painel corrida-tempos">
              <div className="corrida-tempos-linha">
                <span className="corrida-rotulo">Volta</span>
                <span className="corrida-tempo-grande">{placar.tempoDaVolta === null ? '—' : formatarTempo(placar.tempoDaVolta)}</span>
              </div>
              <div className="corrida-setores">
                {placar.setores.map((s, i) => <span key={i} className={`corrida-setor ${s}`} />)}
              </div>
              <div className="corrida-tempos-linha">
                <span className="muted small">Sua melhor</span>
                <span className="corrida-tempo-pequeno">{placar.melhorVolta === null ? '—' : formatarTempo(placar.melhorVolta)}</span>
              </div>
            </div>
          )}
          <div className="corrida-painel corrida-velocidade">
            <div className="corrida-velocidade-numero">
              <span>{kmh(placar.velocidade)}</span><small>km/h</small>
            </div>
            <div className="corrida-velocidade-barra"><span style={{ width: `${Math.min(100, (Math.abs(placar.velocidade) / FISICA.maxima) * 100)}%` }} /></div>
          </div>
          <div className="corrida-painel corrida-mapinha">
            <svg width="176" height="150" viewBox="0 0 176 150" aria-hidden="true">
              <path d={mapa.d} fill="none" stroke="#14161b" strokeWidth="6" strokeLinejoin="round" />
              <path d={mapa.d} fill="none" stroke="#8b93a3" strokeWidth="3" strokeLinejoin="round" />
              <line x1={mapa.linha[0]} y1={mapa.linha[1]} x2={mapa.linha[2]} y2={mapa.linha[3]} stroke="#fff" strokeWidth="2" />
              {placar.pontos.filter((p) => !p.destaque).map((p) => <circle key={p.id} cx={p.x} cy={p.y} r="3.4" fill={p.cor} stroke="#14161b" strokeWidth="1.2" />)}
              {placar.pontos.filter((p) => p.destaque).map((p) => (
                <g key={p.id}>
                  <circle cx={p.x} cy={p.y} r="8" fill="rgba(107,163,245,.35)" />
                  <circle cx={p.x} cy={p.y} r="4.6" fill={p.cor} stroke="#fff" strokeWidth="1.8" />
                </g>
              ))}
            </svg>
          </div>
          {placar.bandeira && grid.estado === 'correndo' && (
            <FaixaDeBandeira bandeira={placar.bandeira.tipo === 'quadriculada' && minhaChegada >= 0
              ? { ...placar.bandeira, texto: `Você chegou em ${minhaChegada + 1}º${(grid.chegadas[minhaChegada].punicao ?? 0) > 0 ? ` · com +${Math.round(grid.chegadas[minhaChegada].punicao! / 1000)} s` : ''} · esperando os outros` }
              : placar.bandeira} />
          )}
        </>
      )}
      {live && <div className="corrida-live">{live}</div>}
      {grid.estado === 'correndo' && luzes !== null && (
        <div className="corrida-camada">
          <div className="corrida-cartao corrida-largada">
            <div className="corrida-luzes">
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className="corrida-luz">
                  <span />
                  <span className={n <= luzes ? 'acesa' : ''} />
                </span>
              ))}
            </div>
            <span className="corrida-cartao-titulo">{souPiloto ? 'Prepare-se…' : 'A corrida vai largar'}</span>
            {souPiloto && (
              <>
                <div className="corrida-teclas">
                  <span><kbd>↑</kbd> acelera</span>
                  <span><kbd>↓</kbd> freia</span>
                  <span><kbd>←</kbd><kbd>→</kbd> vira</span>
                </div>
                <span className="small corrida-apagado">WASD também funciona · cortar caminho soma 3 s</span>
              </>
            )}
          </div>
        </div>
      )}
      {semSala && grid.estado === 'correndo' && (
        <div className="corrida-aviso-de-chegada erro">Não consegui ligar a pista aos outros carros — só o seu aparece.</div>
      )}
      {grid.estado === 'fim' && (
        <FimDaCorrida grid={grid} euId={euId} ocupado={ocupado} onAgir={onAgir} onSair={onSair} />
      )}
    </div>
  );
}

function FaixaDeBandeira({ bandeira }: { bandeira: Bandeira }) {
  return (
    <div className={`corrida-painel corrida-faixa ${bandeira.tipo}`} role="status">
      <BandeiraDesenho tipo={bandeira.tipo} />
      <span className="corrida-faixa-textos">
        <span className="corrida-faixa-titulo">{bandeira.titulo}</span>
        <span className="corrida-faixa-texto">{bandeira.texto}</span>
      </span>
    </div>
  );
}

export function BandeiraDesenho({ tipo, w = 34, h = 24 }: { tipo: TipoDeBandeira; w?: number; h?: number }) {
  const borda = <rect x=".5" y=".5" width={w - 1} height={h - 1} fill="none" stroke="rgba(0,0,0,.35)" />;
  if (tipo === 'quadriculada') {
    const tw = w / 6, th = h / 4;
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="corrida-bandeira" aria-hidden="true">
        {Array.from({ length: 24 }, (_, k) => <rect key={k} x={(k % 6) * tw} y={Math.floor(k / 6) * th} width={tw} height={th} fill={((k % 6) + Math.floor(k / 6)) % 2 ? '#111' : '#f6f6f6'} />)}
        {borda}
      </svg>
    );
  }
  if (tipo === 'pretaebranca') {
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="corrida-bandeira" aria-hidden="true">
        <polygon points={`0,0 ${w},0 0,${h}`} fill="#111" />
        <polygon points={`${w},0 ${w},${h} 0,${h}`} fill="#f6f6f6" />
        {borda}
      </svg>
    );
  }
  const cor = { verde: '#1faa4a', amarela: '#ffd400', azul: '#2f7bf5' }[tipo];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="corrida-bandeira" aria-hidden="true">
      <rect width={w} height={h} fill={cor} />
      {borda}
    </svg>
  );
}

/**
 * A classificação: os sentados, cada um com o que se sabe dele. Quem chegou vale pelo tempo que
 * o SERVIDOR anotou (já com a punição); quem corre, pelo que o próprio carro disse da última vez
 * — e o seu, pelo que está na sua mão.
 */
function montarLinhas(grid: Grid, noGrid: Carro[], euId: number, eu: Carro | null, remotos: Map<number, Remoto>): Linha[] {
  const linhas: Linha[] = [];
  for (const a of grid.assentos) {
    if (!a.pessoa) continue;
    const id = a.pessoa.id;
    const doServidor = grid.chegadas.find((c) => c.pessoa.id === id);
    const lugar = Math.max(0, grid.ordem.indexOf(a.carro));
    let progresso = noGrid[Math.min(7, lugar)].progresso, volta = 1, chegouEm: number | null = null, punicao = 0, velocidade = 0;
    if (id === euId && eu) {
      ({ progresso, volta, chegouEm, punicao, velocidade } = eu);
    } else {
      const ultima = remotos.get(id)?.fotos.at(-1);
      if (ultima) { progresso = ultima.p; volta = ultima.vo; chegouEm = ultima.c; punicao = ultima.pu; velocidade = ultima.v; }
    }
    if (doServidor) {
      punicao = doServidor.punicao ?? 0;
      chegouEm = doServidor.tempo - punicao;
    }
    // Na bandeirada quem não chegou não chegou, diga o carro o que disser.
    if (grid.estado === 'fim' && !doServidor) chegouEm = null;
    linhas.push({ id, carro: a.carro, pessoa: a.pessoa, progresso, volta, velocidade, chegouEm, punicao, abandonou: grid.abandonos.includes(id), voce: id === euId });
  }
  return classificar(linhas);
}

function montarPlacar({ g, pista, mapa, euId, eu, tempo, linhas, cron, seguidoId, corteEm, outros }: {
  g: Grid; pista: Pista; mapa: ReturnType<typeof contorno>; euId: number; eu: Carro | null; tempo: number; linhas: Linha[]; cron: Cronometro;
  seguidoId: number | null; corteEm: number | null;
  outros: { id: number; x: number; y: number; carro: CodigoDoCarro; foto: Posicao }[];
}): Placar {
  const lider = linhas[0];
  const diferencas = new Map<number, string>();
  linhas.forEach((l, i) => {
    if (l.abandonou) { diferencas.set(l.id, 'fora'); return; }
    if (l.chegouEm !== null) {
      const total = l.chegouEm + l.punicao;
      diferencas.set(l.id, i === 0 || lider.chegouEm === null ? formatarTempo(total) : formatarDiferenca(total - lider.chegouEm - lider.punicao).replace(' s', ''));
      return;
    }
    if (i === 0) { diferencas.set(l.id, tempo < 0 ? '' : 'líder'); return; }
    const voltasAtras = lider.chegouEm === null ? Math.floor((lider.progresso - l.progresso) / pista.volta) : 0;
    diferencas.set(l.id, escreverIntervalo(intervalo(cron, l.id, lider.id), voltasAtras));
  });

  const seguido = linhas.find((l) => l.id === seguidoId);
  let setores: Placar['setores'] = ['falta', 'falta', 'falta'];
  if (eu) {
    const parciais = [eu.setores[0], eu.setores[1] !== undefined ? eu.setores[1] - eu.setores[0] : undefined];
    setores = [0, 1, 2].map((i) => {
      if (i < eu.setores.length) {
        const melhor = eu.melhoresSetores[i];
        return melhor === null || (parciais[i] ?? Infinity) <= melhor ? 'melhor' : 'pior';
      }
      return i === eu.setores.length && tempo >= 0 && eu.chegouEm === null ? 'andando' : 'falta';
    });
  }

  const pontos: Placar['pontos'] = [];
  for (const o of outros) {
    const [x, y] = mapa.para(o.x, o.y);
    pontos.push({ id: o.id, x, y, cor: equipeDoCarro(o.carro).cor, destaque: o.id === seguidoId });
  }
  if (eu && g.meuCarro) {
    const [x, y] = mapa.para(eu.x, eu.y);
    pontos.push({ id: euId, x, y, cor: equipeDoCarro(g.meuCarro).cor, destaque: true });
  }

  const nome = (id: number) => g.assentos.find((a) => a.pessoa?.id === id)?.pessoa?.nome ?? '';
  const bandeira = bandeiraDaVez({
    tempo,
    volta: pista.volta,
    eu: eu && g.meuCarro && !g.abandonos.includes(euId)
      ? { nome: nome(euId), progresso: eu.progresso, velocidade: eu.velocidade, chegouEm: eu.chegouEm, corteEm, punicao: eu.punicao }
      : null,
    outros: linhas.filter((l) => !l.voce && !l.abandonou).map((l) => ({ nome: l.pessoa.nome, progresso: l.progresso, velocidade: l.velocidade, chegouEm: l.chegouEm })),
  });

  return {
    tempo,
    linhas,
    diferencas,
    velocidade: seguido?.velocidade ?? 0,
    voltaDoCarro: seguido?.volta ?? 1,
    tempoDaVolta: eu && tempo >= 0 ? (eu.chegouEm !== null ? null : tempo - eu.voltaComecouEm) : null,
    setores,
    melhorVolta: eu?.melhorVolta ?? null,
    pontos,
    bandeira,
    seguido: seguidoId,
  };
}

function FimDaCorrida({ grid, euId, ocupado, onAgir, onSair }: {
  grid: Grid; euId: number; ocupado: boolean;
  onAgir: (a: AcaoNoGrid) => void;
  onSair: () => void;
}) {
  const [primeiro, segundo, terceiro] = grid.chegadas;
  const participei = grid.meuCarro !== null || grid.souAnfitriao;
  const minha = grid.chegadas.findIndex((c) => c.pessoa.id === euId);
  const melhor = grid.chegadas.filter((c) => c.melhorVolta !== null).sort((a, b) => a.melhorVolta! - b.melhorVolta!)[0];
  const degrau = (c: Grid['chegadas'][number] | undefined, pos: number) => c && (
    <div className={`corrida-degrau pos-${pos}`}>
      <Avatar nome={c.pessoa.nome} foto={c.pessoa.foto} tamanho={pos === 1 ? 'huge' : 'big'} />
      <span className="corrida-degrau-nome">{c.pessoa.nome}</span>
      <span className="corrida-degrau-tempo">
        {formatarTempo(c.tempo)}{(c.punicao ?? 0) > 0 && <span className="corrida-torre-punicao">+{Math.round(c.punicao! / 1000)} s</span>}
      </span>
      <span className="corrida-degrau-bloco" style={{ borderTopColor: equipeDoCarro(c.carro).cor }}>{pos}</span>
    </div>
  );
  return (
    <div className="corrida-camada escura">
      <div className="corrida-cartao corrida-fim">
        <BandeiraDesenho tipo="quadriculada" w={42} h={28} />
        {primeiro ? (
          <>
            <span className="corrida-cartao-titulo">{primeiro.pessoa.id === euId ? 'Você venceu!' : `${primeiro.pessoa.nome} venceu`}</span>
            <span className="muted">
              {dadosDoCarro(primeiro.carro).piloto} · {equipeDoCarro(primeiro.carro).nome}
              {minha > 0 && ` · você chegou em ${minha + 1}º`}
            </span>
            <div className="corrida-podio">{degrau(segundo, 2)}{degrau(primeiro, 1)}{degrau(terceiro, 3)}</div>
            {melhor && <span className="small muted">Volta mais rápida: {melhor.pessoa.nome}, {formatarTempo(melhor.melhorVolta!)}</span>}
          </>
        ) : (
          <>
            <span className="corrida-cartao-titulo">Ninguém cruzou a linha</span>
            <span className="muted">Todo mundo abandonou antes da bandeirada.</span>
          </>
        )}
        <div className="xadrez-fim-botoes">
          {participei && (
            <button type="button" className="primary sm" disabled={ocupado} onClick={() => onAgir({ acao: 'correrDeNovo' })}>Correr de novo</button>
          )}
          {grid.souAnfitriao ? (
            <button type="button" className="secundario sm" disabled={ocupado} onClick={() => onAgir({ acao: 'fechar' })}>Fechar grid</button>
          ) : (
            <button type="button" className="secundario sm" onClick={onSair}>{participei ? 'Sair' : 'Parar de assistir'}</button>
          )}
        </div>
      </div>
    </div>
  );
}

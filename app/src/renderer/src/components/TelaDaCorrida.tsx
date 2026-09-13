import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Room, RoomEvent, type RemoteParticipant } from 'livekit-client';
import {
  agirNoGrid, pedirTokenDaCorrida, verGrid, type AcaoNoGrid, type Grid, type Membro, type PessoaDaMesa,
} from '../api';
import type { Aviso } from '../avisos';
import {
  ATRASO_DE_DESENHO, EQUIPES, FISICA, PARADO, PISTA, TOPICO, carroNoGrid, classificar, codificar,
  decodificar, dadosDoCarro, equipeDoCarro, formatarDiferenca, formatarTempo, guardarFoto, interpolar,
  luzesAcesas, passo, type Carro, type CodigoDoCarro, type Comandos, type Posicao,
} from '../corrida';
import { quemChamar } from '../jogos';
import { criarMotor } from '../motor';
import { contaDaIdentidade } from '../pessoas';
import { anotar } from '../registro';
import { Avatar } from './Avatar';
import { CarroDesenho, desenharCarro, desenharPista, enquadrarPista } from './DesenhoDaCorrida';
import { Icon } from './Icon';

/** De quanto em quanto a tela pergunta pelo grid. A corrida em si não passa por aqui. */
const INTERVALO_NO_GRID = 1000;
const INTERVALO_CORRENDO = 1500;
/** Posições por segundo que cada piloto manda. */
const ENVIOS_POR_SEGUNDO = 20;
/** Carro dos outros sem foto nova há isto some da pista: fechou o app, ou a rede caiu. */
const SEM_NOTICIA = 3000;

/**
 * O carro de quem saiu da tela no meio da corrida — foi ler o chat, por exemplo. Voltando, ele
 * continua de onde parou, em vez de renascer no grid. Por grid e por largada.
 */
const carrosGuardados = new Map<string, Carro>();

type Tocar = (qual: Aviso) => void;

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

  const intervalo = grid?.estado === 'correndo' ? INTERVALO_CORRENDO : INTERVALO_NO_GRID;
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
    const id = setInterval(buscar, intervalo);
    return () => { vivo = false; clearInterval(id); };
  }, [gridId, servidorId, receber, intervalo]);

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

  const titulo = !grid ? null
    : grid.estado === 'grid' ? `grid de ${grid.anfitriao.nome}`
    : grid.estado === 'correndo' ? `${grid.voltas} voltas` : 'bandeirada';
  const souPlateia = !!grid && grid.estado !== 'grid' && !grid.meuCarro;

  return (
    <div className="tela-do-xadrez tela-da-corrida">
      <header className="stage-head">
        <Icon name="controle" />
        <span className="strong">Fórmula 1</span>
        {titulo && <span className="xadrez-titulo">{titulo}</span>}
        {souPlateia && <span className="selo-assistindo"><Icon name="olho" size={12} /> assistindo</span>}
      </header>
      <div className="corrida-area">
        {!grid ? (
          <div className="xadrez-carregando muted">
            {falhou ? `Não consegui abrir o grid (${falhou}). Tentando de novo…` : 'Abrindo o grid…'}
          </div>
        ) : grid.estado === 'grid' ? (
          <GridDeLargada grid={grid} euId={euId} ocupado={ocupado} membros={membros} naCall={naCall}
            onAgir={agir} onSair={onFechar} />
        ) : (
          <Corrida key={`${grid.id}-${grid.rodada}`} grid={grid} euId={euId} servidorId={servidorId}
            diferenca={diferenca} ocupado={ocupado} surdo={surdo} tocar={tocar} live={live}
            onAgir={agir} onSair={onFechar} />
        )}
      </div>
    </div>
  );
}

// ---- o grid de largada ---------------------------------------------------------------

function GridDeLargada({ grid, euId, ocupado, membros, naCall, onAgir, onSair }: {
  grid: Grid; euId: number; ocupado: boolean; membros: Membro[]; naCall: Set<number>;
  onAgir: (a: AcaoNoGrid) => void;
  onSair: () => void;
}) {
  const sentados = grid.assentos.filter((a) => a.pessoa).length;
  const noGrid = new Set(grid.assentos.flatMap((a) => (a.pessoa ? [a.pessoa.id] : [])));
  const chamados = new Set(grid.chamados.map((p) => p.id));
  const lista = quemChamar(membros, { euId, naCall, jogando: noGrid, convidado: null, recusou: null });

  const assento = (a: Grid['assentos'][number]) => {
    const d = dadosDoCarro(a.carro);
    const meu = a.pessoa?.id === euId;
    const livre = !a.pessoa;
    return (
      <button key={a.carro} type="button" className={`corrida-assento ${meu ? 'meu' : ''} ${livre ? 'livre' : ''}`}
        disabled={ocupado || !livre} onClick={() => onAgir({ acao: 'sentar', carro: a.carro })}
        title={livre ? `Sentar no carro de ${d.piloto}` : undefined}>
        <CarroDesenho carro={a.carro} />
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

type Remoto = { fotos: Posicao[]; recebidaEm: number };
type Linha = {
  id: number; carro: CodigoDoCarro; pessoa: PessoaDaMesa; progresso: number; volta: number;
  chegouEm: number | null; abandonou: boolean; voce: boolean;
};

const TECLAS: Record<string, keyof Comandos> = {
  ArrowUp: 'acelera', KeyW: 'acelera', ArrowDown: 'freia', KeyS: 'freia',
  ArrowLeft: 'esquerda', KeyA: 'esquerda', ArrowRight: 'direita', KeyD: 'direita',
};

function Corrida({ grid, euId, servidorId, diferenca, ocupado, surdo, tocar, live, onAgir, onSair }: {
  grid: Grid; euId: number; servidorId: number;
  diferenca: MutableRefObject<number | null>;
  ocupado: boolean; surdo: boolean; tocar: Tocar; live?: ReactNode;
  onAgir: (a: AcaoNoGrid) => void;
  onSair: () => void;
}) {
  const souPiloto = grid.meuCarro !== null;
  const abandonei = grid.abandonos.includes(euId);
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
    carro.current = carrosGuardados.get(chave) ?? carroNoGrid(PISTA, lugar);
  }
  const comandos = useRef<Comandos>({ ...PARADO });
  const remotos = useRef(new Map<number, Remoto>());
  const sala = useRef<Room | null>(null);

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
      remotos.current.set(id, { fotos: guardarFoto(atual?.fotos ?? [], foto), recebidaEm: Date.now() });
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

  // ---- o quadro: tamanho e a pista pré-desenhada
  const caixa = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fundo = useRef<{ tela: HTMLCanvasElement; w: number; h: number } | null>(null);
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
      fundo.current = { tela: desenharPista(PISTA, w, h, dpr), w, h };
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ---- o laço: física, envio, sons e desenho
  const [quadro, setQuadro] = useState<{ tempo: number; linhas: Linha[]; minhaVolta: number | null } | null>(null);
  useEffect(() => {
    const motor = souPiloto ? criarMotor() : null;
    const codificador = new TextEncoder();
    let ultimoQuadro = performance.now();
    let acumulado = 0;
    let ultimoEnvio = 0;
    let ultimaColuna = 0;
    let luzesAntes: number | null = -1;
    let chegadaMandada = carro.current?.chegouEm !== null && carro.current?.chegouEm !== undefined;
    let pedido = 0;

    const tempoDeCorrida = () => {
      const g = gridRef.current;
      return Date.now() + (diferenca.current ?? 0) - (g.largadaEm ?? Date.now());
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
        if (luzes !== null && luzes > 0 && (luzesAntes === null ? false : luzes > luzesAntes)) tocarRef.current('luz');
        if (luzes === null && luzesAntes !== null && tempo < 1500) tocarRef.current('largada');
      }
      luzesAntes = luzes;

      // Os outros, onde disseram estar um instante atrás.
      const outros: { id: number; carro: CodigoDoCarro; x: number; y: number; a: number; foto: Posicao }[] = [];
      for (const [id, r] of remotos.current) {
        if (Date.now() - r.recebidaEm > SEM_NOTICIA) continue;
        const assento = g.assentos.find((a) => a.pessoa?.id === id);
        const p = interpolar(r.fotos, tempo - ATRASO_DE_DESENHO);
        if (!assento || !p) continue;
        outros.push({ id, carro: assento.carro, x: p.x, y: p.y, a: p.a, foto: r.fotos[r.fotos.length - 1] });
      }

      // O meu carro.
      const eu = carro.current;
      const pilotando = !!eu && g.estado === 'correndo' && !g.abandonos.includes(euId);
      if (eu && pilotando && tempo >= 0) {
        acumulado += dt;
        let c = eu;
        while (acumulado >= 1 / 120) {
          acumulado -= 1 / 120;
          const r = passo(PISTA, c, comandos.current, 1 / 120, tempo, outros, g.voltas);
          c = r.carro;
          if (r.batida && r.batida.forca > 35 && !surdoRef.current) tocarRef.current('batida');
        }
        carro.current = c;
        carrosGuardados.set(chave, c);
        if (c.chegouEm !== null && !chegadaMandada) {
          chegadaMandada = true;
          // Venceu quem chegou antes de todo mundo que já chegou — pelo que o servidor sabe e
          // pelo que os carros dos outros disseram.
          const antes = g.chegadas.length > 0 || outros.some((o) => o.foto.c !== null && o.foto.c < c.chegouEm!);
          if (!surdoRef.current) tocarRef.current(antes ? 'fimDaPartida' : 'vitoria');
          agirRef.current({ acao: 'chegada', tempo: Math.round(c.chegouEm), melhorVolta: c.melhorVolta });
        }
      }
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

      // Desenha.
      const c2 = canvas.current?.getContext('2d');
      const f = fundo.current;
      if (c2 && f) {
        const dpr = window.devicePixelRatio || 1;
        c2.setTransform(1, 0, 0, 1, 0, 0);
        c2.drawImage(f.tela, 0, 0, canvas.current!.width, canvas.current!.height);
        const [a, b, c, d, e, f2] = enquadrarPista(PISTA, f.w, f.h).matriz;
        c2.setTransform(dpr * a, dpr * b, dpr * c, dpr * d, dpr * e, dpr * f2);
        for (const o of outros) desenharCarro(c2, o.carro, o.x, o.y, o.a, false);
        if (eu && g.meuCarro && !g.abandonos.includes(euId)) desenharCarro(c2, g.meuCarro, eu.x, eu.y, eu.angulo, true);
      }

      // A coluna, quatro vezes por segundo: redesenhar o React a cada quadro não diz nada a mais.
      if (agoraPerf - ultimaColuna > 250) {
        ultimaColuna = agoraPerf;
        setQuadro({ tempo, linhas: montarLinhas(g, euId, eu, remotos.current), minhaVolta: eu?.volta ?? null });
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

  const tempo = quadro?.tempo ?? -99999;
  const luzes = grid.estado === 'correndo' ? luzesAcesas(tempo) : null;
  const linhas = quadro?.linhas ?? montarLinhas(grid, euId, carro.current, remotos.current);
  const minhaChegada = grid.chegadas.findIndex((c) => c.pessoa.id === euId);

  // Abandonar é perder a corrida: o primeiro clique arma, como o desistir do xadrez.
  const [armado, setArmado] = useState(false);
  useEffect(() => {
    if (!armado) return;
    const id = setTimeout(() => setArmado(false), 4000);
    return () => clearTimeout(id);
  }, [armado]);

  const voltaNaColuna = grid.estado === 'fim' ? null
    : Math.min(grid.voltas, souPiloto && quadro?.minhaVolta ? quadro.minhaVolta : Math.max(1, ...linhas.map((l) => l.volta)));

  return (
    <>
      <div className="corrida-pista" ref={caixa}>
        <canvas ref={canvas} />
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
                  <span className="small corrida-apagado">WASD também funciona</span>
                </>
              )}
            </div>
          </div>
        )}
        {grid.estado === 'correndo' && minhaChegada >= 0 && (
          <div className="corrida-aviso-de-chegada">
            Você chegou em {minhaChegada + 1}º · esperando os outros
          </div>
        )}
        {semSala && grid.estado === 'correndo' && (
          <div className="corrida-aviso-de-chegada erro">Não consegui ligar a pista aos outros carros — só o seu aparece.</div>
        )}
        {grid.estado === 'fim' && (
          <FimDaCorrida grid={grid} euId={euId} ocupado={ocupado} onAgir={onAgir} onSair={onSair} />
        )}
      </div>

      <div className="xadrez-lateral corrida-lateral">
        <div className="xadrez-cabecalho">
          {grid.estado === 'fim' ? 'Classificação final' : `Volta ${voltaNaColuna} de ${grid.voltas}`}
        </div>
        <div className="corrida-classificacao">
          {linhas.map((l, i) => (
            <LinhaDaClassificacao key={l.id} linha={l} posicao={i + 1} grid={grid} lider={linhas[0]} />
          ))}
        </div>
        {grid.estado === 'fim' && melhorVoltaDoGrid(grid) && (
          <span className="small muted">{melhorVoltaDoGrid(grid)}</span>
        )}
        <span className="spacer" />
        {live && <div className="xadrez-live">{live}</div>}
        {grid.plateia.length > 0 && (
          <div className="xadrez-plateia" title={`Assistindo: ${grid.plateia.map((p) => p.nome).join(', ')}`}>
            <Icon name="olho" size={13} /><span>{grid.plateia.length === 1 ? grid.plateia[0].nome : `${grid.plateia.length} assistindo`}</span>
          </div>
        )}
        {grid.estado === 'correndo' && (
          souPiloto && !abandonei && minhaChegada < 0 ? (
            armado ? (
              <button type="button" className="primary destrutivo" disabled={ocupado} autoFocus
                onClick={() => { setArmado(false); onAgir({ acao: 'abandonar' }); onSair(); }}>
                Confirmar: abandonar
              </button>
            ) : (
              <button type="button" className="perigo" disabled={ocupado} onClick={() => setArmado(true)}>Abandonar a corrida</button>
            )
          ) : (
            <button type="button" className="secundario" onClick={onSair}>{souPiloto ? 'Sair da pista' : 'Parar de assistir'}</button>
          )
        )}
      </div>
    </>
  );
}

/**
 * A classificação que a coluna mostra: os sentados, cada um com o que se sabe dele. Quem
 * chegou vale pelo tempo que o SERVIDOR anotou; quem corre, pelo que o próprio carro disse
 * da última vez — e o seu, pelo que está na sua mão.
 */
function montarLinhas(grid: Grid, euId: number, eu: Carro | null, remotos: Map<number, Remoto>): Linha[] {
  const linhas: Linha[] = [];
  for (const a of grid.assentos) {
    if (!a.pessoa) continue;
    const id = a.pessoa.id;
    const doServidor = grid.chegadas.find((c) => c.pessoa.id === id);
    const lugar = Math.max(0, grid.ordem.indexOf(a.carro));
    const noGrid = carroNoGrid(PISTA, lugar);
    let progresso = noGrid.progresso, volta = 1, chegouEm: number | null = null;
    if (id === euId && eu) {
      ({ progresso, volta, chegouEm } = eu);
    } else {
      const ultima = remotos.get(id)?.fotos.at(-1);
      if (ultima) { progresso = ultima.p; volta = ultima.vo; chegouEm = ultima.c; }
    }
    if (doServidor) chegouEm = doServidor.tempo;
    // Na bandeirada quem não chegou não chegou, diga o carro o que disser.
    if (grid.estado === 'fim' && !doServidor) chegouEm = null;
    linhas.push({ id, carro: a.carro, pessoa: a.pessoa, progresso, volta, chegouEm, abandonou: grid.abandonos.includes(id), voce: id === euId });
  }
  return classificar(linhas);
}

function melhorVoltaDoGrid(grid: Grid): string | null {
  const melhor = grid.chegadas.filter((c) => c.melhorVolta !== null).sort((a, b) => a.melhorVolta! - b.melhorVolta!)[0];
  return melhor ? `Volta mais rápida: ${melhor.pessoa.nome}, ${formatarTempo(melhor.melhorVolta!)}` : null;
}

function LinhaDaClassificacao({ linha, posicao, grid, lider }: { linha: Linha; posicao: number; grid: Grid; lider: Linha }) {
  const equipe = equipeDoCarro(linha.carro);
  const direita = linha.abandonou ? 'abandonou'
    : linha.chegouEm !== null
      ? (posicao === 1 || lider.chegouEm === null ? formatarTempo(linha.chegouEm) : formatarDiferenca(linha.chegouEm - lider.chegouEm))
      : grid.estado === 'fim' ? 'não chegou'
      : posicao === 1 ? 'líder' : `volta ${Math.min(grid.voltas, linha.volta)}`;
  return (
    <div className={`corrida-linha ${linha.voce ? 'voce' : ''} ${linha.abandonou ? 'fora' : ''}`}>
      <span className="corrida-posicao">{posicao}</span>
      <span className="corrida-cor" style={{ background: equipe.cor }} />
      <Avatar nome={linha.pessoa.nome} foto={linha.pessoa.foto} />
      <span className="corrida-linha-textos">
        <span className="corrida-linha-nome">{linha.pessoa.nome}{linha.voce && <span className="muted"> · você</span>}</span>
        <span className="corrida-linha-equipe">{linha.carro} · {equipe.curto}</span>
      </span>
      <span className="corrida-linha-direita">{direita}</span>
    </div>
  );
}

function FimDaCorrida({ grid, euId, ocupado, onAgir, onSair }: {
  grid: Grid; euId: number; ocupado: boolean;
  onAgir: (a: AcaoNoGrid) => void;
  onSair: () => void;
}) {
  const [primeiro, segundo, terceiro] = grid.chegadas;
  const participei = grid.meuCarro !== null || grid.souAnfitriao;
  const minha = grid.chegadas.findIndex((c) => c.pessoa.id === euId);
  const degrau = (c: Grid['chegadas'][number] | undefined, pos: number) => c && (
    <div className={`corrida-degrau pos-${pos}`}>
      <Avatar nome={c.pessoa.nome} foto={c.pessoa.foto} tamanho={pos === 1 ? 'huge' : 'big'} />
      <span className="corrida-degrau-nome">{c.pessoa.nome}</span>
      <span className="corrida-degrau-bloco" style={{ borderTopColor: equipeDoCarro(c.carro).cor }}>{pos}</span>
    </div>
  );
  return (
    <div className="corrida-camada escura">
      <div className="corrida-cartao corrida-fim">
        {primeiro ? (
          <>
            <span className="corrida-cartao-titulo">{primeiro.pessoa.id === euId ? 'Você venceu!' : `${primeiro.pessoa.nome} venceu`}</span>
            <span className="muted">
              {dadosDoCarro(primeiro.carro).piloto} · {equipeDoCarro(primeiro.carro).nome}
              {minha > 0 && ` · você chegou em ${minha + 1}º`}
            </span>
            <div className="corrida-podio">{degrau(segundo, 2)}{degrau(primeiro, 1)}{degrau(terceiro, 3)}</div>
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


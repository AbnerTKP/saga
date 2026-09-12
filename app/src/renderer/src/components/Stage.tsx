import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Track } from 'livekit-client';
import type { useRoom, Tile } from '../useRoom';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { VerImagem } from './VerImagem';
import { Chat } from './Chat';
import { FaixaDoPalco } from './FaixaDoPalco';
import { ControleDeVolume } from './ControleDeVolume';
import type { ConversaAberta, Digitando, Mensagem, RoomInfo } from '../api';
import type { LiveNoChat } from '../lives';
import { identidadeDe } from '../pessoas';
import type { PessoaNaCall } from './MenuDaPessoa';
import type { Espectador } from '../espectadores';
import type { Enquadramento } from '../enquadramento';
import { anotar } from '../registro';

type RM = ReturnType<typeof useRoom>;

/**
 * Quem está assistindo a esta transmissão.
 *
 * Quem transmite não tem como saber isso sozinho — o LiveKit não conta a ninguém quem se
 * inscreveu na faixa dele —, e é justamente quem transmite que precisa saber. Por isso o
 * zero aparece: na SUA transmissão, "ninguém ainda" é a informação, não a ausência dela.
 * Nas dos outros, lista vazia não desenha nada.
 */
function QuemAssiste({ espectadores, nomes = 0, mostrarVazio, extra }: {
  espectadores: Espectador[];
  /** Quantos nomes cabem aqui. Zero quer dizer "só o número" — no quadro pequeno, três
      nomes viram reticências e não se lê nenhum. */
  nomes?: number;
  mostrarVazio?: boolean;
  extra?: string;
}) {
  const quem = espectadores.map((e) => e.nome);
  if (quem.length === 0 && !mostrarVazio) return null;
  const cabem = quem.slice(0, nomes);
  const resto = quem.length - cabem.length;
  return (
    <span
      className={`quem-assiste ${extra ?? ''}`}
      // O corte é do lugar apertado, não do dado: parando o mouse em cima vem a lista
      // INTEIRA, sem corte nenhum — é para isso que se passa o mouse.
      title={quem.length ? `Assistindo: ${quem.join(', ')}` : 'Ninguém está assistindo'}
    >
      <Icon name="olho" size={13} />
      {quem.length === 0 ? <span>ninguém ainda</span> : nomes === 0 ? <span>{quem.length}</span> : (
        <>
          {/* Os NOMES é que encolhem; a conta fica fora do corte. Com os dois no mesmo
              texto, "Juninho, Junio e mais 5" virava "Juninho, Junio e mai…" num quadro
              de 180 px — comia justamente o número, que é o que não se sabe de outro
              jeito. */}
          <span className="assiste-nomes">{cabem.join(', ')}</span>
          {resto > 0 && <span className="assiste-resto">+{resto}</span>}
        </>
      )}
    </span>
  );
}

/**
 * Os controles da live aparecem quando o mouse mexe e somem 2,5 s depois de ele parar,
 * como num player de vídeo — foi a escolha do dono entre isto e uma barra sempre à vista.
 * Com o mouse EM CIMA deles, não somem: quem está ajustando o volume não pode ver a barra
 * fugir da mão.
 */
function useControlesQueSomem(ms = 2500) {
  const [visiveis, setVisiveis] = useState(false);
  const relogio = useRef<number | undefined>(undefined);
  const segurando = useRef(false);
  useEffect(() => () => window.clearTimeout(relogio.current), []);

  const agendar = useCallback(() => {
    window.clearTimeout(relogio.current);
    if (!segurando.current) relogio.current = window.setTimeout(() => setVisiveis(false), ms);
  }, [ms]);
  const mostrar = useCallback(() => { setVisiveis(true); agendar(); }, [agendar]);
  const esconder = useCallback(() => {
    window.clearTimeout(relogio.current);
    segurando.current = false;
    setVisiveis(false);
  }, []);
  const segurar = useCallback((sim: boolean) => {
    segurando.current = sim;
    if (sim) window.clearTimeout(relogio.current);
    else agendar();
  }, [agendar]);

  return { visiveis, mostrar, esconder, segurar };
}

/** Tudo o que os controles da live escolhida precisam saber e fazer. */
type ControlesDaLive = {
  nome: string;
  foto?: string | null;
  enquadramento?: Enquadramento | null;
  espectadores: Espectador[];
  /** A sua própria transmissão: não há som seu para ajustar, e sair é fechar a prévia. */
  local: boolean;
  volume: number;
  onVolume: (v: number) => void;
  preencher: boolean;
  onPreencher: (v: boolean) => void;
  onSair: () => void;
};

function VideoTile({ tile, big, preencher, falando, onClick, controles }: {
  tile: Tile; big?: boolean;
  /** Cortar as bordas para ocupar tudo, em vez de deixar tarja preta. */
  preencher?: boolean;
  /** Quem está falando agora, medido do som — ver niveis.ts. */
  falando: Set<string>;
  onClick?: () => void;
  /** Só na live escolhida, no palco: os controles por cima da imagem. */
  controles?: ControlesDaLive;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const { visiveis, mostrar, esconder, segurar } = useControlesQueSomem();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    tile.track.attach(el);
    return () => { tile.track.detach(el); };
  }, [tile.track]);
  const name = tile.participant.name || tile.participant.identity;
  const isScreen = tile.source === Track.Source.ScreenShare;

  // Tela cheia de verdade, na tela inteira do computador — não só maior dentro da janela.
  //
  // A pergunta é "EU estou em tela cheia?", não "alguém está?". O mesmo track pode estar
  // desenhado em dois quadros ao mesmo tempo — o do palco e o flutuante —, e perguntar ao
  // documento fazia clicar no segundo FECHAR o primeiro em vez de trocar.
  const telaCheia = () => {
    const alvo = caixa.current;
    if (!alvo) return;
    if (document.fullscreenElement === alvo) {
      document.exitFullscreen().catch((e) => anotar('erro', 'tela', e));
    } else {
      anotar('info', 'tela', 'pedindo tela cheia');
      alvo.requestFullscreen().catch((e) => anotar('erro', 'tela', e));
    }
  };

  // Nos controles, clique e dois cliques são deles: não sobem até a imagem de baixo.
  const soDosControles = {
    onMouseEnter: () => segurar(true),
    onMouseLeave: () => segurar(false),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onDoubleClick: (e: React.MouseEvent) => e.stopPropagation(),
  };

  return (
    <div
      ref={caixa}
      className={`tile ${big ? 'big' : ''} ${preencher ? 'preencher' : ''} ${falando.has(tile.participant.identity) && !isScreen ? 'speaking' : ''} ${controles ? 'com-controles' : ''} ${controles && visiveis ? 'controles-visiveis' : ''}`}
      // Na live escolhida, clicar na imagem mostra os controles. Clicar SAÍA da live — um
      // clique para dar foco à janela bastava para perder a transmissão.
      onClick={controles ? mostrar : onClick}
      onMouseMove={controles ? mostrar : undefined}
      onMouseLeave={controles ? esconder : undefined}
      onDoubleClick={(e) => { e.stopPropagation(); telaCheia(); }}
    >
      <video ref={ref} autoPlay playsInline muted className={tile.local && !isScreen ? 'mirror' : ''} />
      {controles ? (
        <>
          <div className="controles-da-live cima" {...soDosControles}>
            <Avatar nome={controles.nome} foto={controles.foto} enquadramento={controles.enquadramento} />
            <span className="controles-nome">{controles.nome}{controles.local ? ' (você)' : ''}</span>
            <span className="selo-ao-vivo"><span className="ponto" /> ao vivo</span>
            <QuemAssiste espectadores={controles.espectadores} mostrarVazio={controles.local} />
            <span className="spacer" />
            <button type="button" className="controles-sair" onClick={controles.onSair}>
              <Icon name="close" size={14} /> {controles.local ? 'Fechar a prévia' : 'Sair da live'}
            </button>
          </div>
          <div className="controles-da-live baixo" {...soDosControles}>
            {!controles.local && <ControleDeVolume volume={controles.volume} onVolume={controles.onVolume} claro />}
            <span className="spacer" />
            <button
              type="button"
              className={`controles-icone ${controles.preencher ? 'ligado' : ''}`}
              title={controles.preencher ? 'Mostrar a imagem inteira' : 'Preencher o quadro, cortando as bordas'}
              onClick={() => controles.onPreencher(!controles.preencher)}
            >
              <Icon name="aspecto" size={20} />
            </button>
            <button type="button" className="controles-icone" title="Tela cheia (dois cliques também)" onClick={telaCheia}>
              <Icon name="expandir" size={20} />
            </button>
          </div>
        </>
      ) : (
        <div className="tile-label">
          {isScreen && <Icon name="screen" size={14} />}
          {name}{tile.local ? ' (você)' : ''}
        </div>
      )}
    </div>
  );
}

export function Stage({ rm, pessoas, onPessoa, salaAberta, servidorId, chat, meuId, podeApagar, lives, onAssistirLive, onVoltarAVoz, jogo, faixaDaPartida, conversa, telaDeAmigos }: {
  /**
   * A conversa privada aberta. Ela toma o lugar da sala no palco: o chat é o MESMO — mesmo
   * anexo, mesmo GIF, mesmo apagar no botão direito —, e o que muda é o cabeçalho, que
   * mostra a pessoa em vez do nome da sala.
   */
  conversa?: ConversaAberta | null;
  /** A tela de amigos, quando ela é o que está aberto. Ela traz o próprio cabeçalho. */
  telaDeAmigos?: ReactNode;
  rm: RM;
  /** Quem foi visto nas calls do servidor DA CALL: os rostos do palco são de lá. */
  pessoas: Map<string, PessoaNaCall>;
  /**
   * Esquerdo abre o perfil; direito, as ações. `onde` é o servidor de quem se clicou: sem
   * ele, o aberto — que é o do chat. Quem está na call vai com o servidor da call.
   */
  onPessoa: (
    identity: string, nome: string, em: { x: number; y: number }, tipo: 'perfil' | 'acoes',
    onde?: { servidorId: number; servidorNome: string },
  ) => void;
  /** A sala que está sendo olhada. Pode ser de texto mesmo com a voz noutra — ou de
      outro servidor, se a pessoa foi espiar o vizinho sem desligar a call. */
  salaAberta: RoomInfo | null;
  /** O servidor que está sendo olhado, que nem sempre é o da voz. */
  servidorId: number;
  chat: {
    mensagens: Mensagem[];
    digitando: Digitando[];
    erro: string | null;
    enviar: (t: string) => Promise<void>;
    enviarGif: (url: string) => Promise<void>;
    enviarArquivo: (arquivo: File, texto: string, aoProgredir: (f: number) => void) => Promise<void>;
    contarQueDigito: () => void;
    apagar: (id: number) => Promise<void>;
  };
  meuId: number;
  /** Se quem lê pode apagar esta mensagem — ver apagar.ts. */
  podeApagar?: (m: Mensagem) => boolean;
  /** As telas no ar agora, em qualquer sala de voz do servidor — ver lives.ts. */
  lives: LiveNoChat[];
  /** Assistir a uma live a partir do chat, entrando na sala de voz dela se preciso. */
  onAssistirLive: (live: LiveNoChat) => void;
  /** Volta para a sala de voz em que você está, a partir do chat. */
  onVoltarAVoz?: () => void;
  /**
   * A partida de xadrez aberta, quando há uma: ela toma o lugar da sala na tela — é a tela
   * da dupla, e nada mais. Recebe a live que você assiste para pôr na coluna: flutuando no
   * canto, ela taparia o tabuleiro e os botões da partida.
   */
  jogo?: (live: ReactNode | null) => ReactNode;
  /** A sua partida, quando você saiu dela para ler outra coisa. */
  faixaDaPartida?: ReactNode;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const [imagemAberta, setImagemAberta] = useState<string | null>(null);
  // Preferência de quem assiste, não de quem transmite: uma tela 16:9 numa janela 16:10
  // sobra tarja preta, e tem quem prefira cortar as bordas a ver a faixa.
  const [preencher, setPreencher] = useState(() => {
    try { return localStorage.getItem('cantinho.preencher') === '1'; } catch { return false; }
  });
  const trocarPreencher = useCallback((v: boolean) => {
    setPreencher(v);
    try { localStorage.setItem('cantinho.preencher', v ? '1' : '0'); } catch { /* sem guardar, volta ao padrão */ }
  }, []);

  /**
   * O palco não escolhe sozinho. Quem escolhe é quem assiste.
   *
   * Antes ele focava a primeira transmissão que aparecesse — e "a primeira" é a ordem em
   * que os participantes calharam de vir, que muda quando alguém liga a câmera ou troca
   * de faixa. Com duas pessoas transmitindo, o quadro grande pulava de uma para a outra
   * sozinho, e não havia como dizer "quero ESTA". Agora não há palpite: sem escolha, quem
   * está no ar aparece em cartões, esperando.
   *
   * A escolha vale para imagem E som: a que está no palco é a que se vê e a única que se
   * ouve. Sem escolha, silêncio — que é o que audivel.ts já dizia.
   */
  const screens = rm.tiles.filter((t) => t.source === Track.Source.ScreenShare);
  const liveNoPalco = screens.find((t) => t.participant.identity === rm.assistindo) ?? null;
  const focusTile = liveNoPalco ?? rm.tiles.find((t) => t.key === focus) ?? null;
  const rest = focusTile ? rm.tiles.filter((t) => t.key !== focusTile.key) : rm.tiles;

  /**
   * As transmissões que estão no ar mas não estão sendo recebidas.
   *
   * Elas não têm faixa, logo não têm quadro — mas precisam continuar à vista para dar onde
   * clicar. Sem nada no palco, elas SÃO o palco, em cartões grandes; com algo no palco,
   * ficam na faixa de baixo.
   */
  const apagadas = rm.lives.filter(
    (l) => !rm.tiles.some((t) => t.source === Track.Source.ScreenShare && t.participant.identity === l.identity),
  );
  const cartoesNaFaixa = focusTile ? apagadas : [];

  const escolher = (t: Tile) => {
    if (t.source === Track.Source.ScreenShare) {
      rm.assistir(t.participant.identity === rm.assistindo ? null : t.participant.identity);
      setFocus(null);
      return;
    }
    setFocus(focus === t.key ? null : t.key);
  };

  const controlesDe = (t: Tile): ControlesDaLive => {
    const id = t.participant.identity;
    return {
      nome: t.participant.name || id,
      foto: pessoas.get(id)?.foto,
      enquadramento: pessoas.get(id)?.enquadramento?.foto,
      espectadores: rm.espectadores.get(id) ?? [],
      local: t.local,
      volume: rm.volumeDaTelaDe(id),
      onVolume: (v) => rm.definirVolumeDaTela(id, v),
      preencher,
      onPreencher: trocarPreencher,
      onSair: () => rm.assistir(null),
    };
  };

  const idle = rm.status === 'idle';
  // Quem está no palco é da CALL, e a call pode ser de outro servidor: trocar de servidor
  // não desliga a voz. O cartão dessas pessoas se pergunta ao servidor dela.
  const daCall = rm.salaDaVoz
    ? { servidorId: rm.salaDaVoz.servidorId, servidorNome: rm.salaDaVoz.servidorNome }
    : undefined;
  const audioOnly = rm.participants.filter((p) => !rm.tiles.some((t) => t.participant === p));
  const nomeDaLiveNoPalco = liveNoPalco ? (liveNoPalco.participant.name || liveNoPalco.participant.identity) : null;

  /**
   * O quadro pequeno da live que você assiste. É o mesmo conteúdo nos dois lugares onde ele
   * cabe: flutuando no canto do chat, e dentro da coluna da partida de xadrez.
   */
  const quadroDaLive = liveNoPalco && nomeDaLiveNoPalco ? (
    <>
      <VideoTile tile={liveNoPalco} preencher={preencher} falando={rm.falando} />
      <div className="mini-live-controles">
        <span className="ponto-ao-vivo" />
        <span className="mini-live-nome">{nomeDaLiveNoPalco}</span>
        {!liveNoPalco.local && (
          <ControleDeVolume
            volume={rm.volumeDaTelaDe(liveNoPalco.participant.identity)}
            onVolume={(v) => rm.definirVolumeDaTela(liveNoPalco.participant.identity, v)}
            largura={56}
            porcentagem={false}
          />
        )}
        {onVoltarAVoz && (
          <button type="button" className="mini-live-icone" title="Voltar ao palco" onClick={onVoltarAVoz}>
            <Icon name="expandir" size={17} />
          </button>
        )}
        <button type="button" className="sair-da-live pequeno" onClick={() => rm.assistir(null)}
          title={liveNoPalco.local ? 'Fechar a prévia' : 'Sair da live'}>
          <Icon name="close" size={13} /> Sair
        </button>
      </div>
    </>
  ) : null;

  // A tela de amigos é uma tela de conta, não de servidor: ela traz o próprio cabeçalho e
  // não tem call nem sala em volta.
  if (telaDeAmigos) {
    return <main className="stage">{telaDeAmigos}</main>;
  }

  // A partida toma o palco inteiro: é a tela da dupla, sem a faixa da call e sem o resto da
  // sala em volta. Quem sai dela para ler o chat leva a faixa da partida junto.
  if (jogo) {
    return (
      <main className="stage">
        {jogo(quadroDaLive && <div className="mini-live na-coluna">{quadroDaLive}</div>)}
        {imagemAberta && <VerImagem url={imagemAberta} onClose={() => setImagemAberta(null)} />}
      </main>
    );
  }

  return (
    <main className="stage">
      <header className="stage-head">
        {conversa ? (
          <>
            {/* A pessoa no lugar do nome da sala: numa conversa privada é ela o lugar. */}
            <Avatar nome={conversa.com.nome} foto={conversa.com.foto}
              enquadramento={conversa.com.enquadramento?.foto} status={conversa.com.status} />
            <span className="strong">{conversa.com.nome}</span>
            <span className="muted small">só vocês dois</span>
          </>
        ) : (
          <>
            <Icon name={salaAberta?.tipo === 'texto' ? 'texto' : 'speaker'} />
            <span className="strong">{salaAberta?.name ?? rm.salaDaVoz?.nome ?? 'Escolha uma sala'}</span>
          </>
        )}
      </header>

      {/* Estando na voz de uma sala e lendo outra, a call fica à mostra aqui em cima: quem
          está nela, a live que está rodando, e o caminho de volta num clique. Não aparece
          na própria sala de voz — ali o palco já está na tela. */}
      {!idle && rm.salaDaVoz && salaAberta && rm.salaDaVoz.id !== salaAberta.id && (
        <FaixaDoPalco
          sala={rm.salaDaVoz}
          participantes={rm.participants.map((p) => ({ identity: p.identity, nome: p.name || p.identity }))}
          pessoas={pessoas}
          transmitindo={rm.lives.length}
          assistindoNome={nomeDaLiveNoPalco}
          servidorAberto={servidorId}
          onAbrir={onVoltarAVoz}
        />
      )}

      {/* Logo abaixo da call: a partida de xadrez que você deixou aberta. O relógio dela
          continua correndo enquanto você lê outra coisa. */}
      {faixaDaPartida}

      {/* Chat é da sala de chat, e só dela. Ele já morou dentro da sala de voz, dividindo
          espaço com a transmissão — as duas coisas ficavam apertadas e nenhuma inteira.
          Quem está na voz e abre o chat não perde a live: ela vira o quadro flutuante. */}
      {conversa || salaAberta?.tipo === 'texto' ? (
        <div className="stage-body so-chat">
          <Chat
            mensagens={chat.mensagens}
            digitando={chat.digitando}
            erro={chat.erro}
            onEnviar={chat.enviar}
            onEnviarGif={chat.enviarGif}
            onEnviarArquivo={chat.enviarArquivo}
            onDigitar={chat.contarQueDigito}
            onVerImagem={setImagemAberta}
            sala={conversa ? conversa.com.nome : salaAberta!.name}
            chave={conversa ? `c${conversa.id}` : `s${salaAberta!.id}`}
            emConversa={!!conversa}
            // Amizade desfeita: a conversa continua sendo lida, e o campo é que fecha.
            bloqueio={conversa && !conversa.podeEscrever
              ? 'Vocês não são mais amigos. Só dá para mandar mensagem para amigos.'
              : null}
            meuId={meuId}
            podeApagar={podeApagar}
            onApagar={chat.apagar}
            onPessoa={(id, nome, em, tipo) => onPessoa(identidadeDe(id), nome, em, tipo)}
            lives={lives}
            assistindo={rm.assistindo}
            onAssistir={onAssistirLive}
            salaDaVozId={rm.salaDaVoz?.id ?? null}
          />
        </div>
      ) : (
      <div className="stage-body">
        <section className="videos">
          {idle && <div className="empty">Clique numa sala à esquerda para entrar na voz.</div>}
          {!idle && rm.tiles.length === 0 && rm.lives.length === 0 && (
            <div className="empty">
              <div className="avatars">
                {rm.participants.map((p) => (
                  <span
                    key={p.identity}
                    className="clicavel"
                    onClick={(e) => onPessoa(p.identity, p.name || p.identity, { x: e.clientX, y: e.clientY }, 'perfil', daCall)}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onPessoa(p.identity, p.name || p.identity, { x: e.clientX, y: e.clientY }, 'acoes', daCall); }}
                  >
                    <Avatar nome={p.name || p.identity} foto={pessoas.get(p.identity)?.foto}
                      enquadramento={pessoas.get(p.identity)?.enquadramento?.foto}
                      tamanho="huge" extra={rm.falando.has(p.identity) ? 'speaking' : ''} titulo={`${p.name} — clique para o perfil, botão direito para as opções`} />
                  </span>
                ))}
              </div>
              <div className="muted">Só voz por enquanto. Ligue a câmera ou compartilhe a tela.</div>
            </div>
          )}
          {!idle && (focusTile || rm.lives.length > 0) && (
            <div className="focus-layout">
              {focusTile ? (
                <VideoTile
                  tile={focusTile}
                  big
                  preencher={preencher}
                  falando={rm.falando}
                  onClick={focusTile === liveNoPalco ? undefined : () => escolher(focusTile)}
                  controles={focusTile === liveNoPalco ? controlesDe(focusTile) : undefined}
                />
              ) : apagadas.length > 0 ? (
                /* Lives no ar e nenhuma escolhida: quem transmite, grande, com o botão
                   escrito. Era um quadro tracejado pedindo para clicar na faixa de baixo —
                   entrar numa live "não era evidente". */
                <div className="escolher-live">
                  <div className="escolher-live-titulo">
                    {apagadas.length === 1 ? `${apagadas[0].nome} está transmitindo` : `${apagadas.length} pessoas estão transmitindo`}
                  </div>
                  <div className="escolher-live-cartoes">
                    {apagadas.map((l) => (
                      <div key={l.identity} className="escolher-live-cartao">
                        <Avatar nome={l.nome} foto={pessoas.get(l.identity)?.foto}
                          enquadramento={pessoas.get(l.identity)?.enquadramento?.foto} tamanho="huge" />
                        <span className="selo-ao-vivo"><span className="ponto" /> ao vivo</span>
                        <span className="strong">{l.nome}</span>
                        <QuemAssiste espectadores={rm.espectadores.get(l.identity) ?? []} nomes={2} mostrarVazio />
                        <button type="button" className="primary" onClick={() => rm.assistir(l.identity)}>
                          <Icon name="screen" size={16} /> Assistir
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="tile grande-vazio">
                  <div className="muted">
                    <Icon name="screen" size={22} />
                    <div>Clique numa transmissão aqui embaixo para assistir</div>
                  </div>
                </div>
              )}
              {(liveNoPalco || cartoesNaFaixa.length > 0 || rest.length > 0 || audioOnly.length > 0) && (
                <div className="strip">
                  {/* A live que está no palco também fica na faixa, marcada: é assim que se
                      sabe qual das que estão no ar é a que se vê, e para qual se troca. */}
                  {liveNoPalco && nomeDaLiveNoPalco && (
                    <div className="tile live-apagada assistindo" title="Esta é a live que está no palco">
                      <Avatar nome={nomeDaLiveNoPalco} foto={pessoas.get(liveNoPalco.participant.identity)?.foto}
                        enquadramento={pessoas.get(liveNoPalco.participant.identity)?.enquadramento?.foto} tamanho="huge" />
                      <span className="live-quem">
                        <span className="selo-ao-vivo assistindo">assistindo</span>
                        <span className="strong">{nomeDaLiveNoPalco}</span>
                        <QuemAssiste espectadores={rm.espectadores.get(liveNoPalco.participant.identity) ?? []} mostrarVazio={liveNoPalco.local} />
                      </span>
                    </div>
                  )}
                  {cartoesNaFaixa.map((l) => (
                    <button key={l.identity} className="tile live-apagada"
                      title={`Assistir a transmissão de ${l.nome}`}
                      onClick={() => rm.assistir(l.identity)}>
                      <Avatar nome={l.nome} foto={pessoas.get(l.identity)?.foto}
                        enquadramento={pessoas.get(l.identity)?.enquadramento?.foto} tamanho="huge" />
                      <span className="live-quem">
                        <span className="selo-ao-vivo"><span className="ponto" /> ao vivo</span>
                        <span className="strong">{l.nome}</span>
                        {/* Quantos estão vendo entra na MESMA linha do botão: o cartão tem
                            110 px de altura e uma quarta linha ali já saiu por cima do
                            retrato uma vez. */}
                        <span className="live-chamada">
                          <span className="live-assistir"><Icon name="screen" size={13} /> Assistir</span>
                          <QuemAssiste espectadores={rm.espectadores.get(l.identity) ?? []} />
                        </span>
                      </span>
                    </button>
                  ))}
                  {rest.map((t) => <VideoTile key={t.key} tile={t} preencher={preencher} falando={rm.falando} onClick={() => escolher(t)} />)}
                  {audioOnly.map((p) => (
                    <div key={p.identity} className={`tile audio clicavel ${rm.falando.has(p.identity) ? 'speaking' : ''}`}
                      onClick={(e) => onPessoa(p.identity, p.name || p.identity, { x: e.clientX, y: e.clientY }, 'perfil', daCall)}
                      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onPessoa(p.identity, p.name || p.identity, { x: e.clientX, y: e.clientY }, 'acoes', daCall); }}>
                      <Avatar nome={p.name || p.identity} foto={pessoas.get(p.identity)?.foto} enquadramento={pessoas.get(p.identity)?.enquadramento?.foto} tamanho="big" />
                      <div className="tile-label">{p.name || p.identity}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {!idle && !focusTile && rm.lives.length === 0 && rm.tiles.length > 0 && (
            <div className={`grid n${Math.min(rm.tiles.length + audioOnly.length, 9)}`}>
              {rm.tiles.map((t) => <VideoTile key={t.key} tile={t} preencher={preencher} falando={rm.falando} onClick={() => escolher(t)} />)}
              {audioOnly.map((p) => (
                <div key={p.identity} className={`tile audio ${rm.falando.has(p.identity) ? 'speaking' : ''}`}>
                  <Avatar nome={p.name || p.identity} foto={pessoas.get(p.identity)?.foto} enquadramento={pessoas.get(p.identity)?.enquadramento?.foto} tamanho="huge" />
                  <div className="tile-label">{p.name || p.identity}</div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
      )}

      {/* Abriu o chat com uma live rodando: ela continua aqui, pequena, com os controles
          fixos embaixo — volume, voltar ao palco e sair. Eram um "voltar" e um X soltos no
          alto, e o volume só existia no botão direito. */}
      {salaAberta?.tipo === 'texto' && quadroDaLive && <div className="mini-live">{quadroDaLive}</div>}
      {imagemAberta && <VerImagem url={imagemAberta} onClose={() => setImagemAberta(null)} />}
    </main>
  );
}

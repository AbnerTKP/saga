import { useCallback, useEffect, useRef, useState } from 'react';
import { Track } from 'livekit-client';
import type { useRoom, Tile } from '../useRoom';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { MenuDaTela } from './MenuDaTela';
import { VerImagem } from './VerImagem';
import { Chat } from './Chat';
import type { Mensagem, RoomInfo } from '../api';
import type { PessoaNaCall } from './MenuDaPessoa';
import { anotar } from '../registro';

type RM = ReturnType<typeof useRoom>;

function VideoTile({ tile, big, preencher, onClick, onMenu }: {
  tile: Tile; big?: boolean;
  /** Cortar as bordas para ocupar tudo, em vez de deixar tarja preta. */
  preencher?: boolean;
  onClick?: () => void;
  onMenu?: (e: React.MouseEvent) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
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

  return (
    <div
      ref={caixa}
      className={`tile ${big ? 'big' : ''} ${preencher ? 'preencher' : ''} ${tile.participant.isSpeaking && !isScreen ? 'speaking' : ''}`}
      onClick={onClick}
      onDoubleClick={(e) => { e.stopPropagation(); telaCheia(); }}
      onContextMenu={onMenu}
      title={isScreen ? 'Dois cliques: tela cheia. Botão direito: volume e ajuste.' : undefined}
    >
      <video ref={ref} autoPlay playsInline muted className={tile.local && !isScreen ? 'mirror' : ''} />
      <div className="tile-label">
        {isScreen && <Icon name="screen" size={14} />}
        {name}{tile.local ? ' (você)' : ''}{isScreen ? (big ? ' · tela' : ' · assistir') : ''}
      </div>
      {isScreen && (
        <button
          className="tile-expandir"
          title="Tela cheia (dois cliques também)"
          onClick={(e) => { e.stopPropagation(); telaCheia(); }}
          // 'dblclick' é outro evento: sem isto, dois cliques no botão disparam três vezes
          // (click, click e o dblclick subindo até o quadro) e a tela cheia entra e sai.
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <Icon name="expandir" size={16} />
        </button>
      )}
    </div>
  );
}

export function Stage({ rm, pessoas, onPessoa, salaAberta, servidorId, chat, meuId, onVoltarAVoz }: {
  rm: RM;
  pessoas: Map<string, PessoaNaCall>;
  onPessoa: (identity: string, nome: string, em: { x: number; y: number }) => void;
  /** A sala que está sendo olhada. Pode ser de texto mesmo com a voz noutra — ou de
      outro servidor, se a pessoa foi espiar o vizinho sem desligar a call. */
  salaAberta: RoomInfo | null;
  /** O servidor que está sendo olhado, que nem sempre é o da voz. */
  servidorId: number;
  chat: {
    mensagens: Mensagem[];
    erro: string | null;
    enviar: (t: string) => Promise<void>;
    enviarGif: (url: string) => Promise<void>;
  };
  meuId: number;
  /** Volta para a sala de voz em que você está, a partir do chat. */
  onVoltarAVoz?: () => void;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const [menuDaTela, setMenuDaTela] = useState<{ identity: string; nome: string; em: { x: number; y: number } } | null>(null);
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
   * sozinho, e não havia como dizer "quero ESTA". Agora não há palpite: sem clique, todas
   * ficam do mesmo tamanho, esperando.
   *
   * A escolha vale para imagem E som: a que está no palco é a que se vê e a única que se
   * ouve. Sem escolha, palco vazio — e silêncio, que é o que audivel.ts já dizia.
   */
  const screens = rm.tiles.filter((t) => t.source === Track.Source.ScreenShare);

  /**
   * A transmissão escolhida manda no palco. As outras nem chegam — não estão inscritas —,
   * então não há o que mostrar delas além do nome na faixa de cima.
   *
   * Sem escolha, o palco fica com as câmeras; e aí vale o destaque manual de sempre, que
   * é o que permite ampliar a câmera de alguém.
   */
  const liveNoPalco = screens.find((t) => t.participant.identity === rm.assistindo) ?? null;
  const focusTile = liveNoPalco ?? rm.tiles.find((t) => t.key === focus) ?? null;
  const rest = focusTile ? rm.tiles.filter((t) => t.key !== focusTile.key) : rm.tiles;

  /**
   * O que o clique num quadro faz. Numa transmissão, escolher é assistir — e é o som que
   * muda de dono, não só o tamanho. Numa câmera, é só ampliar.
   */
  const escolher = (t: Tile) => {
    if (t.source === Track.Source.ScreenShare) {
      rm.assistir(t.participant.identity === rm.assistindo ? null : t.participant.identity);
      setFocus(null);
      return;
    }
    setFocus(focus === t.key ? null : t.key);
  };

  // Só transmissão tem volume próprio; câmera não carrega áudio separado.
  const menuDaTransmissao = (t: Tile) => (e: React.MouseEvent) => {
    if (t.source !== Track.Source.ScreenShare) return;
    e.preventDefault();
    setMenuDaTela({
      identity: t.participant.identity,
      nome: t.participant.name || t.participant.identity,
      em: { x: e.clientX, y: e.clientY },
    });
  };



  const idle = rm.status === 'idle';
  const audioOnly = rm.participants.filter((p) => !rm.tiles.some((t) => t.participant === p));

  return (
    <main className="stage">
      <header className="stage-head">
        <Icon name={salaAberta?.tipo === 'texto' ? 'texto' : 'speaker'} />
        <span className="strong">{salaAberta?.name ?? rm.salaDaVoz?.nome ?? 'Escolha uma sala'}</span>
        {/* Estando na voz de uma sala e lendo outra, as duas aparecem: senão o topo diz
            "papo" enquanto sua voz está em "Geral", e ninguém entende onde está falando.
            Vale também entre servidores — e aí o nome da sala sozinho não resolve. */}
        {!idle && rm.salaDaVoz && salaAberta && rm.salaDaVoz.id !== salaAberta.id && (
          <span className="muted small na-voz-de">
            <Icon name="speaker" size={13} /> voz em {rm.salaDaVoz.nome}
            {rm.salaDaVoz.servidorId !== servidorId && ` · ${rm.salaDaVoz.servidorNome}`}
          </span>
        )}
      </header>

      {/* O hub das lives. Ele é a resposta a "parei de ver e não achei como voltar": quem
          está transmitindo continua listado aqui mesmo depois de você cortar, e voltar é
          um clique no nome. O controle antigo era um link no topo, geral e sem estado
          visível — cortava todas de uma vez e não dizia de quem eram. */}
      {/* Chat é da sala de chat, e só dela. Ele já morou dentro da sala de voz, dividindo
          espaço com a transmissão — as duas coisas ficavam apertadas e nenhuma inteira.
          Quem está na voz e abre o chat não perde a live: ela vira o quadro flutuante. */}
      {salaAberta?.tipo === 'texto' ? (
        <div className="stage-body so-chat">
          <Chat
            mensagens={chat.mensagens}
            erro={chat.erro}
            onEnviar={chat.enviar}
            onEnviarGif={chat.enviarGif}
            onVerImagem={setImagemAberta}
            sala={salaAberta.name}
            meuId={meuId}
            grande
          />
        </div>
      ) : (
      <div className="stage-body">
        <section className="videos">
          {idle && <div className="empty">Clique numa sala à esquerda para entrar na voz.</div>}
          {!idle && rm.tiles.length === 0 && (
            <div className="empty">
              <div className="avatars">
                {rm.participants.map((p) => (
                  <span
                    key={p.identity}
                    className="clicavel"
                    onClick={(e) => onPessoa(p.identity, p.name || p.identity, { x: e.clientX, y: e.clientY })}
                  >
                    <Avatar nome={p.name || p.identity} foto={pessoas.get(p.identity)?.foto}
                      enquadramento={pessoas.get(p.identity)?.enquadramento?.foto}
                      tamanho="huge" extra={p.isSpeaking ? 'speaking' : ''} titulo={`${p.name} — clique para opções`} />
                  </span>
                ))}
              </div>
              <div className="muted">
                {rm.lives.length > 0
                  ? 'Você parou de ver as lives. Clique num nome ali em cima para voltar.'
                  : 'Só voz por enquanto. Ligue a câmera ou compartilhe a tela.'}
              </div>
            </div>
          )}
          {/* Dois campos: em cima a que você escolheu, embaixo todas, para escolher.
              A escolha é um clique na própria imagem — era em fichas no alto da tela, e
              escolher longe do que se escolhe é o que estava ruim. */}
          {!idle && (focusTile || screens.length > 0) && (
            <div className="focus-layout">
              {focusTile
                ? <VideoTile tile={focusTile} big preencher={preencher} onClick={() => escolher(focusTile)} onMenu={menuDaTransmissao(focusTile)} />
                : (
                  <div className="tile grande-vazio">
                    <div className="muted">
                      <Icon name="screen" size={22} />
                      <div>Clique numa transmissão aqui embaixo para assistir</div>
                    </div>
                  </div>
                )}
              {(rest.length > 0 || audioOnly.length > 0) && (
                <div className="strip">
                  {rest.map((t) => <VideoTile key={t.key} tile={t} preencher={preencher} onClick={() => escolher(t)} onMenu={menuDaTransmissao(t)} />)}
                  {audioOnly.map((p) => (
                    <div key={p.identity} className={`tile audio clicavel ${p.isSpeaking ? 'speaking' : ''}`}
                      onClick={(e) => onPessoa(p.identity, p.name || p.identity, { x: e.clientX, y: e.clientY })}>
                      <Avatar nome={p.name || p.identity} foto={pessoas.get(p.identity)?.foto} enquadramento={pessoas.get(p.identity)?.enquadramento?.foto} tamanho="big" />
                      <div className="tile-label">{p.name || p.identity}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {!idle && !focusTile && screens.length === 0 && rm.tiles.length > 0 && (
            <div className={`grid n${Math.min(rm.tiles.length + audioOnly.length, 9)}`}>
              {rm.tiles.map((t) => <VideoTile key={t.key} tile={t} preencher={preencher} onClick={() => escolher(t)} onMenu={menuDaTransmissao(t)} />)}
              {audioOnly.map((p) => (
                <div key={p.identity} className={`tile audio ${p.isSpeaking ? 'speaking' : ''}`}>
                  <Avatar nome={p.name || p.identity} foto={pessoas.get(p.identity)?.foto} enquadramento={pessoas.get(p.identity)?.enquadramento?.foto} tamanho="huge" />
                  <div className="tile-label">{p.name || p.identity}</div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
      )}

      {/* Abriu o chat com uma live rodando: ela continua aqui, pequena. Sem isto, ir ao
          chat obrigava a voltar na sala de voz para ver de novo quem está transmitindo. */}
      {salaAberta?.tipo === 'texto' && liveNoPalco && (
        <div className="mini-live">
          <div className="mini-live-topo">
            <span className="mini-live-nome">
              <Icon name="screen" size={13} />
              {liveNoPalco.participant.name || liveNoPalco.participant.identity}
            </span>
            {onVoltarAVoz && (
              <button className="link" onClick={onVoltarAVoz} title="Voltar para a sala de voz">
                voltar
              </button>
            )}
          </div>
          <VideoTile tile={liveNoPalco} preencher={preencher} onMenu={menuDaTransmissao(liveNoPalco)} />
        </div>
      )}
      {imagemAberta && <VerImagem url={imagemAberta} onClose={() => setImagemAberta(null)} />}
      {menuDaTela && (
        <MenuDaTela
          nome={menuDaTela.nome}
          em={menuDaTela.em}
          volume={rm.volumeDaTelaDe(menuDaTela.identity)}
          onVolume={(v) => rm.definirVolumeDaTela(menuDaTela.identity, v)}
          preencher={preencher}
          onPreencher={trocarPreencher}
          onClose={() => setMenuDaTela(null)}
        />
      )}
    </main>
  );
}

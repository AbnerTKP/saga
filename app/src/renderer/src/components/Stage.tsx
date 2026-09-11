import { useCallback, useEffect, useRef, useState } from 'react';
import { Track } from 'livekit-client';
import type { useRoom, Tile } from '../useRoom';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { MenuDaTela } from './MenuDaTela';
import { VerImagem } from './VerImagem';
import { Chat } from './Chat';
import { FaixaDoPalco } from './FaixaDoPalco';
import type { Digitando, Mensagem, RoomInfo } from '../api';
import type { LiveNoChat } from '../lives';
import { identidadeDe } from '../pessoas';
import type { PessoaNaCall } from './MenuDaPessoa';
import type { Espectador } from '../espectadores';
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

function VideoTile({ tile, big, preencher, falando, espectadores, onClick, onMenu, onSair }: {
  tile: Tile; big?: boolean;
  /** Parar de assistir: a transmissão deixa de chegar, imagem e som. Só no quadro escolhido. */
  onSair?: () => void;
  /** Cortar as bordas para ocupar tudo, em vez de deixar tarja preta. */
  preencher?: boolean;
  /** Quem está falando agora, medido do som — ver niveis.ts. */
  falando: Set<string>;
  /** Quem está assistindo, quando o quadro é de transmissão. */
  espectadores?: Espectador[];
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
      className={`tile ${big ? 'big' : ''} ${preencher ? 'preencher' : ''} ${falando.has(tile.participant.identity) && !isScreen ? 'speaking' : ''}`}
      onClick={onClick}
      onDoubleClick={(e) => { e.stopPropagation(); telaCheia(); }}
      onContextMenu={onMenu}
      title={isScreen ? 'Dois cliques: tela cheia. Botão direito: volume e ajuste.' : undefined}
    >
      <video ref={ref} autoPlay playsInline muted className={tile.local && !isScreen ? 'mirror' : ''} />
      {isScreen && (
        <QuemAssiste
          espectadores={espectadores ?? []}
          // Dois nomes e o resto contado — "Juninho, Junio e mais 5" —, que é o formato
          // que se lê de relance. A lista inteira vem parando o mouse em cima. Na
          // transmissão dos OUTROS continua só o número: ali o que importa é se tem
          // gente, não quem.
          nomes={big || tile.local ? 2 : 0}
          mostrarVazio={tile.local}
          extra="no-quadro"
        />
      )}
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
      {isScreen && onSair && (
        /* Sair era clicar na própria imagem, e isso ninguém adivinha. O botão fica no canto
           de cima, à direita: embaixo moram o nome e a tela cheia; em cima, à esquerda, quem
           está assistindo. */
        <button
          className="tile-sair"
          onClick={(e) => { e.stopPropagation(); onSair(); }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <Icon name="close" size={13} /> {tile.local ? 'Fechar a prévia' : 'Sair da live'}
        </button>
      )}
    </div>
  );
}

export function Stage({ rm, pessoas, onPessoa, salaAberta, servidorId, chat, meuId, podeApagar, lives, onAssistirLive, onVoltarAVoz }: {
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
  /**
   * As transmissões que estão no ar mas não estão sendo recebidas.
   *
   * Elas não têm faixa, logo não têm quadro — mas precisam continuar na fila de baixo,
   * apagadas, para dar onde clicar. Sem isso, escolher outra viraria adivinhação.
   */
  const apagadas = rm.lives.filter(
    (l) => !rm.tiles.some((t) => t.source === Track.Source.ScreenShare && t.participant.identity === l.identity),
  );

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
  // Quem está no palco é da CALL, e a call pode ser de outro servidor: trocar de servidor
  // não desliga a voz. O cartão dessas pessoas se pergunta ao servidor dela.
  const daCall = rm.salaDaVoz
    ? { servidorId: rm.salaDaVoz.servidorId, servidorNome: rm.salaDaVoz.servidorNome }
    : undefined;
  const audioOnly = rm.participants.filter((p) => !rm.tiles.some((t) => t.participant === p));

  return (
    <main className="stage">
      <header className="stage-head">
        <Icon name={salaAberta?.tipo === 'texto' ? 'texto' : 'speaker'} />
        <span className="strong">{salaAberta?.name ?? rm.salaDaVoz?.nome ?? 'Escolha uma sala'}</span>
      </header>

      {/* Estando na voz de uma sala e lendo outra, a call fica à mostra aqui em cima: quem
          está nela, quantas telas no ar, e o caminho de volta num clique. Era uma linha de
          texto no cabeçalho ("voz em Geral") que não dizia nem quem estava lá. Não aparece
          na própria sala de voz — ali o palco já está na tela. */}
      {!idle && rm.salaDaVoz && salaAberta && rm.salaDaVoz.id !== salaAberta.id && (
        <FaixaDoPalco
          sala={rm.salaDaVoz}
          participantes={rm.participants.map((p) => ({ identity: p.identity, nome: p.name || p.identity }))}
          pessoas={pessoas}
          transmitindo={rm.lives.length}
          servidorAberto={servidorId}
          onAbrir={onVoltarAVoz}
        />
      )}

      {/* Chat é da sala de chat, e só dela. Ele já morou dentro da sala de voz, dividindo
          espaço com a transmissão — as duas coisas ficavam apertadas e nenhuma inteira.
          Quem está na voz e abre o chat não perde a live: ela vira o quadro flutuante. */}
      {salaAberta?.tipo === 'texto' ? (
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
            sala={salaAberta.name}
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
          {!idle && rm.tiles.length === 0 && (
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
          {/* Dois campos: em cima a que você escolheu, embaixo todas, para escolher.
              A escolha é um clique na própria imagem — era em fichas no alto da tela, e
              escolher longe do que se escolhe é o que estava ruim. */}
          {!idle && (focusTile || rm.lives.length > 0) && (
            <div className="focus-layout">
              {focusTile
                ? <VideoTile tile={focusTile} big preencher={preencher} falando={rm.falando} espectadores={rm.espectadores.get(focusTile.participant.identity)} onClick={() => escolher(focusTile)} onMenu={menuDaTransmissao(focusTile)}
                    onSair={focusTile === liveNoPalco ? () => rm.assistir(null) : undefined} />
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
                  {rest.map((t) => <VideoTile key={t.key} tile={t} preencher={preencher} falando={rm.falando} espectadores={rm.espectadores.get(t.participant.identity)} onClick={() => escolher(t)} onMenu={menuDaTransmissao(t)} />)}
                  {apagadas.map((l) => (
                    <button key={l.identity} className="tile live-apagada"
                      title={`Assistir a transmissão de ${l.nome}`}
                      onClick={() => rm.assistir(l.identity)}>
                      <Avatar nome={l.nome} foto={pessoas.get(l.identity)?.foto}
                        enquadramento={pessoas.get(l.identity)?.enquadramento?.foto} tamanho="huge" />
                      <span className="live-quem">
                        <span className="selo-ao-vivo"><span className="ponto" /> ao vivo</span>
                        <span className="strong">{l.nome}</span>
                        {/* Quantos estão vendo entra na MESMA linha do "assistir": o cartão
                          tem 110 px de altura e uma quarta linha ali já saiu por cima do
                          retrato uma vez. */}
                      <span className="live-chamada">
                        <Icon name="screen" size={13} /> assistir
                        <QuemAssiste espectadores={rm.espectadores.get(l.identity) ?? []} />
                      </span>
                      </span>
                    </button>
                  ))}
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
              {rm.tiles.map((t) => <VideoTile key={t.key} tile={t} preencher={preencher} falando={rm.falando} espectadores={rm.espectadores.get(t.participant.identity)} onClick={() => escolher(t)} onMenu={menuDaTransmissao(t)} />)}
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
            {/* O X do quadro flutuante é sair da live: fechá-lo e continuar recebendo a
                transmissão escondida seria gastar banda e som com nada. */}
            <button className="mini-live-sair" onClick={() => rm.assistir(null)}
              title={liveNoPalco.local ? 'Fechar a prévia' : 'Sair da live'}>
              <Icon name="close" size={14} />
            </button>
          </div>
          <VideoTile tile={liveNoPalco} preencher={preencher} falando={rm.falando} espectadores={rm.espectadores.get(liveNoPalco.participant.identity)} onMenu={menuDaTransmissao(liveNoPalco)} />
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

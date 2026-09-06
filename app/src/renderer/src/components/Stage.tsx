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
  const telaCheia = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else caixa.current?.requestFullscreen().catch(() => undefined);
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
        {name}{tile.local ? ' (você)' : ''}{isScreen ? ' · tela' : ''}
      </div>
      {isScreen && (
        <button
          className="tile-expandir"
          title="Tela cheia (dois cliques também)"
          onClick={(e) => { e.stopPropagation(); telaCheia(); }}
        >
          <Icon name="expandir" size={16} />
        </button>
      )}
    </div>
  );
}

export function Stage({ rm, pessoas, onPessoa, salaAberta, chat, meuId }: {
  rm: RM;
  pessoas: Map<string, PessoaNaCall>;
  onPessoa: (identity: string, nome: string, em: { x: number; y: number }) => void;
  /** A sala que está sendo olhada. Pode ser de texto mesmo com a voz noutra. */
  salaAberta: RoomInfo | null;
  chat: {
    mensagens: Mensagem[];
    erro: string | null;
    enviar: (t: string) => Promise<void>;
    enviarGif: (url: string) => Promise<void>;
  };
  meuId: number;
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





  // Foca automaticamente a primeira tela compartilhada que aparecer
  const screens = rm.tiles.filter((t) => t.source === Track.Source.ScreenShare);
  const focusTile = rm.tiles.find((t) => t.key === focus) ?? (screens[0] ?? null);
  const rest = focusTile ? rm.tiles.filter((t) => t.key !== focusTile.key) : rm.tiles;

  // O áudio segue o destaque: só a transmissão em foco é ouvida.
  const identidadeEmFoco = focusTile?.source === Track.Source.ScreenShare
    ? focusTile.participant.identity
    : null;
  useEffect(() => { rm.definirFocoDaTela(identidadeEmFoco); }, [identidadeEmFoco, rm]);

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
        <Icon name="speaker" />
        <span className="strong">{salaAberta?.name ?? rm.roomName ?? 'Escolha uma sala'}</span>
        {salaAberta?.tipo === 'voz' && rm.status !== 'idle' && (
          <button
            className={`link ${rm.semTransmissoes ? 'ligado' : ''}`}
            title={rm.semTransmissoes
              ? 'Voltar a receber as transmissões'
              : 'Parar de receber transmissões — economiza banda, não só esconde'}
            onClick={rm.alternarTransmissoes}
          >
            {rm.semTransmissoes ? 'assistir de novo' : 'não assistir'}
          </button>
        )}

      </header>

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
              <div className="muted">Só voz por enquanto. Ligue a câmera ou compartilhe a tela.</div>
            </div>
          )}
          {!idle && focusTile && (
            <div className="focus-layout">
              <VideoTile tile={focusTile} big preencher={preencher} onClick={() => setFocus(null)} onMenu={menuDaTransmissao(focusTile)} />
              {(rest.length > 0 || audioOnly.length > 0) && (
                <div className="strip">
                  {rest.map((t) => <VideoTile key={t.key} tile={t} preencher={preencher} onClick={() => setFocus(t.key)} onMenu={menuDaTransmissao(t)} />)}
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
          {!idle && !focusTile && rm.tiles.length > 0 && (
            <div className={`grid n${Math.min(rm.tiles.length + audioOnly.length, 9)}`}>
              {rm.tiles.map((t) => <VideoTile key={t.key} tile={t} preencher={preencher} onClick={() => setFocus(t.key)} onMenu={menuDaTransmissao(t)} />)}
              {audioOnly.map((p) => (
                <div key={p.identity} className={`tile audio ${p.isSpeaking ? 'speaking' : ''}`}>
                  <Avatar nome={p.name || p.identity} foto={pessoas.get(p.identity)?.foto} enquadramento={pessoas.get(p.identity)?.enquadramento?.foto} tamanho="huge" />
                  <div className="tile-label">{p.name || p.identity}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <Chat
          mensagens={chat.mensagens}
          erro={chat.erro}
          onEnviar={chat.enviar}
          onEnviarGif={chat.enviarGif}
          onVerImagem={setImagemAberta}
          sala={salaAberta?.name ?? null}
          meuId={meuId}
        />
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

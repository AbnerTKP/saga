import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Track } from 'livekit-client';
import type { useRoom, Tile } from '../useRoom';
import { Icon } from './Icon';

type RM = ReturnType<typeof useRoom>;

function VideoTile({ tile, big, onClick }: { tile: Tile; big?: boolean; onClick?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    tile.track.attach(el);
    return () => { tile.track.detach(el); };
  }, [tile.track]);
  const name = tile.participant.name || tile.participant.identity;
  const isScreen = tile.source === Track.Source.ScreenShare;
  return (
    <div className={`tile ${big ? 'big' : ''} ${tile.participant.isSpeaking && !isScreen ? 'speaking' : ''}`} onClick={onClick}>
      <video ref={ref} autoPlay playsInline muted className={tile.local && !isScreen ? 'mirror' : ''} />
      <div className="tile-label">
        {isScreen && <Icon name="screen" size={14} />}
        {name}{tile.local ? ' (você)' : ''}{isScreen ? ' · tela' : ''}
      </div>
    </div>
  );
}

export function Stage({ rm }: { rm: RM }) {
  const [focus, setFocus] = useState<string | null>(null);
  const [text, setText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [rm.messages.length]);

  // Foca automaticamente a primeira tela compartilhada que aparecer
  const screens = rm.tiles.filter((t) => t.source === Track.Source.ScreenShare);
  const focusTile = rm.tiles.find((t) => t.key === focus) ?? (screens[0] ?? null);
  const rest = focusTile ? rm.tiles.filter((t) => t.key !== focusTile.key) : rm.tiles;

  const send = (e: FormEvent) => { e.preventDefault(); rm.sendMessage(text); setText(''); };

  const idle = rm.status === 'idle';
  const audioOnly = rm.participants.filter((p) => !rm.tiles.some((t) => t.participant === p));

  return (
    <main className="stage">
      <header className="stage-head">
        <Icon name="speaker" />
        <span className="strong">{rm.roomName ?? 'Escolha uma sala'}</span>
        {rm.error && (
          <span className="error inline">
            {rm.error} <button className="link" onClick={() => rm.setError(null)}>fechar</button>
          </span>
        )}
      </header>

      <div className="stage-body">
        <section className="videos">
          {idle && <div className="empty">Clique numa sala à esquerda para entrar na voz.</div>}
          {!idle && rm.tiles.length === 0 && (
            <div className="empty">
              <div className="avatars">
                {rm.participants.map((p) => (
                  <div key={p.identity} className={`avatar huge ${p.isSpeaking ? 'speaking' : ''}`} title={p.name}>{(p.name || p.identity).slice(0, 1).toUpperCase()}</div>
                ))}
              </div>
              <div className="muted">Só voz por enquanto. Ligue a câmera ou compartilhe a tela.</div>
            </div>
          )}
          {!idle && focusTile && (
            <div className="focus-layout">
              <VideoTile tile={focusTile} big onClick={() => setFocus(null)} />
              {(rest.length > 0 || audioOnly.length > 0) && (
                <div className="strip">
                  {rest.map((t) => <VideoTile key={t.key} tile={t} onClick={() => setFocus(t.key)} />)}
                  {audioOnly.map((p) => (
                    <div key={p.identity} className={`tile audio ${p.isSpeaking ? 'speaking' : ''}`}>
                      <span className="avatar big">{(p.name || p.identity).slice(0, 1).toUpperCase()}</span>
                      <div className="tile-label">{p.name || p.identity}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {!idle && !focusTile && rm.tiles.length > 0 && (
            <div className={`grid n${Math.min(rm.tiles.length + audioOnly.length, 9)}`}>
              {rm.tiles.map((t) => <VideoTile key={t.key} tile={t} onClick={() => setFocus(t.key)} />)}
              {audioOnly.map((p) => (
                <div key={p.identity} className={`tile audio ${p.isSpeaking ? 'speaking' : ''}`}>
                  <span className="avatar huge">{(p.name || p.identity).slice(0, 1).toUpperCase()}</span>
                  <div className="tile-label">{p.name || p.identity}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="chat">
          <div className="chat-head">Chat da sala</div>
          <div className="chat-log" ref={logRef}>
            {rm.messages.length === 0 && <div className="muted small pad">Mensagens somem quando todo mundo sai da sala.</div>}
            {rm.messages.map((m) => (
              <div key={m.id} className={`msg ${m.mine ? 'mine' : ''}`}>
                <span className="from">{m.from}</span>
                <span className="time">{new Date(m.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                <div className="text">{m.text}</div>
              </div>
            ))}
          </div>
          <form className="chat-input" onSubmit={send}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={idle ? 'Entre numa sala para conversar' : `Mensagem em ${rm.roomName}`} disabled={idle} maxLength={2000} />
            <button disabled={idle || !text.trim()} title="Enviar"><Icon name="send" size={18} /></button>
          </form>
        </aside>
      </div>
    </main>
  );
}

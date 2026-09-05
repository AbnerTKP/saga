import type { Membro, RoomInfo, Servidor } from '../api';
import type { useRoom } from '../useRoom';
import { Icon } from './Icon';
import { Avatar } from './Avatar';

type RM = ReturnType<typeof useRoom>;

export function Sidebar({ rooms, pollError, eu, servidor, rm, fotos, onJoin, onShare, onSettings, onPainel, onLogout }: {
  rooms: RoomInfo[]; pollError: string | null; eu: Membro; servidor: Servidor; rm: RM;
  onJoin: (room: string) => void; onShare: () => void; onSettings: () => void;
  fotos: Map<string, string | null>;
  onPainel: () => void; onLogout: () => void;
}) {
  const connected = rm.status !== 'idle';
  const isMac = window.desktop.platform === 'darwin';

  return (
    <aside className="sidebar">
      <div className={`sidebar-head ${isMac ? 'mac' : ''}`}>
        <span title={servidor.nome}>{servidor.nome}</span>
        {pollError && <span className="dot-warn" title={pollError} />}
      </div>

      <div className="rooms">
        {rooms.map((r) => {
          const live = rm.roomName === r.name;
          const people = live
            ? rm.participants.map((p) => ({
                identity: p.identity, name: p.name || p.identity, foto: fotos.get(p.identity) ?? null,
                speaking: p.isSpeaking, muted: !p.isMicrophoneEnabled, camera: p.isCameraEnabled, screen: p.isScreenShareEnabled,
              }))
            : r.participants.map((p) => ({ ...p, foto: p.foto ?? null, speaking: false }));
          return (
            <div key={r.name} className="room-block">
              <button className={`room ${live ? 'active' : ''}`} onClick={() => onJoin(r.name)} disabled={rm.status === 'connecting'}>
                <Icon name="speaker" /> <span>{r.name}</span>
                {people.length > 0 && <span className="count">{people.length}</span>}
              </button>
              <ul className="people">
                {people.map((p) => (
                  <li key={p.identity} className={p.speaking ? 'speaking' : ''}>
                    <Avatar nome={p.name} foto={p.foto} />
                    <span className="pname">{p.name}</span>
                    <span className="pico">
                      {p.screen && <Icon name="screen" />}
                      {p.camera && <Icon name="camera" />}
                      {p.muted && <Icon name="micOff" />}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {rooms.length === 0 && <div className="muted small pad">Nenhuma sala configurada no servidor.</div>}
      </div>

      {connected && (
        <div className="voice-panel">
          <div className="voice-status">
            <span className={`dot ${rm.status === 'connected' ? 'ok' : 'warn'}`} />
            <div>
              <div className="strong">{rm.status === 'connected' ? 'Voz conectada' : rm.status === 'reconnecting' ? 'Reconectando…' : 'Conectando…'}</div>
              <div className="small muted">{rm.roomName}</div>
            </div>
          </div>
          <div className="voice-actions">
            <button className={rm.camOn ? 'on' : ''} onClick={rm.toggleCam} title="Câmera"><Icon name="camera" /></button>
            <button className={rm.screenOn ? 'on' : ''} onClick={onShare} title={rm.screenOn ? 'Parar de compartilhar' : 'Compartilhar tela'}><Icon name="screen" /></button>
            <button className="danger" onClick={rm.leave} title="Desconectar"><Icon name="hangup" /></button>
          </div>
        </div>
      )}

      <div className="user-panel">
        <Avatar nome={eu.nome} foto={eu.foto} tamanho="big" />
        <div className="uname">
          <div className="strong" title={`${eu.cargoNome} · entra como ${eu.apelido}`}>{eu.nome}</div>
          <button className="link" onClick={onLogout}>sair</button>
        </div>
        <div className="user-actions">
          <button className={!rm.micOn && connected ? 'off' : ''} onClick={rm.toggleMic} disabled={!connected || rm.deafened} title="Mutar microfone">
            <Icon name={rm.micOn || !connected ? 'mic' : 'micOff'} />
          </button>
          <button className={rm.deafened ? 'off' : ''} onClick={rm.toggleDeafen} title="Ensurdecer">
            <Icon name={rm.deafened ? 'headOff' : 'head'} />
          </button>
          <button onClick={onPainel} title="Pessoas e servidor"><Icon name="pessoas" /></button>
          <button onClick={onSettings} title="Dispositivos"><Icon name="gear" /></button>
        </div>
      </div>
    </aside>
  );
}

import type { RoomInfo } from '../api';
import type { useRoom } from '../useRoom';
import { Icon } from './Icon';

type RM = ReturnType<typeof useRoom>;

export function Sidebar({ rooms, pollError, me, rm, onJoin, onShare, onSettings, onLogout }: {
  rooms: RoomInfo[]; pollError: string | null; me: string; rm: RM;
  onJoin: (room: string) => void; onShare: () => void; onSettings: () => void; onLogout: () => void;
}) {
  const connected = rm.status !== 'idle';
  const isMac = window.desktop.platform === 'darwin';

  return (
    <aside className="sidebar">
      <div className={`sidebar-head ${isMac ? 'mac' : ''}`}>
        <span>Salas de voz</span>
        {pollError && <span className="dot-warn" title={pollError} />}
      </div>

      <div className="rooms">
        {rooms.map((r) => {
          const live = rm.roomName === r.name;
          const people = live
            ? rm.participants.map((p) => ({
                identity: p.identity, name: p.name || p.identity,
                speaking: p.isSpeaking, muted: !p.isMicrophoneEnabled, camera: p.isCameraEnabled, screen: p.isScreenShareEnabled,
              }))
            : r.participants.map((p) => ({ ...p, speaking: false }));
          return (
            <div key={r.name} className="room-block">
              <button className={`room ${live ? 'active' : ''}`} onClick={() => onJoin(r.name)} disabled={rm.status === 'connecting'}>
                <Icon name="speaker" /> <span>{r.name}</span>
                {people.length > 0 && <span className="count">{people.length}</span>}
              </button>
              <ul className="people">
                {people.map((p) => (
                  <li key={p.identity} className={p.speaking ? 'speaking' : ''}>
                    <span className="avatar">{p.name.slice(0, 1).toUpperCase()}</span>
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
        <span className="avatar big">{me.slice(0, 1).toUpperCase()}</span>
        <div className="uname">
          <div className="strong">{me}</div>
          <button className="link" onClick={onLogout}>sair</button>
        </div>
        <div className="user-actions">
          <button className={!rm.micOn && connected ? 'off' : ''} onClick={rm.toggleMic} disabled={!connected || rm.deafened} title="Mutar microfone">
            <Icon name={rm.micOn || !connected ? 'mic' : 'micOff'} />
          </button>
          <button className={rm.deafened ? 'off' : ''} onClick={rm.toggleDeafen} title="Ensurdecer">
            <Icon name={rm.deafened ? 'headOff' : 'head'} />
          </button>
          <button onClick={onSettings} title="Dispositivos"><Icon name="gear" /></button>
        </div>
      </div>
    </aside>
  );
}

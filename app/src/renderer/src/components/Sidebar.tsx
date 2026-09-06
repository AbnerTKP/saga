import type { Membro, RoomInfo, Servidor } from '../api';
import type { useRoom } from '../useRoom';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { Nome } from './Nome';
import { Sinal } from './Sinal';
import type { PessoaNaCall } from './MenuDaPessoa';

type RM = ReturnType<typeof useRoom>;

export function Sidebar({ rooms, pollError, eu, servidor, rm, pessoas, onPessoa, onAbrir, salaAbertaId, onShare, onSettings, onPainel, onSoundboard, onLogout }: {
  rooms: RoomInfo[]; pollError: string | null; eu: Membro; servidor: Servidor; rm: RM;
  onAbrir: (sala: RoomInfo) => void;
  salaAbertaId: number | null; onShare: () => void; onSettings: () => void;
  pessoas: Map<string, PessoaNaCall>;
  onPessoa: (identity: string, nome: string, em: { x: number; y: number }) => void;
  onPainel: () => void; onSoundboard: () => void; onLogout: () => void;
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
          const live = rm.salaDaVoz?.id === r.id;
          const people = live
            ? rm.participants.map((p) => ({
                identity: p.identity, name: p.name || p.identity,
                foto: pessoas.get(p.identity)?.foto ?? null,
                enquadramento: pessoas.get(p.identity)?.enquadramento,
                turbo: pessoas.get(p.identity)?.turbo ?? false,
                idExibido: pessoas.get(p.identity)?.idExibido ?? null,
                speaking: p.isSpeaking, muted: !p.isMicrophoneEnabled, camera: p.isCameraEnabled, screen: p.isScreenShareEnabled,
              }))
            : r.participants.map((p) => ({
                ...p, foto: p.foto ?? null, enquadramento: p.enquadramento, turbo: p.turbo ?? false,
                idExibido: p.idExibido ?? null, speaking: false,
              }));
          return (
            <div key={r.name} className="room-block">
              <button
                className={`room ${live ? 'active' : ''} ${salaAbertaId === r.id ? 'aberta' : ''} ${r.naoLidas > 0 ? 'nova' : ''}`}
                onClick={() => onAbrir(r)}
                disabled={rm.status === 'connecting'}
              >
                <Icon name={r.tipo === 'texto' ? 'texto' : 'speaker'} /> <span>{r.name}</span>
                {/* Sem isto a sala de texto só era vista por quem lembrava de abrir. */}
                {r.naoLidas > 0 && (
                  <span className="nao-lidas" title={`${r.naoLidas} ${r.naoLidas === 1 ? 'mensagem nova' : 'mensagens novas'}`}>
                    {r.naoLidas > 99 ? '99+' : r.naoLidas}
                  </span>
                )}
                {people.length > 0 && <span className="count">{people.length}</span>}
              </button>
              <ul className="people">
                {people.map((p) => (
                  <li
                    key={p.identity}
                    className={`clicavel ${p.speaking ? 'speaking' : ''}`}
                    title={`${p.name} — clique para opções`}
                    onClick={(e) => onPessoa(p.identity, p.name, { x: e.clientX, y: e.clientY })}
                  >
                    <Avatar nome={p.name} foto={p.foto} enquadramento={p.enquadramento?.foto} />
                    <span className="pname"><Nome nome={p.name} id={p.idExibido} turbo={p.turbo} /></span>
                    <span className="pico">
                      {p.turbo && <span className="raio-turbo" title="Berserk"><Icon name="raio" size={13} /></span>}
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
            <div className="voice-texto">
              <div className="strong">{rm.status === 'connected' ? 'Voz conectada' : rm.status === 'reconnecting' ? 'Reconectando…' : 'Conectando…'}</div>
              {/* Com a voz noutro servidor, dizer só o nome da sala esconde metade do
                  fato: "Geral" de qual? */}
              <div className="small muted">
                {rm.salaDaVoz?.nome}
                {rm.salaDaVoz && rm.salaDaVoz.servidorId !== servidor.id && ` · em ${rm.salaDaVoz.servidorNome}`}
              </div>
            </div>
            {rm.status === 'connected' && <Sinal qualidade={rm.room.localParticipant.connectionQuality} />}
          </div>
          <div className="voice-actions">
            <button className={rm.camOn ? 'on' : ''} onClick={rm.toggleCam} title="Câmera"><Icon name="camera" /></button>
            <button className={rm.screenOn ? 'on' : ''} onClick={onShare} title={rm.screenOn ? 'Parar de compartilhar' : 'Compartilhar tela'}><Icon name="screen" /></button>
            <button onClick={onSoundboard} title="Soundboard"><Icon name="speaker" /></button>
            <button className="danger" onClick={rm.leave} title="Desconectar"><Icon name="hangup" /></button>
          </div>
        </div>
      )}

      <div className="user-panel">
        <Avatar nome={eu.nome} foto={eu.foto} enquadramento={eu.enquadramento?.foto} tamanho="big" />
        <div className="uname">
          <div className="strong" title={`${eu.cargoNome} · entra como ${eu.apelido}`}>
            <Nome membro={eu} />
          </div>
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

import { useCallback, useEffect, useState } from 'react';
import { fetchRooms, fetchToken, normalizeServer, SERVIDOR, type RoomInfo } from './api';
import { useRoom } from './useRoom';
import { ConnectScreen, type Settings } from './components/ConnectScreen';
import { Sidebar } from './components/Sidebar';
import { Stage } from './components/Stage';
import { ScreenPicker } from './components/ScreenPicker';
import { DeviceSettings } from './components/DeviceSettings';
import { UpdateToast } from './components/UpdateToast';

const KEY = 'cantinho.settings';

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignora */ }
  return { password: '', name: '' };
}

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [entered, setEntered] = useState(false);
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [pollError, setPollError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [devices, setDevices] = useState(false);
  const rm = useRoom();

  const server = normalizeServer(SERVIDOR);

  const enter = useCallback(async (s: Settings) => {
    const list = await fetchRooms(normalizeServer(SERVIDOR), s.password);
    localStorage.setItem(KEY, JSON.stringify(s));
    setSettings(s);
    setRooms(list);
    setEntered(true);
  }, []);

  // Atualiza quem está em cada sala
  useEffect(() => {
    if (!entered) return;
    let alive = true;
    const tick = async () => {
      try {
        const list = await fetchRooms(server, settings.password);
        if (alive) { setRooms(list); setPollError(null); }
      } catch (e) {
        if (alive) setPollError((e as Error).message);
      }
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(id); };
  }, [entered, server, settings.password]);

  const joinRoom = useCallback(async (name: string) => {
    if (rm.roomName === name) return;
    try {
      const { url, token } = await fetchToken(server, settings.password, settings.name, name);
      await rm.join(url, token, name);
    } catch (e) {
      rm.setError((e as Error).message);
    }
  }, [rm, server, settings]);

  const logout = useCallback(async () => {
    await rm.leave();
    setEntered(false);
  }, [rm]);

  if (!entered) {
    return (
      <>
        <ConnectScreen initial={settings} onEnter={enter} />
        <UpdateToast />
      </>
    );
  }

  return (
    <div className="app">
      <Sidebar
        rooms={rooms}
        pollError={pollError}
        me={settings.name}
        rm={rm}
        onJoin={joinRoom}
        onShare={() => (rm.screenOn ? rm.stopScreen() : setPicker(true))}
        onSettings={() => setDevices(true)}
        onLogout={logout}
      />
      <Stage rm={rm} />
      {picker && (
        <ScreenPicker
          onClose={() => setPicker(false)}
          onPick={async (id, audio) => {
            setPicker(false);
            try { await rm.startScreen(id, audio); } catch (e) { rm.setError(`Tela: ${(e as Error).message}`); }
          }}
        />
      )}
      {devices && <DeviceSettings room={rm.room} onClose={() => setDevices(false)} />}
      <UpdateToast />
    </div>
  );
}

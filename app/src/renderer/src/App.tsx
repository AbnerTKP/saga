import { useCallback, useEffect, useState } from 'react';
import {
  buscarSalas, pedirTokenDaSala, quemSou, sair, lerToken, guardarToken,
  type RoomInfo, type Sessao, type Membro, type Servidor,
} from './api';
import { useRoom } from './useRoom';
import { ConnectScreen } from './components/ConnectScreen';
import { Sidebar } from './components/Sidebar';
import { Stage } from './components/Stage';
import { ScreenPicker } from './components/ScreenPicker';
import { DeviceSettings } from './components/DeviceSettings';
import { UpdateToast } from './components/UpdateToast';
import { PainelDoServidor } from './components/PainelDoServidor';
import { Versao } from './components/Versao';

// Guardado só para preencher o campo na próxima vez; a sessão em si é o token.
const ULTIMO_APELIDO = 'cantinho.apelido';

export function App() {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [conferindo, setConferindo] = useState(!!lerToken());
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [pollError, setPollError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [devices, setDevices] = useState(false);
  const [painel, setPainel] = useState(false);
  const rm = useRoom();

  // Abrir já logado: se existe um crachá guardado, pergunta ao servidor se ainda vale.
  // Ele pode não valer mais — a pessoa foi expulsa ou banida enquanto o app estava fechado.
  useEffect(() => {
    if (!lerToken()) return;
    let vivo = true;
    quemSou()
      .then((r) => { if (vivo) setSessao({ token: lerToken()!, ...r }); })
      .catch(() => { guardarToken(null); })
      .finally(() => { if (vivo) setConferindo(false); });
    return () => { vivo = false; };
  }, []);

  const entrou = useCallback((s: Sessao) => {
    try { localStorage.setItem(ULTIMO_APELIDO, s.eu.apelido); } catch { /* sem storage */ }
    setSessao(s);
  }, []);

  // Quem está em cada sala
  useEffect(() => {
    if (!sessao) return;
    let vivo = true;
    const tick = async () => {
      try {
        const lista = await buscarSalas();
        if (vivo) { setRooms(lista); setPollError(null); }
      } catch (e) {
        if (!vivo) return;
        // Sessão derrubada com o app aberto (expulso ou banido): volta para o login.
        if ((e as { status?: number }).status === 401) { guardarToken(null); setSessao(null); return; }
        setPollError((e as Error).message);
      }
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => { vivo = false; clearInterval(id); };
  }, [sessao]);

  const joinRoom = useCallback(async (nome: string) => {
    if (rm.roomName === nome) return;
    try {
      const { url, token } = await pedirTokenDaSala(nome);
      await rm.join(url, token, nome);
    } catch (e) {
      rm.setError((e as Error).message);
    }
  }, [rm]);

  const logout = useCallback(async () => {
    await rm.leave();
    await sair().catch(() => undefined);
    guardarToken(null);
    setSessao(null);
    setRooms([]);
  }, [rm]);

  const atualizarEu = useCallback((eu: Membro) => setSessao((s) => (s ? { ...s, eu } : s)), []);
  const atualizarServidor = useCallback((servidor: Servidor) => setSessao((s) => (s ? { ...s, servidor } : s)), []);

  if (conferindo) return <div className="carregando">Entrando…</div>;

  if (!sessao) {
    let ultimo = '';
    try { ultimo = localStorage.getItem(ULTIMO_APELIDO) ?? ''; } catch { /* sem storage */ }
    return (
      <>
        <ConnectScreen apelidoInicial={ultimo} onPronto={entrou} />
        <UpdateToast />
        <Versao />
      </>
    );
  }

  return (
    <div className="app">
      <Sidebar
        rooms={rooms}
        pollError={pollError}
        eu={sessao.eu}
        servidor={sessao.servidor}
        rm={rm}
        onJoin={joinRoom}
        onShare={() => (rm.screenOn ? rm.stopScreen() : setPicker(true))}
        onSettings={() => setDevices(true)}
        onPainel={() => setPainel(true)}
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
      {painel && (
        <PainelDoServidor
          eu={sessao.eu}
          servidor={sessao.servidor}
          onEu={atualizarEu}
          onServidor={atualizarServidor}
          onClose={() => setPainel(false)}
        />
      )}
      <UpdateToast />
      <Versao />
    </div>
  );
}

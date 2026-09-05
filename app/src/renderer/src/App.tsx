import { useCallback, useEffect, useState } from 'react';
import {
  buscarSalas, pedirTokenDaSala, quemSou, sair, lerToken, guardarToken, moderar,
  type Acao,
  type RoomInfo, type Sessao, type Membro, type Servidor,
} from './api';
import { useRoom } from './useRoom';
import { ConnectScreen } from './components/ConnectScreen';
import { Sidebar } from './components/Sidebar';
import { Stage } from './components/Stage';
import { ScreenPicker } from './components/ScreenPicker';
import { DeviceSettings } from './components/DeviceSettings';
import { UpdateToast } from './components/UpdateToast';
import { TelaDeAtualizacao } from './components/TelaDeAtualizacao';
import { PainelDoServidor } from './components/PainelDoServidor';
import { Soundboard } from './components/Soundboard';
import { MenuDaPessoa, type PessoaNaCall } from './components/MenuDaPessoa';
import { RegistroDeErros } from './components/RegistroDeErros';
import { Versao } from './components/Versao';
import type { UpdateState } from './desktop';

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
  const [soundboard, setSoundboard] = useState(false);
  const [registro, setRegistro] = useState(false);
  const [seletorDoSistema, setSeletorDoSistema] = useState(false);
  const [menu, setMenu] = useState<{ pessoa: PessoaNaCall; em: { x: number; y: number } } | null>(null);
  const [atualizacao, setAtualizacao] = useState<UpdateState>({ fase: 'procurando' });
  // A tela de partida só aparece na primeira consulta. Depois disso, versão nova chega
  // pelo aviso no canto, sem interromper quem está no meio de uma conversa.
  const [partidaResolvida, setPartidaResolvida] = useState(false);

  useEffect(() => {
    const aplicar = (s: UpdateState) => {
      setAtualizacao(s);
      if (s.fase === 'nenhuma' || s.fase === 'aviso') setPartidaResolvida(true);
    };
    window.desktop.updateAtual().then((s) => { if (s) aplicar(s); });
    window.desktop.onUpdate(aplicar);
  }, []);
  const rm = useRoom();

  useEffect(() => { window.desktop.usaSeletorDoSistema().then(setSeletorDoSistema).catch(() => undefined); }, []);

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

  // Identidade -> quem é a pessoa, montado do que o servidor manda. O LiveKit sabe quem
  // está falando mas não sabe de foto nem de cargo; a barra lateral, o palco e o menu
  // precisam das duas coisas, então o mapa é montado aqui, uma vez.
  const pessoas = new Map<string, PessoaNaCall>();
  for (const sala of rooms) {
    for (const p of sala.participants) {
      pessoas.set(p.identity, {
        identity: p.identity, nome: p.name, usuarioId: p.usuarioId, cargo: p.cargo, foto: p.foto ?? null,
      });
    }
  }

  const abrirMenu = useCallback((identity: string, nome: string, em: { x: number; y: number }) => {
    setMenu({ pessoa: pessoas.get(identity) ?? { identity, nome }, em });
  // pessoas é remontado a cada render; depender dele aqui só criaria a função à toa.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms]);

  const moderarPeloMenu = useCallback(async (alvo: number, acao: Acao, extra?: { minutos?: number; cargo?: number }) => {
    try { await moderar(acao, alvo, extra); } catch (e) { rm.setError((e as Error).message); }
  }, [rm]);

  // No Mac quem escolhe a janela é o próprio sistema, então abrir o nosso seletor
  // significaria escolher duas vezes. No Windows ele continua sendo o caminho.
  const compartilhar = useCallback(async () => {
    if (rm.screenOn) return rm.stopScreen();
    if (!seletorDoSistema) return setPicker(true);
    try { await rm.startScreen(null, true); } catch (e) { rm.setError(`Tela: ${(e as Error).message}`); }
  }, [rm, seletorDoSistema]);

  const atualizarEu = useCallback((eu: Membro) => setSessao((s) => (s ? { ...s, eu } : s)), []);
  const atualizarServidor = useCallback((servidor: Servidor) => setSessao((s) => (s ? { ...s, servidor } : s)), []);

  // Atualizar vem antes de tudo: não faz sentido entrar numa conta para reiniciar em seguida.
  if (!partidaResolvida) return <TelaDeAtualizacao estado={atualizacao} onPular={() => setPartidaResolvida(true)} />;

  if (conferindo) return <div className="carregando">Entrando…</div>;

  if (!sessao) {
    let ultimo = '';
    try { ultimo = localStorage.getItem(ULTIMO_APELIDO) ?? ''; } catch { /* sem storage */ }
    return (
      <>
        <ConnectScreen apelidoInicial={ultimo} onPronto={entrou} onRegistro={() => setRegistro(true)} />
        {registro && <RegistroDeErros onClose={() => setRegistro(false)} />}
        <UpdateToast estado={atualizacao} />
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
        onShare={compartilhar}
        onSettings={() => setDevices(true)}
        pessoas={pessoas}
        onPessoa={abrirMenu}
        onPainel={() => setPainel(true)}
        onSoundboard={() => setSoundboard(true)}
        onLogout={logout}
      />
      <Stage rm={rm} pessoas={pessoas} onPessoa={abrirMenu} onRegistro={() => setRegistro(true)} />
      {picker && (
        <ScreenPicker
          onClose={() => setPicker(false)}
          onPick={async (id, audio) => {
            setPicker(false);
            try { await rm.startScreen(id, audio); } catch (e) { rm.setError(`Tela: ${(e as Error).message}`); }
          }}
        />
      )}
      {devices && (
        <DeviceSettings
          room={rm.room}
          onRegistro={() => { setDevices(false); setRegistro(true); }}
          onClose={() => setDevices(false)}
        />
      )}
      {painel && (
        <PainelDoServidor
          eu={sessao.eu}
          servidor={sessao.servidor}
          onEu={atualizarEu}
          onServidor={atualizarServidor}
          onClose={() => setPainel(false)}
        />
      )}
      {soundboard && (
        <Soundboard
          eu={sessao.eu}
          naSala={rm.status === 'connected'}
          onTocar={rm.tocarSom}
          onClose={() => setSoundboard(false)}
        />
      )}
      {menu && (
        <MenuDaPessoa
          pessoa={menu.pessoa}
          eu={sessao.eu}
          em={menu.em}
          volume={rm.volumeDe(menu.pessoa.identity)}
          onVolume={(v) => rm.definirVolume(menu.pessoa.identity, v)}
          onAcao={async (acao, extra) => {
            if (menu.pessoa.usuarioId !== undefined) await moderarPeloMenu(menu.pessoa.usuarioId, acao, extra);
          }}
          onClose={() => setMenu(null)}
        />
      )}
      {registro && <RegistroDeErros onClose={() => setRegistro(false)} />}
      <UpdateToast estado={atualizacao} />
      <Versao />
    </div>
  );
}

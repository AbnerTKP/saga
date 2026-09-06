import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buscarSalas, pedirTokenDaSala, quemSou, sair, lerToken, guardarToken, moderar,
  guardarServidorAtual, lerServidorAtual, meusServidores,
  type Acao,
  verServidor,
  type Cargo, type RoomInfo, type Sessao, type Membro, type Servidor,
} from './api';
import { useRoom } from './useRoom';
import { useChat } from './useChat';
import { useAvisos } from './useAvisos';
import { Avisos } from './components/Avisos';
import { lerGuardado, guardar, marcarLido, paraParametro, type Marcadores } from './leituras';
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
import { ListaDeMembros } from './components/ListaDeMembros';
import { TrilhaDeServidores } from './components/TrilhaDeServidores';
import { NovoServidor } from './components/NovoServidor';
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
  const [novoServidor, setNovoServidor] = useState(false);
  // A sala que está sendo olhada. Pode ser de texto enquanto a voz continua noutra —
  // é assim que se lê um aviso sem sair da conversa.
  const [salaAbertaId, setSalaAbertaId] = useState<number | null>(null);
  const [lidas, setLidas] = useState<Marcadores>(lerGuardado);
  const notas = useAvisos();
  // Os cargos que dá para atribuir pelo menu. Vêm com o servidor, não com a sessão,
  // porque mudam quando alguém os edita.
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [membrosDoServidor, setMembrosDoServidor] = useState<Membro[]>([]);
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
  const rm = useRoom(sessao?.eu?.turbo ?? false);

  useEffect(() => { window.desktop.usaSeletorDoSistema().then(setSeletorDoSistema).catch(() => undefined); }, []);

  // Abrir já logado: se existe um crachá guardado, pergunta ao servidor se ainda vale.
  // Ele pode não valer mais — a pessoa foi expulsa ou banida enquanto o app estava fechado.
  useEffect(() => {
    if (!lerToken()) return;
    let vivo = true;
    quemSou()
      .then((r) => {
        if (!vivo) return;
        if (r.servidor) guardarServidorAtual(r.servidor.id);
        setSessao({ token: lerToken()!, servidores: [], ...r });
      })
      .catch(() => { guardarToken(null); })
      .finally(() => { if (vivo) setConferindo(false); });
    return () => { vivo = false; };
  }, []);

  const entrou = useCallback((s: Sessao) => {
    if (s.eu) { try { localStorage.setItem(ULTIMO_APELIDO, s.eu.apelido); } catch { /* sem storage */ } }
    if (s.servidor) guardarServidorAtual(s.servidor.id);
    setSessao(s);
  }, []);

  /** Trocar de servidor recarrega tudo: cargo, salas e pessoas são de lá, não daqui. */
  const trocarDeServidor = useCallback(async (id: number) => {
    guardarServidorAtual(id);
    setSalaAbertaId(null);
    await rm.leave().catch(() => undefined);
    try {
      const r = await quemSou();
      setSessao((atual) => (atual ? { ...atual, eu: r.eu, servidor: r.servidor, salas: r.salas } : atual));
    } catch (e) {
      rm.setError((e as Error).message);
    }
  }, [rm]);

  // O que a sala de voz tem a dizer entra na mesma fila do resto: um lugar só para todo
  // aviso, em vez da tarja vermelha presa no topo do palco.
  useEffect(() => {
    if (!rm.error) return;
    notas.mostrar(rm.tipoDoAviso, rm.error);
    rm.setError(null);
  }, [rm.error, rm.tipoDoAviso]);

  // A busca de salas vive dentro de um intervalo. Lendo o marcador por referência, marcar
  // uma sala como lida não derruba e recria esse intervalo a cada mensagem.
  const lidasRef = useRef(lidas);
  useEffect(() => { lidasRef.current = lidas; guardar(lidas); }, [lidas]);

  // Quem já estava em cada sala na busca anterior. Sem isso, a primeira busca anunciaria
  // como "chegou agora" todo mundo que já estava lá.
  const jaVistos = useRef<Map<number, Set<string>> | null>(null);
  const anunciarQuemChegou = useCallback((lista: RoomInfo[]) => {
    const agora = new Map(lista.map((s) => [s.id, new Set(s.participants.map((p) => p.identity))]));
    const antes = jaVistos.current;
    jaVistos.current = agora;
    if (!antes) return;

    for (const sala of lista) {
      if (sala.tipo !== 'voz') continue;
      // Na sala em que estou, quem avisa é o som. Aqui é para o que eu não veria.
      if (sala.name === rm.roomName) continue;
      const conhecidos = antes.get(sala.id);
      if (!conhecidos) continue;
      for (const p of sala.participants) {
        if (!conhecidos.has(p.identity)) notas.mostrar('info', `${p.name} entrou em ${sala.name}.`);
      }
    }
  }, [rm.roomName, notas]);

  // Quem está em cada sala
  useEffect(() => {
    if (!sessao?.servidor) return;
    let vivo = true;
    const tick = async () => {
      try {
        const lista = await buscarSalas(paraParametro(lidasRef.current));
        if (!vivo) return;
        anunciarQuemChegou(lista);
        setRooms(lista);
        setPollError(null);
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
  }, [sessao?.servidor?.id]);

  const abrirSala = useCallback(async (sala: RoomInfo) => {
    setSalaAbertaId(sala.id);
    // Sala de texto não tem voz: abrir é só passar a ler e escrever nela.
    if (sala.tipo !== 'voz' || rm.roomName === sala.name) return;
    try {
      const { url, token } = await pedirTokenDaSala(sala.name);
      await rm.join(url, token, sala.name);
    } catch (e) {
      rm.setError((e as Error).message);
    }
  }, [rm]);

  const logout = useCallback(async () => {
    await rm.leave();
    await sair().catch(() => undefined);
    guardarToken(null);
    guardarServidorAtual(null);
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
        identity: p.identity, nome: p.name, usuarioId: p.usuarioId, cargo: p.cargo,
        foto: p.foto ?? null, banner: p.banner ?? null, turbo: p.turbo, idExibido: p.idExibido ?? null,
      });
    }
  }

  // Quem está em alguma sala de voz agora: a lista da direita marca essas pessoas.
  const naVoz = new Set<number>();
  for (const sala of rooms) for (const p of sala.participants) if (p.usuarioId) naVoz.add(p.usuarioId);

  const abrirMenu = useCallback((identity: string, nome: string, em: { x: number; y: number }) => {
    setMenu({ pessoa: pessoas.get(identity) ?? { identity, nome }, em });
  // pessoas é remontado a cada render; depender dele aqui só criaria a função à toa.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms]);

  const moderarPeloMenu = useCallback(async (alvo: number, acao: Acao, extra?: { minutos?: number; cargo?: number }) => {
    try { await moderar(acao, alvo, extra); } catch (e) { notas.mostrarFalha(e); }
  }, [notas]);

  // O seletor do sistema, quando entra, escolhe a janela sozinho — abrir o nosso ali
  // significaria escolher duas vezes. Quem decide qual é qual é o processo principal.
  const compartilhar = useCallback(async () => {
    if (rm.screenOn) return rm.stopScreen();
    if (!seletorDoSistema) return setPicker(true);
    try { await rm.startScreen(null, true); } catch (e) { notas.mostrarFalha(e, 'Tela'); }
  }, [rm, seletorDoSistema, notas]);

  // Quem faz parte do servidor muda devagar — cargo novo, alguém que entrou. De dez em
  // dez segundos basta, e não concorre com a busca de salas, que é de quatro.
  useEffect(() => {
    if (!sessao?.servidor) return;
    let vivo = true;
    const buscar = () => verServidor()
      .then((r) => {
        if (!vivo) return;
        setCargos(r.cargos);
        setMembrosDoServidor(r.membros);
        setSessao((atual) => (atual ? { ...atual, servidores: r.servidores } : atual));
      })
      .catch(() => undefined);
    buscar();
    const id = setInterval(buscar, 10_000);
    return () => { vivo = false; clearInterval(id); };
  }, [sessao]);

  const salaAberta = rooms.find((s) => s.id === salaAbertaId) ?? null;
  const chat = useChat(salaAberta?.id ?? null);

  // A sala que está aberta na tela está sendo lida: o aviso dela zera sozinho, tanto ao
  // abrir quanto quando chega mensagem com ela já aberta.
  const ultimaNaTela = chat.mensagens.at(-1)?.id ?? 0;
  useEffect(() => {
    if (salaAberta?.tipo === 'texto' && ultimaNaTela) {
      setLidas((m) => marcarLido(m, salaAberta.id, ultimaNaTela));
    }
  }, [salaAberta?.id, salaAberta?.tipo, ultimaNaTela]);

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
        <Avisos avisos={notas.avisos} onFechar={notas.fechar} onRegistro={() => setRegistro(true)} />
      <UpdateToast estado={atualizacao} />
        <Versao />
      </>
    );
  }

  // Banido de todos os servidores em que estava: entra na conta, mas não há onde entrar.
  if (!sessao.eu || !sessao.servidor) {
    return (
      <div className="connect">
        <div className="connect-card">
          <h1>Sem servidor</h1>
          <p className="muted">
            {sessao.impedimento ?? 'Você não faz parte de nenhum servidor agora.'}
          </p>
          <button className="primary" onClick={logout}>Sair da conta</button>
          <div className="registro-link">
            <button type="button" className="link" onClick={() => setRegistro(true)}>ver o registro</button>
          </div>
        </div>
        {registro && <RegistroDeErros onClose={() => setRegistro(false)} />}
        <Versao />
      </div>
    );
  }

  const eu = sessao.eu;
  const servidor = sessao.servidor;

  return (
    <div className="app">
      <Sidebar
        rooms={rooms}
        pollError={pollError}
        eu={eu}
        servidor={servidor}
        rm={rm}
        onAbrir={abrirSala}
        salaAbertaId={salaAbertaId}
        onShare={compartilhar}
        onSettings={() => setDevices(true)}
        pessoas={pessoas}
        onPessoa={abrirMenu}
        onPainel={() => setPainel(true)}
        onSoundboard={() => setSoundboard(true)}
        onLogout={logout}
      />
      <Stage
        rm={rm}
        pessoas={pessoas}
        onPessoa={abrirMenu}
        salaAberta={salaAberta}
        chat={chat}
        meuId={eu.id}
      />
      {picker && (
        <ScreenPicker
          onClose={() => setPicker(false)}
          onPick={async (id, audio) => {
            setPicker(false);
            try { await rm.startScreen(id, audio); } catch (e) { notas.mostrarFalha(e, 'Tela'); }
          }}
        />
      )}
      {devices && (
        <DeviceSettings
          room={rm.room}
          souTurbo={eu.turbo}
          onRegistro={() => { setDevices(false); setRegistro(true); }}
          onClose={() => setDevices(false)}
        />
      )}
      {painel && (
        <PainelDoServidor
          eu={eu}
          servidor={servidor}
          onEu={atualizarEu}
          onServidor={atualizarServidor}
          onClose={() => setPainel(false)}
        />
      )}
      {soundboard && (
        <Soundboard
          eu={eu}
          naSala={rm.status === 'connected'}
          onTocar={rm.tocarSom}
          onClose={() => setSoundboard(false)}
        />
      )}
      <ListaDeMembros
        membros={membrosDoServidor}
        cargos={cargos}
        naVoz={naVoz}
        eu={eu}
        onPessoa={(m, em) => setMenu({
          pessoa: {
            identity: `u${m.id}`, nome: m.nome, usuarioId: m.id, cargo: m.cargo,
            foto: m.foto, banner: m.banner, turbo: m.turbo, idExibido: m.idExibido,
          },
          em,
        })}
      />

      <TrilhaDeServidores
        servidores={sessao.servidores.length ? sessao.servidores : [servidor]}
        atual={servidor.id}
        onEscolher={trocarDeServidor}
        onConfigurar={() => setNovoServidor(true)}
      />

      {menu && (
        <MenuDaPessoa
          pessoa={menu.pessoa}
          eu={eu}
          cargos={cargos.filter((c) => !c.dono && c.nivel < (eu.cargo?.nivel ?? 0))}
          em={menu.em}
          volume={rm.volumeDe(menu.pessoa.identity)}
          onVolume={(v) => rm.definirVolume(menu.pessoa.identity, v)}
          onAcao={async (acao, extra) => {
            if (menu.pessoa.usuarioId !== undefined) await moderarPeloMenu(menu.pessoa.usuarioId, acao, extra);
          }}
          onClose={() => setMenu(null)}
        />
      )}
      {novoServidor && (
        <NovoServidor
          onPronto={trocarDeServidor}
          onClose={() => setNovoServidor(false)}
        />
      )}
      {registro && <RegistroDeErros onClose={() => setRegistro(false)} />}
      <Avisos avisos={notas.avisos} onFechar={notas.fechar} onRegistro={() => setRegistro(true)} />
      <UpdateToast estado={atualizacao} />
      <Versao />
    </div>
  );
}

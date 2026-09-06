import { useState } from 'react';
import type { Categoria, Membro, RoomInfo, Servidor } from '../api';
import { moverSala, type Alvo } from '../ordenacao';
import type { useRoom } from '../useRoom';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { Nome } from './Nome';
import { Sinal } from './Sinal';
import type { PessoaNaCall } from './MenuDaPessoa';

type RM = ReturnType<typeof useRoom>;

export function Sidebar({ rooms, categorias, podeGerirSalas, onReordenar, onMenuDeSalas, pollError, eu, servidor, rm, pessoas, onPessoa, onAbrir, salaAbertaId, onShare, onSettings, onPainel, onSoundboard, onLogout }: {
  rooms: RoomInfo[]; pollError: string | null; eu: Membro; servidor: Servidor; rm: RM;
  categorias: Categoria[];
  /** Sem a permissão, a lista não arrasta e o botão direito não oferece nada. */
  podeGerirSalas: boolean;
  onReordenar: (salas: { id: number; categoriaId: number | null }[]) => void;
  onMenuDeSalas: (em: { x: number; y: number }, categoria: Categoria | null) => void;
  onAbrir: (sala: RoomInfo) => void;
  salaAbertaId: number | null; onShare: () => void; onSettings: () => void;
  pessoas: Map<string, PessoaNaCall>;
  onPessoa: (identity: string, nome: string, em: { x: number; y: number }) => void;
  onPainel: () => void; onSoundboard: () => void; onLogout: () => void;
}) {
  const connected = rm.status !== 'idle';
  const isMac = window.desktop.platform === 'darwin';

  // Arrastar: qual sala está na mão, e onde ela cairia se soltasse agora. O alvo é
  // desenhado como um risco entre duas linhas — sem ele, a pessoa solta no escuro.
  const [naMao, setNaMao] = useState<number | null>(null);
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  const [fechadas, setFechadas] = useState<Set<number>>(new Set());

  const ordemDosGrupos: (number | null)[] = [null, ...categorias.map((c) => c.id)];
  const grupos = ordemDosGrupos.map((g) => ({
    categoria: g === null ? null : categorias.find((c) => c.id === g)!,
    salas: rooms.filter((r) => (r.categoriaId ?? null) === g),
  }));

  const soltar = () => {
    if (naMao !== null && alvo) {
      const nova = moverSala(
        rooms.map((r) => ({ id: r.id, categoriaId: r.categoriaId ?? null })),
        ordemDosGrupos, naMao, alvo,
      );
      // Só avisa se de fato mudou: soltar no mesmo lugar não é uma edição.
      const antes = rooms.map((r) => `${r.id}:${r.categoriaId ?? ''}`).join();
      if (nova.map((s) => `${s.id}:${s.categoriaId ?? ''}`).join() !== antes) onReordenar(nova);
    }
    setNaMao(null); setAlvo(null);
  };

  // Metade de cima cai antes da sala; metade de baixo, depois. É o gesto que todo mundo
  // já tem na mão de outros programas.
  const mirar = (e: React.DragEvent, categoriaId: number | null, indice: number) => {
    if (naMao === null) return;
    e.preventDefault();
    e.stopPropagation();
    const caixa = e.currentTarget.getBoundingClientRect();
    const embaixo = e.clientY - caixa.top > caixa.height / 2;
    setAlvo({ categoriaId, indice: indice + (embaixo ? 1 : 0) });
  };

  const risco = (categoriaId: number | null, indice: number) =>
    alvo && alvo.categoriaId === categoriaId && alvo.indice === indice
      ? <li className="risco-de-solta" aria-hidden /> : null;

  return (
    <aside className="sidebar">
      <div className={`sidebar-head ${isMac ? 'mac' : ''}`}>
        <span title={servidor.nome}>{servidor.nome}</span>
        {pollError && <span className="dot-warn" title={pollError} />}
      </div>

      <div
        className="rooms"
        onContextMenu={(e) => { if (podeGerirSalas) { e.preventDefault(); onMenuDeSalas({ x: e.clientX, y: e.clientY }, null); } }}
        onDragOver={(e) => { if (naMao !== null) { e.preventDefault(); } }}
        onDrop={soltar}
      >
        {grupos.map((g) => (
          <div key={g.categoria?.id ?? 'soltas'} className="grupo-de-salas">
            {g.categoria && (
              <button
                className="cabecalho-de-categoria"
                title={`${g.categoria.nome} — botão direito para renomear ou apagar`}
                onClick={() => setFechadas((f) => {
                  const n = new Set(f);
                  n.has(g.categoria!.id) ? n.delete(g.categoria!.id) : n.add(g.categoria!.id);
                  return n;
                })}
                onContextMenu={(e) => {
                  if (!podeGerirSalas) return;
                  e.preventDefault(); e.stopPropagation();
                  onMenuDeSalas({ x: e.clientX, y: e.clientY }, g.categoria);
                }}
                /* Soltar em cima do título joga a sala para o começo da gaveta — é o
                   único jeito de encher uma gaveta que ainda está vazia. */
                onDragOver={(e) => { if (naMao !== null) { e.preventDefault(); e.stopPropagation(); setAlvo({ categoriaId: g.categoria!.id, indice: 0 }); } }}
              >
                <span className={`seta ${fechadas.has(g.categoria.id) ? 'fechada' : ''}`}>▾</span>
                <span>{g.categoria.nome}</span>
              </button>
            )}

            {!(g.categoria && fechadas.has(g.categoria.id)) && (
              <ul className="lista-de-salas">
                {g.salas.map((r, i) => {
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
                <li
                  key={r.id}
                  className={`linha-de-sala ${naMao === r.id ? 'na-mao' : ''}`}
                  draggable={podeGerirSalas}
                  onDragStart={(e) => { setNaMao(r.id); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={() => { setNaMao(null); setAlvo(null); }}
                  onDragOver={(e) => mirar(e, g.categoria?.id ?? null, i)}
                >
                  {risco(g.categoria?.id ?? null, i)}
                  <div className="room-block">
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
                          {p.turbo && <span className="marca-berserk" title="Berserk"><Icon name="mjolnir" size={13} /></span>}
                          {p.screen && <Icon name="screen" />}
                          {p.camera && <Icon name="camera" />}
                          {p.muted && <Icon name="micOff" />}
                        </span>
                      </li>
                    ))}
                  </ul>
                  </div>
                </li>
              );
                })}
                {/* O fim do grupo também é um lugar de soltar, senão não dá para pôr uma
                    sala depois da última. */}
                <li
                  className="fim-do-grupo"
                  onDragOver={(e) => { if (naMao !== null) { e.preventDefault(); e.stopPropagation(); setAlvo({ categoriaId: g.categoria?.id ?? null, indice: g.salas.length }); } }}
                >
                  {risco(g.categoria?.id ?? null, g.salas.length)}
                </li>
              </ul>
            )}
          </div>
        ))}
        {rooms.length === 0 && categorias.length === 0 && (
          <div className="muted small pad">
            Nenhuma sala configurada no servidor.
            {podeGerirSalas && ' Clique com o botão direito aqui para criar uma.'}
          </div>
        )}
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

import { useEffect, useRef, useState } from 'react';
import type { Categoria, Membro, RoomInfo, Servidor } from '../api';
import { ocupantes } from '../ocupantes';
import { contaDaIdentidade, identidadeDe } from '../pessoas';
import { acaoDaLive, seloDaLive, type AcaoDaLive } from '../cartaoDaLive';
import type { LiveNoChat } from '../lives';
import type { ResumoDaMesa } from '../jogos';
import { moverSala, type Alvo } from '../ordenacao';
import { COMO_SE_LE, EXPLICACAO, type Status } from '../presenca';
import type { useRoom } from '../useRoom';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { Nome } from './Nome';
import { Sinal } from './Sinal';
import { CartaoDaLive } from './CartaoDaLive';
import { MenuDeJogos } from './MenuDeJogos';
import type { PessoaNaCall } from './MenuDaPessoa';

type RM = ReturnType<typeof useRoom>;

export function Sidebar({ rooms, categorias, salasCarregadas, podeGerirSalas, onReordenar, onMenuDeSalas, onMenuDaSala, pollError, eu, servidor, rm, pessoas, onPessoa, onAbrir, lives, onAssistirLive, onAbrirPalco, jogando, nomeDoJogador, minhaPartida, onPartida, onXadrez, salaAbertaId, onShare, onSettings, onPainel, onSoundboard, onLogout, statusEscolhido, onStatus }: {
  rooms: RoomInfo[]; pollError: string | null; eu: Membro; servidor: Servidor; rm: RM;
  categorias: Categoria[];
  /**
   * As salas DESTE servidor já chegaram. Logo depois de trocar de servidor ainda não, e
   * lista vazia nessa hora não quer dizer "nenhuma sala": não ter carregado não é o mesmo
   * que não ter nada.
   */
  salasCarregadas: boolean;
  /** Sem a permissão, a lista não arrasta e o botão direito não oferece nada. */
  podeGerirSalas: boolean;
  onReordenar: (salas: { id: number; categoriaId: number | null }[]) => void;
  onMenuDeSalas: (em: { x: number; y: number }, categoria: Categoria | null) => void;
  /** Botão direito EM CIMA de uma sala: as opções daquela sala, não as de criar. */
  onMenuDaSala: (sala: RoomInfo, em: { x: number; y: number }) => void;
  onAbrir: (sala: RoomInfo) => void;
  /** As telas no ar nas salas deste servidor, com quem está vendo cada uma — ver lives.ts. */
  lives: LiveNoChat[];
  /** "Entrar e assistir" pelo cartão da live: entra na call dela e escolhe a transmissão. */
  onAssistirLive: (sala: RoomInfo, identity: string) => void;
  /** Abre o palco da call em que você está — é lá que mora a live que você assiste. */
  onAbrirPalco: () => void;
  /** Quem está numa partida de xadrez agora, e em qual mesa — ver jogos.ts. */
  jogando: Map<number, ResumoDaMesa>;
  nomeDoJogador: (id: number | null) => string;
  /** A sua mesa, se você tem uma: muda o que o menu de jogos oferece. */
  minhaPartida: 'lobby' | 'jogando' | 'fim' | null;
  /** Abrir uma partida: a sua, ou a de quem está jogando, como plateia. */
  onPartida: (mesaId: number) => void;
  /** O item Xadrez do menu de jogos: abre uma mesa, ou volta para a sua. */
  onXadrez: () => void;
  salaAbertaId: number | null; onShare: () => void; onSettings: () => void;
  pessoas: Map<string, PessoaNaCall>;
  /** Esquerdo abre o perfil; direito, as ações. */
  onPessoa: (identity: string, nome: string, em: { x: number; y: number }, tipo: 'perfil' | 'acoes') => void;
  onPainel: () => void; onSoundboard: () => void; onLogout: () => void;
  /** Dono da SAGA — não é o cargo mais alto de um servidor. Só ele vê o painel do app. */
  statusEscolhido: Status;
  onStatus: (s: Status) => void;
}) {
  const connected = rm.status !== 'idle';
  const isMac = window.desktop.platform === 'darwin';

  // Arrastar: qual sala está na mão, e onde ela cairia se soltasse agora. O alvo é
  // desenhado como um risco entre duas linhas — sem ele, a pessoa solta no escuro.
  const [naMao, setNaMao] = useState<number | null>(null);
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  const [fechadas, setFechadas] = useState<Set<number>>(new Set());
  const [escolhendoStatus, setEscolhendoStatus] = useState(false);
  // O menu dos jogos abre ACIMA do painel de voz, na largura da barra: as medidas saem do
  // painel de verdade, não de um número escrito aqui que envelhece quando ele muda.
  const painelDaVoz = useRef<HTMLDivElement>(null);
  const [menuDeJogos, setMenuDeJogos] = useState<{ left: number; bottom: number; width: number } | null>(null);
  const abrirJogos = () => setMenuDeJogos((atual) => {
    if (atual) return null;
    const painel = painelDaVoz.current?.getBoundingClientRect();
    const barra = painelDaVoz.current?.closest('.sidebar')?.getBoundingClientRect();
    if (!painel || !barra) return null;
    return { left: barra.left + 12, bottom: window.innerHeight - painel.top + 8, width: barra.width - 24 };
  });

  /**
   * O cartão da live de quem está sendo apontado. Um relógio só, para abrir e para fechar:
   * sair do nome marca o fechar, e chegar ao cartão o desmarca — é assim que se vai do
   * nome até o botão sem o cartão sumir no caminho.
   */
  const [cartao, setCartao] = useState<{ identity: string; salaId: number; em: { x: number; meio: number } } | null>(null);
  const relogioDoCartao = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(relogioDoCartao.current), []);
  const marcarCartao = (fazer: () => void, ms: number) => {
    window.clearTimeout(relogioDoCartao.current);
    relogioDoCartao.current = window.setTimeout(fazer, ms);
  };
  const apontarLive = (identity: string, salaId: number, linha: HTMLElement) => {
    const caixa = linha.getBoundingClientRect();
    const barra = linha.closest('.sidebar')?.getBoundingClientRect();
    const em = { x: (barra?.right ?? caixa.right) + 6, meio: caixa.top + caixa.height / 2 };
    // Abre quase na hora: esperar 250 ms parecia demora, e foi uma das queixas que
    // refizeram o assistir live. Os 60 ms só evitam acender cartão com o mouse de passagem.
    marcarCartao(() => setCartao({ identity, salaId, em }), cartao ? 0 : 60);
  };
  const largarLive = () => marcarCartao(() => setCartao(null), 200);
  const fecharCartao = () => { window.clearTimeout(relogioDoCartao.current); setCartao(null); };

  /** O que fazer com uma live — do selo na linha ou do botão do cartão, que fazem o mesmo. */
  const agirNaLive = (acao: AcaoDaLive, sala: RoomInfo, identity: string) => {
    fecharCartao();
    if (acao === 'assistir') rm.assistir(identity);
    else if (acao === 'entrarEAssistir') onAssistirLive(sala, identity);
    else if (acao === 'assistindo') onAbrirPalco();
  };

  /** O selo na linha de quem transmite: ele mesmo é o botão — ver seloDaLive. */
  const seloNaLinha = (sala: RoomInfo, identity: string) => {
    const acao = acaoDaLive({
      identity, minhaIdentity: identidadeDe(eu.id), salaId: sala.id,
      salaDaVozId: rm.salaDaVoz?.id ?? null, assistindo: rm.assistindo,
    });
    const selo = seloDaLive(acao);
    if (!selo.titulo) return <span className="selo-na-linha" title="Você está transmitindo">{selo.texto}</span>;
    return (
      <button
        type="button"
        className={`selo-na-linha ${selo.assistindo ? 'assistindo' : ''}`}
        title={selo.titulo}
        // Sem parar aqui, o clique sobe até a linha e abre o perfil junto.
        onClick={(e) => { e.stopPropagation(); agirNaLive(acao, sala, identity); }}
      >
        {selo.texto}
      </button>
    );
  };

  /** O controle na linha de quem está jogando, pelo mesmo princípio do selo: ele É o botão. */
  const controleNaLinha = (identity: string) => {
    const conta = contaDaIdentidade(identity);
    const mesa = conta ? jogando.get(conta) : null;
    if (!mesa) return null;
    return (
      <button
        type="button"
        className="selo-na-linha jogo"
        title={conta === eu.id
          ? 'Voltar à sua partida'
          : `Assistir ${nomeDoJogador(mesa.brancas)} × ${nomeDoJogador(mesa.pretas)}`}
        onClick={(e) => { e.stopPropagation(); fecharCartao(); onPartida(mesa.id); }}
      >
        <Icon name="controle" size={13} />
      </button>
    );
  };

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

  /** Quem aparece pendurado numa sala: a sua call sai do LiveKit; as outras, da busca. */
  const quemEstaNa = (r: RoomInfo) => (rm.salaDaVoz?.id === r.id
    ? rm.participants.map((p) => ({
        identity: p.identity, name: p.name || p.identity,
        foto: pessoas.get(p.identity)?.foto ?? null,
        enquadramento: pessoas.get(p.identity)?.enquadramento,
        turbo: pessoas.get(p.identity)?.turbo ?? false,
        idExibido: pessoas.get(p.identity)?.idExibido ?? null,
        speaking: rm.falando.has(p.identity), muted: !p.isMicrophoneEnabled, camera: p.isCameraEnabled, screen: p.isScreenShareEnabled,
        surdo: rm.surdos.has(p.identity),
      }))
    : ocupantes(r.participants, { euSou: identidadeDe(eu.id), estouNesta: false })
        .map((p) => ({
          ...p, foto: p.foto ?? null, enquadramento: p.enquadramento, turbo: p.turbo ?? false,
          idExibido: p.idExibido ?? null, speaking: false, surdo: !!p.surdo,
        })));

  // O cartão é montado de novo a cada desenho, do que está na sala AGORA: quem para de
  // transmitir, ou sai da sala, com o cartão aberto leva o cartão junto.
  const salaDoCartao = cartao ? rooms.find((s) => s.id === cartao.salaId) ?? null : null;
  const quemTransmite = cartao && salaDoCartao
    ? quemEstaNa(salaDoCartao).find((p) => p.identity === cartao.identity && p.screen) ?? null
    : null;
  const acaoDoCartao = salaDoCartao && quemTransmite
    ? acaoDaLive({
        identity: quemTransmite.identity, minhaIdentity: identidadeDe(eu.id), salaId: salaDoCartao.id,
        salaDaVozId: rm.salaDaVoz?.id ?? null, assistindo: rm.assistindo,
      })
    : null;
  // Na sua call, quem está vendo sai do LiveKit, na hora; nas outras, da busca de salas.
  const plateiaDoCartao = !salaDoCartao || !quemTransmite ? []
    : rm.salaDaVoz?.id === salaDoCartao.id
      ? (rm.espectadores.get(quemTransmite.identity) ?? []).map((e) => e.nome)
      : lives.find((l) => l.identity === quemTransmite.identity && l.salaId === salaDoCartao.id)?.espectadores ?? [];

  return (
    <aside className="sidebar">
      {/* O nome do servidor é onde você está: ganha a foto dele, peso de título e uma
          seta dizendo que abre. Era um texto solto, do mesmo tamanho do resto. */}
      <div className={`sidebar-head ${isMac ? 'mac' : ''}`}>
        <button className="cabeca-do-servidor" onClick={onPainel} title={`${servidor.nome} — configurações do servidor`}>
          <Avatar nome={servidor.nome} foto={servidor.foto} tamanho="big" />
          <span className="nome-do-servidor">{servidor.nome}</span>
          <span className="seta-do-servidor">▾</span>
        </button>
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
              const people = quemEstaNa(r);
              return (
                <li
                  key={r.id}
                  className={`linha-de-sala ${naMao === r.id ? 'na-mao' : ''} ${r.papel ? 'chumbada' : ''}`}
                  draggable={podeGerirSalas && !r.papel}
                  onDragStart={(e) => { setNaMao(r.id); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={() => { setNaMao(null); setAlvo(null); }}
                  onDragOver={(e) => mirar(e, g.categoria?.id ?? null, i)}
                >
                  {risco(g.categoria?.id ?? null, i)}
                  <div className="room-block">
                  <button
                    className={`room ${live ? 'active' : ''} ${salaAbertaId === r.id ? 'aberta' : ''} ${r.naoLidas > 0 ? 'nova' : ''}`}
                    onClick={() => onAbrir(r)}
                    /* Sem parar aqui, o clique sobe até a lista e abre o menu DELA — o de
                       criar sala. Quem aponta para uma sala quer mexer naquela sala. */
                    onContextMenu={(e) => {
                      if (!podeGerirSalas) return;
                      e.preventDefault(); e.stopPropagation();
                      onMenuDaSala(r, { x: e.clientX, y: e.clientY });
                    }}
                    disabled={rm.status === 'connecting'}
                  >
                    {/* A sala de notas é do app, e o ícone diz isso antes de qualquer texto. */}
                    <Icon name={r.papel === 'notas' ? 'berserk' : r.tipo === 'texto' ? 'texto' : 'speaker'} /> <span>{r.name}</span>
                    {/* Se a sala chegou até aqui, você é um dos que a veem: o cadeado não
                        avisa que ela é proibida, avisa que ela não é de todo mundo. */}
                    {r.privada && <span className="tranca" title="Só alguns cargos veem esta sala"><Icon name="cadeado" size={13} /></span>}
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
                        // Quem transmite já ganha o cartão da live ao apontar; o balão amarelo
                        // do navegador por cima dele diria outra coisa no mesmo lugar.
                        title={p.screen ? undefined : `${p.name} — clique para o perfil, botão direito para as opções`}
                        onClick={(e) => { e.stopPropagation(); fecharCartao(); onPessoa(p.identity, p.name, { x: e.clientX, y: e.clientY }, 'perfil'); }}
                        /* Sem parar aqui, o clique sobe até a lista de salas e abre O MENU DELA junto:
                           dois menus na tela, um por cima do outro. */
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); fecharCartao(); onPessoa(p.identity, p.name, { x: e.clientX, y: e.clientY }, 'acoes'); }}
                        /* Apontar para quem transmite abre o cartão da live — o mesmo da faixa
                           do palco —, com o "assistir" a um clique de onde o ícone já estava. */
                        onMouseEnter={p.screen ? (e) => apontarLive(p.identity, r.id, e.currentTarget) : undefined}
                        onMouseLeave={p.screen ? largarLive : undefined}
                      >
                        <Avatar nome={p.name} foto={p.foto} enquadramento={p.enquadramento?.foto}
                      status={pessoas.get(p.identity)?.status} />
                        <span className="pname"><Nome nome={p.name} id={p.idExibido} turbo={p.turbo} /></span>
                        <span className="pico">
                          {/* O Berserk não entra aqui. A linha da call é a mais estreita do
                              app e já carrega até quatro marcas; o nome dele já vem na cor
                              do Berserk, então o ícone repetia o que a cor diz e roubava a
                              vaga de câmera, microfone e live — que dizem coisas do momento.
                              Nos outros lugares ele continua. */}
                          {controleNaLinha(p.identity)}
                          {p.screen && seloNaLinha(r, p.identity)}
                          {p.camera && <Icon name="camera" />}
                          {/* Fone desligado no lugar do microfone mudo, e não os dois: a
                              linha é estreita, e desligar o fone JÁ muta o microfone —
                              a marca do microfone repetiria a consequência e esconderia
                              a causa. "Ele não te ouve" diz mais que "ele não fala". */}
                          {p.surdo
                            ? <span title="Desligou o fone: não ouve ninguém"><Icon name="headOff" /></span>
                            : p.muted && <Icon name="micOff" />}
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
        {salasCarregadas && rooms.length === 0 && categorias.length === 0 && (
          <div className="muted small pad">
            Nenhuma sala configurada no servidor.
            {podeGerirSalas && ' Clique com o botão direito aqui para criar uma.'}
          </div>
        )}
      </div>

      {connected && (
        <div className="voice-panel" ref={painelDaVoz}>
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
            {/* Os jogos moram aqui porque é daqui que se chama gente: o lobby chama
                primeiro quem está na call. */}
            <button className={menuDeJogos ? 'on' : ''} data-abre-jogos onClick={abrirJogos}
              title={minhaPartida ? 'Jogos — você tem uma mesa aberta' : 'Jogos'}>
              <Icon name="controle" />
            </button>
            <button className="danger" onClick={rm.leave} title="Desconectar"><Icon name="hangup" /></button>
          </div>
        </div>
      )}

      <div className="user-panel">
        {/* O seu status fica junto de você, e é onde a mão procura: clicar no seu nome
            abre a escolha. Antes não havia lugar nenhum para isso. */}
        <button className="eu-status" onClick={() => setEscolhendoStatus((v) => !v)} title="Mudar seu status">
          <Avatar nome={eu.nome} foto={eu.foto} enquadramento={eu.enquadramento?.foto}
            tamanho="big" status={statusEscolhido} />
        </button>
        <div className="uname">
          <button className="strong nome-clicavel" title="Mudar seu status"
            onClick={() => setEscolhendoStatus((v) => !v)}>
            <Nome membro={eu} />
          </button>
          <span className="muted small">{COMO_SE_LE[statusEscolhido]}</span>
        </div>
        {escolhendoStatus && (
          <div className="escolher-status" onMouseLeave={() => setEscolhendoStatus(false)}>
            {(['online', 'ausente', 'ocupado'] as Status[]).map((s) => (
              <button key={s} className={s === statusEscolhido ? 'atual' : ''}
                onClick={() => { onStatus(s); setEscolhendoStatus(false); }}>
                <span className={`presenca ${s}`} />
                <span className="quem">
                  <span className="strong">{COMO_SE_LE[s]}</span>
                  <span className="muted small">{EXPLICACAO[s]}</span>
                </span>
              </button>
            ))}
            <div className="menu-risco" />
            {/* Sair vive aqui porque é sobre você, e porque cada botão a mais na linha
                de baixo rouba o espaço do seu nome — foi o que o atropelou. O painel da
                Saga morava aqui junto e foi para a engrenagem: menu de status não é
                lugar de painel de administração, e ele ficou impossível de achar. */}
            <button onClick={onLogout}>
              <span className="quem"><span className="strong">Sair da conta</span></span>
            </button>
          </div>
        )}
        <div className="user-actions">
          <button className={!rm.micOn && connected ? 'off' : ''} onClick={rm.toggleMic} disabled={!connected || rm.deafened} title="Mutar microfone">
            <Icon name={rm.micOn || !connected ? 'mic' : 'micOff'} />
          </button>
          <button className={rm.deafened ? 'off' : ''} onClick={rm.toggleDeafen} title="Ensurdecer">
            <Icon name={rm.deafened ? 'headOff' : 'head'} />
          </button>
          {/* A engrenagem é "as suas coisas": perfil, microfone, câmera. As do servidor
              ficam no nome dele, lá em cima, e no botão direito do quadrado à direita. */}
          <button onClick={onSettings} title="Sua conta: perfil, microfone e câmera"><Icon name="gear" /></button>
        </div>
      </div>

      {menuDeJogos && (
        <MenuDeJogos
          em={menuDeJogos}
          minha={minhaPartida}
          onXadrez={onXadrez}
          onClose={() => setMenuDeJogos(null)}
        />
      )}

      {cartao && salaDoCartao && quemTransmite && acaoDoCartao && (
        <CartaoDaLive
          em={cartao.em}
          nome={quemTransmite.name}
          foto={quemTransmite.foto}
          enquadramento={quemTransmite.enquadramento?.foto}
          plateia={plateiaDoCartao}
          acao={acaoDoCartao}
          volume={rm.volumeDaTelaDe(quemTransmite.identity)}
          onVolume={(v) => rm.definirVolumeDaTela(quemTransmite.identity, v)}
          onManter={() => window.clearTimeout(relogioDoCartao.current)}
          onSoltar={largarLive}
          onAssistir={() => agirNaLive(acaoDoCartao, salaDoCartao, quemTransmite.identity)}
          onAbrirPalco={() => { fecharCartao(); onAbrirPalco(); }}
          onSairDaLive={() => { fecharCartao(); rm.assistir(null); }}
        />
      )}
    </aside>
  );
}

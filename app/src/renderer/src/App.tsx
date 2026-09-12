import { useCallback, useEffect, useRef, useState } from 'react';
import logo from './marca.png';
import {
  buscarSalas, pedirTokenDaSala, quemSou, sair, lerToken, guardarToken, moderar, baterPresenca,
  pode, criarSala, reordenarSalas, criarCategoria, renomearCategoria, apagarCategoria,
  renomearSala, apagarSala,
  guardarServidorAtual, lerServidorAtual, meusServidores, sairDoServidor,
  type Acao,
  verServidor,
  type Cargo, type Categoria, type RoomInfo, type Sessao, type Membro, type Servidor, type Mensagem,
  abrirMesa, agirNaMesa, type ConviteDeJogo,
  abrirConversa, pedirAmizade, type Conversa, type ConversaAberta, type Onde,
} from './api';
import { ehMinhaVez, jogandoAgora, minhaMesa, type ResumoDaMesa } from './jogos';
import { criarAvisos } from './avisos';
import { ARQUIVOS } from './sons';
import { TelaDoXadrez } from './components/TelaDoXadrez';
import { ConviteDeXadrez } from './components/ConviteDeXadrez';
import { FaixaDaPartida } from './components/FaixaDaPartida';
import { useRoom, type SalaDaVoz } from './useRoom';
import { useChat } from './useChat';
import { useAvisos } from './useAvisos';
import { Avisos } from './components/Avisos';
import { CartaoDoPerfil } from './components/CartaoDoPerfil';
import { lerGuardado, guardar, marcarLido, paraParametro, ONDE, type Marcadores } from './leituras';
import { comAPessoa, conversasComNovidade, ultimasVistas, type ComAPessoa } from './amizade';
import { TelaDeAmigos } from './components/TelaDeAmigos';
import { ConnectScreen } from './components/ConnectScreen';
import { Sidebar } from './components/Sidebar';
import { MenuDeSalas, type AcaoDeSala } from './components/MenuDeSalas';
import { MenuDoServidor, type AcaoNoServidor } from './components/MenuDoServidor';
import { Convidar } from './components/Convidar';
import { MenuDaSala, type AcaoNaSala } from './components/MenuDaSala';
import { QuemPodeVer } from './components/QuemPodeVer';
import { PedirNome } from './components/PedirNome';
import { statusParaMandar, type Status } from './presenca';
import { Stage } from './components/Stage';
import { ScreenPicker } from './components/ScreenPicker';
import { PainelDaConta } from './components/PainelDaConta';
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
import { TelaInicial } from './components/TelaInicial';
import { livesNasSalas, type LiveNoChat } from './lives';
import { acharPessoa, contaDaIdentidade, identidadeDe, lembrarDasSalas, vistosEm, type Conhecidos } from './pessoas';
import { podeApagarMensagem } from './apagar';
import { oQueFazerAoClicar } from './navegacao';
import { aoDespertar } from './despertar';
import type { UpdateState } from './desktop';

// Guardado só para preencher o campo na próxima vez; a sessão em si é o token.
const ULTIMO_APELIDO = 'cantinho.apelido';
const STATUS_ESCOLHIDO = 'cantinho.status';

// Vazias e sempre as mesmas: "ainda não chegou" não pode virar uma lista nova a cada desenho.
const SEM_SALAS: RoomInfo[] = [];
const SEM_CATEGORIAS: Categoria[] = [];
const SEM_CARGOS: Cargo[] = [];
const SEM_MEMBROS: Membro[] = [];
const SEM_MESAS: ResumoDaMesa[] = [];

/** Uma pessoa aberta num cartão ou num menu, com o servidor de que se está falando dela. */
type PessoaAberta = { pessoa: PessoaNaCall; servidorId: number; servidorNome: string };

export function App() {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [conferindo, setConferindo] = useState(!!lerToken());
  /**
   * Tudo que é DE UM SERVIDOR anda com o servidor junto — as salas aqui, cargos e pessoas
   * logo abaixo.
   *
   * Trocar de servidor não troca estas listas na hora: até a busca voltar, elas ainda são
   * as de onde se veio, e sem a etiqueta o app as usava como se fossem do servidor novo —
   * com o nome dele no alto. Com ela, lista de outro servidor não vale aqui: é como se
   * ainda não tivesse chegado. As que valem são tiradas logo depois do `useRoom`.
   */
  const [salasDoServidor, setSalasDoServidor] = useState<{ servidorId: number; rooms: RoomInfo[]; categorias: Categoria[] } | null>(null);
  const [menuDeSalas, setMenuDeSalas] = useState<{ em: { x: number; y: number }; categoria: Categoria | null } | null>(null);
  const [menuDaSala, setMenuDaSala] = useState<{ sala: RoomInfo; em: { x: number; y: number } } | null>(null);
  // A sala cujo "quem pode ver" está aberto.
  const [trancando, setTrancando] = useState<RoomInfo | null>(null);
  const [pedido, setPedido] = useState<AcaoDeSala | null>(null);
  // O que a pessoa escolheu. O que vai para o servidor pode ser outro: ver statusParaMandar.
  const [statusEscolhido, setStatusEscolhido] = useState<Status>(() => {
    try { return (localStorage.getItem(STATUS_ESCOLHIDO) as Status) ?? 'online'; } catch { return 'online'; }
  });
  const [pollError, setPollError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [devices, setDevices] = useState(false);
  const [painel, setPainel] = useState(false);
  const [menuDoServidor, setMenuDoServidor] = useState<{ x: number; y: number } | null>(null);
  const [convidando, setConvidando] = useState(false);
  const [soundboard, setSoundboard] = useState(false);
  const [registro, setRegistro] = useState(false);
  // Qual aba abrir: quem clicou em "criar" não quer chegar na de convite.
  const [novoServidor, setNovoServidor] = useState<'criar' | 'entrar' | null>(null);
  // A sala que está sendo olhada. Pode ser de texto enquanto a voz continua noutra —
  // é assim que se lê um aviso sem sair da conversa.
  const [salaAbertaId, setSalaAbertaId] = useState<number | null>(null);
  /**
   * As mesas de xadrez do servidor aberto e os convites que chegaram para você. Vêm na mesma
   * busca de salas, como o "está digitando" — uma busca própria dobraria o trânsito para
   * dizer uma coisa que muda devagar. Anotadas com o servidor, como todo o resto: mesa de um
   * servidor não vale no vizinho.
   */
  const [jogos, setJogos] = useState<{ servidorId: number; mesas: ResumoDaMesa[]; convites: ConviteDeJogo[] } | null>(null);
  /** A partida aberta na tela, com o servidor DELA: é a ele que a tela do jogo pergunta. */
  const [jogoAberto, setJogoAberto] = useState<{ mesaId: number; servidorId: number } | null>(null);
  /** Convite já respondido: sai da tela na hora, sem esperar a busca seguinte confirmar. */
  const [conviteRespondido, setConviteRespondido] = useState<number | null>(null);
  const [respondendoConvite, setRespondendoConvite] = useState(false);
  // O som do convite. A regra de não empilhar som é a mesma dos outros avisos (avisos.ts).
  const tocarAviso = useRef(criarAvisos(ARQUIVOS)).current;
  const conhecidos = useRef<Conhecidos>(new Map());
  const [lidas, setLidas] = useState<Marcadores>(() => lerGuardado());
  /**
   * As conversas privadas, e o modo que as mostra.
   *
   * Elas são da CONTA: não trocam quando você troca de servidor, e por isso não levam
   * etiqueta de servidor como as salas, os cargos e as pessoas. O que o modo faz é trocar
   * a COLUNA da esquerda — o servidor aberto continua o mesmo por baixo, e voltar para ele
   * é um clique no quadrado, sem recarregar nada.
   */
  const [modoConversas, setModoConversas] = useState(false);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [amigos, setAmigos] = useState<{ pedidos: number; ids: number[] }>({ pedidos: 0, ids: [] });
  const [conversaAberta, setConversaAberta] = useState<ConversaAberta | null>(null);
  const [lidasDeConversa, setLidasDeConversa] = useState<Marcadores>(() => lerGuardado(ONDE.conversas));
  const notas = useAvisos();
  const [perfilAberto, setPerfilAberto] = useState<PessoaAberta | null>(null);
  // Os cargos que dá para atribuir pelo menu, e quem faz parte. Vêm com o servidor, não com
  // a sessão, porque mudam quando alguém os edita — e, como as salas, com o servidor junto.
  const [dadosDoServidor, setDadosDoServidor] = useState<{ servidorId: number; cargos: Cargo[]; membros: Membro[] } | null>(null);
  // Pede a lista de pessoas de novo AGORA, sem esperar a volta de 10 s — ver a busca dela.
  const [buscarServidorDeNovo, setBuscarServidorDeNovo] = useState(0);
  const recarregarServidor = useCallback(() => setBuscarServidorDeNovo((n) => n + 1), []);
  // O que as buscas chamam quando o servidor aberto deixa de ser seu, e quando a sessão cai.
  // Em referência porque as buscas vivem de relógio e não podem nascer de novo a cada
  // desenho — ver `perdeuOServidorRef`, logo depois de `recarregarSessao`.
  const perdeuOServidorRef = useRef<(id: number) => void>(() => {});
  const sairDaVozRef = useRef<() => void>(() => {});
  const [seletorDoSistema, setSeletorDoSistema] = useState(false);
  const [menu, setMenu] = useState<(PessoaAberta & { em: { x: number; y: number } }) | null>(null);
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
  // Alguém entrou na sala em que estou: o som avisa quem está de fone, e este recado
  // avisa quem está com a janela noutro lugar. Sala em que não estou não vira aviso —
  // seria barulho por acontecimento que não é meu.
  const aoChegarAlguem = useCallback(
    (nome: string) => notas.mostrar('info', `${nome} entrou na sala.`),
    [notas.mostrar],
  );
  const rm = useRoom(sessao?.eu?.turbo ?? false, aoChegarAlguem);

  // O que vale para o servidor ABERTO: só as listas etiquetadas com ele.
  const servidorAberto = sessao?.servidor?.id ?? null;
  const salasDaqui = salasDoServidor?.servidorId === servidorAberto ? salasDoServidor : null;
  const rooms = salasDaqui?.rooms ?? SEM_SALAS;
  const categorias = salasDaqui?.categorias ?? SEM_CATEGORIAS;
  const dadosDaqui = dadosDoServidor?.servidorId === servidorAberto ? dadosDoServidor : null;
  const cargos = dadosDaqui?.cargos ?? SEM_CARGOS;
  const membrosDoServidor = dadosDaqui?.membros ?? SEM_MEMBROS;

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
        // Sem servidor nenhum não é erro: é a tela inicial vazia, e o crachá continua
        // valendo. Só o 401 abaixo derruba a sessão.
        setSessao({ token: lerToken()!, ...r });
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

  /**
   * Trocar de servidor recarrega tudo: cargo, salas e pessoas são de lá, não daqui.
   *
   * A voz NÃO cai junto, e isso é o ponto. Antes caía: clicar noutro servidor desligava a
   * call e tocava o som de saída, como se você tivesse desligado — e às vezes você só
   * queria espiar o que está acontecendo do outro lado. Olhar não é sair. Tecnicamente
   * nunca foi preciso: a sala no LiveKit é identificada pelo id, então continuar falando
   * em "Geral" de um servidor enquanto se lê outro nunca foi um problema técnico: era só
   * esta linha.
   */
  /**
   * Relê quem sou e onde estou. É o que fecha toda mudança de vínculo: trocar de
   * servidor, entrar num com convite, criar um, sair de um. O servidor é quem decide
   * onde você cai — pedir por um de que não se faz parte devolve o seu, e sair do
   * último devolve a tela inicial.
   */
  const recarregarSessao = useCallback(async () => {
    setSalaAbertaId(null);
    // A mesa de xadrez é de um servidor: indo para outro, a partida sai da tela (ela
    // continua de pé, e a faixa a traz de volta quando você voltar para o servidor dela).
    setJogoAberto(null);
    try {
      const r = await quemSou();
      guardarServidorAtual(r.servidor?.id ?? null);
      setSessao((atual) => (atual ? { ...atual, ...r } : atual));
    } catch (e) {
      rm.setError((e as Error).message);
    }
  }, [rm]);

  /**
   * O servidor aberto deixou de ser seu com a janela aberta: banido ou expulso.
   *
   * O servidor não responde erro — pedir por um servidor de que você não faz parte devolve
   * outro, de propósito, porque saber o número de um servidor alheio não abre porta. Quem
   * percebe é o app, pelo servidor que a resposta diz ser; aí ele avisa e relê onde você
   * está. Antes isto nunca acontecia com a janela aberta: banir derrubava a sessão da CONTA,
   * e o banido de um servidor ia parar na tela de login, fora de todos.
   */
  const avisadoDaPerda = useRef<number | null>(null);
  perdeuOServidorRef.current = (id: number) => {
    if (avisadoDaPerda.current === id) return;
    avisadoDaPerda.current = id;
    const nome = sessao?.servidor?.id === id ? sessao.servidor.nome : 'um servidor';
    notas.mostrar('erro', `Você não faz mais parte de ${nome}.`);
    recarregarSessao().finally(() => { avisadoDaPerda.current = null; });
  };
  sairDaVozRef.current = rm.leave;

  const trocarDeServidor = useCallback(async (id: number) => {
    guardarServidorAtual(id);
    await recarregarSessao();
  }, [recarregarSessao]);

  // O que a sala de voz tem a dizer entra na mesma fila do resto: um lugar só para todo
  // aviso, em vez da tarja vermelha presa no topo do palco.
  useEffect(() => {
    if (!rm.error) return;
    notas.mostrar(rm.tipoDoAviso, rm.error);
    rm.setError(null);
  }, [rm.error, rm.tipoDoAviso]);

  /**
   * Sinal de vida, a cada 30 s.
   *
   * O status que vai não é só o escolhido: quem está "online" e largou a máquina vira
   * ausente sozinho — quem sabe disso é o processo principal, porque dentro da janela não
   * se vê teclado nem mouse fora do app. A regra é `statusParaMandar`, testada.
   */
  useEffect(() => {
    if (!sessao?.eu) return;
    let vivo = true;
    // O último status que o servidor confirmou: é por ele que se sabe que a SUA linha mudou.
    let confirmado: string | null = null;
    const bater = async () => {
      try {
        const ocioso = await window.desktop.ociosidade();
        if (!vivo) return;
        const agora = await baterPresenca(statusParaMandar(statusEscolhido, ocioso));
        // A lista de pessoas vem de 10 em 10 s, e o sinal de vida corre ao lado dela: quem
        // abria o app se via apagado na própria lista por 10 s, e "ocupado" levava 8 s para
        // aparecer — medido. Status confirmado diferente do anterior pede a lista na hora.
        if (vivo && agora !== confirmado) { confirmado = agora; recarregarServidor(); }
      } catch { /* rede piscou; o próximo batimento resolve */ }
    };
    bater();
    const id = setInterval(bater, 30_000);
    // Voltar a aparecer online na hora, e não até 30 s depois de a máquina acordar.
    const pararDeDespertar = aoDespertar(bater);
    return () => { vivo = false; clearInterval(id); pararDeDespertar(); };
  }, [sessao?.eu?.id, statusEscolhido, recarregarServidor]);

  const escolherStatus = useCallback((s: Status) => {
    setStatusEscolhido(s);
    try { localStorage.setItem(STATUS_ESCOLHIDO, s); } catch { /* sem storage */ }
    baterPresenca(s).catch(() => undefined);
  }, []);

  // A busca de salas vive dentro de um intervalo. Lendo o marcador por referência, marcar
  // uma sala como lida não derruba e recria esse intervalo a cada mensagem.
  const lidasRef = useRef(lidas);
  useEffect(() => { lidasRef.current = lidas; guardar(lidas); }, [lidas]);
  const lidasDeConversaRef = useRef(lidasDeConversa);
  useEffect(() => {
    lidasDeConversaRef.current = lidasDeConversa;
    guardar(lidasDeConversa, ONDE.conversas);
  }, [lidasDeConversa]);
  /**
   * A última mensagem que cada conversa tinha na volta anterior da busca.
   *
   * É com isto que se sabe que chegou coisa nova, e não com o contador de não lidas — ver
   * `conversasComNovidade`. Em referência porque o aviso acontece DENTRO da busca, e um
   * estado aqui faria o efeito nascer de novo a cada resposta.
   */
  const conversasVistas = useRef<Map<number, number> | null>(null);
  const conversaAbertaRef = useRef<number | null>(null);
  conversaAbertaRef.current = modoConversas ? conversaAberta?.id ?? null : null;

  // Quem está em cada sala
  useEffect(() => {
    const servidorId = sessao?.servidor?.id;
    if (!servidorId) return;
    let vivo = true;
    const tick = async () => {
      try {
        // O pedido diz de que servidor fala, porque a resposta vai ser guardada como dele.
        const lista = await buscarSalas(
          paraParametro(lidasRef.current), servidorId, paraParametro(lidasDeConversaRef.current),
        );
        if (!vivo) return;
        // Resposta de OUTRO servidor: o aberto não é mais seu.
        if (lista.servidorId && lista.servidorId !== servidorId) { perdeuOServidorRef.current(servidorId); return; }
        setSalasDoServidor({ servidorId, rooms: lista.rooms, categorias: lista.categorias });
        // As mesas de xadrez vêm na mesma resposta. Servidor antigo não manda o campo: aí
        // não há jogo nenhum e nada quebra, como acontece com o "está digitando".
        setJogos({ servidorId, mesas: lista.jogos?.mesas ?? [], convites: lista.jogos?.convites ?? [] });
        // As conversas privadas vêm na mesma resposta, e NÃO levam etiqueta de servidor:
        // elas são da conta. Servidor antigo não manda o campo — aí não há conversa
        // nenhuma na tela e nada quebra, como o "está digitando".
        const daConta = lista.conversas ?? [];
        setConversas(daConta);
        setAmigos(lista.amigos ?? { pedidos: 0, ids: [] });
        // Mensagem privada é dirigida a VOCÊ: ela avisa mesmo com a janela noutro lugar.
        // A que está aberta na tela não avisa — você está lendo.
        for (const c of conversasComNovidade(conversasVistas.current, daConta, conversaAbertaRef.current)) {
          avisarRef.current('info', `${c.com.nome} te mandou uma mensagem.`);
        }
        conversasVistas.current = ultimasVistas(daConta);
        setPollError(null);
      } catch (e) {
        if (!vivo) return;
        const status = (e as { status?: number }).status;
        // Sessão derrubada com o app aberto: volta para o login — e SAI da call. Sem isto a
        // call continuava rodando atrás da tela de login, sem botão nenhum para desligar.
        if (status === 401) { sairDaVozRef.current(); guardarToken(null); setSessao(null); return; }
        // Era o único servidor que você tinha, e não há outro para responder por ele.
        if (status === 403 || status === 404) { perdeuOServidorRef.current(servidorId); return; }
        setPollError((e as Error).message);
      }
    };
    tick();
    const id = setInterval(tick, 4000);
    const pararDeDespertar = aoDespertar(tick);
    return () => { vivo = false; clearInterval(id); pararDeDespertar(); };
  }, [sessao?.servidor?.id]);

  /**
   * Entra na voz de uma sala, sem mexer no que está sendo lido.
   *
   * Separado de `abrirSala` porque as duas coisas deixaram de andar sempre juntas: dá
   * para entrar numa call a partir da linha de "fulano está compartilhando a tela" no
   * chat, e nesse caso quem estava lendo a conversa continua nela — a live vai para o
   * quadro flutuante do canto, que existe exatamente para isso.
   */
  const entrarNaVoz = useCallback(async (sala: SalaDaVoz, comMicrofone = true) => {
    // Pelo id, não pelo nome: clicar em "Geral" de outro servidor tem de levar você para
    // lá, e comparando nome o app achava que você já estava e não fazia nada.
    if (rm.salaDaVoz?.id === sala.id) return;
    // A sala vem com o servidor dela, e o passe é pedido a ELE. A volta de uma call que
    // caiu chega aqui com a sala de onde se caiu — que pode não ser do servidor aberto.
    const { url, token } = await pedirTokenDaSala(sala);
    await rm.join(url, token, sala, comMicrofone);
  }, [rm]);

  /** Uma sala da lista do servidor aberto, do jeito que a voz a guarda: com o servidor junto. */
  const paraAVoz = useCallback((sala: RoomInfo): SalaDaVoz | null => (
    sessao?.servidor
      ? { id: sala.id, nome: sala.name, servidorId: sessao.servidor.id, servidorNome: sessao.servidor.nome }
      : null
  ), [sessao?.servidor]);

  /**
   * A call que caiu volta sozinha, do jeito que estava.
   *
   * Cair não é desligar: quem desligou não é trazido de volta, quem foi TIRADO também
   * não (`queda.ts` separa os dois pelo motivo), e quem caiu volta para a mesma sala com
   * o microfone como estava — reaparecer falando para quem tinha se mutado seria pior que
   * não voltar.
   *
   * As duas coisas que este efeito tem de não fazer, e que ele fazia:
   *
   * - **Depender de `rooms` ou de `entrarNaVoz`.** As duas mudam a cada busca de salas, de
   *   4 em 4 segundos; o efeito era refeito junto e disparava uma tentativa nova por cima
   *   da anterior, cada uma derrubando a que estava no meio da conexão. Medido: o app
   *   ficava em "Conectando…" para sempre e nunca voltava. A sala de que se caiu já vem
   *   dentro de `caiuDaCall`, então nem é preciso procurá-la na lista.
   * - **Empilhar tentativas.** `tentando` segura a próxima enquanto uma está em curso:
   *   entrar tem tempo limite de dezenas de segundos, e bater de novo antes disso é
   *   garantir que nenhuma termine.
   */
  const entrarNaVozRef = useRef(entrarNaVoz);
  entrarNaVozRef.current = entrarNaVoz;
  const avisarRef = useRef(notas.mostrar);
  avisarRef.current = notas.mostrar;

  useEffect(() => {
    const caiu = rm.caiuDaCall;
    if (!caiu) return;
    let vivo = true;
    let tentando = false;
    const voltar = async () => {
      if (!vivo || tentando || !navigator.onLine) return;
      tentando = true;
      try {
        // A sala de onde se caiu, com o servidor dela — e não o servidor aberto agora.
        await entrarNaVozRef.current(caiu.sala, caiu.comMicrofone);
        avisarRef.current('info', `A conexão caiu e você voltou para ${caiu.sala.nome}.`);
      } catch {
        // Ainda fora. A próxima volta tenta de novo; insistir mais rápido não traz
        // ninguém de volta mais cedo.
      } finally {
        tentando = false;
      }
    };
    voltar();
    const pararDeDespertar = aoDespertar(voltar);
    const id = setInterval(voltar, 30_000);
    return () => { vivo = false; clearInterval(id); pararDeDespertar(); };
  }, [rm.caiuDaCall]);

  /**
   * Clicar numa sala. Entrar na voz e trocar o que está na tela são duas coisas, e nem
   * todo clique quer as duas — quem está lendo uma conversa e entra noutra call continua
   * lendo. A regra mora em `navegacao.ts`, pura e testada.
   */
  const abrirSala = useCallback(async (sala: RoomInfo) => {
    // Com uma partida na tela você não está lendo conversa nenhuma: clicar numa sala de voz
    // tem de abrir o palco dela, e não devolver o chat que estava atrás do jogo.
    const lendo = jogoAberto ? null : rooms.find((s) => s.id === salaAbertaId) ?? null;
    const { abrir, entrar } = oQueFazerAoClicar(sala, lendo, rm.salaDaVoz?.id ?? null);
    setJogoAberto(null);
    if (abrir) setSalaAbertaId(sala.id);
    const naVoz = entrar ? paraAVoz(sala) : null;
    if (!naVoz) return;
    try { await entrarNaVoz(naVoz); } catch (e) { rm.setError((e as Error).message); }
  }, [rm, entrarNaVoz, paraAVoz, rooms, salaAbertaId, jogoAberto]);

  const logout = useCallback(async () => {
    await rm.leave();
    await sair().catch(() => undefined);
    guardarToken(null);
    guardarServidorAtual(null);
    setSessao(null);
    setSalasDoServidor(null);
    setDadosDoServidor(null);
    setJogos(null);
    setJogoAberto(null);
    conhecidos.current.clear();
  }, [rm]);

  // Identidade -> quem é a pessoa, montado do que o servidor manda. O LiveKit sabe quem
  // está falando mas não sabe de foto nem de cargo; a barra lateral, o palco e o menu
  // precisam das duas coisas, então o mapa é montado aqui, uma vez.
  //
  // Ele acumula, e acumula POR SERVIDOR: cada lista é anotada debaixo do servidor de onde
  // veio. Numa pilha só, quem esteve na call de um servidor levava o cargo, o nome e o
  // identificador de lá para o cartão aberto noutro — ver pessoas.ts.
  if (salasDoServidor) lembrarDasSalas(conhecidos.current, salasDoServidor.servidorId, salasDoServidor.rooms);

  // Quem está em alguma sala de voz agora: a lista da direita marca essas pessoas.
  const naVoz = new Set<number>();
  for (const sala of rooms) for (const p of sala.participants) if (p.usuarioId) naVoz.add(p.usuarioId);

  /**
   * Esquerdo abre o PERFIL; direito, as AÇÕES.
   *
   * Era tudo no mesmo popover: a foto minúscula no topo e, logo abaixo, banir e expulsar.
   * Ver quem é a pessoa é o que mais se faz, e era o que menos aparecia — enquanto o que
   * quase nunca se usa, e não se quer errar, ficava a um clique de distância.
   */
  const abrirMenu = useCallback((
    identity: string, nome: string, em: { x: number; y: number }, tipo: 'perfil' | 'acoes' = 'perfil',
    // O servidor do lugar do clique. Sem ele, o aberto: lista de pessoas, chat e salas da
    // barra são dele. O palco passa o da call, que pode ser outro.
    onde?: { servidorId: number; servidorNome: string },
  ) => {
    const servidor = onde ?? (sessao?.servidor ? { servidorId: sessao.servidor.id, servidorNome: sessao.servidor.nome } : null);
    if (!servidor) return;
    // UM lugar responde "quem é essa pessoa NESTE servidor", para todos os caminhos que
    // abrem o cartão. A lista de membros vai com a etiqueta dela: quem decide se ela vale
    // para o servidor perguntado é `acharPessoa`, não quem chama.
    const pessoa = acharPessoa(identity, {
      servidorId: servidor.servidorId,
      membros: dadosDoServidor && { servidorId: dadosDoServidor.servidorId, lista: dadosDoServidor.membros },
      conhecidos: conhecidos.current,
      nome,
    });
    if (tipo === 'perfil') { setPerfilAberto({ pessoa, ...servidor }); return; }
    setMenu({ pessoa, ...servidor, em });
  }, [sessao?.servidor, dadosDoServidor]);

  const moderarPeloMenu = useCallback(async (alvo: number, acao: Acao, extra?: { minutos?: number; cargo?: number }) => {
    try { await moderar(acao, alvo, extra); } catch (e) { notas.mostrarFalha(e); }
    // O cargo que você acabou de dar aparece na lista da direita na hora, e não em 10 s.
    finally { recarregarServidor(); }
  }, [notas, recarregarServidor]);

  // O seletor do sistema, quando entra, escolhe a janela sozinho — abrir o nosso ali
  // significaria escolher duas vezes. Quem decide qual é qual é o processo principal.
  const compartilhar = useCallback(async () => {
    if (rm.screenOn) return rm.stopScreen();
    if (!seletorDoSistema) return setPicker(true);
    try { await rm.startScreen(null, true); } catch (e) { notas.mostrarFalha(e, 'Tela'); }
  }, [rm, seletorDoSistema, notas]);

  /**
   * Quem faz parte do servidor muda devagar — cargo novo, alguém que entrou. De dez em dez
   * segundos basta, e não concorre com a busca de salas, que é de quatro.
   *
   * Esse "de dez em dez" não existiu da v0.16.0 até aqui. O efeito dependia da sessão
   * INTEIRA e, lá dentro, gravava na sessão a lista de servidores: cada resposta fazia o
   * efeito nascer de novo e pedir outra vez, na hora — um pedido atrás do outro enquanto o
   * app estivesse aberto. Medido no app de verdade, parado, contra um servidor local:
   * 4.204 pedidos de /servidor em 10 s, contra 2 de /rooms. Contra a produção o ritmo é o
   * que a rede deixa, vezes cada app aberto, numa VPS de um núcleo. Por isso a dependência
   * é o NÚMERO do servidor, que não muda quando a resposta chega.
   *
   * O laço escondia uma coisa boa, por acidente: o que você mudava aparecia na lista na
   * hora. Isso continua, de propósito — quem muda algo daqui chama `recarregarServidor`.
   */
  useEffect(() => {
    const servidorId = sessao?.servidor?.id;
    if (!servidorId) return;
    let vivo = true;
    const buscar = () => verServidor(servidorId)
      .then((r) => {
        if (!vivo) return;
        // Pedir por um servidor de que você não faz mais parte devolve outro: o aberto
        // sumiu, e a lista de lá não entra como se fosse a daqui.
        if (r.servidor.id !== servidorId) { perdeuOServidorRef.current(servidorId); return; }
        setDadosDoServidor({ servidorId: r.servidor.id, cargos: r.cargos, membros: r.membros });
        setSessao((atual) => {
          if (!atual) return atual;
          // Você também está nessa lista, e é por ela que chega o que mudou em você com o app
          // aberto: cargo, castigo, nome. O `eu` só era lido ao abrir, entrar ou trocar de
          // servidor — quem ganhava cargo seguia sem os botões dele até reabrir o app. Só
          // troca se mudou: é a identidade do objeto que mantém a tela quieta.
          const euAgora = r.membros.find((m) => m.id === atual.eu?.id);
          return euAgora && JSON.stringify(euAgora) !== JSON.stringify(atual.eu)
            ? { ...atual, servidores: r.servidores, eu: euAgora }
            : { ...atual, servidores: r.servidores };
        });
      })
      .catch(() => undefined);
    buscar();
    const id = setInterval(buscar, 10_000);
    const pararDeDespertar = aoDespertar(buscar);
    return () => { vivo = false; clearInterval(id); pararDeDespertar(); };
  }, [sessao?.servidor?.id, buscarServidorDeNovo]);

  /**
   * Reordenar é só dado: a sala do LiveKit é o id, e arrastar não toca em id nenhum —
   * ninguém cai da call por causa disso. A lista muda na hora e a busca seguinte confirma;
   * dando errado, é ela que devolve a ordem de verdade.
   */
  const reordenar = useCallback(async (novaOrdem: { id: number; categoriaId: number | null }[]) => {
    setSalasDoServidor((antes) => antes && {
      ...antes,
      rooms: novaOrdem
        .map((n) => { const r = antes.rooms.find((x) => x.id === n.id); return r && { ...r, categoriaId: n.categoriaId }; })
        .filter((r): r is RoomInfo => !!r),
    });
    try { await reordenarSalas(novaOrdem); }
    catch (e) { notas.mostrar('erro', (e as Error).message); }
  }, [notas]);

  const fazerNoMenu = useCallback(async (a: AcaoDeSala) => {
    try {
      if (a.tipo === 'apagarCategoria') { await apagarCategoria(a.id); return; }
      setPedido(a);   // criar e renomear pedem um nome antes
    } catch (e) { notas.mostrar('erro', (e as Error).message); }
  }, [notas]);

  /** O que o menu do nome do servidor faz. */
  const fazerNoServidor = useCallback(async (a: AcaoNoServidor) => {
    if (a.tipo === 'convidar') { setConvidando(true); return; }
    if (a.tipo === 'configurar') { setPainel(true); return; }
    if (a.tipo === 'criarSala') { setPedido({ tipo: 'criar', sala: a.sala }); return; }
    // Sair já foi confirmado no próprio botão do menu. Quem CRIOU não chega aqui — o item
    // nem aparece —, e o servidor recusa de todo jeito.
    try { await sairDoServidor(); await recarregarSessao(); }
    catch (e) { notas.mostrar('erro', (e as Error).message); }
  }, [notas, recarregarSessao]);

  /** O que o botão direito EM CIMA de uma sala faz. */
  const fazerNaSala = useCallback(async (a: AcaoNaSala) => {
    if (a.tipo === 'quemVe') { setTrancando(a.sala); return; }
    if (a.tipo === 'renomear') { setPedido({ tipo: 'renomearSala', id: a.sala.id, nome: a.sala.name }); return; }
    // Apagar leva as mensagens junto: por isso pergunta, e diz o nome de quem vai sumir.
    if (!window.confirm(`Apagar a sala “${a.sala.name}”? As mensagens dela vão junto.`)) return;
    try { await apagarSala(a.sala.id); }
    catch (e) { notas.mostrar('erro', (e as Error).message); }
  }, [notas]);

  const comONome = useCallback(async (nome: string) => {
    if (!pedido) return;
    try {
      if (pedido.tipo === 'criar') await criarSala(nome, pedido.sala);
      else if (pedido.tipo === 'categoria') await criarCategoria(nome);
      else if (pedido.tipo === 'renomearCategoria') await renomearCategoria(pedido.id, nome);
      else if (pedido.tipo === 'renomearSala') await renomearSala(pedido.id, nome);
    } catch (e) { notas.mostrar('erro', (e as Error).message); }
    finally { setPedido(null); }
  }, [pedido, notas]);

  const salaAberta = rooms.find((s) => s.id === salaAbertaId) ?? null;

  /**
   * Quem é seu amigo AGORA, pela busca de salas: é isso que decide o que o menu e o
   * cartão de uma pessoa oferecem, e o que mantém o campo de escrever aberto.
   */
  const idsDosAmigos = new Set(amigos.ids);
  /**
   * A conversa aberta, com o `podeEscrever` recontado do que vale agora.
   *
   * Ele não fica guardado com a conversa de propósito: a amizade pode acabar com a janela
   * aberta, e o campo tem de fechar na volta seguinte da busca sem ninguém reabrir a tela.
   */
  const conversaNaTela = modoConversas && conversaAberta
    ? { ...conversaAberta, podeEscrever: idsDosAmigos.has(conversaAberta.com.id) }
    : null;

  /** O lugar que está sendo lido: uma sala do servidor, ou uma conversa privada. */
  const ondeEstouLendo: Onde | null = conversaNaTela
    ? { conversa: conversaNaTela.id }
    : (!modoConversas && salaAberta ? { sala: salaAberta.id } : null);
  const chat = useChat(ondeEstouLendo);

  /** Entra no modo conversas sem mexer no servidor aberto — voltar é um clique. */
  const abrirConversas = useCallback(() => {
    setModoConversas(true);
    setJogoAberto(null);
  }, []);

  /** Abre a conversa com alguém: da tela de amigos, do menu da pessoa ou do cartão. */
  const conversarCom = useCallback(async (pessoaId: number) => {
    try {
      setConversaAberta(await abrirConversa(pessoaId));
      setModoConversas(true);
      setJogoAberto(null);
    } catch (e) {
      notas.mostrarFalha(e, 'Conversa');
    }
  }, [notas]);

  /** Uma conversa escolhida na lista da esquerda. */
  const abrirConversaDaLista = useCallback((id: number) => {
    const c = conversas.find((x) => x.id === id);
    if (!c) return;
    // `podeEscrever` é recontado no desenho, a partir de quem é seu amigo agora.
    setConversaAberta({ id: c.id, com: c.com, podeEscrever: true });
    setModoConversas(true);
    setJogoAberto(null);
  }, [conversas]);

  /**
   * O botão de amizade, seja no menu do botão direito ou no cartão do perfil: as duas
   * telas oferecem a mesma coisa e caem aqui, para não haver duas regras.
   */
  const agirNaAmizade = useCallback(async (pessoaId: number | undefined, acao: ComAPessoa) => {
    if (!pessoaId) return;
    if (acao === 'conversar') { await conversarCom(pessoaId); return; }
    // Responder um pedido é na tela de amigos: é lá que se vê de quem ele é e desde quando.
    if (acao === 'responder') { setConversaAberta(null); abrirConversas(); return; }
    if (acao !== 'adicionar') return;
    try {
      const r = await pedirAmizade({ alvo: pessoaId });
      notas.mostrar('info', r.estado === 'amigos'
        ? `${r.amigo.nome} já tinha te chamado: vocês agora são amigos.`
        : `Pedido de amizade enviado para ${r.amigo.nome}.`);
      recarregarServidor();
    } catch (e) {
      notas.mostrarFalha(e, 'Amizade');
    }
  }, [conversarCom, abrirConversas, notas, recarregarServidor]);

  /**
   * Se quem lê pode apagar esta mensagem — espelho da regra do servidor, só para o botão
   * não aparecer onde seria recusado. O cargo do autor é o do vínculo DESTE servidor, que é
   * de onde a mensagem é: por isso a lista de membros daqui, e não o que se viu numa call.
   */
  const podeApagar = useCallback((m: Mensagem) => {
    const eu = sessao?.eu;
    if (!eu) return false;
    const autor = m.autorId ? membrosDoServidor.find((p) => p.id === m.autorId) ?? null : null;
    return podeApagarMensagem(eu, autor, { minha: m.autorId === eu.id, daSaga: salaAberta?.papel === 'notas' });
  }, [sessao?.eu, membrosDoServidor, salaAberta?.papel]);

  /**
   * As telas no ar, para a conversa avisar quem começou a transmitir.
   *
   * Sai da busca de salas, e não do LiveKit desta máquina: lendo uma sala de texto você
   * pode nem estar na call, e é justamente aí que não havia como saber. Ver lives.ts.
   */
  const lives = livesNasSalas(rooms, sessao?.eu ? identidadeDe(sessao.eu.id) : null);

  const assistirLive = useCallback(async (live: LiveNoChat) => {
    const sala = rooms.find((s) => s.id === live.salaId);
    const naVoz = sala ? paraAVoz(sala) : null;
    if (!naVoz) return;
    try {
      // Entrar é preciso: a faixa da transmissão só chega para quem está na sala. O que
      // não muda é o que você está lendo — a live vai para o quadro flutuante.
      await entrarNaVoz(naVoz);
      rm.assistir(live.identity);
    } catch (e) {
      rm.setError((e as Error).message);
    }
  }, [rooms, entrarNaVoz, paraAVoz, rm]);

  /**
   * "Entrar e assistir" pelo cartão da live na barra: o clique na sala mais a escolha da
   * transmissão. O que fica na tela segue a regra do clique na sala (`navegacao.ts`), e não
   * uma segunda: lendo uma conversa, você continua nela e a live vai para o quadro
   * flutuante; olhando o palco de outra call, o palco passa a ser o desta.
   */
  const assistirDaBarra = useCallback(async (sala: RoomInfo, identity: string) => {
    const naVoz = paraAVoz(sala);
    if (!naVoz) return;
    const lendo = rooms.find((s) => s.id === salaAbertaId) ?? null;
    if (oQueFazerAoClicar(sala, lendo, rm.salaDaVoz?.id ?? null).abrir) setSalaAbertaId(sala.id);
    setJogoAberto(null);
    try {
      await entrarNaVoz(naVoz);
      rm.assistir(identity);
    } catch (e) {
      rm.setError((e as Error).message);
    }
  }, [rm, entrarNaVoz, paraAVoz, rooms, salaAbertaId]);

  /**
   * O xadrez visto da busca de salas: quem está jogando (o controle ao lado do nome), a
   * mesa que é sua (a faixa e o menu de jogos) e o convite que chegou. Só valem os do
   * servidor aberto — mesa é de um servidor, como tudo o mais.
   */
  const jogosDaqui = jogos?.servidorId === servidorAberto ? jogos : null;
  const mesas = jogosDaqui?.mesas ?? SEM_MESAS;
  const jogandoPorPessoa = jogandoAgora(mesas);
  const minhaMesaAgora = sessao?.eu ? minhaMesa(mesas, sessao.eu.id) : null;
  const convite = jogosDaqui?.convites.find((c) => c.mesa !== conviteRespondido) ?? null;
  // Quem está na SUA call agora, por conta: é a primeira lista do lobby do xadrez.
  const naMinhaCall = new Set(
    rm.participants.map((p) => contaDaIdentidade(p.identity)).filter((id): id is number => id !== null),
  );

  /** O nome de quem joga, para o título do controle na linha: "Assistir TKP × Juninho". */
  const nomeDoJogador = useCallback((id: number | null) => (
    (id !== null && membrosDoServidor.find((m) => m.id === id)?.nome) || 'alguém'
  ), [membrosDoServidor]);

  /**
   * Convite novo toca o som, uma vez por mesa: quem foi chamado pode estar de fone, lendo
   * outra coisa. Na tela ele é um cartão que não some sozinho — quem chamou está esperando.
   */
  const conviteTocado = useRef<number | null>(null);
  useEffect(() => {
    if (!convite) { conviteTocado.current = null; return; }
    if (conviteTocado.current === convite.mesa) return;
    conviteTocado.current = convite.mesa;
    tocarAviso('convite', rm.deafened);
  }, [convite?.mesa, rm.deafened, tocarAviso]);

  /** Abre uma partida na tela — a sua, ou a de quem está jogando, como plateia. */
  const abrirPartida = useCallback((mesaId: number) => {
    const servidorId = sessao?.servidor?.id;
    if (!servidorId) return;
    setJogoAberto({ mesaId, servidorId });
  }, [sessao?.servidor?.id]);

  /** O item Xadrez do menu de jogos: volta para a sua mesa, ou abre uma e cai no lobby. */
  const abrirXadrez = useCallback(async () => {
    const servidorId = sessao?.servidor?.id;
    if (!servidorId) return;
    if (minhaMesaAgora) { setJogoAberto({ mesaId: minhaMesaAgora.id, servidorId }); return; }
    try {
      // Os padrões do desenho: 10 minutos para cada um, peças no sorteio. Os dois se trocam
      // no lobby, que é a tela que abre em seguida.
      const mesa = await abrirMesa(600, 'sorteio', servidorId);
      setJogoAberto({ mesaId: mesa.id, servidorId });
    } catch (e) { notas.mostrarFalha(e, 'Xadrez'); }
  }, [sessao?.servidor?.id, minhaMesaAgora, notas]);

  const responderConvite = useCallback(async (c: ConviteDeJogo, aceitar: boolean) => {
    const servidorId = jogosDaqui?.servidorId;
    if (!servidorId) return;
    setRespondendoConvite(true);
    try {
      await agirNaMesa(c.mesa, { acao: aceitar ? 'aceitar' : 'recusar' }, servidorId);
      setConviteRespondido(c.mesa);
      if (aceitar) setJogoAberto({ mesaId: c.mesa, servidorId });
    } catch (e) {
      // Cancelado, ou você entrou noutra partida no meio: o convite sai da tela do mesmo
      // jeito, senão fica um botão que não faz mais nada.
      setConviteRespondido(c.mesa);
      notas.mostrarFalha(e, 'Xadrez');
    } finally {
      setRespondendoConvite(false);
    }
  }, [jogosDaqui?.servidorId, notas]);

  // A sala que está aberta na tela está sendo lida: o aviso dela zera sozinho, tanto ao
  // abrir quanto quando chega mensagem com ela já aberta.
  const ultimaNaTela = chat.mensagens.at(-1)?.id ?? 0;
  useEffect(() => {
    if (!modoConversas && salaAberta?.tipo === 'texto' && ultimaNaTela) {
      setLidas((m) => marcarLido(m, salaAberta.id, ultimaNaTela));
    }
  }, [salaAberta?.id, salaAberta?.tipo, ultimaNaTela, modoConversas]);

  // O mesmo para a conversa privada aberta, no marcador dela — que é guardado à parte:
  // juntos, a sala 3 e a conversa 3 seriam a mesma chave.
  const conversaNaTelaId = conversaNaTela?.id ?? null;
  useEffect(() => {
    if (conversaNaTelaId && ultimaNaTela) {
      setLidasDeConversa((m) => marcarLido(m, conversaNaTelaId, ultimaNaTela));
    }
  }, [conversaNaTelaId, ultimaNaTela]);

  // Mudou a sua foto, o seu nome ou o do servidor: a lista da direita e a trilha mostram na
  // hora, sem esperar a busca de 10 s.
  const atualizarEu = useCallback((eu: Membro) => {
    setSessao((s) => (s ? { ...s, eu } : s));
    recarregarServidor();
  }, [recarregarServidor]);
  const atualizarServidor = useCallback((servidor: Servidor) => {
    setSessao((s) => (s ? { ...s, servidor } : s));
    recarregarServidor();
  }, [recarregarServidor]);

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

  /**
   * Sem servidor nenhum: a tela inicial.
   *
   * É onde toda conta nova começa — cadastrar deixou de jogar a pessoa dentro do
   * servidor de casa, e quem abre a porta é o convite. É também onde fica quem foi
   * banido de todos os servidores em que estava, para ler o motivo.
   */
  if (!sessao.servidor || !sessao.eu) {
    return (
      <div className="app-raiz">
        {window.desktop.platform === 'darwin' && (
          <div className="faixa-da-janela">
            <img src={logo} alt="" width={17} height={17} />
            <span>Saga</span>
          </div>
        )}
        {sessao.eu ? (
          <TelaInicial
            eu={sessao.eu}
            impedimento={sessao.impedimento}
            onEntrar={() => setNovoServidor('entrar')}
            onCriar={() => setNovoServidor('criar')}
            onConta={() => setDevices(true)}
            onRegistro={() => setRegistro(true)}
            onSair={logout}
          />
        ) : (
          // Só um servidor antigo responde sem dizer quem você é. Sem isso não há tela
          // para desenhar: resta o caminho de volta.
          <div className="connect">
            <div className="connect-card">
              <h1>Sem servidor</h1>
              <p className="muted">{sessao.impedimento ?? 'Você não faz parte de nenhum servidor agora.'}</p>
              <button className="primary" onClick={logout}>Sair da conta</button>
            </div>
          </div>
        )}
        {novoServidor && (
          <NovoServidor
            inicial={novoServidor}
            onPronto={trocarDeServidor}
            onClose={() => setNovoServidor(null)}
          />
        )}
        {devices && sessao.eu && (
          <PainelDaConta
            eu={sessao.eu}
            room={rm.room}
            souBerserk={sessao.eu.turbo}
            donoDaSaga={!!sessao.eu.donoDaSaga}
            volumeDoSoundboard={rm.volumeDoSoundboard}
            onVolumeDoSoundboard={rm.definirVolumeDoSoundboard}
            onEu={atualizarEu}
            onRegistro={() => { setDevices(false); setRegistro(true); }}
            // O Berserk dado pelo painel da Saga aparece na lista ao fechar, e não em 10 s.
            onClose={() => { setDevices(false); recarregarServidor(); }}
          />
        )}
        {registro && <RegistroDeErros onClose={() => setRegistro(false)} />}
        <Avisos avisos={notas.avisos} onFechar={notas.fechar} onRegistro={() => setRegistro(true)} />
        <UpdateToast estado={atualizacao} />
        <Versao />
      </div>
    );
  }

  const eu = sessao.eu;
  const servidor = sessao.servidor;

  /** Abre o palco da call em que você está — do chat, da barra ou do cartão da live. */
  const abrirPalcoDaVoz = () => {
    if (!rm.salaDaVoz) return;
    // A voz pode estar noutro servidor: voltar para ela é voltar para lá também,
    // senão o id da sala não existe na lista daqui e o palco fica vazio.
    if (rm.salaDaVoz.servidorId !== servidor.id) trocarDeServidor(rm.salaDaVoz.servidorId);
    setJogoAberto(null);
    setSalaAbertaId(rm.salaDaVoz.id);
  };

  /** O adversário da sua partida, para a faixa dizer de quem é a vez. */
  const oOutroDaMesa = minhaMesaAgora
    ? nomeDoJogador(minhaMesaAgora.brancas === eu.id ? minhaMesaAgora.pretas : minhaMesaAgora.brancas)
    : null;

  return (
    <div className="app-raiz">
      {/* No Mac os botões da janela ficam POR CIMA do conteúdo, então o cabeçalho do
          servidor dividia a linha com eles — e um nome grande no alto da janela é lido
          como o nome do programa, não como onde você está. A faixa devolve o lugar dos
          botões à janela e diz quem é o app; o servidor desce para dentro da barra, que
          é o lugar dele. No Windows não existe: lá a barra de título é do sistema. */}
      {window.desktop.platform === 'darwin' && (
        <div className="faixa-da-janela">
          <img src={logo} alt="" width={17} height={17} />
          <span>Saga</span>
        </div>
      )}
    {/* Sem a lista de pessoas, a coluna dela sai da grade: no modo conversas não há
        servidor aberto para ter gente. */}
    <div className={`app ${modoConversas ? 'sem-pessoas' : ''}`}>
      <Sidebar
        rooms={rooms}
        categorias={categorias}
        salasCarregadas={!!salasDaqui}
        podeGerirSalas={pode(eu.cargo, 'gerirSalas')}
        onReordenar={reordenar}
        onMenuDeSalas={(em, categoria) => setMenuDeSalas({ em, categoria })}
        onMenuDaSala={(sala, em) => setMenuDaSala({ sala, em })}
        pollError={pollError}
        eu={eu}
        servidor={servidor}
        rm={rm}
        onAbrir={abrirSala}
        lives={lives}
        onAssistirLive={assistirDaBarra}
        onAbrirPalco={abrirPalcoDaVoz}
        jogando={jogandoPorPessoa}
        nomeDoJogador={nomeDoJogador}
        minhaPartida={minhaMesaAgora?.estado ?? null}
        onPartida={abrirPartida}
        onXadrez={abrirXadrez}
        // Com a partida na tela, nenhuma sala está aberta: acender uma diria "você está
        // aqui" sobre um lugar que não é o que se está vendo.
        salaAbertaId={jogoAberto ? null : salaAbertaId}
        onShare={compartilhar}
        onSettings={() => setDevices(true)}
        // As salas da barra são do servidor aberto; quem está nelas, também.
        pessoas={vistosEm(conhecidos.current, servidor.id)}
        onPessoa={abrirMenu}
        onMenuDoServidor={(em) => setMenuDoServidor(em)}
        statusEscolhido={statusEscolhido}
        onStatus={escolherStatus}
        onSoundboard={() => setSoundboard(true)}
        onLogout={logout}
        modoConversas={modoConversas}
        conversas={conversas}
        conversaAbertaId={conversaNaTela?.id ?? null}
        emAmigos={modoConversas && !conversaNaTela}
        pedidos={amigos.pedidos}
        onAbrirConversa={abrirConversaDaLista}
        onAbrirAmigos={() => { setConversaAberta(null); abrirConversas(); }}
      />
      <Stage
        rm={rm}
        // O palco é da call, e a call pode ser de outro servidor.
        pessoas={vistosEm(conhecidos.current, rm.salaDaVoz?.servidorId)}
        onPessoa={abrirMenu}
        salaAberta={modoConversas ? null : salaAberta}
        servidorId={servidor.id}
        onVoltarAVoz={abrirPalcoDaVoz}
        conversa={conversaNaTela}
        telaDeAmigos={modoConversas && !conversaNaTela ? (
          <TelaDeAmigos onConversar={conversarCom} onMudou={recarregarServidor} />
        ) : undefined}
        chat={chat}
        meuId={eu.id}
        podeApagar={podeApagar}
        lives={lives}
        onAssistirLive={assistirLive}
        // A partida da dupla toma o palco. A live que você assiste vai junto, dentro da
        // coluna dela — flutuando no canto, taparia o tabuleiro.
        jogo={jogoAberto ? (live) => (
          <TelaDoXadrez
            key={jogoAberto.mesaId}
            mesaId={jogoAberto.mesaId}
            servidorId={jogoAberto.servidorId}
            euId={eu.id}
            membros={membrosDoServidor}
            naCall={naMinhaCall}
            jogando={new Set(jogandoPorPessoa.keys())}
            live={live}
            onFechar={() => setJogoAberto(null)}
            onAviso={notas.mostrar}
          />
        ) : undefined}
        faixaDaPartida={minhaMesaAgora && !jogoAberto ? (
          <FaixaDaPartida
            estado={minhaMesaAgora.estado}
            titulo={minhaMesaAgora.estado === 'lobby'
              ? 'mesa aberta'
              : `${nomeDoJogador(minhaMesaAgora.brancas)} × ${nomeDoJogador(minhaMesaAgora.pretas)}`}
            minhaVez={ehMinhaVez(minhaMesaAgora, eu.id)}
            outroNome={oOutroDaMesa}
            onVoltar={() => abrirPartida(minhaMesaAgora.id)}
          />
        ) : undefined}
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
        <PainelDaConta
          eu={eu}
          room={rm.room}
          servidorNome={servidor.nome}
          souBerserk={eu.turbo}
          donoDaSaga={!!eu.donoDaSaga}
          volumeDoSoundboard={rm.volumeDoSoundboard}
          onVolumeDoSoundboard={rm.definirVolumeDoSoundboard}
          onEu={atualizarEu}
          onRegistro={() => { setDevices(false); setRegistro(true); }}
          onClose={() => setDevices(false)}
        />
      )}
      {painel && (
        <PainelDoServidor
          eu={eu}
          servidor={servidor}
          donoDaSaga={!!eu.donoDaSaga}
          onServidor={atualizarServidor}
          onSaiu={() => { setPainel(false); recarregarSessao(); }}
          // Cargos e pessoas mexidos lá dentro aparecem na lista da direita ao fechar.
          onClose={() => { setPainel(false); recarregarServidor(); }}
        />
      )}
      {soundboard && (
        <Soundboard
          eu={eu}
          cargos={cargos}
          naSala={rm.status === 'connected'}
          onTocar={rm.tocarSom}
          onParar={rm.pararSom}
          tocando={rm.somTocando}
          restantes={rm.sonsRestantes}
          onClose={() => setSoundboard(false)}
        />
      )}
      {/* A lista de pessoas é do SERVIDOR aberto. No modo conversas não há um: a coluna
          sai inteira, em vez de mostrar gente que não tem nada com o que está na tela. */}
      {!modoConversas && (
      <ListaDeMembros
        membros={membrosDoServidor}
        cargos={cargos}
        naVoz={naVoz}
        eu={eu}
        // Quem joga fora da call só aparece aqui: é por esta lista que se assiste a ele.
        jogando={jogandoPorPessoa}
        nomeDoJogador={nomeDoJogador}
        onPartida={abrirPartida}
        // Pelo mesmo caminho de todo mundo: a lista tem o membro na mão, mas montar o
        // objeto aqui é como as duas versões do cartão nasceram.
        onPessoa={(m, em, tipo) => abrirMenu(identidadeDe(m.id), m.nome, em, tipo)}
      />
      )}

      <TrilhaDeServidores
        servidores={sessao.servidores.length ? sessao.servidores : [servidor]}
        atual={servidor.id}
        modoConversas={modoConversas}
        // Um número só: mensagens privadas por ler mais pedidos de amizade esperando.
        aviso={conversas.reduce((n, c) => n + c.naoLidas, 0) + amigos.pedidos}
        onConversas={abrirConversas}
        // Clicar num servidor SAI do modo conversas: é ele que você está abrindo.
        onEscolher={(id) => { setModoConversas(false); if (id !== servidor.id) trocarDeServidor(id); }}
        // Botão direito noutro servidor: troca primeiro e só então abre — o painel lê
        // o servidor da sessão ao montar, e abrir antes mostraria o de onde você veio.
        onAjustar={async (id) => { if (id !== servidor.id) await trocarDeServidor(id); setPainel(true); }}
        onConfigurar={() => setNovoServidor('entrar')}
      />

      {menu && (
        <MenuDaPessoa
          pessoa={menu.pessoa}
          eu={eu}
          cargos={cargos.filter((c) => c.nivel < (eu.cargo?.nivel ?? 0))}
          em={menu.em}
          deOutroServidor={menu.servidorId !== servidor.id ? menu.servidorNome : null}
          volume={rm.volumeDe(menu.pessoa.identity)}
          onVolume={(v) => rm.definirVolume(menu.pessoa.identity, v)}
          onAcao={async (acao, extra) => {
            if (menu.pessoa.usuarioId !== undefined) await moderarPeloMenu(menu.pessoa.usuarioId, acao, extra);
          }}
          amizade={comAPessoa(menu.pessoa.usuarioId, { euId: eu.id, amigos: idsDosAmigos })}
          onAmizade={(acao) => agirNaAmizade(menu.pessoa.usuarioId, acao)}
          onVerPerfil={() => setPerfilAberto({ pessoa: menu.pessoa, servidorId: menu.servidorId, servidorNome: menu.servidorNome })}
          onClose={() => setMenu(null)}
        />
      )}
      {perfilAberto && (
        <CartaoDoPerfil
          pessoa={perfilAberto.pessoa}
          servidorNome={perfilAberto.servidorNome}
          naVoz={perfilAberto.pessoa.usuarioId !== undefined && naVoz.has(perfilAberto.pessoa.usuarioId)}
          souEu={perfilAberto.pessoa.usuarioId === eu.id}
          volume={rm.volumeDe(perfilAberto.pessoa.identity)}
          onVolume={(v) => rm.definirVolume(perfilAberto.pessoa.identity, v)}
          amizade={comAPessoa(perfilAberto.pessoa.usuarioId, { euId: eu.id, amigos: idsDosAmigos })}
          onAmizade={(acao) => agirNaAmizade(perfilAberto.pessoa.usuarioId, acao)}
          onClose={() => setPerfilAberto(null)}
        />
      )}
      {menuDaSala && (
        <MenuDaSala
          sala={menuDaSala.sala}
          em={menuDaSala.em}
          onAcao={fazerNaSala}
          onClose={() => setMenuDaSala(null)}
        />
      )}
      {trancando && (
        <QuemPodeVer
          sala={trancando}
          cargos={cargos}
          eu={eu}
          onPronto={() => setTrancando(null)}
          onClose={() => setTrancando(null)}
        />
      )}
      {menuDoServidor && (
        <MenuDoServidor
          em={menuDoServidor}
          eu={eu}
          nomeDoServidor={servidor.nome}
          podeGerirSalas={pode(eu.cargo, 'gerirSalas')}
          onAcao={fazerNoServidor}
          onClose={() => setMenuDoServidor(null)}
        />
      )}
      {convidando && (
        <Convidar nomeDoServidor={servidor.nome} onClose={() => setConvidando(false)} />
      )}
      {menuDeSalas && (
        <MenuDeSalas
          em={menuDeSalas.em}
          categoria={menuDeSalas.categoria}
          onAcao={fazerNoMenu}
          onClose={() => setMenuDeSalas(null)}
        />
      )}
      {pedido && (
        <PedirNome
          titulo={
            pedido.tipo === 'criar' ? (pedido.sala === 'voz' ? 'Nova sala de voz' : 'Nova sala de chat')
            : pedido.tipo === 'categoria' ? 'Nova categoria'
            : pedido.tipo === 'renomearSala' ? 'Renomear sala' : 'Renomear categoria'
          }
          rotulo={pedido.tipo === 'categoria' || pedido.tipo === 'renomearCategoria' ? 'Nome da categoria' : 'Nome da sala'}
          exemplo={pedido.tipo === 'criar' ? (pedido.sala === 'voz' ? 'Bancada' : 'recados') : 'Jogos'}
          inicial={pedido.tipo === 'renomearCategoria' || pedido.tipo === 'renomearSala' ? pedido.nome : ''}
          confirmar={pedido.tipo === 'criar' || pedido.tipo === 'categoria' ? 'Criar' : 'Renomear'}
          onPronto={comONome}
          onClose={() => setPedido(null)}
        />
      )}
      {novoServidor && (
        <NovoServidor
          inicial={novoServidor}
          onPronto={trocarDeServidor}
          onClose={() => setNovoServidor(null)}
        />
      )}
      {registro && <RegistroDeErros onClose={() => setRegistro(false)} />}
      <Avisos
        avisos={notas.avisos}
        // O convite para jogar fica na mesma pilha, mas não some sozinho: quem chamou está
        // esperando a resposta.
        extra={convite && (
          <ConviteDeXadrez
            convite={convite}
            ocupado={respondendoConvite}
            onJogar={() => responderConvite(convite, true)}
            onRecusar={() => responderConvite(convite, false)}
          />
        )}
        onFechar={notas.fechar}
        onRegistro={() => setRegistro(true)}
      />
      <UpdateToast estado={atualizacao} />
      <Versao />
    </div>
    </div>
  );
}

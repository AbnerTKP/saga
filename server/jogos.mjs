// As mesas de xadrez: quem abriu, quem foi chamado, quem joga, quem assiste e o relógio.
//
// As regras do jogo são do `xadrez.mjs`; isto aqui é a MESA em volta dele. Puro como as outras
// regras: sem SQL e sem HTTP. Quem é cada pessoa — o nome neste servidor, a foto, o
// identificador — chega pronto de quem chama, porque perguntar isso ao banco não é daqui.
//
// Mora na memória do processo, como `digitando.mjs`, e isso tem um preço que precisa estar
// escrito: REINICIAR O SERVIDOR ENCERRA TODAS AS PARTIDAS. Publicar o servidor com gente no
// meio de uma partida a apaga, e a tela dos dois passa a ouvir "essa mesa não existe mais".
// Guardar no banco pediria tabela e migração — e migração publicada não se desfaz — para uma
// coisa que dura minutos.
//
// Não há empurrão nem relógio de fundo. Quem está na mesa pergunta por ela; quem foi chamado
// fica sabendo na busca de salas que já acontece de 4 em 4 segundos. O tempo que acaba é
// conferido a cada pergunta e a cada ação: um relógio de fundo só descobriria antes o que
// ninguém está olhando.
import { ErroDeConta } from './contas.mjs';
import { POSICAO_INICIAL, ErroDeLance, lerFen, escreverFen, lancesLegais, jogar, chaveDeRepeticao, situacao } from './xadrez.mjs';

/** Os relógios que se escolhe, em segundos POR JOGADOR. `null` é sem relógio. */
export const TEMPOS = [180, 300, 600, 1800];
export const CORES = ['brancas', 'pretas', 'sorteio'];

/**
 * Quem leu a mesa há mais que isto saiu da plateia. Quem assiste pergunta pela mesa bem mais
 * amiúde que isso, então só some quem fechou a tela.
 */
export const PLATEIA = 6000;
/** Mesa esperando alguém, ou partida acabada, sem ninguém mexer há isto: some. */
export const ESQUECIDA = 30 * 60_000;
/** Partida em andamento sem nenhum dos dois jogadores aparecer há isto: some. */
export const ABANDONADA = 10 * 60_000;

// O convite mostra a cor de quem RECEBE: o anfitrião escolher brancas é o convidado jogar de
// pretas, e é isso que o convidado precisa ler antes de aceitar.
const COR_DO_CONVIDADO = { brancas: 'pretas', pretas: 'brancas', sorteio: 'sorteio' };

const naoExiste = () => new ErroDeConta('Essa mesa não existe mais.', 404);
const outraCor = (cor) => (cor === 'w' ? 'b' : 'w');
const corDe = (mesa, id) => (mesa.brancas === id ? 'w' : mesa.pretas === id ? 'b' : null);
const idDaCor = (mesa, cor) => (cor === 'w' ? mesa.brancas : mesa.pretas);
const jogandoNela = (mesa, id) => mesa.estado === 'jogando' && corDe(mesa, id) !== null;

function validarEscolha({ tempo, cor }) {
  if (tempo !== null && !TEMPOS.includes(tempo)) {
    throw new ErroDeConta('O relógio é sem tempo, ou de 3, 5, 10 ou 30 minutos.', 400);
  }
  if (!CORES.includes(cor)) throw new ErroDeConta('As peças são brancas, pretas ou sorteio.', 400);
  return { tempo, cor };
}

/** O papel de quem pergunta. Depois de começar, quem abriu a mesa é só um dos jogadores. */
function papelDe(mesa, id) {
  if (mesa.estado === 'lobby') {
    if (mesa.anfitriao === id) return 'anfitriao';
    if (mesa.convidado === id) return 'convidado';
    return 'plateia';
  }
  const cor = corDe(mesa, id);
  return cor === 'w' ? 'brancas' : cor === 'b' ? 'pretas' : 'plateia';
}

/** Quanto sobra a cada lado neste instante, sem mexer em nada. Só corre o de quem tem a vez. */
function restantes(mesa, agora) {
  const { restante, desde } = mesa.relogio;
  const correndo = mesa.estado === 'jogando' ? mesa.posicao.vez : null;
  return {
    w: Math.max(0, restante.w - (correndo === 'w' ? agora - desde : 0)),
    b: Math.max(0, restante.b - (correndo === 'b' ? agora - desde : 0)),
    correndo,
  };
}

function verRelogio(mesa, agora) {
  if (!mesa.tempo) return null;
  // Na mesa esperando ainda não há relógio correndo: mostra o que foi escolhido.
  if (!mesa.relogio) return { brancas: mesa.tempo * 1000, pretas: mesa.tempo * 1000, correndo: null };
  const r = restantes(mesa, agora);
  return { brancas: r.w, pretas: r.b, correndo: r.correndo };
}

/** Termina a partida parando os relógios no instante em que ela acabou. */
function encerrar(mesa, fim, quando) {
  if (mesa.relogio) {
    const r = restantes(mesa, quando);
    mesa.relogio = { restante: { w: r.w, b: r.b }, desde: quando };
  }
  mesa.estado = 'fim';
  mesa.fim = fim;
  mesa.empateOferecidoPor = null;
  mesa.revanchePedidaPor = null;
  mesa.mexidaEm = quando;
}

/**
 * O tempo de quem tem a vez acabou? Então a partida acabou, no instante em que ele zerou — e
 * não no instante em que alguém perguntou. Um lance que chegue depois disso não salva ninguém.
 */
function conferirTempo(mesa, agora) {
  if (mesa.estado !== 'jogando' || !mesa.relogio) return;
  const vez = mesa.posicao.vez;
  const zerouEm = mesa.relogio.desde + mesa.relogio.restante[vez];
  if (agora < zerouEm) return;
  encerrar(mesa, { motivo: 'tempo', vencedor: idDaCor(mesa, outraCor(vez)) }, zerouEm);
}

/**
 * Um registro por processo. É fábrica, como o de quem está digitando, para o teste criar o seu
 * com relógio e sorteio próprios.
 *
 * Todas as funções recebem `ctx`, o pedido visto por quem chama: `sid` (o servidor do pedido),
 * `eu` (o id de quem pede), `pessoa(id)` (como a pessoa aparece NESTE servidor) e
 * `membroAtivo(id)` (se ela é do servidor e não está banida).
 */
export function criarMesas({
  relogio = Date.now,
  sortearCor = () => (Math.random() < 0.5 ? 'brancas' : 'pretas'),
} = {}) {
  /** id -> mesa. A ordem do Map é a de criação, que é a ordem em que as mesas aparecem. */
  const mesas = new Map();
  let proxima = 1;

  /**
   * Jogando uma partida em andamento, em QUALQUER servidor. É o que impede a mesma pessoa de
   * estar em dois tabuleiros: a partida é da pessoa, e a pessoa é uma só.
   */
  const emPartida = (id) => [...mesas.values()].some((m) => jogandoNela(m, id));

  /** A cada acesso: primeiro os relógios, porque é o fim por tempo que dá à mesa a hora da faxina. */
  function faxina(agora) {
    for (const mesa of mesas.values()) conferirTempo(mesa, agora);
    for (const [id, mesa] of mesas) {
      const esquecida = mesa.estado !== 'jogando' && agora - mesa.mexidaEm >= ESQUECIDA;
      const abandonada = mesa.estado === 'jogando' && agora - mesa.jogadorVistoEm >= ABANDONADA;
      if (esquecida || abandonada) mesas.delete(id);
    }
  }

  function acharMesa(ctx, id) {
    const mesa = mesas.get(Number(id));
    // Mesa de outro servidor responde igual a mesa que não existe: saber o número de uma mesa
    // alheia não abre porta, como não abre o de um servidor.
    if (!mesa || mesa.sid !== ctx.sid) throw naoExiste();
    return mesa;
  }

  function exigirLivres(ctx, ids) {
    for (const id of ids) {
      if (emPartida(id)) {
        throw new ErroDeConta(id === ctx.eu ? 'Você já está noutra partida.' : `${ctx.pessoa(id).nome} já está noutra partida.`, 409);
      }
    }
  }

  function comecar(mesa, { brancas, pretas }, agora) {
    // Quem começou a jogar não está mais esperando em mesa nenhuma: as mesas que os dois
    // tinham aberto somem, e com elas os convites que elas mandaram — senão alguém aceitaria
    // um convite de quem já está no meio de outra partida.
    for (const [id, outra] of mesas) {
      if (outra !== mesa && outra.estado === 'lobby' && [brancas, pretas].includes(outra.anfitriao)) mesas.delete(id);
    }
    const posicao = lerFen(POSICAO_INICIAL);
    Object.assign(mesa, {
      estado: 'jogando',
      brancas,
      pretas,
      convidado: null,
      recusou: null,
      posicao,
      chaves: [chaveDeRepeticao(posicao)],
      lances: [],
      xeque: false,
      // O relógio das brancas corre desde o aceite: quem chamou já está de frente para o
      // tabuleiro, e partida com relógio parado esperando o primeiro lance vira espera sem fim.
      relogio: mesa.tempo ? { restante: { w: mesa.tempo * 1000, b: mesa.tempo * 1000 }, desde: agora } : null,
      empateOferecidoPor: null,
      revanchePedidaPor: null,
      fim: null,
      mexidaEm: agora,
      jogadorVistoEm: agora,
    });
  }

  function soAnfitriaoNoLobby(mesa, ctx) {
    if (mesa.estado !== 'lobby') throw new ErroDeConta('A partida já começou.', 409);
    if (mesa.anfitriao !== ctx.eu) throw new ErroDeConta('Só quem abriu a mesa pode fazer isso.', 403);
  }

  // Convite cancelado, trocado por outro ou já aceito: a tela de quem foi chamado demora até
  // uma busca de salas para saber, e o clique dela merece um motivo, não um "proibido".
  function soConvidado(mesa, ctx) {
    if (mesa.estado !== 'lobby' || mesa.convidado !== ctx.eu) throw new ErroDeConta('Esse convite não vale mais.', 409);
  }

  function soJogadorComPartidaAndando(mesa, ctx) {
    if (mesa.estado === 'lobby') throw new ErroDeConta('A partida ainda não começou.', 409);
    const cor = corDe(mesa, ctx.eu);
    if (!cor) throw new ErroDeConta('Você não está jogando esta partida.', 403);
    if (mesa.estado === 'fim') throw new ErroDeConta('A partida já terminou.', 409);
    return cor;
  }

  const acoes = {
    configurar(mesa, ctx, dados) {
      soAnfitriaoNoLobby(mesa, ctx);
      // O que não veio fica como estava; `tempo: null` veio, e quer dizer sem relógio.
      const escolha = validarEscolha({
        tempo: 'tempo' in dados ? dados.tempo : mesa.tempo,
        cor: 'cor' in dados ? dados.cor : mesa.cor,
      });
      mesa.tempo = escolha.tempo;
      mesa.cor = escolha.cor;
    },

    chamar(mesa, ctx, { alvo }) {
      soAnfitriaoNoLobby(mesa, ctx);
      const id = Number(alvo);
      if (id === ctx.eu) throw new ErroDeConta('Você não pode chamar a si mesmo.', 400);
      if (!id || !ctx.membroAtivo(id)) throw new ErroDeConta('Essa pessoa não faz parte do servidor.', 404);
      if (emPartida(id)) throw new ErroDeConta(`${ctx.pessoa(id).nome} está numa partida agora.`, 409);
      // Um convite por vez: chamar outra pessoa substitui, e a recusa anterior deixa de ser notícia.
      mesa.convidado = id;
      mesa.recusou = null;
    },

    cancelarConvite(mesa, ctx) {
      soAnfitriaoNoLobby(mesa, ctx);
      mesa.convidado = null;
    },

    aceitar(mesa, ctx, _dados, agora) {
      soConvidado(mesa, ctx);
      exigirLivres(ctx, [ctx.eu, mesa.anfitriao]);
      const doAnfitriao = mesa.cor === 'sorteio' ? sortearCor() : mesa.cor;
      comecar(mesa, doAnfitriao === 'brancas'
        ? { brancas: mesa.anfitriao, pretas: ctx.eu }
        : { brancas: ctx.eu, pretas: mesa.anfitriao }, agora);
    },

    recusar(mesa, ctx) {
      soConvidado(mesa, ctx);
      mesa.recusou = ctx.eu;
      mesa.convidado = null;
    },

    lance(mesa, ctx, { de, para, promocao }, agora) {
      if (mesa.estado === 'lobby') throw new ErroDeConta('A partida ainda não começou.', 409);
      const cor = corDe(mesa, ctx.eu);
      if (!cor) throw new ErroDeConta('Você não está jogando esta partida.', 403);
      // O lance chegou depois do fim — o tempo zerou, o outro desistiu ou aceitou o empate. Não
      // vale, e não é erro de quem jogou: a resposta é a mesa como ficou, que é o que a tela
      // dele precisa desenhar.
      if (mesa.estado === 'fim') return;
      if (mesa.posicao.vez !== cor) throw new ErroDeConta('Não é a sua vez.', 409);

      let feito;
      try {
        feito = jogar(mesa.posicao, { de, para, promocao });
      } catch (e) {
        if (e instanceof ErroDeLance) throw new ErroDeConta(e.message, 400);
        throw e;
      }
      // Desconta DEPOIS de saber que o lance vale: lance recusado não gasta o tempo de ninguém.
      // A faxina já conferiu, com este mesmo `agora`, que ainda havia tempo.
      if (mesa.relogio) {
        mesa.relogio.restante[cor] -= agora - mesa.relogio.desde;
        mesa.relogio.desde = agora;
      }
      mesa.posicao = feito.posicao;
      mesa.chaves.push(chaveDeRepeticao(feito.posicao));
      mesa.lances.push({ san: feito.lance.san, de: feito.lance.de, para: feito.lance.para });
      // Jogar em vez de responder à oferta de empate é recusá-la. Quem OFERECEU pode oferecer
      // na própria vez e jogar em seguida: a oferta continua de pé para o outro responder.
      if (mesa.empateOferecidoPor !== null && mesa.empateOferecidoPor !== ctx.eu) mesa.empateOferecidoPor = null;

      const agoraNoTabuleiro = situacao(feito.posicao, mesa.chaves);
      mesa.xeque = agoraNoTabuleiro.xeque;
      const { fim } = agoraNoTabuleiro;
      if (fim) encerrar(mesa, { motivo: fim.motivo, vencedor: fim.vencedor ? idDaCor(mesa, fim.vencedor) : null }, agora);
    },

    desistir(mesa, ctx, _dados, agora) {
      const cor = soJogadorComPartidaAndando(mesa, ctx);
      encerrar(mesa, { motivo: 'desistencia', vencedor: idDaCor(mesa, outraCor(cor)) }, agora);
    },

    oferecerEmpate(mesa, ctx, _dados, agora) {
      soJogadorComPartidaAndando(mesa, ctx);
      const oferta = mesa.empateOferecidoPor;
      // Os dois oferecendo é os dois querendo: não há o que perguntar a mais ninguém.
      if (oferta !== null && oferta !== ctx.eu) {
        encerrar(mesa, { motivo: 'empate', vencedor: null }, agora);
        return;
      }
      mesa.empateOferecidoPor = ctx.eu;
    },

    aceitarEmpate(mesa, ctx, _dados, agora) {
      soJogadorComPartidaAndando(mesa, ctx);
      if (mesa.empateOferecidoPor === null) throw new ErroDeConta('Ninguém ofereceu empate.', 409);
      if (mesa.empateOferecidoPor === ctx.eu) throw new ErroDeConta('Quem ofereceu o empate não aceita a própria oferta.', 409);
      encerrar(mesa, { motivo: 'empate', vencedor: null }, agora);
    },

    recusarEmpate(mesa, ctx) {
      soJogadorComPartidaAndando(mesa, ctx);
      if (mesa.empateOferecidoPor === ctx.eu) throw new ErroDeConta('Quem ofereceu o empate não recusa a própria oferta.', 409);
      // Sem oferta nenhuma não é erro: um lance pode tê-la levado entre a tela desenhar e o clique.
      mesa.empateOferecidoPor = null;
    },

    revanche(mesa, ctx, _dados, agora) {
      if (mesa.estado !== 'fim') throw new ErroDeConta('A revanche é depois do fim da partida.', 409);
      if (!corDe(mesa, ctx.eu)) throw new ErroDeConta('Você não está jogando esta partida.', 403);
      if (mesa.revanchePedidaPor === null || mesa.revanchePedidaPor === ctx.eu) {
        mesa.revanchePedidaPor = ctx.eu;
        return;
      }
      // O segundo pedido é o aceite: outra partida na MESMA mesa, quem assistia continua
      // assistindo, e as cores trocam — quem jogou de brancas agora joga de pretas.
      const trocadas = { brancas: mesa.pretas, pretas: mesa.brancas };
      exigirLivres(ctx, [trocadas.brancas, trocadas.pretas]);
      comecar(mesa, trocadas, agora);
    },

    fechar(mesa, ctx) {
      if (mesa.estado === 'jogando') {
        if (corDe(mesa, ctx.eu)) throw new ErroDeConta('A partida está em andamento: desista para sair.', 409);
        throw new ErroDeConta('Só quem joga fecha a mesa.', 403);
      }
      if (mesa.estado === 'lobby' && mesa.anfitriao !== ctx.eu) throw new ErroDeConta('Só quem abriu a mesa pode fechá-la.', 403);
      if (mesa.estado === 'fim' && !corDe(mesa, ctx.eu)) throw new ErroDeConta('Só quem jogou fecha a mesa.', 403);
      mesas.delete(mesa.id);
      return { ok: true };
    },
  };

  function plateiaDe(mesa, agora) {
    for (const [id, visto] of mesa.plateia) if (agora - visto >= PLATEIA) mesa.plateia.delete(id);
    // Quem assistia e passou a jogar — foi chamado e aceitou — sai da lista pela pergunta de
    // sempre, e não por uma limpeza que alguém teria de lembrar de fazer.
    return [...mesa.plateia.keys()].filter((id) => papelDe(mesa, id) === 'plateia');
  }

  function verMesa(mesa, ctx, agora) {
    const quem = (id) => (id ? ctx.pessoa(id) : null);
    const vez = mesa.posicao.vez;
    const daVez = mesa.estado === 'jogando' && idDaCor(mesa, vez) === ctx.eu;
    const ultimo = mesa.lances.at(-1);
    return {
      id: mesa.id,
      estado: mesa.estado,
      anfitriao: quem(mesa.anfitriao),
      tempo: mesa.tempo,
      cor: mesa.cor,
      convidado: quem(mesa.convidado),
      recusou: quem(mesa.recusou),
      brancas: quem(mesa.brancas),
      pretas: quem(mesa.pretas),
      fen: escreverFen(mesa.posicao),
      vez,
      xeque: mesa.xeque,
      lances: mesa.lances.map(({ san, de, para }) => ({ san, de, para })),
      ultimo: ultimo ? { de: ultimo.de, para: ultimo.para } : null,
      // Só quem tem a vez recebe os lances possíveis: é para a tela dele mostrar para onde a
      // peça vai. Quem vale é sempre o servidor — isto é ajuda, não autorização.
      legais: daVez ? lancesLegais(mesa.posicao).map(({ de, para, promocao, san }) => ({ de, para, promocao, san })) : [],
      relogio: verRelogio(mesa, agora),
      empateOferecidoPor: mesa.empateOferecidoPor,
      revanchePedidaPor: mesa.revanchePedidaPor,
      fim: mesa.fim,
      plateia: plateiaDe(mesa, agora).map(ctx.pessoa),
      eu: papelDe(mesa, ctx.eu),
      // O relógio vem em "quanto falta agora"; com a hora do servidor junto, a tela desconta
      // o que passar até a próxima pergunta sem depender do relógio da máquina de ninguém.
      agora,
    };
  }

  return {
    /**
     * O que vai de carona no `/rooms`: as mesas DESTE servidor, para a tela marcar quem está
     * jogando, e os convites de quem perguntou.
     */
    resumo(ctx) {
      const agora = relogio();
      faxina(agora);
      // Buscar as salas é o app do jogador aberto, e isso conta como aparecer: quem saiu da tela
      // do jogo para ler o chat não abandonou a partida. Abandonar é fechar o app.
      for (const mesa of mesas.values()) if (jogandoNela(mesa, ctx.eu)) mesa.jogadorVistoEm = agora;

      const daqui = [...mesas.values()].filter((m) => m.sid === ctx.sid);
      // Convite para quem está no meio de uma partida espera ela acabar: tocar no meio do jogo
      // atrapalharia, e aceitar não daria. Terminada a partida, se a mesa ainda estiver lá, ele volta.
      const livre = !emPartida(ctx.eu);
      return {
        mesas: daqui.map((m) => ({
          id: m.id,
          estado: m.estado,
          anfitriao: m.anfitriao,
          brancas: m.brancas,
          pretas: m.pretas,
          convidado: m.convidado,
          vez: m.estado === 'jogando' ? m.posicao.vez : null,
        })),
        convites: livre
          ? daqui.filter((m) => m.estado === 'lobby' && m.convidado === ctx.eu).map((m) => ({
            mesa: m.id, de: ctx.pessoa(m.anfitriao), tempo: m.tempo, cor: COR_DO_CONVIDADO[m.cor],
          }))
          : [],
      };
    },

    abrir(ctx, { tempo = null, cor = 'sorteio' } = {}) {
      const agora = relogio();
      faxina(agora);
      validarEscolha({ tempo, cor });
      if (emPartida(ctx.eu)) throw new ErroDeConta('Você está numa partida em andamento.', 409);
      const minhas = [...mesas.values()].filter((m) => m.estado === 'lobby' && m.anfitriao === ctx.eu);
      if (minhas.some((m) => m.sid === ctx.sid)) throw new ErroDeConta('Você já tem uma mesa aberta aqui.', 409);
      // A mesa que ficou esperando noutro servidor sai: ninguém espera em duas mesas ao mesmo
      // tempo, e ela não teria como aparecer na tela deste servidor para ser fechada.
      for (const m of minhas) mesas.delete(m.id);

      const mesa = {
        id: proxima++,
        sid: ctx.sid,
        estado: 'lobby',
        anfitriao: ctx.eu,
        tempo,
        cor,
        convidado: null,
        recusou: null,
        brancas: null,
        pretas: null,
        posicao: lerFen(POSICAO_INICIAL),
        chaves: [],
        lances: [],
        xeque: false,
        relogio: null,
        empateOferecidoPor: null,
        revanchePedidaPor: null,
        fim: null,
        /** id -> última leitura, de quem lê sem jogar. */
        plateia: new Map(),
        mexidaEm: agora,
        jogadorVistoEm: agora,
      };
      mesas.set(mesa.id, mesa);
      return verMesa(mesa, ctx, agora);
    },

    /** Ler a mesa. Quem lê e não joga entra na plateia por `PLATEIA` ms. */
    ver(ctx, id) {
      const agora = relogio();
      faxina(agora);
      const mesa = acharMesa(ctx, id);
      if (jogandoNela(mesa, ctx.eu)) mesa.jogadorVistoEm = agora;
      else if (papelDe(mesa, ctx.eu) === 'plateia') mesa.plateia.set(ctx.eu, agora);
      return verMesa(mesa, ctx, agora);
    },

    /** Uma ação na mesa. Devolve `{ mesa }` — ou `{ ok: true }` quando a mesa foi fechada. */
    agir(ctx, { id, acao, ...dados } = {}) {
      const agora = relogio();
      faxina(agora);
      const mesa = acharMesa(ctx, id);
      if (!Object.hasOwn(acoes, String(acao))) throw new ErroDeConta('Ação desconhecida.', 400);
      const r = acoes[acao](mesa, ctx, dados, agora);
      if (r?.ok) return r;
      mesa.mexidaEm = agora;
      if (jogandoNela(mesa, ctx.eu)) mesa.jogadorVistoEm = agora;
      return { mesa: verMesa(mesa, ctx, agora) };
    },

    /** Só para o teste: quantas mesas estão guardadas. */
    get tamanho() { return mesas.size; },
  };
}

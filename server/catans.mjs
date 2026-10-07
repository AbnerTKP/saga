// As mesas do Catan: quem abriu, quem foi chamado, quem sentou, quem assiste — e a partida.
//
// A regra do jogo é do `catan.mjs`; isto aqui é a MESA em volta dela, como `jogos.mjs` é a do
// xadrez. Puro como as outras: sem SQL e sem HTTP, e quem é cada pessoa chega pronto de quem chama.
//
// Mora na memória do processo, como as mesas do xadrez e as arenas do Dragão: REINICIAR O
// SERVIDOR ENCERRA AS PARTIDAS. Uma partida de Catan dura uma hora, bem mais que uma de xadrez —
// publicar o servidor com gente jogando apaga a partida dela, e a tela de todos passa a ouvir
// "essa mesa não existe mais".
//
// Com relógio desde 04/10/2026: a vez é de 30 ou 60 segundos, escolhidos por quem abriu a mesa
// antes de começar, e quem estoura tem a vez jogada pelo próprio jogo (ver `catan.mjs`). Nasceu
// sem, por decisão do dono em 27/09 — "à mesa entre amigos ninguém cronometra a vez" —, e, jogando,
// o dono pediu o contrário. O relógio cuida da vez parada; quem fecha a Saga continua saindo da
// partida depois de `ABANDONO`, senão o jogo passaria para sempre a vez de quem já foi embora.
import { ErroDeConta } from './contas.mjs';
import {
  ErroDeJogo, MAX_JOGADORES, MIN_JOGADORES, TEMPOS_DA_VEZ, agir as jogar, novaPartida, sair, vencerPrazos, vista,
} from './catan.mjs';

export const PLATEIA = 6000;
/** Mesa esperando gente, ou partida acabada, sem ninguém mexer há isto: some. */
export const ESQUECIDA = 30 * 60_000;
/**
 * Jogador que não aparece há isto — nem na mesa, nem na busca de salas, que roda enquanto a Saga
 * está aberta — saiu da partida. Quem só foi ler o chat continua aparecendo.
 */
export const ABANDONO = 10 * 60_000;
/** O tempo da vez de uma mesa nova, até quem abriu escolher outro. */
export const TEMPO_PADRAO = 60;

const naoExiste = () => new ErroDeConta('Essa mesa de Catan não existe mais.', 404);

export function criarMesasDoCatan({
  relogio = Date.now,
  sorteio = Math.random,
} = {}) {
  const mesas = new Map();
  let proxima = 1;

  const posicaoDe = (mesa, id) => (mesa.ids ? mesa.ids.indexOf(id) : -1);
  /** Jogando AGORA: sentado numa partida em andamento, sem ter saído dela. */
  const jogandoNela = (mesa, id) => {
    if (mesa.estado !== 'jogando') return false;
    const j = posicaoDe(mesa, id);
    return j >= 0 && !mesa.partida.jogadores[j].fora;
  };
  /** Em QUALQUER servidor: a mesma pessoa não joga duas partidas. */
  const emPartida = (id) => [...mesas.values()].some((m) => jogandoNela(m, id));

  function encerrarSeAcabou(mesa, agora) {
    if (mesa.estado === 'jogando' && mesa.partida.fase === 'fim') {
      mesa.estado = 'fim';
      mesa.mexidaEm = agora;
    }
  }

  function faxina(agora) {
    for (const mesa of mesas.values()) {
      if (mesa.estado !== 'jogando') continue;
      // Primeiro o relógio, como no xadrez: a vez que venceu anda antes de qualquer outra coisa, e
      // a jogada que chega depois do prazo já encontra a vez com outro.
      vencerPrazos(mesa.partida, agora, sorteio);
      mesa.ids.forEach((id, j) => {
        if (!mesa.partida.jogadores[j].fora && agora - (mesa.vistos.get(id) ?? 0) >= ABANDONO) sair(mesa.partida, j, agora);
      });
      encerrarSeAcabou(mesa, agora);
    }
    for (const [id, mesa] of mesas) {
      if (mesa.estado !== 'jogando' && agora - mesa.mexidaEm >= ESQUECIDA) mesas.delete(id);
    }
  }

  function acharMesa(ctx, id) {
    const mesa = mesas.get(Number(id));
    // Mesa de outro servidor responde igual a mesa que não existe, como no xadrez.
    if (!mesa || mesa.sid !== ctx.sid) throw naoExiste();
    return mesa;
  }

  /**
   * Quem senta numa mesa não espera em outra: sai dos lugares das outras mesas paradas, e as que
   * ele tinha aberto somem — com os convites que elas mandaram.
   */
  function soltarDeOutras(mesa, id) {
    for (const [k, outra] of mesas) {
      if (outra === mesa || outra.estado !== 'lobby') continue;
      if (outra.anfitriao === id) mesas.delete(k);
      else outra.lugares = outra.lugares.filter((x) => x !== id);
    }
  }

  const soNoLobby = (mesa) => {
    if (mesa.estado !== 'lobby') throw new ErroDeConta(mesa.estado === 'jogando' ? 'A partida já começou.' : 'A partida já terminou.', 409);
  };
  const soAnfitriao = (mesa, ctx) => {
    if (mesa.anfitriao !== ctx.eu) throw new ErroDeConta('Só quem abriu a mesa pode fazer isso.', 403);
  };
  const cheia = (mesa) => mesa.lugares.length >= MAX_JOGADORES;

  const acoes = {
    chamar(mesa, ctx, { alvo }) {
      soNoLobby(mesa);
      soAnfitriao(mesa, ctx);
      const id = Number(alvo);
      if (id === ctx.eu) throw new ErroDeConta('Você não pode chamar a si mesmo.', 400);
      if (!id || !ctx.membroAtivo(id)) throw new ErroDeConta('Essa pessoa não faz parte do servidor.', 404);
      if (mesa.lugares.includes(id)) throw new ErroDeConta(`${ctx.pessoa(id).nome} já está na mesa.`, 409);
      if (emPartida(id)) throw new ErroDeConta(`${ctx.pessoa(id).nome} está numa partida agora.`, 409);
      if (mesa.lugares.length + mesa.chamados.size >= MAX_JOGADORES && !mesa.chamados.has(id)) {
        throw new ErroDeConta(`A mesa é de até ${MAX_JOGADORES}: cancele um convite antes.`, 409);
      }
      mesa.chamados.add(id);
      mesa.recusaram.delete(id);
    },

    cancelarConvite(mesa, ctx, { alvo }) {
      soNoLobby(mesa);
      soAnfitriao(mesa, ctx);
      mesa.chamados.delete(Number(alvo));
    },

    aceitar(mesa, ctx) {
      // Convite cancelado, ou a mesa já começou: a tela de quem foi chamado demora uma busca
      // para saber, e o clique dela merece um motivo.
      if (mesa.estado !== 'lobby' || !mesa.chamados.has(ctx.eu)) throw new ErroDeConta('Esse convite não vale mais.', 409);
      if (emPartida(ctx.eu)) throw new ErroDeConta('Você já está noutra partida.', 409);
      if (cheia(mesa)) throw new ErroDeConta('A mesa já encheu.', 409);
      soltarDeOutras(mesa, ctx.eu);
      mesa.chamados.delete(ctx.eu);
      mesa.lugares.push(ctx.eu);
    },

    recusar(mesa, ctx) {
      if (mesa.estado !== 'lobby' || !mesa.chamados.has(ctx.eu)) return;
      mesa.chamados.delete(ctx.eu);
      mesa.recusaram.add(ctx.eu);
    },

    /** Quem sentou e desistiu de esperar. Quem abriu fecha a mesa em vez disso. */
    levantar(mesa, ctx) {
      soNoLobby(mesa);
      if (mesa.anfitriao === ctx.eu) throw new ErroDeConta('Você abriu a mesa: feche-a para sair.', 409);
      mesa.lugares = mesa.lugares.filter((x) => x !== ctx.eu);
    },

    /** O tempo de cada vez, escolhido antes de começar. Vale para as partidas seguintes da mesa. */
    tempo(mesa, ctx, { segundos }) {
      soNoLobby(mesa);
      soAnfitriao(mesa, ctx);
      if (!TEMPOS_DA_VEZ.includes(segundos)) throw new ErroDeConta(`A vez é de ${TEMPOS_DA_VEZ.join(' ou de ')} segundos.`, 400);
      mesa.segundos = segundos;
    },

    tirar(mesa, ctx, { alvo }) {
      soNoLobby(mesa);
      soAnfitriao(mesa, ctx);
      const id = Number(alvo);
      if (id === ctx.eu) throw new ErroDeConta('Você abriu a mesa: feche-a para sair.', 409);
      mesa.lugares = mesa.lugares.filter((x) => x !== id);
    },

    comecar(mesa, ctx, _dados, agora) {
      soNoLobby(mesa);
      soAnfitriao(mesa, ctx);
      if (mesa.lugares.length < MIN_JOGADORES) throw new ErroDeConta('Chame pelo menos mais uma pessoa.', 409);
      for (const id of mesa.lugares) {
        if (emPartida(id)) throw new ErroDeConta(`${ctx.pessoa(id).nome} está noutra partida.`, 409);
      }
      for (const id of mesa.lugares) soltarDeOutras(mesa, id);
      // A ordem da mesa é sorteada: quem abriu não começa sempre.
      const ids = [...mesa.lugares];
      for (let i = ids.length - 1; i > 0; i--) {
        const k = Math.floor(sorteio() * (i + 1));
        [ids[i], ids[k]] = [ids[k], ids[i]];
      }
      Object.assign(mesa, {
        estado: 'jogando',
        ids,
        partida: novaPartida(ids.length, { sorteio, segundos: mesa.segundos, agora }),
        chamados: new Set(),
        recusaram: new Set(),
        vistos: new Map(ids.map((id) => [id, agora])),
        rodadas: mesa.rodadas + 1,
      });
    },

    jogar(mesa, ctx, { jogada }, agora) {
      if (mesa.estado === 'lobby') throw new ErroDeConta('A partida ainda não começou.', 409);
      const j = posicaoDe(mesa, ctx.eu);
      if (j < 0) throw new ErroDeConta('Você não está jogando esta partida.', 403);
      if (mesa.estado === 'fim') throw new ErroDeConta('A partida já terminou.', 409);
      try {
        jogar(mesa.partida, j, jogada ?? {}, sorteio, agora);
      } catch (e) {
        if (e instanceof ErroDeJogo) throw new ErroDeConta(e.message, 409);
        throw e;
      }
    },

    desistir(mesa, ctx, _dados, agora) {
      if (mesa.estado !== 'jogando') throw new ErroDeConta('Não há partida em andamento.', 409);
      const j = posicaoDe(mesa, ctx.eu);
      if (j < 0) throw new ErroDeConta('Você não está jogando esta partida.', 403);
      sair(mesa.partida, j, agora);
    },

    /** Depois do fim: a mesa volta a esperar, com quem pediu como anfitrião e os que ficaram sentados. */
    jogarDeNovo(mesa, ctx, _dados, agora) {
      if (mesa.estado !== 'fim') throw new ErroDeConta('Jogar de novo é depois do fim.', 409);
      const j = posicaoDe(mesa, ctx.eu);
      if (j < 0) throw new ErroDeConta('Você não jogou esta partida.', 403);
      if (emPartida(ctx.eu)) throw new ErroDeConta('Você está noutra partida.', 409);
      const ficaram = mesa.ids.filter((id, k) => !mesa.partida.jogadores[k].fora && id !== ctx.eu && !emPartida(id));
      soltarDeOutras(mesa, ctx.eu);
      Object.assign(mesa, {
        estado: 'lobby', anfitriao: ctx.eu, lugares: [ctx.eu, ...ficaram],
        ids: null, partida: null, chamados: new Set(), recusaram: new Set(), mexidaEm: agora,
      });
    },

    fechar(mesa, ctx) {
      if (mesa.estado === 'jogando') {
        if (jogandoNela(mesa, ctx.eu)) throw new ErroDeConta('A partida está em andamento: desista para sair.', 409);
        throw new ErroDeConta('Só quem joga fecha a mesa.', 403);
      }
      if (mesa.estado === 'lobby') soAnfitriao(mesa, ctx);
      if (mesa.estado === 'fim' && posicaoDe(mesa, ctx.eu) < 0) throw new ErroDeConta('Só quem jogou fecha a mesa.', 403);
      mesas.delete(mesa.id);
      return { ok: true };
    },
  };

  function papelDe(mesa, id) {
    if (mesa.estado === 'lobby') {
      if (mesa.anfitriao === id) return 'anfitriao';
      if (mesa.lugares.includes(id)) return 'sentado';
      if (mesa.chamados.has(id)) return 'chamado';
      return 'plateia';
    }
    return posicaoDe(mesa, id) >= 0 ? 'jogador' : 'plateia';
  }

  function plateiaDe(mesa, agora) {
    for (const [id, visto] of mesa.plateia) if (agora - visto >= PLATEIA) mesa.plateia.delete(id);
    return [...mesa.plateia.keys()].filter((id) => papelDe(mesa, id) === 'plateia');
  }

  function verMesa(mesa, ctx, agora) {
    const quem = (id) => ctx.pessoa(id);
    const j = posicaoDe(mesa, ctx.eu);
    return {
      id: mesa.id,
      estado: mesa.estado,
      anfitriao: quem(mesa.anfitriao),
      lugares: mesa.lugares.map(quem),
      chamados: [...mesa.chamados].map(quem),
      recusaram: [...mesa.recusaram],
      // Na ordem da partida: a posição j de `partida.jogadores` é a pessoa `jogadores[j]`.
      jogadores: mesa.ids ? mesa.ids.map(quem) : null,
      segundos: mesa.segundos,
      partida: mesa.partida ? vista(mesa.partida, j >= 0 ? j : null) : null,
      plateia: plateiaDe(mesa, agora).map(quem),
      eu: papelDe(mesa, ctx.eu),
      agora,
    };
  }

  function anotarVisto(mesa, ctx, agora) {
    if (jogandoNela(mesa, ctx.eu)) mesa.vistos.set(ctx.eu, agora);
    else if (papelDe(mesa, ctx.eu) === 'plateia') mesa.plateia.set(ctx.eu, agora);
  }

  return {
    /**
     * O que vai de carona no `/rooms`: as mesas DESTE servidor, para a tela marcar quem está
     * jogando e de quem é a vez, e os convites de quem perguntou em TODOS os servidores dele.
     */
    resumo(ctx, fora = {}) {
      const agora = relogio();
      // Buscar as salas é a Saga aberta, e isso conta como aparecer: quem saiu da tela do jogo
      // para ler o chat não abandonou a partida. Abandonar é fechar a Saga.
      for (const mesa of mesas.values()) if (jogandoNela(mesa, ctx.eu)) mesa.vistos.set(ctx.eu, agora);
      faxina(agora);
      const daqui = [...mesas.values()].filter((m) => m.sid === ctx.sid);
      const livre = !emPartida(ctx.eu);
      const quemEm = (m) => (id) => (m.sid === ctx.sid || !fora.pessoaEm ? ctx.pessoa(id) : fora.pessoaEm(m.sid, id));
      return {
        mesas: daqui.map((m) => ({
          id: m.id,
          estado: m.estado,
          anfitriao: m.anfitriao,
          // Na partida, só quem ainda joga: quem saiu não aparece mais "jogando" ao lado do nome.
          jogadores: m.estado === 'lobby' ? [...m.lugares] : m.ids.filter((_, k) => !m.partida.jogadores[k].fora),
          vez: m.estado === 'jogando' ? m.ids[m.partida.vez] : null,
          fase: m.estado === 'jogando' ? m.partida.fase : null,
          // Quem ainda deve descarte num 7: a vez é de um, mas o descarte é de vários.
          devem: m.estado === 'jogando' ? Object.keys(m.partida.descartes).map((k) => m.ids[Number(k)]) : [],
        })),
        convites: livre
          ? [...mesas.values()].filter((m) => m.estado === 'lobby' && m.chamados.has(ctx.eu)
            && (m.sid === ctx.sid || !!fora.ativoEm?.(m.sid, ctx.eu))).map((m) => {
            const quem = quemEm(m);
            return {
              mesa: m.id, servidor: m.sid, servidorNome: fora.nomeDoServidor?.(m.sid) ?? null,
              de: quem(m.anfitriao), sentados: m.lugares.map(quem),
            };
          })
          : [],
      };
    },

    abrir(ctx) {
      const agora = relogio();
      faxina(agora);
      if (emPartida(ctx.eu)) throw new ErroDeConta('Você está numa partida em andamento.', 409);
      const minha = [...mesas.values()].find((m) => m.sid === ctx.sid && m.estado === 'lobby' && m.anfitriao === ctx.eu);
      if (minha) return verMesa(minha, ctx, agora);
      const mesa = {
        id: proxima++,
        sid: ctx.sid,
        estado: 'lobby',
        anfitriao: ctx.eu,
        lugares: [ctx.eu],
        chamados: new Set(),
        recusaram: new Set(),
        ids: null,
        partida: null,
        vistos: new Map(),
        plateia: new Map(),
        rodadas: 0,
        segundos: TEMPO_PADRAO,
        mexidaEm: agora,
      };
      soltarDeOutras(mesa, ctx.eu);
      mesas.set(mesa.id, mesa);
      return verMesa(mesa, ctx, agora);
    },

    /** Ler a mesa. Quem lê e não joga entra na plateia por `PLATEIA` ms. */
    ver(ctx, id) {
      const agora = relogio();
      faxina(agora);
      const mesa = acharMesa(ctx, id);
      anotarVisto(mesa, ctx, agora);
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
      encerrarSeAcabou(mesa, agora);
      mesa.mexidaEm = agora;
      anotarVisto(mesa, ctx, agora);
      return { mesa: verMesa(mesa, ctx, agora) };
    },

    /** Só para o teste: quantas mesas estão guardadas. */
    get tamanho() { return mesas.size; },
  };
}

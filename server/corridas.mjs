// Os grids de Fórmula 1: quem abriu, quem sentou em qual carro, quem foi chamado, a largada,
// quem chegou e quem assiste.
//
// A corrida EM SI não passa por aqui. Posição, velocidade e batida andam pelo canal de dados
// do LiveKit, numa sala só daquele grid, a vinte vezes por segundo — e cada carro é
// simulado no app de quem o pilota. Pelo HTTP isso seriam dezenas de pedidos por segundo
// numa VPS de UM núcleo, que já sofreu com muito menos (ver o CLAUDE.md, "a busca de salas
// pedia a lista do LiveKit uma vez por sala"). O que mora aqui é o que muda devagar e
// precisa de um árbitro: os lugares, a hora da largada e a chegada.
//
// Puro como as mesas do xadrez: sem SQL e sem HTTP. Quem é cada pessoa chega pronto de quem
// chama. E mora na memória do processo pelo mesmo motivo delas: REINICIAR O SERVIDOR
// ENCERRA OS GRIDS E AS CORRIDAS — publicar o servidor no meio de uma corrida a apaga.
import { randomBytes } from 'node:crypto';
import { ErroDeConta } from './contas.mjs';

/** Os oito carros, na ordem do grid da tela: equipe por equipe. Os códigos são protocolo. */
export const CARROS = ['VER', 'HAD', 'LEC', 'HAM', 'NOR', 'PIA', 'RUS', 'ANT'];
export const VOLTAS = [3, 5, 10];

/** Da ordem de largar até as luzes apagarem: o tempo de todo mundo abrir a pista e ver as cinco luzes. */
export const ESPERA_DA_LARGADA = 7000;
/** Chegou o primeiro, os outros têm isto para terminar — senão quem fechou o app seguraria todo mundo. */
export const DEPOIS_DO_VENCEDOR = 60_000;
/** Nenhuma volta leva mais que isto, nem com o carro parado na grama: é o teto de uma corrida sem chegada. */
export const TETO_POR_VOLTA = 3 * 60_000;
/** Nenhuma volta leva menos que isto: chegada mais rápida é conta errada, e não vale. */
export const VOLTA_MINIMA = 4000;

export const PLATEIA = 6000;
/** Grid parado ou corrida acabada, sem ninguém mexer há isto: some. */
export const ESQUECIDO = 30 * 60_000;
/** Corrida em andamento sem nenhum piloto aparecer há isto: some. */
export const ABANDONADO = 10 * 60_000;

const naoExiste = () => new ErroDeConta('Esse grid não existe mais.', 404);

function validarVoltas(voltas) {
  if (!VOLTAS.includes(voltas)) throw new ErroDeConta('A corrida é de 3, 5 ou 10 voltas.', 400);
  return voltas;
}

/** O carro em que a pessoa está sentada, ou null. */
const carroDe = (grid, id) => {
  for (const [carro, quem] of grid.assentos) if (quem === id) return carro;
  return null;
};

/** Está pilotando AGORA: sentado numa corrida em andamento, sem ter chegado nem abandonado. */
const correndoNele = (grid, id) =>
  grid.estado === 'correndo' && carroDe(grid, id) !== null && !grid.chegadas.has(id) && !grid.abandonos.has(id);

/**
 * Um registro por processo, fábrica como o das mesas: o teste cria o seu com relógio e
 * sorteio próprios. `ctx` é o mesmo das mesas do xadrez — `sid`, `eu`, `pessoa(id)` e
 * `membroAtivo(id)`.
 */
export function criarGrids({
  relogio = Date.now,
  embaralhar = (lista) => {
    const l = [...lista];
    for (let i = l.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [l[i], l[j]] = [l[j], l[i]];
    }
    return l;
  },
  nomeDaSala = () => randomBytes(6).toString('hex'),
} = {}) {
  const grids = new Map();
  let proximo = 1;

  /** Pilotando em QUALQUER servidor: a mesma pessoa não corre em duas pistas. */
  const emCorrida = (id) => [...grids.values()].some((g) => correndoNele(g, id));

  function conferirFim(grid, agora) {
    if (grid.estado !== 'correndo') return;
    const pilotos = [...grid.assentos.values()];
    const todosResolvidos = pilotos.every((id) => grid.chegadas.has(id) || grid.abandonos.has(id));
    const vencedorEsperou = grid.primeiraChegadaEm !== null && agora - grid.primeiraChegadaEm >= DEPOIS_DO_VENCEDOR;
    const passouDoTeto = agora - grid.largadaEm >= grid.voltas * TETO_POR_VOLTA;
    if (!todosResolvidos && !vencedorEsperou && !passouDoTeto) return;
    grid.estado = 'fim';
    grid.fimEm = agora;
    grid.mexidoEm = agora;
  }

  function faxina(agora) {
    for (const grid of grids.values()) conferirFim(grid, agora);
    for (const [id, grid] of grids) {
      const esquecido = grid.estado !== 'correndo' && agora - grid.mexidoEm >= ESQUECIDO;
      const abandonado = grid.estado === 'correndo' && agora - grid.pilotoVistoEm >= ABANDONADO;
      if (esquecido || abandonado) grids.delete(id);
    }
  }

  function acharGrid(ctx, id) {
    const grid = grids.get(Number(id));
    // Grid de outro servidor responde igual a grid que não existe, como a mesa de xadrez.
    if (!grid || grid.sid !== ctx.sid) throw naoExiste();
    return grid;
  }

  const soNoGrid = (grid) => {
    if (grid.estado !== 'grid') throw new ErroDeConta(grid.estado === 'correndo' ? 'A corrida já largou.' : 'A corrida já terminou.', 409);
  };
  const soAnfitriao = (grid, ctx) => {
    if (grid.anfitriao !== ctx.eu) throw new ErroDeConta('Só quem abriu o grid pode fazer isso.', 403);
  };

  const acoes = {
    sentar(grid, ctx, { carro }) {
      soNoGrid(grid);
      if (!CARROS.includes(carro)) throw new ErroDeConta('Esse carro não existe.', 400);
      const dono = grid.assentos.get(carro);
      if (dono === ctx.eu) return;
      if (dono !== undefined) throw new ErroDeConta(`${ctx.pessoa(dono).nome} já sentou nesse carro.`, 409);
      if (emCorrida(ctx.eu)) throw new ErroDeConta('Você está numa corrida em andamento.', 409);
      // Trocar de carro é levantar de um e sentar no outro: uma pessoa, um carro.
      const antigo = carroDe(grid, ctx.eu);
      if (antigo) grid.assentos.delete(antigo);
      grid.assentos.set(carro, ctx.eu);
      grid.chamados.delete(ctx.eu);
      grid.recusaram.delete(ctx.eu);
    },

    levantar(grid, ctx) {
      soNoGrid(grid);
      const carro = carroDe(grid, ctx.eu);
      if (carro) grid.assentos.delete(carro);
    },

    configurar(grid, ctx, { voltas }) {
      soNoGrid(grid);
      soAnfitriao(grid, ctx);
      grid.voltas = validarVoltas(voltas);
    },

    chamar(grid, ctx, { alvo }) {
      soNoGrid(grid);
      soAnfitriao(grid, ctx);
      const id = Number(alvo);
      if (id === ctx.eu) throw new ErroDeConta('Você não pode chamar a si mesmo.', 400);
      if (!id || !ctx.membroAtivo(id)) throw new ErroDeConta('Essa pessoa não faz parte do servidor.', 404);
      if (carroDe(grid, id)) throw new ErroDeConta(`${ctx.pessoa(id).nome} já está no grid.`, 409);
      // Vários convites ao mesmo tempo: o grid tem oito lugares, e chamar um por vez faria
      // o anfitrião esperar sete respostas em fila.
      grid.chamados.add(id);
      grid.recusaram.delete(id);
    },

    cancelarConvite(grid, ctx, { alvo }) {
      soNoGrid(grid);
      soAnfitriao(grid, ctx);
      grid.chamados.delete(Number(alvo));
    },

    recusar(grid, ctx) {
      // Convite que já não vale não é erro para quem recusa: ele só quer o cartão fora da tela.
      if (grid.estado !== 'grid' || !grid.chamados.has(ctx.eu)) return;
      grid.chamados.delete(ctx.eu);
      grid.recusaram.add(ctx.eu);
    },

    largar(grid, ctx, _dados, agora) {
      soNoGrid(grid);
      soAnfitriao(grid, ctx);
      if (grid.assentos.size === 0) throw new ErroDeConta('Ninguém sentou em carro nenhum.', 409);
      for (const id of grid.assentos.values()) {
        if (emCorrida(id)) throw new ErroDeConta(`${ctx.pessoa(id).nome} está noutra corrida.`, 409);
      }
      Object.assign(grid, {
        estado: 'correndo',
        // O grid é sorteado a cada largada: ninguém escolhe sair na frente.
        ordem: embaralhar([...grid.assentos.keys()]),
        largadaEm: agora + ESPERA_DA_LARGADA,
        chegadas: new Map(),
        abandonos: new Set(),
        primeiraChegadaEm: null,
        fimEm: null,
        chamados: new Set(),
        recusaram: new Set(),
        pilotoVistoEm: agora,
        rodada: grid.rodada + 1,
      });
    },

    chegada(grid, ctx, { tempo, melhorVolta = null }, agora) {
      // Chegada depois do fim — alguém terminou no último segundo e a resposta atrasou — não é
      // erro de quem chegou: a tela dele recebe o grid como ficou.
      if (grid.estado === 'fim') return;
      if (grid.estado !== 'correndo') throw new ErroDeConta('A corrida ainda não largou.', 409);
      if (!carroDe(grid, ctx.eu)) throw new ErroDeConta('Você não está nesta corrida.', 403);
      if (grid.chegadas.has(ctx.eu) || grid.abandonos.has(ctx.eu)) return;
      const t = Number(tempo);
      // Quem conta o tempo é o app de quem pilota; o servidor só confere se a conta é possível.
      // Chegar antes de largar ou mais rápido que qualquer volta é conta errada.
      if (!Number.isFinite(t) || t < grid.voltas * VOLTA_MINIMA || t > agora - grid.largadaEm + 3000) {
        throw new ErroDeConta('Esse tempo de chegada não fecha com a largada.', 400);
      }
      const melhor = Number(melhorVolta);
      grid.chegadas.set(ctx.eu, { tempo: Math.round(t), melhorVolta: Number.isFinite(melhor) && melhor > 0 ? Math.round(melhor) : null });
      if (grid.primeiraChegadaEm === null) grid.primeiraChegadaEm = agora;
      conferirFim(grid, agora);
    },

    abandonar(grid, ctx, _dados, agora) {
      if (grid.estado !== 'correndo') return;
      if (!carroDe(grid, ctx.eu) || grid.chegadas.has(ctx.eu)) return;
      grid.abandonos.add(ctx.eu);
      conferirFim(grid, agora);
    },

    /** Depois do fim: volta todo mundo ao grid, cada um no carro em que estava. */
    correrDeNovo(grid, ctx) {
      if (grid.estado !== 'fim') throw new ErroDeConta('Correr de novo é depois da bandeirada.', 409);
      if (grid.anfitriao !== ctx.eu && !carroDe(grid, ctx.eu)) throw new ErroDeConta('Você não correu neste grid.', 403);
      grid.estado = 'grid';
      grid.largadaEm = null;
      grid.fimEm = null;
    },

    fechar(grid, ctx) {
      if (grid.estado === 'correndo') throw new ErroDeConta('A corrida está em andamento.', 409);
      soAnfitriao(grid, ctx);
      grids.delete(grid.id);
      return { ok: true };
    },
  };

  function plateiaDe(grid, agora) {
    for (const [id, visto] of grid.plateia) if (agora - visto >= PLATEIA) grid.plateia.delete(id);
    return [...grid.plateia.keys()].filter((id) => carroDe(grid, id) === null);
  }

  function verGrid(grid, ctx, agora) {
    const quem = (id) => ctx.pessoa(id);
    const chegadas = [...grid.chegadas.entries()]
      .map(([id, c]) => ({ pessoa: quem(id), carro: carroDe(grid, id), tempo: c.tempo, melhorVolta: c.melhorVolta }))
      .sort((a, b) => a.tempo - b.tempo);
    return {
      id: grid.id,
      estado: grid.estado,
      anfitriao: quem(grid.anfitriao),
      voltas: grid.voltas,
      assentos: CARROS.map((carro) => {
        const id = grid.assentos.get(carro);
        return { carro, pessoa: id === undefined ? null : quem(id) };
      }),
      chamados: [...grid.chamados].map(quem),
      recusaram: [...grid.recusaram],
      ordem: grid.ordem,
      largadaEm: grid.largadaEm,
      chegadas,
      abandonos: [...grid.abandonos],
      plateia: plateiaDe(grid, agora).map(quem),
      meuCarro: carroDe(grid, ctx.eu),
      souAnfitriao: grid.anfitriao === ctx.eu,
      // A sala do LiveKit onde a corrida anda. Muda a cada largada: quem ficou pendurado na
      // sala da corrida anterior não aparece como fantasma na seguinte.
      rodada: grid.rodada,
      agora,
    };
  }

  return {
    /** O que vai de carona no `/rooms`: os grids DESTE servidor e os convites de quem perguntou. */
    resumo(ctx) {
      const agora = relogio();
      faxina(agora);
      for (const grid of grids.values()) if (correndoNele(grid, ctx.eu)) grid.pilotoVistoEm = agora;
      const daqui = [...grids.values()].filter((g) => g.sid === ctx.sid);
      const livre = !emCorrida(ctx.eu);
      return {
        grids: daqui.map((g) => ({
          id: g.id,
          estado: g.estado,
          anfitriao: g.anfitriao,
          pilotos: [...g.assentos.values()],
          voltas: g.voltas,
        })),
        convites: livre
          ? daqui.filter((g) => g.estado === 'grid' && g.chamados.has(ctx.eu)).map((g) => ({
            grid: g.id, de: ctx.pessoa(g.anfitriao), voltas: g.voltas, pilotos: g.assentos.size,
          }))
          : [],
      };
    },

    abrir(ctx, { voltas = 5 } = {}) {
      const agora = relogio();
      faxina(agora);
      validarVoltas(voltas);
      // Um grid seu por servidor: abrir de novo devolve o que já está aberto, em vez de
      // espalhar grids vazios pelo servidor a cada clique no menu.
      const meu = [...grids.values()].find((g) => g.sid === ctx.sid && g.anfitriao === ctx.eu);
      if (meu) return verGrid(meu, ctx, agora);
      const grid = {
        id: proximo++,
        sid: ctx.sid,
        sala: nomeDaSala(),
        estado: 'grid',
        anfitriao: ctx.eu,
        voltas,
        assentos: new Map(),
        chamados: new Set(),
        recusaram: new Set(),
        ordem: [],
        largadaEm: null,
        chegadas: new Map(),
        abandonos: new Set(),
        primeiraChegadaEm: null,
        fimEm: null,
        rodada: 0,
        plateia: new Map(),
        mexidoEm: agora,
        pilotoVistoEm: agora,
      };
      grids.set(grid.id, grid);
      return verGrid(grid, ctx, agora);
    },

    ver(ctx, id) {
      const agora = relogio();
      faxina(agora);
      const grid = acharGrid(ctx, id);
      if (correndoNele(grid, ctx.eu)) grid.pilotoVistoEm = agora;
      else if (carroDe(grid, ctx.eu) === null) grid.plateia.set(ctx.eu, agora);
      return verGrid(grid, ctx, agora);
    },

    agir(ctx, { id, acao, ...dados } = {}) {
      const agora = relogio();
      faxina(agora);
      const grid = acharGrid(ctx, id);
      if (!Object.hasOwn(acoes, String(acao))) throw new ErroDeConta('Ação desconhecida.', 400);
      const r = acoes[acao](grid, ctx, dados, agora);
      if (r?.ok) return r;
      grid.mexidoEm = agora;
      if (correndoNele(grid, ctx.eu)) grid.pilotoVistoEm = agora;
      return { grid: verGrid(grid, ctx, agora) };
    },

    /**
     * A sala do LiveKit da corrida, para o passe. Quem pode entrar é quem é do servidor do
     * grid — piloto ou plateia; quem pode PUBLICAR a posição é só quem está sentado.
     */
    salaDaCorrida(ctx, id) {
      const agora = relogio();
      faxina(agora);
      const grid = acharGrid(ctx, id);
      return { sala: `corrida-${grid.sala}-${grid.rodada}`, piloto: carroDe(grid, ctx.eu) !== null };
    },

    get tamanho() { return grids.size; },
  };
}

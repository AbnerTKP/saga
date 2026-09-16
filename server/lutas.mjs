// As arenas do Dragão Quadrado: quem abriu, quem está de cada lado e com que lutador, quem foi
// chamado, a semente e a hora do começo, quem venceu e quem assiste.
//
// A luta EM SI não passa por aqui. Os botões de cada quadro andam pelo canal de dados do LiveKit,
// numa sala só daquela arena, e a MESMA simulação roda nos dois computadores (ver `tipos.ts` no
// app). Pelo HTTP seriam sessenta pedidos por segundo por lutador numa VPS de UM núcleo — a mesma
// que sofreu com a busca de salas pedindo o LiveKit uma vez por sala. O que mora aqui é o que muda
// devagar e precisa de árbitro: os lados, o sorteio da luta, a hora de começar e o resultado.
//
// Puro como as mesas do xadrez e os grids da Fórmula 1: sem SQL e sem HTTP. Quem é cada pessoa
// chega pronto de quem chama. E mora na memória do processo pelo mesmo motivo deles: REINICIAR O
// SERVIDOR ENCERRA AS ARENAS E AS LUTAS — publicar o servidor no meio de uma luta a apaga, e as
// duas telas passam a ouvir "essa arena não existe mais".
import { randomBytes } from 'node:crypto';
import { ErroDeConta } from './contas.mjs';

/** Os lutadores. Os nomes são protocolo com o app (`IDS_DOS_LUTADORES`): só se acrescenta. */
export const LUTADORES = ['goiaba', 'vegetal', 'picole', 'geladeira', 'goiabaSuper', 'vegetalSuper', 'goteira'];
/**
 * A versão da Saga que trouxe cada lutador que não é dos quatro primeiros. App que não conhece um
 * lutador QUEBRA ao ler o nome dele, e quebra a tela inteira: em 16/09/2026 quem ainda estava na
 * 0.56 e foi chamado por alguém esperando de Goteira ficou com a Saga preta — e de novo a cada vez
 * que abria, enquanto o convite existisse. Quem pergunta de uma versão anterior recebe o convite
 * sem o lutador e a arena como recusa para atualizar. Lutador novo entra aqui com a versão que o
 * traz; o teste cobra.
 */
export const LUTADOR_DESDE = { goiabaSuper: '0.57.0', vegetalSuper: '0.57.0', goteira: '0.57.0' };
/**
 * Se o app de quem pergunta (`ctx.app`, a versão tirada do pedido) conhece o lutador. Sem versão —
 * o teste, um robô —, conhece todos: a trava é para a Saga antiga, que sempre diz a dela.
 */
function conhece(ctx, lutador) {
  const desde = LUTADOR_DESDE[lutador];
  if (!desde || !ctx.app) return true;
  const [a, b] = [ctx.app, desde].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}
const conheceTodos = (arena, ctx) => arena.lados.every((l) => l === null || conhece(ctx, l.lutador));
/** Os quatro cenários, também protocolo (`IDS_DOS_CENARIOS`). */
export const CENARIOS = ['torneio', 'planeta', 'ilha', 'canion'];
/** Rounds para vencer: 1 é luta única, 2 é melhor de três. */
export const ROUNDS = [1, 2];
/**
 * A versão da luta que o app fala. A luta online roda a mesma simulação nos dois computadores, e
 * uma ficha diferente de um lado — um soco um quadro mais rápido — é outra luta: cada tela veria um
 * vencedor. O app manda isto ao sentar e ao abrir; quem não manda (ou manda menos) não senta, e
 * ouve para atualizar. Muda quando a simulação deixar de dar o mesmo resultado que a anterior —
 * e muda junto com `PROTOCOLO_DA_LUTA`, no app (o teste confere os dois).
 */
export const PROTOCOLO = 6; // 6: Goiaba e Vegetal da Super Feira, e a Goteira — app velho não conhece
/** Quadros por segundo da simulação, fixos — o `QPS` do app. É por eles que se confere o resultado. */
export const QPS = 60;

/** Da ordem de começar até a luta valer: o tempo de os dois abrirem a arena e entrarem na sala. */
export const ESPERA_DO_INICIO = 5000;
/** Nenhuma luta acaba antes disto, contando a apresentação: resultado mais cedo é conta errada. */
export const LUTA_MINIMA = 6000;
/**
 * O primeiro resultado espera o outro lado confirmar por isto. Sem espera, quem mandou primeiro
 * decidiria sozinho; sem teto, quem fechou o app seguraria a luta dos dois para sempre.
 */
export const ESPERA_DO_OUTRO = 15_000;
/** O relógio de quem luta erra um pouco em relação ao do servidor: o resultado ganha esta folga. */
export const FOLGA_DO_RELOGIO = 3000;
/**
 * Nenhuma luta dura isto, nem com três rounds indo ao tempo: é o teto de uma luta que nunca mandou
 * resultado. Sem ele, um app com defeito que continua perguntando pela arena (e por isso não conta
 * como abandono) prenderia os dois lutadores numa luta sem fim, sem poder lutar em lugar nenhum.
 */
export const TETO_DA_LUTA = 15 * 60_000;

export const PLATEIA = 6000;
/** Arena esperando ou luta acabada, sem ninguém mexer há isto: some. */
export const ESQUECIDA = 30 * 60_000;
/** Luta em andamento sem nenhum lutador aparecer há isto: some. */
export const ABANDONADA = 10 * 60_000;

const naoExiste = () => new ErroDeConta('Essa arena não existe mais.', 404);

function validarCenario(cenario) {
  if (!CENARIOS.includes(cenario)) throw new ErroDeConta('Esse cenário não existe.', 400);
  return cenario;
}

function validarRounds(rounds) {
  if (!ROUNDS.includes(rounds)) throw new ErroDeConta('A luta é de um round ou melhor de três.', 400);
  return rounds;
}

function exigirProtocolo(protocolo) {
  if (!(Number(protocolo) >= PROTOCOLO)) {
    throw new ErroDeConta('O Dragão Quadrado mudou: feche e abra a Saga para atualizar.', 409);
  }
}

/** O lado (0 ou 1) em que a pessoa está, ou null. */
const ladoDe = (arena, id) => (arena.lados[0]?.pessoa === id ? 0 : arena.lados[1]?.pessoa === id ? 1 : null);

/** Lutando AGORA: sentada numa luta em andamento. */
const lutandoNela = (arena, id) => arena.estado === 'lutando' && ladoDe(arena, id) !== null;

/**
 * A impressão digital que o app manda do fim da luta, guardada só para comparar e para o registro.
 * Não se recusa resultado por causa dela — recusar pela forma da impressão prenderia a luta até o
 * teto —, mas o que vai para o `docker logs` não pode levar quebra de linha nem texto qualquer.
 */
function lerImpressao(impressao) {
  if (typeof impressao !== 'number' && typeof impressao !== 'string') return null;
  const limpa = String(impressao).replace(/[^\w.-]/g, '').slice(0, 64);
  return limpa || null;
}

/**
 * Um registro por processo, fábrica como o das mesas e o dos grids: o teste cria o seu com relógio
 * e sorteio próprios. `ctx` é o mesmo deles — `sid`, `eu`, `pessoa(id)` e `membroAtivo(id)`.
 *
 * `avisar` é por onde sai a dessincronia (os dois lados discordando do fim da luta). É o
 * `console.warn` do processo; o teste passa o seu para conferir o que foi escrito.
 */
export function criarArenas({
  relogio = Date.now,
  // 32 bits sem sinal: é a semente do mulberry32 da simulação, e JSON leva um número desses inteiro.
  sorteio = () => randomBytes(4).readUInt32BE(0),
  nomeDaSala = () => randomBytes(6).toString('hex'),
  avisar = (texto) => console.warn(texto),
} = {}) {
  const arenas = new Map();
  let proxima = 1;

  /** Lutando em QUALQUER servidor: a mesma pessoa não luta em duas arenas. */
  const emLuta = (id) => [...arenas.values()].some((a) => lutandoNela(a, id));

  function encerrar(arena, { motivo, vencedor }, agora) {
    arena.estado = 'fim';
    arena.motivo = motivo;
    arena.vencedor = vencedor;
    arena.fimEm = agora;
    arena.mexidoEm = agora;
  }

  /** O resultado que chegou primeiro, se chegou algum. É ele que vale. */
  const primeiroResultado = (arena) => (arena.primeiro === null ? null : arena.resultados[arena.primeiro]);

  /**
   * Os dois lados rodam a mesma simulação com as mesmas entradas; se discordam do fim, alguma coisa
   * andou diferente num dos computadores. Não há como saber qual está certo, então vale o primeiro —
   * mas isso precisa ficar escrito, porque é o único sinal de que a luta online se desencontrou.
   * Sem nome, sessão ou passe no texto: só números da luta.
   */
  function conferirConcordancia(arena) {
    const [a, b] = arena.resultados;
    if (!a || !b) return;
    const diferencas = [];
    if (a.vencedor !== b.vencedor) diferencas.push('vencedor');
    if (a.quadros !== b.quadros) diferencas.push('quadros');
    if (a.impressao !== null && b.impressao !== null && a.impressao !== b.impressao) diferencas.push('impressão');
    if (diferencas.length === 0) return;
    arena.divergiu = true;
    const lado = (n, r) => `lado ${n}: vencedor ${r.vencedor}, ${r.quadros} quadros, impressão ${r.impressao ?? '-'}`;
    avisar(
      `dragão quadrado: os dois lados discordam do fim da luta ${arena.id} (servidor ${arena.sid}, rodada ${arena.rodada}) `
      + `em ${diferencas.join(', ')} — ${lado(0, a)}; ${lado(1, b)}; vale o lado ${arena.primeiro}, que mandou primeiro. `
      + 'Sinal de dessincronia.',
    );
  }

  function conferirFim(arena, agora) {
    if (arena.estado !== 'lutando') return;
    const primeiro = primeiroResultado(arena);
    // O outro lado teve o tempo dele e não mandou nada: vale o que chegou.
    if (primeiro && agora - primeiro.em >= ESPERA_DO_OUTRO) {
      encerrar(arena, { motivo: 'luta', vencedor: primeiro.vencedor }, agora);
      return;
    }
    if (agora - arena.inicioEm >= TETO_DA_LUTA) encerrar(arena, { motivo: 'semResultado', vencedor: null }, agora);
  }

  function faxina(agora) {
    for (const arena of arenas.values()) conferirFim(arena, agora);
    for (const [id, arena] of arenas) {
      const esquecida = arena.estado !== 'lutando' && agora - arena.mexidoEm >= ESQUECIDA;
      const abandonada = arena.estado === 'lutando' && agora - arena.lutadorVistoEm >= ABANDONADA;
      if (esquecida || abandonada) arenas.delete(id);
    }
  }

  function acharArena(ctx, id) {
    const arena = arenas.get(Number(id));
    // Arena de outro servidor responde igual a arena que não existe, como a mesa e o grid: saber o
    // número de uma arena alheia não abre porta.
    if (!arena || arena.sid !== ctx.sid) throw naoExiste();
    return arena;
  }

  const soNaArena = (arena) => {
    if (arena.estado !== 'arena') {
      throw new ErroDeConta(arena.estado === 'lutando' ? 'A luta já começou.' : 'A luta já terminou.', 409);
    }
  };
  const soAnfitriao = (arena, ctx) => {
    if (arena.anfitriao !== ctx.eu) throw new ErroDeConta('Só quem abriu a arena pode fazer isso.', 403);
  };
  const cheia = (arena) => arena.lados.every((l) => l !== null);

  const acoes = {
    escolher(arena, ctx, { lutador, protocolo }) {
      soNaArena(arena);
      exigirProtocolo(protocolo);
      if (!LUTADORES.includes(lutador)) throw new ErroDeConta('Esse lutador não existe.', 400);
      const meu = ladoDe(arena, ctx.eu);
      // Já sentado, escolher é trocar de lutador. O mesmo lutador dos dois lados vale: o app
      // desenha o segundo com a outra cor.
      if (meu !== null) {
        arena.lados[meu].lutador = lutador;
        return;
      }
      if (emLuta(ctx.eu)) throw new ErroDeConta('Você está numa luta em andamento.', 409);
      const livre = arena.lados.indexOf(null);
      if (livre < 0) throw new ErroDeConta('Os dois lados da arena já estão ocupados.', 409);
      arena.lados[livre] = { pessoa: ctx.eu, lutador };
      arena.recusaram.delete(ctx.eu);
      arena.chamados.delete(ctx.eu);
      // Com os dois lados ocupados não sobra vaga para mais ninguém: os outros convites virariam
      // um cartão de "Lutar" que só daria erro no clique.
      if (cheia(arena)) arena.chamados.clear();
    },

    levantar(arena, ctx) {
      soNaArena(arena);
      const meu = ladoDe(arena, ctx.eu);
      if (meu === null) return;
      // A arena é de quem a abriu: sem ele de um lado, não haveria quem começasse a luta.
      if (arena.anfitriao === ctx.eu) throw new ErroDeConta('Quem abriu a arena não levanta: feche a arena.', 409);
      arena.lados[meu] = null;
    },

    configurar(arena, ctx, { cenario, rounds }) {
      soNaArena(arena);
      soAnfitriao(arena, ctx);
      if (cenario === undefined && rounds === undefined) throw new ErroDeConta('Nada para mudar.', 400);
      // Confere tudo antes de mudar qualquer coisa: pedido meio certo não muda meia arena.
      if (cenario !== undefined) validarCenario(cenario);
      if (rounds !== undefined) validarRounds(rounds);
      if (cenario !== undefined) arena.cenario = cenario;
      if (rounds !== undefined) arena.rounds = rounds;
    },

    chamar(arena, ctx, { alvo }) {
      soNaArena(arena);
      soAnfitriao(arena, ctx);
      const id = Number(alvo);
      if (id === ctx.eu) throw new ErroDeConta('Você não pode chamar a si mesmo.', 400);
      if (!id || !ctx.membroAtivo(id)) throw new ErroDeConta('Essa pessoa não faz parte do servidor.', 404);
      if (ladoDe(arena, id) !== null) throw new ErroDeConta(`${ctx.pessoa(id).nome} já está na arena.`, 409);
      if (cheia(arena)) throw new ErroDeConta('Os dois lados da arena já estão ocupados.', 409);
      // Vários convites de uma vez, como no grid: o primeiro que sentar leva a vaga, e o anfitrião
      // não precisa esperar um "agora não" para chamar o próximo. Quem está lutando noutro lugar
      // pode ser chamado — o convite espera a luta dele acabar (ver `resumo`).
      arena.chamados.add(id);
      arena.recusaram.delete(id);
    },

    cancelarConvite(arena, ctx, { alvo }) {
      soNaArena(arena);
      soAnfitriao(arena, ctx);
      arena.chamados.delete(Number(alvo));
    },

    recusar(arena, ctx) {
      // Convite que já não vale não é erro para quem recusa: ele só quer o cartão fora da tela.
      if (arena.estado !== 'arena' || !arena.chamados.has(ctx.eu)) return;
      arena.chamados.delete(ctx.eu);
      arena.recusaram.add(ctx.eu);
    },

    comecar(arena, ctx, _dados, agora) {
      soNaArena(arena);
      soAnfitriao(arena, ctx);
      if (!cheia(arena)) throw new ErroDeConta('Falta alguém do outro lado.', 409);
      for (const { pessoa } of arena.lados) {
        if (emLuta(pessoa)) {
          throw new ErroDeConta(pessoa === ctx.eu ? 'Você está numa luta em andamento.' : `${ctx.pessoa(pessoa).nome} está noutra luta.`, 409);
        }
      }
      Object.assign(arena, {
        estado: 'lutando',
        // A semente é sorteada a cada luta, e é a mesma nos dois computadores: é ela que faz o
        // sorteio de dentro da simulação dar igual dos dois lados.
        semente: sorteio() >>> 0,
        inicioEm: agora + ESPERA_DO_INICIO,
        // A sala do LiveKit muda a cada luta: quem ficou pendurado na anterior não manda botão
        // velho para dentro da seguinte.
        rodada: arena.rodada + 1,
        resultados: [null, null],
        primeiro: null,
        divergiu: false,
        vencedor: null,
        motivo: null,
        fimEm: null,
        chamados: new Set(),
        recusaram: new Set(),
        lutadorVistoEm: agora,
      });
    },

    resultado(arena, ctx, { vencedor, quadros, impressao }, agora) {
      if (arena.estado === 'arena') throw new ErroDeConta('A luta ainda não começou.', 409);
      const lado = ladoDe(arena, ctx.eu);
      if (lado === null) throw new ErroDeConta('Você não está nesta luta.', 403);
      // Quem conta a luta é a simulação de quem luta; o servidor só confere se a conta é possível.
      // Sem `Number()` no vencedor: `Number(null)` é 0, e um campo que faltou daria a vitória ao lado 0.
      if (![0, 1, 2].includes(vencedor)) throw new ErroDeConta('O vencedor é o lado 0, o lado 1 ou empate (2).', 400);
      const q = Number(quadros);
      if (agora < arena.inicioEm) throw new ErroDeConta('Esse resultado chegou antes de a luta começar.', 400);
      if (!Number.isFinite(q) || q < (LUTA_MINIMA * QPS) / 1000 || (q * 1000) / QPS > agora - arena.inicioEm + FOLGA_DO_RELOGIO) {
        throw new ErroDeConta('Esse resultado não fecha com a hora em que a luta começou.', 400);
      }
      // Repetido — a resposta do primeiro se perdeu e o app mandou de novo —: vale o que chegou antes.
      if (arena.resultados[lado]) return;
      arena.resultados[lado] = { vencedor, quadros: Math.round(q), impressao: lerImpressao(impressao), em: agora };
      if (arena.primeiro === null) arena.primeiro = lado;

      if (arena.estado === 'fim') {
        // Chegou depois do fim — o outro mandou e os 15 s passaram, ou alguém desistiu. Não muda
        // quem venceu, mas ainda serve de conferência: discordar aqui é a mesma dessincronia.
        if (arena.motivo === 'luta') conferirConcordancia(arena);
        return;
      }
      const primeiro = primeiroResultado(arena);
      if (arena.primeiro === lado) return; // espera o outro lado, até ESPERA_DO_OUTRO
      conferirConcordancia(arena);
      encerrar(arena, { motivo: 'luta', vencedor: primeiro.vencedor }, agora);
    },

    abandonar(arena, ctx, _dados, agora) {
      if (arena.estado !== 'lutando') return;
      const lado = ladoDe(arena, ctx.eu);
      if (lado === null) return;
      // A luta já tinha sido decidida na tela — alguém mandou o resultado — e quem sai agora só está
      // fechando a tela do fim: sair depois de a luta acabar não é desistir, e o resultado continua.
      const primeiro = primeiroResultado(arena);
      if (primeiro) {
        encerrar(arena, { motivo: 'luta', vencedor: primeiro.vencedor }, agora);
        return;
      }
      encerrar(arena, { motivo: 'abandono', vencedor: 1 - lado }, agora);
    },

    /** Depois do fim: volta à arena com os mesmos dois, cada um com o lutador que tinha. */
    revanche(arena, ctx) {
      if (arena.estado !== 'fim') throw new ErroDeConta('A revanche é depois do fim da luta.', 409);
      if (ladoDe(arena, ctx.eu) === null) throw new ErroDeConta('Você não lutou nesta arena.', 403);
      Object.assign(arena, {
        estado: 'arena', inicioEm: null, vencedor: null, motivo: null, fimEm: null,
        resultados: [null, null], primeiro: null, divergiu: false,
      });
    },

    fechar(arena, ctx) {
      if (arena.estado === 'lutando') throw new ErroDeConta('A luta está em andamento: desista para sair.', 409);
      soAnfitriao(arena, ctx);
      arenas.delete(arena.id);
      return { ok: true };
    },
  };

  function plateiaDe(arena, agora) {
    for (const [id, visto] of arena.plateia) if (agora - visto >= PLATEIA) arena.plateia.delete(id);
    // Quem assistia e sentou sai da lista pela pergunta de sempre, e não por uma limpeza a lembrar.
    return [...arena.plateia.keys()].filter((id) => ladoDe(arena, id) === null);
  }

  function verArena(arena, ctx, agora) {
    const quem = (id) => ctx.pessoa(id);
    return {
      id: arena.id,
      estado: arena.estado,
      anfitriao: quem(arena.anfitriao),
      cenario: arena.cenario,
      rounds: arena.rounds,
      lados: arena.lados.map((l) => (l === null ? null : { pessoa: quem(l.pessoa), lutador: l.lutador })),
      chamados: [...arena.chamados].map(quem),
      recusaram: [...arena.recusaram],
      plateia: plateiaDe(arena, agora).map(quem),
      meuLado: ladoDe(arena, ctx.eu),
      souAnfitriao: arena.anfitriao === ctx.eu,
      semente: arena.semente,
      // Quando a luta passa a valer, no relógio do servidor — com `agora` junto, a tela acerta o
      // relógio dela e os dois computadores começam no mesmo instante.
      inicioEm: arena.inicioEm,
      rodada: arena.rodada,
      vencedor: arena.vencedor,
      motivo: arena.motivo,
      // Quem já mandou o resultado: é o que deixa a tela dizer "esperando o outro confirmar".
      resultadoDe: arena.resultados.map((r) => r !== null),
      agora,
    };
  }

  return {
    /**
     * O que vai de carona no `/rooms`: as arenas DESTE servidor e os convites de quem perguntou —
     * de TODOS os servidores dele, como os do grid: quem foi chamado pode estar olhando outro
     * servidor ou uma conversa. `fora` sabe quem é quem nos outros servidores; sem ele, só o do pedido.
     */
    resumo(ctx, fora = {}) {
      const agora = relogio();
      faxina(agora);
      // Buscar as salas é o app do lutador aberto, e isso conta como aparecer: quem saiu da tela da
      // luta para ler o chat não abandonou a luta. Abandonar é fechar o app.
      for (const arena of arenas.values()) if (lutandoNela(arena, ctx.eu)) arena.lutadorVistoEm = agora;
      const daqui = [...arenas.values()].filter((a) => a.sid === ctx.sid);
      // Convite para quem está no meio de uma luta espera ela acabar: tocar no meio atrapalharia,
      // e sentar não daria. Terminada a luta, se a arena ainda estiver esperando, ele volta.
      const livre = !emLuta(ctx.eu);
      const chamadoEm = [...arenas.values()].filter((a) => a.estado === 'arena' && a.chamados.has(ctx.eu)
        && (a.sid === ctx.sid || !!fora.ativoEm?.(a.sid, ctx.eu)));
      const quemEm = (a) => (id) => (a.sid === ctx.sid || !fora.pessoaEm ? ctx.pessoa(id) : fora.pessoaEm(a.sid, id));
      return {
        arenas: daqui.map((a) => ({
          id: a.id,
          estado: a.estado,
          anfitriao: a.anfitriao,
          lutadores: a.lados.map((l) => (l === null ? null : l.pessoa)),
          cenario: a.cenario,
          rounds: a.rounds,
        })),
        convites: livre
          ? chamadoEm.map((a) => {
            const quem = quemEm(a);
            // A arena com convite pendente nunca está cheia (sentar o segundo apaga os convites):
            // quem já está sentado é quem o convidado vai enfrentar.
            const sentado = a.lados.find((l) => l !== null);
            return {
              arena: a.id, servidor: a.sid, servidorNome: fora.nomeDoServidor?.(a.sid) ?? null,
              de: quem(a.anfitriao), cenario: a.cenario, rounds: a.rounds,
              // Lutador que o app de quem foi chamado não conhece fica de fora (ver `LUTADOR_DESDE`).
              oponente: sentado && conhece(ctx, sentado.lutador) ? { pessoa: quem(sentado.pessoa), lutador: sentado.lutador } : null,
            };
          })
          : [],
      };
    },

    /** Quem abre senta no lado 0, com o Goiaba; troca de lutador pelo `escolher`. */
    abrir(ctx, { cenario = CENARIOS[0], rounds = 2, protocolo } = {}) {
      const agora = relogio();
      faxina(agora);
      // Abrir é sentar, e sentar pede o protocolo: senão um app antigo entraria na luta pela porta
      // de abrir, que não pergunta nada.
      exigirProtocolo(protocolo);
      validarCenario(cenario);
      validarRounds(rounds);
      // Uma arena sua por servidor: abrir de novo devolve a que já está aberta, em vez de espalhar
      // arenas vazias pelo servidor a cada clique no menu.
      const minha = [...arenas.values()].find((a) => a.sid === ctx.sid && a.anfitriao === ctx.eu);
      if (minha) return verArena(minha, ctx, agora);
      if (emLuta(ctx.eu)) throw new ErroDeConta('Você está numa luta em andamento.', 409);
      const arena = {
        id: proxima++,
        sid: ctx.sid,
        sala: nomeDaSala(),
        estado: 'arena',
        anfitriao: ctx.eu,
        lados: [{ pessoa: ctx.eu, lutador: LUTADORES[0] }, null],
        cenario,
        rounds,
        chamados: new Set(),
        recusaram: new Set(),
        semente: sorteio() >>> 0,
        inicioEm: null,
        rodada: 0,
        /** Por lado: { vencedor, quadros, impressao, em } do resultado que ele mandou nesta luta. */
        resultados: [null, null],
        /** O lado que mandou o resultado primeiro, e é o que vale. */
        primeiro: null,
        divergiu: false,
        vencedor: null,
        /** Por que acabou: 'luta' (resultado), 'abandono' ou 'semResultado' (teto). */
        motivo: null,
        fimEm: null,
        /** id -> última leitura, de quem lê sem estar sentado. */
        plateia: new Map(),
        mexidoEm: agora,
        lutadorVistoEm: agora,
      };
      arenas.set(arena.id, arena);
      return verArena(arena, ctx, agora);
    },

    /** Ler a arena. Quem lê e não está sentado entra na plateia por `PLATEIA` ms. */
    ver(ctx, id) {
      const agora = relogio();
      faxina(agora);
      const arena = acharArena(ctx, id);
      // Antes de entrar na plateia: quem não consegue ver a luta não está assistindo.
      if (!conheceTodos(arena, ctx)) throw new ErroDeConta('Essa arena tem lutador novo: atualize a Saga para entrar.', 409);
      if (lutandoNela(arena, ctx.eu)) arena.lutadorVistoEm = agora;
      else if (ladoDe(arena, ctx.eu) === null) arena.plateia.set(ctx.eu, agora);
      return verArena(arena, ctx, agora);
    },

    /** Uma ação na arena. Devolve `{ arena }` — ou `{ ok: true }` quando a ação foi fechar, ou quando o app de quem agiu não conhece um dos lutadores. */
    agir(ctx, { id, acao, ...dados } = {}) {
      const agora = relogio();
      faxina(agora);
      const arena = acharArena(ctx, id);
      if (!Object.hasOwn(acoes, String(acao))) throw new ErroDeConta('Ação desconhecida.', 400);
      const r = acoes[acao](arena, ctx, dados, agora);
      if (r?.ok) return r;
      arena.mexidoEm = agora;
      if (lutandoNela(arena, ctx.eu)) arena.lutadorVistoEm = agora;
      // O app antigo só recusa convite daqui, e a resposta dele é ignorada: feito, sem a arena.
      if (!conheceTodos(arena, ctx)) return { ok: true };
      return { arena: verArena(arena, ctx, agora) };
    },

    /**
     * A sala do LiveKit da luta, para o passe. Quem pode entrar é quem é do servidor da arena —
     * lutador ou plateia; quem pode PUBLICAR os botões é só quem está sentado.
     */
    salaDaLuta(ctx, id) {
      const agora = relogio();
      faxina(agora);
      const arena = acharArena(ctx, id);
      return { sala: `luta-${arena.sala}-${arena.rodada}`, lutador: ladoDe(arena, ctx.eu) !== null };
    },

    /** Só para o teste: quantas arenas estão guardadas. */
    get tamanho() { return arenas.size; },
  };
}

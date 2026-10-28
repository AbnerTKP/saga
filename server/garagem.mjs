// A Garagem: quem está nela, onde cada um está e para onde anda, o quanto bebeu e comeu, quem está
// no fliperama — e a festa.
//
// Quem anda pela garagem mora na MEMÓRIA do processo, como as mesas do xadrez e o "está
// digitando": é estado de agora, e escrita no SQLite a cada passo de boneco seria o `vista_em` de
// novo (3,5 MB/s, a máquina esperando disco). Reiniciar o servidor esvazia a garagem; o app de cada
// um manda a posição na volta seguinte e ela se enche sozinha. Duas coisas vão para o BANCO, porque
// um reinício no meio do caminho não pode desfazê-las: a festa que o dono preparou e o placar da
// Navinha (`repositorios/garagem_festas.mjs` e `garagem_recordes.mjs`).
//
// O servidor não anda boneco nenhum. Cada app manda onde o SEU está e para onde vai (`alvo`), e a
// tela de cada um anda os outros até lá com o mesmo caminho (`garagem.ts`, no app). Aqui só se
// guarda, confere e devolve — e se decide quem pode preparar e começar o parabéns.
//
// O parabéns é SURPRESA (o dono, 26/10/2026): para todo mundo a garagem é um minigame comum, e só o
// dono da Saga tem o botão. Desde 27/10/2026 é ele quem escolhe, no painel da festa, uma ou duas
// pessoas, o nome de cada uma no telão e o tema de cada uma. O TEMA vai para todo mundo na hora — é
// a decoração, e não conta nada —; os NOMES só saem daqui quando o dono manda cantar.
import { ErroDeConta } from './contas.mjs';
import * as tabelaDeFestas from './repositorios/garagem_festas.mjs';
import * as tabelaDeRecordes from './repositorios/garagem_recordes.mjs';

/** Sem notícia há isto, a pessoa saiu da garagem (o app manda a posição de ~350 em 350 ms). */
export const SUMIU = 6000;
/**
 * Quanto o parabéns dura, da mesa aparecendo até ela sumir: juntar (4,5 s), a música e o
 * rá-tim-bum (~23 s) e a mesa montada mais uns segundos. O desenho de cada fase é do app; aqui
 * isto só serve para não começar outro no meio e para parar de mandar o `parabens` depois.
 */
export const DURACAO_DO_PARABENS = 40_000;
/** Os temas da garagem — os mesmos do `garagem.ts`. Tema que o app não conhece é recusado. */
export const TEMAS = new Set(['moto', 'carro', 'mecanica', 'jogos', 'pc']);
export const MAX_ANIVERSARIANTES = 2;
/** O nome no telão cabe nisto (o telão é pequeno e a letra é grande). */
export const MAX_NOME_NO_TELAO = 14;
/** A sala, nas medidas do desenho (320×180): os pés de ninguém saem daqui. */
export const LIMITES = { x1: 8, x2: 312, y1: 72, y2: 176 };
/** No sexto gole ou mordida, desmaia (o app zera a conta ao cair). */
export const LIMITE_DA_BARRIGA = 6;
/** Quantos fliperamas a garagem tem. */
export const FLIPERAMAS = 2;
/** Quantas partidas o placar mostra (e guarda). */
export const TAMANHO_DO_PLACAR = 5;
/** Mais que isto numa partida da Navinha não é jogo, é pedido feito à mão. */
export const MAIOR_PONTUACAO = 999_999;
const DIRECOES = new Set(['baixo', 'cima', 'esq', 'dir']);
/** O que se pode ter acabado de comer ou beber (`COMIDAS` no app) — e o "beber" e "comer" do app de antes. */
const COMIDAS = new Set(['cerveja', 'refri', 'suco', 'agua', 'coxinha', 'pizza', 'pastel', 'cachorro', 'brigadeiro', 'bolo', 'beber', 'comer']);

const recusa = (texto) => new ErroDeConta(texto, 400);
const numero = (v, nome) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw recusa(`Posição inválida (${nome}).`);
  return v;
};
const dentro = (v, a, b) => Math.min(b, Math.max(a, v));
const contador = (v) => (Number.isInteger(v) && v >= 0 && v < 1e9 ? v : 0);

/**
 * O que o app mandou sobre o boneco dele, conferido. Posição fora da sala volta para a borda
 * (um boneco no meio do nada ficaria na tela de todo mundo); o que não é número é recusado; e
 * o resto, quando vem torto, vale o padrão — um campo a mais ou a menos não derruba a garagem
 * de um app de outra versão (o de antes mandava o `papel` da porta, que não existe mais).
 */
export function conferirBoneco(eu) {
  if (!eu || typeof eu !== 'object' || Array.isArray(eu)) throw recusa('Faltou dizer onde você está.');
  const x = dentro(numero(eu.x, 'x'), LIMITES.x1, LIMITES.x2);
  const y = dentro(numero(eu.y, 'y'), LIMITES.y1, LIMITES.y2);
  let alvo = null;
  if (eu.alvo && typeof eu.alvo === 'object') {
    alvo = {
      x: dentro(numero(eu.alvo.x, 'alvo.x'), LIMITES.x1, LIMITES.x2),
      y: dentro(numero(eu.alvo.y, 'alvo.y'), LIMITES.y1, LIMITES.y2),
    };
  }
  return {
    x, y, alvo,
    dir: DIRECOES.has(eu.dir) ? eu.dir : 'baixo',
    cheio: Number.isInteger(eu.cheio) ? dentro(eu.cheio, 0, LIMITE_DA_BARRIGA) : 0,
    goles: contador(eu.goles),
    ultimo: COMIDAS.has(eu.ultimo) ? eu.ultimo : null,
    quedas: contador(eu.quedas),
    jogando: Number.isInteger(eu.jogando) && eu.jogando >= 0 && eu.jogando < FLIPERAMAS ? eu.jogando : null,
  };
}

/**
 * A festa que o dono mandou, conferida: até duas pessoas DESTE servidor, sem repetir, cada uma com
 * um nome que cabe no telão e um tema que o app sabe desenhar. Lista vazia desfaz a festa.
 */
export function conferirAniversariantes(lista, pessoa) {
  if (!Array.isArray(lista)) throw recusa('Faltou dizer quem faz aniversário.');
  if (lista.length > MAX_ANIVERSARIANTES) throw recusa(`No máximo ${MAX_ANIVERSARIANTES} pessoas no parabéns.`);
  const vistos = new Set();
  return lista.map((a) => {
    if (!a || typeof a !== 'object') throw recusa('Faltou dizer quem faz aniversário.');
    if (!Number.isInteger(a.id) || !pessoa(a.id)) throw recusa('Essa pessoa não é deste servidor.');
    if (vistos.has(a.id)) throw recusa('A mesma pessoa está duas vezes.');
    vistos.add(a.id);
    const nome = typeof a.nome === 'string' ? a.nome.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
    if (!nome) throw recusa('Faltou o nome no telão.');
    if ([...nome].length > MAX_NOME_NO_TELAO) throw recusa(`O nome no telão cabe ${MAX_NOME_NO_TELAO} letras.`);
    if (!TEMAS.has(a.tema)) throw recusa('Esse tema não existe.');
    return { id: a.id, nome, tema: a.tema };
  });
}

/** O tema de cada lado: o esquerdo do primeiro aniversariante, o direito do segundo (`temasDa`, no app). */
export const temasDa = (a) => (a.length ? [a[0].tema, (a[1] ?? a[0]).tema] : ['moto', 'moto']);

/** Sem banco (os testes da regra), a festa e o placar ficam num Map — o mesmo contrato dos repositórios. */
function naMemoria() {
  const festas = new Map(), recordes = new Map();
  let id = 0;
  return {
    festas: { ler: (sid) => festas.get(sid) ?? [], gravar: (sid, lista) => { festas.set(sid, lista); } },
    recordes: {
      placar: (sid, n) => [...(recordes.get(sid) ?? [])].sort((a, b) => b.pontos - a.pontos || a.id - b.id).slice(0, n),
      anotar: (sid, usuarioId, pontos, _agora, guardar) => {
        const lista = [...(recordes.get(sid) ?? []), { id: ++id, usuarioId, pontos, apelido: null }];
        recordes.set(sid, lista.sort((a, b) => b.pontos - a.pontos || a.id - b.id).slice(0, guardar));
      },
    },
  };
}
function noBanco(db) {
  return {
    festas: { ler: (sid) => tabelaDeFestas.ler(db, sid), gravar: (sid, lista, agora) => tabelaDeFestas.gravar(db, sid, lista, agora) },
    recordes: {
      placar: (sid, n) => tabelaDeRecordes.placar(db, sid, n),
      anotar: (sid, usuarioId, pontos, agora, guardar) => tabelaDeRecordes.anotar(db, sid, usuarioId, pontos, agora, guardar),
    },
  };
}

/**
 * Uma garagem por servidor. É fábrica, como as mesas, para cada teste ter a sua; com `db`, a festa e
 * o placar vão para o banco, e sem ele ficam na memória.
 *
 * Quem chama entrega o pedido já resolvido (`naGaragem` em `index.mjs`): de que servidor é,
 * quem pede, se ele é o dono da Saga, e como cada pessoa aparece.
 */
export function criarGaragens({ relogio = Date.now, db = null } = {}) {
  const guardado = db ? noBanco(db) : naMemoria();
  /** sid -> { gente: Map<id, { boneco, visto }>, parabens: { inicio, aniversariantes } | null, preparo, recordes } */
  const garagens = new Map();

  function daGaragem(sid) {
    let g = garagens.get(sid);
    if (!g) {
      // A festa e o placar se leem do banco uma vez, na primeira volta depois do arranque: a garagem
      // pergunta de 350 em 350 ms por pessoa, e o que muda passa por aqui mesmo (`preparar`, `recorde`).
      g = { gente: new Map(), parabens: null, preparo: guardado.festas.ler(sid), recordes: guardado.recordes.placar(sid, TAMANHO_DO_PLACAR) };
      garagens.set(sid, g);
    }
    return g;
  }

  function faxina(g, agora) {
    for (const [id, p] of g.gente) if (agora - p.visto > SUMIU) g.gente.delete(id);
    if (g.parabens && agora - g.parabens.inicio > DURACAO_DO_PARABENS) g.parabens = null;
  }

  const placarDe = (ctx, g) => g.recordes.map((r) => ({ nome: ctx.pessoa(r.usuarioId)?.nome ?? r.apelido ?? 'alguém', pontos: r.pontos }));

  function vista(ctx, g, agora) {
    const pessoas = [];
    for (const [id, p] of g.gente) {
      const quem = ctx.pessoa(id);
      // Quem foi banido ou saiu do servidor some da garagem na hora, sem esperar o `SUMIU`.
      if (!quem) { g.gente.delete(id); continue; }
      pessoas.push({ id, nome: quem.nome, ...p.boneco });
    }
    pessoas.sort((a, b) => a.id - b.id);
    return {
      agora,
      // Ninguém além do dono precisa saber que existe um botão — só que a festa começou.
      podeCantar: !!ctx.donoDaSaga,
      temas: temasDa(g.preparo),
      ...(ctx.donoDaSaga ? { preparo: g.preparo } : {}),
      parabens: g.parabens ? { inicio: g.parabens.inicio, aniversariantes: g.parabens.aniversariantes } : null,
      pessoas,
      recordes: placarDe(ctx, g),
    };
  }

  const soDono = (ctx, texto) => { if (!ctx.donoDaSaga) throw new ErroDeConta(texto, 403); };

  return {
    /** Anota onde o seu boneco está e devolve a garagem inteira, você incluído. */
    estar(ctx, corpo) {
      const boneco = conferirBoneco(corpo?.eu);
      const agora = relogio();
      const g = daGaragem(ctx.sid);
      faxina(g, agora);
      g.gente.set(ctx.eu, { boneco, visto: agora });
      return vista(ctx, g, agora);
    },

    /** A garagem vista sem entrar. Era a porta do app de antes da festa (v0.75), que ainda pergunta. */
    espiar(ctx) {
      const agora = relogio();
      const g = daGaragem(ctx.sid);
      faxina(g, agora);
      return vista(ctx, g, agora);
    },

    /** Fechou a tela: some da garagem dos outros na volta seguinte deles. */
    sair(ctx) {
      garagens.get(ctx.sid)?.gente.delete(ctx.eu);
      return { ok: true };
    },

    /**
     * O dono prepara a festa: quem faz aniversário, o nome no telão e o tema. Só o dono da Saga, e
     * quem confere é aqui. O tema vale na hora para todo mundo; os nomes ficam guardados até o canto.
     */
    preparar(ctx, corpo) {
      soDono(ctx, 'Só o dono da Saga prepara a festa.');
      const lista = conferirAniversariantes(corpo?.aniversariantes, ctx.pessoa);
      const agora = relogio();
      const g = daGaragem(ctx.sid);
      faxina(g, agora);
      g.preparo = lista;
      guardado.festas.gravar(ctx.sid, lista, agora);
      return vista(ctx, g, agora);
    },

    /**
     * O parabéns. Só o dono da Saga começa, e o servidor confere: o botão não aparecer na tela
     * dos outros é educação, e quem decide é aqui. Pedir de novo no meio de um não recomeça —
     * dois cliques rápidos não podem cortar a música de todo mundo. Quem faz aniversário é fotografado
     * na hora: mexer no painel no meio da música não troca o nome que está no telão.
     */
    cantarParabens(ctx) {
      soDono(ctx, 'Só o dono da Saga começa o parabéns.');
      const agora = relogio();
      const g = daGaragem(ctx.sid);
      faxina(g, agora);
      if (!g.parabens) {
        if (!g.preparo.length) throw recusa('Escolha no painel da festa quem faz aniversário.');
        g.parabens = { inicio: agora, aniversariantes: g.preparo.map((a) => ({ ...a })) };
      }
      return vista(ctx, g, agora);
    },

    /**
     * Uma partida da Navinha que acabou. Só quem está na garagem joga; a pontuação tem de ser um
     * número de verdade; e só vai para o banco o que entra no placar.
     */
    recorde(ctx, corpo) {
      const pontos = corpo?.pontos;
      if (!Number.isInteger(pontos) || pontos <= 0 || pontos > MAIOR_PONTUACAO) throw recusa('Pontuação inválida.');
      const agora = relogio();
      const g = daGaragem(ctx.sid);
      faxina(g, agora);
      if (!g.gente.has(ctx.eu)) throw new ErroDeConta('Só quem está na garagem joga o fliperama.', 409);
      const ultimo = g.recordes[TAMANHO_DO_PLACAR - 1];
      if (g.recordes.length < TAMANHO_DO_PLACAR || pontos > ultimo.pontos) {
        guardado.recordes.anotar(ctx.sid, ctx.eu, pontos, agora, TAMANHO_DO_PLACAR);
        g.recordes = guardado.recordes.placar(ctx.sid, TAMANHO_DO_PLACAR);
      }
      return { recordes: placarDe(ctx, g) };
    },

    /** Quem está na garagem de cada servidor agora — para o menu de jogos dizer "3 na garagem". */
    quemEsta(sid) {
      const g = garagens.get(sid);
      if (!g) return [];
      faxina(g, relogio());
      return [...g.gente.keys()].sort((a, b) => a - b);
    },
  };
}

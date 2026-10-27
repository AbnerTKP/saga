// A Garagem: quem está nela, onde cada um está e para onde anda, o quanto bebeu e comeu, e o
// parabéns.
//
// Mora na MEMÓRIA do processo, como as mesas do xadrez e o "está digitando": é estado de agora,
// e escrita no SQLite a cada passo de boneco seria o `vista_em` de novo (3,5 MB/s, a máquina
// esperando disco). Reiniciar o servidor esvazia a garagem; o app de cada um manda a posição na
// volta seguinte e ela se enche sozinha.
//
// O servidor não anda boneco nenhum. Cada app manda onde o SEU está e para onde vai (`alvo`), e a
// tela de cada um anda os outros até lá com o mesmo caminho (`garagem.ts`, no app). Aqui só se
// guarda, confere e devolve — e se decide quem pode começar o parabéns.
//
// O parabéns é SURPRESA, pedido do dono em 26/10/2026: para todo mundo a garagem é um minigame
// comum, e só o dono da Saga tem o botão. Quem vai para trás da mesa é quem ENTROU como o Tavão ou
// como o Donis: na porta da garagem cada um escolhe um dos três `PAPEIS`, e só pode haver um Tavão e
// um Donis por vez — quem confere é aqui. Era pela conta, e a do Donis não se chama Donis.
import { ErroDeConta } from './contas.mjs';

/** Sem notícia há isto, a pessoa saiu da garagem (o app manda a posição de ~350 em 350 ms). */
export const SUMIU = 6000;
/**
 * Quanto o parabéns dura, da mesa aparecendo até ela sumir: juntar (4,5 s), a música e o
 * rá-tim-bum (~23 s) e a mesa montada mais uns segundos. O desenho de cada fase é do app; aqui
 * isto só serve para não começar outro no meio e para parar de mandar o `parabens` depois.
 */
export const DURACAO_DO_PARABENS = 40_000;
/**
 * Os três jeitos de entrar na garagem, e a moto de cada um (é a roupa do boneco). O Tavão e o Donis
 * são um só cada; "outro" é todo mundo, com a cara que sai da própria conta.
 */
export const PAPEIS = { tavao: 'harley', donis: 'sahara', outro: null };
const NOME_DO_PAPEL = { tavao: 'O Tavão', donis: 'O Donis' };
/** A sala, nas medidas do desenho (320×180): os pés de ninguém saem daqui. */
export const LIMITES = { x1: 8, x2: 312, y1: 72, y2: 176 };
/** No sexto gole ou mordida, desmaia (o app zera a conta ao cair). */
export const LIMITE_DA_BARRIGA = 6;
const DIRECOES = new Set(['baixo', 'cima', 'esq', 'dir']);
const ULTIMOS = new Set(['beber', 'comer']);

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
 * de um app de outra versão.
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
    papel: Object.hasOwn(PAPEIS, eu.papel) ? eu.papel : 'outro',
    dir: DIRECOES.has(eu.dir) ? eu.dir : 'baixo',
    cheio: Number.isInteger(eu.cheio) ? dentro(eu.cheio, 0, LIMITE_DA_BARRIGA) : 0,
    goles: contador(eu.goles),
    ultimo: ULTIMOS.has(eu.ultimo) ? eu.ultimo : null,
    quedas: contador(eu.quedas),
  };
}

/**
 * Uma garagem por servidor. É fábrica, como as mesas, para cada teste ter a sua.
 *
 * Quem chama entrega o pedido já resolvido (`naGaragem` em `index.mjs`): de que servidor é,
 * quem pede, se ele é o dono da Saga, e como cada pessoa aparece.
 */
export function criarGaragens({ relogio = Date.now } = {}) {
  /** sid -> { gente: Map<id, { boneco, visto }>, parabens: { inicio } | null } */
  const garagens = new Map();

  function daGaragem(sid) {
    let g = garagens.get(sid);
    if (!g) { g = { gente: new Map(), parabens: null }; garagens.set(sid, g); }
    return g;
  }

  function faxina(g, agora) {
    for (const [id, p] of g.gente) if (agora - p.visto > SUMIU) g.gente.delete(id);
    if (g.parabens && agora - g.parabens.inicio > DURACAO_DO_PARABENS) g.parabens = null;
  }

  function vista(ctx, g, agora) {
    const pessoas = [];
    for (const [id, p] of g.gente) {
      const quem = ctx.pessoa(id);
      // Quem foi banido ou saiu do servidor some da garagem na hora, sem esperar o `SUMIU`.
      if (!quem) { g.gente.delete(id); continue; }
      pessoas.push({ id, nome: quem.nome, moto: PAPEIS[p.boneco.papel], ...p.boneco });
    }
    pessoas.sort((a, b) => a.id - b.id);
    return {
      agora,
      // Ninguém além do dono precisa saber que existe um botão — só que a festa começou.
      podeCantar: !!ctx.donoDaSaga,
      parabens: g.parabens ? { inicio: g.parabens.inicio } : null,
      pessoas,
    };
  }

  return {
    /**
     * Anota onde o seu boneco está e devolve a garagem inteira, você incluído. Quem entra como o
     * Tavão ou o Donis com outro já lá dentro leva 409: o papel é de quem chegou primeiro, até ele
     * sair (ou sumir por `SUMIU`).
     */
    estar(ctx, corpo) {
      const boneco = conferirBoneco(corpo?.eu);
      const agora = relogio();
      const g = daGaragem(ctx.sid);
      faxina(g, agora);
      if (boneco.papel !== 'outro') {
        for (const [id, p] of g.gente) {
          if (id !== ctx.eu && p.boneco.papel === boneco.papel && ctx.pessoa(id)) {
            throw new ErroDeConta(`${NOME_DO_PAPEL[boneco.papel]} já está na garagem.`, 409);
          }
        }
      }
      g.gente.set(ctx.eu, { boneco, visto: agora });
      return vista(ctx, g, agora);
    },

    /** A garagem vista da porta, sem entrar: quem está, e com que papel — para a escolha mostrar o que já foi pego. */
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
     * O parabéns. Só o dono da Saga começa, e o servidor confere: o botão não aparecer na tela
     * dos outros é educação, e quem decide é aqui. Pedir de novo no meio de um não recomeça —
     * dois cliques rápidos não podem cortar a música de todo mundo.
     */
    cantarParabens(ctx) {
      if (!ctx.donoDaSaga) throw new ErroDeConta('Só o dono da Saga começa o parabéns.', 403);
      const agora = relogio();
      const g = daGaragem(ctx.sid);
      faxina(g, agora);
      if (!g.parabens) g.parabens = { inicio: agora };
      return vista(ctx, g, agora);
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

// O bot de música: a fila de cada sala de voz. Puro como as mesas de xadrez — sem SQL e sem
// HTTP; quem é cada pessoa e em que call ela está chegam prontos de quem chama.
//
// A MÚSICA NÃO SAI DAQUI. Medido em 22/09/2026: o YouTube barra a VPS a partir do segundo
// vídeo ("Sign in to confirm you're not a bot", IP de datacenter), e entrega tudo a uma
// internet de casa. Então quem toca é o APP de alguém da call — o anfitrião —, que baixa a
// música, a publica como faixa própria, e avisa aqui quando ela acaba. O servidor só guarda
// a fila e decide quem é o anfitrião.
//
// Mora na memória do processo, como as mesas: REINICIAR O SERVIDOR ZERA AS FILAS. A música
// que estiver tocando para no próximo aviso do anfitrião, que vai ouvir "não há fila".
//
// Sem relógio de fundo: a fila é conferida a cada busca de salas (de 4 em 4 s, quem está na
// Saga já faz) — o anfitrião que saiu da call é trocado, a música que passou da hora (o app
// do anfitrião fechou no meio) anda sozinha, e a sala que esvaziou perde a fila.
import { ErroDeConta } from './contas.mjs';

/** Uma fila de cinco amigos não passa disso; mais é alguém colando uma playlist à mão. */
export const MAXIMO_NA_FILA = 50;
/** Três horas: disco inteiro cabe, live que não acaba não. */
export const DURACAO_MAXIMA = 3 * 60 * 60;
/** Folga para o anfitrião avisar que acabou antes de a fila andar sozinha. */
export const FOLGA = 15_000;
/**
 * Quanto tempo a sala precisa ficar vazia para a fila sumir. Não é na hora porque "vazia" às
 * vezes é mentira: quando o LiveKit não responde, a lista de gente volta vazia, sem erro
 * (`lembrado`, em index.mjs), e um soluço dele apagaria a fila de quem está ouvindo.
 */
export const VAZIA = 20_000;
/**
 * Quanto tempo o anfitrião precisa sumir da call para a música passar a outro. Não é na hora:
 * internet ruim (o dono estava atrás do Cloudflare WARP em 23/09/2026) derruba e reconecta a
 * call em segundos, e trocar de anfitrião a cada piscada recomeçava a música no computador de
 * outra pessoa — que soa como a música travando.
 */
export const AUSENTE = 10_000;

const ID_DO_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;
const ORIGENS = ['youtube', 'spotify', 'busca'];

/**
 * O que o app mandou, conferido. A capa sai do id, e não do que veio: uma URL qualquer na
 * capa seria a tela de cada amigo buscando o que alguém escolheu.
 */
export function validarItem(bruto) {
  const id = String(bruto?.id ?? '');
  if (!ID_DO_YOUTUBE.test(id)) throw new ErroDeConta('Não reconheci essa música.', 400);
  const titulo = String(bruto?.titulo ?? '').trim().slice(0, 200);
  if (!titulo) throw new ErroDeConta('Não reconheci essa música.', 400);
  const duracao = Math.round(Number(bruto?.duracao));
  if (!(duracao > 0)) throw new ErroDeConta('Ao vivo não dá: a música precisa ter fim.', 400);
  if (duracao > DURACAO_MAXIMA) throw new ErroDeConta('Passa de 3 horas. Escolha algo mais curto.', 400);
  return {
    id,
    titulo,
    autor: String(bruto?.autor ?? '').trim().slice(0, 120),
    duracao,
    capa: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    origem: ORIGENS.includes(bruto?.origem) ? bruto.origem : 'busca',
  };
}

export function criarFilas({ relogio = Date.now, sortearUid = () => Math.random().toString(36).slice(2, 10) } = {}) {
  /** salaDeVozId → { itens, anfitriao, comecouEm, salaDoChat } — `itens[0]` é o que toca. */
  const salas = new Map();

  const ver = (salaVoz) => {
    const s = salas.get(salaVoz);
    if (!s || s.itens.length === 0) return null;
    return {
      tocando: s.itens[0],
      fila: s.itens.slice(1),
      anfitriao: s.anfitriao,
      comecouEm: s.comecouEm,
      // O relógio DAQUI, para o app calcular onde a música está sem depender do dele.
      agora: relogio(),
      salaDoChat: s.salaDoChat,
    };
  };

  /** Passa para a próxima. Devolve a que começou, ou null se a fila acabou. */
  const andar = (salaVoz) => {
    const s = salas.get(salaVoz);
    if (!s) return null;
    s.itens.shift();
    if (s.itens.length === 0) { salas.delete(salaVoz); return null; }
    s.comecouEm = relogio();
    return s.itens[0];
  };

  return {
    ver,

    /**
     * Põe na fila. Fila vazia: começa agora, e quem pediu vira o anfitrião — é o app dele que
     * acabou de achar a música, e ele está na call. Devolve a posição: 0 é "tocando agora".
     */
    tocar(salaVoz, bruto, { pediu, salaDoChat }) {
      const item = { ...validarItem(bruto), uid: sortearUid(), pediu };
      let s = salas.get(salaVoz);
      if (!s) {
        s = { itens: [], anfitriao: pediu.id, comecouEm: relogio(), salaDoChat };
        salas.set(salaVoz, s);
      }
      if (s.itens.length >= MAXIMO_NA_FILA) {
        throw new ErroDeConta(`A fila já tem ${MAXIMO_NA_FILA} músicas. Espere andar um pouco.`, 409);
      }
      s.itens.push(item);
      s.salaDoChat = salaDoChat;
      return { item, posicao: s.itens.length - 1 };
    },

    /** Pula a que toca. Devolve { pulou, agora } — `agora` null quando a fila acabou. */
    pular(salaVoz) {
      const s = salas.get(salaVoz);
      if (!s) throw new ErroDeConta('Não tem nada tocando.', 409);
      const pulou = s.itens[0];
      return { pulou, agora: andar(salaVoz) };
    },

    parar(salaVoz) {
      if (!salas.has(salaVoz)) throw new ErroDeConta('Não tem nada tocando.', 409);
      salas.delete(salaVoz);
    },

    /**
     * O anfitrião avisa que a música acabou (ou que não conseguiu tocá-la). Só vale para a que
     * está tocando: o aviso atrasado de uma que já foi pulada não pode pular a seguinte.
     * Devolve { andou, agora }.
     */
    acabou(salaVoz, uid, quem) {
      const s = salas.get(salaVoz);
      if (!s || s.itens[0]?.uid !== uid) return { andou: false, agora: s?.itens[0] ?? null };
      if (s.anfitriao !== quem) throw new ErroDeConta('Só quem está tocando avisa que acabou.', 403);
      return { andou: true, agora: andar(salaVoz) };
    },

    /**
     * Conferida a cada busca de salas, com quem está na call agora (ids das contas).
     *
     * - ninguém na call por `VAZIA`: a fila some — tocar para sala vazia é gastar a banda de alguém;
     * - o anfitrião saiu (por `AUSENTE`): passa a quem ficou, e a música continua de onde estava (o app novo
     *   calcula pela hora em que ela começou);
     * - passou da hora e ninguém avisou: o app do anfitrião morreu no meio — anda sozinha.
     *
     * Devolve a música que começou por causa disso, ou null.
     */
    conferir(salaVoz, presentes) {
      const s = salas.get(salaVoz);
      if (!s) return null;
      if (presentes.length === 0) {
        s.vaziaDesde ??= relogio();
        if (relogio() - s.vaziaDesde >= VAZIA) salas.delete(salaVoz);
        return null;
      }
      s.vaziaDesde = null;
      if (presentes.includes(s.anfitriao)) s.ausenteDesde = null;
      else {
        s.ausenteDesde ??= relogio();
        if (relogio() - s.ausenteDesde >= AUSENTE) { s.anfitriao = presentes[0]; s.ausenteDesde = null; }
      }
      if (relogio() > s.comecouEm + s.itens[0].duracao * 1000 + FOLGA) return andar(salaVoz);
      return null;
    },
  };
}

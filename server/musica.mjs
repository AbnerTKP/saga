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

/**
 * O dobro do que uma playlist põe (`MAXIMO_POR_PLAYLIST`): era 50, e uma playlist de 50 deixava
 * os amigos sem lugar. A fila inteira vai na busca de salas, sem compressão, a cada 4 s por
 * pessoa: medidos 13,5 KB com 50 músicas de verdade (04/11/2026), logo uns 27 KB com a fila cheia.
 */
export const MAXIMO_NA_FILA = 100;
/**
 * Quantas músicas uma playlist põe na fila. O mesmo teto do app (buscaDeMusica.ts). A que passa
 * disso é cortada, e o cartão diz: "só couberam 50 de 125".
 */
export const MAXIMO_POR_PLAYLIST = 50;
/**
 * Duas horas: disco e mix longo cabem, live que não acaba não. O mesmo teto do app
 * (buscaDeMusica.ts): acima disso o áudio passa de 130 MB, e atravessa inteiro para a tela.
 */
export const DURACAO_MAXIMA = 2 * 60 * 60;
/**
 * Folga para o anfitrião avisar que acabou antes de a fila andar sozinha. Larga de propósito:
 * `comecouEm` é a hora do COMANDO, e o som começa depois do download — numa internet lenta
 * (medido: 9 s no Mac do dono, atrás do WARP), 15 s cortavam o fim da música. Ela só vale
 * quando o app de quem toca morreu, e aí 60 s de silêncio custam menos que cortar toda música.
 */
export const FOLGA = 60_000;
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
  if (duracao > DURACAO_MAXIMA) throw new ErroDeConta('Passa de 2 horas. Escolha algo mais curto.', 400);
  return {
    id,
    titulo,
    autor: String(bruto?.autor ?? '').trim().slice(0, 120),
    duracao,
    capa: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    origem: ORIGENS.includes(bruto?.origem) ? bruto.origem : 'busca',
  };
}

/** As músicas de uma playlist que dá para tocar. Uma ruim fica de fora, sem derrubar as outras. */
function validarVarias(brutos) {
  return (Array.isArray(brutos) ? brutos : []).flatMap((b) => {
    try { return [validarItem(b)]; } catch { return []; }
  });
}

/** Um número vindo do app, como inteiro não negativo. */
const contagem = (v) => Math.max(0, Math.round(Number(v)) || 0);

export function criarFilas({ relogio = Date.now, sortearUid = () => Math.random().toString(36).slice(2, 10) } = {}) {
  /**
   * salaDeVozId → { itens, anfitriao, comecouEm, salaDoChat, playlists } — `itens[0]` é o que toca.
   * `playlists`: id → { nome, pediu, quantas, n }, as que ainda podem receber música (ver `acrescentar`).
   */
  const salas = new Map();

  /** Põe na fila o que ainda cabe da playlist, numerando. Devolve os itens que entraram. */
  const empurrar = (s, id, playlist, musicas) => {
    const espaco = MAXIMO_NA_FILA - s.itens.length;
    const entram = musicas.slice(0, Math.min(playlist.quantas - playlist.n, espaco));
    const itens = entram.map((m) => ({
      ...m, uid: sortearUid(), pediu: playlist.pediu, lote: { id, n: ++playlist.n },
    }));
    s.itens.push(...itens);
    return itens;
  };

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

    /**
     * Põe uma playlist na fila, atrás do que já está nela. `quantas` é quantas ainda vão entrar
     * no total: no Spotify a primeira chega sozinha, para já tocar, e as outras vêm por
     * `acrescentar`, à medida que o app as acha no YouTube (cerca de 1 s por música).
     */
    tocarPlaylist(salaVoz, lista, { pediu, salaDoChat }) {
      const musicas = validarVarias(lista?.musicas);
      if (musicas.length === 0) throw new ErroDeConta('Nenhuma música dessa playlist dá para tocar.', 400);
      const antes = salas.get(salaVoz);
      const espaco = MAXIMO_NA_FILA - (antes?.itens.length ?? 0);
      if (espaco <= 0) throw new ErroDeConta(`A fila já tem ${MAXIMO_NA_FILA} músicas. Espere andar um pouco.`, 409);
      const quantas = Math.min(MAXIMO_POR_PLAYLIST, espaco, Math.max(musicas.length, contagem(lista?.quantas)));
      const s = antes ?? { itens: [], anfitriao: pediu.id, comecouEm: relogio(), salaDoChat };
      if (!antes) salas.set(salaVoz, s);
      s.salaDoChat = salaDoChat;
      const posicao = s.itens.length;
      const id = sortearUid();
      const playlist = { nome: String(lista?.nome ?? '').trim().slice(0, 120) || 'Playlist', pediu, quantas, n: 0 };
      (s.playlists ??= new Map()).set(id, playlist);
      const itens = empurrar(s, id, playlist, musicas);
      return {
        id,
        nome: playlist.nome,
        quantas,
        total: Math.max(quantas, contagem(lista?.total)),
        maisDe: !!lista?.maisDe,
        // Cortada pela fila cheia, a soma que o app mandou contaria música que não entrou.
        duracao: quantas < contagem(lista?.quantas)
          ? itens.reduce((soma, i) => soma + i.duracao, 0)
          : Math.min(contagem(lista?.duracao), quantas * DURACAO_MAXIMA),
        origem: lista?.origem === 'spotify' ? 'spotify' : 'youtube',
        primeira: itens[0],
        posicao,
      };
    },

    /**
     * As próximas músicas de uma playlist que o app ainda está achando. `ativa: false` quer dizer
     * "pare de procurar": a playlist foi tirada, o /parar limpou a fila, ou ela já entrou inteira.
     * Sem isto, as músicas continuariam chegando depois do /parar, e a call voltaria a tocar sozinha.
     */
    acrescentar(salaVoz, id, brutos, quem) {
      const s = salas.get(salaVoz);
      const playlist = s?.playlists?.get(id);
      if (!playlist) return { ativa: false, entraram: 0 };
      if (playlist.pediu.id !== quem) throw new ErroDeConta('Essa playlist foi outra pessoa que pediu.', 403);
      const itens = empurrar(s, id, playlist, validarVarias(brutos));
      return { ativa: playlist.n < playlist.quantas && s.itens.length < MAXIMO_NA_FILA, entraram: itens.length };
    },

    /**
     * Tira a playlist da fila, inteira: é o desfazer de quem colou o link sem querer. Se ela está
     * tocando, a música de agora sai junto. Sem `id`, vale a que toca ou a primeira da fila.
     * As músicas dos outros ficam. Devolve { nome, tirou, tocava, agora }; `agora` é a música que
     * começou por causa disso.
     */
    tirarPlaylist(salaVoz, id) {
      const s = salas.get(salaVoz);
      if (!s) throw new ErroDeConta('Não tem nada tocando.', 409);
      const alvo = id || s.itens.find((i) => i.lote)?.lote.id;
      const playlist = alvo ? s.playlists?.get(alvo) : null;
      const tirou = s.itens.filter((i) => i.lote?.id === alvo).length;
      if (!playlist || (tirou === 0 && playlist.n >= playlist.quantas)) {
        throw new ErroDeConta('Essa playlist não está mais na fila.', 409);
      }
      const tocava = s.itens[0].lote?.id === alvo;
      s.playlists.delete(alvo);
      s.itens = s.itens.filter((i) => i.lote?.id !== alvo);
      if (s.itens.length === 0) { salas.delete(salaVoz); return { nome: playlist.nome, tirou, tocava, agora: null }; }
      if (tocava) s.comecouEm = relogio();
      return { nome: playlist.nome, tirou, tocava, agora: tocava ? s.itens[0] : null };
    },

    /** O nome da playlist: o bot diz quando ela começa. */
    nomeDaPlaylist: (salaVoz, id) => salas.get(salaVoz)?.playlists?.get(id)?.nome ?? null,

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
     * O anfitrião avisa que o som COMEÇOU, e em que ponto. `comecouEm` nasce na hora do comando
     * (ou da troca de música), mas o som só sai depois do download — e o fim da música, contado
     * dali, chegava antes da hora numa internet lenta (achado na revisão de 23/09/2026: com 20 s
     * de download e 15 s de folga, a fila andava com 5 s de música por tocar). Daqui em diante
     * o relógio da música é o do som de verdade. Vale uma vez por música e por anfitrião.
     */
    comecou(salaVoz, uid, quem, posicao) {
      const s = salas.get(salaVoz);
      if (!s || s.itens[0]?.uid !== uid || s.anfitriao !== quem) return false;
      const p = Math.min(Math.max(Number(posicao) || 0, 0), s.itens[0].duracao);
      s.comecouEm = relogio() - p * 1000;
      return true;
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
     * Conferida a cada busca de salas, com quem está na call agora (ids das contas) e, entre
     * esses, quem tem um app capaz de tocar (`capazes`, na ordem de quem deve herdar).
     *
     * - ninguém na call por `VAZIA`: a fila some — tocar para sala vazia é gastar a banda de alguém;
     * - o anfitrião saiu (por `AUSENTE`): passa a quem ficou e consegue tocar, e a música continua de onde
     *   estava (o app novo calcula pela hora em que ela começou);
     * - ninguém ali consegue tocar (só gente no celular, digamos): a vez fica onde está, a fila anda pelo
     *   tempo em silêncio, e o primeiro que chegar com um app capaz assume do ponto;
     * - passou da hora e ninguém avisou: o app do anfitrião morreu no meio — anda sozinha.
     *
     * Devolve a música que começou por causa disso, ou null.
     */
    conferir(salaVoz, presentes, capazes = presentes) {
      const s = salas.get(salaVoz);
      if (!s) return null;
      if (presentes.length === 0) {
        s.vaziaDesde ??= relogio();
        if (relogio() - s.vaziaDesde >= VAZIA) salas.delete(salaVoz);
        return null;
      }
      s.vaziaDesde = null;
      if (capazes.includes(s.anfitriao)) s.ausenteDesde = null;
      else {
        s.ausenteDesde ??= relogio();
        if (relogio() - s.ausenteDesde >= AUSENTE && capazes.length > 0) { s.anfitriao = capazes[0]; s.ausenteDesde = null; }
      }
      if (relogio() > s.comecouEm + s.itens[0].duracao * 1000 + FOLGA) return andar(salaVoz);
      return null;
    },
  };
}

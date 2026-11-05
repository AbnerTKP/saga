import { acrescentarNaPlaylist, comandoDeMusica, lerServidorAtual, type EstadoDaMusica, type Mensagem } from './api';
import type { NomeDoComando } from './comandos';
import { anotar } from './registro';

/**
 * O bot de música do lado da tela: executa o comando digitado no chat, e conta ao tocador
 * (`useMusica`) quando a fila de uma sala mudou.
 *
 * Mora fora do React de propósito. Quem digita é o chat; quem toca é a call — dois pedaços
 * da tela que não se conhecem, e passar isso por propriedades atravessaria o App inteiro.
 */

/** `agora` é a hora do SERVIDOR na resposta: é por ela que se descarta a notícia velha. */
type Ouvinte = (salaVoz: number, estado: EstadoDaMusica | null, agora: number) => void;
const ouvintes = new Set<Ouvinte>();

export function aoMudarAMusica(f: Ouvinte) {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

export function contarQueAMusicaMudou(salaVoz: number, estado: EstadoDaMusica | null, agora: number) {
  for (const f of ouvintes) f(salaVoz, estado, agora);
}

/**
 * "Vou tocar": o `/tocar` começou a procurar. O tocador aproveita a espera para já pôr a faixa
 * da música na call — a negociação com o LiveKit leva o seu tempo, e numa internet ruim leva
 * mais. Se a música acabar indo para a fila de outro anfitrião, o tocador a tira de novo.
 */
const aoIrTocar = new Set<() => void>();
export function quandoForTocar(f: () => void) {
  aoIrTocar.add(f);
  return () => { aoIrTocar.delete(f); };
}

/**
 * O que a tela sabe sem perguntar ao servidor. Com isso o erro óbvio — fora da call, sem a
 * permissão — sai na hora, e não depois de o yt-dlp passar segundos procurando uma música
 * que não vai tocar. O servidor confere de novo: isto é conforto, não trava.
 */
type Contexto = {
  eu: { id: number; nome: string };
  naCall: () => boolean;
  podeTocar: () => boolean;
  /** A música que esta tela vê tocando na minha call — o /pular diz qual quer pular. */
  tocandoAgora: () => string | null;
};
let contexto: Contexto | null = null;
export const definirContextoDoBot = (c: Contexto | null) => { contexto = c; };

export const FORA_DA_CALL = 'Entre numa sala de voz primeiro: eu toco na call em que você está.';
export const SEM_PERMISSAO = 'Seu cargo não pode pôr música. Peça ao dono do servidor a permissão "Tocar música".';
export const NAO_TOCA_AQUI = 'O /tocar só funciona na Saga baixada do site, no computador. Daqui dá para pular, parar e ver a fila.';

let serie = 0;
/** Uma resposta do bot que só quem pediu vê: não vai ao servidor, e some ao trocar de sala. */
export function respostaLocal(texto: string, cmd: NomeDoComando): Mensagem {
  const eu = contexto?.eu ?? { id: 0, nome: 'você' };
  return {
    id: -(++serie), texto, imagem: null, arquivo: null, criadoEm: Date.now(),
    autorId: eu.id, nome: eu.nome, foto: null, turbo: false, idExibido: null,
    bot: { tipo: 'texto', cmd, texto }, soParaVoce: true,
  };
}

/**
 * O resto de uma playlist do Spotify, indo para a fila à medida que é achado no YouTube. Roda
 * depois de o comando já ter respondido. Falhar aqui não desfaz o que já entrou: a playlist só
 * fica mais curta do que o cartão disse, e o registro conta. Uma nova tentativa antes de desistir,
 * porque internet que pisca já foi o caso comum (o Mac do dono, atrás do WARP).
 */
async function seguirPlaylist(
  salaVoz: number, playlist: string, busca: string, servidor: number | undefined,
  aoAndar?: (texto: string | null) => void,
) {
  const enviar = async (musicas: Parameters<typeof acrescentarNaPlaylist>[2]) => {
    try { return await acrescentarNaPlaylist(salaVoz, playlist, musicas, servidor); } catch {
      await new Promise((r) => setTimeout(r, 1500));
      return acrescentarNaPlaylist(salaVoz, playlist, musicas, servidor);
    }
  };
  try {
    for (;;) {
      const { musicas, fim, achadas, de } = await window.desktop.musica.mais(busca);
      if (musicas.length) {
        const r = await enviar(musicas);
        contarQueAMusicaMudou(salaVoz, r.musica, r.agora ?? 0);
        if (!r.ativa) break;
      }
      if (fim) break;
      aoAndar?.(`Achando as outras no YouTube: ${achadas} de ${de}…`);
    }
  } catch (e) {
    anotar('erro', 'musica', `seguir a playlist: ${(e as Error).message}`);
  } finally {
    void window.desktop.musica.cancelar(busca);
    aoAndar?.(null);
  }
}

/**
 * Executa um comando numa sala de texto. `aoProcurar` avisa que a busca começou — é só o
 * `/tocar` que demora, e a tela mostra "procurando" enquanto isso. O erro sobe com o texto
 * que a pessoa lê. `aoAndar` diz como vai o resto de uma playlist do Spotify; `null` é o fim.
 */
export async function executarComando(
  sala: number,
  c: { nome: NomeDoComando; arg: string },
  aoProcurar?: () => void,
  aoAndar?: (texto: string | null) => void,
): Promise<Mensagem> {
  // Antes de "fora da call" e de "sem permissão": entrar na call não resolveria nada aqui.
  if (c.nome === 'tocar' && !window.desktop?.musica?.disponivel) throw new Error(NAO_TOCA_AQUI);
  if (contexto && !contexto.naCall()) throw new Error(FORA_DA_CALL);
  if (contexto && c.nome !== 'fila' && !contexto.podeTocar()) throw new Error(SEM_PERMISSAO);

  let musica;
  if (c.nome === 'tocar') {
    aoProcurar?.();
    for (const f of aoIrTocar) f();
    const inicio = performance.now();
    const achada = await window.desktop.musica.achar(c.arg);
    if (!achada.ok) throw new Error(achada.erro);
    // As marcas de tempo ficam no registro: é por elas que se sabe onde a espera foi parar
    // no computador de quem reclamou, sem adivinhar (ver voz-e-live.md, o bot de música).
    anotar('info', 'musica', `/tocar: achada em ${Math.round(performance.now() - inicio)} ms`);
    if (achada.playlist) {
      const { continuar, ...lista } = achada.playlist;
      // Guardado antes da resposta: a busca leva quase um minuto, e dá tempo de trocar de servidor.
      const servidor = lerServidorAtual() ?? undefined;
      let r;
      try { r = await comandoDeMusica(sala, 'tocar', undefined, undefined, { lista }); } catch (e) {
        if (continuar) void window.desktop.musica.cancelar(continuar);
        throw e;
      }
      anotar('info', 'musica', `/tocar: playlist com ${lista.quantas} no servidor`);
      if (r.sala) contarQueAMusicaMudou(r.sala.id, r.musica, r.agora ?? 0);
      if (continuar && r.sala && r.playlist) {
        aoAndar?.(`Achando as outras no YouTube: 0 de ${lista.quantas - 1}…`);
        void seguirPlaylist(r.sala.id, r.playlist, continuar, servidor, aoAndar);
      }
      return r.mensagem;
    }
    musica = achada.musica;
  }
  const antesDoServidor = performance.now();
  const r = await comandoDeMusica(
    sala, c.nome, musica,
    c.nome === 'pular' ? contexto?.tocandoAgora() ?? undefined : undefined,
    c.nome === 'tirar' ? { playlist: c.arg } : undefined,
  );
  anotar('info', 'musica', `/${c.nome}: servidor respondeu em ${Math.round(performance.now() - antesDoServidor)} ms`);
  if (r.sala) contarQueAMusicaMudou(r.sala.id, r.musica, r.agora ?? 0);
  return r.mensagem;
}

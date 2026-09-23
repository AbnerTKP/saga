import { comandoDeMusica, type EstadoDaMusica, type Mensagem } from './api';
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
type Contexto = { eu: { id: number; nome: string }; naCall: () => boolean; podeTocar: () => boolean };
let contexto: Contexto | null = null;
export const definirContextoDoBot = (c: Contexto | null) => { contexto = c; };

export const FORA_DA_CALL = 'Entre numa sala de voz primeiro: eu toco na call em que você está.';
export const SEM_PERMISSAO = 'Seu cargo não pode pôr música. Peça ao dono do servidor a permissão "Tocar música".';

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
 * Executa um comando numa sala de texto. `aoProcurar` avisa que a busca começou — é só o
 * `/tocar` que demora, e a tela mostra "procurando" enquanto isso. O erro sobe com o texto
 * que a pessoa lê.
 */
export async function executarComando(
  sala: number,
  c: { nome: NomeDoComando; arg: string },
  aoProcurar?: () => void,
): Promise<Mensagem> {
  if (contexto && !contexto.naCall()) throw new Error(FORA_DA_CALL);
  if (contexto && c.nome !== 'fila' && !contexto.podeTocar()) throw new Error(SEM_PERMISSAO);

  let musica;
  if (c.nome === 'tocar') {
    if (!window.desktop?.musica) throw new Error('Esta Saga é antiga para o bot de música. Atualize.');
    aoProcurar?.();
    for (const f of aoIrTocar) f();
    const inicio = performance.now();
    const achada = await window.desktop.musica.achar(c.arg);
    if (!achada.ok) throw new Error(achada.erro);
    musica = achada.musica;
    // As marcas de tempo ficam no registro: é por elas que se sabe onde a espera foi parar
    // no computador de quem reclamou, sem adivinhar (ver voz-e-live.md, o bot de música).
    anotar('info', 'musica', `/tocar: achada em ${Math.round(performance.now() - inicio)} ms`);
  }
  const antesDoServidor = performance.now();
  const r = await comandoDeMusica(sala, c.nome, musica);
  anotar('info', 'musica', `/${c.nome}: servidor respondeu em ${Math.round(performance.now() - antesDoServidor)} ms`);
  if (r.sala) contarQueAMusicaMudou(r.sala.id, r.musica, r.agora ?? 0);
  return r.mensagem;
}

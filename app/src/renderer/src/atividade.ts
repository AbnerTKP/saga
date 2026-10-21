/**
 * A atividade — o jogo aberto no computador de cada um — do lado da tela.
 *
 * Quem acha o jogo é o processo principal (`main/atividade.ts`); quem guarda e espalha é o
 * servidor, junto do sinal de vida (`server/presenca.mjs`). Aqui fica o que a tela decide: os
 * ajustes da pessoa, o que vai para o servidor, como se lê "há 1 h 12 min" e onde está a
 * imagem do jogo. Puro, para ter teste.
 */
import type { AjustesDaAtividade, JogoNoComputador } from './desktop';

/** O que o servidor diz que alguém está jogando. Servidor antigo não manda o campo. */
export type Atividade = { nome: string; desde: number; steam: number | null; icone: string | null };

/** Onde ficam os ajustes e os jogos já vistos, neste computador. O prefixo é o de sempre. */
export const CHAVE_DOS_AJUSTES = 'cantinho.atividade';
export const CHAVE_DOS_VISTOS = 'cantinho.jogosVistos';

/** Nasce LIGADA, como no Discord — decisão do dono em 20/10/2026. */
export const AJUSTES_PADRAO: AjustesDaAtividade = { mostrar: true, escondidos: [], meus: [] };

/** O que estava guardado, conferido: chave vazia ou lixo voltam ao padrão, e não a "desligado". */
export function lerAjustes(texto: string | null): AjustesDaAtividade {
  let o: Record<string, unknown> = {};
  try { const v = JSON.parse(texto ?? ''); if (v && typeof v === 'object' && !Array.isArray(v)) o = v; } catch { /* padrão */ }
  const escondidos = Array.isArray(o.escondidos) ? [...new Set(o.escondidos.filter((x): x is string => typeof x === 'string'))] : [];
  const meus = Array.isArray(o.meus)
    ? o.meus.flatMap((m) => (m && typeof m.exe === 'string' && typeof m.nome === 'string' && m.exe && m.nome.trim()
      ? [{ exe: m.exe.toLowerCase(), nome: m.nome.trim() }] : []))
    : [];
  return { mostrar: o.mostrar !== false, escondidos, meus };
}

/** O que vai no sinal de vida: só o que os outros veem — nem a chave nem de onde veio. */
export function paraMandar(jogo: JogoNoComputador | null, ajustes: AjustesDaAtividade): Atividade | null {
  if (!jogo || !ajustes.mostrar || ajustes.escondidos.includes(jogo.chave)) return null;
  return { nome: jogo.nome, desde: jogo.desde, steam: jogo.steam, icone: jogo.icone };
}

const CDN = 'https://cdn.cloudflare.steamstatic.com';

/**
 * O ícone de 32×32 do Steam. O endereço é MONTADO aqui com o número e o hash que o servidor
 * conferiu — nunca uma URL que veio pronta de alguém.
 */
export function iconeDoJogo(a: Pick<Atividade, 'steam' | 'icone'>): string | null {
  return a.steam && a.icone && /^[0-9a-f]{40}$/.test(a.icone)
    ? `${CDN}/steamcommunity/public/images/apps/${a.steam}/${a.icone}.jpg` : null;
}

/** A capa em pé (600×900), a "caixa do jogo" do perfil. Jogo antigo pode não ter: aí vem o controle. */
export function capaDoJogo(a: Pick<Atividade, 'steam'>): string | null {
  return a.steam ? `${CDN}/steam/apps/${a.steam}/library_600x900.jpg` : null;
}

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

/** Há quanto tempo o jogo está aberto: "há 5 min", "há 1 h 12 min", "há 3 h". */
export function haQuantoTempo(desde: number, agora: number): string {
  const passou = agora - desde;
  if (passou < MINUTO) return 'agora há pouco';
  if (passou < HORA) return `há ${Math.floor(passou / MINUTO)} min`;
  const horas = Math.floor(passou / HORA);
  const minutos = Math.floor((passou % HORA) / MINUTO);
  return horas < 10 && minutos ? `há ${horas} h ${minutos} min` : `há ${horas} h`;
}

/** Um jogo que a Saga já viu aberto neste computador, para a lista da página Atividade. */
export type JogoVisto = Omit<JogoNoComputador, 'desde'> & { vistoEm: number };

/** Os vistos guardados, conferidos. */
export function lerVistos(texto: string | null): JogoVisto[] {
  try {
    const v = JSON.parse(texto ?? '');
    return Array.isArray(v)
      ? v.filter((j) => j && typeof j.chave === 'string' && typeof j.nome === 'string' && typeof j.vistoEm === 'number')
      : [];
  } catch { return []; }
}

/** Quantos jogos a lista lembra: é para achar o que esconder, não um histórico. */
export const VISTOS_NO_MAXIMO = 12;

/** O jogo aberto agora vai para o topo da lista dos vistos, sem repetir. */
export function anotarVisto(vistos: readonly JogoVisto[], jogo: JogoNoComputador, agora: number): JogoVisto[] {
  const { desde: _desde, ...resto } = jogo;
  return [{ ...resto, vistoEm: agora }, ...vistos.filter((v) => v.chave !== jogo.chave)].slice(0, VISTOS_NO_MAXIMO);
}

/** De onde a Saga sabe que é este jogo, do jeito que a pessoa entende. */
export const DE_ONDE: Record<JogoNoComputador['origem'], string> = {
  steam: 'pelo Steam',
  conhecido: 'pelo nome do programa',
  seu: 'você apontou',
};

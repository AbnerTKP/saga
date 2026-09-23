/**
 * O que o `/tocar` recebeu, e o que o `yt-dlp` respondeu — a parte do bot de música que dá
 * para testar sem rede. Quem roda o programa e baixa é `musica.ts`.
 *
 * O texto da pessoa vira argumento de um programa: nada que ela digitou chega lá cru. Link
 * reconhecido vira um endereço montado aqui, pelo id; o resto vira `ytsearch1:<texto>`, que o
 * `yt-dlp` lê como busca — e um texto começando com `-` não vira opção, porque não é o começo
 * do argumento.
 */

export type Pedido =
  | { tipo: 'youtube'; url: string }
  | { tipo: 'spotify'; url: string }
  | { tipo: 'busca'; termo: string };

export type Origem = 'youtube' | 'spotify' | 'busca';

export type MusicaAchada = {
  id: string;
  titulo: string;
  autor: string;
  duracao: number;
  origem: Origem;
};

export class ErroDaMusica extends Error {}

/**
 * Duas horas: cabe disco e mix longo. Acima disso o arquivo passa de 130 MB, e ele atravessa
 * inteiro para a tela (`musica:ler`) — com a cópia do Blob, o dobro disso de memória. O
 * servidor tem o mesmo teto (`DURACAO_MAXIMA`, musica.mjs).
 */
export const DURACAO_MAXIMA = 2 * 60 * 60;

const ID = /^[A-Za-z0-9_-]{11}$/;

/** Link do YouTube em qualquer das formas que se cola; `null` se não for um. */
export function idDoYoutube(texto: string): string | null {
  let u: URL;
  try { u = new URL(texto.trim()); } catch { return null; }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = /^\/(shorts|live|embed)\/([^/]+)/.exec(u.pathname);
      if (m) id = m[2];
    }
  }
  return id && ID.test(id) ? id : null;
}

/**
 * Decide o que fazer com o que veio depois de `/tocar`. Playlist e álbum ficam de fora de
 * propósito: uma música por comando é o que cabe numa fila de cinco amigos, e uma playlist
 * de 300 músicas colada sem querer encheria a fila de todo mundo.
 */
export function lerPedido(texto: string): Pedido {
  const t = texto.trim();
  if (!t) throw new ErroDaMusica('Diga o que tocar: um link do YouTube ou do Spotify, ou o nome da música.');
  if (/^https?:\/\//i.test(t)) {
    const id = idDoYoutube(t);
    if (id) return { tipo: 'youtube', url: `https://www.youtube.com/watch?v=${id}` };
    let u: URL | null = null;
    try { u = new URL(t); } catch { /* cai no erro de baixo */ }
    if (u?.hostname === 'open.spotify.com') {
      const m = /^\/(?:intl-[a-z-]+\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/.exec(u.pathname);
      if (m?.[1] === 'track') return { tipo: 'spotify', url: `https://open.spotify.com/track/${m[2]}` };
      if (m) throw new ErroDaMusica('Por enquanto é uma música por vez: mande o link da música, não do álbum ou da playlist.');
    }
    if (u && /(^|\.)youtube\.com$/.test(u.hostname) && u.searchParams.get('list')) {
      throw new ErroDaMusica('Por enquanto é uma música por vez: mande o link de um vídeo, não da playlist.');
    }
    throw new ErroDaMusica('Esse link eu não sei tocar. Mande um do YouTube ou do Spotify, ou o nome da música.');
  }
  return { tipo: 'busca', termo: t.slice(0, 200) };
}

const decodificar = (s: string) => s
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/**
 * Nome e artista de uma música do Spotify, lidos da página dela. O Spotify não entrega o
 * áudio a ninguém: o que se faz — é o que os bots do Discord fazem — é procurar a mesma
 * música no YouTube pelo nome. Medido em 22/09/2026: pedida com cabeçalho de navegador, a
 * página volta vazia (é o aplicativo web); com o de um programa qualquer, vem com
 * `og:title` = a música e `og:description` = "Artista · Álbum · Song · Ano".
 */
export function lerSpotify(html: string): { titulo: string; artista: string } {
  const meta = (prop: string) => {
    const m = new RegExp(`<meta property="og:${prop}" content="([^"]*)"`).exec(html);
    return m ? decodificar(m[1]).trim() : '';
  };
  const titulo = meta('title');
  const artista = meta('description').split(' · ')[0]?.trim() ?? '';
  if (!titulo) throw new ErroDaMusica('Não consegui ler essa música do Spotify.');
  return { titulo, artista };
}

/**
 * A resposta do `yt-dlp` como o bot a guarda. Busca vem como lista com uma entrada; link
 * direto, como o vídeo. Canal automático do YouTube se chama "Artista - Topic", e o " - Topic"
 * não é nome de ninguém.
 */
export function lerRespostaDoYtDlp(json: unknown, origem: Origem): MusicaAchada {
  const bruto = json as Record<string, unknown> & { entries?: Record<string, unknown>[] };
  const v = (Array.isArray(bruto?.entries) ? bruto.entries[0] : bruto) as Record<string, unknown> | undefined;
  if (!v || typeof v.id !== 'string') throw new ErroDaMusica('Não achei nada com esse nome.');
  if (v.is_live || v.live_status === 'is_live' || v.live_status === 'is_upcoming') {
    throw new ErroDaMusica('Ao vivo não dá: a música precisa ter fim.');
  }
  const duracao = Number(v.duration);
  if (!(duracao > 0)) throw new ErroDaMusica('Não sei quanto essa dura, e sem isso não dá para pôr na fila.');
  if (duracao > DURACAO_MAXIMA) throw new ErroDaMusica('Passa de 2 horas. Escolha algo mais curto.');
  const autor = String(v.artist ?? v.uploader ?? v.channel ?? '').replace(/ - Topic$/, '').trim();
  return {
    id: v.id,
    titulo: String(v.track ?? v.title ?? '').trim() || v.id,
    autor,
    duracao: Math.round(duracao),
    origem,
  };
}

/**
 * Os argumentos do `yt-dlp` para achar E baixar numa ida só. Medido em 22/09/2026, num Mac:
 * achar e depois baixar custavam duas partidas do programa; juntos, 3,6 s do comando ao
 * arquivo.
 *
 * SEM `--no-part`. Estava aqui, e quebrava a música pedida pela segunda vez: sem o `.part`, o
 * yt-dlp toma o arquivo inteiro por um download pela metade, pede ao YouTube "do fim em
 * diante" e leva HTTP 416 (medido em 23/09/2026). Com o `.part`, o arquivo pronto é
 * reconhecido e ele só responde os dados — e o pela metade tem nome próprio, que `arquivoDe`
 * ignora.
 */
export function argumentosParaBaixar(alvo: string, pasta: string): string[] {
  return [
    // `--ignore-config`: a configuração pessoal do yt-dlp de quem tiver uma (um `-x`, um
    // `--download-archive`) mudaria o que a Saga recebe — visto na revisão de 23/09/2026.
    '--ignore-config', '--no-warnings', '--no-playlist', '--quiet',
    '-f', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
    // Os dados da música saem ANTES do download (`before_dl`) — ver `iniciar`, em musica.ts.
    '--print', 'before_dl:%()j', '--no-simulate',
    '-o', `${pasta}/%(id)s.%(ext)s`,
    '--', alvo,
  ];
}

/** O que passar ao `yt-dlp`: o link montado aqui, ou a busca. */
export const alvoDoPedido = (p: Pedido, spotify?: { titulo: string; artista: string }): string =>
  p.tipo === 'youtube' ? p.url
    : p.tipo === 'spotify' ? `ytsearch1:${spotify!.artista} ${spotify!.titulo}`.trim()
      : `ytsearch1:${p.termo}`;

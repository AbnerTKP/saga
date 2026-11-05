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
  /** `aPartirDe`: o vídeo do link, quando ele veio de dentro da playlist. */
  | { tipo: 'playlist-youtube'; url: string; aPartirDe: string | null }
  | { tipo: 'playlist-spotify'; url: string }
  | { tipo: 'busca'; termo: string };

export type Origem = 'youtube' | 'spotify' | 'busca';

export type MusicaAchada = {
  id: string;
  titulo: string;
  autor: string;
  duracao: number;
  origem: Origem;
};

/** A playlist como vai ao servidor. No Spotify, `musicas` começa com uma só; ver `musica.ts`. */
export type PlaylistAchada = {
  nome: string;
  /** Quantas a playlist tem que dá para tocar. */
  total: number;
  /** A página do Spotify entrega só as primeiras 100: aí o total é "100 ou mais". */
  maisDe: boolean;
  /** Quantas devem entrar na fila. */
  quantas: number;
  /** A soma, em segundos, das que devem entrar. */
  duracao: number;
  origem: 'youtube' | 'spotify';
  musicas: MusicaAchada[];
};

export class ErroDaMusica extends Error {}

/**
 * Duas horas: cabe disco e mix longo. Acima disso o arquivo passa de 130 MB, e ele atravessa
 * inteiro para a tela (`musica:ler`) — com a cópia do Blob, o dobro disso de memória. O
 * servidor tem o mesmo teto (`DURACAO_MAXIMA`, musica.mjs).
 */
export const DURACAO_MAXIMA = 2 * 60 * 60;

/**
 * Quantas músicas uma playlist põe na fila. O servidor tem o mesmo teto (`MAXIMO_POR_PLAYLIST`,
 * musica.mjs): acima dele a fila dos amigos fica sem lugar.
 */
export const MAXIMO_POR_PLAYLIST = 50;

const ID = /^[A-Za-z0-9_-]{11}$/;
/** O id de uma lista do YouTube: `PL…`, `OLAK5uy_…` (álbum), `RDCLAK5uy_…` (YouTube Music). */
const ID_DE_LISTA = /^[A-Za-z0-9_-]{10,80}$/;
/**
 * O mix automático (`RD…`) não é uma playlist que alguém montou: é o YouTube emendando vídeos.
 * Medido em 04/11/2026: 874 entradas e 21,6 s para ler. O `RDCLAK5uy_` é a exceção: tem o mesmo
 * começo, mas é uma lista de verdade do YouTube Music.
 */
const MIX = /^RD(?!CLAK5uy_)/;
/** As listas pessoais (assistir depois, curtidas): só abrem logado, e o yt-dlp não está. */
const PESSOAL = /^(WL|LL|LM)$/;

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

/** Link sem o `https://`, como o navegador do celular copia e como se digita de cabeça. */
const SEM_PROTOCOLO = /^((www|m|music)\.)?(youtube\.com|youtu\.be)\/|^open\.spotify\.com\//i;

/** O link que veio no texto: `/tocar olha essa https://youtu.be/…` é o link, não uma busca. */
function linkDoTexto(t: string): string | null {
  if (SEM_PROTOCOLO.test(t)) return `https://${t.split(/\s/)[0]}`;
  return /https?:\/\/\S+/i.exec(t)?.[0] ?? null;
}

/**
 * Decide o que fazer com o que veio depois de `/tocar`. Tudo o que vira argumento do programa é
 * montado aqui, pelo id: nada do texto da pessoa chega cru ao `yt-dlp`.
 *
 * Link de vídeo de dentro de uma playlist (`watch?v=…&list=…`) toca a playlist dali em diante,
 * por escolha do dono em 04/11/2026: é o que está na barra do navegador de quem ouve uma lista,
 * e quem queria só aquele vídeo tira o resto no cartão.
 */
export function lerPedido(texto: string): Pedido {
  const t = texto.trim();
  if (!t) throw new ErroDaMusica('Diga o que tocar: um link do YouTube ou do Spotify, ou o nome da música.');
  const link = linkDoTexto(t);
  if (!link) return { tipo: 'busca', termo: t.slice(0, 200) };
  let u: URL | null = null;
  try { u = new URL(link); } catch { /* cai no erro de baixo */ }
  if (u?.hostname === 'open.spotify.com') {
    const m = /^\/(?:intl-[a-z-]+\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/.exec(u.pathname);
    if (m?.[1] === 'track') return { tipo: 'spotify', url: `https://open.spotify.com/track/${m[2]}` };
    if (m?.[1] === 'album' || m?.[1] === 'playlist') return { tipo: 'playlist-spotify', url: `https://open.spotify.com/embed/${m[1]}/${m[2]}` };
    if (m) throw new ErroDaMusica('Esse link do Spotify eu não sei tocar. Mande uma música, um álbum ou uma playlist.');
  }
  const id = idDoYoutube(link);
  const video = id ? { tipo: 'youtube' as const, url: `https://www.youtube.com/watch?v=${id}` } : null;
  const lista = u && /(^|\.)youtube\.com$|^youtu\.be$/.test(u.hostname) ? u.searchParams.get('list') : null;
  if (lista && ID_DE_LISTA.test(lista) && !MIX.test(lista) && !PESSOAL.test(lista)) {
    return { tipo: 'playlist-youtube', url: `https://www.youtube.com/playlist?list=${lista}`, aPartirDe: id };
  }
  if (video) return video;
  if (lista && (MIX.test(lista) || PESSOAL.test(lista))) {
    throw new ErroDaMusica('Essa lista só existe na sua conta do YouTube. Mande o link de um vídeo ou de uma playlist pública.');
  }
  throw new ErroDaMusica('Esse link eu não sei tocar. Mande um do YouTube ou do Spotify, ou o nome da música.');
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
export const alvoDoPedido = (
  p: Extract<Pedido, { tipo: 'youtube' | 'spotify' | 'busca' }>,
  spotify?: { titulo: string; artista: string },
): string =>
  p.tipo === 'youtube' ? p.url
    : p.tipo === 'spotify' ? `ytsearch1:${spotify!.artista} ${spotify!.titulo}`.trim()
      : `ytsearch1:${p.termo}`;

/**
 * Ler uma playlist inteira sem baixar nada. Medido em 04/11/2026: 125 músicas em 2,1 s, 239 em
 * 2,7 s, e com `--playlist-end 100` a resposta ainda diz o total (`playlist_count`).
 */
export const argumentosDaPlaylist = (url: string, teto: number): string[] =>
  ['--ignore-config', '--no-warnings', '--flat-playlist', '-J', '--playlist-end', String(teto), '--', url];

/**
 * Procurar várias músicas no YouTube numa partida só do programa, uma linha de JSON por música
 * achada. Medido em 04/11/2026: 10 buscas em 10,2 s. `-i` porque uma busca que falha não pode
 * derrubar as outras; a que não acha nada só não imprime linha.
 */
export const argumentosDaBusca = (termos: string[]): string[] =>
  ['--ignore-config', '--no-warnings', '--flat-playlist', '-j', '-i', '--', ...termos.map((t) => `ytsearch1:${t}`)];

const NAO_ABRIU = 'Não consegui abrir essa playlist. Ela pode ser privada: abra o link e confira se está como pública ou não listada.';
const NADA_TOCAVEL = 'Nenhuma música dessa playlist dá para tocar.';

/** Uma entrada, ou nada: vídeo apagado, privado ou ao vivo fica de fora, sem derrubar a lista. */
function entradaTocavel(json: unknown, origem: Origem): MusicaAchada | null {
  try {
    const m = lerRespostaDoYtDlp(json, origem);
    return ID.test(m.id) ? m : null;
  } catch { return null; }
}

/** Uma linha de `argumentosDaBusca`; `null` se não der para tocar. */
export function lerLinhaDaBusca(linha: string): MusicaAchada | null {
  try { return entradaTocavel(JSON.parse(linha), 'spotify'); } catch { return null; }
}

const somar = (musicas: { duracao: number }[]) => musicas.reduce((soma, m) => soma + m.duracao, 0);

/**
 * A resposta de `argumentosDaPlaylist`. `null` quando o link era de um vídeo e ele não está no
 * trecho lido: aí quem chama toca só o vídeo, que foi o que a pessoa viu.
 */
export function lerPlaylistDoYtDlp(json: unknown, aPartirDe: string | null = null): PlaylistAchada | null {
  const b = json as { title?: unknown; playlist_count?: unknown; entries?: { id?: unknown }[] } | null;
  if (!b || !Array.isArray(b.entries)) throw new ErroDaMusica(NAO_ABRIU);
  const inicio = aPartirDe ? b.entries.findIndex((e) => e?.id === aPartirDe) : 0;
  if (inicio < 0) return null;
  const achadas = b.entries.slice(inicio).flatMap((e) => entradaTocavel(e, 'youtube') ?? []);
  if (!achadas.length) throw new ErroDaMusica(NADA_TOCAVEL);
  const musicas = achadas.slice(0, MAXIMO_POR_PLAYLIST);
  // Lida até o fim, o total é o que dá para tocar: vídeo apagado não conta como "não coube".
  const declarado = Number(b.playlist_count) || 0;
  const leuTudo = b.entries.length >= declarado;
  return {
    nome: String(b.title ?? '').trim() || 'Playlist',
    total: leuTudo ? achadas.length : Math.max(achadas.length, declarado - inicio),
    maisDe: false,
    quantas: musicas.length,
    duracao: somar(musicas),
    origem: 'youtube',
    musicas,
  };
}

type FaixaDoSpotify = { titulo: string; artista: string; duracao: number };

/**
 * A playlist ou o álbum do Spotify, lidos da página de incorporar (`/embed/…`). Medido em
 * 04/11/2026: a página comum traz só 30 links, sem nome nenhum; a de incorporar traz nome, artista
 * e duração, no `__NEXT_DATA__`, de até 100 faixas (playlists maiores vêm cortadas nas 100).
 */
export function lerEmbedDoSpotify(html: string): { nome: string; faixas: FaixaDoSpotify[]; maisDe: boolean } {
  const erro = () => new ErroDaMusica('Não consegui ler essa playlist do Spotify. Ela pode ser privada.');
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw erro();
  let dados: { props?: { pageProps?: { state?: { data?: { entity?: {
    name?: unknown; title?: unknown; trackList?: { title?: unknown; subtitle?: unknown; duration?: unknown }[];
  } } } } } };
  try { dados = JSON.parse(m[1]); } catch { throw erro(); }
  const e = dados.props?.pageProps?.state?.data?.entity;
  if (!e || !Array.isArray(e.trackList)) throw erro();
  const faixas = e.trackList.flatMap((f) => {
    const titulo = String(f?.title ?? '').trim();
    const duracao = Math.round(Number(f?.duration) / 1000);
    if (!titulo || !(duracao > 0) || duracao > DURACAO_MAXIMA) return [];
    // Os artistas vêm separados por vírgula e espaço duro: "Pitbull, Sensato".
    return [{ titulo, artista: String(f?.subtitle ?? '').replace(/\s+/g, ' ').trim(), duracao }];
  });
  if (!faixas.length) throw new ErroDaMusica(NADA_TOCAVEL);
  return { nome: String(e.name ?? e.title ?? '').trim() || 'Playlist', faixas, maisDe: e.trackList.length >= 100 };
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  idDoYoutube, lerPedido, lerSpotify, lerRespostaDoYtDlp, argumentosParaBaixar, alvoDoPedido, ErroDaMusica,
  lerPlaylistDoYtDlp, lerEmbedDoSpotify, lerLinhaDaBusca, argumentosDaBusca, argumentosDaPlaylist, MAXIMO_POR_PLAYLIST,
} from './buscaDeMusica.ts';

test('o link do YouTube é reconhecido em todas as formas que se cola', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&index=4',
    'https://youtu.be/dQw4w9WgXcQ?si=abc',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
  ]) assert.equal(idDoYoutube(url), 'dQw4w9WgXcQ', url);
  assert.equal(idDoYoutube('https://evil.example/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(idDoYoutube('https://youtube.com/watch?v=curto'), null);
});

test('o link vira um endereço montado aqui, pelo id — nunca o texto cru', () => {
  assert.deepEqual(lerPedido('  https://youtu.be/dQw4w9WgXcQ?t=42 '), { tipo: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.deepEqual(lerPedido('https://open.spotify.com/intl-pt/track/4cOdK2wGLETKBW3PvgPWqT?si=x'),
    { tipo: 'spotify', url: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT' });
});

test('nome solto é busca, e texto com cara de opção não vira opção', () => {
  assert.deepEqual(lerPedido('despacito'), { tipo: 'busca', termo: 'despacito' });
  const pedido = lerPedido('--exec "rm -rf ~"');
  assert.ok(pedido.tipo === 'busca');
  const alvo = alvoDoPedido(pedido);
  assert.ok(alvo.startsWith('ytsearch1:'), alvo);
  const args = argumentosParaBaixar(alvo, '/tmp/x');
  assert.equal(args.at(-2), '--', 'o alvo vem depois do fim das opções');
  assert.equal(args.at(-1), alvo);
  assert.ok(!args.includes('--no-part'), 'sem .part, a música já baixada volta com HTTP 416');
  assert.ok(args.includes('before_dl:%()j'), 'os dados da música saem antes do download');
  assert.ok(args.includes('--ignore-config'), 'a configuração pessoal do yt-dlp não entra');
});

const LISTA = 'PLBD5pRttJ7N0vCfh4NpEg7Vw47hfeCxuE';

test('playlist do YouTube e do YouTube Music viram um endereço montado aqui', () => {
  const pedido = { tipo: 'playlist-youtube', url: `https://www.youtube.com/playlist?list=${LISTA}`, aPartirDe: null };
  assert.deepEqual(lerPedido(`https://www.youtube.com/playlist?list=${LISTA}&si=abc`), pedido);
  assert.deepEqual(lerPedido(`https://music.youtube.com/playlist?list=${LISTA}`), pedido);
  const album = 'OLAK5uy_kFyQKAqpdZ5Wx6qZ4bXjZpJd1qL0aBcDe';
  assert.equal((lerPedido(`https://music.youtube.com/playlist?list=${album}`) as { url: string }).url, `https://www.youtube.com/playlist?list=${album}`);
  // O que vem depois do `list=` não chega ao programa: id que não é id não é playlist.
  assert.throws(() => lerPedido('https://www.youtube.com/playlist?list=--exec%20rm'), /não sei tocar/);
});

test('vídeo de dentro de uma playlist toca a playlist dali em diante', () => {
  const pedido = { tipo: 'playlist-youtube', url: `https://www.youtube.com/playlist?list=${LISTA}`, aPartirDe: 'dQw4w9WgXcQ' };
  assert.deepEqual(lerPedido(`https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${LISTA}&index=4`), pedido);
  assert.deepEqual(lerPedido(`https://youtu.be/dQw4w9WgXcQ?list=${LISTA}`), pedido);
});

test('mix automático e lista pessoal não são playlist: com vídeo, toca o vídeo', () => {
  const video = { tipo: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' };
  assert.deepEqual(lerPedido('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1'), video);
  assert.deepEqual(lerPedido('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=WL'), video);
  assert.deepEqual(lerPedido('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=curto'), video);
  assert.throws(() => lerPedido('https://www.youtube.com/playlist?list=WL'), /só existe na sua conta/);
  // Esta tem o começo do mix, mas é uma lista de verdade do YouTube Music.
  assert.equal(lerPedido('https://music.youtube.com/playlist?list=RDCLAK5uy_kmPRjHDECIcuVwnKsx2Ng7fyNgFKWNJFs').tipo, 'playlist-youtube');
});

test('playlist e álbum do Spotify vão pela página de incorporar', () => {
  assert.deepEqual(lerPedido('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=x'),
    { tipo: 'playlist-spotify', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M' });
  assert.deepEqual(lerPedido('https://open.spotify.com/intl-pt/album/4aawyAB9vmqN3uQ7FjRGTy'),
    { tipo: 'playlist-spotify', url: 'https://open.spotify.com/embed/album/4aawyAB9vmqN3uQ7FjRGTy' });
});

test('link sem https e link no meio do texto continuam sendo link', () => {
  const video = { tipo: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' };
  assert.deepEqual(lerPedido('youtu.be/dQw4w9WgXcQ'), video);
  assert.deepEqual(lerPedido('www.youtube.com/watch?v=dQw4w9WgXcQ'), video);
  assert.deepEqual(lerPedido('youtube.com/watch?v=dQw4w9WgXcQ'), video);
  assert.deepEqual(lerPedido('olha essa https://youtu.be/dQw4w9WgXcQ muito boa'), video);
  assert.equal(lerPedido('open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M').tipo, 'playlist-spotify');
  // Nome de música com ponto continua sendo busca.
  assert.equal(lerPedido('youtube.com é o nome da música').tipo, 'busca');
  assert.equal(lerPedido('R.E.M. Losing My Religion').tipo, 'busca');
});

test('link desconhecido tem resposta que diz o que fazer', () => {
  assert.throws(() => lerPedido('https://open.spotify.com/artist/0gxyHStUsqpMadRV0Di1Qt'), (e: Error) => e instanceof ErroDaMusica && /álbum ou uma playlist/.test(e.message));
  assert.throws(() => lerPedido('https://soundcloud.com/x/y'), /não sei tocar/);
  assert.throws(() => lerPedido('   '), /Diga o que tocar/);
});

const entrada = (id: string, duracao: number | null, title: string | null = `música ${id}`) =>
  ({ _type: 'url', id, title, duration: duracao, uploader: 'Banda - Topic' });
/** `n` ids diferentes, de 11 letras. */
const ids = (n: number) => Array.from({ length: n }, (_, i) => `video${String(i).padStart(6, '0')}`);

test('a playlist do YouTube: quem não dá para tocar fica de fora, sem contar como "não coube"', () => {
  // Formato real, medido em 04/11/2026: apagado e privado vêm com título e duração nulos.
  const p = lerPlaylistDoYtDlp({
    _type: 'playlist', title: 'Best of Classic Rock', playlist_count: 4,
    entries: [entrada('8SbUC-UaAxE', 557), entrada('eVTXPUF4Oz4', null, null), entrada('fJ9rUzIMcZQ', 360), entrada('muitolongo1', 7201)],
  })!;
  assert.equal(p.nome, 'Best of Classic Rock');
  assert.deepEqual(p.musicas.map((m) => m.id), ['8SbUC-UaAxE', 'fJ9rUzIMcZQ']);
  assert.equal(p.total, 2);
  assert.equal(p.quantas, 2);
  assert.equal(p.duracao, 917);
  assert.equal(p.musicas[0].autor, 'Banda');
  assert.equal(p.musicas[0].origem, 'youtube');
});

test('a playlist grande entra até o teto, e o total conta a lista inteira', () => {
  const entradas = ids(80).map((id) => entrada(id, 100));
  const p = lerPlaylistDoYtDlp({ title: 'x', playlist_count: 239, entries: entradas })!;
  assert.equal(p.musicas.length, MAXIMO_POR_PLAYLIST);
  assert.equal(p.quantas, MAXIMO_POR_PLAYLIST);
  assert.equal(p.total, 239);
  assert.equal(p.duracao, MAXIMO_POR_PLAYLIST * 100);
});

test('a playlist começa no vídeo do link; fora do trecho lido, quem decide é quem chamou', () => {
  const [a, b, c] = ids(3);
  const entradas = [a, b, c].map((id) => entrada(id, 100));
  const p = lerPlaylistDoYtDlp({ title: 'x', playlist_count: 3, entries: entradas }, b)!;
  assert.deepEqual(p.musicas.map((m) => m.id), [b, c]);
  assert.equal(p.total, 2);
  assert.equal(lerPlaylistDoYtDlp({ title: 'x', playlist_count: 3, entries: entradas }, 'naoesta0000'), null);
  // Lida em parte: o total é o que falta da lista, a partir do vídeo.
  assert.equal(lerPlaylistDoYtDlp({ title: 'x', playlist_count: 100, entries: entradas }, b)!.total, 99);
});

test('playlist que não abre e playlist sem nada tocável dizem o motivo', () => {
  // É o que o yt-dlp imprime com -J quando a lista não existe (medido): `null`.
  assert.throws(() => lerPlaylistDoYtDlp(null), (e: Error) => e instanceof ErroDaMusica && /pode ser privada/.test(e.message));
  assert.throws(() => lerPlaylistDoYtDlp({ title: 'x', entries: [entrada('8SbUC-UaAxE', null)] }), /Nenhuma música/);
});

const paginaDoSpotify = (entity: unknown) =>
  `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { state: { data: { entity } } } } })}</script></html>`;

test('a página de incorporar do Spotify: nome, artista e duração de cada faixa', () => {
  // Formato real, medido em 04/11/2026.
  const r = lerEmbedDoSpotify(paginaDoSpotify({
    type: 'album', name: 'Global Warming', trackList: [
      { title: 'Global Warming (feat. Sensato)', subtitle: 'Pitbull, Sensato', duration: 85400 },
      { title: 'Sem duração', subtitle: 'X', duration: 0 },
      { title: 'Muito longa', subtitle: 'X', duration: 7201000 },
    ],
  }));
  assert.equal(r.nome, 'Global Warming');
  assert.equal(r.maisDe, false);
  assert.deepEqual(r.faixas, [{ titulo: 'Global Warming (feat. Sensato)', artista: 'Pitbull, Sensato', duracao: 85 }]);
});

test('o Spotify corta nas 100: o total passa a ser "100 ou mais"', () => {
  const faixa = { title: 't', subtitle: 'a', duration: 1000 };
  assert.equal(lerEmbedDoSpotify(paginaDoSpotify({ name: 'x', trackList: Array(100).fill(faixa) })).maisDe, true);
  assert.equal(lerEmbedDoSpotify(paginaDoSpotify({ name: 'x', trackList: Array(99).fill(faixa) })).maisDe, false);
});

test('página do Spotify sem a playlist dá um erro que se entende', () => {
  assert.throws(() => lerEmbedDoSpotify('<html></html>'), /pode ser privada/);
  assert.throws(() => lerEmbedDoSpotify('<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{}}}</script>'), /pode ser privada/);
  assert.throws(() => lerEmbedDoSpotify('<script id="__NEXT_DATA__">{quebrado</script>'), /pode ser privada/);
  assert.throws(() => lerEmbedDoSpotify(paginaDoSpotify({ name: 'x', trackList: [] })), /Nenhuma música/);
});

test('a busca em lote: uma partida só, cada termo como busca, e linha ruim não derruba', () => {
  const args = argumentosDaBusca(['Oasis Wonderwall', '--exec rm']);
  assert.equal(args.at(-3), '--', 'os termos vêm depois do fim das opções');
  assert.deepEqual(args.slice(-2), ['ytsearch1:Oasis Wonderwall', 'ytsearch1:--exec rm']);
  assert.ok(args.includes('-i'), 'uma busca que falha não derruba as outras');
  assert.ok(args.includes('--ignore-config'));
  const achada = lerLinhaDaBusca('{"_type":"url","id":"6hzrDeceEKc","title":"Oasis - Wonderwall","duration":280,"channel":"Oasis"}');
  assert.deepEqual(achada, { id: '6hzrDeceEKc', titulo: 'Oasis - Wonderwall', autor: 'Oasis', duracao: 280, origem: 'spotify' });
  assert.equal(lerLinhaDaBusca('{"id":"6hzrDeceEKc","title":"sem duração"}'), null);
  assert.equal(lerLinhaDaBusca('não é json'), null);
});

test('ler a playlist não baixa nada e não sai das opções', () => {
  const args = argumentosDaPlaylist('https://www.youtube.com/playlist?list=PLx', 80);
  assert.ok(args.includes('--flat-playlist'));
  assert.ok(args.includes('-J'), '-J só descreve: não baixa');
  assert.ok(args.includes('--ignore-config'));
  assert.equal(args[args.indexOf('--playlist-end') + 1], '80');
  assert.equal(args.at(-2), '--');
});

test('a página do Spotify: título pelo og:title, artista pelo primeiro pedaço da descrição', () => {
  // Trecho real, de 22/09/2026.
  const html = `<title>Never Gonna Give You Up - song and lyrics by Rick Astley | Spotify</title>
<meta property="og:title" content="Never Gonna Give You Up"/>
<meta property="og:description" content="Rick Astley · Whenever You Need Somebody · Song · 1987"/>`;
  assert.deepEqual(lerSpotify(html), { titulo: 'Never Gonna Give You Up', artista: 'Rick Astley' });
  assert.equal(alvoDoPedido({ tipo: 'spotify', url: 'x' }, lerSpotify(html)), 'ytsearch1:Rick Astley Never Gonna Give You Up');
  assert.deepEqual(lerSpotify('<meta property="og:title" content="Ela &amp; Eu"/><meta property="og:description" content="Fulano · X"/>'),
    { titulo: 'Ela & Eu', artista: 'Fulano' });
  assert.throws(() => lerSpotify('<title>Spotify – Web Player</title>'), /Não consegui ler/);
});

test('a resposta do yt-dlp: busca vem em lista, e " - Topic" não é nome de ninguém', () => {
  const busca = { _type: 'playlist', entries: [{ id: 'kJQP7kiw5Fk', title: 'Luis Fonsi - Despacito ft. Daddy Yankee', uploader: 'LuisFonsiVEVO', duration: 282.4, live_status: 'not_live' }] };
  assert.deepEqual(lerRespostaDoYtDlp(busca, 'busca'),
    { id: 'kJQP7kiw5Fk', titulo: 'Luis Fonsi - Despacito ft. Daddy Yankee', autor: 'LuisFonsiVEVO', duracao: 282, origem: 'busca' });
  const topic = { id: 'abcdefghijk', title: 'x', track: 'Faixa', uploader: 'Banda - Topic', duration: 100 };
  assert.equal(lerRespostaDoYtDlp(topic, 'youtube').autor, 'Banda');
  assert.equal(lerRespostaDoYtDlp(topic, 'youtube').titulo, 'Faixa');
});

test('ao vivo e sem duração não entram', () => {
  assert.throws(() => lerRespostaDoYtDlp({ id: 'abcdefghijk', title: 'x', is_live: true, duration: 0 }, 'youtube'), /Ao vivo/);
  assert.throws(() => lerRespostaDoYtDlp({ id: 'abcdefghijk', title: 'x' }, 'youtube'), /quanto essa dura/);
  assert.throws(() => lerRespostaDoYtDlp({ _type: 'playlist', entries: [] }, 'busca'), /Não achei/);
  // Medido: a busca "1 hour mix" trouxe um de 6 h (22 258 s, 399 MB).
  assert.throws(() => lerRespostaDoYtDlp({ id: 'abcdefghijk', title: 'mix', duration: 22258 }, 'busca'), /2 horas/);
  assert.equal(lerRespostaDoYtDlp({ id: 'abcdefghijk', title: 'mix', duration: 7200 }, 'busca').duracao, 7200);
});

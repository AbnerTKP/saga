import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idDoYoutube, lerPedido, lerSpotify, lerRespostaDoYtDlp, argumentosParaBaixar, alvoDoPedido, ErroDaMusica } from './buscaDeMusica.ts';

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
  const alvo = alvoDoPedido(lerPedido('--exec "rm -rf ~"'));
  assert.ok(alvo.startsWith('ytsearch1:'), alvo);
  const args = argumentosParaBaixar(alvo, '/tmp/x');
  assert.equal(args.at(-2), '--', 'o alvo vem depois do fim das opções');
  assert.equal(args.at(-1), alvo);
  assert.ok(!args.includes('--no-part'), 'sem .part, a música já baixada volta com HTTP 416');
  assert.ok(args.includes('before_dl:%()j'), 'os dados da música saem antes do download');
});

test('playlist, álbum e link desconhecido têm resposta que diz o que fazer', () => {
  assert.throws(() => lerPedido('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'), (e: Error) => e instanceof ErroDaMusica && /uma música por vez/.test(e.message));
  assert.throws(() => lerPedido('https://www.youtube.com/playlist?list=PL123'), /uma música por vez/);
  assert.throws(() => lerPedido('https://soundcloud.com/x/y'), /não sei tocar/);
  assert.throws(() => lerPedido('   '), /Diga o que tocar/);
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
});

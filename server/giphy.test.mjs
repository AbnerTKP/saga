import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enderecoDeGiphyValido } from './giphy.mjs';

test('aceita os endereços de mídia do Giphy', () => {
  for (const url of [
    'https://media.giphy.com/media/abc/giphy.gif',
    'https://media0.giphy.com/media/abc/giphy.gif',
    'https://media4.giphy.com/media/xyz/200w.gif',
    'https://i.giphy.com/abc.gif',
  ]) {
    assert.equal(enderecoDeGiphyValido(url), true, url);
  }
});

test('recusa qualquer outro destino', () => {
  // O endereço vem de quem pede. Sem a lista, o servidor buscaria o que mandassem —
  // inclusive endereços internos da própria máquina, que ninguém de fora alcança.
  for (const url of [
    'http://media.giphy.com/x.gif',          // sem https
    'https://media.giphy.com.evil.com/x.gif',
    'https://evil.com/media.giphy.com/x.gif',
    'https://giphy.com/media/x.gif',         // domínio do site, não da mídia
    'http://127.0.0.1:3001/eu',
    'http://localhost/admin',
    'http://169.254.169.254/latest/meta-data/',
    'file:///etc/passwd',
    'https://media.giphy.com@evil.com/x.gif',
    '', null, undefined, 'not a url',
  ]) {
    assert.equal(enderecoDeGiphyValido(url), false, String(url));
  }
});

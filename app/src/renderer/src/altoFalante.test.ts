import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ehIphone } from './altoFalante.ts';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';

test('o iPhone toca a call no alto-falante', () => {
  assert.equal(ehIphone(IPHONE, 'iPhone', 5), true);
});

test('o iPad que se apresenta como Mac também, pela tela de toque', () => {
  assert.equal(ehIphone(MAC, 'MacIntel', 5), true);
});

test('o Mac de verdade e o Android ficam como estão', () => {
  assert.equal(ehIphone(MAC, 'MacIntel', 0), false);
  assert.equal(ehIphone(ANDROID, 'Linux armv81', 5), false);
});

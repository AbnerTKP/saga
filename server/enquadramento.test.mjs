import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limpar, ler, guardar, PADRAO, ZOOM_MAXIMO } from './enquadramento.mjs';

test('enquadramento igual ao padrão não é enquadramento', () => {
  assert.equal(limpar({ ...PADRAO }), null);
});

test('valores fora da régua são trazidos para dentro', () => {
  assert.deepEqual(limpar({ x: -30, y: 400, zoom: 99 }), { x: 0, y: 100, zoom: ZOOM_MAXIMO });
  assert.deepEqual(limpar({ x: 10, y: 20, zoom: 0.1 }), { x: 10, y: 20, zoom: 1 });
});

test('o que falta vira padrão, e lixo não vira exceção', () => {
  assert.deepEqual(limpar({ x: 10 }), { x: 10, y: 50, zoom: 1 });
  assert.deepEqual(limpar({ x: 'muito', y: null, zoom: 2 }), { x: 50, y: 50, zoom: 2 });
  assert.equal(limpar(null), null);
  assert.equal(limpar('foto'), null);
  assert.equal(limpar([1, 2]), null);
});

test('o que está guardado volta separado por papel', () => {
  assert.deepEqual(ler('{"foto":{"x":10,"y":20,"zoom":2},"banner":{"x":0,"y":0,"zoom":1}}'),
    { foto: { x: 10, y: 20, zoom: 2 }, banner: { x: 0, y: 0, zoom: 1 } });
});

test('registro estragado no banco volta vazio, sem derrubar nada', () => {
  assert.deepEqual(ler('isso não é json'), {});
  assert.deepEqual(ler(null), {});
  assert.deepEqual(ler('[1,2,3]'), {});
  assert.deepEqual(ler('{"foto":"nada"}'), {});
});

test('guardar um papel não mexe no outro', () => {
  const so_foto = guardar(null, 'foto', { x: 10, y: 20, zoom: 2 });
  assert.deepEqual(ler(so_foto), { foto: { x: 10, y: 20, zoom: 2 } });

  const os_dois = guardar(so_foto, 'banner', { x: 80, y: 90, zoom: 1 });
  assert.deepEqual(ler(os_dois), { foto: { x: 10, y: 20, zoom: 2 }, banner: { x: 80, y: 90, zoom: 1 } });
});

test('voltar ao padrão apaga aquele papel, e o último apaga a coluna', () => {
  const os_dois = guardar(guardar(null, 'foto', { x: 10, y: 20, zoom: 2 }), 'banner', { x: 80, y: 90, zoom: 1 });
  const so_banner = guardar(os_dois, 'foto', PADRAO);
  assert.deepEqual(ler(so_banner), { banner: { x: 80, y: 90, zoom: 1 } });
  assert.equal(guardar(so_banner, 'banner', null), null);
});

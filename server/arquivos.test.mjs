import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tipoDaImagem, salvarImagem, nomeValido, LIMITES, ErroDeArquivo } from './arquivos.mjs';

const pasta = () => mkdtempSync(join(tmpdir(), 'img-'));
const comCabecalho = (bytes, tamanho = 64) =>
  Buffer.concat([Buffer.from(bytes), Buffer.alloc(Math.max(0, tamanho - bytes.length))]);

const PNG  = comCabecalho([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPG  = comCabecalho([0xff, 0xd8, 0xff, 0xe0]);
const GIF  = comCabecalho([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(52)]);

test('reconhece os quatro formatos aceitos', () => {
  assert.equal(tipoDaImagem(PNG), 'png');
  assert.equal(tipoDaImagem(JPG), 'jpg');
  assert.equal(tipoDaImagem(GIF), 'gif');
  assert.equal(tipoDaImagem(WEBP), 'webp');
});

test('GIF é aceito — banner animado depende disso', () => {
  const p = pasta();
  try { assert.match(salvarImagem(p, GIF, 'banner'), /\.gif$/); } finally { rmSync(p, { recursive: true }); }
});

test('recusa arquivo que não é imagem, mesmo com nome ou tipo convincente', () => {
  const p = pasta();
  try {
    // Um executável do macOS e um script: nenhum dos dois tem assinatura de imagem.
    for (const impostor of [comCabecalho([0xcf, 0xfa, 0xed, 0xfe]), Buffer.from('#!/bin/sh\nrm -rf /\n'.padEnd(64))]) {
      assert.throws(() => salvarImagem(p, impostor, 'foto'), /PNG, JPG, GIF ou WEBP/);
    }
  } finally { rmSync(p, { recursive: true }); }
});

test('recusa imagem grande demais', () => {
  const p = pasta();
  try {
    const gorda = Buffer.concat([PNG, Buffer.alloc(LIMITES.foto + 1)]);
    assert.throws(() => salvarImagem(p, gorda, 'foto'), (e) => e instanceof ErroDeArquivo && e.status === 413);
  } finally { rmSync(p, { recursive: true }); }
});

test('banner aceita maior que foto', () => {
  const p = pasta();
  try {
    const media = Buffer.concat([GIF, Buffer.alloc(LIMITES.foto + 1000)]);
    assert.throws(() => salvarImagem(p, media, 'foto'), /passa de/);
    assert.ok(salvarImagem(p, media, 'banner'), 'o mesmo arquivo devia caber como banner');
  } finally { rmSync(p, { recursive: true }); }
});

test('recusa vazio', () => {
  const p = pasta();
  try {
    assert.throws(() => salvarImagem(p, Buffer.alloc(0), 'foto'), /Nenhuma imagem/);
    assert.throws(() => salvarImagem(p, null, 'foto'), /Nenhuma imagem/);
  } finally { rmSync(p, { recursive: true }); }
});

test('a mesma imagem duas vezes ocupa um arquivo só', () => {
  const p = pasta();
  try {
    const a = salvarImagem(p, PNG, 'foto');
    const b = salvarImagem(p, PNG, 'foto');
    assert.equal(a, b);
    assert.equal(readdirSync(p).length, 1);
  } finally { rmSync(p, { recursive: true }); }
});

test('imagens diferentes geram nomes diferentes, e o conteúdo é preservado', () => {
  const p = pasta();
  try {
    const a = salvarImagem(p, PNG, 'foto');
    const b = salvarImagem(p, JPG, 'foto');
    assert.notEqual(a, b);
    assert.deepEqual(readFileSync(join(p, a)), PNG);
  } finally { rmSync(p, { recursive: true }); }
});

test('quem envia não escolhe o nome do arquivo', () => {
  const p = pasta();
  try {
    // O nome sai do hash do conteúdo, então não há campo onde enfiar "../".
    assert.match(salvarImagem(p, PNG, 'foto'), /^[0-9a-f]{32}\.png$/);
  } finally { rmSync(p, { recursive: true }); }
});

test('só nomes que nós geramos são servidos', () => {
  assert.ok(nomeValido('a'.repeat(32) + '.png'));
  for (const ruim of [
    '../../../etc/passwd', '..%2f..%2fetc%2fpasswd', '/etc/passwd',
    'a'.repeat(32) + '.exe', 'a'.repeat(31) + '.png', 'ZZZ' + 'a'.repeat(29) + '.png',
    '', null, undefined, 'a'.repeat(32) + '.png/../x',
  ]) {
    assert.equal(nomeValido(ruim), null, `aceitou ${JSON.stringify(ruim)}`);
  }
});

test('o tipo servido vem da extensão que nós escrevemos', () => {
  assert.equal(nomeValido('b'.repeat(32) + '.gif').tipo, 'image/gif');
  assert.equal(nomeValido('b'.repeat(32) + '.webp').tipo, 'image/webp');
});

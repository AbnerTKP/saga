import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tipoDaImagem, tipoDoAudio, salvarImagem, salvarSom, nomeValido, LIMITES, ErroDeArquivo , pastaDosArquivos } from './arquivos.mjs';

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

// --- som do soundboard ------------------------------------------------------

const MP3_ID3 = comCabecalho([0x49, 0x44, 0x33, 0x03]);
const MP3_CRU = comCabecalho([0xff, 0xfb, 0x90]);
const OGG     = comCabecalho([0x4f, 0x67, 0x67, 0x53]);
const FLAC    = comCabecalho([0x66, 0x4c, 0x61, 0x43]);
const WAV     = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(52)]);
const M4A     = Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.alloc(56)]);

test('reconhece os formatos de áudio aceitos', () => {
  assert.equal(tipoDoAudio(MP3_ID3), 'mp3');
  assert.equal(tipoDoAudio(MP3_CRU), 'mp3', 'MP3 sem tag ID3 começa direto no quadro');
  assert.equal(tipoDoAudio(OGG), 'ogg');
  assert.equal(tipoDoAudio(FLAC), 'flac');
  assert.equal(tipoDoAudio(WAV), 'wav');
  assert.equal(tipoDoAudio(M4A), 'm4a');
});

test('imagem não passa por som, nem som por imagem', () => {
  assert.equal(tipoDoAudio(PNG), null);
  assert.equal(tipoDaImagem(MP3_ID3), null);
  const p = pasta();
  try {
    assert.throws(() => salvarSom(p, PNG), /MP3, WAV, OGG/);
    assert.throws(() => salvarImagem(p, MP3_ID3, 'foto'), /PNG, JPG, GIF/);
  } finally { rmSync(p, { recursive: true }); }
});

test('som guardado vira hash com a extensão certa', () => {
  const p = pasta();
  try {
    assert.match(salvarSom(p, OGG), /^[0-9a-f]{32}\.ogg$/);
    assert.match(salvarSom(p, WAV), /^[0-9a-f]{32}\.wav$/);
  } finally { rmSync(p, { recursive: true }); }
});

test('som grande demais é recusado', () => {
  const p = pasta();
  try {
    const longo = Buffer.concat([MP3_ID3, Buffer.alloc(LIMITES.som + 1)]);
    assert.throws(() => salvarSom(p, longo), (e) => e instanceof ErroDeArquivo && e.status === 413);
  } finally { rmSync(p, { recursive: true }); }
});

test('o tipo servido cobre áudio também', () => {
  assert.equal(nomeValido('c'.repeat(32) + '.mp3').tipo, 'audio/mpeg');
  assert.equal(nomeValido('c'.repeat(32) + '.ogg').tipo, 'audio/ogg');
  assert.equal(nomeValido('c'.repeat(32) + '.exe'), null, 'extensão desconhecida não pode ser servida');
});

test('as imagens moram ao lado do banco — apontar um sem o outro não é possível', () => {
  assert.equal(pastaDosArquivos('/dados/cantinho.db'), '/dados/arquivos');
  assert.equal(pastaDosArquivos('./dados/cantinho.db'), 'dados/arquivos');
  assert.equal(pastaDosArquivos('/var/lib/cantinho/banco.sqlite'), '/var/lib/cantinho/arquivos');
});

test('o banco na pasta atual não joga as imagens para fora dela', () => {
  assert.equal(pastaDosArquivos('cantinho.db'), 'arquivos');
});

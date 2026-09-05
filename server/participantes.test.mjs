import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verParticipante, FONTE } from './participantes.mjs';

// Monta um participante como o LiveKit devolve, só com o que a função lê.
const pessoa = (nome, faixas) => ({ identity: `${nome}#a1b2`, name: nome, tracks: faixas });
const faixa = (source, muted = false) => ({ source, muted });

test('alguém só com microfone ligado não aparece nem mudo nem compartilhando', () => {
  const v = verParticipante(pessoa('Abner', [faixa(FONTE.MICROFONE)]));
  assert.equal(v.muted, false);
  assert.equal(v.screen, false);
  assert.equal(v.camera, false);
});

test('microfone não pode ser confundido com tela (o bug do print)', () => {
  // MICROPHONE=2 e SCREEN_SHARE=3. Lendo 2 como tela, todo mundo com microfone
  // aparecia compartilhando; lendo 3 como microfone, a lista vinha vazia e
  // [].every() marcava todo mundo como mudo.
  const v = verParticipante(pessoa('tkp', [faixa(FONTE.MICROFONE)]));
  assert.deepEqual({ screen: v.screen, muted: v.muted }, { screen: false, muted: false });
});

test('microfone mutado aparece como mudo', () => {
  const v = verParticipante(pessoa('Abner', [faixa(FONTE.MICROFONE, true)]));
  assert.equal(v.muted, true);
});

test('sem microfone publicado também conta como mudo', () => {
  assert.equal(verParticipante(pessoa('Abner', [])).muted, true);
});

test('câmera ligada acende o ícone de câmera, e só ele', () => {
  const v = verParticipante(pessoa('Abner', [faixa(FONTE.MICROFONE), faixa(FONTE.CAMERA)]));
  assert.equal(v.camera, true);
  assert.equal(v.screen, false);
});

test('câmera desligada não acende o ícone, mesmo com a faixa publicada', () => {
  // setCameraEnabled(false) muta a faixa em vez de despublicá-la.
  const v = verParticipante(pessoa('Abner', [faixa(FONTE.CAMERA, true)]));
  assert.equal(v.camera, false);
});

test('compartilhando tela acende o ícone de tela', () => {
  const v = verParticipante(pessoa('Abner', [faixa(FONTE.MICROFONE), faixa(FONTE.TELA)]));
  assert.equal(v.screen, true);
  assert.equal(v.camera, false);
});

test('tela com áudio do sistema continua sendo uma tela só', () => {
  const v = verParticipante(pessoa('Abner', [faixa(FONTE.TELA), faixa(FONTE.AUDIO_DA_TELA)]));
  assert.equal(v.screen, true);
});

test('câmera e tela ao mesmo tempo acendem os dois ícones', () => {
  const v = verParticipante(pessoa('Abner', [faixa(FONTE.MICROFONE), faixa(FONTE.CAMERA), faixa(FONTE.TELA)]));
  assert.deepEqual({ camera: v.camera, screen: v.screen, muted: v.muted }, { camera: true, screen: true, muted: false });
});

test('sem nome definido, cai para o identity', () => {
  assert.equal(verParticipante({ identity: 'anon#9z', name: '', tracks: [] }).name, 'anon#9z');
});

test('participante sem lista de faixas não quebra', () => {
  assert.equal(verParticipante({ identity: 'x#1', name: 'x' }).muted, true);
});

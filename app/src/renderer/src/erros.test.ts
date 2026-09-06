import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explicarFalhaDeAudio, explicarTelaMuda, pareceMixagemDoSistema } from './erros.ts';

test('o erro que o amigo teve vira instrução, não enigma', () => {
  // Foi este, palavra por palavra, o que apareceu no registro dele.
  const m = explicarFalhaDeAudio('Could not start audio source');
  assert.match(m, /dispositivo de saída padrão/);
  assert.match(m, /modo exclusivo/);
  assert.ok(!m.includes('Could not start audio source'), 'a mensagem crua não ajuda ninguém');
});

test('reconhece o erro venha como vier', () => {
  for (const cru of [
    'Could not start audio source',
    'NotReadableError: Could not start audio source',
    'could not start AUDIO source',
  ]) {
    assert.match(explicarFalhaDeAudio(cru), /saída padrão/, cru);
  }
});

test('falta de permissão tem explicação própria', () => {
  assert.match(explicarFalhaDeAudio('NotAllowedError: Permission denied'), /permissão/);
});

test('erro desconhecido não é maquiado: aparece como veio', () => {
  // Inventar explicação para o que não se conhece mandaria a pessoa ao lugar errado —
  // que era exatamente o defeito da mensagem antiga.
  const m = explicarFalhaDeAudio('alguma coisa nova que ninguém viu ainda');
  assert.match(m, /alguma coisa nova que ninguém viu ainda/);
});

test('reconhece a mixagem do sistema nos nomes que o Windows usa', () => {
  for (const nome of [
    'Mixagem estéreo (Realtek(R) Audio)',
    'Stereo Mix (Realtek High Definition Audio)',
    'Stereo Mix (2- USB Audio Device)',
    'What U Hear (Sound Blaster)',
    'Mezcla estéreo (Realtek)',
  ]) {
    assert.equal(pareceMixagemDoSistema(nome), true, nome);
  }
});

test('reconhece também os cabos virtuais', () => {
  // É a saída de quem não tem mixagem na placa: instala um cabo virtual e usa como saída.
  for (const nome of ['CABLE Output (VB-Audio Virtual Cable)', 'VoiceMeeter Output (VB-Audio VoiceMeeter VAIO)']) {
    assert.equal(pareceMixagemDoSistema(nome), true, nome);
  }
});

test('não confunde microfone comum com mixagem', () => {
  // Publicar o microfone como se fosse o áudio da transmissão seria pior que não ter
  // áudio: entregaria a voz da pessoa duplicada, e ela nem saberia.
  for (const nome of [
    'Microfone (Logitech PRO X Wireless Gaming Headset)',
    'Microfone (Realtek(R) Audio)',
    'Matriz de microfones (Intel Smart Sound)',
    'Webcam C920',
    '',
  ]) {
    assert.equal(pareceMixagemDoSistema(nome), false, nome);
  }
});

test('tela muda no Mac manda mexer na permissão, inclusive religar a chave', () => {
  const m = explicarTelaMuda('darwin');
  assert.match(m, /Gravação do Áudio do Sistema e da Tela/);
  assert.match(m, /desligue e ligue de novo/, 'é o caso de quem acabou de atualizar');
});

test('tela muda fora do Mac não fala do macOS', () => {
  const m = explicarTelaMuda('win32');
  assert.doesNotMatch(m, /macOS|Ajustes do Sistema/);
});

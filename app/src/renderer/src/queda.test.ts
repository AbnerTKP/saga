import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deveVoltarParaACall, MOTIVOS } from './queda.ts';

test('queda de internet volta sozinha', () => {
  assert.equal(deveVoltarParaACall(MOTIVOS.CONEXAO_FECHOU), true);
  assert.equal(deveVoltarParaACall(MOTIVOS.SERVIDOR_REINICIOU), true);
  assert.equal(deveVoltarParaACall(undefined), true, 'sem motivo, o caso comum é ter caído');
});

test('quem foi TIRADO da call não volta', () => {
  // O moderador desconecta e o app punha a pessoa de volta em segundos: a moderação
  // desfeita sozinha, parecendo defeito dos dois lados.
  assert.equal(deveVoltarParaACall(MOTIVOS.ME_TIRARAM), false);
});

test('quem desligou não é trazido de volta', () => {
  assert.equal(deveVoltarParaACall(MOTIVOS.EU_DESLIGUEI), false);
});

test('a mesma conta noutro lugar não briga com a janela de lá', () => {
  assert.equal(deveVoltarParaACall(MOTIVOS.ENTREI_NOUTRO_LUGAR), false);
});

test('sala que não existe mais não tem para onde voltar', () => {
  assert.equal(deveVoltarParaACall(MOTIVOS.SALA_APAGADA), false);
  assert.equal(deveVoltarParaACall(MOTIVOS.SALA_FECHADA), false);
});

test('entrar que já falhou não fica insistindo sozinho', () => {
  assert.equal(deveVoltarParaACall(MOTIVOS.NAO_CONSEGUI_ENTRAR), false);
  assert.equal(deveVoltarParaACall(MOTIVOS.PESSOA_RECUSOU), false);
});

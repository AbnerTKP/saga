import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comLimite } from './limite.ts';

const nunca = () => new Promise<never>(() => undefined);
const relogiosVivos = () => process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;

test('respondeu dentro do prazo: vale a resposta', async () => {
  assert.equal(await comLimite(Promise.resolve('ok'), 1000, 'sem resposta'), 'ok');
});

test('não respondeu no prazo: vira falha com o aviso', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pendente = comLimite(nunca(), 3000, 'sem resposta');
  t.mock.timers.tick(2999);
  let terminou = false;
  pendente.then(() => { terminou = true; }, () => { terminou = true; });
  await Promise.resolve();
  assert.equal(terminou, false, 'falhou antes do prazo');
  t.mock.timers.tick(1);
  await assert.rejects(pendente, { message: 'sem resposta' });
});

test('a falha da própria promessa passa como veio, e não como prazo', async () => {
  await assert.rejects(comLimite(Promise.reject(new Error('negado')), 1000, 'sem resposta'), { message: 'negado' });
});

test('terminada a promessa, o relógio do prazo não fica vivo', async () => {
  // Com relógio de verdade: é o que o Node ainda tem pendurado que diz se o clearTimeout rodou.
  const antes = relogiosVivos();
  await comLimite(Promise.resolve('ok'), 60_000, 'sem resposta');
  await comLimite(Promise.reject(new Error('negado')), 60_000, 'sem resposta').catch(() => undefined);
  assert.equal(relogiosVivos(), antes, 'sobrou relógio de prazo vivo');
});

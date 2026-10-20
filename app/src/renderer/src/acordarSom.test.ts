import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acordarContexto, precisaRetomar } from './acordarSom.ts';

/**
 * Um contexto de mentira. `retomar` diz o que o `resume` faz: volta a tocar, fica parado
 * (o "interrupted" que não sai) ou nunca responde (WebKit 281566). `relogioParado` é o
 * "running" sem tempo andando (WebKit 263627), que só sai suspendendo e retomando.
 */
function contexto(estado: string, { retomar = 'toca', relogioParado = false } = {}) {
  const ctx = {
    state: estado,
    currentTime: 10,
    relogioParado,
    chamadas: [] as string[],
    resume() {
      ctx.chamadas.push('resume');
      if (retomar === 'nunca') return new Promise<void>(() => {});
      if (retomar === 'toca') ctx.state = 'running';
      return Promise.resolve();
    },
    suspend() {
      ctx.chamadas.push('suspend');
      ctx.state = 'suspended';
      ctx.relogioParado = false;
      return Promise.resolve();
    },
  };
  const esperar = async (_ms: number) => {
    ctx.chamadas.push('esperar');
    if (ctx.state === 'running' && !ctx.relogioParado) ctx.currentTime += 0.25;
  };
  return { ctx, esperar };
}

test('o "interrupted" do iPhone também é retomado, e não só o "suspended"', async () => {
  assert.equal(precisaRetomar('interrupted'), true);
  assert.equal(precisaRetomar('suspended'), true);
  assert.equal(precisaRetomar('running'), false);
  assert.equal(precisaRetomar('closed'), false);

  const { ctx, esperar } = contexto('interrupted');
  assert.equal(await acordarContexto(ctx, esperar), true);
  assert.equal(ctx.state, 'running');
});

test('contexto tocando fica como está', async () => {
  const { ctx, esperar } = contexto('running');
  assert.equal(await acordarContexto(ctx, esperar), true);
  assert.deepEqual(ctx.chamadas, ['esperar']);
});

test('o retomar sai antes de qualquer espera: dentro de um toque, o iPhone só aceita no instante', async () => {
  const { ctx, esperar } = contexto('suspended');
  const acordando = acordarContexto(ctx, esperar);
  assert.deepEqual(ctx.chamadas, ['resume', 'esperar']);
  await acordando;
});

test('o que o navegador não deixa retomar pede o toque', async () => {
  const { ctx, esperar } = contexto('interrupted', { retomar: 'fica' });
  assert.equal(await acordarContexto(ctx, esperar), false);
});

test('um retomar que nunca responde não prende a volta', async () => {
  const { ctx, esperar } = contexto('interrupted', { retomar: 'nunca' });
  assert.equal(await acordarContexto(ctx, esperar), false);
});

test('"running" com o relógio parado volta suspendendo e retomando', async () => {
  const { ctx, esperar } = contexto('running', { relogioParado: true });
  assert.equal(await acordarContexto(ctx, esperar), true);
  assert.ok(ctx.chamadas.includes('suspend'));
  assert.equal(ctx.state, 'running');
});

test('"running" parado que não volta nem assim pede o toque', async () => {
  const { ctx, esperar } = contexto('running', { relogioParado: true, retomar: 'fica' });
  assert.equal(await acordarContexto(ctx, esperar), false);
});

test('contexto fechado não é acordado nem trava a volta', async () => {
  const { ctx, esperar } = contexto('closed');
  assert.equal(await acordarContexto(ctx, esperar), true);
  assert.deepEqual(ctx.chamadas, []);
});

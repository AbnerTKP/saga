import test from 'node:test';
import assert from 'node:assert/strict';
import { podeTocar, criarAvisos, INTERVALO, VOLUME_DO_AVISO, VOLUME_DO_CHAMADO, VOLUME_DA_ENTRADA, volumeDo, type Aviso } from './avisos.ts';

test('o primeiro aviso sempre toca', () => {
  assert.equal(podeTocar(1000, undefined, false), true);
});

test('ouvido desligado não toca nada', () => {
  assert.equal(podeTocar(1000, undefined, true), false);
  assert.equal(podeTocar(9999, 1000, true), false);
});

test('três pessoas entrando juntas não viram três sons', () => {
  assert.equal(podeTocar(1000, 1000, false), false);
  assert.equal(podeTocar(1000 + INTERVALO - 1, 1000, false), false);
});

test('passado o intervalo, o aviso volta a tocar', () => {
  assert.equal(podeTocar(1000 + INTERVALO, 1000, false), true);
  assert.equal(podeTocar(60_000, 1000, false), true);
});

/** Um arquivo por aviso, com o nome no lugar da URL: o teste só precisa distinguir. */
const ARQUIVOS: Record<Aviso, string> = {
  entrou: 'a', saiu: 'b', live: 'c', convite: 'd', mensagem: 'e', lance: 'f',
  fimDaPartida: 'g', liveEntrou: 'h', liveSaiu: 'i', micLigou: 'j', micMutou: 'k', plateia: 'l',
};

test('cada aviso tem o próprio relógio: "entrou" não cala "live"', () => {
  const tocados: string[] = [];
  const avisar = criarAvisos(ARQUIVOS, (url) => tocados.push(url));

  assert.equal(avisar('entrou', false, 1000), true);
  assert.equal(avisar('entrou', false, 1100), false, 'repetido rápido demais');
  assert.equal(avisar('live', false, 1100), true, 'som diferente não é afetado');
  assert.deepEqual(tocados, ['a', 'c']);
});

test('ouvido desligado não toca e nem marca o relógio', () => {
  const tocados: string[] = [];
  const avisar = criarAvisos(ARQUIVOS, (url) => tocados.push(url));

  assert.equal(avisar('entrou', true, 1000), false);
  assert.equal(avisar('entrou', false, 1010), true, 'religou o ouvido e o próximo toca');
  assert.deepEqual(tocados, ['a']);
});

test('som recusado não passa calado: a falha chega com o nome do som', async () => {
  const falhas: string[] = [];
  const avisar = criarAvisos(
    ARQUIVOS,
    () => Promise.reject(new Error('NotSupportedError')),
    (qual, erro) => falhas.push(`${qual}: ${(erro as Error).message}`),
  );
  assert.equal(avisar('micMutou', false, 1000), true);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(falhas, ['micMutou: NotSupportedError']);
});

test('tocar que lança na hora também não derruba quem avisou', () => {
  const falhas: string[] = [];
  const avisar = criarAvisos(ARQUIVOS, () => { throw new Error('sem Audio'); }, (qual) => falhas.push(qual));
  assert.doesNotThrow(() => avisar('live', false, 1000));
  assert.deepEqual(falhas, ['live']);
});

test('mensagem, convite e gente chegando na sua live chamam alto; o resto continua baixo', () => {
  assert.ok(VOLUME_DO_CHAMADO >= 2 * VOLUME_DO_AVISO, 'chamado tem de se ouvir por cima de um jogo');
  assert.ok(VOLUME_DO_CHAMADO <= 1, 'o Audio não toca acima de 1');
  assert.equal(volumeDo('mensagem'), VOLUME_DO_CHAMADO);
  assert.equal(volumeDo('convite'), VOLUME_DO_CHAMADO);
  // Quem transmite está dentro de um jogo: foi para ouvir por cima dele que o dono pediu.
  assert.equal(volumeDo('plateia'), VOLUME_DO_CHAMADO);
  // O lance toca a cada jogada do outro; sair e o microfone não são com você.
  for (const baixo of ['lance', 'saiu', 'micLigou', 'micMutou', 'liveEntrou'] as const) {
    assert.equal(volumeDo(baixo), VOLUME_DO_AVISO, baixo);
  }
});

test('entrar na call toca mais alto que os avisos e abaixo dos chamados', () => {
  // O dono pediu "mais alto" (26/10/2026); um chamado é o que é dirigido a você, e entrar não é.
  assert.equal(volumeDo('entrou'), VOLUME_DA_ENTRADA);
  assert.ok(VOLUME_DA_ENTRADA > VOLUME_DO_AVISO);
  assert.ok(VOLUME_DA_ENTRADA < VOLUME_DO_CHAMADO);
});

test('o volume que chega a quem toca é o do aviso', () => {
  const tocados: [string, number][] = [];
  const avisar = criarAvisos(ARQUIVOS, (url, volume) => tocados.push([url, volume]));
  avisar('mensagem', false, 1000);
  avisar('entrou', false, 1000);
  assert.deepEqual(tocados, [['e', VOLUME_DO_CHAMADO], ['a', VOLUME_DA_ENTRADA]]);
});

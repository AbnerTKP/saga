import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANIVERSARIANTES, DURACAO_DO_PARABENS, LIMITES, SUMIU, conferirBoneco, criarGaragens,
} from './garagem.mjs';

const PESSOAS = {
  1: { nome: 'TKP', apelido: 'TKP' },
  2: { nome: 'Tavão', apelido: 'Tava1' },
  3: { nome: 'Donis', apelido: 'donis' },
  4: { nome: 'Blankito', apelido: 'blankito' },
};
const ctx = (eu, { sid = 7, dono = false, pessoas = PESSOAS } = {}) => ({
  sid, eu, donoDaSaga: dono, pessoa: (id) => pessoas[id] ?? null,
});
const boneco = (x = 100, y = 120, extra = {}) => ({ eu: { x, y, alvo: null, dir: 'baixo', ...extra } });

function montar() {
  let agora = 1_000_000;
  const relogio = () => agora;
  return { g: criarGaragens({ relogio }), passar: (ms) => { agora += ms; }, agora: () => agora };
}

test('quem manda a posição aparece na garagem de todos, com o nome do servidor', () => {
  const { g } = montar();
  g.estar(ctx(1), boneco(50, 100));
  const v = g.estar(ctx(4), boneco(200, 150));
  assert.deepEqual(v.pessoas.map((p) => [p.id, p.nome, p.x, p.y]), [[1, 'TKP', 50, 100], [4, 'Blankito', 200, 150]]);
});

test('a garagem é de cada servidor', () => {
  const { g } = montar();
  g.estar(ctx(1, { sid: 7 }), boneco());
  const v = g.estar(ctx(4, { sid: 8 }), boneco());
  assert.deepEqual(v.pessoas.map((p) => p.id), [4]);
});

test('quem para de mandar sai da garagem; quem fecha a tela sai na hora', () => {
  const { g, passar } = montar();
  g.estar(ctx(1), boneco());
  g.estar(ctx(2), boneco());
  g.estar(ctx(3), boneco());
  g.sair(ctx(3));
  passar(SUMIU + 1);
  const v = g.estar(ctx(2), boneco());
  assert.deepEqual(v.pessoas.map((p) => p.id), [2]);
});

test('quem vai para trás da mesa é achado pela CONTA, sem diferenciar maiúscula', () => {
  const { g } = montar();
  for (const id of [1, 2, 3, 4]) g.estar(ctx(id), boneco());
  const v = g.estar(ctx(1), boneco());
  assert.deepEqual(Object.fromEntries(v.pessoas.map((p) => [p.nome, p.moto])), { TKP: null, Tavão: 'harley', Donis: 'sahara', Blankito: null });
  assert.deepEqual(ANIVERSARIANTES, { tava1: 'harley', donis: 'sahara' });
});

test('só o dono da Saga começa o parabéns, e só ele fica sabendo que pode', () => {
  const { g } = montar();
  assert.equal(g.estar(ctx(4), boneco()).podeCantar, false);
  assert.equal(g.estar(ctx(1, { dono: true }), boneco()).podeCantar, true);
  assert.throws(() => g.cantarParabens(ctx(4)), (e) => e.status === 403);
  assert.equal(g.estar(ctx(4), boneco()).parabens, null);
  const v = g.cantarParabens(ctx(1, { dono: true }));
  assert.deepEqual(v.parabens, { inicio: v.agora });
  // e quem estava lá vê a festa começar na volta seguinte
  assert.deepEqual(g.estar(ctx(4), boneco()).parabens, { inicio: v.agora });
});

test('apertar de novo no meio não recomeça; depois que acaba, pode outro', () => {
  const { g, passar } = montar();
  const primeiro = g.cantarParabens(ctx(1, { dono: true })).parabens.inicio;
  passar(5000);
  assert.equal(g.cantarParabens(ctx(1, { dono: true })).parabens.inicio, primeiro);
  passar(DURACAO_DO_PARABENS);
  assert.equal(g.estar(ctx(4), boneco()).parabens, null);
  assert.notEqual(g.cantarParabens(ctx(1, { dono: true })).parabens.inicio, primeiro);
});

test('quem saiu do servidor (ou foi banido) some da garagem', () => {
  const { g } = montar();
  g.estar(ctx(4), boneco());
  const semBlankito = { ...PESSOAS, 4: undefined };
  const v = g.estar(ctx(1, { pessoas: semBlankito }), boneco());
  assert.deepEqual(v.pessoas.map((p) => p.id), [1]);
});

test('o boneco é conferido: fora da sala volta para a borda, lixo vira o padrão, não-número é recusado', () => {
  assert.deepEqual(conferirBoneco({ x: -50, y: 999, alvo: { x: 1000, y: 0 }, dir: 'voando', cheio: 40, goles: -3, ultimo: 'fumar', quedas: 2.5 }), {
    x: LIMITES.x1, y: LIMITES.y2, alvo: { x: LIMITES.x2, y: LIMITES.y1 }, dir: 'baixo', cheio: 6, goles: 0, ultimo: null, quedas: 0,
  });
  assert.deepEqual(conferirBoneco({ x: 100, y: 100, dir: 'esq', cheio: 3, goles: 9, ultimo: 'comer', quedas: 1 }), {
    x: 100, y: 100, alvo: null, dir: 'esq', cheio: 3, goles: 9, ultimo: 'comer', quedas: 1,
  });
  for (const ruim of [null, 5, [], { x: '10', y: 10 }, { x: 10 }, { x: 10, y: Infinity }, { x: 10, y: 10, alvo: { x: 'a', y: 1 } }]) {
    assert.throws(() => conferirBoneco(ruim), (e) => e.status === 400, JSON.stringify(ruim));
  }
});

test('o menu sabe quem está na garagem, e quem sumiu já não conta', () => {
  const { g, passar } = montar();
  assert.deepEqual(g.quemEsta(7), []);
  g.estar(ctx(3), boneco());
  g.estar(ctx(1), boneco());
  assert.deepEqual(g.quemEsta(7), [1, 3]);
  passar(SUMIU + 1);
  assert.deepEqual(g.quemEsta(7), []);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DURACAO_DO_PARABENS, LIMITES, MAIOR_PONTUACAO, MAX_NOME_NO_TELAO, SUMIU, TAMANHO_DO_PLACAR,
  conferirAniversariantes, conferirBoneco, criarGaragens, temasDa,
} from './garagem.mjs';
import { abrirBanco } from './banco.mjs';

const PESSOAS = {
  1: { nome: 'TKP', apelido: 'TKP' },
  2: { nome: 'Tava1', apelido: 'Tava1' },
  3: { nome: 'juninho', apelido: 'juninho' },
  4: { nome: 'Blankito', apelido: 'blankito' },
};
const ctx = (eu, { sid = 7, dono = false, pessoas = PESSOAS } = {}) => ({
  sid, eu, donoDaSaga: dono, pessoa: (id) => pessoas[id] ?? null,
});
const DONO = ctx(1, { dono: true });
const boneco = (x = 100, y = 120, extra = {}) => ({ eu: { x, y, alvo: null, dir: 'baixo', ...extra } });
const FESTA = [{ id: 2, nome: 'Tavão', tema: 'moto' }, { id: 3, nome: 'Donis', tema: 'carro' }];

function montar(db = null) {
  let agora = 1_000_000;
  const relogio = () => agora;
  return { g: criarGaragens({ relogio, db }), passar: (ms) => { agora += ms; }, agora: () => agora };
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

test('o app de antes (com a porta) continua entrando: o papel que ele manda é ignorado', () => {
  const { g } = montar();
  const v = g.estar(ctx(2), boneco(100, 120, { papel: 'tavao' }));
  assert.equal('papel' in v.pessoas[0], false);
  assert.doesNotThrow(() => g.estar(ctx(4), boneco(100, 120, { papel: 'tavao' })), 'não existe mais "o Tavão já está na garagem"');
  assert.deepEqual(g.espiar(ctx(1)).pessoas.map((p) => p.id), [2, 4]);
});

test('só o dono da Saga prepara a festa; o tema vai para todos, a lista só para ele', () => {
  const { g } = montar();
  assert.throws(() => g.preparar(ctx(4), { aniversariantes: FESTA }), (e) => e.status === 403);
  const v = g.preparar(DONO, { aniversariantes: FESTA });
  assert.deepEqual(v.preparo, FESTA);
  assert.deepEqual(v.temas, ['moto', 'carro']);
  const doBlankito = g.estar(ctx(4), boneco());
  assert.deepEqual(doBlankito.temas, ['moto', 'carro'], 'a decoração é de todo mundo');
  assert.equal('preparo' in doBlankito, false, 'quem faz aniversário não sai daqui antes do canto');
  assert.equal(JSON.stringify(doBlankito).includes('Tavão'), false);
  // um só: a garagem inteira no tema dele; lista vazia desfaz
  assert.deepEqual(g.preparar(DONO, { aniversariantes: [{ id: 4, nome: 'Blank', tema: 'pc' }] }).temas, ['pc', 'pc']);
  assert.deepEqual(g.preparar(DONO, { aniversariantes: [] }).temas, ['moto', 'moto']);
});

test('a festa é conferida: gente deste servidor, sem repetir, nome que cabe e tema que existe', () => {
  const pessoa = (id) => PESSOAS[id] ?? null;
  assert.deepEqual(conferirAniversariantes([{ id: 2, nome: '  Tavão\u0007 ', tema: 'jogos' }], pessoa), [{ id: 2, nome: 'Tavão', tema: 'jogos' }]);
  const ruins = [
    null, 'Tavão', [{}], [{ id: 99, nome: 'X', tema: 'moto' }], [{ id: '2', nome: 'X', tema: 'moto' }],
    [{ id: 2, nome: 'A', tema: 'moto' }, { id: 2, nome: 'B', tema: 'moto' }],
    [{ id: 2, nome: '   ', tema: 'moto' }], [{ id: 2, nome: 'x'.repeat(MAX_NOME_NO_TELAO + 1), tema: 'moto' }],
    [{ id: 2, nome: 'X', tema: 'avião' }],
    [{ id: 2, nome: 'A', tema: 'moto' }, { id: 3, nome: 'B', tema: 'moto' }, { id: 4, nome: 'C', tema: 'moto' }],
  ];
  for (const lista of ruins) assert.throws(() => conferirAniversariantes(lista, pessoa), (e) => e.status === 400, JSON.stringify(lista));
  assert.deepEqual(temasDa([]), ['moto', 'moto']);
});

test('só o dono da Saga começa o parabéns, e os nomes só saem daqui na hora', () => {
  const { g } = montar();
  assert.equal(g.estar(ctx(4), boneco()).podeCantar, false);
  assert.equal(g.estar(DONO, boneco()).podeCantar, true);
  assert.throws(() => g.cantarParabens(ctx(4)), (e) => e.status === 403);
  // sem ninguém escolhido não há festa
  assert.throws(() => g.cantarParabens(DONO), (e) => e.status === 400);
  g.preparar(DONO, { aniversariantes: FESTA });
  assert.equal(g.estar(ctx(4), boneco()).parabens, null);
  const v = g.cantarParabens(DONO);
  assert.deepEqual(v.parabens, { inicio: v.agora, aniversariantes: FESTA });
  // e quem estava lá vê a festa começar na volta seguinte, com os nomes
  assert.deepEqual(g.estar(ctx(4), boneco()).parabens, { inicio: v.agora, aniversariantes: FESTA });
  // mexer no painel no meio da música não troca o nome que está no telão
  g.preparar(DONO, { aniversariantes: [{ id: 4, nome: 'Outro', tema: 'pc' }] });
  assert.deepEqual(g.estar(ctx(4), boneco()).parabens.aniversariantes, FESTA);
});

test('apertar de novo no meio não recomeça; depois que acaba, pode outro', () => {
  const { g, passar } = montar();
  g.preparar(DONO, { aniversariantes: FESTA });
  const primeiro = g.cantarParabens(DONO).parabens.inicio;
  passar(5000);
  assert.equal(g.cantarParabens(DONO).parabens.inicio, primeiro);
  passar(DURACAO_DO_PARABENS);
  assert.equal(g.estar(ctx(4), boneco()).parabens, null);
  assert.notEqual(g.cantarParabens(DONO).parabens.inicio, primeiro);
});

test('o placar da Navinha: só quem está na garagem, só número de verdade, só os cinco maiores', () => {
  const { g } = montar();
  assert.throws(() => g.recorde(ctx(2), { pontos: 500 }), (e) => e.status === 409, 'fora da garagem');
  g.estar(ctx(2), boneco());
  g.estar(ctx(3), boneco());
  for (const ruim of [0, -5, 1.5, '900', null, MAIOR_PONTUACAO + 1]) {
    assert.throws(() => g.recorde(ctx(2), { pontos: ruim }), (e) => e.status === 400, String(ruim));
  }
  for (const [quem, pontos] of [[2, 300], [3, 900], [2, 100], [3, 700], [2, 500], [3, 50]]) g.recorde(ctx(quem), { pontos });
  const { recordes } = g.recorde(ctx(2), { pontos: 600 });
  assert.equal(recordes.length, TAMANHO_DO_PLACAR);
  assert.deepEqual(recordes.map((r) => [r.nome, r.pontos]), [['juninho', 900], ['juninho', 700], ['Tava1', 600], ['Tava1', 500], ['Tava1', 300]]);
  assert.deepEqual(g.estar(ctx(4), boneco()).recordes, recordes, 'o placar vai na leitura de todo mundo');
});

test('a festa e o placar sobrevivem a reiniciar o servidor (estão no banco)', () => {
  const db = abrirBanco(':memory:');
  db.prepare("INSERT INTO servidores (nome, criado_em) VALUES ('Casa', 1)").run();
  db.prepare("INSERT INTO usuarios (apelido, apelido_chave, senha_hash, criado_em) VALUES ('Tava1', 'tava1', 'x', 1)").run();
  const sid = 1, tava = 1;
  const pessoas = { 1: { nome: 'Tavão' } };
  const antes = montar(db).g;
  antes.preparar(ctx(9, { sid, dono: true, pessoas }), { aniversariantes: [{ id: tava, nome: 'TAVÃO', tema: 'mecanica' }] });
  antes.estar(ctx(tava, { sid, pessoas }), boneco());
  antes.recorde(ctx(tava, { sid, pessoas }), { pontos: 1234 });
  const depois = montar(db).g;
  const v = depois.estar(ctx(9, { sid, dono: true, pessoas }), boneco());
  assert.deepEqual(v.temas, ['mecanica', 'mecanica']);
  assert.deepEqual(v.preparo, [{ id: tava, nome: 'TAVÃO', tema: 'mecanica' }]);
  assert.deepEqual(v.recordes, [{ nome: 'Tavão', pontos: 1234 }]);
});

test('quem saiu do servidor (ou foi banido) some da garagem', () => {
  const { g } = montar();
  g.estar(ctx(4), boneco());
  const semBlankito = { ...PESSOAS, 4: undefined };
  const v = g.estar(ctx(1, { pessoas: semBlankito }), boneco());
  assert.deepEqual(v.pessoas.map((p) => p.id), [1]);
});

test('o boneco é conferido: fora da sala volta para a borda, lixo vira o padrão, não-número é recusado', () => {
  assert.deepEqual(conferirBoneco({ x: -50, y: 999, alvo: { x: 1000, y: 0 }, papel: 'toString', dir: 'voando', cheio: 40, goles: -3, ultimo: 'fumar', quedas: 2.5, jogando: 7 }), {
    x: LIMITES.x1, y: LIMITES.y2, alvo: { x: LIMITES.x2, y: LIMITES.y1 }, dir: 'baixo', cheio: 6, goles: 0, ultimo: null, quedas: 0, jogando: null,
  });
  assert.deepEqual(conferirBoneco({ x: 100, y: 100, dir: 'esq', cheio: 3, goles: 9, ultimo: 'pizza', quedas: 1, jogando: 1 }), {
    x: 100, y: 100, alvo: null, dir: 'esq', cheio: 3, goles: 9, ultimo: 'pizza', quedas: 1, jogando: 1,
  });
  // o app de antes mandava "comer" e "beber"
  assert.equal(conferirBoneco({ x: 100, y: 100, ultimo: 'comer' }).ultimo, 'comer');
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

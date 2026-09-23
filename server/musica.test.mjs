import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarFilas, validarItem, MAXIMO_NA_FILA, FOLGA, VAZIA } from './musica.mjs';
import { ErroDeConta } from './contas.mjs';

const TKP = { id: 1, nome: 'TKP' }, GUSTAVO = { id: 2, nome: 'Gustavo' }, TAVA = { id: 3, nome: 'Tava1' };
const GERAL = 10, CHAT = 20;

const musica = (id = 'dQw4w9WgXcQ', duracao = 213) => ({ id, titulo: `música ${id}`, autor: 'alguém', duracao, origem: 'youtube' });

function montar() {
  let agora = 1_000_000, n = 0;
  const filas = criarFilas({ relogio: () => agora, sortearUid: () => `u${++n}` });
  return { filas, passar: (ms) => { agora += ms; }, agora: () => agora };
}

const recusa = (status, texto) => (e) => {
  assert.ok(e instanceof ErroDeConta, `veio outra coisa: ${e?.stack ?? e}`);
  assert.equal(e.status, status, e.message);
  if (texto) assert.match(e.message, texto);
  return true;
};

test('a capa sai do id, e não do que o app mandou', () => {
  const item = validarItem({ ...musica(), capa: 'http://malicioso.example/x.png' });
  assert.equal(item.capa, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
});

test('música sem fim ou comprida demais não entra', () => {
  assert.throws(() => validarItem(musica('dQw4w9WgXcQ', 0)), recusa(400, /Ao vivo/));
  assert.throws(() => validarItem(musica('dQw4w9WgXcQ', 4 * 3600)), recusa(400, /3 horas/));
  assert.throws(() => validarItem(musica('../../etc')), recusa(400));
});

test('a primeira música toca na hora, e quem pediu vira o anfitrião', () => {
  const { filas, agora } = montar();
  const r = filas.tocar(GERAL, musica(), { pediu: TKP, salaDoChat: CHAT });
  assert.equal(r.posicao, 0);
  const v = filas.ver(GERAL);
  assert.equal(v.tocando.uid, 'u1');
  assert.equal(v.anfitriao, TKP.id);
  assert.equal(v.comecouEm, agora());
  assert.equal(v.salaDoChat, CHAT);
});

test('a segunda entra na fila, e o anfitrião não muda', () => {
  const { filas } = montar();
  filas.tocar(GERAL, musica(), { pediu: TKP, salaDoChat: CHAT });
  const r = filas.tocar(GERAL, musica('kJQP7kiw5Fk'), { pediu: GUSTAVO, salaDoChat: CHAT });
  assert.equal(r.posicao, 1);
  assert.equal(filas.ver(GERAL).anfitriao, TKP.id);
  assert.equal(filas.ver(GERAL).fila.length, 1);
});

test('a fila tem teto', () => {
  const { filas } = montar();
  for (let i = 0; i < MAXIMO_NA_FILA; i++) filas.tocar(GERAL, musica(), { pediu: TKP, salaDoChat: CHAT });
  assert.throws(() => filas.tocar(GERAL, musica(), { pediu: TKP, salaDoChat: CHAT }), recusa(409));
});

test('pular passa à próxima e recomeça a hora; na última, a fila some', () => {
  const { filas, passar, agora } = montar();
  filas.tocar(GERAL, musica(), { pediu: TKP, salaDoChat: CHAT });
  filas.tocar(GERAL, musica('kJQP7kiw5Fk'), { pediu: GUSTAVO, salaDoChat: CHAT });
  passar(30_000);
  const r = filas.pular(GERAL);
  assert.equal(r.pulou.uid, 'u1');
  assert.equal(r.agora.uid, 'u2');
  assert.equal(filas.ver(GERAL).comecouEm, agora());
  assert.equal(filas.pular(GERAL).agora, null);
  assert.equal(filas.ver(GERAL), null);
  assert.throws(() => filas.pular(GERAL), recusa(409, /Não tem nada/));
});

test('o aviso atrasado de uma música já pulada não pula a seguinte', () => {
  const { filas } = montar();
  filas.tocar(GERAL, musica(), { pediu: TKP, salaDoChat: CHAT });
  filas.tocar(GERAL, musica('kJQP7kiw5Fk'), { pediu: GUSTAVO, salaDoChat: CHAT });
  filas.pular(GERAL);
  const r = filas.acabou(GERAL, 'u1', TKP.id);
  assert.equal(r.andou, false);
  assert.equal(filas.ver(GERAL).tocando.uid, 'u2');
});

test('só o anfitrião avisa que acabou', () => {
  const { filas } = montar();
  filas.tocar(GERAL, musica(), { pediu: TKP, salaDoChat: CHAT });
  assert.throws(() => filas.acabou(GERAL, 'u1', GUSTAVO.id), recusa(403));
  assert.equal(filas.acabou(GERAL, 'u1', TKP.id).andou, true);
  assert.equal(filas.ver(GERAL), null);
});

test('o anfitrião saiu da call: passa a quem ficou, e a música não recomeça', () => {
  const { filas, passar } = montar();
  filas.tocar(GERAL, musica(), { pediu: TKP, salaDoChat: CHAT });
  const comecou = filas.ver(GERAL).comecouEm;
  passar(60_000);
  assert.equal(filas.conferir(GERAL, [GUSTAVO.id, TAVA.id]), null);
  assert.equal(filas.ver(GERAL).anfitriao, GUSTAVO.id);
  assert.equal(filas.ver(GERAL).comecouEm, comecou, 'o novo anfitrião continua de onde estava');
});

test('sala vazia perde a fila — mas só depois de ficar vazia de verdade', () => {
  const { filas, passar } = montar();
  filas.tocar(GERAL, musica(), { pediu: TKP, salaDoChat: CHAT });
  // O LiveKit que não respondeu devolve a lista vazia, sem erro: um soluço não apaga a fila.
  filas.conferir(GERAL, []);
  passar(VAZIA - 1);
  filas.conferir(GERAL, [TKP.id]);
  passar(VAZIA);
  filas.conferir(GERAL, []);
  assert.ok(filas.ver(GERAL), 'voltou gente: a contagem do vazio recomeça');
  passar(VAZIA);
  filas.conferir(GERAL, []);
  assert.equal(filas.ver(GERAL), null);
});

test('ninguém avisou que acabou: passada a hora e a folga, a fila anda sozinha', () => {
  const { filas, passar } = montar();
  filas.tocar(GERAL, musica('dQw4w9WgXcQ', 200), { pediu: TKP, salaDoChat: CHAT });
  filas.tocar(GERAL, musica('kJQP7kiw5Fk'), { pediu: GUSTAVO, salaDoChat: CHAT });
  passar(200_000 + FOLGA - 1);
  assert.equal(filas.conferir(GERAL, [TKP.id]), null, 'dentro da folga ainda espera o aviso');
  passar(2);
  assert.equal(filas.conferir(GERAL, [TKP.id]).uid, 'u2');
});

test('cada sala de voz tem a sua fila', () => {
  const { filas } = montar();
  filas.tocar(GERAL, musica(), { pediu: TKP, salaDoChat: CHAT });
  assert.equal(filas.ver(GERAL + 1), null);
  assert.throws(() => filas.parar(GERAL + 1), recusa(409));
  filas.parar(GERAL);
  assert.equal(filas.ver(GERAL), null);
});

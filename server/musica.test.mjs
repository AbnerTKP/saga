import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarFilas, validarItem, MAXIMO_NA_FILA, MAXIMO_POR_PLAYLIST, FOLGA, VAZIA, AUSENTE } from './musica.mjs';
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
  assert.throws(() => validarItem(musica('dQw4w9WgXcQ', 2 * 3600 + 1)), recusa(400, /2 horas/));
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
  assert.equal(filas.ver(GERAL).anfitriao, TKP.id, 'sumiu agora: ainda pode ser a internet piscando');
  passar(AUSENTE);
  filas.conferir(GERAL, [GUSTAVO.id, TAVA.id]);
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

test('a vez não passa a quem não consegue tocar', () => {
  const { filas, passar } = montar();
  filas.tocar(GERAL, musica(), { pediu: TKP, salaDoChat: CHAT });
  // O Gustavo está no celular; o Tava, na Saga do computador.
  filas.conferir(GERAL, [GUSTAVO.id, TAVA.id], [TAVA.id]);
  passar(AUSENTE);
  filas.conferir(GERAL, [GUSTAVO.id, TAVA.id], [TAVA.id]);
  assert.equal(filas.ver(GERAL).anfitriao, TAVA.id);
});

test('sem ninguém capaz de tocar, a vez espera e a fila não some', () => {
  const { filas, passar } = montar();
  filas.tocar(GERAL, musica(), { pediu: TKP, salaDoChat: CHAT });
  filas.conferir(GERAL, [GUSTAVO.id], []);
  passar(Math.max(AUSENTE, VAZIA));
  filas.conferir(GERAL, [GUSTAVO.id], []);
  assert.equal(filas.ver(GERAL).anfitriao, TKP.id, 'ninguém ali toca: a vez fica onde está');
  // A ausência já venceu: quem chega com um app capaz assume na hora.
  filas.conferir(GERAL, [GUSTAVO.id, TAVA.id], [TAVA.id]);
  assert.equal(filas.ver(GERAL).anfitriao, TAVA.id);
});

test('o anfitrião que trocou o computador pelo celular perde a vez', () => {
  const { filas, passar } = montar();
  filas.tocar(GERAL, musica(), { pediu: TKP, salaDoChat: CHAT });
  // A mesma conta segue na call, mas o app que está nela já não toca.
  filas.conferir(GERAL, [TKP.id, GUSTAVO.id], [GUSTAVO.id]);
  passar(AUSENTE);
  filas.conferir(GERAL, [TKP.id, GUSTAVO.id], [GUSTAVO.id]);
  assert.equal(filas.ver(GERAL).anfitriao, GUSTAVO.id);
});

test('o anfitrião que caiu e voltou dentro do prazo continua tocando', () => {
  const { filas, passar } = montar();
  filas.tocar(GERAL, musica(), { pediu: TKP, salaDoChat: CHAT });
  filas.conferir(GERAL, [GUSTAVO.id]);
  passar(AUSENTE - 1);
  filas.conferir(GERAL, [TKP.id, GUSTAVO.id]);
  passar(AUSENTE);
  filas.conferir(GERAL, [GUSTAVO.id]);
  assert.equal(filas.ver(GERAL).anfitriao, TKP.id, 'a contagem da ausência recomeça quando ele volta');
});

test('o relógio da música é o do som: o aviso de começo corrige a espera do download', () => {
  const { filas, passar, agora } = montar();
  filas.tocar(GERAL, musica('dQw4w9WgXcQ', 200), { pediu: TKP, salaDoChat: CHAT });
  passar(20_000);   // o download levou 20 s
  assert.equal(filas.comecou(GERAL, 'u1', TKP.id, 0), true);
  assert.equal(filas.ver(GERAL).comecouEm, agora());
  passar(200_000 + FOLGA - 1);
  assert.equal(filas.conferir(GERAL, [TKP.id]), null, 'a música ainda está tocando');
});

/** `n` músicas de ids diferentes, de 11 letras. */
const varias = (n, comeco = 0) => Array.from({ length: n }, (_, i) => musica(`video${String(comeco + i).padStart(6, '0')}`));
const lista = (musicas, extra = {}) => ({ nome: 'Rock', total: musicas.length, quantas: musicas.length, duracao: 500, origem: 'youtube', musicas, ...extra });
const PARA_TKP = { pediu: TKP, salaDoChat: CHAT };

test('a playlist numa fila vazia já começa a tocar, numerada', () => {
  const { filas } = montar();
  const p = filas.tocarPlaylist(GERAL, lista(varias(3)), PARA_TKP);
  assert.equal(p.posicao, 0);
  assert.equal(p.quantas, 3);
  assert.equal(p.primeira.lote.n, 1);
  assert.equal(p.primeira.lote.id, p.id);
  const v = filas.ver(GERAL);
  assert.equal(v.anfitriao, TKP.id);
  assert.equal(v.tocando.uid, p.primeira.uid);
  assert.deepEqual(v.fila.map((i) => i.lote.n), [2, 3]);
});

test('a playlist entra atrás do que já está na fila, e o pedido do amigo vai para o fim', () => {
  const { filas } = montar();
  filas.tocar(GERAL, musica(), { pediu: GUSTAVO, salaDoChat: CHAT });
  const p = filas.tocarPlaylist(GERAL, lista(varias(2)), PARA_TKP);
  assert.equal(p.posicao, 1);
  assert.equal(filas.ver(GERAL).anfitriao, GUSTAVO.id, 'o anfitrião não muda');
  const pedido = filas.tocar(GERAL, musica('kJQP7kiw5Fk'), { pediu: TAVA, salaDoChat: CHAT });
  assert.equal(pedido.posicao, 3, 'decisão do dono: na ordem de chegada');
});

test('a playlist tem teto, e o total continua dizendo o tamanho dela', () => {
  const { filas } = montar();
  const p = filas.tocarPlaylist(GERAL, lista(varias(MAXIMO_POR_PLAYLIST + 10), { total: 125 }), PARA_TKP);
  assert.equal(p.quantas, MAXIMO_POR_PLAYLIST);
  assert.equal(p.total, 125);
  assert.equal(filas.ver(GERAL).fila.length, MAXIMO_POR_PLAYLIST - 1);
});

test('uma playlist cheia ainda deixa lugar para os pedidos dos amigos', () => {
  const { filas } = montar();
  filas.tocarPlaylist(GERAL, lista(varias(MAXIMO_POR_PLAYLIST)), PARA_TKP);
  assert.equal(filas.tocar(GERAL, musica(), { pediu: GUSTAVO, salaDoChat: CHAT }).posicao, MAXIMO_POR_PLAYLIST);
});

test('com a fila quase cheia só entra o que cabe; cheia, a playlist é recusada', () => {
  const { filas } = montar();
  for (let i = 0; i < MAXIMO_NA_FILA - 3; i++) filas.tocar(GERAL, musica(), { pediu: GUSTAVO, salaDoChat: CHAT });
  const p = filas.tocarPlaylist(GERAL, lista(varias(10), { duracao: 2130 }), PARA_TKP);
  assert.equal(p.quantas, 3);
  assert.equal(p.total, 10);
  assert.equal(p.duracao, 3 * 213, 'a soma é só do que entrou');
  assert.equal(filas.ver(GERAL).fila.length, MAXIMO_NA_FILA - 1);
  assert.throws(() => filas.tocarPlaylist(GERAL, lista(varias(1)), PARA_TKP), recusa(409, /já tem/));
});

test('música ruim da playlist fica de fora sem derrubar as outras; sem nenhuma boa, recusa', () => {
  const { filas } = montar();
  const p = filas.tocarPlaylist(GERAL, lista([musica('../../etc'), musica(), musica('kJQP7kiw5Fk', 0)], { quantas: 3 }), PARA_TKP);
  assert.equal(filas.ver(GERAL).tocando.id, 'dQw4w9WgXcQ');
  assert.equal(filas.ver(GERAL).fila.length, 0);
  assert.equal(p.primeira.id, 'dQw4w9WgXcQ');
  assert.throws(() => filas.tocarPlaylist(GERAL + 1, lista([musica('curto')]), PARA_TKP), recusa(400, /Nenhuma música/));
  assert.throws(() => filas.tocarPlaylist(GERAL + 1, { nome: 'x', musicas: 'não é lista' }, PARA_TKP), recusa(400));
  assert.equal(filas.ver(GERAL + 1), null, 'a recusa não deixa sala vazia para trás');
});

test('o nome da playlist é limpo, e a capa continua saindo do id', () => {
  const { filas } = montar();
  const p = filas.tocarPlaylist(GERAL, lista([{ ...musica(), capa: 'http://malicioso.example/x.png' }], { nome: `  ${'x'.repeat(300)} ` }), PARA_TKP);
  assert.equal(p.nome.length, 120);
  assert.equal(p.primeira.capa, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  assert.equal(filas.tocarPlaylist(GERAL + 1, lista([musica()], { nome: '   ' }), PARA_TKP).nome, 'Playlist');
});

test('do Spotify: a primeira toca, e as outras vão chegando sem passar do combinado', () => {
  const { filas } = montar();
  const p = filas.tocarPlaylist(GERAL, lista(varias(1), { quantas: 4, total: 4, origem: 'spotify' }), PARA_TKP);
  assert.equal(p.quantas, 4);
  assert.equal(p.origem, 'spotify');
  assert.deepEqual(filas.acrescentar(GERAL, p.id, varias(2, 1), TKP.id), { ativa: true, entraram: 2 });
  assert.deepEqual(filas.acrescentar(GERAL, p.id, varias(5, 3), TKP.id), { ativa: false, entraram: 1 });
  assert.deepEqual(filas.ver(GERAL).fila.map((i) => i.lote.n), [2, 3, 4]);
});

test('o /parar no meio da busca do Spotify não deixa a música voltar sozinha', () => {
  const { filas } = montar();
  const p = filas.tocarPlaylist(GERAL, lista(varias(1), { quantas: 5 }), PARA_TKP);
  filas.parar(GERAL);
  assert.deepEqual(filas.acrescentar(GERAL, p.id, varias(2, 1), TKP.id), { ativa: false, entraram: 0 });
  assert.equal(filas.ver(GERAL), null);
});

test('só quem pediu a playlist acrescenta nela', () => {
  const { filas } = montar();
  const p = filas.tocarPlaylist(GERAL, lista(varias(1), { quantas: 5 }), PARA_TKP);
  assert.throws(() => filas.acrescentar(GERAL, p.id, varias(1, 1), GUSTAVO.id), recusa(403));
});

test('tirar a playlist: só as dela saem, e quem pediu outra música não perde a sua', () => {
  const { filas, passar, agora } = montar();
  const antes = filas.tocar(GERAL, musica(), { pediu: GUSTAVO, salaDoChat: CHAT }).item;
  const p = filas.tocarPlaylist(GERAL, lista(varias(3)), PARA_TKP);
  const depois = filas.tocar(GERAL, musica('kJQP7kiw5Fk'), { pediu: TAVA, salaDoChat: CHAT }).item;
  const comecou = agora();
  passar(5000);
  const r = filas.tirarPlaylist(GERAL, p.id);
  assert.deepEqual(r, { nome: 'Rock', tirou: 3, tocava: false, agora: null });
  const v = filas.ver(GERAL);
  assert.equal(v.tocando.uid, antes.uid);
  assert.deepEqual(v.fila.map((i) => i.uid), [depois.uid]);
  assert.equal(v.comecouEm, comecou, 'a música de agora não recomeça');
});

test('tirar a playlist que está tocando passa à seguinte; se não houver, a fila acaba', () => {
  const { filas, passar, agora } = montar();
  const p = filas.tocarPlaylist(GERAL, lista(varias(2)), PARA_TKP);
  const depois = filas.tocar(GERAL, musica('kJQP7kiw5Fk'), { pediu: GUSTAVO, salaDoChat: CHAT }).item;
  passar(5000);
  const r = filas.tirarPlaylist(GERAL, p.id);
  assert.equal(r.tocava, true);
  assert.equal(r.agora.uid, depois.uid);
  assert.equal(filas.ver(GERAL).comecouEm, agora());
  const so = filas.tocarPlaylist(GERAL + 1, lista(varias(2)), PARA_TKP);
  assert.equal(filas.tirarPlaylist(GERAL + 1, so.id).agora, null);
  assert.equal(filas.ver(GERAL + 1), null);
});

test('sem dizer qual, tira a que toca ou a primeira da fila; tirada, a busca para', () => {
  const { filas } = montar();
  filas.tocar(GERAL, musica(), { pediu: GUSTAVO, salaDoChat: CHAT });
  const p = filas.tocarPlaylist(GERAL, lista(varias(1), { quantas: 5 }), PARA_TKP);
  assert.equal(filas.tirarPlaylist(GERAL, '').tirou, 1);
  assert.deepEqual(filas.acrescentar(GERAL, p.id, varias(1, 1), TKP.id), { ativa: false, entraram: 0 });
  assert.throws(() => filas.tirarPlaylist(GERAL, p.id), recusa(409, /não está mais/));
  assert.throws(() => filas.tirarPlaylist(GERAL, ''), recusa(409, /não está mais/));
  assert.throws(() => filas.tirarPlaylist(GERAL + 1, ''), recusa(409, /Não tem nada/));
});

test('a playlist que já tocou inteira não dá para tirar', () => {
  const { filas } = montar();
  const p = filas.tocarPlaylist(GERAL, lista(varias(1)), PARA_TKP);
  filas.tocar(GERAL, musica('kJQP7kiw5Fk'), { pediu: GUSTAVO, salaDoChat: CHAT });
  filas.pular(GERAL);
  assert.throws(() => filas.tirarPlaylist(GERAL, p.id), recusa(409, /não está mais/));
});

test('a fila inteira cheia cabe no corpo e na busca de salas', () => {
  const { filas } = montar();
  filas.tocarPlaylist(GERAL, lista(varias(MAXIMO_POR_PLAYLIST).map((m) => ({ ...m, titulo: 'x'.repeat(80), autor: 'y'.repeat(30) }))), PARA_TKP);
  for (let i = 0; i < MAXIMO_NA_FILA - MAXIMO_POR_PLAYLIST; i++) filas.tocar(GERAL, { ...musica(), titulo: 'x'.repeat(80), autor: 'y'.repeat(30) }, { pediu: GUSTAVO, salaDoChat: CHAT });
  const tamanho = JSON.stringify(filas.ver(GERAL)).length;
  assert.ok(tamanho < 40_000, `a fila cheia tem ${tamanho} bytes, e vai a cada pessoa de 4 em 4 s`);
});

test('só o anfitrião avisa que começou, e só da música que toca; o ponto entra na conta', () => {
  const { filas, agora } = montar();
  filas.tocar(GERAL, musica(), { pediu: TKP, salaDoChat: CHAT });
  assert.equal(filas.comecou(GERAL, 'u1', GUSTAVO.id, 0), false);
  assert.equal(filas.comecou(GERAL, 'outra', TKP.id, 0), false);
  assert.equal(filas.comecou(GERAL, 'u1', TKP.id, 42), true);
  assert.equal(filas.ver(GERAL).comecouEm, agora() - 42_000, 'quem assumiu no meio continua do ponto');
  filas.comecou(GERAL, 'u1', TKP.id, 99999);
  assert.equal(filas.ver(GERAL).comecouEm, agora() - 213_000, 'o ponto não passa do fim');
});

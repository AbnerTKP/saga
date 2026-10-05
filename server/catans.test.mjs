import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarMesasDoCatan, ABANDONO, ESQUECIDA, PLATEIA, TEMPO_PADRAO } from './catans.mjs';
import { ErroDeConta } from './contas.mjs';

const TKP = 1, TAVA = 2, GUSTAVO = 3, JUNINHO = 4, BLANKITO = 5;
const NOMES = { [TKP]: 'TKP', [TAVA]: 'Tava1', [GUSTAVO]: 'Gustavo', [JUNINHO]: 'Juninho', [BLANKITO]: 'Blankito' };

/** Um servidor de mentira, com o relógio na mão do teste e um sorteio com semente. */
function montar() {
  let agora = 1_000_000;
  let a = 12345;
  const sorteio = () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; };
  const mesas = criarMesasDoCatan({ relogio: () => agora, sorteio });
  const como = (eu, sid = 1) => ({
    sid, eu,
    pessoa: (id) => ({ id, nome: NOMES[id] ?? `conta ${id}`, foto: null, idExibido: null }),
    membroAtivo: (id) => id in NOMES,
  });
  return { mesas, como, passar: (ms) => { agora += ms; } };
}
const recusa = (status, texto) => (e) => {
  assert.ok(e instanceof ErroDeConta, `veio outra coisa: ${e?.stack ?? e}`);
  assert.equal(e.status, status, e.message);
  if (texto) assert.match(e.message, texto);
  return true;
};

/** Abre, chama e senta quem for dado. Devolve o id da mesa. */
function sentados(t, anfitriao, ...outros) {
  const { id } = t.mesas.abrir(t.como(anfitriao));
  for (const o of outros) {
    t.mesas.agir(t.como(anfitriao), { id, acao: 'chamar', alvo: o });
    t.mesas.agir(t.como(o), { id, acao: 'aceitar' });
  }
  return id;
}
const vez = (t, id, quem) => {
  const m = t.mesas.ver(t.como(quem), id);
  return m.jogadores[m.partida.vez].id;
};

test('abrir, chamar três, aceitar e começar: a ordem é sorteada e cada um vê a sua posição', () => {
  const t = montar();
  const id = sentados(t, TKP, TAVA, GUSTAVO);
  const { mesa } = t.mesas.agir(t.como(TKP), { id, acao: 'comecar' });
  assert.equal(mesa.estado, 'jogando');
  assert.equal(mesa.jogadores.length, 3);
  assert.deepEqual(new Set(mesa.jogadores.map((p) => p.id)), new Set([TKP, TAVA, GUSTAVO]));
  const posDoTava = mesa.jogadores.findIndex((p) => p.id === TAVA);
  assert.equal(t.mesas.ver(t.como(TAVA), id).partida.eu, posDoTava);
  assert.equal(t.mesas.ver(t.como(JUNINHO), id).partida.eu, null);
  assert.equal(t.mesas.ver(t.como(JUNINHO), id).eu, 'plateia');
});

test('a mesa é de até quatro, contando os convites que esperam resposta', () => {
  const t = montar();
  const id = sentados(t, TKP, TAVA, GUSTAVO);
  t.mesas.agir(t.como(TKP), { id, acao: 'chamar', alvo: JUNINHO });
  assert.throws(() => t.mesas.agir(t.como(TKP), { id, acao: 'chamar', alvo: BLANKITO }), recusa(409, /até 4/));
  t.mesas.agir(t.como(TKP), { id, acao: 'cancelarConvite', alvo: JUNINHO });
  assert.throws(() => t.mesas.agir(t.como(JUNINHO), { id, acao: 'aceitar' }), recusa(409, /não vale/));
  t.mesas.agir(t.como(TKP), { id, acao: 'chamar', alvo: BLANKITO });
});

test('começar pede pelo menos dois, e só quem abriu começa', () => {
  const t = montar();
  const { id } = t.mesas.abrir(t.como(TKP));
  assert.throws(() => t.mesas.agir(t.como(TKP), { id, acao: 'comecar' }), recusa(409, /mais uma/));
  t.mesas.agir(t.como(TKP), { id, acao: 'chamar', alvo: TAVA });
  t.mesas.agir(t.como(TAVA), { id, acao: 'aceitar' });
  assert.throws(() => t.mesas.agir(t.como(TAVA), { id, acao: 'comecar' }), recusa(403));
  t.mesas.agir(t.como(TKP), { id, acao: 'comecar' });
});

test('o convite chega pela busca de salas, com quem já sentou, e some para quem está jogando', () => {
  const t = montar();
  const id = sentados(t, TKP, TAVA);
  t.mesas.agir(t.como(TKP), { id, acao: 'chamar', alvo: GUSTAVO });
  const r = t.mesas.resumo(t.como(GUSTAVO));
  assert.equal(r.convites.length, 1);
  assert.deepEqual(r.convites[0].sentados.map((p) => p.nome), ['TKP', 'Tava1']);
  assert.equal(r.convites[0].de.nome, 'TKP');

  const outra = sentados(t, JUNINHO, GUSTAVO);
  t.mesas.agir(t.como(JUNINHO), { id: outra, acao: 'comecar' });
  assert.deepEqual(t.mesas.resumo(t.como(GUSTAVO)).convites, []);
  assert.throws(() => t.mesas.agir(t.como(GUSTAVO), { id, acao: 'aceitar' }), recusa(409, /noutra partida/));
});

test('sentar numa mesa tira você das outras que esperavam', () => {
  const t = montar();
  const a = sentados(t, TKP, TAVA);
  const b = t.mesas.abrir(t.como(GUSTAVO)).id;
  t.mesas.agir(t.como(GUSTAVO), { id: b, acao: 'chamar', alvo: TAVA });
  t.mesas.agir(t.como(TAVA), { id: b, acao: 'aceitar' });
  assert.deepEqual(t.mesas.ver(t.como(TKP), a).lugares.map((p) => p.id), [TKP]);
  // Quem abriu uma mesa e aceita outra perde a sua.
  t.mesas.agir(t.como(GUSTAVO), { id: b, acao: 'chamar', alvo: TKP });
  t.mesas.agir(t.como(TKP), { id: b, acao: 'aceitar' });
  assert.throws(() => t.mesas.ver(t.como(TKP), a), recusa(404));
});

test('a partida anda pela mesa: só quem tem a vez joga, e o erro da regra vira 409 com o motivo', () => {
  const t = montar();
  const id = sentados(t, TKP, TAVA);
  t.mesas.agir(t.como(TKP), { id, acao: 'comecar' });
  const quem = vez(t, id, TKP);
  const outro = quem === TKP ? TAVA : TKP;
  const m = t.mesas.ver(t.como(quem), id);
  assert.throws(() => t.mesas.agir(t.como(outro), { id, acao: 'jogar', jogada: { tipo: 'aldeia', v: m.partida.pode.aldeias[0] } }), recusa(409, /vez/));
  assert.throws(() => t.mesas.agir(t.como(JUNINHO), { id, acao: 'jogar', jogada: { tipo: 'rolar' } }), recusa(403));
  const { mesa } = t.mesas.agir(t.como(quem), { id, acao: 'jogar', jogada: { tipo: 'aldeia', v: m.partida.pode.aldeias[0] } });
  assert.equal(mesa.partida.construcoes.length, 1);
  assert.ok(mesa.partida.pode.estradas.length > 0);
});

test('desistir a dois acaba a partida, e o outro vence', () => {
  const t = montar();
  const id = sentados(t, TKP, TAVA);
  t.mesas.agir(t.como(TKP), { id, acao: 'comecar' });
  const { mesa } = t.mesas.agir(t.como(TKP), { id, acao: 'desistir' });
  assert.equal(mesa.estado, 'fim');
  assert.equal(mesa.jogadores[mesa.partida.vencedor].id, TAVA);
  assert.deepEqual(t.mesas.resumo(t.como(TAVA)).mesas[0].jogadores, [TAVA]);
});

test('jogar de novo volta a mesa a esperar com quem ficou; fechar depois do fim é de quem jogou', () => {
  const t = montar();
  const id = sentados(t, TKP, TAVA, GUSTAVO);
  t.mesas.agir(t.como(TKP), { id, acao: 'comecar' });
  t.mesas.agir(t.como(GUSTAVO), { id, acao: 'desistir' });
  t.mesas.agir(t.como(TAVA), { id, acao: 'desistir' });
  assert.throws(() => t.mesas.agir(t.como(JUNINHO), { id, acao: 'fechar' }), recusa(403));
  const { mesa } = t.mesas.agir(t.como(TAVA), { id, acao: 'jogarDeNovo' });
  assert.equal(mesa.estado, 'lobby');
  assert.equal(mesa.anfitriao.id, TAVA);
  assert.deepEqual(mesa.lugares.map((p) => p.id), [TAVA, TKP]);
});

test('quem some por dez minutos sai da partida; quem só está no chat continua', () => {
  const t = montar();
  const id = sentados(t, TKP, TAVA, GUSTAVO);
  t.mesas.agir(t.como(TKP), { id, acao: 'comecar' });
  for (let i = 0; i < 12; i++) {
    t.passar(60_000);
    t.mesas.ver(t.como(TKP), id);          // TKP está na tela da partida
    t.mesas.resumo(t.como(TAVA));          // Tava1 está lendo o chat
  }
  const m = t.mesas.ver(t.como(TKP), id);
  const fora = m.jogadores.map((p, j) => [p.id, m.partida.jogadores[j].fora]);
  assert.deepEqual(Object.fromEntries(fora), { [TKP]: false, [TAVA]: false, [GUSTAVO]: true });
  assert.ok(ABANDONO <= 12 * 60_000);
});

test('mesa parada some depois de meia hora; a plateia some sozinha', () => {
  const t = montar();
  const id = sentados(t, TKP, TAVA);
  t.mesas.agir(t.como(TKP), { id, acao: 'comecar' });
  t.mesas.ver(t.como(JUNINHO), id);
  assert.deepEqual(t.mesas.ver(t.como(TKP), id).plateia.map((p) => p.id), [JUNINHO]);
  t.passar(PLATEIA);
  assert.deepEqual(t.mesas.ver(t.como(TKP), id).plateia, []);
  t.mesas.agir(t.como(TKP), { id, acao: 'desistir' });
  t.passar(ESQUECIDA);
  t.mesas.resumo(t.como(TKP));
  assert.equal(t.mesas.tamanho, 0);
});

test('mesa de outro servidor responde como mesa que não existe', () => {
  const t = montar();
  const { id } = t.mesas.abrir(t.como(TKP));
  assert.throws(() => t.mesas.ver(t.como(TAVA, 2), id), recusa(404));
});

test('o tempo da vez: 60 de saída, só quem abriu escolhe, só 30 ou 60, e fica para a partida seguinte', () => {
  const t = montar();
  const id = sentados(t, TKP, TAVA);
  assert.equal(t.mesas.ver(t.como(TAVA), id).segundos, TEMPO_PADRAO);
  assert.equal(TEMPO_PADRAO, 60);
  assert.throws(() => t.mesas.agir(t.como(TAVA), { id, acao: 'tempo', segundos: 30 }), recusa(403));
  assert.throws(() => t.mesas.agir(t.como(TKP), { id, acao: 'tempo', segundos: 45 }), recusa(400, /30 ou de 60/));
  assert.throws(() => t.mesas.agir(t.como(TKP), { id, acao: 'tempo', segundos: '30' }), recusa(400));
  t.mesas.agir(t.como(TKP), { id, acao: 'tempo', segundos: 30 });
  assert.equal(t.mesas.ver(t.como(TAVA), id).segundos, 30);
  const { mesa } = t.mesas.agir(t.como(TKP), { id, acao: 'comecar' });
  assert.equal(mesa.segundos, 30);
  assert.deepEqual(mesa.partida.relogio, { segundos: 30, prazo: mesa.agora + 30_000, descarte: null, pausa: null });
  assert.throws(() => t.mesas.agir(t.como(TKP), { id, acao: 'tempo', segundos: 60 }), recusa(409));
  t.mesas.agir(t.como(TAVA), { id, acao: 'desistir' });
  const { mesa: deNovo } = t.mesas.agir(t.como(TKP), { id, acao: 'jogarDeNovo' });
  assert.equal(deNovo.estado, 'lobby');
  assert.equal(deNovo.segundos, 30);
});

test('a vez estourada pela mesa: a leitura seguinte já encontra a vez com outro, e a jogada atrasada é recusada', () => {
  const t = montar();
  const id = sentados(t, TKP, TAVA);
  t.mesas.agir(t.como(TKP), { id, acao: 'comecar' });
  const primeiro = vez(t, id, TKP);
  const antes = t.mesas.ver(t.como(primeiro), id);
  t.passar(59_999);
  assert.equal(vez(t, id, TKP), primeiro);
  t.passar(1);
  assert.throws(() => t.mesas.agir(t.como(primeiro), { id, acao: 'jogar', jogada: { tipo: 'aldeia', v: antes.partida.pode.aldeias[0] } }), recusa(409, /vez/));
  const m = t.mesas.ver(t.como(TKP), id);
  assert.notEqual(m.jogadores[m.partida.vez].id, primeiro);
  assert.equal(m.partida.construcoes.length, 1);
  assert.equal(m.partida.estradas.length, 1);
  assert.deepEqual(m.partida.historico.find((e) => e.t === 'tempo'), { t: 'tempo', j: m.jogadores.findIndex((p) => p.id === primeiro), fase: 'inicio', rodada: 0 });
  assert.equal(m.partida.relogio.prazo, m.agora + 60_000);
});

test('a busca de salas também vence a vez: quem saiu da tela não segura a partida', () => {
  const t = montar();
  const id = sentados(t, TKP, TAVA);
  t.mesas.agir(t.como(TKP), { id, acao: 'comecar' });
  const primeiro = vez(t, id, TKP);
  t.passar(60_000);
  const r = t.mesas.resumo(t.como(TAVA));
  assert.notEqual(r.mesas[0].vez, primeiro);
});

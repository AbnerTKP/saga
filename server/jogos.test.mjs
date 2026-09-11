import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarMesas, PLATEIA, ESQUECIDA, ABANDONADA } from './jogos.mjs';
import { POSICAO_INICIAL } from './xadrez.mjs';
import { ErroDeConta } from './contas.mjs';

const TKP = 1, JUNINHO = 2, TAVA = 3, BLANKITO = 4;
const DE_FORA = 99;   // tem conta, mas não é deste servidor
const NOMES = { [TKP]: 'TKP', [JUNINHO]: 'Juninho', [TAVA]: 'Tava1', [BLANKITO]: 'Blankito' };

/** Um servidor de mentira, com o relógio na mão do teste e o sorteio decidido de antemão. */
function montar({ sorteio = 'brancas' } = {}) {
  let agora = 1_000_000;
  const mesas = criarMesas({ relogio: () => agora, sortearCor: () => sorteio });
  const como = (eu, sid = 1) => ({
    sid,
    eu,
    pessoa: (id) => ({ id, nome: NOMES[id] ?? `conta ${id}`, foto: null, idExibido: null }),
    membroAtivo: (id) => id in NOMES,
  });
  return { mesas, como, passar: (ms) => { agora += ms; } };
}

/** A recusa esperada: ErroDeConta, com o status — que vira o da resposta HTTP — e o texto. */
const recusa = (status, texto) => (e) => {
  assert.ok(e instanceof ErroDeConta, `veio outra coisa: ${e?.stack ?? e}`);
  assert.equal(e.status, status, e.message);
  if (texto) assert.match(e.message, texto);
  return true;
};

/** Abre, chama e aceita. Devolve o id da mesa. */
function comecada(t, { anfitriao = TKP, convidado = JUNINHO, tempo = null, cor = 'brancas' } = {}) {
  const { id } = t.mesas.abrir(t.como(anfitriao), { tempo, cor });
  t.mesas.agir(t.como(anfitriao), { id, acao: 'chamar', alvo: convidado });
  t.mesas.agir(t.como(convidado), { id, acao: 'aceitar' });
  return id;
}

/** Um lance escrito "e2e4", com a peça da promoção como quinto caractere. */
const lance = (t, quem, id, texto) =>
  t.mesas.agir(t.como(quem), { id, acao: 'lance', de: texto.slice(0, 2), para: texto.slice(2, 4), promocao: texto[4] }).mesa;

/** Joga a sequência alternando as cores, começando pelas brancas. Devolve a mesa do último lance. */
function jogarEmOrdem(t, id, { brancas, pretas }, lances) {
  let mesa;
  lances.forEach((texto, i) => { mesa = lance(t, i % 2 === 0 ? brancas : pretas, id, texto); });
  return mesa;
}

// ---- o lobby --------------------------------------------------------------------------------

test('abrir, chamar, recusar, chamar outro e aceitar: começa com as cores que o anfitrião escolheu', () => {
  const t = montar();
  const aberta = t.mesas.abrir(t.como(TKP), { tempo: 300, cor: 'pretas' });
  assert.equal(aberta.estado, 'lobby');
  assert.equal(aberta.eu, 'anfitriao');
  assert.equal(aberta.fen, POSICAO_INICIAL);
  assert.deepEqual(aberta.relogio, { brancas: 300_000, pretas: 300_000, correndo: null }, 'o relógio escolhido aparece, parado');
  const { id } = aberta;

  let mesa = t.mesas.agir(t.como(TKP), { id, acao: 'chamar', alvo: JUNINHO }).mesa;
  assert.equal(mesa.convidado.nome, 'Juninho');
  assert.equal(t.mesas.ver(t.como(JUNINHO), id).eu, 'convidado');

  mesa = t.mesas.agir(t.como(JUNINHO), { id, acao: 'recusar' }).mesa;
  assert.equal(mesa.convidado, null);
  assert.equal(mesa.recusou.nome, 'Juninho');
  assert.throws(() => t.mesas.agir(t.como(JUNINHO), { id, acao: 'aceitar' }), recusa(409, /não vale mais/),
    'quem recusou conseguiu aceitar depois');

  mesa = t.mesas.agir(t.como(TKP), { id, acao: 'chamar', alvo: TAVA }).mesa;
  assert.equal(mesa.convidado.nome, 'Tava1');
  assert.equal(mesa.recusou, null, 'chamar outra pessoa tira a recusa anterior da tela');

  t.passar(5000);
  mesa = t.mesas.agir(t.como(TAVA), { id, acao: 'aceitar' }).mesa;
  assert.equal(mesa.estado, 'jogando');
  assert.deepEqual([mesa.brancas.id, mesa.pretas.id], [TAVA, TKP], 'o anfitrião escolheu pretas');
  assert.equal(mesa.eu, 'brancas');
  assert.equal(mesa.convidado, null, 'o convite já foi usado');
  assert.deepEqual(mesa.relogio, { brancas: 300_000, pretas: 300_000, correndo: 'w' }, 'as brancas correm desde o aceite');
  assert.equal(mesa.legais.length, 20, 'quem tem a vez recebe os lances possíveis');

  const doAnfitriao = t.mesas.ver(t.como(TKP), id);
  assert.equal(doAnfitriao.eu, 'pretas', 'depois de começar, quem abriu é só um dos jogadores');
  assert.deepEqual(doAnfitriao.legais, [], 'quem espera a vez não recebe lance nenhum');
});

test('no sorteio quem decide as cores é o sorteio, e sem relógio não há relógio', () => {
  for (const sorteio of ['brancas', 'pretas']) {
    const t = montar({ sorteio });
    const mesa = t.mesas.ver(t.como(TKP), comecada(t, { cor: 'sorteio' }));
    assert.equal(mesa.brancas.id, sorteio === 'brancas' ? TKP : JUNINHO, `sorteio deu ${sorteio}`);
    assert.equal(mesa.relogio, null);
  }
});

test('o convite chega só a quem foi chamado, com a cor DELE, e acompanha o que o anfitrião muda', () => {
  const t = montar();
  const { id } = t.mesas.abrir(t.como(TKP), { tempo: 600, cor: 'brancas' });
  t.mesas.agir(t.como(TKP), { id, acao: 'chamar', alvo: JUNINHO });

  assert.deepEqual(t.mesas.resumo(t.como(JUNINHO)).convites, [
    { mesa: id, de: { id: TKP, nome: 'TKP', foto: null, idExibido: null }, tempo: 600, cor: 'pretas' },
  ]);
  const deOutro = t.mesas.resumo(t.como(TAVA));
  assert.deepEqual(deOutro.convites, []);
  assert.deepEqual(deOutro.mesas, [{ id, estado: 'lobby', anfitriao: TKP, brancas: null, pretas: null, convidado: JUNINHO, vez: null }]);

  t.mesas.agir(t.como(TKP), { id, acao: 'configurar', tempo: null, cor: 'sorteio' });
  assert.deepEqual(t.mesas.resumo(t.como(JUNINHO)).convites.map((c) => [c.tempo, c.cor]), [[null, 'sorteio']]);

  t.mesas.agir(t.como(TKP), { id, acao: 'cancelarConvite' });
  assert.deepEqual(t.mesas.resumo(t.como(JUNINHO)).convites, []);
  assert.throws(() => t.mesas.agir(t.como(JUNINHO), { id, acao: 'aceitar' }), recusa(409, /não vale mais/));
  assert.deepEqual(t.mesas.resumo(t.como(JUNINHO, 2)), { mesas: [], convites: [] }, 'cada servidor vê só as mesas dele');
});

test('só quem abriu configura e chama, só antes de começar, e só com o que existe', () => {
  const t = montar();
  const { id } = t.mesas.abrir(t.como(TKP), {});
  assert.throws(() => t.mesas.agir(t.como(JUNINHO), { id, acao: 'configurar', tempo: 180 }), recusa(403));
  assert.throws(() => t.mesas.agir(t.como(JUNINHO), { id, acao: 'chamar', alvo: TAVA }), recusa(403));
  assert.throws(() => t.mesas.agir(t.como(JUNINHO), { id, acao: 'cancelarConvite' }), recusa(403));
  assert.throws(() => t.mesas.agir(t.como(TKP), { id, acao: 'configurar', tempo: 240 }), recusa(400, /3, 5, 10 ou 30/));
  assert.throws(() => t.mesas.agir(t.como(TKP), { id, acao: 'configurar', cor: 'azuis' }), recusa(400));
  assert.throws(() => t.mesas.abrir(t.como(JUNINHO), { tempo: 60 }), recusa(400));
  assert.throws(() => t.mesas.agir(t.como(TKP), { id, acao: 'roubar' }), recusa(400, /desconhecida/));
  assert.throws(() => t.mesas.agir(t.como(TKP), { id, acao: 'toString' }), recusa(400), 'o que o objeto herda virou ação');

  const { mesa } = t.mesas.agir(t.como(TKP), { id, acao: 'configurar', tempo: 180 });
  assert.deepEqual([mesa.tempo, mesa.cor], [180, 'sorteio'], 'o que não veio devia ficar como estava');

  t.mesas.agir(t.como(TKP), { id, acao: 'chamar', alvo: JUNINHO });
  t.mesas.agir(t.como(JUNINHO), { id, acao: 'aceitar' });
  assert.throws(() => t.mesas.agir(t.como(TKP), { id, acao: 'configurar', tempo: 600 }), recusa(409, /já começou/));
  assert.throws(() => t.mesas.agir(t.como(TKP), { id, acao: 'chamar', alvo: TAVA }), recusa(409, /já começou/));
});

test('não se chama a si mesmo, quem não é do servidor, nem quem está no meio de outra partida', () => {
  const t = montar();
  comecada(t, { anfitriao: TAVA, convidado: BLANKITO });
  const { id } = t.mesas.abrir(t.como(TKP), {});
  assert.throws(() => t.mesas.agir(t.como(TKP), { id, acao: 'chamar', alvo: TKP }), recusa(400));
  assert.throws(() => t.mesas.agir(t.como(TKP), { id, acao: 'chamar', alvo: DE_FORA }), recusa(404, /não faz parte/));
  assert.throws(() => t.mesas.agir(t.como(TKP), { id, acao: 'chamar' }), recusa(404));
  assert.throws(() => t.mesas.agir(t.como(TKP), { id, acao: 'chamar', alvo: BLANKITO }), recusa(409, /Blankito está numa partida/));
  assert.equal(t.mesas.ver(t.como(TKP), id).convidado, null, 'uma recusa deixou convite pela metade');
});

test('abrir: uma mesa esperando por vez, e nenhuma com partida em andamento', () => {
  const t = montar();
  const primeira = t.mesas.abrir(t.como(TKP), {});
  assert.throws(() => t.mesas.abrir(t.como(TKP), {}), recusa(409, /já tem uma mesa/));

  // Noutro servidor abre, e a que esperava aqui fecha: ninguém espera em duas mesas.
  const noOutro = t.mesas.abrir(t.como(TKP, 2), {});
  assert.throws(() => t.mesas.ver(t.como(TKP), primeira.id), recusa(404));

  t.mesas.agir(t.como(TKP, 2), { id: noOutro.id, acao: 'chamar', alvo: JUNINHO });
  t.mesas.agir(t.como(JUNINHO, 2), { id: noOutro.id, acao: 'aceitar' });
  assert.throws(() => t.mesas.abrir(t.como(TKP), {}), recusa(409, /partida em andamento/));
  assert.throws(() => t.mesas.abrir(t.como(JUNINHO), {}), recusa(409, /partida em andamento/),
    'a partida é da pessoa, não do servidor: vale em todos');
});

test('começar uma partida fecha as mesas que os dois esperavam, e convite recebido espera o fim', () => {
  const t = montar();
  const doJuninho = t.mesas.abrir(t.como(JUNINHO), {});
  t.mesas.agir(t.como(JUNINHO), { id: doJuninho.id, acao: 'chamar', alvo: TAVA });
  const doBlankito = t.mesas.abrir(t.como(BLANKITO), {});
  t.mesas.agir(t.como(BLANKITO), { id: doBlankito.id, acao: 'chamar', alvo: TKP });

  const id = comecada(t);   // TKP × Juninho

  assert.throws(() => t.mesas.ver(t.como(TAVA), doJuninho.id), recusa(404), 'a mesa que o Juninho esperava ficou aberta');
  assert.deepEqual(t.mesas.resumo(t.como(TAVA)).convites, [], 'e o convite dela continuou tocando');

  assert.deepEqual(t.mesas.resumo(t.como(TKP)).convites, [], 'convite tocando no meio da partida');
  assert.throws(() => t.mesas.agir(t.como(TKP), { id: doBlankito.id, acao: 'aceitar' }), recusa(409, /noutra partida/));

  t.mesas.agir(t.como(JUNINHO), { id, acao: 'desistir' });
  assert.deepEqual(t.mesas.resumo(t.como(TKP)).convites.map((c) => c.mesa), [doBlankito.id], 'terminada a partida, o convite volta');
});

// ---- a partida ------------------------------------------------------------------------------

test('só quem tem a vez joga, e o lance que não vale volta com o motivo do motor', () => {
  const t = montar();
  const id = comecada(t);   // TKP de brancas
  assert.throws(() => lance(t, JUNINHO, id, 'e7e5'), recusa(409, /sua vez/));
  assert.throws(() => lance(t, TAVA, id, 'e2e4'), recusa(403));
  assert.throws(() => lance(t, TKP, id, 'e2e5'), recusa(400, /não vale nesta posição/));

  const mesa = lance(t, TKP, id, 'e2e4');
  assert.deepEqual(mesa.lances, [{ san: 'e4', de: 'e2', para: 'e4' }]);
  assert.deepEqual(mesa.ultimo, { de: 'e2', para: 'e4' });
  assert.equal(mesa.vez, 'b');
  assert.equal(mesa.fen, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
  assert.deepEqual(mesa.legais, [], 'quem acabou de jogar não tem o que escolher');

  const legais = t.mesas.ver(t.como(JUNINHO), id).legais;
  assert.equal(legais.length, 20);
  assert.deepEqual(Object.keys(legais[0]).sort(), ['de', 'para', 'promocao', 'san']);
  assert.deepEqual(t.mesas.resumo(t.como(TAVA)).mesas,
    [{ id, estado: 'jogando', anfitriao: TKP, brancas: TKP, pretas: JUNINHO, convidado: null, vez: 'b' }]);
});

test('promoção: as quatro peças aparecem nos lances possíveis, e sem escolher não vale', () => {
  const t = montar();
  const id = comecada(t);
  jogarEmOrdem(t, id, { brancas: TKP, pretas: JUNINHO }, ['e2e4', 'd7d5', 'e4d5', 'c7c6', 'd5c6', 'g8f6', 'c6b7', 'b8d7']);
  const paraA8 = t.mesas.ver(t.como(TKP), id).legais.filter((l) => l.de === 'b7' && l.para === 'a8');
  assert.deepEqual(paraA8.map((l) => l.promocao).sort(), ['b', 'n', 'q', 'r']);
  assert.throws(() => lance(t, TKP, id, 'b7a8'), recusa(400, /peça da promoção/));
  assert.equal(lance(t, TKP, id, 'b7a8q').lances.at(-1).san, 'bxa8=Q');
});

test('o relógio desconta de quem jogou, passa a correr para o outro, e lance recusado não gasta nada', () => {
  const t = montar();
  const id = comecada(t, { tempo: 180 });   // TKP de brancas
  t.passar(10_000);
  assert.deepEqual(t.mesas.ver(t.como(TAVA), id).relogio, { brancas: 170_000, pretas: 180_000, correndo: 'w' });

  lance(t, TKP, id, 'e2e4');
  t.passar(4_000);
  assert.deepEqual(t.mesas.ver(t.como(TAVA), id).relogio, { brancas: 170_000, pretas: 176_000, correndo: 'b' });

  assert.throws(() => lance(t, JUNINHO, id, 'e7e4'), recusa(400));
  t.passar(1_000);
  assert.deepEqual(t.mesas.ver(t.como(TAVA), id).relogio, { brancas: 170_000, pretas: 175_000, correndo: 'b' });
});

test('tempo que acaba: quem estourou perde, e o lance que chega depois não salva ninguém', () => {
  const t = montar();
  const id = comecada(t, { tempo: 180 });
  lance(t, TKP, id, 'e2e4');
  t.passar(180_000);   // o das pretas zera exatamente agora
  const lida = t.mesas.ver(t.como(TAVA), id);
  assert.equal(lida.estado, 'fim');
  assert.deepEqual(lida.fim, { motivo: 'tempo', vencedor: TKP });
  assert.deepEqual(lida.relogio, { brancas: 180_000, pretas: 0, correndo: null });
  assert.equal(t.mesas.resumo(t.como(TAVA)).mesas[0].estado, 'fim', 'a busca de salas não soube do fim');

  // O mesmo com o lance chegando antes de qualquer leitura: a partida acaba em vez de ele valer.
  const t2 = montar();
  const id2 = comecada(t2, { tempo: 180 });
  t2.passar(180_001);
  const mesa = lance(t2, TKP, id2, 'e2e4');
  assert.equal(mesa.estado, 'fim');
  assert.deepEqual(mesa.fim, { motivo: 'tempo', vencedor: JUNINHO });
  assert.deepEqual(mesa.lances, [], 'o lance atrasado entrou no tabuleiro');
  assert.equal(mesa.relogio.brancas, 0);
});

test('mate encerra a partida com vencedor, e depois dele não há o que fazer além de sair ou revanche', () => {
  const t = montar();
  const id = comecada(t);
  const mesa = jogarEmOrdem(t, id, { brancas: TKP, pretas: JUNINHO }, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
  assert.equal(mesa.estado, 'fim');
  assert.deepEqual(mesa.fim, { motivo: 'mate', vencedor: JUNINHO });
  assert.equal(mesa.xeque, true);
  assert.deepEqual(mesa.lances.map((l) => l.san), ['f3', 'e5', 'g4', 'Qh4#']);
  assert.deepEqual(t.mesas.ver(t.como(TKP), id).legais, []);
  assert.throws(() => t.mesas.agir(t.como(TKP), { id, acao: 'desistir' }), recusa(409, /já terminou/));
  assert.throws(() => t.mesas.agir(t.como(TKP), { id, acao: 'oferecerEmpate' }), recusa(409, /já terminou/));
});

test('a mesma posição pela terceira vez empata sozinha', () => {
  const t = montar();
  const id = comecada(t);
  const vaiEVolta = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
  const mesa = jogarEmOrdem(t, id, { brancas: TKP, pretas: JUNINHO }, [...vaiEVolta, ...vaiEVolta]);
  assert.deepEqual(mesa.fim, { motivo: 'repeticao', vencedor: null });
});

test('empate: oferecido, recusado jogando, recusado no botão e aceito — e ninguém aceita a própria oferta', () => {
  const t = montar();
  const id = comecada(t);   // TKP de brancas

  let mesa = t.mesas.agir(t.como(TKP), { id, acao: 'oferecerEmpate' }).mesa;
  assert.equal(mesa.empateOferecidoPor, TKP);
  assert.throws(() => t.mesas.agir(t.como(TKP), { id, acao: 'aceitarEmpate' }), recusa(409, /própria oferta/));
  assert.throws(() => t.mesas.agir(t.como(TAVA), { id, acao: 'aceitarEmpate' }), recusa(403));

  // Quem ofereceu na própria vez joga em seguida: a oferta continua esperando o outro.
  mesa = lance(t, TKP, id, 'e2e4');
  assert.equal(mesa.empateOferecidoPor, TKP);
  // O outro responde com um lance: é um não.
  mesa = lance(t, JUNINHO, id, 'e7e5');
  assert.equal(mesa.empateOferecidoPor, null);
  assert.throws(() => t.mesas.agir(t.como(JUNINHO), { id, acao: 'aceitarEmpate' }), recusa(409, /Ninguém ofereceu/));

  t.mesas.agir(t.como(JUNINHO), { id, acao: 'oferecerEmpate' });
  mesa = t.mesas.agir(t.como(TKP), { id, acao: 'recusarEmpate' }).mesa;
  assert.deepEqual([mesa.empateOferecidoPor, mesa.estado], [null, 'jogando']);

  t.mesas.agir(t.como(JUNINHO), { id, acao: 'oferecerEmpate' });
  mesa = t.mesas.agir(t.como(TKP), { id, acao: 'aceitarEmpate' }).mesa;
  assert.equal(mesa.estado, 'fim');
  assert.deepEqual(mesa.fim, { motivo: 'empate', vencedor: null });
});

test('os dois oferecendo empate é empate', () => {
  const t = montar();
  const id = comecada(t);
  t.mesas.agir(t.como(TKP), { id, acao: 'oferecerEmpate' });
  assert.deepEqual(t.mesas.agir(t.como(JUNINHO), { id, acao: 'oferecerEmpate' }).mesa.fim, { motivo: 'empate', vencedor: null });
});

test('desistir dá a vitória ao outro e para o relógio; só quem joga desiste, e só com a partida andando', () => {
  const t = montar();
  const { id: lobby } = t.mesas.abrir(t.como(BLANKITO), {});
  assert.throws(() => t.mesas.agir(t.como(BLANKITO), { id: lobby, acao: 'desistir' }), recusa(409, /ainda não começou/));

  const id = comecada(t, { tempo: 300 });
  assert.throws(() => t.mesas.agir(t.como(TAVA), { id, acao: 'desistir' }), recusa(403));
  t.passar(7_000);
  const { mesa } = t.mesas.agir(t.como(TKP), { id, acao: 'desistir' });
  assert.deepEqual(mesa.fim, { motivo: 'desistencia', vencedor: JUNINHO });
  assert.deepEqual(mesa.relogio, { brancas: 293_000, pretas: 300_000, correndo: null });
  t.passar(60_000);
  assert.equal(t.mesas.ver(t.como(TKP), id).relogio.brancas, 293_000, 'o relógio continuou correndo depois do fim');
});

test('revanche: o primeiro pede, o segundo começa outra na mesma mesa, com as cores trocadas e tudo zerado', () => {
  const t = montar();
  const id = comecada(t, { tempo: 300 });   // TKP de brancas
  lance(t, TKP, id, 'e2e4');
  t.mesas.ver(t.como(TAVA), id);            // alguém assistindo
  t.mesas.agir(t.como(JUNINHO), { id, acao: 'desistir' });
  assert.throws(() => t.mesas.agir(t.como(TAVA), { id, acao: 'revanche' }), recusa(403));

  let mesa = t.mesas.agir(t.como(JUNINHO), { id, acao: 'revanche' }).mesa;
  assert.equal(mesa.revanchePedidaPor, JUNINHO);
  mesa = t.mesas.agir(t.como(JUNINHO), { id, acao: 'revanche' }).mesa;
  assert.equal(mesa.estado, 'fim', 'pedir duas vezes começou a revanche sem o outro');

  mesa = t.mesas.agir(t.como(TKP), { id, acao: 'revanche' }).mesa;
  assert.equal(mesa.id, id, 'a revanche é na mesma mesa');
  assert.equal(mesa.estado, 'jogando');
  assert.deepEqual([mesa.brancas.id, mesa.pretas.id, mesa.eu], [JUNINHO, TKP, 'pretas']);
  assert.equal(mesa.fen, POSICAO_INICIAL);
  assert.deepEqual([mesa.lances, mesa.ultimo, mesa.fim, mesa.revanchePedidaPor, mesa.empateOferecidoPor], [[], null, null, null, null]);
  assert.deepEqual(mesa.relogio, { brancas: 300_000, pretas: 300_000, correndo: 'w' });
  assert.deepEqual(mesa.plateia.map((p) => p.id), [TAVA], 'quem assistia continua assistindo');
  assert.throws(() => t.mesas.agir(t.como(TKP), { id, acao: 'revanche' }), recusa(409));
});

test('revanche não puxa ninguém de outra partida', () => {
  const t = montar();
  const id = comecada(t);   // TKP × Juninho
  t.mesas.agir(t.como(TKP), { id, acao: 'desistir' });
  t.mesas.agir(t.como(TKP), { id, acao: 'revanche' });
  comecada(t, { anfitriao: JUNINHO, convidado: TAVA });   // o Juninho foi jogar com o Tava1
  assert.throws(() => t.mesas.agir(t.como(JUNINHO), { id, acao: 'revanche' }), recusa(409, /noutra partida/));
});

// ---- sair, assistir e esquecer --------------------------------------------------------------

test('fechar: quem abriu, antes de começar; quem jogou, depois do fim; no meio da partida, não', () => {
  const t = montar();
  const { id: lobby } = t.mesas.abrir(t.como(TKP), {});
  t.mesas.agir(t.como(TKP), { id: lobby, acao: 'chamar', alvo: JUNINHO });
  assert.throws(() => t.mesas.agir(t.como(JUNINHO), { id: lobby, acao: 'fechar' }), recusa(403));
  assert.deepEqual(t.mesas.agir(t.como(TKP), { id: lobby, acao: 'fechar' }), { ok: true });
  assert.throws(() => t.mesas.ver(t.como(TKP), lobby), recusa(404, /não existe mais/));
  assert.deepEqual(t.mesas.resumo(t.como(JUNINHO)).convites, [], 'o convite continuou depois de a mesa fechar');

  const id = comecada(t);
  assert.throws(() => t.mesas.agir(t.como(TKP), { id, acao: 'fechar' }), recusa(409, /desista para sair/));
  assert.throws(() => t.mesas.agir(t.como(TAVA), { id, acao: 'fechar' }), recusa(403));
  t.mesas.agir(t.como(TKP), { id, acao: 'desistir' });
  assert.throws(() => t.mesas.agir(t.como(TAVA), { id, acao: 'fechar' }), recusa(403));
  assert.deepEqual(t.mesas.agir(t.como(JUNINHO), { id, acao: 'fechar' }), { ok: true });
  assert.equal(t.mesas.tamanho, 0);
});

test('plateia: quem lê a mesa sem jogar aparece enquanto continua olhando', () => {
  const t = montar();
  const { id: lobby } = t.mesas.abrir(t.como(BLANKITO), {});
  t.mesas.agir(t.como(BLANKITO), { id: lobby, acao: 'chamar', alvo: TAVA });
  t.mesas.ver(t.como(TAVA), lobby);
  assert.deepEqual(t.mesas.ver(t.como(BLANKITO), lobby).plateia, [], 'quem foi chamado entrou na plateia');

  const id = comecada(t);
  const vista = t.mesas.ver(t.como(TAVA), id);
  assert.equal(vista.eu, 'plateia');
  assert.deepEqual(vista.legais, []);
  assert.throws(() => lance(t, TAVA, id, 'e2e4'), recusa(403));
  t.mesas.ver(t.como(JUNINHO), id);
  assert.deepEqual(t.mesas.ver(t.como(TKP), id).plateia.map((p) => p.nome), ['Tava1'], 'jogador lendo a mesa virou plateia');

  t.passar(PLATEIA - 1);
  assert.equal(t.mesas.ver(t.como(JUNINHO), id).plateia.length, 1);
  t.passar(1);
  assert.deepEqual(t.mesas.ver(t.como(JUNINHO), id).plateia, [], 'quem fechou a tela continuou na plateia');
});

test('mesa de outro servidor responde igual a mesa que não existe', () => {
  const t = montar();
  const id = comecada(t);
  assert.throws(() => t.mesas.ver(t.como(TAVA, 2), id), recusa(404, /^Essa mesa não existe mais\.$/));
  assert.throws(() => t.mesas.agir(t.como(TKP, 2), { id, acao: 'desistir' }), recusa(404));
  assert.throws(() => t.mesas.ver(t.como(TAVA), 9999), recusa(404));
  assert.deepEqual(t.mesas.resumo(t.como(TKP, 2)).mesas, []);
  assert.equal(t.mesas.ver(t.como(TKP), id).estado, 'jogando', 'a tentativa de fora mexeu na partida');
});

test('faxina: mesa esperando ou acabada some depois de 30 min sem ninguém mexer', () => {
  const t = montar();
  const { id: lobby } = t.mesas.abrir(t.como(BLANKITO), {});
  t.passar(ESQUECIDA - 60_000);
  t.mesas.agir(t.como(BLANKITO), { id: lobby, acao: 'configurar', tempo: 300 });   // mexer segura a mesa
  const acabada = comecada(t);
  t.mesas.agir(t.como(TKP), { id: acabada, acao: 'desistir' });

  t.passar(ESQUECIDA - 1);
  t.mesas.resumo(t.como(TAVA));
  assert.equal(t.mesas.tamanho, 2, 'sumiu antes da hora');
  t.passar(1);
  t.mesas.resumo(t.como(TAVA));
  assert.equal(t.mesas.tamanho, 0, 'o que ninguém usa ficou guardado — num processo que fica meses de pé');
});

test('faxina: partida em que nenhum dos dois aparece some em 10 min, e a busca de salas conta como aparecer', () => {
  const t = montar();
  const id = comecada(t);
  t.passar(ABANDONADA - 1);
  t.mesas.ver(t.como(TAVA), id);   // quem assiste não segura a partida de ninguém
  t.passar(1);
  assert.throws(() => t.mesas.ver(t.como(TAVA), id), recusa(404));

  const outra = comecada(t);
  t.passar(ABANDONADA - 1);
  t.mesas.resumo(t.como(JUNINHO));   // o app dele aberto, lendo o chat
  t.passar(ABANDONADA - 1);
  assert.equal(t.mesas.ver(t.como(TAVA), outra).estado, 'jogando', 'quem só saiu da tela do jogo perdeu a partida');
});

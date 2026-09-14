import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  criarGrids, ESPERA_DA_LARGADA, DEPOIS_DO_VENCEDOR, TETO_POR_VOLTA, VOLTA_MINIMA, PLATEIA, ESQUECIDO, ABANDONADO, PISTAS, PROTOCOLO,
} from './corridas.mjs';
import { ErroDeConta } from './contas.mjs';

const TKP = 1, JUNINHO = 2, RAFA = 3, BIA = 4;
const NOMES = { [TKP]: 'TKP', [JUNINHO]: 'Juninho', [RAFA]: 'Rafa', [BIA]: 'Bia' };

/** Um servidor de mentira, com o relógio na mão do teste e o grid sem sorteio. */
function montar() {
  let agora = 1_000_000;
  const grids = criarGrids({ relogio: () => agora, embaralhar: (l) => l, nomeDaSala: () => 'abc' });
  const como = (eu, sid = 1) => ({
    sid,
    eu,
    pessoa: (id) => ({ id, nome: NOMES[id] ?? `conta ${id}`, foto: null, idExibido: null }),
    membroAtivo: (id) => id in NOMES,
  });
  const agir = (eu, id, acao, dados = {}, sid = 1) => grids.agir(como(eu, sid), { id, acao, ...dados });
  return { grids, como, agir, passar: (ms) => { agora += ms; }, agora: () => agora };
}

const recusa = (status, texto) => (e) => {
  assert.ok(e instanceof ErroDeConta, `veio outra coisa: ${e?.stack ?? e}`);
  assert.equal(e.status, status, e.message);
  if (texto) assert.match(e.message, texto);
  return true;
};

/** Grid aberto por TKP no VER, com Juninho no LEC, largado e com as luzes já apagadas. */
function largado(t, { voltas = 3 } = {}) {
  const { id } = t.grids.abrir(t.como(TKP), { voltas });
  t.agir(TKP, id, 'sentar', { carro: 'VER', protocolo: PROTOCOLO });
  t.agir(JUNINHO, id, 'sentar', { carro: 'LEC', protocolo: PROTOCOLO });
  t.agir(TKP, id, 'largar');
  t.passar(ESPERA_DA_LARGADA);
  return id;
}

test('abrir um grid: oito carros vazios, e abrir de novo devolve o mesmo', () => {
  const t = montar();
  const grid = t.grids.abrir(t.como(TKP), { voltas: 5 });
  assert.equal(grid.estado, 'grid');
  assert.equal(grid.assentos.length, 8);
  assert.ok(grid.assentos.every((a) => a.pessoa === null));
  assert.equal(grid.souAnfitriao, true);
  assert.equal(t.grids.abrir(t.como(TKP)).id, grid.id);
  assert.equal(t.grids.tamanho, 1);
  assert.throws(() => t.grids.abrir(t.como(JUNINHO), { voltas: 7 }), recusa(400, /3, 5 ou 10/));
  assert.throws(() => t.grids.abrir(t.como(JUNINHO), { pista: 'nurburgring' }), recusa(400, /pista não existe/));
  // Sem dizer a pista, é Interlagos.
  assert.equal(grid.pista, 'interlagos');
  assert.equal(t.grids.abrir(t.como(RAFA), { pista: 'monaco' }).pista, 'monaco');
});

test('a pista: só quem abriu escolhe, só entre as seis, e pedido meio errado não muda nada', () => {
  const t = montar();
  const { id } = t.grids.abrir(t.como(TKP));
  assert.deepEqual(PISTAS, ['interlagos', 'monza', 'monaco', 'spa', 'bahrein', 'vegas']);
  let { grid } = t.agir(TKP, id, 'configurar', { pista: 'vegas' });
  assert.equal(grid.pista, 'vegas');
  assert.equal(grid.voltas, 5);
  assert.throws(() => t.agir(JUNINHO, id, 'configurar', { pista: 'spa' }), recusa(403));
  assert.throws(() => t.agir(TKP, id, 'configurar', { pista: 'spa', voltas: 7 }), recusa(400));
  assert.throws(() => t.agir(TKP, id, 'configurar', {}), recusa(400));
  ({ grid } = t.agir(TKP, id, 'configurar', { voltas: 3 }));
  assert.equal(grid.pista, 'vegas');
  assert.deepEqual(t.grids.resumo(t.como(TKP)).grids.map((g) => g.pista), ['vegas']);
});

test('sentar: um carro por pessoa, uma pessoa por carro', () => {
  const t = montar();
  const { id } = t.grids.abrir(t.como(TKP));
  // App de antes do redesenho não diz o protocolo, e não senta: veria outra pista.
  assert.throws(() => t.agir(TKP, id, 'sentar', { carro: 'VER' }), recusa(409, /atualizar/));
  assert.throws(() => t.agir(TKP, id, 'sentar', { carro: 'VER', protocolo: 1 }), recusa(409, /atualizar/));
  t.agir(TKP, id, 'sentar', { carro: 'VER', protocolo: PROTOCOLO });
  assert.throws(() => t.agir(JUNINHO, id, 'sentar', { carro: 'VER', protocolo: PROTOCOLO }), recusa(409, /TKP já sentou/));
  assert.throws(() => t.agir(JUNINHO, id, 'sentar', { carro: 'XYZ', protocolo: PROTOCOLO }), recusa(400));
  // Trocar de carro libera o anterior.
  t.agir(TKP, id, 'sentar', { carro: 'NOR', protocolo: PROTOCOLO });
  const { grid } = t.agir(JUNINHO, id, 'sentar', { carro: 'VER', protocolo: PROTOCOLO });
  assert.equal(grid.assentos.find((a) => a.carro === 'VER').pessoa.id, JUNINHO);
  assert.equal(grid.assentos.find((a) => a.carro === 'NOR').pessoa.id, TKP);
  assert.equal(grid.assentos.filter((a) => a.pessoa).length, 2);
  assert.equal(t.agir(JUNINHO, id, 'levantar').grid.meuCarro, null);
});

test('chamar: vários de uma vez, o convite chega no resumo e some ao sentar ou recusar', () => {
  const t = montar();
  const { id } = t.grids.abrir(t.como(TKP));
  t.agir(TKP, id, 'chamar', { alvo: JUNINHO });
  t.agir(TKP, id, 'chamar', { alvo: RAFA });
  assert.throws(() => t.agir(JUNINHO, id, 'chamar', { alvo: BIA }), recusa(403));
  assert.throws(() => t.agir(TKP, id, 'chamar', { alvo: 99 }), recusa(404));
  assert.throws(() => t.agir(TKP, id, 'chamar', { alvo: TKP }), recusa(400));

  const convite = t.grids.resumo(t.como(JUNINHO)).convites;
  assert.deepEqual(convite.map((c) => [c.grid, c.de.nome, c.voltas]), [[id, 'TKP', 5]]);
  assert.deepEqual(t.grids.resumo(t.como(BIA)).convites, []);

  t.agir(JUNINHO, id, 'sentar', { carro: 'LEC', protocolo: PROTOCOLO });
  assert.deepEqual(t.grids.resumo(t.como(JUNINHO)).convites, []);
  t.agir(RAFA, id, 'recusar');
  const { grid } = t.agir(TKP, id, 'configurar', { voltas: 10 });
  assert.deepEqual(grid.chamados, []);
  assert.deepEqual(grid.recusaram, [RAFA]);
  assert.equal(grid.voltas, 10);
  // Grid de outro servidor não se enxerga.
  assert.deepEqual(t.grids.resumo(t.como(JUNINHO, 2)).grids, []);
  assert.throws(() => t.grids.ver(t.como(JUNINHO, 2), id), recusa(404));
});

test('largar: só quem abriu, com alguém sentado, e a largada fica no futuro', () => {
  const t = montar();
  const { id } = t.grids.abrir(t.como(TKP), { voltas: 3 });
  assert.throws(() => t.agir(TKP, id, 'largar'), recusa(409, /Ninguém sentou/));
  t.agir(JUNINHO, id, 'sentar', { carro: 'LEC', protocolo: PROTOCOLO });
  assert.throws(() => t.agir(JUNINHO, id, 'largar'), recusa(403));
  const { grid } = t.agir(TKP, id, 'largar');
  assert.equal(grid.estado, 'correndo');
  assert.equal(grid.largadaEm, t.agora() + ESPERA_DA_LARGADA);
  assert.deepEqual(grid.ordem, ['LEC']);
  assert.equal(grid.rodada, 1);
  // Largou, os lugares não mudam mais.
  assert.throws(() => t.agir(RAFA, id, 'sentar', { carro: 'VER', protocolo: PROTOCOLO }), recusa(409, /já largou/));
});

test('chegada: o tempo precisa fechar com a largada, e a ordem é a do tempo', () => {
  const t = montar();
  const id = largado(t);
  assert.throws(() => t.agir(TKP, id, 'chegada', { tempo: 5000 }), recusa(400));
  assert.throws(() => t.agir(RAFA, id, 'chegada', { tempo: 60_000 }), recusa(403));
  t.passar(60_000);
  // Chegar "no futuro" não vale.
  assert.throws(() => t.agir(TKP, id, 'chegada', { tempo: 90_000 }), recusa(400));
  t.agir(JUNINHO, id, 'chegada', { tempo: 59_500, melhorVolta: 19_000 });
  let { grid } = t.agir(TKP, id, 'chegada', { tempo: 58_200, melhorVolta: 18_700 });
  assert.equal(grid.estado, 'fim');
  assert.deepEqual(grid.chegadas.map((c) => [c.pessoa.nome, c.carro, c.tempo]), [['TKP', 'VER', 58_200], ['Juninho', 'LEC', 59_500]]);
  // Chegada repetida ou atrasada não quebra nada.
  ({ grid } = t.agir(TKP, id, 'chegada', { tempo: 58_000 }));
  assert.equal(grid.chegadas[0].tempo, 58_200);
});

test('chegada com punição: os segundos são somados, e a bandeirada é a do tempo com eles', () => {
  const t = montar();
  const id = largado(t);
  t.passar(60_000);
  assert.throws(() => t.agir(TKP, id, 'chegada', { tempo: 58_200, punicao: -3000 }), recusa(400, /punição/));
  assert.throws(() => t.agir(TKP, id, 'chegada', { tempo: 58_200, punicao: 'muito' }), recusa(400, /punição/));
  // TKP cruzou primeiro, mas cortou duas vezes: +6 s o põem atrás de Juninho.
  t.agir(TKP, id, 'chegada', { tempo: 58_200, punicao: 6000 });
  const { grid } = t.agir(JUNINHO, id, 'chegada', { tempo: 59_500 });
  assert.deepEqual(grid.chegadas.map((c) => [c.pessoa.nome, c.tempo, c.punicao]), [['Juninho', 59_500, 0], ['TKP', 64_200, 6000]]);
});

test('o fim vem quando todos resolvem, quando o vencedor espera demais, ou pelo teto', () => {
  const t = montar();
  const id = largado(t);
  t.passar(3 * VOLTA_MINIMA + 10_000);
  t.agir(TKP, id, 'chegada', { tempo: 3 * VOLTA_MINIMA + 9_000 });
  assert.equal(t.grids.ver(t.como(TKP), id).estado, 'correndo');
  t.passar(DEPOIS_DO_VENCEDOR);
  assert.equal(t.grids.ver(t.como(TKP), id).estado, 'fim');

  const u = montar();
  const outro = largado(u);
  u.agir(JUNINHO, outro, 'abandonar');
  assert.equal(u.grids.ver(u.como(TKP), outro).estado, 'correndo');
  u.passar(3 * TETO_POR_VOLTA);
  assert.equal(u.grids.ver(u.como(TKP), outro).estado, 'fim');
});

test('abandonar libera a pessoa, e correr de novo volta ao grid com os mesmos carros', () => {
  const t = montar();
  const id = largado(t);
  t.agir(TKP, id, 'abandonar');
  let { grid } = t.agir(JUNINHO, id, 'abandonar');
  assert.equal(grid.estado, 'fim');
  assert.throws(() => t.agir(RAFA, id, 'correrDeNovo'), recusa(403));
  ({ grid } = t.agir(JUNINHO, id, 'correrDeNovo'));
  assert.equal(grid.estado, 'grid');
  assert.equal(grid.assentos.find((a) => a.carro === 'VER').pessoa.id, TKP);
  ({ grid } = t.agir(TKP, id, 'largar'));
  assert.equal(grid.rodada, 2);
  assert.deepEqual(grid.chegadas, []);
  assert.deepEqual(grid.abandonos, []);
});

test('ninguém corre em duas pistas ao mesmo tempo', () => {
  const t = montar();
  largado(t);
  const outro = t.grids.abrir(t.como(RAFA)).id;
  assert.throws(() => t.agir(TKP, outro, 'sentar', { carro: 'NOR', protocolo: PROTOCOLO }), recusa(409, /corrida em andamento/));
  // E quem está correndo não recebe convite até acabar.
  t.agir(RAFA, outro, 'chamar', { alvo: JUNINHO });
  assert.deepEqual(t.grids.resumo(t.como(JUNINHO)).convites, []);
});

test('plateia: quem lê sem estar sentado, por um tempo', () => {
  const t = montar();
  const id = largado(t);
  t.grids.ver(t.como(RAFA), id);
  assert.deepEqual(t.grids.ver(t.como(TKP), id).plateia.map((p) => p.nome), ['Rafa']);
  t.passar(PLATEIA);
  assert.deepEqual(t.grids.ver(t.como(TKP), id).plateia, []);
});

test('fechar: só quem abriu, e nunca no meio da corrida', () => {
  const t = montar();
  const id = largado(t);
  assert.throws(() => t.agir(TKP, id, 'fechar'), recusa(409));
  t.agir(TKP, id, 'abandonar');
  t.agir(JUNINHO, id, 'abandonar');
  assert.throws(() => t.agir(JUNINHO, id, 'fechar'), recusa(403));
  assert.deepEqual(t.agir(TKP, id, 'fechar'), { ok: true });
  assert.equal(t.grids.tamanho, 0);
});

test('faxina: grid esquecido e corrida abandonada somem', () => {
  const t = montar();
  t.grids.abrir(t.como(RAFA));
  t.passar(ESQUECIDO);
  t.grids.resumo(t.como(TKP));
  assert.equal(t.grids.tamanho, 0);

  const u = montar();
  const id = largado(u, { voltas: 10 });
  u.passar(ABANDONADO);
  assert.throws(() => u.grids.ver(u.como(RAFA), id), recusa(404));
});

test('a sala do LiveKit muda a cada largada, e só quem senta publica', () => {
  const t = montar();
  const id = largado(t);
  assert.deepEqual(t.grids.salaDaCorrida(t.como(TKP), id), { sala: 'corrida-abc-1', piloto: true });
  assert.deepEqual(t.grids.salaDaCorrida(t.como(RAFA), id), { sala: 'corrida-abc-1', piloto: false });
  assert.throws(() => t.grids.salaDaCorrida(t.como(RAFA, 2), id), recusa(404));
});

test('o convite chega de qualquer servidor da pessoa, com quem já sentou, e não de servidor que ela deixou', () => {
  const t = montar();
  // o grid é do servidor 2; Juninho pergunta olhando o servidor 1
  const { id } = t.grids.abrir(t.como(TKP, 2), { pista: 'monaco' });
  t.agir(TKP, id, 'sentar', { carro: 'NOR', protocolo: PROTOCOLO }, 2);
  t.agir(TKP, id, 'chamar', { alvo: JUNINHO }, 2);
  const fora = (ativo) => ({
    pessoaEm: (sid, pid) => ({ id: pid, nome: `${NOMES[pid]} em ${sid}`, foto: null, idExibido: null }),
    ativoEm: () => ativo,
    nomeDoServidor: (sid) => `servidor ${sid}`,
  });
  const [convite] = t.grids.resumo(t.como(JUNINHO, 1), fora(true)).convites;
  assert.equal(convite.grid, id);
  assert.equal(convite.servidor, 2);
  assert.equal(convite.servidorNome, 'servidor 2');
  assert.equal(convite.de.nome, 'TKP em 2');
  assert.equal(convite.pista, 'monaco');
  assert.deepEqual(convite.sentados.map((s) => [s.carro, s.pessoa.nome]), [['NOR', 'TKP em 2']]);
  // os grids continuam sendo só os do servidor aberto
  assert.deepEqual(t.grids.resumo(t.como(JUNINHO, 1), fora(true)).grids, []);
  // saiu de lá (ou foi banido): o convite não chega
  assert.deepEqual(t.grids.resumo(t.como(JUNINHO, 1), fora(false)).convites, []);
  // sem saber dos outros servidores, só o do pedido
  assert.deepEqual(t.grids.resumo(t.como(JUNINHO, 1)).convites, []);
});

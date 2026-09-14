import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  criarArenas, ESPERA_DO_INICIO, ESPERA_DO_OUTRO, TETO_DA_LUTA, PLATEIA, ESQUECIDA, ABANDONADA, QPS,
  LUTADORES, CENARIOS, PROTOCOLO,
} from './lutas.mjs';
import { ErroDeConta } from './contas.mjs';

const TKP = 1, JUNINHO = 2, RAFA = 3, BIA = 4;
const NOMES = { [TKP]: 'TKP', [JUNINHO]: 'Juninho', [RAFA]: 'Rafa', [BIA]: 'Bia' };
const P = { protocolo: PROTOCOLO };

/** Um servidor de mentira, com o relógio e o sorteio na mão do teste. */
function montar() {
  let agora = 1_000_000;
  let semente = 0;
  const avisos = [];
  const arenas = criarArenas({
    relogio: () => agora, sorteio: () => ++semente, nomeDaSala: () => 'abc', avisar: (t) => avisos.push(t),
  });
  const como = (eu, sid = 1) => ({
    sid,
    eu,
    pessoa: (id) => ({ id, nome: NOMES[id] ?? `conta ${id}`, foto: null, idExibido: null }),
    membroAtivo: (id) => id in NOMES,
  });
  const agir = (eu, id, acao, dados = {}, sid = 1) => arenas.agir(como(eu, sid), { id, acao, ...dados });
  return { arenas, como, agir, avisos, passar: (ms) => { agora += ms; } };
}

const recusa = (status, texto) => (e) => {
  assert.ok(e instanceof ErroDeConta, `veio outra coisa: ${e?.stack ?? e}`);
  assert.equal(e.status, status, e.message);
  if (texto) assert.match(e.message, texto);
  return true;
};

/** Arena de TKP com Juninho do outro lado, luta começada e já valendo. */
function lutando(t) {
  const { id } = t.arenas.abrir(t.como(TKP), P);
  t.agir(JUNINHO, id, 'escolher', { lutador: 'picole', ...P });
  t.agir(TKP, id, 'comecar');
  t.passar(ESPERA_DO_INICIO);
  return id;
}

/** Quadros de uma luta que durou `ms` — a conta que o servidor confere. */
const quadros = (ms) => (ms * QPS) / 1000;

test('o protocolo, os lutadores e os cenários são os mesmos do app', () => {
  const ler = (f) => readFileSync(new URL(`../app/src/renderer/src/dragao/${f}`, import.meta.url), 'utf8');
  assert.match(ler('protocolo.ts'), new RegExp(`PROTOCOLO_DA_LUTA = ${PROTOCOLO};`));
  const lista = (nome) => [...ler('tipos.ts').match(new RegExp(`${nome} = \\[([^\\]]*)\\]`))[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(lista('IDS_DOS_LUTADORES'), LUTADORES);
  assert.deepEqual(lista('IDS_DOS_CENARIOS'), CENARIOS);
});

test('abrir: quem abre senta no lado 0, e abrir de novo devolve a mesma arena', () => {
  const t = montar();
  const arena = t.arenas.abrir(t.como(TKP), { cenario: 'ilha', rounds: 1, ...P });
  assert.equal(arena.estado, 'arena');
  assert.deepEqual(arena.lados.map((l) => l && [l.pessoa.id, l.lutador]), [[TKP, 'goiaba'], null]);
  assert.equal(arena.meuLado, 0);
  assert.equal(arena.souAnfitriao, true);
  assert.equal(arena.cenario, 'ilha');
  assert.equal(arena.rounds, 1);
  assert.equal(t.arenas.abrir(t.como(TKP), P).id, arena.id);
  assert.equal(t.arenas.tamanho, 1);
  // Sem dizer nada: o torneio, melhor de três.
  const outra = t.arenas.abrir(t.como(RAFA), P);
  assert.deepEqual([outra.cenario, outra.rounds], ['torneio', 2]);
  assert.throws(() => t.arenas.abrir(t.como(BIA), { cenario: 'lua', ...P }), recusa(400, /cenário/));
  assert.throws(() => t.arenas.abrir(t.como(BIA), { rounds: 3, ...P }), recusa(400));
});

test('app velho não abre nem senta', () => {
  const t = montar();
  assert.throws(() => t.arenas.abrir(t.como(TKP), {}), recusa(409, /atualizar/));
  assert.throws(() => t.arenas.abrir(t.como(TKP), { protocolo: PROTOCOLO - 1 }), recusa(409));
  const { id } = t.arenas.abrir(t.como(TKP), P);
  assert.throws(() => t.agir(JUNINHO, id, 'escolher', { lutador: 'vegetal' }), recusa(409, /atualizar/));
  assert.equal(t.arenas.ver(t.como(JUNINHO), id).lados[1], null);
});

test('escolher: senta no lado livre, e já sentado troca de lutador', () => {
  const t = montar();
  const { id } = t.arenas.abrir(t.como(TKP), P);
  assert.throws(() => t.agir(JUNINHO, id, 'escolher', { lutador: 'dragao', ...P }), recusa(400));
  const { arena } = t.agir(JUNINHO, id, 'escolher', { lutador: 'geladeira', ...P });
  assert.equal(arena.meuLado, 1);
  assert.equal(arena.lados[1].lutador, 'geladeira');
  // O mesmo lutador dos dois lados vale.
  assert.equal(t.agir(TKP, id, 'escolher', { lutador: 'geladeira', ...P }).arena.lados[0].lutador, 'geladeira');
  assert.throws(() => t.agir(RAFA, id, 'escolher', { lutador: 'vegetal', ...P }), recusa(409, /ocupados/));
  // Quem não abriu levanta; quem abriu, não.
  assert.equal(t.agir(JUNINHO, id, 'levantar').arena.lados[1], null);
  assert.throws(() => t.agir(TKP, id, 'levantar'), recusa(409, /feche/));
});

test('só quem abriu configura, chama e começa', () => {
  const t = montar();
  const { id } = t.arenas.abrir(t.como(TKP), P);
  t.agir(JUNINHO, id, 'escolher', { lutador: 'vegetal', ...P });
  assert.throws(() => t.agir(JUNINHO, id, 'configurar', { cenario: 'canion' }), recusa(403));
  assert.throws(() => t.agir(JUNINHO, id, 'chamar', { alvo: RAFA }), recusa(403));
  assert.throws(() => t.agir(JUNINHO, id, 'comecar'), recusa(403));
  // Pedido meio errado não muda meia arena.
  assert.throws(() => t.agir(TKP, id, 'configurar', { cenario: 'planeta', rounds: 5 }), recusa(400));
  assert.equal(t.arenas.ver(t.como(TKP), id).cenario, 'torneio');
  assert.equal(t.agir(TKP, id, 'configurar', { cenario: 'planeta', rounds: 1 }).arena.cenario, 'planeta');
});

test('chamar: o convite chega no resumo, e some ao sentar, ao recusar ou quando a arena enche', () => {
  const t = montar();
  const { id } = t.arenas.abrir(t.como(TKP), { cenario: 'canion', ...P });
  assert.throws(() => t.agir(TKP, id, 'chamar', { alvo: TKP }), recusa(400));
  assert.throws(() => t.agir(TKP, id, 'chamar', { alvo: 99 }), recusa(404));
  t.agir(TKP, id, 'chamar', { alvo: JUNINHO });
  t.agir(TKP, id, 'chamar', { alvo: RAFA });
  const [convite] = t.arenas.resumo(t.como(JUNINHO)).convites;
  assert.equal(convite.arena, id);
  assert.equal(convite.de.nome, 'TKP');
  assert.equal(convite.cenario, 'canion');
  assert.deepEqual([convite.oponente.pessoa.id, convite.oponente.lutador], [TKP, 'goiaba']);

  t.agir(RAFA, id, 'recusar');
  assert.deepEqual(t.arenas.resumo(t.como(RAFA)).convites, []);
  assert.deepEqual(t.arenas.ver(t.como(TKP), id).recusaram, [RAFA]);
  t.agir(JUNINHO, id, 'escolher', { lutador: 'picole', ...P });
  assert.deepEqual(t.arenas.resumo(t.como(JUNINHO)).convites, []);
  assert.deepEqual(t.arenas.ver(t.como(TKP), id).chamados, []);
  assert.throws(() => t.agir(TKP, id, 'chamar', { alvo: BIA }), recusa(409, /ocupados/));
});

test('começar: exige os dois lados, e cada luta tem semente, rodada e hora novas', () => {
  const t = montar();
  const { id, semente } = t.arenas.abrir(t.como(TKP), P);
  assert.throws(() => t.agir(TKP, id, 'comecar'), recusa(409, /Falta alguém/));
  t.agir(JUNINHO, id, 'escolher', { lutador: 'vegetal', ...P });
  const { arena } = t.agir(TKP, id, 'comecar');
  assert.equal(arena.estado, 'lutando');
  assert.notEqual(arena.semente, semente);
  assert.equal(arena.rodada, 1);
  assert.equal(arena.inicioEm, arena.agora + ESPERA_DO_INICIO);
  assert.equal(t.arenas.salaDaLuta(t.como(TKP), id).sala, 'luta-abc-1');
  assert.throws(() => t.agir(JUNINHO, id, 'escolher', { lutador: 'picole', ...P }), recusa(409, /começou/));
});

test('ninguém luta em duas arenas ao mesmo tempo', () => {
  const t = montar();
  lutando(t);
  const { id } = t.arenas.abrir(t.como(RAFA), P);
  assert.throws(() => t.agir(TKP, id, 'escolher', { lutador: 'vegetal', ...P }), recusa(409, /luta em andamento/));
  assert.throws(() => t.arenas.abrir(t.como(JUNINHO, 2), P), recusa(409, /luta em andamento/));
});

test('resultado: a conta tem de fechar com a hora do começo, e só quem luta manda', () => {
  const t = montar();
  const { id } = t.arenas.abrir(t.como(TKP), P);
  t.agir(JUNINHO, id, 'escolher', { lutador: 'vegetal', ...P });
  assert.throws(() => t.agir(TKP, id, 'resultado', { vencedor: 0, quadros: 600 }), recusa(409, /não começou/));
  t.agir(TKP, id, 'comecar');
  assert.throws(() => t.agir(TKP, id, 'resultado', { vencedor: 0, quadros: 600 }), recusa(400, /antes de a luta começar/));
  t.passar(ESPERA_DO_INICIO + 10_000);
  assert.throws(() => t.agir(RAFA, id, 'resultado', { vencedor: 0, quadros: 600 }), recusa(403));
  // Campo faltando não vira vitória do lado 0.
  assert.throws(() => t.agir(TKP, id, 'resultado', { vencedor: null, quadros: 600 }), recusa(400));
  assert.throws(() => t.agir(TKP, id, 'resultado', { vencedor: 0, quadros: 100 }), recusa(400, /não fecha/));
  assert.throws(() => t.agir(TKP, id, 'resultado', { vencedor: 0, quadros: quadros(60_000) }), recusa(400, /não fecha/));
});

test('resultado concordante: o segundo lado encerra a luta, sem aviso', () => {
  const t = montar();
  const id = lutando(t);
  t.passar(10_000);
  const primeiro = t.agir(JUNINHO, id, 'resultado', { vencedor: 1, quadros: 600, impressao: 'ab12' }).arena;
  assert.equal(primeiro.estado, 'lutando');
  assert.deepEqual(primeiro.resultadoDe, [false, true]);
  const { arena } = t.agir(TKP, id, 'resultado', { vencedor: 1, quadros: 600, impressao: 'ab12' });
  assert.equal(arena.estado, 'fim');
  assert.equal(arena.vencedor, 1);
  assert.equal(arena.motivo, 'luta');
  assert.deepEqual(t.avisos, []);
});

test('resultado discordante: vale o primeiro, e a dessincronia fica escrita sem nome de ninguém', () => {
  const t = montar();
  const id = lutando(t);
  t.passar(10_000);
  t.agir(TKP, id, 'resultado', { vencedor: 0, quadros: 600, impressao: 'x\ny' });
  const { arena } = t.agir(JUNINHO, id, 'resultado', { vencedor: 1, quadros: 601, impressao: 'zz' });
  assert.equal(arena.vencedor, 0);
  assert.equal(t.avisos.length, 1);
  assert.match(t.avisos[0], /vencedor, quadros, impressão/);
  assert.doesNotMatch(t.avisos[0], /TKP|Juninho|\n/);
});

test('o outro lado não mandou: passado o prazo, vale o que chegou', () => {
  const t = montar();
  const id = lutando(t);
  t.passar(10_000);
  t.agir(JUNINHO, id, 'resultado', { vencedor: 2, quadros: 600 });
  t.passar(ESPERA_DO_OUTRO - 1);
  assert.equal(t.arenas.ver(t.como(RAFA), id).estado, 'lutando');
  t.passar(1);
  const arena = t.arenas.ver(t.como(RAFA), id);
  assert.deepEqual([arena.estado, arena.vencedor, arena.motivo], ['fim', 2, 'luta']);
});

test('ninguém mandou resultado: o teto encerra sem vencedor', () => {
  const t = montar();
  const id = lutando(t);
  t.passar(TETO_DA_LUTA);
  t.arenas.resumo(t.como(TKP));
  const arena = t.arenas.ver(t.como(TKP), id);
  assert.deepEqual([arena.estado, arena.vencedor, arena.motivo], ['fim', null, 'semResultado']);
});

test('abandonar dá a vitória ao outro — a não ser que a luta já tenha sido decidida', () => {
  const t = montar();
  const id = lutando(t);
  const { arena } = t.agir(TKP, id, 'abandonar');
  assert.deepEqual([arena.estado, arena.vencedor, arena.motivo], ['fim', 1, 'abandono']);

  const u = montar();
  const outro = lutando(u);
  u.passar(10_000);
  u.agir(TKP, outro, 'resultado', { vencedor: 0, quadros: 600 });
  const depois = u.agir(TKP, outro, 'abandonar').arena;
  assert.deepEqual([depois.vencedor, depois.motivo], [0, 'luta']);
});

test('revanche: volta à arena com os dois sentados e os mesmos lutadores', () => {
  const t = montar();
  const id = lutando(t);
  assert.throws(() => t.agir(TKP, id, 'revanche'), recusa(409));
  t.agir(JUNINHO, id, 'abandonar');
  assert.throws(() => t.agir(RAFA, id, 'revanche'), recusa(403));
  const { arena } = t.agir(JUNINHO, id, 'revanche');
  assert.equal(arena.estado, 'arena');
  assert.deepEqual(arena.lados.map((l) => [l.pessoa.id, l.lutador]), [[TKP, 'goiaba'], [JUNINHO, 'picole']]);
  assert.deepEqual([arena.vencedor, arena.motivo, arena.resultadoDe], [null, null, [false, false]]);
  const segunda = t.agir(TKP, id, 'comecar').arena;
  assert.equal(segunda.rodada, 2);
  assert.equal(t.arenas.salaDaLuta(t.como(JUNINHO), id).sala, 'luta-abc-2');
});

test('fechar: só quem abriu, e nunca no meio da luta', () => {
  const t = montar();
  const id = lutando(t);
  assert.throws(() => t.agir(TKP, id, 'fechar'), recusa(409, /desista/));
  t.agir(TKP, id, 'abandonar');
  assert.throws(() => t.agir(JUNINHO, id, 'fechar'), recusa(403));
  assert.deepEqual(t.agir(TKP, id, 'fechar'), { ok: true });
  assert.throws(() => t.arenas.ver(t.como(TKP), id), recusa(404));
});

test('arena de outro servidor responde como arena que não existe', () => {
  const t = montar();
  const { id } = t.arenas.abrir(t.como(TKP), P);
  assert.throws(() => t.arenas.ver(t.como(JUNINHO, 2), id), recusa(404));
  assert.throws(() => t.agir(JUNINHO, id, 'escolher', { lutador: 'vegetal', ...P }, 2), recusa(404));
  assert.throws(() => t.arenas.salaDaLuta(t.como(JUNINHO, 2), id), recusa(404));
  assert.throws(() => t.agir(TKP, id, 'voar'), recusa(400, /desconhecida/));
  assert.deepEqual(t.arenas.resumo(t.como(JUNINHO, 2)).arenas, []);
});

test('plateia e o passe: quem lê sem sentar assiste por um tempo, e só quem luta publica', () => {
  const t = montar();
  const id = lutando(t);
  t.arenas.ver(t.como(RAFA), id);
  assert.deepEqual(t.arenas.ver(t.como(TKP), id).plateia.map((p) => p.id), [RAFA]);
  t.passar(PLATEIA);
  assert.deepEqual(t.arenas.ver(t.como(TKP), id).plateia, []);
  assert.deepEqual(t.arenas.salaDaLuta(t.como(JUNINHO), id), { sala: 'luta-abc-1', lutador: true });
  assert.deepEqual(t.arenas.salaDaLuta(t.como(RAFA), id), { sala: 'luta-abc-1', lutador: false });
});

test('o convite chega de qualquer servidor da pessoa, e não de servidor que ela deixou', () => {
  const t = montar();
  const { id } = t.arenas.abrir(t.como(TKP, 2), { rounds: 1, ...P });
  t.agir(TKP, id, 'chamar', { alvo: JUNINHO }, 2);
  const fora = (ativo) => ({
    pessoaEm: (sid, pid) => ({ id: pid, nome: `${NOMES[pid]} em ${sid}`, foto: null, idExibido: null }),
    ativoEm: () => ativo,
    nomeDoServidor: (sid) => `servidor ${sid}`,
  });
  const resumo = t.arenas.resumo(t.como(JUNINHO, 1), fora(true));
  assert.deepEqual(resumo.arenas, []);
  const [convite] = resumo.convites;
  assert.deepEqual([convite.arena, convite.servidor, convite.servidorNome], [id, 2, 'servidor 2']);
  assert.equal(convite.de.nome, 'TKP em 2');
  assert.equal(convite.oponente.pessoa.nome, 'TKP em 2');
  assert.deepEqual(t.arenas.resumo(t.como(JUNINHO, 1), fora(false)).convites, []);
  assert.deepEqual(t.arenas.resumo(t.como(JUNINHO, 1)).convites, []);
});

test('quem está lutando não recebe convite até a luta acabar', () => {
  const t = montar();
  const luta = lutando(t);
  const { id } = t.arenas.abrir(t.como(RAFA), P);
  t.agir(RAFA, id, 'chamar', { alvo: JUNINHO });
  assert.deepEqual(t.arenas.resumo(t.como(JUNINHO)).convites, []);
  t.agir(JUNINHO, luta, 'abandonar');
  assert.deepEqual(t.arenas.resumo(t.como(JUNINHO)).convites.map((c) => c.arena), [id]);
});

test('faxina: arena esquecida e luta abandonada somem; buscar as salas conta como aparecer', () => {
  const t = montar();
  t.arenas.abrir(t.como(RAFA), P);
  t.passar(ESQUECIDA);
  t.arenas.resumo(t.como(BIA));
  assert.equal(t.arenas.tamanho, 0);

  const u = montar();
  const id = lutando(u);
  u.passar(ABANDONADA);
  assert.throws(() => u.arenas.ver(u.como(RAFA), id), recusa(404));

  // Quem saiu da tela da luta para ler o chat continua buscando as salas: não abandonou.
  const v = montar();
  const outra = lutando(v);
  v.passar(ABANDONADA - ESPERA_DO_INICIO - 1000);
  v.arenas.resumo(v.como(TKP));
  v.passar(2000);
  assert.equal(v.arenas.ver(v.como(RAFA), outra).estado, 'lutando');
});

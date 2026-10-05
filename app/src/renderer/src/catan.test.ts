import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  centroDoHex, pontoDoCruzamento, pontasDaAresta, textoDoEvento, textoDoMonte, oQueTocarNoCatan, minhaMesaDoCatan,
  temTudo, CUSTOS, monteVazio, type ResumoDaMesaDoCatan,
  tempoRestante, segundosQueFaltam, deveTicar, meuPrazo, eventosNovos, oQueTocarNaPartida,
  faixaDaVez, vezQueComecou, cartasQueChegaram,
  type Evento, type Partida, type JogadorNaPartida,
} from './catan.ts';

const perto = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test('o nome do cruzamento é a posição: os seis cantos de um hexágono ficam a 1 do centro', () => {
  // Os cantos do hexágono (q, r) na grade do servidor: (2q + r + dx, 3r + dy).
  const CANTOS = [[1, -1], [1, 1], [0, 2], [-1, 1], [-1, -1], [0, -2]];
  for (const [q, r] of [[0, 0], [2, -1], [-2, 2], [1, 1]]) {
    const c = centroDoHex(q, r);
    for (const [dx, dy] of CANTOS) {
      const p = pontoDoCruzamento(`${2 * q + r + dx},${3 * r + dy}`);
      assert.ok(perto(Math.hypot(p.x - c.x, p.y - c.y), 1), `${q},${r}`);
    }
  }
  const [a, b] = pontasDaAresta('1,-1|1,1');
  assert.ok(perto(Math.hypot(a.x - b.x, a.y - b.y), 1));
});

test('o que aconteceu, em português, com "você" no lugar do seu nome', () => {
  const nome = (j: number) => ['TKP', 'Tava1', 'Gustavo'][j];
  assert.equal(textoDoEvento({ t: 'rolou', j: 1, dados: [3, 5], rodada: 2 }, nome, 0), 'Tava1 tirou 8.');
  assert.equal(textoDoEvento({ t: 'rolou', j: 0, dados: [3, 5], rodada: 2 }, nome, 0), 'Você tirou 8.');
  assert.equal(
    textoDoEvento({ t: 'produziu', numero: 8, ganhos: { 0: { madeira: 1 }, 2: { trigo: 2, la: 1 } }, faltou: [], rodada: 2 }, nome, 0),
    'Renderam: você 1 madeira; Gustavo 1 lã e 2 trigo.',
  );
  assert.equal(textoDoEvento({ t: 'roubou', j: 1, de: 0, recurso: 'minerio', rodada: 3 }, nome, 0), 'Tava1 roubou 1 minério de você.');
  assert.equal(textoDoEvento({ t: 'roubou', j: 1, de: 2, rodada: 3 }, nome, 0), 'Tava1 roubou uma carta de Gustavo.');
  assert.equal(textoDoEvento({ t: 'maiorEstrada', j: 2, de: 1, rodada: 3 }, nome, 0), 'Gustavo tomou a maior estrada.');
  assert.equal(textoDoEvento({ t: 'maiorEstrada', j: null, de: 1, rodada: 3 }, nome, 0), 'Tava1 perdeu a maior estrada, e ninguém ficou com ela.');
  assert.equal(textoDoMonte({ trigo: 2, la: 1, madeira: 0 }), '1 lã e 2 trigo');
  assert.equal(textoDoMonte({}), 'nada');
});

test('temTudo confere repetidos: cidade pede 2 trigo e 3 minério', () => {
  const mao = { ...monteVazio(), trigo: 2, minerio: 2 };
  assert.equal(temTudo(mao, CUSTOS.cidade), false);
  assert.equal(temTudo({ ...mao, minerio: 3 }, CUSTOS.cidade), true);
  assert.equal(temTudo(null, CUSTOS.estrada), false);
});

test('o som: a vez que chega, o descarte que te pede, e o fim — nunca na primeira leitura', () => {
  const m = (o: Partial<ResumoDaMesaDoCatan>): ResumoDaMesaDoCatan => ({ id: 1, estado: 'jogando', anfitriao: 1, jogadores: [1, 2], vez: 2, fase: 'acoes', devem: [], ...o });
  assert.equal(oQueTocarNoCatan(null, m({ vez: 1 }), 1), null);
  assert.equal(oQueTocarNoCatan(m({ vez: 2 }), m({ vez: 1 }), 1), 'vez');
  assert.equal(oQueTocarNoCatan(m({ vez: 1 }), m({ vez: 1, fase: 'acoes' }), 1), null);
  assert.equal(oQueTocarNoCatan(m({ vez: 2 }), m({ vez: 2, fase: 'descartar', devem: [1] }), 1), 'vez');
  assert.equal(oQueTocarNoCatan(m({}), m({ estado: 'fim', vez: null }), 1), 'fim');
  assert.equal(oQueTocarNoCatan(m({ id: 1 }), m({ id: 2, vez: 1 }), 1), null);
});

test('a sua mesa: a partida antes da mesa esperando, e ela antes da que acabou', () => {
  const m = (id: number, estado: ResumoDaMesaDoCatan['estado'], jogadores: number[]): ResumoDaMesaDoCatan => ({ id, estado, anfitriao: jogadores[0], jogadores, vez: null, fase: null, devem: [] });
  assert.equal(minhaMesaDoCatan([m(1, 'fim', [1, 2]), m(2, 'lobby', [3, 1]), m(3, 'jogando', [1, 4])], 1)?.id, 3);
  assert.equal(minhaMesaDoCatan([m(1, 'fim', [1, 2]), m(2, 'lobby', [3, 1])], 1)?.id, 2);
  assert.equal(minhaMesaDoCatan([m(1, 'jogando', [5, 2])], 1), null);
});

// --- o relógio e os sons (04/10/2026) -----------------------------------------------

test('o tempo que falta sai do relógio do servidor, descontando o que passou aqui', () => {
  assert.equal(tempoRestante(null, 1000, 0), null);
  assert.equal(tempoRestante(10_000, 4_000, 1_000), 5_000);
  // Uma resposta que chegou "antes" do relógio local andar não devolve tempo a ninguém.
  assert.equal(tempoRestante(10_000, 4_000, -500), 6_000);
  assert.equal(tempoRestante(10_000, 9_000, 3_000), 0);
  assert.equal(segundosQueFaltam(14_200), 15);
  assert.equal(segundosQueFaltam(1_000), 1);
  assert.equal(segundosQueFaltam(1), 1);
  assert.equal(segundosQueFaltam(0), 0);
});

test('o tique dos últimos 5 s: um por segundo que vira, nunca na primeira leitura nem no zero', () => {
  assert.equal(deveTicar(null, 4_000), false);
  assert.equal(deveTicar(5_200, 4_900), true);   // virou o 5
  assert.equal(deveTicar(4_900, 4_800), false);  // ainda o 5
  assert.equal(deveTicar(1_100, 900), true);     // virou o 1
  assert.equal(deveTicar(900, 0), false);        // acabou: quem joga agora é o servidor
  assert.equal(deveTicar(7_100, 6_900), false);  // 7 ainda não tique
  assert.equal(deveTicar(5_200, 3_900), true);   // a aba dormiu e pulou o 5: o 4 tique
});

const jogador = (extra: Partial<JogadorNaPartida> = {}): JogadorNaPartida => ({
  cor: 'vermelho', cartas: 0, desenvolvimento: 0, cavaleiros: 0, estrada: 0, pontos: 2,
  pecas: { estrada: 13, aldeia: 3, cidade: 4 }, fora: false, descartar: 0, ...extra,
});
const partida = (extra: Partial<Partida> = {}): Partida => ({
  jogadores: [jogador(), jogador({ cor: 'azul' }), jogador({ cor: 'laranja' })],
  fase: 'acoes', vez: 1, eu: 0, oferta: null, historico: [],
  relogio: { segundos: 60, prazo: 50_000, descarte: null, pausa: null },
  ...extra,
} as Partida);

test('o prazo que corre contra você: o da sua vez, ou o do descarte que o 7 te pediu', () => {
  assert.equal(meuPrazo(partida({ vez: 0 })), 50_000);
  assert.equal(meuPrazo(partida({ vez: 1 })), null);
  assert.equal(meuPrazo(partida({ vez: 0, eu: null })), null);
  assert.equal(meuPrazo(partida({ vez: 0, fase: 'fim' })), null);
  const sete = { fase: 'descartar' as const, vez: 1, relogio: { segundos: 60 as const, prazo: null, descarte: 70_000, pausa: 20_000 } };
  assert.equal(meuPrazo(partida({ ...sete, jogadores: [jogador({ descartar: 4 }), jogador(), jogador()] })), 70_000);
  assert.equal(meuPrazo(partida(sete)), null);
});

const e = (t: string, j: number, rodada = 3) => ({ t, j, rodada }) as Evento;

test('os eventos novos se acham pelo encaixe do fim do registro anterior', () => {
  const a = [e('aldeia', 0), e('estrada', 0), e('rolou', 1)];
  assert.deepEqual(eventosNovos([], a), a);
  assert.deepEqual(eventosNovos(a, a), []);
  assert.deepEqual(eventosNovos(a, [...a, e('cidade', 1)]), [e('cidade', 1)]);
  // Duas estradas iguais seguidas (a carta de estradas): só a terceira é nova.
  const b = [e('rolou', 1), e('estrada', 1), e('estrada', 1)];
  assert.deepEqual(eventosNovos(b, [...b, e('estrada', 1)]), [e('estrada', 1)]);
  // O servidor guarda só os últimos: o começo some, e o encaixe continua achando o que é novo.
  assert.deepEqual(eventosNovos([e('comecou', 0), ...a], [...a, e('aldeia', 2)]), [e('aldeia', 2)]);
  // Registro que não se reconhece: nada é novo — melhor calar que tocar uma salva.
  assert.deepEqual(eventosNovos(a, [e('saiu', 2), e('venceu', 1)]), []);
});

test('os sons: a vez que muda, a troca que chega para você, as jogadas de todos e o que rendeu para você', () => {
  const antes = partida({ historico: [e('rolou', 1)] });
  assert.deepEqual(oQueTocarNaPartida(null, antes), [], 'a primeira leitura não toca nada');
  assert.deepEqual(oQueTocarNaPartida(antes, antes), []);
  assert.deepEqual(oQueTocarNaPartida(antes, partida({ vez: 0, historico: antes.historico })), ['suaVez']);
  assert.deepEqual(oQueTocarNaPartida(antes, partida({ vez: 2, historico: antes.historico })), ['vezDeOutro']);
  assert.deepEqual(oQueTocarNaPartida({ ...antes, eu: null }, partida({ eu: null, vez: 0, historico: antes.historico })), ['vezDeOutro'],
    'quem assiste não tem "sua vez"');
  assert.deepEqual(oQueTocarNaPartida(antes, partida({ vez: 0, fase: 'fim', historico: antes.historico })), [],
    'o fim é do aviso de fim, não da vez');

  // Os 15 s da troca: toca quando ela chega aberta para você, uma vez só.
  const oferta = { da: { ...monteVazio(), la: 1 }, quer: { ...monteVazio(), trigo: 1 }, respostas: {}, contras: {}, aberta: true, prazo: 65_000 };
  const comOferta = partida({ historico: antes.historico, oferta });
  assert.deepEqual(oQueTocarNaPartida(antes, comOferta), ['troca']);
  assert.deepEqual(oQueTocarNaPartida(comOferta, { ...comOferta }), []);
  assert.deepEqual(oQueTocarNaPartida(comOferta, partida({ historico: antes.historico, oferta: { ...oferta, prazo: 90_000 } })), ['troca'],
    'outra oferta, depois da primeira, toca de novo');
  assert.deepEqual(oQueTocarNaPartida(antes, partida({ vez: 0, historico: antes.historico, oferta })), ['suaVez'],
    'a oferta é sua: não toca para você');
  assert.deepEqual(oQueTocarNaPartida(antes, partida({ historico: antes.historico, oferta: { ...oferta, aberta: false } })), []);

  // As jogadas, de qualquer um — cada som uma vez, na ordem que importa.
  const h = antes.historico;
  assert.deepEqual(oQueTocarNaPartida(antes, partida({ historico: [...h, e('estrada', 2), e('estrada', 2), e('estrada', 2)] })), ['estrada']);
  assert.deepEqual(oQueTocarNaPartida(antes, partida({ historico: [...h, e('estrada', 1), e('cidade', 1), e('aldeia', 0)] })), ['cidade', 'aldeia', 'estrada']);
  assert.deepEqual(oQueTocarNaPartida(antes, partida({ historico: [...h, e('comprou', 1)] })), ['carta']);

  // O que rendeu: só o que é seu toca.
  const rendeu = (ganhos: Record<string, object>) => ({ t: 'produziu', numero: 6, ganhos, faltou: [], rodada: 3 }) as Evento;
  assert.deepEqual(oQueTocarNaPartida(antes, partida({ historico: [...h, rendeu({ 0: { la: 1 } })] })), ['ganhou']);
  assert.deepEqual(oQueTocarNaPartida(antes, partida({ historico: [...h, rendeu({ 2: { trigo: 2 } })] })), []);

  // O 7 que te pede cartas é chamado, como a vez.
  const sete = partida({ fase: 'descartar', historico: h, jogadores: [jogador({ descartar: 4 }), jogador(), jogador()] });
  assert.deepEqual(oQueTocarNaPartida(antes, sete), ['suaVez']);
  assert.deepEqual(oQueTocarNaPartida(sete, { ...sete }), []);
});

test('o relógio no "Acontecendo": quem ficou sem tempo e o que o jogo fez', () => {
  const nome = (j: number) => ['TKP', 'Tava1', 'Gustavo'][j];
  assert.equal(textoDoEvento({ t: 'tempo', j: 1, fase: 'rolar', rodada: 4 }, nome, 0), 'Tava1 ficou sem tempo, e o jogo rolou os dados.');
  assert.equal(textoDoEvento({ t: 'tempo', j: 0, fase: 'acoes', rodada: 4 }, nome, 0), 'Você ficou sem tempo, e a vez passou.');
  assert.equal(textoDoEvento({ t: 'tempo', j: 2, fase: 'descartar', rodada: 4 }, nome, 0), 'Gustavo ficou sem tempo, e o jogo devolveu as cartas.');
  assert.equal(textoDoEvento({ t: 'ofertaVenceu', j: 1, rodada: 4 }, nome, 0), 'A troca de Tava1 fechou: ninguém quis.');
  assert.equal(textoDoEvento({ t: 'ofertaVenceu', j: 0, rodada: 4 }, nome, 0), 'Sua troca fechou: ninguém quis.');
});

test('a faixa da vez: de quem é, o que falta e o relógio que conta — no 7, o do descarte', () => {
  const nome = (j: number) => ['TKP', 'Tava1', 'Gustavo'][j];
  assert.deepEqual(faixaDaVez(partida({ vez: 0, fase: 'rolar' }), nome),
    { j: 0, titulo: 'Sua vez', detalhe: 'Role os dados para começar', minha: true, prazo: 50_000 });
  assert.deepEqual(faixaDaVez(partida({ vez: 1 }), nome),
    { j: 1, titulo: 'Vez de Tava1', detalhe: 'Construindo e trocando', minha: false, prazo: 50_000 });
  // Quem só assiste nunca tem a vez.
  assert.equal(faixaDaVez(partida({ vez: 0, eu: null }), nome)?.titulo, 'Vez de TKP');
  const sete = { fase: 'descartar' as const, vez: 1, relogio: { segundos: 60 as const, prazo: null, descarte: 70_000, pausa: 20_000 } };
  const devo = faixaDaVez(partida({ ...sete, jogadores: [jogador({ descartar: 4 }), jogador(), jogador({ descartar: 3 })] }), nome)!;
  assert.deepEqual([devo.titulo, devo.minha, devo.prazo, devo.j], ['Saiu 7: devolva 4 cartas', true, 70_000, 1]);
  const espero = faixaDaVez(partida({ ...sete, jogadores: [jogador(), jogador({ descartar: 4 }), jogador({ descartar: 3 })] }), nome)!;
  assert.deepEqual([espero.titulo, espero.detalhe, espero.minha], ['Saiu 7', 'Esperando Tava1 e Gustavo devolver cartas', false]);
  assert.equal(faixaDaVez(partida({ fase: 'fim' }), nome), null);
  assert.equal(faixaDaVez(partida({ vez: 0, relogio: null }), nome)?.prazo, null);
});

test('o aviso no meio: a vez que muda de mão e o começo da partida — nunca na primeira leitura', () => {
  assert.equal(vezQueComecou(null, partida({ vez: 0 })), null);
  assert.equal(vezQueComecou(partida({ vez: 2 }), partida({ vez: 0 })), 0);
  assert.equal(vezQueComecou(partida({ vez: 1 }), partida({ vez: 1 })), null);
  // Quem pôs a última aldeia rola primeiro: a vez não muda de mão, mas a partida começa.
  assert.equal(vezQueComecou(partida({ vez: 0, fase: 'inicio' }), partida({ vez: 0, fase: 'rolar' })), 0);
  assert.equal(vezQueComecou(partida({ vez: 1 }), partida({ vez: 2, fase: 'fim' })), null);
});

test('as cartas que chegaram: só o que subiu, e nada na primeira leitura', () => {
  const m = (madeira: number, la: number, minerio: number) => ({ ...monteVazio(), madeira, la, minerio });
  assert.deepEqual(cartasQueChegaram(null, m(1, 1, 0)), {});
  assert.deepEqual(cartasQueChegaram(m(2, 1, 0), m(2, 2, 0)), { la: 1 });
  // Na troca, saiu lã e madeira e entraram dois minérios: aparece só o que entrou.
  assert.deepEqual(cartasQueChegaram(m(2, 2, 0), m(1, 1, 2)), { minerio: 2 });
  assert.deepEqual(cartasQueChegaram(m(2, 2, 0), m(2, 2, 0)), {});
});

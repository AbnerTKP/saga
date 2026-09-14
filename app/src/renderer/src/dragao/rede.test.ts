import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EspectadorDaLuta, SessaoDaLuta, codificar, decodificar, type Jogo, type Transporte } from './rede.ts';
import { avancar, clonar, criarLuta, impressao } from './luta.ts';
import type { EstadoDaLuta } from './tipos.ts';

const JOGO: Jogo<EstadoDaLuta> = { avancar, clonar, impressao };
const nova = () => criarLuta({ lutadores: ['goiaba', 'picole'], cenario: 'ilha', roundsParaVencer: 2, semente: 42 });

/** Uma sala de mentira: todo pacote chega a todos os outros, com atraso, perda e duplicata. */
function sala(o: { latencia: number; variacao: number; perda: number; semente: number }) {
  let s = o.semente;
  const sorteio = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  let agora = 0;
  const fila: { em: number; para: number; dados: Uint8Array }[] = [];
  const ouvintes = new Map<number, (d: Uint8Array) => void>();
  let perdendo = true;
  const transporte = (quem: number): Transporte => ({
    enviar(dados, confiavel) {
      for (const para of ouvintes.keys()) {
        if (para === quem) continue;
        if (!confiavel && perdendo && sorteio() < o.perda) continue;
        const em = agora + o.latencia + sorteio() * o.variacao;
        fila.push({ em, para, dados: dados.slice() });
        if (!confiavel && perdendo && sorteio() < 0.05) fila.push({ em: em + 7, para, dados: dados.slice() });
      }
    },
    aoReceber(cb) { ouvintes.set(quem, cb); return () => ouvintes.delete(quem); },
  });
  const entregar = () => {
    fila.sort((a, b) => a.em - b.em);
    while (fila.length && fila[0].em <= agora) { const p = fila.shift()!; ouvintes.get(p.para)?.(p.dados); }
  };
  return {
    transporte,
    relogio: () => agora,
    andar(ms: number) { agora += ms; entregar(); },
    semPerda() { perdendo = false; },
  };
}

/** Botões que mudam de tempos em tempos, como de gente. */
function botoesDe(semente: number) {
  let s = semente, atual = 0;
  return (q: number) => {
    if (q % 9 === 0) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; atual = (s >>> 12) & 1023; }
    return atual;
  };
}

function lutaPelaRede(latencia: number, perda: number, quadros = 900) {
  const rede = sala({ latencia, variacao: latencia / 2, perda, semente: 5 + latencia });
  const agendados: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
  const sessoes = ([0, 1] as const).map((lado) => new SessaoDaLuta({
    jogo: JOGO, inicial: nova(), lado, transporte: rede.transporte(lado), relogio: rede.relogio,
    aoAgendar: (q, b) => agendados[lado].set(q, b),
  }));
  const botoes = [botoesDe(11), botoesDe(23)];
  let voltaMaxima = 0;
  let esperou = false;
  for (let t = 0; t < quadros; t++) {
    rede.andar(1000 / 60);
    sessoes.forEach((s, lado) => s.avancarAte(t + 1, botoes[lado](t)));
    voltaMaxima = Math.max(voltaMaxima, ...sessoes.map((s) => s.quadrosDeVolta));
    esperou ||= sessoes.some((s) => s.esperando);
  }
  // acaba a partida de mentira: ninguém aperta mais nada e a rede para de perder
  rede.semPerda();
  for (let i = 0; i < 1500 && sessoes.some((s) => s.quadro < quadros + 20); i++) {
    rede.andar(1000 / 60);
    sessoes.forEach((s) => s.avancarAte(quadros + 20, 0));
  }
  for (let i = 0; i < 60; i++) { rede.andar(1000 / 60); sessoes.forEach((s) => s.avancarAte(quadros + 20, 0)); }
  // a luta de referência, sem rede, com os botões nos quadros em que foram agendados
  const ref = nova();
  for (let q = 0; q < quadros + 20; q++) avancar(ref, [agendados[0].get(q) ?? 0, agendados[1].get(q) ?? 0]);
  return { sessoes, ref, voltaMaxima, esperou, rede };
}

test('o pacote vai e volta igual, e lixo vira null', () => {
  const p: Parameters<typeof codificar>[0] = { tipo: 'entradas', lado: 1, primeiro: 1234, entradas: [0, 1023, 5, 512], confirmado: 1200, quadro: 1240, enviadoEm: 99999, eco: 12 };
  assert.deepEqual(decodificar(codificar(p)), p);
  assert.deepEqual(decodificar(codificar({ tipo: 'impressao', lado: 0, quadro: 360, impressao: 0xdeadbeef })), { tipo: 'impressao', lado: 0, quadro: 360, impressao: 0xdeadbeef });
  assert.equal(decodificar(new Uint8Array([9, 9, 9])), null);
  assert.equal(decodificar(new Uint8Array([1, 1, 0])), null);
  assert.equal(decodificar(new Uint8Array([1, 4, 123])), null);
});

for (const [latencia, perda] of [[0, 0], [40, 0.1], [120, 0.15], [250, 0.2]] as const) {
  test(`com ${latencia} ms e ${perda * 100}% de perda os dois terminam na luta de referência`, () => {
    const { sessoes, ref, voltaMaxima } = lutaPelaRede(latencia, perda);
    assert.equal(sessoes[0].quadro, sessoes[1].quadro);
    assert.equal(impressao(sessoes[0].estado), impressao(ref), 'lado 0');
    assert.equal(impressao(sessoes[1].estado), impressao(ref), 'lado 1');
    assert.ok(voltaMaxima <= 8 + 1, `voltou ${voltaMaxima} quadros`);
    assert.equal(sessoes[0].dessincronia || sessoes[1].dessincronia, false);
  });
}

test('sem notícia do outro, a sessão espera em vez de adivinhar, e volta quando ele volta', () => {
  const rede = sala({ latencia: 20, variacao: 0, perda: 0, semente: 1 });
  const a = new SessaoDaLuta({ jogo: JOGO, inicial: nova(), lado: 0, transporte: rede.transporte(0), relogio: rede.relogio });
  const b = new SessaoDaLuta({ jogo: JOGO, inicial: nova(), lado: 1, transporte: rede.transporte(1), relogio: rede.relogio });
  for (let t = 0; t < 120; t++) { rede.andar(1000 / 60); a.avancarAte(t + 1, 0); }
  assert.ok(a.esperando);
  assert.ok(a.quadro <= 2 + 8 + 1, `andou ${a.quadro}`);
  assert.ok(a.msSemOuvir() > 1500);
  for (let t = 120; t < 400; t++) { rede.andar(1000 / 60); b.avancarAte(t + 1, 0); a.avancarAte(t + 1, 0); }
  assert.equal(a.esperando, false);
  assert.ok(a.quadro > 350);
});

test('quem entra assistindo no meio chega ao mesmo estado', () => {
  const rede = sala({ latencia: 60, variacao: 30, perda: 0.1, semente: 9 });
  const agendados: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
  const a = new SessaoDaLuta({ jogo: JOGO, inicial: nova(), lado: 0, transporte: rede.transporte(0), relogio: rede.relogio, aoAgendar: (q, x) => agendados[0].set(q, x) });
  const b = new SessaoDaLuta({ jogo: JOGO, inicial: nova(), lado: 1, transporte: rede.transporte(1), relogio: rede.relogio, aoAgendar: (q, x) => agendados[1].set(q, x) });
  const botoes = [botoesDe(3), botoesDe(4)];
  let plateia: EspectadorDaLuta<EstadoDaLuta> | null = null;
  for (let t = 0; t < 700; t++) {
    rede.andar(1000 / 60);
    a.avancarAte(t + 1, botoes[0](t));
    b.avancarAte(t + 1, botoes[1](t));
    if (t === 300) plateia = new EspectadorDaLuta({ jogo: JOGO, inicial: null, transporte: rede.transporte(2), relogio: rede.relogio });
    plateia?.avancar();
  }
  rede.semPerda();
  for (let i = 0; i < 300; i++) {
    rede.andar(1000 / 60);
    a.avancarAte(720, 0); b.avancarAte(720, 0); plateia!.avancar();
  }
  assert.ok(plateia!.estado, 'recebeu o estado');
  // quem assiste anda até onde os botões dos dois já existem: o atraso de dois quadros, mais o agendado
  assert.ok(plateia!.quadro >= a.quadro && plateia!.quadro <= a.quadro + 3, `${plateia!.quadro} × ${a.quadro}`);
  const ref = nova();
  for (let q = 0; q < plateia!.quadro; q++) avancar(ref, [agendados[0].get(q) ?? 0, agendados[1].get(q) ?? 0]);
  assert.equal(impressao(plateia!.estado!), impressao(ref));
});

test('uma luta longa não acumula memória, e a volta no tempo cabe num quadro', () => {
  const { sessoes } = lutaPelaRede(120, 0.1, 3000);
  const s = sessoes[0] as unknown as { fotos: Map<number, unknown>; entradas: Map<number, number>[] };
  assert.ok(s.fotos.size < 40, `fotos ${s.fotos.size}`);
  assert.ok(s.entradas[0].size <= 700 && s.entradas[1].size <= 700);
  const rede = sala({ latencia: 0, variacao: 0, perda: 0, semente: 2 });
  const x = new SessaoDaLuta({ jogo: JOGO, inicial: nova(), lado: 0, transporte: rede.transporte(0), relogio: rede.relogio });
  const e = nova();
  const t0 = performance.now();
  for (let i = 0; i < 9; i++) { x['jogo'].avancar(e, [1 << (i % 10), 3]); x['jogo'].clonar(e); }
  assert.ok(performance.now() - t0 < 16);
});

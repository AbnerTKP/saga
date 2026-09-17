import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LUGARES } from './secao.ts';
import {
  type EstadoDaUrna, agir, andar, animando, avancar, comandoDaTecla, dicaDaSecao, escolhaDoVisor, falaDaMesa,
  novoEstado, teclar, voltar, TEMPO_DO_FIM,
} from './jogo.ts';
import { CANDIDATOS } from './candidatos.ts';
import { RETRATOS } from './retratos.ts';

/** Anda até `x` em passos de um quadro. */
function irAte(e: EstadoDaUrna, x: number) {
  for (let i = 0; i < 2000 && Math.abs(e.x - x) > 2; i++) andar(e, e.x < x ? 1 : -1, 1 / 60);
  andar(e, 0, 0);
}

function atePodeVotar(votos = 0) {
  const e = novoEstado(votos);
  irAte(e, LUGARES.mesa);
  assert.equal(dicaDaSecao(e), 'ESPAÇO: ENTREGAR O TÍTULO');
  agir(e); assert.equal(e.etapa, 'pedindo'); assert.ok(falaDaMesa(e));
  agir(e); assert.equal(e.etapa, 'titulo');
  agir(e); assert.equal(e.etapa, 'liberando');
  agir(e); assert.equal(e.etapa, 'liberado');
  irAte(e, LUGARES.cabine);
  assert.equal(dicaDaSecao(e), 'ESPAÇO: ENTRAR NA CABINE');
  agir(e);
  assert.equal(e.fase, 'cabine');
  return e;
}

test('da porta à urna: mesa, título, cabine, número, CONFIRMA, FIM e apuração', () => {
  const e = atePodeVotar();
  assert.equal(teclar(e, '1'), 'tecla');
  assert.equal(teclar(e, '3'), 'tecla');
  assert.deepEqual(e.visor, { tela: 'numero', digitos: '13' });
  assert.equal(teclar(e, '9'), 'tecla', 'terceiro dígito não entra');
  assert.deepEqual(e.visor, { tela: 'numero', digitos: '13' });
  assert.equal(teclar(e, 'confirma'), 'fim');
  assert.equal(e.voto, 13);
  assert.equal(e.votos, 1);
  assert.equal(teclar(e, '5'), null, 'no FIM a urna não aceita mais nada');
  avancar(e, TEMPO_DO_FIM);
  assert.equal(e.fase, 'apuracao');
  agir(e);
  assert.equal(e.fase, 'secao', 'VOTAR DE NOVO volta para a porta');
  assert.equal(e.votos, 1);
  assert.equal(e.voto, 13, 'o voto pendente não some antes de a tela mandar');
});

test('sem título a cabine não abre, e a mesária avisa', () => {
  const e = novoEstado();
  irAte(e, LUGARES.cabine);
  agir(e);
  assert.equal(e.fase, 'secao');
  assert.match(falaDaMesa(e)!.texto, /título/);
  andar(e, -1, 0.1);
  assert.equal(falaDaMesa(e), null, 'andar tira o recado');
});

test('fala aberta segura o bonequinho', () => {
  const e = novoEstado();
  irAte(e, LUGARES.mesa);
  agir(e);
  const x = e.x;
  andar(e, 1, 1);
  assert.equal(e.x, x);
});

test('número que não existe é nulo, branco só com a tela vazia, CORRIGE limpa', () => {
  const e = atePodeVotar();
  teclar(e, '9'); teclar(e, '9');
  assert.equal(escolhaDoVisor(e.visor), 'nulo');
  teclar(e, 'branco');
  assert.deepEqual(e.visor, { tela: 'numero', digitos: '99' }, 'branco com número digitado não vale');
  teclar(e, 'corrige');
  assert.equal(teclar(e, 'confirma'), 'tecla', 'confirmar vazio não vota');
  assert.equal(e.voto, null);
  teclar(e, 'branco');
  assert.equal(teclar(e, 'confirma'), 'fim');
  assert.equal(e.voto, 'branco');
});

test('a mesária repara em quem volta', () => {
  const e = novoEstado(2);
  irAte(e, LUGARES.mesa);
  agir(e);
  assert.match(falaDaMesa(e)!.texto, /de novo/);
  agir(e); agir(e);
  assert.match(falaDaMesa(e)!.texto, /número 3/);
});

test('Esc: fecha a cola, sai da cabine sem votar, e fora dela fecha o jogo', () => {
  const e = atePodeVotar();
  e.cola = true;
  voltar(e); assert.equal(e.cola, false); assert.equal(e.fase, 'cabine');
  voltar(e); assert.equal(e.fase, 'secao'); assert.equal(e.voto, null);
  voltar(e); assert.equal(e.saiu, true);
});

test('parado não precisa de laço; andando, sim', () => {
  const e = novoEstado();
  assert.equal(animando(e), false);
  andar(e, 1, 1 / 60);
  assert.equal(animando(e), true);
  andar(e, 0, 0);
  assert.equal(animando(e), false);
});

test('as teclas mudam de sentido com a fase', () => {
  assert.deepEqual(comandoDaTecla('cabine', 'Digit7'), { tipo: 'tecla', tecla: '7' });
  assert.deepEqual(comandoDaTecla('cabine', 'Numpad0'), { tipo: 'tecla', tecla: '0' });
  assert.deepEqual(comandoDaTecla('cabine', 'Enter'), { tipo: 'tecla', tecla: 'confirma' });
  assert.deepEqual(comandoDaTecla('secao', 'Enter'), { tipo: 'agir' });
  assert.deepEqual(comandoDaTecla('secao', 'ArrowRight'), { tipo: 'andar', direcao: 1 });
  assert.equal(comandoDaTecla('secao', 'Digit1'), null);
});

test('toda chapa tem os dois rostos, e os números não se repetem', () => {
  const numeros = CANDIDATOS.map((c) => c.numero);
  assert.equal(new Set(numeros).size, numeros.length);
  for (const n of numeros) {
    for (const quem of ['titular', 'vice'] as const) {
      const r = RETRATOS[n]?.[quem];
      assert.ok(r, `falta o rosto ${quem} da ${n}`);
      assert.equal(r.px.length, r.l * r.a);
    }
  }
});

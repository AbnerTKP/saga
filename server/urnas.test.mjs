import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { abrirBanco, garantirServidor } from './banco.mjs';
import { criarConta, ErroDeConta } from './contas.mjs';
import { apuracao, votar, NUMEROS, INTERVALO } from './urnas.mjs';

function montar() {
  const db = abrirBanco(':memory:');
  const servidor = garantirServidor(db, { nome: 'Cantinho', salas: ['Geral'] });
  const conta = (apelido) => criarConta(db, { apelido, senha: 'segredo123', senhaRepetida: 'segredo123' });
  return { db, sid: servidor.id, ana: conta('ana'), beto: conta('beto') };
}

const recusa = (status) => (e) => e instanceof ErroDeConta && e.status === status;

test('cada voto soma na chapa, e cada um vê só quantas vezes ELE votou', () => {
  const { db, sid, ana, beto } = montar();
  votar(db, sid, ana.id, 13, 0);
  votar(db, sid, ana.id, '22', 10_000);
  votar(db, sid, beto.id, 13, 0);
  const r = votar(db, sid, beto.id, 'branco', 20_000);
  assert.deepEqual(r.contagem, [{ numero: 13, votos: 2 }, { numero: 22, votos: 1 }, { numero: 'branco', votos: 1 }]);
  assert.equal(r.meus, 2);
  assert.equal(apuracao(db, sid, ana.id).meus, 2);
});

test('o voto é secreto no banco: nenhuma tabela liga uma pessoa a um candidato', () => {
  const { db, sid, ana } = montar();
  votar(db, sid, ana.id, 30, 0);
  const colunas = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  assert.ok(!colunas('urna_votos').includes('usuario_id'));
  assert.ok(!colunas('urna_eleitores').includes('escolha'));
});

test('votar de novo pode, mas não em laço', () => {
  const { db, sid, ana } = montar();
  votar(db, sid, ana.id, 13, 1000);
  assert.throws(() => votar(db, sid, ana.id, 13, 1000 + INTERVALO - 1), recusa(429));
  assert.equal(votar(db, sid, ana.id, 13, 1000 + INTERVALO).meus, 2);
});

test('escolha que não existe é recusada; nulo e branco valem', () => {
  const { db, sid, ana } = montar();
  assert.throws(() => votar(db, sid, ana.id, 99, 0), recusa(400));
  assert.throws(() => votar(db, sid, ana.id, 'lula', 0), recusa(400));
  assert.equal(votar(db, sid, ana.id, 'nulo', 0).contagem[0].numero, 'nulo');
});

test('a apuração é de cada servidor', () => {
  const { db, sid, ana } = montar();
  const outro = Number(db.prepare("INSERT INTO servidores (nome, criado_em) VALUES ('Outro', 0)").run().lastInsertRowid);
  votar(db, sid, ana.id, 13, 0);
  assert.deepEqual(apuracao(db, outro, ana.id), { contagem: [], meus: 0 });
});

test('os números do servidor são os mesmos da urna do app', () => {
  const app = readFileSync(new URL('../app/src/renderer/src/urna/candidatos.ts', import.meta.url), 'utf8');
  const doApp = [...app.matchAll(/numero: (\d+),/g)].map((m) => Number(m[1]));
  assert.deepEqual(doApp, NUMEROS);
});

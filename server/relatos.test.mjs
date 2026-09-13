import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco } from './banco.mjs';
import { criarConta, ErroDeConta } from './contas.mjs';
import { relatar, limparContexto, POR_HORA, SEM_CONTA_POR_HORA, REGISTRO_MAXIMO, TEXTO_MAXIMO } from './relatos.mjs';
import { buscar } from './repositorios/relatos.mjs';

const recusa = (status, texto) => (e) => {
  assert.ok(e instanceof ErroDeConta, `veio outra coisa: ${e?.stack ?? e}`);
  assert.equal(e.status, status, e.message);
  if (texto) assert.match(e.message, texto);
  return true;
};

function montar() {
  const db = abrirBanco(':memory:');
  const usuario = criarConta(db, { apelido: 'juninho', senha: 'segredo123', senhaRepetida: 'segredo123' });
  return { db, usuario };
}

test('um relato de erro fica guardado como novo, com o contexto e o registro', () => {
  const { db, usuario } = montar();
  const { id } = relatar(db, usuario, {
    tipo: 'erro', texto: '  o som do Juninho sumiu  ', registro: 'linha 1\nlinha 2',
    contexto: { versao: '0.50.0', sistema: 'darwin', servidor: 'CORNUME', tela: 'sala Geral', lixo: 'x' },
  }, 1000);
  const linha = buscar(db, id);
  assert.equal(linha.usuario_id, usuario.id);
  assert.equal(linha.tipo, 'erro');
  assert.equal(linha.texto, 'o som do Juninho sumiu');
  assert.equal(linha.estado, 'novo');
  assert.equal(linha.registro, 'linha 1\nlinha 2');
  assert.equal(linha.decidido_por, null);
  assert.deepEqual(JSON.parse(linha.contexto), { versao: '0.50.0', sistema: 'darwin', servidor: 'CORNUME', tela: 'sala Geral' });
});

test('recusa tipo desconhecido, texto vazio e texto grande demais', () => {
  const { db, usuario } = montar();
  assert.throws(() => relatar(db, usuario, { tipo: 'elogio', texto: 'oi oi oi' }), recusa(400));
  assert.throws(() => relatar(db, usuario, { tipo: 'melhoria', texto: '  ' }), recusa(400));
  assert.throws(() => relatar(db, usuario, { tipo: 'melhoria', texto: 'x'.repeat(TEXTO_MAXIMO + 1) }), recusa(400));
});

test('o registro guarda o FIM quando é grande, e melhoria sem registro fica sem', () => {
  const { db, usuario } = montar();
  const grande = 'a'.repeat(REGISTRO_MAXIMO) + 'o que acabou de acontecer';
  const { id } = relatar(db, usuario, { tipo: 'erro', texto: 'caiu tudo', registro: grande });
  const linha = buscar(db, id);
  assert.equal(linha.registro.length, REGISTRO_MAXIMO);
  assert.ok(linha.registro.endsWith('o que acabou de acontecer'));
  assert.equal(buscar(db, relatar(db, usuario, { tipo: 'melhoria', texto: 'modo escuro mais escuro' }).id).registro, null);
});

test('sem conta também relata, e cada lado tem o seu teto por hora', () => {
  const { db, usuario } = montar();
  for (let i = 0; i < POR_HORA; i++) relatar(db, usuario, { tipo: 'erro', texto: `erro número ${i}` }, 10_000 + i);
  assert.throws(() => relatar(db, usuario, { tipo: 'erro', texto: 'mais um' }, 20_000), recusa(429));
  // Passada a hora, volta a poder.
  relatar(db, usuario, { tipo: 'erro', texto: 'depois da hora' }, 10_000 + 60 * 60_000 + 10);

  // Quem está sem conta não gasta o teto de quem tem, e vice-versa.
  const semConta = relatar(db, null, { tipo: 'erro', texto: 'não consigo entrar' }, 20_000);
  assert.equal(buscar(db, semConta.id).usuario_id, null);
  for (let i = 1; i < SEM_CONTA_POR_HORA; i++) relatar(db, null, { tipo: 'erro', texto: `sem conta ${i}` }, 20_000 + i);
  assert.throws(() => relatar(db, null, { tipo: 'erro', texto: 'mais um sem conta' }, 30_000), recusa(429));
});

test('limparContexto: só os campos conhecidos, e curtos', () => {
  assert.deepEqual(limparContexto(null), { versao: null, sistema: null, servidor: null, tela: null });
  assert.equal(limparContexto({ tela: 'x'.repeat(500) }).tela.length, 80);
  assert.equal(limparContexto({ versao: 42 }).versao, null);
});

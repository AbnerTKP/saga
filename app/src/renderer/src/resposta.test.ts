import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derrubouASessao, lerResposta, rotaQueNaoExiste } from './resposta.ts';

test('rota que não existe é o 404 genérico do roteador, e só ele', () => {
  // É o sinal de servidor antigo, que a administração e a recuperação de senha explicam.
  assert.equal(rotaQueNaoExiste(404, 'não encontrado'), true);
  assert.equal(rotaQueNaoExiste(404, 'Essa conta não existe.'), false, 'o 404 com motivo é resposta de verdade');
  assert.equal(rotaQueNaoExiste(500, 'não encontrado'), false);
});

test('resposta boa passa com os dados', () => {
  const r = lerResposta(true, 200, { cargos: [], membros: [] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.dados, { cargos: [], membros: [] });
});

test('200 com corpo pela metade é FALHA, não objeto vazio', () => {
  // Era isto que derrubava a tela: `{}` passava como sucesso, `cargos` vinha undefined
  // e o `cargos.slice()` da lista de pessoas estourava dentro do render.
  for (const corpo of [null, undefined, '', 'não sou json']) {
    const r = lerResposta(true, 200, corpo);
    assert.equal(r.ok, false, `${JSON.stringify(corpo)} passou como sucesso`);
    assert.equal(r.ok === false && r.status, 0, 'é do mesmo tipo de "não falei com o servidor"');
  }
});

test('erro do servidor mantém a mensagem e o tipo que ele mandou', () => {
  const r = lerResposta(false, 403, { error: 'Seu cargo não permite.', tipo: 'erro' });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.mensagem, 'Seu cargo não permite.');
  assert.equal(r.ok === false && r.status, 403);
});

test('erro sem corpo legível continua sendo erro, pelo status', () => {
  const r = lerResposta(false, 502, null);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.mensagem, 'erro 502');
  assert.equal(r.ok === false && r.status, 502, 'o status não pode virar 0: 502 é do servidor');
});

test('o convite do Berserk continua chegando como convite', () => {
  const r = lerResposta(false, 403, { error: 'Isso é do Berserk.', tipo: 'turbo' });
  assert.equal(r.ok === false && r.tipo, 'turbo');
});

test('só o 401 derruba a sessão: senha errada, código errado e rede caída, não', () => {
  // 403 é a senha atual ou a do dono errada, 400 é o código de senha errado: quem só errou
  // uma digitação não pode ir parar na tela de entrar.
  assert.equal(derrubouASessao({ status: 401, message: 'Faça login novamente.' }), true);
  for (const erro of [{ status: 403 }, { status: 400 }, { status: 404 }, { status: 0 }, { status: '401' },
    new Error('sem status'), null, undefined, 'Faça login novamente.']) {
    assert.equal(derrubouASessao(erro), false, JSON.stringify(erro));
  }
});

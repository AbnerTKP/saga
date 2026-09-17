import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco } from './banco.mjs';
import {
  criarConta, entrar, usuarioDaSessao, sair, senhaConfere, buscarPorApelido, esquecerAnotacoes, trocarSenha,
  ErroDeConta, emitirCodigoDeRecuperacao, recuperarSenha, trocarMinhaSenha, codigosPendentes,
  criarContaEEntrar, VALIDADE_DO_CODIGO,
} from './contas.mjs';

const novo = () => abrirBanco(':memory:');
const conta = (db, apelido = 'abner', senha = 'segredo123') =>
  criarConta(db, { apelido, senha, senhaRepetida: senha });

test('cria conta e encontra pelo apelido', () => {
  const db = novo();
  const u = conta(db);
  assert.equal(u.apelido, 'abner');
  assert.equal(buscarPorApelido(db, 'ABNER').id, u.id, 'a busca tem de ignorar maiúsculas');
});

test('a senha não fica guardada em texto', () => {
  const db = novo();
  const u = conta(db, 'abner', 'segredo123');
  assert.ok(!u.senha_hash.includes('segredo123'));
  assert.match(u.senha_hash, /^scrypt\$/);
  assert.equal(senhaConfere('segredo123', u.senha_hash), true);
  assert.equal(senhaConfere('segredo124', u.senha_hash), false);
});

test('apelido repetido é recusado, mesmo trocando maiúsculas', () => {
  const db = novo();
  conta(db, 'abner');
  assert.throws(() => conta(db, 'AbNeR'), /já está em uso/);
});

test('apelido inválido é recusado', () => {
  const db = novo();
  for (const ruim of ['ab', 'com espaço', 'x'.repeat(25), '', 'tem/barra']) {
    assert.throws(() => conta(db, ruim), /apelido/i, `aceitou "${ruim}"`);
  }
});

test('apelido com acento é aceito', () => {
  const db = novo();
  assert.equal(conta(db, 'joão').apelido, 'joão');
});

test('senha curta e senhas diferentes são recusadas', () => {
  const db = novo();
  assert.throws(() => criarConta(db, { apelido: 'ana', senha: '123', senhaRepetida: '123' }), /pelo menos/);
  assert.throws(() => criarConta(db, { apelido: 'ana', senha: 'segredo123', senhaRepetida: 'outra12345' }), /não são iguais/);
});

test('entrar com senha certa devolve token; com errada, não', () => {
  const db = novo();
  conta(db, 'abner', 'segredo123');
  const { token, usuario } = entrar(db, { apelido: 'abner', senha: 'segredo123' });
  assert.ok(token && token.length > 20);
  assert.equal(usuario.apelido, 'abner');
  assert.throws(() => entrar(db, { apelido: 'abner', senha: 'errada' }), /incorretos/);
});

test('apelido inexistente dá a mesma mensagem que senha errada', () => {
  // Mensagens diferentes entregariam quais apelidos existem.
  const db = novo();
  conta(db, 'abner', 'segredo123');
  const a = (() => { try { entrar(db, { apelido: 'abner', senha: 'x' }); } catch (e) { return e.message; } })();
  const b = (() => { try { entrar(db, { apelido: 'ninguem', senha: 'x' }); } catch (e) { return e.message; } })();
  assert.equal(a, b);
});

test('a sessão sobrevive: o app abre já logado', () => {
  const db = novo();
  conta(db, 'abner');
  const { token } = entrar(db, { apelido: 'abner', senha: 'segredo123' });
  assert.equal(usuarioDaSessao(db, token).apelido, 'abner');
  assert.equal(usuarioDaSessao(db, token).apelido, 'abner', 'continua válida ao reabrir');
});

test('token inválido, vazio ou nulo não autentica', () => {
  const db = novo();
  conta(db, 'abner');
  for (const ruim of ['', null, undefined, 'inventado']) {
    assert.equal(usuarioDaSessao(db, ruim), null, `aceitou ${JSON.stringify(ruim)}`);
  }
});

test('o token guardado no banco não é o token em si', () => {
  const db = novo();
  conta(db, 'abner');
  const { token } = entrar(db, { apelido: 'abner', senha: 'segredo123' });
  const guardados = db.prepare('SELECT token_hash FROM sessoes').all().map((r) => r.token_hash);
  assert.ok(!guardados.includes(token), 'o token cru foi parar no banco');
});

test('sair encerra só aquela sessão', () => {
  // Não existe mais "derrubar todas": era o que banir e expulsar usavam, e banimento é de
  // um servidor, não da conta — ver membros.mjs.
  const db = novo();
  conta(db, 'abner');
  const a = entrar(db, { apelido: 'abner', senha: 'segredo123' }).token;
  const b = entrar(db, { apelido: 'abner', senha: 'segredo123' }).token;
  sair(db, a);
  assert.equal(usuarioDaSessao(db, a), null);
  assert.ok(usuarioDaSessao(db, b), 'a outra sessão caiu junto');
});

test('apagar o usuário leva as sessões junto', () => {
  const db = novo();
  const u = conta(db, 'abner');
  const { token } = entrar(db, { apelido: 'abner', senha: 'segredo123' });
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(u.id);
  assert.equal(usuarioDaSessao(db, token), null);
});


test('vista_em é anotado uma vez por minuto, não a cada pedido', () => {
  // Era a cada pedido autenticado, e o app faz um a cada 4 s por pessoa: uma transação
  // de escrita com fsync por pedido. Medido na produção, o servidor escrevia 3,5 MB/s e
  // a máquina passava metade do tempo esperando disco — para um campo que ninguém lê.
  const db = abrirBanco(':memory:');
  esquecerAnotacoes();
  const u = criarConta(db, { apelido: 'ana', senha: 'segredo123', senhaRepetida: 'segredo123' });
  const { token } = entrar(db, { apelido: 'ana', senha: 'segredo123' });

  const quando = () => db.prepare('SELECT vista_em FROM sessoes WHERE usuario_id = ?').get(u.id).vista_em;

  // A primeira chamada anota — é a que abre o minuto. As outras 49 não podem anotar.
  usuarioDaSessao(db, token);
  const primeiro = quando();
  for (let i = 0; i < 49; i++) assert.ok(usuarioDaSessao(db, token), 'a sessão parou de valer');
  assert.equal(quando(), primeiro, '49 pedidos mexeram no banco; nenhum devia ter mexido');

  // Passado o minuto, ele anota de novo — o campo não congela para sempre.
  db.prepare('UPDATE sessoes SET vista_em = ? WHERE usuario_id = ?').run(1, u.id);
  esquecerAnotacoes();
  usuarioDaSessao(db, token);
  assert.notEqual(quando(), 1, 'depois do intervalo, devia ter anotado');
});


test('trocar a senha faz a nova entrar e a antiga parar de entrar', () => {
  const db = novo();
  const u = criarConta(db, { apelido: 'ana', senha: 'segredo123', senhaRepetida: 'segredo123' });
  trocarSenha(db, u.id, 'outrasenha456');
  assert.throws(() => entrar(db, { apelido: 'ana', senha: 'segredo123' }), /senha/i);
  assert.ok(entrar(db, { apelido: 'ana', senha: 'outrasenha456' }).token);
});

test('a senha nova passa pela mesma régua de tamanho do cadastro', () => {
  const db = novo();
  const u = criarConta(db, { apelido: 'ana', senha: 'segredo123', senhaRepetida: 'segredo123' });
  assert.throws(() => trocarSenha(db, u.id, 'curta'), /pelo menos/);
  assert.throws(() => trocarSenha(db, 999, 'senhalonga123'), /não existe/);
  // Número passava da conta de tamanho e o scrypt lançava lá dentro: um 500, e não um não.
  assert.throws(() => trocarSenha(db, u.id, 12345678), (e) => e instanceof ErroDeConta && e.status === 400);
});

test('cadastrar já entra: a sessão devolvida vale, e é uma só', () => {
  const db = novo();
  const { usuario, token } = criarContaEEntrar(db, { apelido: 'ana', senha: 'segredo123', senhaRepetida: 'segredo123' });
  assert.equal(usuario.apelido, 'ana');
  assert.equal(usuarioDaSessao(db, token)?.id, usuario.id);
  assert.equal(db.prepare('SELECT count(*) c FROM sessoes').get().c, 1);
  assert.throws(() => criarContaEEntrar(db, null), /apelido/);
});

// --- recuperar e trocar a senha -----------------------------------------------

const RECUSA = { status: 400, mensagem: 'Código inválido ou vencido. Peça outro.' };
const SENHA_NOVA = 'novasenha789';

/** O que foi recusado, e com que status. Erro que não é de conta é erro de programa — um 500. */
function recusaDe(fn) {
  try { fn(); } catch (e) {
    assert.ok(e instanceof ErroDeConta, `virou erro de programa: ${e}`);
    return { status: e.status, mensagem: e.message };
  }
  return assert.fail('devia ter recusado');
}

/** O dono da Saga, a ana, e um código emitido para ela. */
function comCodigo() {
  const db = novo();
  const dono = conta(db, 'abner');
  const ana = conta(db, 'ana');
  return { db, dono, ana, ...emitirCodigoDeRecuperacao(db, ana.id, dono.id) };
}

const recuperar = (db, codigo, { apelido = 'ana', senha = SENHA_NOVA, senhaRepetida = senha } = {}) =>
  recuperarSenha(db, { apelido, codigo, senha, senhaRepetida });

const linhaDe = (db, u) => db.prepare('SELECT * FROM recuperacoes WHERE usuario_id = ?').get(u.id);
const vencer = (db, u) =>
  db.prepare('UPDATE recuperacoes SET expira_em = ? WHERE usuario_id = ?').run(Date.now() - 1, u.id);

// Um código que não é o emitido. A chance de o sorteado ser justamente este é de 1 em 2⁴⁰.
const outroQue = (codigo) => (codigo === 'AAAA-AAAA' ? 'BBBB-BBBB' : 'AAAA-AAAA');

test('o código do dono troca a senha: a antiga para, a nova entra, e a sessão devolvida vale', () => {
  const { db, ana, codigo, expiraEm, apelido } = comCodigo();
  // O alfabeto dos convites, sem O, 0, I nem 1, em dois pedaços para ditar.
  assert.match(codigo, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(apelido, 'ana');
  assert.ok(Math.abs(expiraEm - (Date.now() + 60 * 60_000)) < 5_000, 'o código devia valer uma hora');

  const { usuario, token } = recuperar(db, codigo);
  assert.equal(usuario.id, ana.id);
  assert.ok(senhaConfere(SENHA_NOVA, usuario.senha_hash), 'a conta devolvida é a de antes da troca');
  assert.equal(usuarioDaSessao(db, token)?.id, ana.id, 'a sessão devolvida não vale');
  assert.throws(() => entrar(db, { apelido: 'ana', senha: 'segredo123' }), /incorretos/);
  assert.ok(entrar(db, { apelido: 'ana', senha: SENHA_NOVA }).token);
});

test('recuperar derruba todas as sessões que a conta tinha', () => {
  // Inclusive a de quem entrou com a senha antiga, que pode ser justamente o motivo da troca.
  const { db, codigo } = comCodigo();
  const antigas = [1, 2].map(() => entrar(db, { apelido: 'ana', senha: 'segredo123' }).token);
  const { token } = recuperar(db, codigo);
  for (const t of antigas) assert.equal(usuarioDaSessao(db, t), null, 'uma sessão de antes continuou valendo');
  assert.ok(usuarioDaSessao(db, token));
  assert.equal(db.prepare('SELECT count(*) c FROM sessoes').get().c, 1);
});

test('o código serve uma vez só', () => {
  const { db, codigo } = comCodigo();
  recuperar(db, codigo);
  assert.deepEqual(recusaDe(() => recuperar(db, codigo, { senha: 'maisumasenha1' })), RECUSA);
  assert.ok(entrar(db, { apelido: 'ana', senha: SENHA_NOVA }).token, 'a segunda tentativa mexeu na senha');
});

test('código vencido é recusado, e a linha vencida sai do banco', () => {
  const { db, ana, codigo } = comCodigo();
  vencer(db, ana);
  assert.deepEqual(recusaDe(() => recuperar(db, codigo)), RECUSA);
  assert.equal(linhaDe(db, ana), undefined);
  assert.ok(entrar(db, { apelido: 'ana', senha: 'segredo123' }).token, 'a senha antiga devia continuar valendo');
});

test('uma hora é uma hora: no milissegundo do vencimento o código já não vale', (t) => {
  // O relógio é de mentira para a fronteira ser exata: "vale uma hora" quer dizer que às
  // 11:00:00.000 de um código das 10:00 ele não serve mais — e um milissegundo antes, sim.
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const { db, dono, ana, codigo, expiraEm } = comCodigo();
  assert.equal(expiraEm, 1_000_000 + VALIDADE_DO_CODIGO);

  t.mock.timers.setTime(expiraEm);
  assert.deepEqual(recusaDe(() => recuperar(db, codigo)), RECUSA);

  const { codigo: outro, expiraEm: ate } = emitirCodigoDeRecuperacao(db, ana.id, dono.id);
  t.mock.timers.setTime(ate - 1);
  assert.ok(recuperar(db, outro).token, 'um milissegundo antes de vencer, o código devia valer');
});

test('gerar outro código invalida o anterior, e o freio recomeça', () => {
  const { db, dono, ana, codigo: primeiro } = comCodigo();
  recusaDe(() => recuperar(db, outroQue(primeiro)));
  assert.equal(linhaDe(db, ana).erros, 1);

  const { codigo: segundo } = emitirCodigoDeRecuperacao(db, ana.id, dono.id);
  assert.equal(db.prepare('SELECT count(*) c FROM recuperacoes').get().c, 1, 'um código ativo por conta');
  assert.equal(linhaDe(db, ana).erros, 0, 'os erros eram contra o código velho');
  assert.deepEqual(recusaDe(() => recuperar(db, primeiro)), RECUSA);
  assert.ok(recuperar(db, segundo).token);
});

test('quatro erros ainda deixam o código certo passar', () => {
  const { db, ana, codigo } = comCodigo();
  for (let i = 0; i < 4; i++) recusaDe(() => recuperar(db, outroQue(codigo)));
  assert.equal(linhaDe(db, ana).erros, 4);
  assert.ok(recuperar(db, codigo).token);
});

test('cinco erros matam o código: depois nem o certo passa, e a senha continua entrando', () => {
  // O freio é do código, não da conta: errar o código não tranca o login de ninguém.
  const { db, ana, codigo } = comCodigo();
  for (let i = 0; i < 5; i++) assert.deepEqual(recusaDe(() => recuperar(db, outroQue(codigo))), RECUSA);
  assert.equal(linhaDe(db, ana), undefined, 'o quinto erro devia ter apagado o código');
  assert.deepEqual(recusaDe(() => recuperar(db, codigo)), RECUSA);
  assert.ok(entrar(db, { apelido: 'ana', senha: 'segredo123' }).token, 'errar o código trancou o login');
});

test('o código morto por erros é contado a quem anota o registro, uma vez, e só ele', () => {
  // Quem pede lê a mesma recusa; é por aqui que a rota anota "morreu depois de 5 erros", e
  // o dono separa quem digitou errado de quem está queimando os códigos da conta.
  const { db, dono, ana, codigo } = comCodigo();
  const mortos = [];
  const aoEsgotar = (conta) => mortos.push(conta.apelido);
  const chutar = (c) => recusaDe(() => recuperarSenha(db, { apelido: 'ana', codigo: c, senha: SENHA_NOVA, senhaRepetida: SENHA_NOVA }, { aoEsgotar }));

  for (let i = 0; i < 4; i++) chutar(outroQue(codigo));
  assert.deepEqual(mortos, [], 'quatro erros ainda não matam o código');
  assert.deepEqual(chutar(outroQue(codigo)), RECUSA);
  assert.deepEqual(mortos, ['ana']);
  chutar(codigo);
  assert.deepEqual(mortos, ['ana'], 'a conta sem código não morre de novo');

  // Vencer não é ser queimado: não é o que o registro precisa separar.
  const { codigo: outro } = emitirCodigoDeRecuperacao(db, ana.id, dono.id);
  vencer(db, ana);
  chutar(outro);
  assert.deepEqual(mortos, ['ana']);
});

test('código que chega esgotado não passa nem certo, e sai do banco', () => {
  // Pelo caminho normal o quinto erro já apaga a linha, então ela não chega aqui com cinco;
  // isto confere a limpeza de entrada, que é o que segura um banco mexido à mão.
  const { db, ana, codigo } = comCodigo();
  db.prepare('UPDATE recuperacoes SET erros = 5 WHERE usuario_id = ?').run(ana.id);
  assert.deepEqual(recusaDe(() => recuperar(db, codigo)), RECUSA);
  assert.equal(linhaDe(db, ana), undefined);
  assert.ok(entrar(db, { apelido: 'ana', senha: 'segredo123' }).token, 'a senha mudou com um código esgotado');
});

test('a recusa é a mesma para apelido inexistente, conta sem código, código errado e vencido', () => {
  // Dizer qual é entregaria quem existe, e quem tem código pendente, a quem estiver chutando.
  const { db, dono, codigo } = comCodigo();
  conta(db, 'bia');
  const caio = conta(db, 'caio');
  const doCaio = emitirCodigoDeRecuperacao(db, caio.id, dono.id).codigo;
  vencer(db, caio);

  for (const recusa of [
    recusaDe(() => recuperar(db, codigo, { apelido: 'ninguem' })),
    recusaDe(() => recuperar(db, codigo, { apelido: 'bia' })),
    recusaDe(() => recuperar(db, outroQue(codigo))),
    recusaDe(() => recuperar(db, doCaio, { apelido: 'caio' })),
  ]) {
    assert.deepEqual(recusa, RECUSA);
  }
});

test('o código aceita minúsculas, espaços e hífen, do jeito que a pessoa digitar', () => {
  const { db, dono, ana } = comCodigo();
  const jeitos = [
    (c) => c.toLowerCase(),
    (c) => ` ${c.replace('-', ' ')} `,
    (c) => c.replace('-', ''),
    (c) => c.toLowerCase().split('').join(' '),
  ];
  for (const jeito of jeitos) {
    const { codigo } = emitirCodigoDeRecuperacao(db, ana.id, dono.id);
    assert.ok(recuperar(db, jeito(codigo)).token, `recusou "${jeito(codigo)}"`);
  }
});

test('senha nova curta ou repetida diferente não gasta tentativa nem consome o código', () => {
  const { db, ana, codigo } = comCodigo();
  assert.match(recusaDe(() => recuperar(db, codigo, { senha: 'curta' })).mensagem, /pelo menos/);
  assert.match(recusaDe(() => recuperar(db, codigo, { senhaRepetida: 'outra-coisa' })).mensagem, /não são iguais/);
  // Nem com o código errado junto: a senha nova é conferida antes de se olhar o código.
  assert.match(recusaDe(() => recuperar(db, outroQue(codigo), { senha: 'curta' })).mensagem, /pelo menos/);
  assert.equal(linhaDe(db, ana).erros, 0);
  assert.ok(recuperar(db, codigo).token);
});

test('o banco não guarda o código em texto', () => {
  const { db, ana, codigo } = comCodigo();
  const { codigo_hash: hash } = linhaDe(db, ana);
  const limpo = codigo.replace('-', '');
  assert.ok(!hash.includes(codigo) && !hash.includes(limpo), 'o código cru foi parar no banco');
  // O mesmo scrypt da senha, e não um sha256: 40 bits num hash rápido se quebram em minutos.
  assert.match(hash, /^scrypt\$/);
  assert.equal(senhaConfere(limpo, hash), true);
});

test('entrada que não é texto é recusada como qualquer outra, sem virar erro de programa', () => {
  const { db, codigo } = comCodigo();
  recusaDe(() => recuperarSenha(db, null));
  recusaDe(() => recuperarSenha(db, { apelido: 'ana', codigo, senha: 12345678, senhaRepetida: 12345678 }));
  recusaDe(() => recuperarSenha(db, { apelido: 'ana', codigo, senha: { a: 1 }, senhaRepetida: { a: 1 } }));
  for (const lixo of [12345678, { codigo }, null]) assert.deepEqual(recusaDe(() => recuperar(db, lixo)), RECUSA);
  assert.deepEqual(recusaDe(() => recuperar(db, codigo, { apelido: { ana: true } })), RECUSA);
  assert.ok(recuperar(db, codigo).token, 'o código certo devia continuar valendo');
});

/**
 * Um array com milhares de níveis: passa pelo `JSON.parse` e cabe no teto do corpo, mas
 * `String()` estoura a pilha nele — medido, a partir de uns 5000 níveis.
 */
const FUNDO = JSON.parse('['.repeat(20_000) + ']'.repeat(20_000));

test('array aninhado no corpo é só uma entrada errada, em todas as portas da conta', () => {
  const { db, ana, codigo } = comCodigo();
  assert.deepEqual(recusaDe(() => recuperar(db, codigo, { apelido: FUNDO })), RECUSA);
  assert.deepEqual(recusaDe(() => recuperar(db, FUNDO)), RECUSA);
  assert.equal(recusaDe(() => entrar(db, { apelido: FUNDO, senha: 'segredo123' })).status, 401);
  assert.equal(recusaDe(() => entrar(db, { apelido: 'ana', senha: FUNDO })).status, 401);
  assert.equal(recusaDe(() => criarConta(db, { apelido: FUNDO, senha: 'segredo123', senhaRepetida: 'segredo123' })).status, 400);

  const { token } = entrar(db, { apelido: 'ana', senha: 'segredo123' });
  assert.deepEqual(
    recusaDe(() => trocarMinhaSenha(db, token, { senhaAtual: FUNDO, senha: SENHA_NOVA, senhaRepetida: SENHA_NOVA })),
    { status: 403, mensagem: 'A senha atual não confere.' },
  );
  assert.ok(linhaDe(db, ana).erros < 5);
  assert.ok(recuperar(db, codigo).token, 'o código certo devia continuar valendo');
});

test('trocar a própria senha com a atual errada dá 403, e nada muda', () => {
  // 403, e não 401: o app lê 401 como "a sessão caiu" e deslogaria quem só errou a senha.
  const db = novo();
  conta(db, 'ana');
  const { token } = entrar(db, { apelido: 'ana', senha: 'segredo123' });
  const outra = entrar(db, { apelido: 'ana', senha: 'segredo123' }).token;
  const pedido = { senhaAtual: 'naoeessa', senha: SENHA_NOVA, senhaRepetida: SENHA_NOVA };
  assert.deepEqual(recusaDe(() => trocarMinhaSenha(db, token, pedido)), { status: 403, mensagem: 'A senha atual não confere.' });
  assert.ok(usuarioDaSessao(db, token) && usuarioDaSessao(db, outra), 'errar a senha atual derrubou sessão');
  assert.ok(entrar(db, { apelido: 'ana', senha: 'segredo123' }).token, 'a senha mudou com a atual errada');

  // Sem sessão, aí sim é 401; e a senha nova passa pela régua de sempre.
  const certa = { senhaAtual: 'segredo123', senha: SENHA_NOVA, senhaRepetida: SENHA_NOVA };
  assert.equal(recusaDe(() => trocarMinhaSenha(db, 'inventado', certa)).status, 401);
  assert.match(recusaDe(() => trocarMinhaSenha(db, token, { ...certa, senha: 'curta', senhaRepetida: 'curta' })).mensagem, /pelo menos/);
  assert.equal(recusaDe(() => trocarMinhaSenha(db, token, null)).status, 403);
  assert.ok(entrar(db, { apelido: 'ana', senha: 'segredo123' }).token);
});

test('trocar a própria senha derruba as outras sessões da conta e mantém a do pedido', () => {
  const db = novo();
  conta(db, 'ana');
  conta(db, 'bia');
  const [minha, ...outras] = [1, 2, 3].map(() => entrar(db, { apelido: 'ana', senha: 'segredo123' }).token);
  const daBia = entrar(db, { apelido: 'bia', senha: 'segredo123' }).token;

  const r = trocarMinhaSenha(db, minha, { senhaAtual: 'segredo123', senha: SENHA_NOVA, senhaRepetida: SENHA_NOVA });
  assert.deepEqual(r, { encerradas: 2 });
  assert.ok(usuarioDaSessao(db, minha), 'a sessão de quem trocou caiu');
  for (const t of outras) assert.equal(usuarioDaSessao(db, t), null, 'a sessão de outro lugar continuou');
  assert.ok(usuarioDaSessao(db, daBia), 'caiu sessão de outra conta');
  assert.throws(() => entrar(db, { apelido: 'ana', senha: 'segredo123' }), /incorretos/);
  assert.ok(entrar(db, { apelido: 'ana', senha: SENHA_NOVA }).token);
});

test('trocar a própria senha mata o código de senha pendente', () => {
  // Quem trocou com a atual encerrou o caso de quem não sabia a senha: o código que sobrasse
  // trocaria a senha de novo nas mãos de quem lesse a conversa, e derrubaria até esta sessão.
  const { db, ana, codigo } = comCodigo();
  const { token } = entrar(db, { apelido: 'ana', senha: 'segredo123' });
  trocarMinhaSenha(db, token, { senhaAtual: 'segredo123', senha: SENHA_NOVA, senhaRepetida: SENHA_NOVA });

  assert.equal(codigosPendentes(db).has(ana.id), false, 'o código continuou pendente');
  assert.deepEqual(recusaDe(() => recuperar(db, codigo, { senha: 'outrasenha000' })), RECUSA);
  assert.ok(usuarioDaSessao(db, token), 'a sessão de quem trocou caiu');
  assert.ok(entrar(db, { apelido: 'ana', senha: SENHA_NOVA }).token);
});

test('apagar a conta leva o código dela junto; apagar quem gerou não apaga o de ninguém', () => {
  const { db, dono, ana } = comCodigo();
  const bia = conta(db, 'bia');
  emitirCodigoDeRecuperacao(db, bia.id, dono.id);
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(ana.id);
  assert.equal(linhaDe(db, ana), undefined, 'o código da conta apagada ficou para trás');
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(dono.id);
  assert.equal(linhaDe(db, bia)?.criado_por, null, 'apagar quem gerou devia só esquecer quem foi');
});

test('só conta como pendente o código que ainda serve', () => {
  const db = novo();
  const dono = conta(db, 'abner');
  const [ana, bia, caio] = ['ana', 'bia', 'caio'].map((a) => conta(db, a));
  const { expiraEm } = emitirCodigoDeRecuperacao(db, ana.id, dono.id);
  emitirCodigoDeRecuperacao(db, bia.id, dono.id);
  emitirCodigoDeRecuperacao(db, caio.id, dono.id);
  vencer(db, bia);
  db.prepare('UPDATE recuperacoes SET erros = 5 WHERE usuario_id = ?').run(caio.id);   // esgotado
  assert.deepEqual([...codigosPendentes(db)], [[ana.id, expiraEm]]);
  // `agora` por parâmetro: passada a hora, nem o da ana conta.
  assert.equal(codigosPendentes(db, expiraEm).size, 0);
});

test('código para conta que não existe é 404', () => {
  const db = novo();
  const dono = conta(db, 'abner');
  assert.equal(recusaDe(() => emitirCodigoDeRecuperacao(db, 9999, dono.id)).status, 404);
  assert.equal(recusaDe(() => emitirCodigoDeRecuperacao(db, 'abc', dono.id)).status, 404);
});

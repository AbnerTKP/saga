// O e-mail da conta, nas regras: o endereço só entra na conta confirmado, o código tem o
// mesmo freio do código de senha, e o "esqueci a senha" não conta a ninguém quem existe.
//
// Em arquivo próprio porque contas.test.mjs já é o da senha e das sessões — e porque o que
// se tranca aqui é um contrato à parte: nenhum caminho grava um endereço que não provou
// receber.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco } from './banco.mjs';
import {
  criarConta, criarContaEEntrar, buscarPorId, pedirEmail, confirmarEmail, emailPendente, desistirDoEmail,
  normalizarEmail, pedirCodigoDeSenha, recuperarSenha, entrar, ErroDeConta, emitirCodigoDeRecuperacao,
  VALIDADE_DO_CODIGO, ERROS_POR_CODIGO, INTERVALO_ENTRE_CODIGOS,
} from './contas.mjs';

const novo = () => abrirBanco(':memory:');
const conta = (db, apelido = 'abner', senha = 'segredo123') =>
  criarConta(db, { apelido, senha, senhaRepetida: senha });

/** Pede e confirma: a conta sai com o e-mail valendo. */
function comEmail(db, usuario, endereco) {
  const { codigo } = pedirEmail(db, usuario.id, endereco);
  return confirmarEmail(db, usuario.id, codigo);
}

const recusa = (fn, status, trecho) => assert.throws(fn, (e) =>
  e instanceof ErroDeConta && e.status === status && (!trecho || e.message.includes(trecho)));

// --- o endereço -------------------------------------------------------------

test('o endereço é guardado sem espaço em volta e em minúsculas', () => {
  assert.equal(normalizarEmail('  Abner.TKP@Gmail.COM '), 'abner.tkp@gmail.com');
  // O que não é texto vira vazio, e não um erro de programa.
  assert.equal(normalizarEmail(5), '');
  assert.equal(normalizarEmail([['a@b.com']]), '');
});

test('endereço sem cara de e-mail é recusado antes de gerar código', () => {
  const db = novo();
  const u = conta(db);
  for (const ruim of ['', '   ', 'abner', 'abner@', '@gmail.com', 'abner@gmail', 'ab ner@gmail.com', null, 7, {}]) {
    recusa(() => pedirEmail(db, u.id, ruim), 400);
  }
  recusa(() => pedirEmail(db, u.id, `${'a'.repeat(250)}@x.com`), 400);
  assert.equal(emailPendente(db, u.id), null, 'recusa não pode deixar pendente para trás');
});

// --- confirmar ---------------------------------------------------------------

test('o e-mail só vai para a conta quando o código volta certo', () => {
  const db = novo();
  const u = conta(db);
  const { codigo, email } = pedirEmail(db, u.id, 'Abner@Gmail.com');

  assert.equal(email, 'abner@gmail.com');
  assert.equal(buscarPorId(db, u.id).email, null, 'pedir não pode gravar o endereço na conta');
  assert.deepEqual(emailPendente(db, u.id)?.email, 'abner@gmail.com');

  const depois = confirmarEmail(db, u.id, codigo);
  assert.equal(depois.email, 'abner@gmail.com');
  assert.equal(emailPendente(db, u.id), null, 'confirmado, o pendente sai');
});

test('o código aceita minúsculas, espaço e hífen, como o de senha', () => {
  const db = novo();
  const u = conta(db);
  const { codigo } = pedirEmail(db, u.id, 'abner@gmail.com');
  const digitado = ` ${codigo.slice(0, 4).toLowerCase()} - ${codigo.slice(4)} `;
  assert.equal(confirmarEmail(db, u.id, digitado).email, 'abner@gmail.com');
});

test('o banco não guarda o código em texto', () => {
  const db = novo();
  const u = conta(db);
  const { codigo } = pedirEmail(db, u.id, 'abner@gmail.com');
  const linha = db.prepare('SELECT * FROM emails_pendentes WHERE usuario_id = ?').get(u.id);
  assert.ok(!JSON.stringify(linha).includes(codigo));
  assert.match(linha.codigo_hash, /^scrypt\$/);
});

test('código errado não confirma; o quinto erro mata o código, e nem o certo passa depois', () => {
  const db = novo();
  const u = conta(db);
  const { codigo } = pedirEmail(db, u.id, 'abner@gmail.com');

  for (let i = 1; i < ERROS_POR_CODIGO; i++) recusa(() => confirmarEmail(db, u.id, 'ZZZZZZZZ'), 400);
  // Quatro erros ainda deixam o certo passar numa cópia do mesmo estado? Aqui vai o quinto.
  recusa(() => confirmarEmail(db, u.id, 'ZZZZZZZZ'), 400);
  recusa(() => confirmarEmail(db, u.id, codigo), 400);
  assert.equal(buscarPorId(db, u.id).email, null);
  assert.equal(emailPendente(db, u.id), null);
});

test('quatro erros ainda deixam o código certo confirmar', () => {
  const db = novo();
  const u = conta(db);
  const { codigo } = pedirEmail(db, u.id, 'abner@gmail.com');
  for (let i = 1; i < ERROS_POR_CODIGO; i++) recusa(() => confirmarEmail(db, u.id, 'ZZZZZZZZ'), 400);
  assert.equal(confirmarEmail(db, u.id, codigo).email, 'abner@gmail.com');
});

test('código vencido não confirma, e a linha vencida sai do banco', (t) => {
  const db = novo();
  const u = conta(db);
  const { codigo } = pedirEmail(db, u.id, 'abner@gmail.com');
  const agora = Date.now();
  t.mock.method(Date, 'now', () => agora + VALIDADE_DO_CODIGO + 1);
  recusa(() => confirmarEmail(db, u.id, codigo), 400);
  assert.equal(db.prepare('SELECT count(*) c FROM emails_pendentes').get().c, 0);
});

test('pedir de novo — ou para outro endereço — invalida o código anterior', () => {
  const db = novo();
  const u = conta(db);
  const primeiro = pedirEmail(db, u.id, 'errado@gmail.com');
  const segundo = pedirEmail(db, u.id, 'certo@gmail.com');
  recusa(() => confirmarEmail(db, u.id, primeiro.codigo), 400);
  assert.equal(confirmarEmail(db, u.id, segundo.codigo).email, 'certo@gmail.com');
});

test('desistir apaga o pendente: a tela volta a pedir o endereço, e o código velho morre', () => {
  const db = novo();
  const u = conta(db);
  const { codigo } = pedirEmail(db, u.id, 'errado@gmail.com');
  desistirDoEmail(db, u.id);
  assert.equal(emailPendente(db, u.id), null);
  recusa(() => confirmarEmail(db, u.id, codigo), 400);
});

test('conta sem pedido nenhum recebe a mesma recusa de código errado', () => {
  const db = novo();
  const u = conta(db);
  recusa(() => confirmarEmail(db, u.id, 'ABCDEFGH'), 400, 'Código inválido');
});

// --- um endereço, uma conta --------------------------------------------------

test('endereço confirmado por uma conta é recusado para outra, com motivo', () => {
  const db = novo();
  const a = conta(db, 'abner');
  const b = conta(db, 'tava1');
  comEmail(db, a, 'abner@gmail.com');
  recusa(() => pedirEmail(db, b.id, 'ABNER@gmail.com'), 409, 'outra conta');
});

test('endereço esperando confirmação noutra conta também é recusado', () => {
  const db = novo();
  const a = conta(db, 'abner');
  const b = conta(db, 'tava1');
  pedirEmail(db, a.id, 'abner@gmail.com');
  recusa(() => pedirEmail(db, b.id, 'abner@gmail.com'), 409);
});

test('pedir o próprio endereço de novo não é "de outra conta"', () => {
  const db = novo();
  const a = conta(db, 'abner');
  comEmail(db, a, 'abner@gmail.com');
  assert.doesNotThrow(() => pedirEmail(db, a.id, 'abner@gmail.com'));
});

test('duas contas esperando o mesmo endereço: a segunda a confirmar leva 409, e não erro de banco', (t) => {
  const db = novo();
  const a = conta(db, 'abner');
  const b = conta(db, 'tava1');
  // O freio de "pendente noutra conta" só olha pedidos que valem: com o de A vencido, B
  // consegue pedir o mesmo endereço. A então pede de novo, e os dois têm código na mão.
  const agora = Date.now();
  const pedidoDeA = pedirEmail(db, a.id, 'mesmo@gmail.com');
  t.mock.method(Date, 'now', () => agora + VALIDADE_DO_CODIGO + 1);
  const pedidoDeB = pedirEmail(db, b.id, 'mesmo@gmail.com');
  // A volta a valer no banco à mão, como se tivesse pedido antes de B confirmar.
  db.prepare('UPDATE emails_pendentes SET expira_em = ? WHERE usuario_id = ?').run(agora + 10 * VALIDADE_DO_CODIGO, a.id);
  assert.equal(confirmarEmail(db, b.id, pedidoDeB.codigo).email, 'mesmo@gmail.com');
  recusa(() => confirmarEmail(db, a.id, pedidoDeA.codigo), 409, 'outra conta');
  assert.equal(buscarPorId(db, a.id).email, null);
});

// --- cadastro ------------------------------------------------------------------

test('sem envio de e-mail, o cadastro é o de sempre e ignora o campo', () => {
  const db = novo();
  const u = criarConta(db, { apelido: 'abner', senha: 'segredo123', senhaRepetida: 'segredo123', email: 'lixo' });
  assert.equal(u.email, null);
  assert.equal(emailPendente(db, u.id), null);
});

test('com envio ligado, cadastro sem e-mail — ou com e-mail torto — não cria conta', () => {
  const db = novo();
  const pedido = { apelido: 'abner', senha: 'segredo123', senhaRepetida: 'segredo123' };
  recusa(() => criarConta(db, pedido, { pedeEmail: true }), 400, 'e-mail');
  recusa(() => criarConta(db, { ...pedido, email: 'abner' }, { pedeEmail: true }), 400);
  assert.equal(db.prepare('SELECT count(*) c FROM usuarios').get().c, 0, 'recusado, o apelido não pode ficar tomado');
});

test('o e-mail é conferido na ordem dos campos: apelido, e-mail, senha', () => {
  const db = novo();
  recusa(() => criarConta(db, { apelido: 'a', email: 'x', senha: '1' }, { pedeEmail: true }), 400, 'apelido');
  recusa(() => criarConta(db, { apelido: 'abner', email: 'x', senha: '1' }, { pedeEmail: true }), 400, 'e-mail');
});

test('cadastro com e-mail já confirmado por outra conta é recusado antes de criar', () => {
  const db = novo();
  comEmail(db, conta(db, 'tava1'), 'tava@gmail.com');
  recusa(() => criarConta(db, {
    apelido: 'abner', senha: 'segredo123', senhaRepetida: 'segredo123', email: 'tava@gmail.com',
  }, { pedeEmail: true }), 409);
  assert.equal(db.prepare('SELECT count(*) c FROM usuarios').get().c, 1);
});

test('cadastrar com envio ligado devolve o endereço limpo para a rota mandar o código', () => {
  const db = novo();
  const r = criarContaEEntrar(db, {
    apelido: 'abner', senha: 'segredo123', senhaRepetida: 'segredo123', email: ' Abner@Gmail.com ',
  }, { pedeEmail: true });
  assert.equal(r.email, 'abner@gmail.com');
  assert.equal(buscarPorId(db, r.usuario.id).email, null, 'o cadastro não grava o endereço cru');
});

// --- esqueci a senha, pelo e-mail -------------------------------------------------

test('o código de senha sai pelo apelido ou pelo e-mail, e troca a senha como o do dono', () => {
  const db = novo();
  const u = conta(db, 'abner');
  comEmail(db, u, 'abner@gmail.com');

  const pelo = pedirCodigoDeSenha(db, 'ABNER');
  assert.equal(pelo.conta.id, u.id);
  assert.equal(pelo.email, 'abner@gmail.com');

  const { token } = recuperarSenha(db, {
    apelido: 'abner', codigo: pelo.codigo, senha: 'nova-senha', senhaRepetida: 'nova-senha',
  });
  assert.ok(token);
  assert.ok(entrar(db, { apelido: 'abner', senha: 'nova-senha' }).token);
});

test('pelo e-mail, com maiúsculas e espaços, acha a mesma conta', (t) => {
  const db = novo();
  const u = conta(db, 'abner');
  comEmail(db, u, 'abner@gmail.com');
  const agora = Date.now();
  t.mock.method(Date, 'now', () => agora);
  assert.equal(pedirCodigoDeSenha(db, '  Abner@GMAIL.com ', agora)?.conta.id, u.id);
});

test('apelido que não existe, conta sem e-mail e entrada que não é texto devolvem nada — sem erro', () => {
  const db = novo();
  conta(db, 'semmail');
  assert.equal(pedirCodigoDeSenha(db, 'ninguem'), null);
  assert.equal(pedirCodigoDeSenha(db, 'ninguem@gmail.com'), null);
  assert.equal(pedirCodigoDeSenha(db, 'semmail'), null);
  assert.equal(pedirCodigoDeSenha(db, ''), null);
  assert.equal(pedirCodigoDeSenha(db, [['abner']]), null);
  assert.equal(pedirCodigoDeSenha(db, null), null);
});

test('endereço só PENDENTE não recebe código de senha: ele ainda não provou que é da pessoa', () => {
  const db = novo();
  const u = conta(db, 'abner');
  pedirEmail(db, u.id, 'abner@gmail.com');
  assert.equal(pedirCodigoDeSenha(db, 'abner'), null);
  assert.equal(pedirCodigoDeSenha(db, 'abner@gmail.com'), null);
});

test('dois pedidos seguidos mandam um código só; passado o intervalo, sai outro', () => {
  const db = novo();
  const u = conta(db, 'abner');
  comEmail(db, u, 'abner@gmail.com');
  const agora = Date.now();

  const primeiro = pedirCodigoDeSenha(db, 'abner', agora);
  assert.ok(primeiro);
  assert.equal(pedirCodigoDeSenha(db, 'abner', agora + INTERVALO_ENTRE_CODIGOS - 1), null);

  // O código da primeira vez continua valendo: é ele que está na caixa.
  const segundo = pedirCodigoDeSenha(db, 'abner', agora + INTERVALO_ENTRE_CODIGOS);
  assert.ok(segundo);
  assert.notEqual(segundo.codigo, primeiro.codigo);
});

test('o código emitido pelo e-mail não tem "quem gerou": não foi o dono', () => {
  const db = novo();
  const u = conta(db, 'abner');
  comEmail(db, u, 'abner@gmail.com');
  pedirCodigoDeSenha(db, 'abner');
  assert.equal(db.prepare('SELECT criado_por FROM recuperacoes WHERE usuario_id = ?').get(u.id).criado_por, null);
});

test('apagar a conta leva o pedido de e-mail junto', () => {
  const db = novo();
  const u = conta(db, 'abner');
  pedirEmail(db, u.id, 'abner@gmail.com');
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(u.id);
  assert.equal(db.prepare('SELECT count(*) c FROM emails_pendentes').get().c, 0);
});

test('trocar a senha aceita o e-mail no lugar do apelido — é o que a tela manda quando a pessoa digitou o e-mail', () => {
  const db = novo();
  const u = conta(db, 'abner');
  comEmail(db, u, 'abner@gmail.com');
  const { codigo } = pedirCodigoDeSenha(db, 'Abner@Gmail.com');
  const { usuario } = recuperarSenha(db, {
    apelido: ' ABNER@gmail.com ', codigo, senha: 'nova-senha', senhaRepetida: 'nova-senha',
  });
  assert.equal(usuario.id, u.id);
});

test('e-mail só PENDENTE não serve de apelido para trocar a senha', () => {
  const db = novo();
  const u = conta(db, 'abner');
  pedirEmail(db, u.id, 'abner@gmail.com');
  // O código do dono existe; quem tenta pelo e-mail que a conta ainda não confirmou não o alcança.
  const { codigo } = emitirCodigoDeRecuperacao(db, u.id, null);
  recusa(() => recuperarSenha(db, {
    apelido: 'abner@gmail.com', codigo, senha: 'nova-senha', senhaRepetida: 'nova-senha',
  }), 400);
  assert.ok(recuperarSenha(db, { apelido: 'abner', codigo, senha: 'nova-senha', senhaRepetida: 'nova-senha' }).token);
});

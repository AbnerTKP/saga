// O e-mail pela REDE, com o envio LIGADO: o servidor de verdade sobe apontando para um
// Resend de mentira nesta máquina, e o código que a pessoa digitaria é o que chegou nele.
// É a única forma de provar, sem internet, que o código que sai no e-mail é o mesmo que o
// servidor aceita — cada metade testada sozinha passaria com as duas desencontradas.
//
// Em arquivo próprio porque o servidor daqui sobe com outro `.env`: o de api.test.mjs é o
// da produção de hoje, com o envio desligado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';

let processo, base, pasta, resend;
let registro = '';
const caixa = [];
let respostaDoResend = null;   // null = aceita; senão, { status, corpo }

before(async () => {
  resend = http.createServer((req, res) => {
    let bruto = '';
    req.on('data', (c) => { bruto += c; });
    req.on('end', () => {
      const r = respostaDoResend ?? { status: 200, corpo: { id: `id-${caixa.length + 1}` } };
      if (r.status === 200) caixa.push(JSON.parse(bruto));
      res.writeHead(r.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r.corpo));
    });
  });
  await new Promise((r) => resend.listen(0, '127.0.0.1', r));

  pasta = mkdtempSync(join(tmpdir(), 'saga-email-'));
  const porta = 5000 + Math.floor(Math.random() * 1000);
  base = `http://127.0.0.1:${porta}`;
  processo = spawn(process.execPath, ['index.mjs'], {
    env: {
      ...process.env,
      PORT: String(porta),
      ROOMS: 'Geral',
      DONO: 'tkp',
      BANCO: join(pasta, 'teste.db'),
      LIVEKIT_API_KEY: 'devkey',
      LIVEKIT_API_SECRET: 'secret-de-teste-bem-longo',
      LIVEKIT_HOST: 'http://127.0.0.1:1',
      LIVEKIT_PUBLIC_URL: 'ws://exemplo:7880',
      SEM_NOTAS: '1',
      RESEND_KEY: 're_chave_de_teste',
      EMAIL_DE: 'Saga <saga@exemplo.com.br>',
      RESEND_URL: `http://127.0.0.1:${resend.address().port}/emails`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processo.stdout.on('data', (d) => { registro += String(d); });
  processo.stderr.on('data', (d) => {
    const s = String(d);
    registro += s;
    if (!s.includes('Experimental')) console.error('servidor:', s);
  });

  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('o servidor não subiu');
});

after(() => {
  processo?.kill();
  resend?.close();
  rmSync(pasta, { recursive: true, force: true });
});

const chamar = async (metodo, rota, { corpo, sessao } = {}) => {
  const r = await fetch(base + rota, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(sessao ? { 'x-sessao': sessao } : {}) },
    body: corpo && metodo !== 'GET' ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};

/** O código de 8 letras do último e-mail que chegou para `para`. */
function codigoDoEmail(para) {
  const carta = caixa.findLast((c) => c.to.includes(para));
  assert.ok(carta, `nenhum e-mail chegou para ${para}`);
  const achado = /\b([A-Z2-9]{4})-([A-Z2-9]{4})\b/.exec(carta.text);
  assert.ok(achado, 'o e-mail não tem código');
  return { codigo: `${achado[1]}${achado[2]}`, carta };
}

const cadastrar = (apelido, email, senha = 'segredo123') =>
  chamar('POST', '/cadastrar', { corpo: { apelido, email, senha, senhaRepetida: senha } });

test('o servidor diz que manda e-mail, para a tela de criar conta mostrar o campo', async () => {
  const r = await chamar('GET', '/health');
  assert.deepEqual(r.corpo, { ok: true, email: true });
});

test('com envio ligado, cadastro sem e-mail não cria conta', async () => {
  const r = await cadastrar('semmail', undefined);
  assert.equal(r.status, 400);
  const entrou = await chamar('POST', '/entrar', { corpo: { apelido: 'semmail', senha: 'segredo123' } });
  assert.equal(entrou.status, 401, 'recusado, a conta não pode existir');
});

test('cadastrar manda o código; confirmar põe o e-mail na conta e a Saga para de pedir', async () => {
  const r = await cadastrar('abner', ' Abner@Gmail.com ');
  assert.equal(r.status, 200);
  assert.ok(r.corpo.token);
  assert.equal(r.corpo.precisaDeEmail, true);
  assert.equal(r.corpo.email, null);
  assert.equal(r.corpo.emailPendente, 'abner@gmail.com');

  const { codigo, carta } = codigoDoEmail('abner@gmail.com');
  assert.equal(carta.from, 'Saga <saga@exemplo.com.br>');
  assert.match(carta.subject, /confirme/i);

  const errado = await chamar('POST', '/eu/email/confirmar', { corpo: { codigo: 'ZZZZ-ZZZZ' }, sessao: r.corpo.token });
  assert.equal(errado.status, 400, 'errar o código nunca é 401: o app deslogaria');

  const certo = await chamar('POST', '/eu/email/confirmar', { corpo: { codigo }, sessao: r.corpo.token });
  assert.equal(certo.status, 200);
  assert.equal(certo.corpo.email, 'abner@gmail.com');
  assert.equal(certo.corpo.precisaDeEmail, false);

  const eu = await chamar('GET', '/eu', { sessao: r.corpo.token });
  assert.equal(eu.corpo.precisaDeEmail, false);
  assert.equal(eu.corpo.email, 'abner@gmail.com');

  const entrou = await chamar('POST', '/entrar', { corpo: { apelido: 'abner', senha: 'segredo123' } });
  assert.equal(entrou.corpo.precisaDeEmail, false);
});

test('quem já tinha conta: entrar diz que falta o e-mail, e /eu/email manda o código', async () => {
  // Uma conta nascida com o envio desligado é igual a esta: sem e-mail e sem pendente. O
  // cadastro pede e-mail, então ela é feita por um e-mail que depois se desiste.
  const r = await cadastrar('antigo', 'antigo@gmail.com');
  await chamar('POST', '/eu/email/desistir', { sessao: r.corpo.token });

  const entrou = await chamar('POST', '/entrar', { corpo: { apelido: 'antigo', senha: 'segredo123' } });
  assert.equal(entrou.corpo.precisaDeEmail, true);
  assert.equal(entrou.corpo.emailPendente, null);

  const pediu = await chamar('POST', '/eu/email', { corpo: { email: 'Antigo2@gmail.com' }, sessao: entrou.corpo.token });
  assert.equal(pediu.status, 200);
  assert.equal(pediu.corpo.emailPendente, 'antigo2@gmail.com');

  const { codigo } = codigoDoEmail('antigo2@gmail.com');
  const certo = await chamar('POST', '/eu/email/confirmar', { corpo: { codigo }, sessao: entrou.corpo.token });
  assert.equal(certo.corpo.email, 'antigo2@gmail.com');
});

test('desistir apaga o pendente: o /eu seguinte volta a pedir o endereço, e não o código', async () => {
  const r = await cadastrar('desiste', 'errado@gmail.com');
  const { codigo } = codigoDoEmail('errado@gmail.com');

  const d = await chamar('POST', '/eu/email/desistir', { sessao: r.corpo.token });
  assert.equal(d.status, 200);
  assert.equal(d.corpo.emailPendente, null);
  assert.equal((await chamar('GET', '/eu', { sessao: r.corpo.token })).corpo.emailPendente, null);

  const tarde = await chamar('POST', '/eu/email/confirmar', { corpo: { codigo }, sessao: r.corpo.token });
  assert.equal(tarde.status, 400, 'o código do endereço abandonado não pode valer');
});

test('e-mail de outra conta é recusado com 409, no cadastro e em /eu/email', async () => {
  const a = await cadastrar('dono1', 'dono1@gmail.com');
  const { codigo } = codigoDoEmail('dono1@gmail.com');
  await chamar('POST', '/eu/email/confirmar', { corpo: { codigo }, sessao: a.corpo.token });

  assert.equal((await cadastrar('dono2', 'DONO1@gmail.com')).status, 409);

  const b = await cadastrar('dono3', 'dono3@gmail.com');
  const r = await chamar('POST', '/eu/email', { corpo: { email: 'dono1@gmail.com' }, sessao: b.corpo.token });
  assert.equal(r.status, 409);
});

test('sem sessão, as rotas do e-mail da conta são 401', async () => {
  for (const rota of ['/eu/email', '/eu/email/confirmar', '/eu/email/desistir']) {
    assert.equal((await chamar('POST', rota, { corpo: {} })).status, 401, rota);
  }
});

test('esqueci a senha: o código chega no e-mail e troca a senha pelo /recuperar de sempre', async () => {
  const r = await cadastrar('blankito', 'blank@gmail.com');
  const conf = codigoDoEmail('blank@gmail.com');
  await chamar('POST', '/eu/email/confirmar', { corpo: { codigo: conf.codigo }, sessao: r.corpo.token });

  const pediu = await chamar('POST', '/esqueci', { corpo: { conta: 'Blankito' } });
  assert.equal(pediu.status, 200);
  assert.deepEqual(pediu.corpo, { ok: true });

  const { codigo, carta } = codigoDoEmail('blank@gmail.com');
  assert.match(carta.subject, /senha/i);
  assert.notEqual(codigo, conf.codigo);

  const trocou = await chamar('POST', '/recuperar', {
    corpo: { apelido: 'blankito', codigo, senha: 'senha-nova', senhaRepetida: 'senha-nova' },
  });
  assert.equal(trocou.status, 200);
  assert.ok(trocou.corpo.token);

  const velha = await chamar('POST', '/entrar', { corpo: { apelido: 'blankito', senha: 'segredo123' } });
  assert.equal(velha.status, 401);
  const nova = await chamar('POST', '/entrar', { corpo: { apelido: 'blankito', senha: 'senha-nova' } });
  assert.equal(nova.status, 200);
});

test('esqueci a senha responde igual para quem não existe, quem não tem e-mail e quem pediu agora — e só um e-mail sai', async () => {
  const r = await cadastrar('tava1', 'tava@gmail.com');
  const { codigo } = codigoDoEmail('tava@gmail.com');
  await chamar('POST', '/eu/email/confirmar', { corpo: { codigo }, sessao: r.corpo.token });
  const semEmail = await cadastrar('semconfirmar', 'semconfirmar@gmail.com');
  assert.equal(semEmail.status, 200);

  const antes = caixa.length;
  const respostas = [];
  for (const conta of ['tava1', 'tava@gmail.com', 'ninguem', 'ninguem@gmail.com', 'semconfirmar', '', 5, null]) {
    respostas.push(await chamar('POST', '/esqueci', { corpo: { conta } }));
  }
  for (const resposta of respostas) {
    assert.equal(resposta.status, 200);
    assert.deepEqual(resposta.corpo, { ok: true });
  }
  // `tava1` mandou; o pedido pelo e-mail dela, logo depois, caiu no intervalo de dois minutos.
  assert.equal(caixa.length - antes, 1);
});

test('Resend em modo de teste no cadastro: a conta nasce, o motivo vem junto, e não fica pendente', async () => {
  respostaDoResend = {
    status: 403,
    corpo: { message: 'You can only send testing emails to your own email address (dono@gmail.com).' },
  };
  try {
    const r = await cadastrar('juninho', 'juninho@gmail.com');
    assert.equal(r.status, 200, 'a conta já foi criada: responder erro esconderia isso');
    assert.ok(r.corpo.token);
    assert.match(r.corpo.emailErro, /modo de teste/);
    assert.equal(r.corpo.emailPendente, null);
    assert.equal(r.corpo.precisaDeEmail, true);

    const eu = await chamar('GET', '/eu', { sessao: r.corpo.token });
    assert.equal(eu.corpo.emailPendente, null, 'um código que ninguém recebeu não pode ficar esperando');

    const denovo = await chamar('POST', '/eu/email', { corpo: { email: 'juninho@gmail.com' }, sessao: r.corpo.token });
    assert.equal(denovo.status, 502);
    assert.match(denovo.corpo.error, /modo de teste/);
    assert.equal((await chamar('GET', '/eu', { sessao: r.corpo.token })).corpo.emailPendente, null);
  } finally {
    respostaDoResend = null;
  }
});

test('Resend com defeito no esqueci a senha é erro de verdade, e não "mandei"', async () => {
  const r = await cadastrar('quebra', 'quebra@gmail.com');
  const { codigo } = codigoDoEmail('quebra@gmail.com');
  await chamar('POST', '/eu/email/confirmar', { corpo: { codigo }, sessao: r.corpo.token });

  respostaDoResend = { status: 500, corpo: {} };
  try {
    const pediu = await chamar('POST', '/esqueci', { corpo: { conta: 'quebra' } });
    assert.equal(pediu.status, 502);
  } finally {
    respostaDoResend = null;
  }

  // O envio voltou: pedir de novo na hora MANDA, e não cai no intervalo de um código que
  // ninguém recebeu.
  const antes = caixa.length;
  const denovo = await chamar('POST', '/esqueci', { corpo: { conta: 'quebra' } });
  assert.equal(denovo.status, 200);
  assert.equal(caixa.length - antes, 1, 'o pedido seguinte à falha não mandou nada');
});

test('pedir código para apelidos que não existem não gasta a cota dos pedidos de verdade', async () => {
  const r = await cadastrar('cota', 'cota@gmail.com');
  const { codigo } = codigoDoEmail('cota@gmail.com');
  await chamar('POST', '/eu/email/confirmar', { corpo: { codigo }, sessao: r.corpo.token });

  for (let i = 0; i < 40; i++) {
    assert.equal((await chamar('POST', '/esqueci', { corpo: { conta: `inventado${i}` } })).status, 200);
  }
  const antes = caixa.length;
  await chamar('POST', '/esqueci', { corpo: { conta: 'cota' } });
  assert.equal(caixa.length - antes, 1);
});

test('o registro anota quem, e nunca o código nem o endereço', async () => {
  // Os testes acima já passaram por tudo: cadastro, confirmação, esqueci, recuperar.
  await new Promise((r) => setTimeout(r, 200));
  assert.match(registro, /e-mail: abner confirmou o e-mail da conta/);
  assert.match(registro, /código de senha mandado por e-mail para blankito/);
  for (const carta of caixa) {
    const achado = /\b([A-Z2-9]{4})-([A-Z2-9]{4})\b/.exec(carta.text);
    assert.ok(!registro.includes(`${achado[1]}-${achado[2]}`), 'um código foi parar no registro');
    assert.ok(!registro.includes(`${achado[1]}${achado[2]}`), 'um código foi parar no registro');
    assert.ok(!registro.toLowerCase().includes(carta.to[0]), `o endereço ${carta.to[0]} foi parar no registro`);
  }
  assert.ok(!registro.includes('re_chave_de_teste'), 'a chave foi parar no registro');
});

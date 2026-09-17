// O envio de e-mail, contra um Resend de mentira na própria máquina: o `pnpm test` não
// depende de internet, e o que se confere é o pedido que sairia — endereço, remetente,
// chave, o código dentro do texto — e o que cada resposta do Resend vira na tela.
//
// As respostas imitam as de verdade, medidas em 17/09/2026 com a conta da Saga: 403 com
// "You can only send testing emails to your own email address" para quem não é o dono da
// conta, e 422 para domínio que o Resend não aceita.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let resend, email;
const recebidos = [];
let proxima = { status: 200, corpo: { id: 'id-de-teste' } };

before(async () => {
  resend = http.createServer((req, res) => {
    let bruto = '';
    req.on('data', (c) => { bruto += c; });
    req.on('end', () => {
      recebidos.push({ headers: req.headers, corpo: JSON.parse(bruto || '{}') });
      res.writeHead(proxima.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(proxima.corpo));
    });
  });
  await new Promise((r) => resend.listen(0, '127.0.0.1', r));
  // Antes do import: o endereço é lido quando o módulo carrega.
  process.env.RESEND_URL = `http://127.0.0.1:${resend.address().port}/emails`;
  email = await import('./email.mjs');
});

after(() => resend?.close());

const ligado = { chave: 're_teste', remetente: 'Saga <saga@exemplo.com.br>' };
const pedido = { ...ligado, para: 'abner@gmail.com', assunto: 'Assunto', texto: 'Texto' };

const recusa = (promessa, status, trecho) => assert.rejects(promessa, (e) =>
  e.status === status && (!trecho || e.message.includes(trecho)));

test('sem chave ou sem remetente, o envio está desligado e nada sai', async () => {
  assert.equal(email.envioLigado({ chave: '', remetente: 'x' }), false);
  assert.equal(email.envioLigado({ chave: 'x', remetente: '' }), false);
  assert.equal(email.envioLigado(ligado), true);

  const antes = recebidos.length;
  await recusa(email.mandar({ ...pedido, remetente: '' }), 503);
  assert.equal(recebidos.length, antes, 'desligado não pode nem tentar');
});

test('o pedido leva a chave no cabeçalho, e remetente, destino e texto no corpo', async () => {
  proxima = { status: 200, corpo: { id: 'abc123' } };
  const id = await email.mandar(pedido);
  const ultimo = recebidos.at(-1);
  assert.equal(id, 'abc123');
  assert.equal(ultimo.headers.authorization, 'Bearer re_teste');
  assert.deepEqual(ultimo.corpo, {
    from: 'Saga <saga@exemplo.com.br>', to: ['abner@gmail.com'], subject: 'Assunto', text: 'Texto',
  });
});

test('o modo de teste do Resend é dito com o nome dele, e não como "chave recusada"', async () => {
  proxima = {
    status: 403,
    corpo: {
      name: 'validation_error',
      message: 'You can only send testing emails to your own email address (dono@gmail.com). To send emails to other recipients, please verify a domain at resend.com/domains, and change the `from` address to an email using this domain.',
    },
  };
  await recusa(email.mandar(pedido), 502, 'modo de teste');
});

test('chave recusada, endereço recusado, Resend com defeito e Resend fora do ar', async () => {
  proxima = { status: 401, corpo: { message: 'API key is invalid' } };
  await recusa(email.mandar(pedido), 502, 'chave');

  // 422 é o endereço: quem digitou pode consertar, então não é 5xx.
  proxima = { status: 422, corpo: { message: 'Invalid `to` field.' } };
  await recusa(email.mandar(pedido), 400, 'Confira');

  proxima = { status: 500, corpo: {} };
  await recusa(email.mandar(pedido), 502, '500');

  // Corpo que não é JSON não vira erro de programa.
  proxima = { status: 500, corpo: 'isto não é json' };
  await recusa(email.mandar(pedido), 502);
});

test('Resend que não responde vira recusa com motivo, e não uma exceção solta', async () => {
  const fora = http.createServer();
  await new Promise((r) => fora.listen(0, '127.0.0.1', r));
  const porta = fora.address().port;
  await new Promise((r) => fora.close(r));
  // Um módulo novo, apontado para uma porta onde ninguém atende.
  process.env.RESEND_URL = `http://127.0.0.1:${porta}/emails`;
  const outro = await import(`./email.mjs?fora=${porta}`);
  await recusa(outro.mandar(pedido), 502, 'Não consegui falar');
});

test('o e-mail de confirmar leva o código em dois pedaços e o apelido', () => {
  const { assunto, texto } = email.textoDeConfirmacao('TKP', 'K7QM2XPA');
  assert.match(assunto, /confirme/i);
  assert.ok(texto.includes('K7QM-2XPA'));
  assert.ok(texto.startsWith('Oi, TKP.'));
  assert.ok(texto.includes('ignore'), 'quem não pediu precisa saber que ignorar basta');
});

test('o e-mail de senha diz de QUAL conta é a senha', () => {
  const { assunto, texto } = email.textoDeSenha('Blankito', 'ABCD2345');
  assert.match(assunto, /senha/i);
  assert.ok(texto.includes('ABCD-2345'));
  assert.ok(texto.includes('conta Blankito'));
});

test('o teto por hora segura o envio, e uma hora depois libera de novo', () => {
  email.esquecerEnvios();
  const agora = 1_000_000_000;
  for (let i = 0; i < email.TETO_POR_HORA; i++) {
    assert.equal(email.haVagaNoTeto(agora + i), true);
    email.anotarEnvio(agora + i);
  }
  assert.equal(email.haVagaNoTeto(agora + 100), false);
  // Perguntar não anota: quem insiste não empurra a janela para a frente sozinho.
  assert.equal(email.haVagaNoTeto(agora + 60 * 60_000), true);
  email.esquecerEnvios();
});

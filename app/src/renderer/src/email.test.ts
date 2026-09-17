import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EMAIL_VALIDO, falhaDoLadoDeCa, pareceEmail } from './email.ts';

test('a régua do app é a mesma com que o servidor recusa e-mail', () => {
  // Lida como texto: o app não importa o servidor.
  const doServidor = readFileSync(new URL('../../../../server/contas.mjs', import.meta.url), 'utf8')
    .match(/const EMAIL_VALIDO = (\/.+\/);/)?.[1];
  assert.equal(String(EMAIL_VALIDO), doServidor);
});

test('o botão acende com cara de e-mail, e não acende sem ela', () => {
  for (const bom of ['abnertkp@gmail.com', ' Abner.TKP+saga@Gmail.com ', 'a@b.co']) assert.equal(pareceEmail(bom), true, bom);
  for (const ruim of ['', 'abner', 'abner@', '@gmail.com', 'abner@gmail', 'ab ner@gmail.com', 'a@b.c']) {
    assert.equal(pareceEmail(ruim), false, ruim);
  }
  assert.equal(pareceEmail(`${'a'.repeat(250)}@x.com`), false, 'passa do limite do SMTP');
});

test('defeito do servidor deixa entrar sem e-mail; erro de quem digitou, não', () => {
  // Resend fora, modo de teste, chave recusada — todos chegam como 502.
  assert.equal(falhaDoLadoDeCa(502, 'O envio de e-mail deste servidor ainda está em modo de teste'), true);
  assert.equal(falhaDoLadoDeCa(503, 'Este servidor ainda não manda e-mail.'), true);
  assert.equal(falhaDoLadoDeCa(429, 'A Saga já mandou e-mails demais nesta hora.'), true);
  assert.equal(falhaDoLadoDeCa(0, 'Não consegui falar com o servidor.'), true);
  assert.equal(falhaDoLadoDeCa(404, 'não encontrado'), true, 'servidor antigo, sem a rota');

  assert.equal(falhaDoLadoDeCa(400, 'Esse e-mail não parece um e-mail.'), false);
  assert.equal(falhaDoLadoDeCa(409, 'Esse e-mail já é de outra conta.'), false);
  assert.equal(falhaDoLadoDeCa(400, 'Código inválido ou vencido. Peça outro.'), false);
  assert.equal(falhaDoLadoDeCa(404, 'Essa conta não existe.'), false);
});

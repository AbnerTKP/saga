// Mandar e-mail, pelo Resend. A chave mora no .env do servidor, como a do Giphy: dentro
// do app, qualquer um que abrisse o instalador poderia mandar e-mail em nome da Saga.
//
// Aqui só se MONTA e se MANDA. Quem decide que alguém precisa de um código, e o que fazer
// quando o envio falha, é `contas.mjs` e a tabela de rotas.
//
// O envio só está LIGADO com chave E remetente. São duas linhas no .env, de propósito: a
// conta do Resend, sem um domínio verificado, entrega apenas no endereço do dono dela — e
// responde 403 para qualquer outro (medido em 17/09/2026, com a conta da Saga). Enquanto
// não houver domínio, deixar as duas vazias mantém a Saga como sempre foi: sem pedir
// e-mail a ninguém. Ligar o envio com o Resend em modo de teste faria a Saga pedir a
// confirmação de um código que só chega ao dono, e travar todo o resto do grupo do lado
// de fora — "e-mail que não chega" é a pior das telas, porque não parece um defeito.
import { ErroDeConta } from './contas.mjs';

// O endereço do Resend entra por variável para o teste poder pôr um servidor local no
// lugar: sem isso, provar que o código sai daqui dentro exigiria internet no `pnpm test`.
const API = process.env.RESEND_URL || 'https://api.resend.com/emails';

export const envioLigado = ({ chave, remetente }) => !!(chave && remetente);

/**
 * Quantos e-mails a Saga inteira manda por hora, no máximo.
 *
 * O freio de dois minutos por conta (`INTERVALO_ENTRE_CODIGOS`, em contas.mjs) não segura
 * quem varre a lista: com 33 contas, um pedido por conta a cada dois minutos dá mil e-mails
 * por hora — a cota do plano grátis morre em minutos e o grupo inteiro recebe código que
 * ninguém pediu. Este teto é do SERVIDOR, e por isso vive aqui, junto de quem manda.
 *
 * Trinta é largo para um grupo de cinco: uma tarde inteira de gente esquecendo a senha não
 * chega perto. Estourado, quem pede recebe a mesma resposta de sempre e nada sai —
 * silenciosamente, porque dizer "o teto estourou" ensina a estourá-lo de novo.
 */
export const TETO_POR_HORA = 30;
const UMA_HORA = 60 * 60_000;
const saidos = [];

/**
 * Ainda cabe um envio nesta hora? Só pergunta: quem anota é `anotarEnvio`, na hora em que o
 * e-mail sai de verdade. Juntas, as duas contavam o pedido para uma conta que não existe —
 * e bastava pedir código para apelidos inventados para esgotar a cota dos pedidos de
 * verdade. Mora em memória: reiniciar o servidor zera o contador, e tudo bem — isto protege
 * a cota de um dia, não é conta de cobrança.
 */
export function haVagaNoTeto(agora = Date.now()) {
  while (saidos.length && agora - saidos[0] >= UMA_HORA) saidos.shift();
  return saidos.length < TETO_POR_HORA;
}

export const anotarEnvio = (agora = Date.now()) => { saidos.push(agora); };

/** Só para os testes: o contador sobrevive entre um caso e outro. */
export const esquecerEnvios = () => { saidos.length = 0; };

/** O código como se lê e se dita, em dois pedaços — o mesmo formato da tela. */
export const comHifen = (codigo) => `${codigo.slice(0, 4)}-${codigo.slice(4)}`;

/**
 * O e-mail de confirmar o endereço.
 *
 * Texto puro, sem imagem nem HTML: é o que menos cai em spam, e um código dentro de uma
 * caixa desenhada não se lê melhor do que um código numa linha sozinha. A frase final não
 * é enfeite: quem recebe isto sem ter pedido precisa saber, na mesma tela, que ignorar
 * basta.
 */
export const textoDeConfirmacao = (apelido, codigo) => ({
  assunto: 'Saga: confirme o seu e-mail',
  texto: [
    `Oi, ${apelido}.`,
    '',
    'O código para confirmar este e-mail na Saga é:',
    '',
    `    ${comHifen(codigo)}`,
    '',
    'Ele vale uma hora e serve uma vez só.',
    '',
    'Se não foi você que pediu, ignore: sem o código, nada muda na sua conta.',
    '',
    'Saga',
  ].join('\n'),
});

/**
 * O e-mail de recuperar a senha.
 *
 * Diz o APELIDO da conta. Quem tem duas contas — ou emprestou o endereço para um irmão —
 * precisa saber qual delas está para trocar de senha antes de digitar o código.
 */
export const textoDeSenha = (apelido, codigo) => ({
  assunto: 'Saga: recuperar a senha',
  texto: [
    `Oi, ${apelido}.`,
    '',
    `Alguém pediu para trocar a senha da conta ${apelido} na Saga. O código é:`,
    '',
    `    ${comHifen(codigo)}`,
    '',
    'Ele vale uma hora e serve uma vez só. Com ele, escolhe-se a senha nova na própria',
    'tela de entrar da Saga.',
    '',
    'Se não foi você, ignore: sem o código, a senha continua a mesma.',
    '',
    'Saga',
  ].join('\n'),
});

/**
 * Manda, e devolve o id do Resend.
 *
 * Toda falha vira `ErroDeConta` com um motivo que dá para ler na tela — 502 para "não foi
 * culpa de quem pediu". O 403 do modo de teste ganha frase própria porque é o único que
 * se conserta do lado de cá, e o sintoma dele ("não chegou") é idêntico ao de um endereço
 * digitado errado: sem dizer o que é, o dono procuraria no lugar errado.
 *
 * `AbortSignal.timeout` porque a VPS tem um núcleo: um Resend lento sem prazo prenderia o
 * pedido de quem está esperando para entrar.
 */
export async function mandar({ chave, remetente, para, assunto, texto }) {
  if (!envioLigado({ chave, remetente })) {
    throw new ErroDeConta('Este servidor ainda não manda e-mail.', 503);
  }

  const r = await fetch(API, {
    method: 'POST',
    headers: { authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: remetente, to: [para], subject: assunto, text: texto }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);

  if (!r) throw new ErroDeConta('Não consegui falar com quem manda os e-mails.', 502);

  const corpo = await r.json().catch(() => ({}));
  if (r.status === 403 && String(corpo.message ?? '').includes('your own email address')) {
    throw new ErroDeConta(
      'O envio de e-mail deste servidor ainda está em modo de teste: só entrega no endereço do dono. Falta verificar um domínio.',
      502,
    );
  }
  if (r.status === 401 || r.status === 403) {
    throw new ErroDeConta('A chave de e-mail deste servidor foi recusada.', 502);
  }
  // 422 é "esse endereço o Resend não aceita" — quem digitou pode consertar, e por isso
  // não é 502: um 5xx diria "foi defeito nosso, tente igual mais tarde".
  if (r.status === 422) {
    throw new ErroDeConta('Esse endereço de e-mail não foi aceito. Confira se está certo.', 400);
  }
  if (!r.ok) throw new ErroDeConta(`Quem manda os e-mails respondeu ${r.status}.`, 502);

  return corpo.id ?? null;
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ALFABETO, avisoDaTroca, avisoDoCodigo, codigoCompleto, codigoDepoisDeColar, codigoNoColado, explicarFalha,
  formatarCodigo, pendente,
} from './recuperacao.ts';

test('o alfabeto do app é o mesmo com que o servidor gera o código', () => {
  // Lido como texto: o app não importa o servidor. Divergindo, o app apagaria o botão para
  // um código que existe — ou o acenderia para um que não pode existir.
  const doServidor = readFileSync(new URL('../../../../server/codigos.mjs', import.meta.url), 'utf8')
    .match(/export const ALFABETO = '([^']+)'/)?.[1];
  assert.equal(ALFABETO, doServidor);
});

test('o código aparece como o dono vê: maiúsculas e hífen no meio', () => {
  assert.equal(formatarCodigo('k7qm2xpa'), 'K7QM-2XPA');
  assert.equal(formatarCodigo('K7QM-2XPA'), 'K7QM-2XPA');
});

test('o hífen só entra a partir do quinto caractere', () => {
  assert.equal(formatarCodigo('K7QM'), 'K7QM');
  assert.equal(formatarCodigo('K7QM2'), 'K7QM-2');
});

test('apagar o que vem depois do hífen leva o hífen junto, senão o Backspace travaria nele', () => {
  assert.equal(formatarCodigo('K7QM-'), 'K7QM');
  assert.equal(formatarCodigo('K7Q'), 'K7Q');
});

test('espaço, hífen e o que não é letra nem dígito caem', () => {
  assert.equal(formatarCodigo('k7q m-2x'), 'K7QM-2X');
  assert.equal(formatarCodigo(' k7qm - 2xpa '), 'K7QM-2XPA');
  assert.equal(formatarCodigo('k7ç!q@m'), 'K7QM');
  assert.equal(formatarCodigo(''), '');
});

test('passando de 8, o resto é cortado', () => {
  assert.equal(formatarCodigo('K7QM2XPAZZ'), 'K7QM-2XPA');
});

test('formatar o que já está formatado não muda nada', () => {
  for (const t of ['k7qm2xpa', 'K7QM-', 'k7q m-2x', 'K7QM2XPAZZ', '']) {
    assert.equal(formatarCodigo(formatarCodigo(t)), formatarCodigo(t));
  }
});

test('completo é quando sobram exatamente 8 letras e dígitos', () => {
  assert.equal(codigoCompleto('K7QM-2XPA'), true);
  assert.equal(codigoCompleto('k7qm 2xpa'), true);
  assert.equal(codigoCompleto('K7QM-2XP'), false);
  assert.equal(codigoCompleto(''), false);
  assert.equal(codigoCompleto('K7QM-2XPA-9'), false);
});

test('oito símbolos com O, I, 0 ou 1 não são um código: o botão não acende, e o campo diz por quê', () => {
  // Mandar gastaria uma das cinco tentativas do código que vale.
  for (const impossivel of ['CDIG-OK7Q', 'K7QM-2XP0', 'K7QM-2XPI', 'K7QM-1XPA']) {
    assert.equal(codigoCompleto(impossivel), false, impossivel);
    assert.match(avisoDoCodigo(impossivel) ?? '', /não usa as letras O e I, nem zero e um/);
  }
  assert.equal(avisoDoCodigo('K7QM-2XPA'), null);
  assert.equal(avisoDoCodigo('K7Q'), null, 'digitando pela metade, com letras do código, não há o que avisar');
  assert.equal(avisoDoCodigo(''), null);
});

test('colar a mensagem inteira pega o código de dentro dela', () => {
  assert.equal(codigoNoColado('Código: K7QM-2XPA'), 'K7QM-2XPA');
  assert.equal(codigoNoColado('Oi Ana, segue o código k7qm-2xpa, vale uma hora'), 'K7QM-2XPA');
  assert.equal(codigoNoColado('K7QM-2XPA'), 'K7QM-2XPA');
  assert.equal(codigoNoColado(' K7QM2XPA\n'), 'K7QM-2XPA');
  assert.equal(codigoNoColado('[12:03, 12/09/2026] Dono: K7QM-2XPA'), 'K7QM-2XPA');
});

test('o código com hífen ganha de oito letras soltas na frase', () => {
  assert.equal(codigoNoColado('PARABENS, o seu é K7QM-2XPA'), 'K7QM-2XPA');
  assert.equal(codigoNoColado('K7QM-2XPA parabens'), 'K7QM-2XPA');
  // Sem nenhum com hífen, as oito seguidas valem.
  assert.equal(codigoNoColado('o código é k7qm2xpa'), 'K7QM-2XPA');
});

test('numa conversa copiada com dois códigos, fica o de baixo, que é o mais novo', () => {
  assert.equal(codigoNoColado('Dono: K7QM-2XPA\nAna: não foi\nDono: novo: ABCD-EFGH'), 'ABCD-EFGH');
});

test('colar um código num campo que já tem outro troca o velho pelo novo, com o cursor onde estiver', () => {
  // O velho é de uma tentativa que falhou; ficar com ele, ou misturar os dois, gastaria
  // tentativa do código novo.
  const velho = 'K7QM-2XPA';
  assert.equal(codigoDepoisDeColar(velho, 9, 9, 'ABCD-EFGH'), 'ABCD-EFGH', 'cursor no fim');
  assert.equal(codigoDepoisDeColar(velho, 5, 5, 'ABCD-EFGH'), 'ABCD-EFGH', 'cursor no meio');
  assert.equal(codigoDepoisDeColar(velho, 0, 9, 'Código: ABCD-EFGH'), 'ABCD-EFGH', 'tudo selecionado');
  assert.equal(codigoDepoisDeColar('', 0, 0, 'Oi Ana, segue o código k7qm-2xpa'), 'K7QM-2XPA');
});

test('colar um pedaço junta com o que já foi digitado, na posição do cursor', () => {
  assert.equal(codigoDepoisDeColar('K7QM', 4, 4, '2XPA'), 'K7QM-2XPA');
  assert.equal(codigoDepoisDeColar('2XPA', 0, 0, 'K7QM-'), 'K7QM-2XPA');
  // Sem código inteiro, a mensagem vira o que se juntou — e não acende o botão.
  const juntou = codigoDepoisDeColar('', 0, 0, 'Código: K7QM');
  assert.equal(codigoCompleto(juntou), false, juntou);
});

test('sem um código inteiro no colado, não se inventa um', () => {
  // Pedaço de código: quem cola "2XPA" depois de digitar "K7QM" junta os dois no campo.
  for (const semCodigo of ['2XPA', 'K7QM-2XP', 'straße12', 'Código: K7QM-2XPAZ', 'XK7QM2XPA', '', 'olá']) {
    assert.equal(codigoNoColado(semCodigo), null, semCodigo);
  }
});

test('o 404 do roteador vira "atualize o servidor"; o resto passa como veio', () => {
  assert.equal(
    explicarFalha(404, 'não encontrado'),
    'O servidor ainda não sabe fazer isso: ele precisa ser atualizado.',
  );
  assert.equal(explicarFalha(404, 'Essa conta não existe.'), 'Essa conta não existe.');
  const recusa = 'Código inválido ou vencido. Peça outro ao dono da Saga.';
  assert.equal(explicarFalha(400, recusa), recusa);
  assert.equal(explicarFalha(403, 'A senha atual não confere.'), 'A senha atual não confere.');
  const semRede = 'Não consegui falar com o servidor. Confira sua internet.';
  assert.equal(explicarFalha(0, semRede), semRede);
});

test('pendente só com um número no futuro', () => {
  const agora = 1_000_000;
  assert.equal(pendente(agora + 60_000, agora), true);
  assert.equal(pendente(agora, agora), false);
  assert.equal(pendente(agora - 1, agora), false);
  assert.equal(pendente(null, agora), false);
  // Servidor antigo não manda o campo.
  assert.equal(pendente(undefined, agora), false);
});

test('o recado da troca diz se havia outro lugar aberto, sem afirmar quantos computadores', () => {
  // `encerradas` conta sessões, e sessão esquecida no banco não é computador nenhum.
  assert.equal(avisoDaTroca(0), 'Senha trocada.');
  const recado = 'Senha trocada. Onde mais a conta estava aberta, vai ser preciso entrar de novo.';
  assert.equal(avisoDaTroca(1), recado);
  assert.equal(avisoDaTroca(3), recado);
  assert.doesNotMatch(avisoDaTroca(3), /\d/);
});

/**
 * Recuperar a senha, no que dá para fazer longe da tela.
 *
 * O código chega por um de dois caminhos: o e-mail da conta, que a própria pessoa pede na
 * tela de entrar, ou o dono da Saga, que o gera no painel dele e manda por fora — o caminho
 * de quem não tem e-mail. Com ele se escolhe outra senha. É o mesmo código nos dois casos, e
 * também o de confirmar o e-mail: 8 letras e dígitos, mostrados como XXXX-XXXX. O servidor
 * ignora maiúsculas, espaços e hífens; o campo daqui só deixa o que se digita com a cara do
 * que chegou.
 */
import { rotaQueNaoExiste } from './resposta.ts';

const TAMANHO = 8;

/**
 * As letras de que o servidor faz o código (`ALFABETO`, em server/codigos.mjs): sem O e 0,
 * sem I e 1. App e servidor são pacotes separados e um não importa o outro, então isto é uma
 * cópia — e o teste lê a de lá e confere que são a mesma, porque cópia que diverge em
 * silêncio é justo o que aquele módulo existe para evitar.
 */
export const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LETRA = `[${ALFABETO}]`;

/** Só o que conta no código: letras e dígitos, em maiúsculas. */
const soOQueConta = (texto: string) => String(texto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const foraDoAlfabeto = (texto: string) => [...soOQueConta(texto)].some((letra) => !ALFABETO.includes(letra));

/**
 * O código do jeito que o dono vê: "K7QM-2XPA".
 *
 * O hífen só entra a partir do quinto caractere. Posto já depois do quarto, o Backspace
 * travaria nele: apagar o hífen de "K7QM-" deixa "K7QM", que se formata de volta em
 * "K7QM-", e a quarta letra nunca mais sai.
 */
export function formatarCodigo(texto: string): string {
  const limpo = soOQueConta(texto).slice(0, TAMANHO);
  return limpo.length > 4 ? `${limpo.slice(0, 4)}-${limpo.slice(4)}` : limpo;
}

/**
 * Dá para mandar: sobraram exatamente 8 letras e dígitos, todos do alfabeto do código.
 *
 * Um código com O, I, 0 ou 1 não pode existir, e mandá-lo não é inofensivo: o servidor o
 * confere como qualquer outro e gasta uma das cinco tentativas do código que vale.
 */
export const codigoCompleto = (texto: string): boolean =>
  soOQueConta(texto).length === TAMANHO && !foraDoAlfabeto(texto);

/**
 * Por que o botão não acende com oito letras no campo. Botão apagado sem motivo parece
 * defeito, e quem digitou "0" no lugar de "O" não tem como adivinhar que nenhum dos dois existe.
 */
export const avisoDoCodigo = (texto: string, veioDe: 'dono' | 'email' = 'dono'): string | null =>
  // Por extenso, "zero" e "um": escritos como algarismos, ao lado das letras O e I, o aviso
  // teria a mesma confusão que ele existe para desfazer. O fim da frase diz onde conferir: o
  // mesmo código chega pelo dono ou pelo e-mail, e "o que o dono mandou" mandaria quem
  // recebeu por e-mail procurar uma mensagem que não existe.
  (foraDoAlfabeto(texto)
    ? `Esse código não existe: ele não usa as letras O e I, nem zero e um. ${veioDe === 'email' ? 'Confira o e-mail.' : 'Confira o que o dono mandou.'}`
    : null);

/**
 * O código que está num texto colado, ou null se não houver um inteiro ali.
 *
 * Quem cola quase nunca cola só o código: o "Copiar" do WhatsApp leva a mensagem inteira
 * ("Código: K7QM-2XPA"), e o campo pode já ter o de uma tentativa anterior. Juntar tudo e
 * cortar em oito montava um código completo e ERRADO — "CDIG-OK7Q" —, e com o campo cheio a
 * colagem simplesmente não mudava nada na tela.
 *
 * Primeiro procura o código como o dono o vê, com o hífen; só sem nenhum assim, oito letras
 * seguidas — senão "PARABENS" solto na frase passaria na frente do código. Nos dois casos com
 * algo que não é letra nem dígito (ou a ponta do texto) dos dois lados, para não pescar oito
 * letras do meio de uma palavra maior. Havendo mais de um, fica o último: numa conversa
 * copiada, a mensagem mais nova vem embaixo.
 */
export function codigoNoColado(texto: string): string | null {
  const emMaiusculas = String(texto ?? '').toUpperCase();
  for (const separador of ['-', '']) {
    const achados = [...emMaiusculas.matchAll(new RegExp(`(?<![A-Z0-9])(${LETRA}{4})${separador}(${LETRA}{4})(?![A-Z0-9])`, 'g'))];
    const ultimo = achados.at(-1);
    if (ultimo) return `${ultimo[1]}-${ultimo[2]}`;
  }
  return null;
}

/**
 * O que o campo passa a ter depois de colar `colado` sobre a seleção de `inicio` a `fim`.
 *
 * Com um código inteiro no colado, ele SUBSTITUI o campo: é o código novo que chegou, e o
 * que estava ali é o velho, de uma tentativa que já falhou. Sem um inteiro, o colado entra na
 * posição do cursor, como sempre — é quem digitou "K7QM" e cola "2XPA".
 */
export function codigoDepoisDeColar(valor: string, inicio: number, fim: number, colado: string): string {
  return codigoNoColado(colado) ?? formatarCodigo(valor.slice(0, inicio) + colado + valor.slice(fim));
}

/**
 * O que dizer quando o pedido falha.
 *
 * App e servidor sobem separados: app novo contra servidor antigo pergunta por uma rota que
 * lá não existe (`rotaQueNaoExiste`, em resposta.ts). Mostrado cru, o "não encontrado" do
 * roteador se leria como "a sua conta não foi encontrada" — justo para quem já não consegue
 * entrar. O outro 404, "Essa conta não existe.", é resposta de verdade e passa como veio.
 */
export function explicarFalha(status: number, mensagem: string): string {
  if (rotaQueNaoExiste(status, mensagem)) {
    return 'O servidor ainda não sabe fazer isso: ele precisa ser atualizado.';
  }
  return mensagem;
}

/**
 * Esta conta tem um código emitido que ainda vale?
 *
 * `agora` entra por parâmetro, como em `dias.ts`. Servidor antigo não manda o campo, e aí
 * não se afirma nada.
 */
export const pendente = (recuperacaoAte: number | null | undefined, agora: number): boolean =>
  typeof recuperacaoAte === 'number' && recuperacaoAte > agora;

/**
 * O recado depois de trocar a senha logado.
 *
 * Trocar derruba as OUTRAS sessões da conta, e o recado avisa quem vai achar o notebook
 * deslogado. Sem número, de propósito: `encerradas` conta linhas de sessão, e sessão não vence
 * nunca — o app joga fora o crachá sem avisar o servidor quando abre sem internet, e a linha
 * velha fica no banco. "Saiu de 3 outros computadores", para quem só tem um, se lê como
 * "alguém estava usando a minha conta". O que o dado sustenta é haver ou não haver outra.
 */
export function avisoDaTroca(encerradas: number): string {
  if (!(encerradas > 0)) return 'Senha trocada.';
  return 'Senha trocada. Onde mais a conta estava aberta, vai ser preciso entrar de novo.';
}

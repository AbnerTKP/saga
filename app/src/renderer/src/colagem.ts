/**
 * O texto de uma lista colada no chat, com os marcadores que a área de transferência perdeu.
 *
 * Quem copia uma lista de uma página, do Google Docs, do Notion ou do ChatGPT leva junto o
 * HTML dela e uma versão em texto puro — e o texto puro do Chromium não tem marcador
 * nenhum: `<li>Comprar pão</li>` vira só "Comprar pão" numa linha. Medido em 12/10/2026 no
 * Electron da Saga: uma lista com sublista colada num `<textarea>` chega como
 * "Comprar pão\nLigar para o João\nantes das 18h", sem "•" e sem recuo. O campo de uma
 * linha que o chat usava antes fazia pior: juntava tudo com espaço.
 *
 * Por isso, quando o HTML tem lista, o texto sai DELE: cada item na sua linha, "•" no
 * primeiro nível, "◦" e "▪" nos de dentro (dois espaços por nível), e o número na lista
 * numerada. Sem lista no HTML, devolve `null` e o colar normal do campo vale — ele já
 * guarda as quebras de linha, e o código copiado de um editor continua com o recuo dele.
 *
 * É um leitor de HTML pequeno, e não o `DOMParser`, para ser puro e testável. Ele só
 * precisa saber onde as linhas quebram: negrito, cor e tamanho não existem no chat.
 */

const BLOCOS = new Set([
  'p', 'div', 'section', 'article', 'header', 'footer', 'aside', 'main', 'nav', 'blockquote',
  'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'tr', 'dl', 'dt', 'dd', 'figure',
  'figcaption', 'hr', 'address', 'details', 'summary', 'body', 'html',
]);
/** O que está dentro destes não é texto de ninguém: estilo, script, o título da página. */
const FORA = new Set(['style', 'script', 'head', 'title', 'template', 'noscript', 'xml']);
const BOLINHAS = ['•', '◦', '▪'];

const NOMEADAS: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', bull: '•', middot: '·',
  hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”',
  lsquo: '‘', rsquo: '’', ordm: 'º', ordf: 'ª', deg: '°', euro: '€', copy: '©', reg: '®',
};
const SINAIS: Record<string, string> = {
  acute: '́', grave: '̀', circ: '̂', tilde: '̃', uml: '̈', cedil: '̧',
};

/** `&atilde;` vira "ã" pela letra e pelo acento, sem uma tabela com cada vogal. */
function decodificar(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteiro, nome: string) => {
    if (nome[0] === '#') {
      const hexa = nome[1] === 'x' || nome[1] === 'X';
      const n = hexa ? parseInt(nome.slice(2), 16) : parseInt(nome.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : inteiro;
    }
    if (NOMEADAS[nome] !== undefined) return NOMEADAS[nome];
    const acento = /^([a-z])(acute|grave|circ|tilde|uml|cedil)$/i.exec(nome);
    return acento ? (acento[1] + SINAIS[acento[2].toLowerCase()]).normalize('NFC') : inteiro;
  });
}

export function textoDaListaColada(html: string): string | null {
  if (!/<li[\s>/]/i.test(html)) return null;

  const linhas: string[] = [];
  let prefixo = '';
  let texto = '';
  const listas: { numerada: boolean; n: number }[] = [];
  /** O recuo de cada item aberto: a segunda linha de um item fica embaixo do texto dele. */
  const itens: string[] = [];
  let fora: string | null = null;
  let pre = 0;

  const fecharLinha = () => { linhas.push((prefixo + texto).trimEnd()); prefixo = ''; texto = ''; };
  /**
   * Fecha a linha que está aberta — se ela tem o que dizer. Sem texto, o marcador espera:
   * no Google Docs o item é `<li><p>texto</p></li>`, e o `<p>` chega antes do texto.
   */
  const quebrar = () => {
    if (texto.trim()) fecharLinha();
    else texto = '';
  };
  const escrever = (pedaco: string) => {
    if (!pedaco) return;
    if (!texto && !prefixo && itens.length) prefixo = itens.at(-1)!;
    texto += pedaco;
  };

  const pedacos = /<!--[\s\S]*?-->|<![^>]*>|<\?[^>]*>|<(\/?)([a-z][\w:-]*)([^>]*)>|([^<]+)|</gi;
  for (const [inteiro, fecha, nomeCru, atributos, solto] of html.matchAll(pedacos)) {
    if (nomeCru) {
      const nome = nomeCru.toLowerCase();
      if (fora) {
        if (fecha && nome === fora) fora = null;
        continue;
      }
      if (!fecha && FORA.has(nome) && !atributos.trimEnd().endsWith('/')) { fora = nome; continue; }
      if (nome === 'br') {
        // A linha em branco de propósito (`<p><br></p>`) é a única que fica vazia.
        fecharLinha();
      } else if (nome === 'ul' || nome === 'ol') {
        quebrar();
        if (fecha) { listas.pop(); prefixo = ''; }
        else {
          const inicio = /\bstart\s*=\s*["']?(\d+)/i.exec(atributos);
          listas.push({ numerada: nome === 'ol', n: inicio ? Number(inicio[1]) - 1 : 0 });
        }
      } else if (nome === 'li') {
        quebrar();
        // Item vazio não deixa o marcador dele para a linha seguinte.
        if (fecha) { itens.pop(); prefixo = ''; }
        else {
          const lista = listas.at(-1) ?? { numerada: false, n: 0 };
          // O Google Docs pode dizer o nível no próprio item, numa lista só.
          const aria = /\baria-level\s*=\s*["']?(\d+)/i.exec(atributos);
          const nivel = Math.max(0, aria ? Number(aria[1]) - 1 : listas.length - 1);
          lista.n += 1;
          const marcador = lista.numerada ? `${lista.n}.` : BOLINHAS[Math.min(nivel, BOLINHAS.length - 1)];
          const recuo = '  '.repeat(nivel);
          prefixo = `${recuo}${marcador} `;
          itens.push(' '.repeat(prefixo.length));
        }
      } else if (nome === 'td' || nome === 'th') {
        if (!fecha && texto.trim()) texto += ' ';
      } else if (BLOCOS.has(nome)) {
        if (nome === 'pre') pre = Math.max(0, pre + (fecha ? -1 : 1));
        quebrar();
      }
      continue;
    }
    // Comentário, <!DOCTYPE> e <?xml?> não são texto; um "<" solto é.
    if (fora || (solto === undefined && inteiro !== '<')) continue;
    const pedaco = decodificar(solto ?? inteiro).replace(/[​﻿]/g, '');
    if (pre > 0) {
      // Dentro de <pre> as quebras e os espaços são o conteúdo.
      pedaco.replace(/\r\n?/g, '\n').split('\n').forEach((p, i) => {
        if (i > 0) fecharLinha();
        escrever(p);
      });
      continue;
    }
    const corrido = pedaco.replace(/[ \t\n\r\f]+/g, ' ');
    escrever(texto ? corrido : corrido.replace(/^[  ]+/, ''));
  }
  quebrar();

  const resultado = linhas
    .map((l) => l.replace(/ /g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
  return resultado || null;
}

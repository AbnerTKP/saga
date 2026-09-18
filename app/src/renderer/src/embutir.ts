/**
 * O que o Vite pode embutir no código como `data:`, e o que tem de ir como arquivo.
 *
 * Por padrão ele embute todo arquivo com menos de 4 KB — e três sons ficaram abaixo disso:
 * o de mutar (3.787 bytes), o de desmutar (3.831) e o lance do xadrez (1.501). Embutidos,
 * eles viravam `data:audio/ogg;base64,…`, e o CSP da tela não libera `data:` para som
 * (`media-src 'self' blob: mediastream: https: http:`). O navegador recusava tocar, o
 * `catch` do aviso engolia a recusa, e os sons simplesmente nunca tocaram, em versão
 * nenhuma — sem erro, sem registro. Medido com o CSP de verdade: o mesmo `.ogg` como
 * arquivo "tocou"; como `data:`, `NotSupportedError`.
 *
 * O conserto não é abrir o CSP: é som nunca ser embutido. Pelo TIPO, e não pelo tamanho,
 * porque o tamanho de um som é decidido por quem o gera — o próximo curto cairia de novo
 * abaixo dos 4 KB sem ninguém lembrar disto.
 */
const DE_MIDIA = /\.(ogg|opus|mp3|wav|m4a|aac|flac|webm|mp4)$/i;

/**
 * Fonte também nunca: o CSP não tem `font-src`, então vale `default-src 'self'`, e uma fonte
 * `data:` é recusada. A pecas.woff2 do xadrez tem 2.960 bytes e caía nos 4 KB — medido no
 * Chrome com o CSP da tela: "Loading the font 'data:font/woff2…' violates … default-src
 * 'self'". A Figtree tem 20 KB e sairia como arquivo de qualquer jeito, mas a regra é pelo
 * tipo, pelo mesmo motivo dos sons.
 */
const DE_FONTE = /\.(woff2?|ttf|otf)$/i;

/** `false` proíbe embutir; `undefined` deixa o Vite decidir pelo tamanho, como sempre. */
export function podeEmbutir(caminho: string): false | undefined {
  return DE_MIDIA.test(caminho) || DE_FONTE.test(caminho) ? false : undefined;
}

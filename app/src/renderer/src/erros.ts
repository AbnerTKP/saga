// Traduz erro de biblioteca em instrução. Separado da tela para poder ser testado.

/**
 * O Chromium diz "Could not start audio source" quando não consegue abrir a captura do
 * áudio do sistema. No Windows isso passa pelo dispositivo de SAÍDA padrão, então a causa
 * quase sempre está lá — e a mensagem genérica mandava a pessoa procurar no lugar errado.
 */
export function explicarFalhaDeAudio(motivo: string): string {
  if (/could not start audio source/i.test(motivo)) {
    return 'Compartilhando sem o áudio do sistema: o Windows não deixou capturá-lo. '
      + 'Quase sempre é o dispositivo de saída padrão — confira em Configurações › Som se o '
      + 'aparelho certo está selecionado, desligue o "modo exclusivo" nas propriedades dele, '
      + 'e evite fone Bluetooth em modo mãos-livres. Trocar a saída e compartilhar de novo costuma resolver.';
  }
  if (/permission|notallowed/i.test(motivo)) {
    return 'Compartilhando sem o áudio do sistema: faltou permissão para capturá-lo.';
  }
  return `Compartilhando sem o áudio do sistema (${motivo}).`;
}

/**
 * O Windows costuma expor o áudio da saída como um dispositivo de *entrada* — "Mixagem
 * estéreo" e parentes. Quando o caminho de loopback do Chromium é recusado pela máquina,
 * capturar por essa entrada dá o mesmo resultado por outra porta.
 *
 * Os nomes variam por idioma e por fabricante, daí a lista.
 */
const NOMES_DE_MIXAGEM =
  // Nativos da placa de som, por idioma e fabricante...
  /mixagem est|stereo mix|st[ée]r[ée]o mix|what u hear|wave out|mezcla est|mix de sortie|loopback/i;

// ...e os cabos virtuais, que é o que resta a quem não tem mixagem na placa. Ficam
// separados porque instalar um deles é a saída que a gente recomenda nesse caso.
const NOMES_DE_CABO_VIRTUAL = /cable output|vb-?audio|voicemeeter|virtual audio|\bvac\b/i;

export const pareceMixagemDoSistema = (rotulo: string) =>
  NOMES_DE_MIXAGEM.test(rotulo ?? '') || NOMES_DE_CABO_VIRTUAL.test(rotulo ?? '');

/**
 * A Electron avisa, na documentação do `desktopCapturer`, que uma captura de áudio
 * recusada no macOS vira uma faixa morta — sem erro, sem aviso. Foi assim que o Mac
 * passou a transmitir mudo sem ninguém descobrir por quê. Quando a faixa não vem,
 * é esta função que diz o que houve.
 *
 * Não perguntamos ao sistema se a permissão existe: ele já respondeu "negado" com as
 * chaves ligadas nos Ajustes, porque a permissão guardada é a da versão anterior do app.
 */
export function explicarTelaMuda(plataforma: string): string {
  if (plataforma === 'darwin') {
    return 'Transmitindo sem o áudio: o macOS aceitou compartilhar a tela, mas não entregou o '
      + 'som do sistema. Em Ajustes do Sistema › Privacidade e Segurança › Gravação do Áudio '
      + 'do Sistema e da Tela, ligue o Cantinho do Vorcaro — e se a chave já estiver ligada, '
      + 'desligue e ligue de novo, porque depois de atualizar o macOS guarda a permissão da '
      + 'versão anterior. Depois feche e abra o app.';
  }
  return 'Transmitindo sem o áudio do sistema: ele foi pedido, mas não veio junto com a tela.';
}

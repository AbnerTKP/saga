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

// Remoção de segredos do que vai para o registro. Fica separado do resto para poder ser
// testado sem carregar o Electron — e porque um descuido aqui vaza senha num arquivo
// feito justamente para ser compartilhado.

const SEGREDOS: [RegExp, string][] = [
  // Campos de senha em JSON ou em texto: senha, senhaRepetida, senhaDoGrupo, password.
  [/("?(?:senha\w*|password)"?\s*[:=]\s*)"[^"]*"/gi, '$1"<oculto>"'],
  [/("?(?:senha\w*|password)"?\s*[:=]\s*)(?!")(\S+)/gi, '$1<oculto>'],
  // Crachá de sessão, no cabeçalho ou solto.
  [/((?:x-sessao|authorization)"?\s*[:=]\s*)"?[A-Za-z0-9._-]{16,}"?/gi, '$1<oculto>'],
  [/(Bearer\s+)[A-Za-z0-9._-]{16,}/gi, '$1<oculto>'],
];

export function limparSegredos(texto: unknown): string {
  return SEGREDOS.reduce((t, [re, por]) => t.replace(re, por), String(texto ?? ''));
}

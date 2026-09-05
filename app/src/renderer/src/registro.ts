/** Manda para o registro em arquivo, sem nunca derrubar quem chamou. */
export function anotar(nivel: 'erro' | 'aviso' | 'info', origem: string, mensagem: unknown) {
  const texto = mensagem instanceof Error
    ? `${mensagem.message}\n${mensagem.stack ?? ''}`
    : typeof mensagem === 'string' ? mensagem : JSON.stringify(mensagem);
  window.desktop?.registrar(nivel, origem, texto).catch(() => undefined);
}

/**
 * Erro que ninguém tratou — tela branca, botão que não responde. É justamente o que a
 * pessoa não consegue descrever, e o que mais precisa estar no registro.
 */
export function capturarErrosGlobais() {
  window.addEventListener('error', (e) => {
    anotar('erro', 'tela', e.error ?? `${e.message} (${e.filename}:${e.lineno})`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    anotar('erro', 'tela', e.reason ?? 'promessa rejeitada sem motivo');
  });
}

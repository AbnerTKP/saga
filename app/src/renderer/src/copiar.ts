import { comLimite } from './limite.ts';

/** Resposta que não vem vira falha, e não um botão escrito "Copiando…" para sempre. */
export const PRAZO_DE_COPIAR = 3000;

/**
 * Põe um texto na área de transferência pelo processo principal, e só diz que copiou depois
 * que ele respondeu.
 *
 * O `writeText` do `navigator.clipboard` NÃO funciona na Saga: ele pede ao Electron a
 * permissão `clipboard-sanitized-write`, o porteiro do processo principal só libera mídia,
 * tela, notificação e tela cheia, e a promessa cai com "Write permission denied". Medido em
 * 12/10/2026, no Electron 39 com o mesmo porteiro. Os dois "Copiar" do convite iam por ali
 * sem esperar a resposta: escreviam "Copiado" e não copiavam nada.
 *
 * A ponte é a do "Copiar tudo" do registro de erros — o nome é do registro, mas ela escreve
 * qualquer texto com o `clipboard` do processo principal, que não passa por porteiro nenhum.
 * `ponte` e `prazo` são parâmetros para o teste; a tela usa os de sempre.
 */
export async function copiarTexto(
  texto: string,
  ponte: (texto: string) => Promise<void> = (t) => window.desktop.copiarRegistro(t),
  prazo = PRAZO_DE_COPIAR,
): Promise<boolean> {
  try {
    await comLimite(ponte(texto), prazo, 'sem resposta');
    return true;
  } catch {
    return false;
  }
}

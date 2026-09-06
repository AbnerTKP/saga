// Avisos sonoros: alguém entrou na call, alguém saiu, alguém abriu a live.
//
// Só as regras moram aqui, sem tocar em arquivo nem em `Audio`: é o que permite testar
// "não empilhar som" sem navegador. Os arquivos ficam em `sons/index.ts`.

export type Aviso = 'entrou' | 'saiu' | 'live';

/** Baixo de propósito: aviso que assusta é aviso que a pessoa desliga. */
export const VOLUME_DO_AVISO = 0.45;

/**
 * Quando três pessoas entram no mesmo instante, o LiveKit avisa três vezes e o mesmo som
 * sairia empilhado, virando ruído. Um intervalo mínimo entre repetições do MESMO aviso
 * resolve isso e não atrapalha o caso legítimo — alguém entra agora, outro entra depois.
 */
export const INTERVALO = 400;

export function podeTocar(
  agora: number,
  ultimo: number | undefined,
  surdo: boolean,
  intervalo = INTERVALO,
): boolean {
  // Quem está de ouvido desligado desligou tudo, avisos incluídos.
  if (surdo) return false;
  return ultimo === undefined || agora - ultimo >= intervalo;
}

/**
 * Devolve a função que toca os avisos. Cada som guarda o próprio instante do último
 * toque, então "entrou" não silencia "abriu a live".
 */
export function criarAvisos(
  arquivos: Record<Aviso, string>,
  tocar = (url: string, volume: number) => {
    const som = new Audio(url);
    som.volume = volume;
    // Aviso é acessório: se o navegador recusar tocar, isso não pode derrubar a tela.
    som.play().catch(() => undefined);
  },
) {
  const ultimos: Partial<Record<Aviso, number>> = {};
  return (qual: Aviso, surdo: boolean, agora = Date.now()) => {
    if (!podeTocar(agora, ultimos[qual], surdo)) return false;
    ultimos[qual] = agora;
    tocar(arquivos[qual], VOLUME_DO_AVISO);
    return true;
  };
}

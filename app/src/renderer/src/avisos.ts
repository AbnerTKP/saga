// Avisos sonoros: alguém entrou na call, alguém saiu, alguém abriu a live, alguém te chamou
// para jogar.
//
// Só as regras moram aqui, sem tocar em arquivo nem em `Audio`: é o que permite testar
// "não empilhar som" sem navegador. Os arquivos ficam em `sons/index.ts`.

export type Aviso =
  // acontecimentos da call e da Saga
  | 'entrou' | 'saiu' | 'live' | 'convite' | 'mensagem' | 'lance' | 'fimDaPartida'
  // alguém começou a assistir à SUA live (só quem transmite ouve)
  | 'plateia'
  // o que você acabou de fazer: confirmação, não notícia
  | 'liveEntrou' | 'liveSaiu' | 'micLigou' | 'micMutou';

/** Baixo de propósito: aviso que assusta é aviso que a pessoa desliga. */
export const VOLUME_DO_AVISO = 0.45;

/**
 * Os CHAMADOS: o que chega dirigido a você e pede que você olhe — a mensagem privada, o convite
 * para jogar e, desde 20/10/2026, alguém chegando na SUA live: quem transmite está dentro de um
 * jogo, e o pedido do dono foi justamente ouvir isso por cima dele. O dono pediu "um som mais evidente" (06/10/2026): no volume dos outros, eles se
 * perdiam embaixo do som de um jogo, que é justamente onde a pessoa está quando eles chegam.
 *
 * O resto continua baixo, e por um motivo cada: sair da call acontece o tempo todo e não é com
 * você (entrar tem volume próprio, logo abaixo); mutar, desmutar e a live são confirmação do que
 * a sua mão acabou de fazer; e o LANCE do xadrez toca a cada jogada do outro — numa partida,
 * dezenas de vezes —, então chamar alto em cada um seria o aviso que a pessoa desliga. O Catan
 * tem os seus em `somDoCatan.ts`.
 */
export const CHAMADOS: ReadonlySet<Aviso> = new Set<Aviso>(['mensagem', 'convite', 'plateia']);
export const VOLUME_DO_CHAMADO = 0.9;

/**
 * ENTRAR na call (você ou outro) fica entre os dois. O dono pediu "mais alto" (26/10/2026): a 0,45
 * e com o arquivo antigo, ele saía 11 dB abaixo da mensagem e 3,5 dB abaixo até do "saiu". Com o
 * arquivo tratado, a 0,8 ele sobe ~8 dB e fica ~4 dB abaixo da mensagem — alto, mas não um chamado.
 */
export const VOLUME_DA_ENTRADA = 0.8;

/** O volume de cada aviso: o dos chamados, o da entrada, ou o baixo de sempre. */
export const volumeDo = (qual: Aviso) =>
  CHAMADOS.has(qual) ? VOLUME_DO_CHAMADO : qual === 'entrou' ? VOLUME_DA_ENTRADA : VOLUME_DO_AVISO;

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

/** Toca de verdade, no navegador. Devolve a promessa do `play()` para a falha ter quem a veja. */
function tocarNoNavegador(url: string, volume: number): Promise<void> {
  const som = new Audio(url);
  som.volume = volume;
  return som.play();
}

/**
 * Devolve a função que toca os avisos. Cada som guarda o próprio instante do último
 * toque, então "entrou" não silencia "abriu a live".
 *
 * Aviso é acessório: se o navegador recusar tocar, isso não pode derrubar a tela. Mas
 * recusar em SILÊNCIO foi o que escondeu, por versões, que os sons de mutar e desmutar
 * nunca tocaram — o `catch` era `() => undefined`, e o CSP recusava cada um deles sem
 * deixar rastro. Por isso a recusa vai para `aoFalhar`, com o nome do som.
 */
export function criarAvisos(
  arquivos: Record<Aviso, string>,
  tocar: (url: string, volume: number) => unknown = tocarNoNavegador,
  aoFalhar?: (qual: Aviso, erro: unknown) => void,
) {
  const ultimos: Partial<Record<Aviso, number>> = {};
  return (qual: Aviso, surdo: boolean, agora = Date.now()) => {
    if (!podeTocar(agora, ultimos[qual], surdo)) return false;
    ultimos[qual] = agora;
    try {
      const tocando = tocar(arquivos[qual], volumeDo(qual));
      if (tocando instanceof Promise) tocando.catch((e) => aoFalhar?.(qual, e));
    } catch (e) {
      aoFalhar?.(qual, e);
    }
    return true;
  };
}

/**
 * O som da call que o iPhone parou enquanto a Saga estava atrás de outro app.
 *
 * Em segundo plano não há o que fazer: o Safari do iPhone suspende a página inteira, e o
 * microfone e o som da call param juntos — a Apple não deixa página nenhuma gravar com outro
 * app na frente. (O Chrome do Android 14 em diante também corta o microfone, uns 5 s depois:
 * falta a ele a permissão de microfone em segundo plano, Chromium 374374232.) O que dá para
 * fazer é VOLTAR direito — e era aí que a Saga falhava.
 *
 * Cada contexto de áudio da call (o caminho do microfone, que é o que os outros ouvem; o som
 * da call no iPhone, pelo `webAudioMix`; o anel de quem está falando) fica `interrupted`
 * quando a página vai para trás. A Saga e o LiveKit só retomavam o `suspended`: o
 * `interrupted` ficava parado, e quem voltava não era mais ouvido. E o WebKit às vezes
 * devolve um contexto `running` com o relógio parado (WebKit 263627), que só volta
 * suspendendo e retomando.
 */

/** O pedaço do `AudioContext` que isto usa — e que o teste consegue fingir. */
export type ContextoDeAudio = {
  readonly state: string;
  readonly currentTime: number;
  resume(): Promise<void>;
  suspend(): Promise<void>;
};

/** O `resume` pode nunca responder com a página atrás (WebKit 281566): não se espera mais que isto. */
export const LIMITE_PARA_RETOMAR_MS = 1500;
/** Tempo de sobra para o relógio de um contexto vivo andar. */
export const PARA_VER_O_RELOGIO_MS = 250;

export const precisaRetomar = (estado: string) => estado === 'suspended' || estado === 'interrupted';

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Acorda um contexto e diz se ele está tocando de verdade. `false` é "só um toque destrava",
 * e quem chama mostra o botão.
 *
 * O `resume` sai antes de qualquer espera: dentro de um toque, o iPhone só aceita retomar no
 * instante do toque.
 */
export async function acordarContexto(ctx: ContextoDeAudio, esperar = dormir): Promise<boolean> {
  // Fechado não é nosso para acordar: quem o usava já fez outro.
  if (ctx.state === 'closed') return true;
  const comLimite = (p: Promise<void>) =>
    Promise.race([p.catch(() => undefined), esperar(LIMITE_PARA_RETOMAR_MS)]);
  if (precisaRetomar(ctx.state)) await comLimite(ctx.resume());
  if (ctx.state !== 'running') return false;
  if (await relogioAndando(ctx, esperar)) return true;
  await comLimite(ctx.suspend().then(() => ctx.resume()));
  return relogioAndando(ctx, esperar);
}

async function relogioAndando(ctx: ContextoDeAudio, esperar: (ms: number) => Promise<void>) {
  const antes = ctx.currentTime;
  await esperar(PARA_VER_O_RELOGIO_MS);
  return ctx.state === 'running' && ctx.currentTime > antes;
}

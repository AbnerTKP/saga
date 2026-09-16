/**
 * O GIF parado num quadro só, e animando só quando alguém olha para ele.
 *
 * Medido em 16/09/2026, com a Saga escondida sobre uma cópia dos dados de produção e parada
 * numa tela onde nada acontecia: ela redesenhava a janela 58 vezes por segundo. Sem os GIFs
 * de foto e banner, e sem o arco-íris do Berserk, redesenhava ZERO vezes, e a CPU caiu de
 * 14% para 0,4% — os dois juntos eram o gasto inteiro. No Mac do dono, com a tela Retina a
 * 120 Hz, isso virava o processo de desenho e o da GPU perto de 100% cada um, com o
 * WindowServer atrás, e a Saga em segundo plano gastando mais que o jogo aberto na frente.
 * Um GIF de 200 px no canto basta: o Chromium repinta e o macOS recompõe a janela inteira a
 * cada quadro dele. É por isso que o Discord só anima avatar sob o mouse.
 *
 * O quadro parado sai do próprio arquivo, aqui no app, uma vez por arquivo — o nome é o hash
 * do conteúdo, então a URL nunca muda de imagem. O servidor manda os arquivos com CORS aberto,
 * que é o que deixa ler os bytes. É o quadro do MEIO, e não o primeiro: a foto do FelipeTKP
 * entra aparecendo, e o primeiro quadro dela é branco inteiro — virava um círculo vazio. Nos
 * outros GIFs dos perfis de hoje, o do meio e o primeiro têm o mesmo brilho, medido.
 */
import { useEffect, useState } from 'react';

/** Só o que pode animar precisa de quadro parado: GIF e WebP. */
export const podeAnimar = (url: string | null | undefined): boolean => !!url && /\.(gif|webp)(?:$|[?#])/i.test(url);

const prontos = new Map<string, Promise<string>>();

type Decodificador = {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
  decode(o: { frameIndex: number }): Promise<{ image: VideoFrame }>;
  close(): void;
};

/** O quadro do meio, já composto com os de antes, pelo `ImageDecoder` do Chromium. Null sem ele. */
async function quadroDoMeio(blob: Blob): Promise<VideoFrame | null> {
  const Classe = (globalThis as { ImageDecoder?: new (o: { data: ArrayBuffer; type: string }) => Decodificador }).ImageDecoder;
  if (!Classe) return null;
  const decodificador = new Classe({ data: await blob.arrayBuffer(), type: blob.type || 'image/gif' });
  try {
    await decodificador.tracks.ready;
    const quadros = decodificador.tracks.selectedTrack?.frameCount ?? 1;
    return (await decodificador.decode({ frameIndex: Math.floor(quadros / 2) })).image;
  } finally {
    decodificador.close();
  }
}

/** Uma URL local com um quadro parado da imagem. Falhando, a própria imagem: animada é melhor que sumida. */
export function quadroParado(url: string): Promise<string> {
  let p = prontos.get(url);
  if (!p) {
    p = (async () => {
      const resposta = await fetch(url);
      if (!resposta.ok) return url;
      const blob = await resposta.blob();
      const quadro = await quadroDoMeio(blob).catch(() => null) ?? await createImageBitmap(blob);
      const largura = 'displayWidth' in quadro ? quadro.displayWidth : quadro.width;
      const altura = 'displayHeight' in quadro ? quadro.displayHeight : quadro.height;
      const tela = new OffscreenCanvas(largura, altura);
      tela.getContext('2d')!.drawImage(quadro, 0, 0);
      quadro.close();
      return URL.createObjectURL(await tela.convertToBlob({ type: 'image/png' }));
    })().catch(() => url);
    prontos.set(url, p);
  }
  return p;
}

/**
 * O `src` a usar: a própria URL quando `animar` (ou quando a imagem não anima), o quadro
 * parado quando não. Null enquanto o quadro parado não fica pronto — mostrar o GIF nesse meio
 * tempo seria um piscar de animação a cada tela aberta.
 */
export function useImagemParada(url: string | null, animar: boolean): string | null {
  const anima = podeAnimar(url);
  const [parada, setParada] = useState<{ de: string; src: string } | null>(null);
  useEffect(() => {
    if (!url || !anima) return;
    let vivo = true;
    quadroParado(url).then((src) => { if (vivo) setParada({ de: url, src }); });
    return () => { vivo = false; };
  }, [url, anima]);
  if (!url || !anima || animar) return url;
  return parada?.de === url ? parada.src : null;
}

/** Onde apontar faz a foto animar: a linha inteira da pessoa ou da mensagem, e não só o círculo. */
const LINHA = '.msg, .membro-linha, .people > li, .quadro-servidor, button';

/**
 * Se o mouse está sobre a linha que contém o elemento — a mensagem, a pessoa na lista, a
 * pessoa na call. Devolve a função de `ref` para pôr no elemento.
 */
export function useApontado(): [boolean, (el: HTMLElement | null) => void] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [apontado, setApontado] = useState(false);
  useEffect(() => {
    if (!el) return;
    const alvo = (el.closest(LINHA) as HTMLElement | null) ?? el;
    const entrar = () => setApontado(true);
    const sair = () => setApontado(false);
    alvo.addEventListener('mouseenter', entrar);
    alvo.addEventListener('mouseleave', sair);
    if (alvo.matches(':hover')) setApontado(true);
    return () => { alvo.removeEventListener('mouseenter', entrar); alvo.removeEventListener('mouseleave', sair); };
  }, [el]);
  return [apontado, setEl];
}

/** Se a janela da Saga está em foco. Com o jogo na frente, nada na Saga precisa se mexer. */
export function useJanelaEmFoco(): boolean {
  const [foco, setFoco] = useState(() => document.hasFocus());
  useEffect(() => {
    const ganhar = () => setFoco(true);
    const perder = () => setFoco(false);
    window.addEventListener('focus', ganhar);
    window.addEventListener('blur', perder);
    return () => { window.removeEventListener('focus', ganhar); window.removeEventListener('blur', perder); };
  }, []);
  return foco;
}

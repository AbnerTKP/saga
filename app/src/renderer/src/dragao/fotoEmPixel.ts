/**
 * A foto de uma pessoa virada pixel art de 14x14, para o convite e o cartão do Dragão Quadrado: a
 * foto de verdade ao lado das letras de pixel parecia colada de outro programa. GIF vira o quadro
 * parado de `imagemParada.ts` (nada anima nas telas do jogo), e o resto vai como veio.
 *
 * O arquivo vem do servidor com CORS aberto: é isso que deixa ler os pixels da imagem sem sujar o
 * canvas.
 */
import { podeAnimar, quadroParado } from '../imagemParada';
import { type Quadro, criarQuadro, deCanais } from './quadro';

export const LADO_DA_FOTO = 14;
const prontas = new Map<string, Promise<Quadro | null>>();

/** Os tons descem a 12 por canal: é o que tira a cara de foto reduzida e dá a de pixel desenhado. */
const degrau = (v: number) => Math.round(Math.round((v / 255) * 11) * (255 / 11));

export function fotoEmPixel(url: string): Promise<Quadro | null> {
  let p = prontas.get(url);
  if (!p) {
    p = (async () => {
      const origem = podeAnimar(url) ? await quadroParado(url) : url;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = origem;
      await img.decode();
      const lado = Math.min(img.naturalWidth, img.naturalHeight);
      if (!lado) return null;
      const tela = new OffscreenCanvas(LADO_DA_FOTO, LADO_DA_FOTO);
      const ctx = tela.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, LADO_DA_FOTO, LADO_DA_FOTO);
      const d = ctx.getImageData(0, 0, LADO_DA_FOTO, LADO_DA_FOTO).data;
      const q = criarQuadro(LADO_DA_FOTO, LADO_DA_FOTO);
      for (let i = 0; i < q.px.length; i++) q.px[i] = deCanais(degrau(d[i * 4]), degrau(d[i * 4 + 1]), degrau(d[i * 4 + 2]));
      return q;
    })().catch(() => null);
    prontas.set(url, p);
  }
  return p;
}

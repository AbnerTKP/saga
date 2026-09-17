import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { urlDoArquivo, type ConviteDeLuta as Convite } from '../api';
import { FICHAS } from '../dragao/fichas';
import { fotoEmPixel } from '../dragao/fotoEmPixel';
import { CARTAO, type Regiao, desenharCartaoDeConvite, regiaoEm } from '../dragao/interface';
import { criarQuadro, type Quadro } from '../dragao/quadro';

/**
 * O convite para lutar, em pixel: o dono pediu o Dragão Quadrado inteiro na direção de arte do jogo,
 * e o cartão que aparece para o amigo em qualquer tela da Saga também. Fica na mesma pilha dos
 * convites do xadrez e da Fórmula 1, com o som de sempre. "Lutar" abre o jogo direto na escolha de
 * lutador daquela arena — escolher o lutador é a resposta. O lutador de quem chamou vai no detalhe
 * (um nome que este app não conhece fica de fora, em vez de derrubar a tela).
 */
export function ConviteDeLuta({ convite, servidorAberto, onLutar, onRecusar }: {
  convite: Convite;
  servidorAberto: number | null;
  onLutar: () => void;
  onRecusar: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const regioes = useRef<Regiao[]>([]);
  const [apontado, setApontado] = useState<'aceitar' | 'recusar' | null>(null);
  const [foto, setFoto] = useState<Quadro | null>(null);
  const url = urlDoArquivo(convite.de.foto);
  useEffect(() => {
    let vivo = true;
    setFoto(null);
    if (url) void fotoEmPixel(url).then((q) => { if (vivo) setFoto(q); });
    return () => { vivo = false; };
  }, [url]);

  const quadro = useMemo(() => criarQuadro(CARTAO.largura, CARTAO.altura), []);
  const deOutro = convite.servidor !== undefined && convite.servidor !== servidorAberto ? convite.servidorNome : null;
  const contra = convite.oponente && FICHAS[convite.oponente.lutador] ? convite.oponente.lutador : null;
  useLayoutEffect(() => {
    regioes.current = desenharCartaoDeConvite(quadro, {
      de: convite.de.nome, foto, cenario: convite.cenario, rounds: convite.rounds, contra, servidor: deOutro, apontado,
    });
    canvas.current?.getContext('2d')!.putImageData(
      new ImageData(new Uint8ClampedArray(quadro.px.buffer as ArrayBuffer, quadro.px.byteOffset, quadro.px.byteLength), quadro.largura, quadro.altura), 0, 0);
  });

  const alvoEm = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const reg = regiaoEm(regioes.current, ((e.clientX - r.left) * CARTAO.largura) / r.width, ((e.clientY - r.top) * CARTAO.altura) / r.height);
    return reg?.alvo.tipo === 'aceitar' || reg?.alvo.tipo === 'recusar' ? reg.alvo.tipo : null;
  };

  return (
    <div className="convite-em-pixel" role="alertdialog" aria-label={`${convite.de.nome} te chamou para lutar no Dragão Quadrado`}>
      <canvas ref={canvas} width={CARTAO.largura} height={CARTAO.altura}
        style={{ cursor: apontado ? 'pointer' : 'default' }}
        onMouseMove={(e) => { const a = alvoEm(e); if (a !== apontado) setApontado(a); }}
        onMouseLeave={() => setApontado(null)}
        onClick={(e) => { const a = alvoEm(e); if (a === 'aceitar') onLutar(); else if (a === 'recusar') onRecusar(); }} />
      {/* os botões de verdade, para teclado e leitor de tela: invisíveis, na mesma ordem */}
      <button type="button" className="convite-em-pixel-botao" onClick={onLutar}>Lutar</button>
      <button type="button" className="convite-em-pixel-botao" onClick={onRecusar}>Recusar</button>
    </div>
  );
}

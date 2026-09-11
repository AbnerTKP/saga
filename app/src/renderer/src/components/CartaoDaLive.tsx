import { useLayoutEffect, useRef } from 'react';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { ControleDeVolume } from './ControleDeVolume';
import { ROTULO_DA_ACAO, plateiaEmTexto, type AcaoDaLive } from '../cartaoDaLive';
import type { Enquadramento } from '../enquadramento';

/**
 * O cartão de uma live, aberto ao passar o mouse em quem transmite na barra lateral.
 *
 * Retrato, "ao vivo", nome e quantos estão vendo — e o que fazer, que depende de onde você
 * está (`cartaoDaLive.ts`). Na live que você JÁ assiste, ele traz o volume e o "Sair": dá
 * para ajustar sem voltar ao palco.
 *
 * Não traz a IMAGEM da transmissão, e não por esquecimento: só a live escolhida chega,
 * imagem e som, e abrir a faixa para uma prévia gastaria justamente a banda que essa
 * regra existe para poupar. É o mesmo motivo de o cartão do palco ser um retrato.
 */
export function CartaoDaLive({
  em, nome, foto, enquadramento, plateia, acao, volume, onVolume,
  onManter, onSoltar, onAssistir, onAbrirPalco, onSairDaLive,
}: {
  /** A borda direita da barra, e a altura do meio da linha de quem transmite. */
  em: { x: number; meio: number };
  nome: string;
  foto?: string | null;
  enquadramento?: Enquadramento | null;
  /** Os nomes de quem está vendo. */
  plateia: string[];
  acao: AcaoDaLive;
  /** O volume desta live para quem assiste — só aparece em quem já está assistindo. */
  volume: number;
  onVolume: (v: number) => void;
  /** O mouse chegou ao cartão: ir do nome até o botão não pode fechá-lo no caminho. */
  onManter: () => void;
  onSoltar: () => void;
  /** Assistir, ou entrar na call e assistir. */
  onAssistir: () => void;
  onAbrirPalco: () => void;
  onSairDaLive: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Na altura da pessoa, mas dentro da janela: perto do fim da barra ele sairia por baixo.
  // O `top` é só daqui — o React não o escreve —, então um redesenho não o desfaz.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const altura = el.offsetHeight;
    el.style.top = `${Math.max(8, Math.min(em.meio - altura / 2, window.innerHeight - altura - 8))}px`;
  }, [em.meio, acao, plateia.length]);

  return (
    <div ref={ref} className="cartao-live" style={{ left: em.x }} onMouseEnter={onManter} onMouseLeave={onSoltar}>
      <div className="cartao-live-cima">
        <Avatar nome={nome} foto={foto} enquadramento={enquadramento} tamanho="huge" />
        <span className="live-quem">
          {acao === 'assistindo'
            ? <span className="selo-ao-vivo assistindo">assistindo</span>
            : <span className="selo-ao-vivo"><span className="ponto" /> ao vivo</span>}
          <span className="strong">{nome}</span>
          <span className="cartao-live-plateia" title={plateia.length ? `Assistindo: ${plateia.join(', ')}` : undefined}>
            <Icon name="olho" size={13} /> {plateiaEmTexto(plateia.length)}
          </span>
        </span>
      </div>

      {acao === 'assistindo' ? (
        <>
          <div className="cartao-live-volume">
            <ControleDeVolume volume={volume} onVolume={onVolume} largura={150} />
          </div>
          <div className="cartao-live-botoes">
            <button type="button" className="secundario" onClick={onAbrirPalco}>Abrir no palco</button>
            <button type="button" className="sair-da-live" onClick={onSairDaLive}>
              <Icon name="close" size={13} /> Sair
            </button>
          </div>
        </>
      ) : acao === 'sua' ? (
        <div className="cartao-live-nota">{ROTULO_DA_ACAO.sua}</div>
      ) : (
        <button type="button" className="cartao-live-acao" onClick={onAssistir}>
          <Icon name="screen" size={14} /> {ROTULO_DA_ACAO[acao]}
        </button>
      )}
    </div>
  );
}

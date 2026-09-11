import { useLayoutEffect, useRef } from 'react';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { ROTULO_DA_ACAO, plateiaEmTexto, type AcaoDaLive } from '../cartaoDaLive';
import type { Enquadramento } from '../enquadramento';

/**
 * O cartão de uma live, aberto ao passar o mouse em quem transmite na barra lateral.
 *
 * É o cartão da faixa de baixo do palco — retrato, "ao vivo", nome e quantos estão
 * vendo —, só que alcançável de onde o ícone de tela já estava. Entrar numa live era
 * abrir a sala, achar o cartão e só então clicar; agora é passar o mouse e clicar.
 *
 * Não traz a IMAGEM da transmissão, e não por esquecimento: só a live escolhida chega,
 * imagem e som, e abrir a faixa para uma prévia gastaria justamente a banda que essa
 * regra existe para poupar. É o mesmo motivo de o cartão do palco ser um retrato.
 */
export function CartaoDaLive({ em, nome, foto, enquadramento, plateia, acao, onAcao, onEntrar, onSair }: {
  /** A borda direita da barra, e a altura do meio da linha de quem transmite. */
  em: { x: number; meio: number };
  nome: string;
  foto?: string | null;
  enquadramento?: Enquadramento | null;
  /** Os nomes de quem está vendo. */
  plateia: string[];
  acao: AcaoDaLive;
  onAcao: () => void;
  /** O mouse chegou ao cartão: ir do nome até o botão não pode fechá-lo no caminho. */
  onEntrar: () => void;
  onSair: () => void;
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

  const corpo = (
    <>
      <span className="cartao-live-cima">
        <Avatar nome={nome} foto={foto} enquadramento={enquadramento} tamanho="huge" />
        <span className="live-quem">
          <span className="selo-ao-vivo"><span className="ponto" /> ao vivo</span>
          <span className="strong">{nome}</span>
          <span className="cartao-live-plateia"
            title={plateia.length ? `Assistindo: ${plateia.join(', ')}` : undefined}>
            <Icon name="olho" size={13} /> {plateiaEmTexto(plateia.length)}
          </span>
        </span>
      </span>
      <span className={`cartao-live-acao ${acao}`}>
        {acao !== 'sua' && <Icon name={acao === 'assistindo' ? 'close' : 'screen'} size={14} />}
        {ROTULO_DA_ACAO[acao]}
      </span>
    </>
  );

  return (
    <div ref={ref} className="cartao-live" style={{ left: em.x }} onMouseEnter={onEntrar} onMouseLeave={onSair}>
      {/* O cartão inteiro é o botão, como o do palco: quem passou o mouse para assistir
          clica onde estiver olhando, e não só no pedaço escrito. A própria live não se
          assiste por aqui, então ela não vira botão. */}
      {acao === 'sua'
        ? <div className="cartao-live-corpo">{corpo}</div>
        : <button className="cartao-live-corpo" onClick={onAcao}>{corpo}</button>}
    </div>
  );
}

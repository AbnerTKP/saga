import type { ReactNode } from 'react';
import type { PessoaDaMesa } from '../api';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

/**
 * O cartão do convite para jogar, no canto — a opção C escolhida pelo dono: continua onde os
 * avisos moram, mas grande, com o que se vai jogar desenhado no alto, quem chamou, com quem, e
 * botões de verdade. Era uma linha de aviso com um link "agora não", e passava batido.
 *
 * Não some sozinho: quem chamou está esperando. Sai com a resposta, com quem chamou desistindo,
 * ou com o jogo começando sem você. O mesmo cartão serve ao xadrez e à Fórmula 1.
 */
export function CartaoDeConvite({ jogo, capa, de, titulo, detalhe, junto, aceitar, ocupado, onAceitar, onRecusar }: {
  jogo: string;
  /** O desenho do alto: a pista, ou o tabuleiro. */
  capa: ReactNode;
  de: PessoaDaMesa;
  titulo: string;
  detalhe: string;
  /** Quem já está no jogo, com a cor de cada um em volta da foto. */
  junto?: { pessoas: { pessoa: PessoaDaMesa; cor: string }[]; texto: string };
  aceitar: string;
  ocupado: boolean;
  onAceitar: () => void;
  onRecusar: () => void;
}) {
  return (
    <div className="cartao-de-convite" role="alertdialog" aria-label={titulo}>
      <div className="cartao-de-convite-capa">
        {capa}
        <span className="cartao-de-convite-rotulo"><Icon name="controle" size={14} />{jogo} · convite</span>
      </div>
      <div className="cartao-de-convite-corpo">
        <div className="cartao-de-convite-quem">
          <span className="cartao-de-convite-foto"><Avatar nome={de.nome} foto={de.foto} tamanho="big" /></span>
          <span className="cartao-de-convite-textos">
            <span className="cartao-de-convite-titulo">{titulo}</span>
            <span className="cartao-de-convite-detalhe">{detalhe}</span>
          </span>
        </div>
        {junto && junto.pessoas.length > 0 && (
          <div className="cartao-de-convite-junto">
            <span className="cartao-de-convite-fotos">
              {junto.pessoas.slice(0, 6).map(({ pessoa, cor }) => (
                <span key={pessoa.id} className="cartao-de-convite-mini" style={{ boxShadow: `0 0 0 2px var(--bg1), 0 0 0 4px ${cor}` }}>
                  <Avatar nome={pessoa.nome} foto={pessoa.foto} />
                </span>
              ))}
            </span>
            <span>{junto.texto}</span>
          </div>
        )}
        <div className="cartao-de-convite-botoes">
          <button type="button" className="secundario" disabled={ocupado} onClick={onRecusar}>Agora não</button>
          <button type="button" className="primary" disabled={ocupado} onClick={onAceitar}>{aceitar}</button>
        </div>
      </div>
    </div>
  );
}

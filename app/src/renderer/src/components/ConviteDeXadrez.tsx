import type { ConviteDeJogo } from '../api';
import { descreverMesa } from '../xadrez';
import { CartaoDeConvite } from './CartaoDeConvite';
import { Peca } from './Tabuleiro';

/**
 * O convite para jogar xadrez, no mesmo cartão da Fórmula 1: onde a pessoa estiver — lendo o
 * chat, na call ou olhando outro servidor —, até um "Jogar", um "Agora não" ou quem chamou
 * desistir. A capa é um pedaço de tabuleiro com um cavalo.
 */
export function ConviteDeXadrez({ convite, servidorAberto, ocupado, onJogar, onRecusar }: {
  convite: ConviteDeJogo;
  servidorAberto: number | null;
  ocupado: boolean;
  onJogar: () => void;
  onRecusar: () => void;
}) {
  const deOutro = convite.servidor !== undefined && convite.servidor !== servidorAberto && convite.servidorNome;
  return (
    <CartaoDeConvite
      jogo="Xadrez"
      capa={
        <span className="capa-de-xadrez" aria-hidden="true">
          {Array.from({ length: 30 }, (_, k) => <span key={k} className={`casa ${(Math.floor(k / 10) + k) % 2 ? 'escura' : 'clara'}`} />)}
          <span className="capa-de-xadrez-peca"><Peca letra="N" /></span>
        </span>
      }
      de={convite.de}
      titulo={`${convite.de.nome} te chamou para jogar xadrez`}
      detalhe={`${descreverMesa(convite.tempo, convite.cor)}${deOutro ? ` · em ${convite.servidorNome}` : ''}`}
      aceitar="Jogar"
      ocupado={ocupado}
      onAceitar={onJogar}
      onRecusar={onRecusar}
    />
  );
}

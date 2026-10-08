import type { ConviteDeJogo } from '../api';
import { jogoDaMesa } from '../jogos';
import { descreverMesa } from '../xadrez';
import { CartaoDeConvite } from './CartaoDeConvite';
import { Peca } from './Tabuleiro';
import { PecaDeDama } from './TabuleiroDaDama';

/** Três fileiras de tabuleiro e duas peças, uma delas dama: a capa da dama no menu e no convite. */
export function CapaDaDama() {
  return (
    <span className="capa-da-dama" aria-hidden="true">
      {Array.from({ length: 30 }, (_, k) => <span key={k} className={(Math.floor(k / 10) + k) % 2 ? 'escura' : 'clara'} />)}
      <span className="capa-da-dama-pecas"><PecaDeDama letra="p" /><PecaDeDama letra="D" /></span>
    </span>
  );
}

/**
 * O convite para jogar xadrez ou dama, no mesmo cartão dos outros jogos: onde a pessoa estiver —
 * lendo o chat, na call ou olhando outro servidor —, até um "Jogar", um "Agora não" ou quem
 * chamou desistir. A capa é um pedaço de tabuleiro com um cavalo, ou com as peças da dama.
 */
export function ConviteDeXadrez({ convite, servidorAberto, ocupado, onJogar, onRecusar }: {
  convite: ConviteDeJogo;
  servidorAberto: number | null;
  ocupado: boolean;
  onJogar: () => void;
  onRecusar: () => void;
}) {
  const deOutro = convite.servidor !== undefined && convite.servidor !== servidorAberto && convite.servidorNome;
  const daDama = jogoDaMesa(convite) === 'dama';
  return (
    <CartaoDeConvite
      jogo={daDama ? 'Dama' : 'Xadrez'}
      capa={daDama ? <CapaDaDama /> : (
        <span className="capa-de-xadrez" aria-hidden="true">
          {Array.from({ length: 30 }, (_, k) => <span key={k} className={`casa ${(Math.floor(k / 10) + k) % 2 ? 'escura' : 'clara'}`} />)}
          <span className="capa-de-xadrez-peca"><Peca letra="N" /></span>
        </span>
      )}
      de={convite.de}
      titulo={`${convite.de.nome} te chamou para jogar ${daDama ? 'dama' : 'xadrez'}`}
      detalhe={`${descreverMesa(convite.tempo, convite.cor)}${deOutro ? ` · em ${convite.servidorNome}` : ''}`}
      aceitar="Jogar"
      ocupado={ocupado}
      onAceitar={onJogar}
      onRecusar={onRecusar}
    />
  );
}

import type { ConviteDeJogo } from '../api';
import { descreverMesa } from '../xadrez';
import { Avatar } from './Avatar';

/**
 * O convite para jogar, no canto, onde a pessoa estiver: lendo o chat, na call ou fora dela.
 * Mora na pilha dos avisos, mas não some sozinho como eles — quem chamou está esperando a
 * resposta, e ele só sai com um "Jogar", um "agora não" ou com quem chamou desistindo.
 */
export function ConviteDeXadrez({ convite, ocupado, onJogar, onRecusar }: {
  convite: ConviteDeJogo;
  ocupado: boolean;
  onJogar: () => void;
  onRecusar: () => void;
}) {
  return (
    <div className="aviso convite-de-jogo" role="alert">
      <Avatar nome={convite.de.nome} foto={convite.de.foto} tamanho="big" />
      <div className="convite-de-jogo-corpo">
        <div className="convite-de-jogo-texto">
          <span className="strong">{convite.de.nome} te chamou para jogar xadrez</span>
          <span className="muted">{descreverMesa(convite.tempo, convite.cor)}</span>
        </div>
        <div className="convite-de-jogo-botoes">
          <button type="button" className="primary sm" disabled={ocupado} onClick={onJogar}>Jogar</button>
          <button type="button" className="link" disabled={ocupado} onClick={onRecusar}>agora não</button>
        </div>
      </div>
    </div>
  );
}

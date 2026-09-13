import type { ConviteDeCorrida as Convite } from '../api';
import { definicao } from '../pista';
import { Avatar } from './Avatar';

/**
 * O convite para correr, no canto, como o do xadrez: não some sozinho, porque quem chamou
 * está esperando. "Correr" abre o grid — é lá que se escolhe o carro.
 */
export function ConviteDeCorrida({ convite, ocupado, onCorrer, onRecusar }: {
  convite: Convite;
  ocupado: boolean;
  onCorrer: () => void;
  onRecusar: () => void;
}) {
  return (
    <div className="aviso convite-de-jogo" role="alert">
      <Avatar nome={convite.de.nome} foto={convite.de.foto} tamanho="big" />
      <div className="convite-de-jogo-corpo">
        <div className="convite-de-jogo-texto">
          <span className="strong">{convite.de.nome} te chamou para correr</span>
          <span className="muted">{definicao(convite.pista ?? 'interlagos').nome} · {convite.voltas} voltas · {convite.pilotos} de 8 no grid</span>
        </div>
        <div className="convite-de-jogo-botoes">
          <button type="button" className="primary sm" disabled={ocupado} onClick={onCorrer}>Correr</button>
          <button type="button" className="link" disabled={ocupado} onClick={onRecusar}>agora não</button>
        </div>
      </div>
    </div>
  );
}

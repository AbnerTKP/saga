import type { ReactNode } from 'react';
import type { Aviso } from '../avisosDeTela';
import { Icon } from './Icon';

const ICONE: Record<Aviso['tipo'], string> = {
  erro: 'close',
  aviso: 'texto',
  sucesso: 'send',
  turbo: 'berserk',
  info: 'pessoas',
};

/**
 * Os avisos empilhados no canto. Cada tipo tem cor e peso próprios: quem olha de relance
 * precisa saber, antes de ler, se aquilo é um problema ou um convite.
 *
 * `extra` é o que não some sozinho — hoje o convite para jogar xadrez. Ele entra primeiro na
 * pilha e, como ela cresce de baixo para cima, fica na ponta de baixo: o que pede resposta
 * é o que está mais perto da mão.
 */
export function Avisos({ avisos, extra, onFechar, onRegistro }: {
  avisos: Aviso[];
  extra?: ReactNode;
  onFechar: (id: number) => void;
  onRegistro: () => void;
}) {
  if (avisos.length === 0 && !extra) return null;

  return (
    <div className="avisos">
      {extra}
      {avisos.map((a) => (
        <div key={a.id} className={`aviso ${a.tipo}`} role="status">
          <span className="aviso-icone"><Icon name={ICONE[a.tipo]} size={16} /></span>
          <span className="aviso-texto">{a.texto}</span>
          {/* O atalho para o registro só faz sentido no que quebrou. */}
          {a.tipo === 'erro' && (
            <button className="link" onClick={onRegistro}>registro</button>
          )}
          <button className="icon aviso-fechar" title="Fechar" onClick={() => onFechar(a.id)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

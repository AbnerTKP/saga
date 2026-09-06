import type { Aviso } from '../avisosDeTela';
import { Icon } from './Icon';

const ICONE: Record<Aviso['tipo'], string> = {
  erro: 'close',
  aviso: 'texto',
  sucesso: 'send',
  turbo: 'mjolnir',
  info: 'pessoas',
};

/**
 * Os avisos empilhados no canto. Cada tipo tem cor e peso próprios: quem olha de relance
 * precisa saber, antes de ler, se aquilo é um problema ou um convite.
 */
export function Avisos({ avisos, onFechar, onRegistro }: {
  avisos: Aviso[];
  onFechar: (id: number) => void;
  onRegistro: () => void;
}) {
  if (avisos.length === 0) return null;

  return (
    <div className="avisos">
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

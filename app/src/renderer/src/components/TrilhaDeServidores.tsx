import { urlDoArquivo, type Servidor } from '../api';
import { Icon } from './Icon';

/**
 * A barra dos servidores. Fica à direita e é quadrada — de propósito diferente do
 * Discord, que põe redondo à esquerda.
 *
 * O primeiro botão não é um servidor: são as suas CONVERSAS, que não pertencem a
 * servidor nenhum. Ele fica separado por um risco justamente para dizer isso — daí para
 * baixo é "onde eu estou", e ali em cima é "com quem eu falo".
 */
export function TrilhaDeServidores({ servidores, atual, onEscolher, onAjustar, onConfigurar, modoConversas, aviso, onConversas }: {
  servidores: Servidor[];
  atual: number;
  onEscolher: (id: number) => void;
  /** Botão direito no quadrado: as configurações DAQUELE servidor. */
  onAjustar: (id: number) => void;
  onConfigurar: () => void;
  /** A coluna da esquerda está mostrando as conversas: nenhum servidor está aberto. */
  modoConversas: boolean;
  /**
   * Mensagens privadas por ler somadas aos pedidos de amizade esperando.
   *
   * Um número só porque a marca responde a uma pergunta só — "tem coisa sua esperando ali
   * dentro?" —, e porque o quadrado tem 42 px: duas marcas nele viram sujeira.
   */
  aviso: number;
  onConversas: () => void;
}) {
  return (
    <nav className="trilha" aria-label="Servidores">
      <button
        className={`quadro-conversas ${modoConversas ? 'atual' : ''}`}
        title="Suas conversas e seus amigos"
        onClick={onConversas}
      >
        <Icon name="texto" size={22} />
        {/* Com as conversas abertas a marca não aparece: você está justamente ali. */}
        {!modoConversas && aviso > 0 && (
          <span className="marca-nova">{aviso > 99 ? '99+' : aviso}</span>
        )}
      </button>
      <span className="trilha-risco" aria-hidden />

      {servidores.map((s) => {
        const foto = urlDoArquivo(s.foto);
        return (
          <button
            key={s.id}
            className={`quadro-servidor ${!modoConversas && s.id === atual ? 'atual' : ''}`}
            title={`${s.nome} — botão direito para as configurações`}
            onClick={() => onEscolher(s.id)}
            onContextMenu={(e) => { e.preventDefault(); onAjustar(s.id); }}
          >
            {foto ? <img src={foto} alt="" draggable={false} /> : <span>{s.nome.slice(0, 2).toUpperCase()}</span>}
          </button>
        );
      })}

      <button className="quadro-servidor acao" title="Entrar com um convite ou criar um servidor" onClick={onConfigurar}>+</button>
    </nav>
  );
}

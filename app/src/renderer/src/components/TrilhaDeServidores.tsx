import { urlDoArquivo, type Servidor } from '../api';
import { PODE_CRIAR_SERVIDOR } from '../travas';

/**
 * A barra dos servidores. Fica à direita e é quadrada — de propósito diferente do
 * Discord, que põe redondo à esquerda. Hoje mostra um servidor; a estrutura já é de lista
 * porque é o que vem em seguida.
 */
export function TrilhaDeServidores({ servidores, atual, onEscolher, onConfigurar }: {
  servidores: Servidor[];
  atual: number;
  onEscolher: (id: number) => void;
  onConfigurar: () => void;
}) {
  return (
    <nav className="trilha" aria-label="Servidores">
      {servidores.map((s) => {
        const foto = urlDoArquivo(s.foto);
        return (
          <button
            key={s.id}
            className={`quadro-servidor ${s.id === atual ? 'atual' : ''}`}
            title={s.nome}
            onClick={() => onEscolher(s.id)}
          >
            {foto ? <img src={foto} alt="" draggable={false} /> : <span>{s.nome.slice(0, 2).toUpperCase()}</span>}
          </button>
        );
      })}

      <button className="quadro-servidor acao" title={PODE_CRIAR_SERVIDOR ? 'Criar servidor ou entrar com convite' : 'Entrar num servidor com convite'} onClick={onConfigurar}>+</button>
    </nav>
  );
}

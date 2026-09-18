import { urlDoArquivo, type Servidor } from '../api';
import { useApontado, useImagemParada } from '../imagemParada';
import { estilo, type Enquadramento } from '../enquadramento';
import { Icon } from './Icon';

/**
 * A barra dos servidores. É quadrada — "redondo é pessoa, quadrado é servidor" — e mora à
 * ESQUERDA desde 18/09/2026. Ficou à direita da v0.15.0 até ali, "de propósito diferente
 * do Discord"; na reestruturação o dono a trouxe para onde a mão procura: trocar de servidor
 * era ir à borda direita e voltar à coluna de salas, ~1.050 px por troca, passando por cima
 * da lista de pessoas. A identidade ficou no formato, na caixa das conversas e no risco.
 *
 * O primeiro botão não é um servidor: são as suas CONVERSAS, que não pertencem a
 * servidor nenhum. Ele fica separado por um risco justamente para dizer isso — daí para
 * baixo é "onde eu estou", e ali em cima é "com quem eu falo".
 */
export function TrilhaDeServidores({ servidores, atual, servidorDaVoz, onEscolher, onAjustar, onConfigurar, modoConversas, aviso, onConversas, onAdministracao }: {
  servidores: Servidor[];
  atual: number;
  /** Onde a SUA voz está — pode ser outro servidor que não o aberto ("olhar não é sair"). */
  servidorDaVoz: number | null;
  onEscolher: (id: number) => void;
  /** Botão direito no quadrado: o menu DAQUELE servidor, onde o mouse está. */
  onAjustar: (id: number, em: { x: number; y: number }) => void;
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
  /** A administração da Saga. Só vem para o dono da Saga; sem ela, a porta não existe. */
  onAdministracao?: () => void;
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
            title={`${s.nome} — botão direito para o menu e as configurações`}
            onClick={() => onEscolher(s.id)}
            onContextMenu={(e) => { e.preventDefault(); onAjustar(s.id, { x: e.clientX, y: e.clientY }); }}
          >
            {foto ? <FotoDoServidor url={foto} enquadramento={s.enquadramento?.foto} /> : <span>{s.nome.slice(0, 2).toUpperCase()}</span>}
            {/* Onde a sua voz está: o painel da call dizia em texto; a trilha não dizia nada. */}
            {s.id === servidorDaVoz && (
              <span className="quadro-voz" aria-label="Sua voz está aqui"><Icon name="speaker" size={10} /></span>
            )}
          </button>
        );
      })}

      <button className="quadro-servidor acao" title="Entrar com um convite ou criar um servidor" onClick={onConfigurar}>+</button>

      {/* A administração mora na trilha, e não num menu. O painel da Saga já morou escondido
          no menu de status, e o dono teve de perguntar onde ficava; um quadrado a mais na
          fila dos servidores fica onde a mão já procura "os servidores todos". */}
      {onAdministracao && (
        <button
          className="quadro-servidor acao adm-porta"
          title="Administração da Saga — todos os servidores"
          onClick={onAdministracao}
        >
          <Icon name="grade" size={18} />
        </button>
      )}
    </nav>
  );
}

/**
 * A foto do servidor: GIF parado, animando com o mouse em cima (ver imagemParada.ts), e no
 * enquadramento que quem gere o servidor escolheu — a mesma conta da prévia do editor.
 */
export function FotoDoServidor({ url, enquadramento }: { url: string; enquadramento?: Enquadramento | null }) {
  const [apontado, apontar] = useApontado();
  const src = useImagemParada(url, apontado);
  return <img ref={apontar} src={src ?? undefined} alt="" draggable={false} style={estilo(enquadramento)} />;
}

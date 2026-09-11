import { Icon } from './Icon';

/**
 * A sua partida, no alto do chat e do palco, quando você saiu dela: com quem, de quem é a
 * vez e o caminho de volta. É a mesma barra da faixa da call, logo abaixo dela — quem sai
 * para ler uma mensagem no meio de uma partida não pode perdê-la de vista, porque o relógio
 * continua correndo.
 */
export function FaixaDaPartida({ estado, titulo, minhaVez, outroNome, onVoltar }: {
  estado: 'lobby' | 'jogando' | 'fim';
  /** "TKP × Juninho", ou "mesa aberta" antes de começar. */
  titulo: string;
  minhaVez: boolean;
  /** O adversário, para dizer de quem é a vez quando não é a sua. */
  outroNome: string | null;
  onVoltar: () => void;
}) {
  return (
    <div className="faixa-palco faixa-da-partida">
      <span className="faixa-icone"><Icon name="controle" size={15} /></span>
      <span className="faixa-nome strong">Xadrez</span>
      <span className="faixa-partida-titulo">{titulo}</span>
      {estado === 'jogando' && (
        <span className={`xadrez-chip ${minhaVez ? 'vez' : ''}`}>
          {minhaVez ? 'Sua vez' : outroNome ? `vez de ${outroNome}` : 'vez do outro'}
        </span>
      )}
      {estado === 'fim' && <span className="xadrez-chip">terminou</span>}
      <span className="spacer" />
      <button type="button" className="faixa-abrir" onClick={onVoltar}>
        {estado === 'jogando' ? 'Voltar à partida' : 'Voltar à mesa'}
      </button>
    </div>
  );
}

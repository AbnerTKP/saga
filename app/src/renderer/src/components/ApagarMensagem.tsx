import { useState } from 'react';
import { urlDoArquivo, type Mensagem } from '../api';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Nome } from './Nome';
import { useFecharComEsc } from '../useFechar';

/**
 * A confirmação de apagar, com a mensagem desenhada dentro.
 *
 * Mostrar a mensagem é o ponto: "apagar esta?" só se responde vendo qual é. É a caixa
 * pequena de sempre do app (a de criar sala), e o vermelho cheio fica só aqui, onde apagar
 * É a ação da caixa. O foco nasce nele: Enter apaga, Esc desiste. Dando errado, a caixa
 * fica aberta com o motivo — fechar calada deixaria a mensagem na tela sem explicação.
 */
export function ApagarMensagem({ mensagem, minha, quando, onApagar, onClose }: {
  mensagem: Mensagem;
  minha: boolean;
  /** Dia e hora, como "Hoje às 14:03". */
  quando: string;
  onApagar: () => Promise<void>;
  onClose: () => void;
}) {
  const [apagando, setApagando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Com o pedido indo, sair não desfaz nada: a caixa espera a resposta.
  useFecharComEsc(() => { if (!apagando) onClose(); });

  const apagar = async () => {
    setApagando(true);
    setErro(null);
    try {
      await onApagar();
      onClose();
    } catch (e) {
      setErro((e as Error).message);
      setApagando(false);
    }
  };

  return (
    <div className="modal-back" onClick={apagando ? undefined : onClose}>
      <div className="modal small apagar-mensagem" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="strong">Apagar mensagem</span>
          <button className="icon" onClick={onClose} disabled={apagando}><Icon name="close" /></button>
        </div>
        <div className="pad form">
          <p className="muted aviso-de-apagar">
            {minha
              ? 'Ela some para todo mundo, e não tem volta.'
              : `A mensagem de ${mensagem.nome} some para todo mundo, e não tem volta.`}
          </p>
          <div className={`previa-da-mensagem ${minha ? 'mine' : ''}`}>
            <div className="msg-lado">
              <Avatar nome={mensagem.nome} foto={mensagem.foto} enquadramento={mensagem.enquadramento?.foto} tamanho="big" />
            </div>
            <div className="msg-corpo">
              <div className="msg-topo">
                <span className="msg-nome"><Nome nome={mensagem.nome} id={mensagem.idExibido} turbo={mensagem.turbo} /></span>
                <span className="time">{quando}</span>
              </div>
              {mensagem.texto && <div className="text">{mensagem.texto}</div>}
              {mensagem.imagem && <img className="previa-imagem" src={urlDoArquivo(mensagem.imagem)!} alt="" draggable={false} />}
              {mensagem.arquivo && (
                <div className="previa-anexo"><Icon name="anexo" size={16} /> {mensagem.arquivo.nome}</div>
              )}
            </div>
          </div>
          {erro && <div className="error">{erro}</div>}
          <div className="linha-botoes">
            <button className="link" onClick={onClose} disabled={apagando}>cancelar</button>
            <button className="primary destrutivo" autoFocus disabled={apagando} onClick={apagar}>
              {apagando ? 'Apagando…' : 'Apagar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

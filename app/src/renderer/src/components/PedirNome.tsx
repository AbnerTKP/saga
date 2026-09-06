import { useState } from 'react';
import { Icon } from './Icon';

/**
 * Uma caixinha para digitar um nome e confirmar.
 *
 * Existe porque o `window.prompt` não funciona no Electron — ele não é implementado, e
 * some sem dizer nada. Criar sala, criar categoria e renomear pedem a mesma coisa, então
 * pedem pela mesma caixa.
 */
export function PedirNome({ titulo, rotulo, exemplo, inicial = '', confirmar = 'Criar', onPronto, onClose }: {
  titulo: string;
  rotulo: string;
  exemplo?: string;
  inicial?: string;
  confirmar?: string;
  onPronto: (nome: string) => void;
  onClose: () => void;
}) {
  const [nome, setNome] = useState(inicial);
  const vazio = !nome.trim();

  const enviar = () => { if (!vazio) { onPronto(nome.trim()); onClose(); } };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="strong">{titulo}</span>
          <button className="icon" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="pad form">
          <label>
            {rotulo}
            <input
              autoFocus
              value={nome}
              maxLength={32}
              placeholder={exemplo}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') enviar(); }}
            />
          </label>
          <div className="linha-botoes">
            <button className="link" onClick={onClose}>cancelar</button>
            <button className="primary" disabled={vazio} onClick={enviar}>{confirmar}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

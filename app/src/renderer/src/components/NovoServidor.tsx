import { useState, type ClipboardEvent } from 'react';
import { criarServidor, entrarComConvite } from '../api';
import { Icon } from './Icon';
import { useFecharComEsc } from '../useFechar';
import { conviteDepoisDeColar, conviteDigitado } from '../convite';

/** Criar um servidor ou entrar num com código de convite. */
export function NovoServidor({ inicial = 'entrar', onPronto, onClose }: {
  /** Com qual aba abrir. Quem clicou em "criar" não quer chegar na de convite. */
  inicial?: 'criar' | 'entrar';
  onPronto: (id: number) => void;
  onClose: () => void;
}) {
  // Esc fecha: uma saída que não depende de acertar o X — ver useFechar.ts.
  useFecharComEsc(onClose);
  const [aba, setAba] = useState<'criar' | 'entrar'>(inicial);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const criando = aba === 'criar';

  // Colar passa pela arrumação ANTES de o navegador aparar: o convite copiado de uma conversa
  // vem com espaço, hífen ou a mensagem inteira em volta. A conta mora em `convite.ts`.
  const colarConvite = (e: ClipboardEvent<HTMLInputElement>) => {
    if (criando) return;
    const campo = e.currentTarget;
    e.preventDefault();
    setTexto(conviteDepoisDeColar(
      campo.value, campo.selectionStart ?? campo.value.length, campo.selectionEnd ?? campo.value.length,
      e.clipboardData.getData('text'),
    ));
  };

  const enviar = async () => {
    setErro(null); setOcupado(true);
    try {
      const r = criando ? await criarServidor(texto) : await entrarComConvite(texto);
      onPronto(r.servidor.id);
      onClose();
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="strong">Servidores</span>
          <button className="icon" onClick={onClose}><Icon name="close" /></button>
        </div>

        <div className="pad form">
          <div className="tabs">
            <button className={!criando ? 'active' : ''} onClick={() => { setAba('entrar'); setErro(null); setTexto(''); }}>
              Entrar com convite
            </button>
            <button className={criando ? 'active' : ''} onClick={() => { setAba('criar'); setErro(null); setTexto(''); }}>
              Criar um
            </button>
          </div>

          <label>
            {criando ? 'Nome do servidor' : 'Código do convite'}
            <input
              autoFocus
              value={texto}
              // No convite, quem corta em 8 é `conviteDigitado`, DEPOIS de tirar hífen e espaço:
              // um `maxLength` 8 cortava antes, e "ABCD-2345" chegava ao servidor sem o 5.
              maxLength={criando ? 40 : undefined}
              placeholder={criando ? 'Cardume dos Jogos' : 'ABCD2345'}
              onChange={(e) => setTexto(criando ? e.target.value : conviteDigitado(e.target.value))}
              onPaste={colarConvite}
              onKeyDown={(e) => { if (e.key === 'Enter' && texto.trim()) enviar(); }}
            />
            <small className="muted">
              {criando
                ? 'Você vira dono dele, com uma sala de voz e uma de texto para começar.'
                : 'Peça a quem já está dentro. O código vale por uma semana.'}
            </small>
          </label>

          {erro && <div className="error">{erro}</div>}

          <button className="primary" disabled={ocupado || !texto.trim()} onClick={enviar}>
            {ocupado ? 'Um instante…' : criando ? 'Criar servidor' : 'Entrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

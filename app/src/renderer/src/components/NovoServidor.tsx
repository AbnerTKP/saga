import { useState } from 'react';
import { criarServidor, entrarComConvite } from '../api';
import { Icon } from './Icon';

/** Criar um servidor ou entrar num com código de convite. */
export function NovoServidor({ onPronto, onClose }: {
  onPronto: (id: number) => void;
  onClose: () => void;
}) {
  const [aba, setAba] = useState<'criar' | 'entrar'>('criar');
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const criando = aba === 'criar';

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
            <button className={criando ? 'active' : ''} onClick={() => { setAba('criar'); setErro(null); setTexto(''); }}>
              Criar um
            </button>
            <button className={!criando ? 'active' : ''} onClick={() => { setAba('entrar'); setErro(null); setTexto(''); }}>
              Entrar com convite
            </button>
          </div>

          <label>
            {criando ? 'Nome do servidor' : 'Código do convite'}
            <input
              autoFocus
              value={texto}
              maxLength={criando ? 40 : 8}
              placeholder={criando ? 'Cantinho dos Jogos' : 'ABCD2345'}
              onChange={(e) => setTexto(criando ? e.target.value : e.target.value.toUpperCase())}
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

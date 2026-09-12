import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { useFecharComEsc } from '../useFechar';
import { criarConvite, type Convite } from '../api';

/**
 * A caixa de convidar gente.
 *
 * O código já nasce gerado: quem abriu isto veio convidar alguém, e um campo vazio com um
 * botão "Gerar" é um clique que não decide nada — o mesmo motivo pelo qual o cursor já
 * chega no campo ao abrir uma sala de texto. Falhando, o botão vira "Tentar de novo": não
 * ter carregado não é não ter, e o painel do servidor já aprendeu essa lição.
 */
export function Convidar({ nomeDoServidor, onClose }: {
  nomeDoServidor: string;
  onClose: () => void;
}) {
  // Esc fecha: uma saída que não depende de acertar o X — ver useFechar.ts.
  useFecharComEsc(onClose);
  const [convite, setConvite] = useState<Convite | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const gerar = async () => {
    setErro(null); setOcupado(true); setCopiado(false);
    try { setConvite(await criarConvite()); }
    catch (e) { setErro((e as Error).message); }
    finally { setOcupado(false); }
  };

  useEffect(() => { void gerar(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const copiar = () => {
    if (!convite) return;
    navigator.clipboard?.writeText(convite.codigo);
    setCopiado(true);
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="strong">Convidar gente</span>
          <button className="icon" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="pad">
          {erro && <div className="error" style={{ marginBottom: 12 }}>{erro}</div>}
          <p className="muted small" style={{ margin: '0 0 12px' }}>
            Mande este código para quem você quer trazer para <b className="strong">{nomeDoServidor}</b>.
            Vale por uma semana; quem entrar cai no cargo mais baixo.
          </p>
          <div className="linha-campo">
            <input
              readOnly
              className="codigo-convite"
              value={convite?.codigo ?? ''}
              placeholder={ocupado ? '…' : '—'}
              onFocus={(e) => e.currentTarget.select()}
            />
            {convite ? (
              <button className="primary" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar'}</button>
            ) : (
              <button className="primary" disabled={ocupado} onClick={gerar}>
                {ocupado ? 'Gerando…' : 'Tentar de novo'}
              </button>
            )}
          </div>
          {convite && (
            <div className="linha-botoes" style={{ marginTop: 12 }}>
              <button className="link" onClick={gerar} disabled={ocupado}>gerar outro código</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

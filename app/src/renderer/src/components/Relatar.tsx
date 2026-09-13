import { useEffect, useState } from 'react';
import { enviarRelato } from '../api';
import { useFecharComEsc } from '../useFechar';
import { montarRelato, nomeDoSistema, ondeEstou, podeEnviar, TEXTO_MAXIMO, type TipoDeRelato } from '../relato';
import { Icon } from './Icon';

/** O aviso de "recebido" sai pela pilha do `App`, que é quem desenha os avisos. Ver `App.tsx`. */
export const EVENTO_DO_AVISO = 'saga:aviso';

/** O balão com a exclamação: é "dizer algo sobre o app", não um erro acontecendo agora. */
function IconeDeRelato({ tamanho }: { tamanho: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12z" />
      <path d="M12 8v4.2" />
      <circle cx="12" cy="15.6" r=".6" fill="currentColor" />
    </svg>
  );
}

/**
 * O botão "Relatar", na faixa do alto da janela — a opção B, escolhida pelo dono entre três
 * desenhos fotografados no app de verdade. A faixa está em toda tela e é quase vazia, então o
 * botão fica sempre à mão sem pesar: cinza apagado, e acende só com o mouse.
 */
export function BotaoDeRelatar() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" className="relatar-faixa" title="Relatar um erro ou sugerir uma melhoria"
        onClick={() => setAberto(true)}>
        <IconeDeRelato tamanho={14} />
        <span>Relatar</span>
      </button>
      {aberto && <CaixaDeRelato onClose={() => setAberto(false)} />}
    </>
  );
}

function CaixaDeRelato({ onClose }: { onClose: () => void }) {
  useFecharComEsc(onClose);
  const [tipo, setTipo] = useState<TipoDeRelato>('erro');
  const [texto, setTexto] = useState('');
  const [anexar, setAnexar] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [versao, setVersao] = useState<string | null>(null);
  useEffect(() => { window.desktop.version().then(setVersao).catch(() => setVersao(null)); }, []);
  const sistema = nomeDoSistema(window.desktop.platform);

  const enviar = async () => {
    if (!podeEnviar(texto) || enviando) return;
    setEnviando(true);
    setFalha(null);
    try {
      const registro = tipo === 'erro' && anexar ? await window.desktop.lerRegistro().catch(() => null) : null;
      const onde = ondeEstou();
      await enviarRelato(montarRelato({
        tipo, texto, anexarRegistro: anexar, registro, versao, sistema, servidor: onde.servidor, tela: onde.tela,
      }));
      window.dispatchEvent(new CustomEvent(EVENTO_DO_AVISO, {
        detail: { tipo: 'sucesso', texto: 'Recebido. O dono da Saga vai ler e decidir o que entra.' },
      }));
      onClose();
    } catch (e) {
      // A caixa fica aberta com o texto: falhar em enviar não pode apagar o que a pessoa escreveu.
      setFalha((e as Error).message);
      setEnviando(false);
    }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="strong">Relatar</span>
          <button className="icon" onClick={onClose} title="Fechar"><Icon name="close" /></button>
        </div>
        <div className="pad form relato">
          <div className="relato-tipos" role="radiogroup">
            <button type="button" role="radio" aria-checked={tipo === 'erro'}
              className={`relato-tipo ${tipo === 'erro' ? 'escolhido' : ''}`} onClick={() => setTipo('erro')}>
              Algo deu errado
            </button>
            <button type="button" role="radio" aria-checked={tipo === 'melhoria'}
              className={`relato-tipo ${tipo === 'melhoria' ? 'escolhido' : ''}`} onClick={() => setTipo('melhoria')}>
              Ideia de melhoria
            </button>
          </div>
          <label>
            {tipo === 'erro' ? 'O que aconteceu?' : 'O que você queria?'}
            <textarea
              className="relato-texto"
              autoFocus
              value={texto}
              maxLength={TEXTO_MAXIMO}
              placeholder={tipo === 'erro'
                ? 'O que você estava fazendo, e o que aconteceu de errado'
                : 'O que faria a Saga melhor para você'}
              onChange={(e) => setTexto(e.target.value)}
            />
          </label>
          {tipo === 'erro' && (
            <label className="check">
              <input type="checkbox" checked={anexar} onChange={(e) => setAnexar(e.target.checked)} />
              Mandar junto o registro de erros (sem senhas)
            </label>
          )}
          <span className="relato-contexto">
            Vai junto: {versao ? `versão ${versao}, ` : ''}{sistema} e a tela em que você está.
          </span>
          {falha && <div className="error">{falha}</div>}
          <div className="linha-botoes">
            <button type="button" className="link" onClick={onClose}>cancelar</button>
            <button type="button" className="primary" disabled={!podeEnviar(texto) || enviando} onClick={enviar}>
              {enviando ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import type { SourceInfo } from '../desktop';
import { Icon } from './Icon';

export function ScreenPicker({ onClose, onPick }: { onClose: () => void; onPick: (id: string, audio: boolean) => void }) {
  const [sources, setSources] = useState<SourceInfo[] | null>(null);
  const [tab, setTab] = useState<'screen' | 'window'>('screen');
  const [sel, setSel] = useState<string | null>(null);
  const [audio, setAudio] = useState(true);

  useEffect(() => {
    (async () => {
      const list = await window.desktop.listSources();
      setSources(list);
      setSel(list.find((s) => s.kind === 'screen')?.id ?? list[0]?.id ?? null);
    })();
  }, []);

  // Quem diz se a permissão existe é o sistema devolver, ou não, a lista de telas. O
  // `getMediaAccessStatus` já respondeu "negado" com as chaves ligadas nos Ajustes: a
  // entrada na lista guarda a assinatura da versão anterior, e cada build nossa tem a
  // sua. A lista vazia é o sintoma real, e é nele que se confia.
  const semAcesso = sources !== null && sources.length === 0;
  const shown = (sources ?? []).filter((s) => s.kind === tab);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="strong">Compartilhar tela</span>
          <button className="icon" onClick={onClose}><Icon name="close" /></button>
        </div>

        {semAcesso ? (
          <div className="pad">
            <p>O macOS não está deixando o Cantinho do Vorcaro ver as telas.</p>
            <ol>
              <li>Abra <b>Ajustes do Sistema › Privacidade e Segurança › Gravação do Áudio do Sistema e da Tela</b>.</li>
              <li>
                Ligue a chave do <b>Cantinho do Vorcaro</b>. <b>Se ela já estiver ligada,
                desligue e ligue de novo</b> — depois de atualizar, a permissão guardada é
                a da versão anterior, e o macOS continua mostrando a chave ligada.
              </li>
              <li>Feche e abra o app.</li>
            </ol>
            <button className="primary" onClick={() => window.desktop.openScreenSettings()}>Abrir Ajustes</button>
          </div>
        ) : (
          <>
            <div className="tabs">
              <button className={tab === 'screen' ? 'active' : ''} onClick={() => setTab('screen')}>Telas</button>
              <button className={tab === 'window' ? 'active' : ''} onClick={() => setTab('window')}>Janelas</button>
            </div>
            <div className="sources">
              {sources === null && <div className="muted pad">Carregando…</div>}
              {shown.map((s) => (
                <button key={s.id} className={`source ${sel === s.id ? 'selected' : ''}`} onClick={() => setSel(s.id)} onDoubleClick={() => onPick(s.id, audio)}>
                  {s.thumbnail ? <img src={s.thumbnail} alt="" /> : <div className="thumb-empty" />}
                  <div className="source-name">{s.icon && <img className="app-icon" src={s.icon} alt="" />}<span>{s.name || 'Sem título'}</span></div>
                </button>
              ))}
              {sources !== null && shown.length === 0 && <div className="muted pad">Nada encontrado.</div>}
            </div>
            <div className="modal-foot">
              <label className="check" title={tab === 'window' ? 'Escolhendo uma janela, o áudio do sistema costuma não vir junto' : undefined}>
                <input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} />
                Compartilhar áudio do sistema
                {tab === 'window' && <span className="muted small"> — mais confiável com a tela inteira</span>}
              </label>
              <div className="spacer" />
              <button onClick={onClose}>Cancelar</button>
              <button className="primary" disabled={!sel} onClick={() => sel && onPick(sel, audio)}>Compartilhar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

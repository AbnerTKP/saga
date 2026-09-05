import { useEffect, useState } from 'react';
import type { UpdateState } from '../desktop';

/**
 * Aviso discreto para atualização que aparece com o app já aberto — a da abertura é
 * tratada pela tela de partida. No Mac também é por aqui que se baixa à mão, já que o
 * app não é assinado pela Apple e não pode se substituir sozinho.
 */
export function UpdateToast({ estado }: { estado: UpdateState }) {
  const [escondido, setEscondido] = useState(false);

  // Uma versão nova reabre o aviso mesmo que a anterior tenha sido dispensada.
  useEffect(() => { setEscondido(false); }, [estado.version]);

  if (escondido) return null;
  if (estado.fase !== 'aviso' && estado.fase !== 'pronto' && estado.fase !== 'baixando') return null;

  return (
    <div className="toast">
      {estado.fase === 'baixando' && <span>Baixando versão {estado.version}… {estado.progress ?? 0}%</span>}

      {estado.fase === 'pronto' && (
        <>
          <span>Versão {estado.version} pronta.</span>
          <button className="primary sm" onClick={() => window.desktop.installUpdate()}>Reiniciar e atualizar</button>
        </>
      )}

      {estado.fase === 'aviso' && (
        <>
          <span>Versão {estado.version} disponível.</span>
          <button className="primary sm" onClick={() => estado.url && window.desktop.openExternal(estado.url)}>Baixar</button>
        </>
      )}

      <button className="link" onClick={() => setEscondido(true)}>depois</button>
    </div>
  );
}

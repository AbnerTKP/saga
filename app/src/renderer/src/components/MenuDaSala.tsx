import { useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { useFecharComEsc } from '../useFechar';
import type { RoomInfo } from '../api';

export type AcaoNaSala =
  | { tipo: 'renomear'; sala: RoomInfo }
  | { tipo: 'quemVe'; sala: RoomInfo }
  | { tipo: 'apagar'; sala: RoomInfo };

/**
 * O menu do botão direito EM CIMA de uma sala.
 *
 * Antes o clique subia para a lista e abria o menu dela — o de CRIAR sala. Clicar numa
 * coisa e receber as opções de outra é o gesto certo com a resposta errada: quem aponta
 * para uma sala quer mexer naquela sala.
 *
 * A sala de notas é do app, e por isso aqui ela só se lê: renomear, apagar e trancar são
 * do dono do servidor em todas as outras, e nesta não são de ninguém.
 */
export function MenuDaSala({ sala, em, onAcao, onClose }: {
  sala: RoomInfo;
  em: { x: number; y: number };
  onAcao: (a: AcaoNaSala) => void;
  onClose: () => void;
}) {
  useFecharComEsc(onClose);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) onClose(); };
    // No próximo tique: o próprio clique que abriu já fecharia o menu.
    const id = setTimeout(() => document.addEventListener('mousedown', fora), 0);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', fora); };
  }, [onClose]);

  const daSaga = !!sala.papel;
  const largura = 232;
  const alto = daSaga ? 120 : 200;
  const x = Math.min(em.x, window.innerWidth - largura - 8);
  const y = Math.min(em.y, window.innerHeight - alto);

  const fazer = (a: AcaoNaSala) => { onAcao(a); onClose(); };

  return (
    <div ref={caixa} className="menu-pessoa menu-salas" style={{ left: x, top: Math.max(8, y), width: largura }}>
      <div className="menu-titulo" title={sala.name}>
        <Icon name={sala.tipo === 'texto' ? 'texto' : 'speaker'} size={14} /> {sala.name}
      </div>

      {daSaga ? (
        <div className="menu-dica muted small">
          A sala de notas é da Saga: ela não se renomeia, não se apaga e não tranca.
        </div>
      ) : (
        <>
          <button onClick={() => fazer({ tipo: 'renomear', sala })}>Renomear</button>
          <button onClick={() => fazer({ tipo: 'quemVe', sala })}>
            <Icon name="pessoas" size={15} /> Quem pode ver…
          </button>
          {sala.privada && (
            <div className="menu-dica muted small">Hoje só alguns cargos veem esta sala.</div>
          )}
          <div className="menu-risco" />
          <button className="perigo" onClick={() => fazer({ tipo: 'apagar', sala })}>
            Apagar “{sala.name}”
          </button>
          <div className="menu-dica muted small">Some com as mensagens que estão dentro.</div>
        </>
      )}
    </div>
  );
}

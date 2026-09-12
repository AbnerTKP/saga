import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useFecharComEsc } from '../useFechar';
import { pode, type Membro } from '../api';

export type AcaoNoServidor =
  | { tipo: 'convidar' }
  | { tipo: 'configurar' }
  | { tipo: 'criarSala'; sala: 'voz' | 'texto' }
  | { tipo: 'sair' };

/**
 * O menu do nome do servidor, no alto da barra.
 *
 * A seta ▾ ao lado do nome sempre pareceu um menu e nunca foi um: ela abria as
 * configurações direto. Ficou assim porque, com um servidor só e uma pessoa mandando, o
 * painel era tudo o que havia ali. Convidar mudou isso — é a coisa mais comum de se
 * querer fazer num servidor de amigos, e ficava enterrada dentro de um painel de
 * administração que nem todo mundo tinha motivo para abrir.
 *
 * Como no Discord: "Convidar gente" é o primeiro item e o único em cor de acento; o resto
 * é o que já existia, agora alcançável de um lugar só. O botão direito no quadrado do
 * servidor continua abrindo as configurações direto — quem já sabia o caminho não perdeu
 * um clique.
 */
export function MenuDoServidor({ em, eu, nomeDoServidor, podeGerirSalas, onAcao, onClose }: {
  em: { x: number; y: number };
  eu: Membro;
  nomeDoServidor: string;
  podeGerirSalas: boolean;
  onAcao: (a: AcaoNoServidor) => void;
  onClose: () => void;
}) {
  // Esc fecha: uma saída que não depende de acertar o X — ver useFechar.ts.
  useFecharComEsc(onClose);
  const caixa = useRef<HTMLDivElement>(null);
  // Sair arma no próprio botão, como o desistir do xadrez: é decisão de um segundo, e uma
  // janela a mais seria ruído — mas um clique só é fácil demais de errar num menu.
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) onClose(); };
    // No próximo tique: o próprio clique que abriu já fecharia o menu.
    const id = setTimeout(() => document.addEventListener('mousedown', fora), 0);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', fora); };
  }, [onClose]);

  // Quem criou não sai — ficaria sem ninguém capaz de administrar o servidor, e o
  // servidor recusa com 409. A mesma regra do painel.
  const podeSair = !eu.cargo?.dono;
  const podeConvidar = pode(eu.cargo, 'convidar');

  const largura = 232;
  const x = Math.min(em.x, window.innerWidth - largura - 8);

  const fazer = (a: AcaoNoServidor) => { onAcao(a); onClose(); };

  return (
    <div
      ref={caixa}
      className="menu-pessoa menu-salas menu-do-servidor"
      style={{ left: x, top: Math.max(8, em.y), width: largura }}
    >
      {podeConvidar && (
        <>
          <button className="convidar" onClick={() => fazer({ tipo: 'convidar' })}>
            <Icon name="convidar" size={15} /> Convidar gente
          </button>
          <div className="menu-risco" />
        </>
      )}

      <button onClick={() => fazer({ tipo: 'configurar' })}>
        <Icon name="gear" size={15} /> Configurações do servidor
      </button>

      {podeGerirSalas && (
        <>
          <button onClick={() => fazer({ tipo: 'criarSala', sala: 'voz' })}>
            <Icon name="speaker" size={15} /> Criar sala de voz
          </button>
          <button onClick={() => fazer({ tipo: 'criarSala', sala: 'texto' })}>
            <Icon name="texto" size={15} /> Criar sala de chat
          </button>
        </>
      )}

      {podeSair && (
        <>
          <div className="menu-risco" />
          {confirmandoSaida ? (
            <button className="perigo armado" onClick={() => fazer({ tipo: 'sair' })}>
              <Icon name="sair" size={15} /> Sair mesmo de {nomeDoServidor}
            </button>
          ) : (
            <button className="perigo" onClick={() => setConfirmandoSaida(true)}>
              <Icon name="sair" size={15} /> Sair do servidor
            </button>
          )}
        </>
      )}
    </div>
  );
}

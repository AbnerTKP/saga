import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useFecharComEsc } from '../useFechar';
import { pode, type Membro } from '../api';
import { podeConfigurar } from '../configurar';

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
 * É o MESMO menu pelo nome do servidor e pelo botão direito no quadrado da trilha. O
 * botão direito abria as configurações direto, e a única pista disso era o balão do
 * `title` — o dono não sabia que existia (18/09/2026). Hoje ele abre este menu, como em todo
 * o resto do app (botão direito = as ações daquela coisa), com "Configurações do servidor"
 * em PRIMEIRO, que foi a escolha dele. "Convidar gente" continua o único em cor de acento.
 *
 * Quem não configura nada não vê "Configurações do servidor": para ele o item abria uma
 * lista de pessoas e um botão de sair — prometia uma coisa e entregava outra.
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
  const configura = podeConfigurar(eu.cargo);

  const largura = 232;
  const x = Math.min(em.x, window.innerWidth - largura - 8);

  const fazer = (a: AcaoNoServidor) => { onAcao(a); onClose(); };

  return (
    <div
      ref={caixa}
      className="menu-pessoa menu-salas menu-do-servidor"
      style={{ left: x, top: Math.max(8, em.y), width: largura }}
    >
      {/* A cabeça de uma linha: o botão direito pode vir de um quadrado que não é o
          servidor aberto, e o menu diz de qual é. */}
      <div className="menu-titulo">{nomeDoServidor}</div>

      {configura && (
        <button className="configurar" onClick={() => fazer({ tipo: 'configurar' })}>
          <Icon name="gear" size={15} /> Configurações do servidor
        </button>
      )}

      {podeConvidar && (
        <button className="convidar" onClick={() => fazer({ tipo: 'convidar' })}>
          <Icon name="convidar" size={15} /> Convidar gente
        </button>
      )}

      {podeGerirSalas && (
        <>
          <div className="menu-risco" />
          <button onClick={() => fazer({ tipo: 'criarSala', sala: 'voz' })}>
            <Icon name="speaker" size={15} /> Criar sala de voz
          </button>
          <button onClick={() => fazer({ tipo: 'criarSala', sala: 'texto' })}>
            <Icon name="texto" size={15} /> Criar sala de texto
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

import { useState } from 'react';
import type { Membro } from '../api';
import { COMO_SE_LE, EXPLICACAO, type Status } from '../presenca';
import { Avatar } from './Avatar';
import { Nome } from './Nome';
import { Icon } from './Icon';
import { CaixaDeRelato } from './Relatar';

/**
 * A aba "Você" do celular: o que no computador mora no painel da conta, embaixo das salas —
 * o status, as suas configurações e sair — e o relatar, que lá fica na faixa da janela e no
 * navegador não tem faixa nenhuma onde morar.
 */
export function TelaDoVoce({ eu, statusEscolhido, onStatus, onConfiguracoes, onSair }: {
  eu: Membro;
  statusEscolhido: Status;
  onStatus: (s: Status) => void;
  onConfiguracoes: () => void;
  onSair: () => void;
}) {
  const [relatando, setRelatando] = useState(false);
  return (
    <section className="tela-do-voce" aria-label="Você">
      <div className="voce-cabeca">
        <Avatar nome={eu.nome} foto={eu.foto} enquadramento={eu.enquadramento?.foto} tamanho="huge" status={statusEscolhido} />
        <div className="voce-nome">
          <span className="strong"><Nome membro={eu} /></span>
          <span className="muted small">{COMO_SE_LE[statusEscolhido]}</span>
        </div>
      </div>

      <div className="voce-grupo">
        <div className="cabecalho-de-categoria"><span>Status</span></div>
        {(['online', 'ausente', 'ocupado'] as Status[]).map((s) => (
          <button key={s} type="button" className={`voce-linha ${s === statusEscolhido ? 'atual' : ''}`} onClick={() => onStatus(s)}>
            <span className={`presenca ${s}`} />
            <span className="quem">
              <span className="strong">{COMO_SE_LE[s]}</span>
              <span className="muted small">{EXPLICACAO[s]}</span>
            </span>
            {s === statusEscolhido && <Icon name="check" size={20} />}
          </button>
        ))}
      </div>

      <div className="voce-grupo">
        <button type="button" className="voce-linha" onClick={onConfiguracoes}>
          <Icon name="gear" size={20} /><span className="quem"><span className="strong">Configurações</span>
            <span className="muted small">Perfil, microfone e conta</span></span>
        </button>
        <button type="button" className="voce-linha" onClick={() => setRelatando(true)}>
          <Icon name="relatar" size={20} /><span className="quem"><span className="strong">Relatar um problema</span>
            <span className="muted small">Ou sugerir uma melhoria</span></span>
        </button>
        <button type="button" className="voce-linha sair-da-conta" onClick={onSair}>
          <Icon name="sair" size={20} /><span className="quem"><span className="strong">Sair da conta</span></span>
        </button>
      </div>

      <p className="voce-pe muted small">
        No computador, a Saga também transmite a tela com o som e tem os jogos.
      </p>
      {relatando && <CaixaDeRelato onClose={() => setRelatando(false)} />}
    </section>
  );
}

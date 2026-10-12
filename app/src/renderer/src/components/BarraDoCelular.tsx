import type { useRoom } from '../useRoom';
import { Icon } from './Icon';

export type AbaDoCelular = 'servidores' | 'conversas' | 'voce';

/**
 * O pé da Saga no celular: a call que continua tocando e as três abas.
 *
 * A faixa da call é o painel da voz do computador encolhido no que cabe no polegar — a
 * sala, quem está ao vivo, microfone, fone e sair. Tocar nela abre o palco. Ela fica SOBRE as
 * abas, como no Discord: é a coisa que está acontecendo agora, e as abas são para onde ir.
 */
export function BarraDoCelular({ aba, avisoDasConversas, rm, onAba, onAbrirCall }: {
  aba: AbaDoCelular;
  /** Mensagens privadas por ler mais pedidos de amizade — o mesmo número da trilha. */
  avisoDasConversas: number;
  rm: ReturnType<typeof useRoom>;
  onAba: (aba: AbaDoCelular) => void;
  onAbrirCall: () => void;
}) {
  const naCall = !!rm.salaDaVoz && rm.status !== 'idle';
  const aoVivo = rm.lives.filter((l) => !l.local);
  const legenda = rm.status === 'reconnecting' ? 'Reconectando…'
    : rm.status === 'connecting' ? 'Conectando…'
    : aoVivo.length === 1 ? `${aoVivo[0].nome} ao vivo`
    : aoVivo.length > 1 ? `${aoVivo.length} ao vivo`
    : 'Voz conectada';

  return (
    <div className="barra-do-celular">
      {naCall && (
        <div className="call-no-celular">
          <button type="button" className="call-no-celular-quem" onClick={onAbrirCall} title="Abrir a call">
            <span className="strong"><Icon name="speaker" size={15} /> {rm.salaDaVoz!.nome}</span>
            <span className="muted small">{rm.salaDaVoz!.servidorNome} · {legenda}</span>
          </button>
          <button type="button" className={!rm.micOn ? 'off' : ''} disabled={rm.deafened} onClick={rm.toggleMic}
            aria-label={rm.micOn ? 'Mutar o microfone' : 'Desmutar o microfone'}>
            <Icon name={rm.micOn ? 'mic' : 'micOff'} />
          </button>
          <button type="button" className={rm.deafened ? 'off' : ''} onClick={rm.toggleDeafen}
            aria-label={rm.deafened ? 'Voltar a ouvir' : 'Ensurdecer'}>
            <Icon name={rm.deafened ? 'headOff' : 'head'} />
          </button>
          <button type="button" className="sair" onClick={rm.leave} aria-label="Sair da call">
            <Icon name="hangup" size={22} />
          </button>
        </div>
      )}
      <nav className="abas-do-celular" aria-label="Seções da Saga">
        <button type="button" className={aba === 'servidores' ? 'atual' : ''} onClick={() => onAba('servidores')}>
          <Icon name="grade" size={23} /><span>Servidores</span>
        </button>
        <button type="button" className={aba === 'conversas' ? 'atual' : ''} onClick={() => onAba('conversas')}>
          <Icon name="texto" size={23} />
          {avisoDasConversas > 0 && <span className="marca-da-aba">{avisoDasConversas > 99 ? '99+' : avisoDasConversas}</span>}
          <span>Conversas</span>
        </button>
        <button type="button" className={aba === 'voce' ? 'atual' : ''} onClick={() => onAba('voce')}>
          <Icon name="perfil" size={23} /><span>Você</span>
        </button>
      </nav>
    </div>
  );
}

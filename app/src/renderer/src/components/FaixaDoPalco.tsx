import { Avatar } from './Avatar';
import { Icon } from './Icon';
import type { PessoaNaCall } from './MenuDaPessoa';
import type { SalaDaVoz } from '../useRoom';

/** Quantos rostos cabem antes de virar "+N". Acima disso a faixa deixa de caber. */
const ROSTOS = 4;

/**
 * A faixa que diz onde a sua voz está, no alto do chat.
 *
 * Lendo uma sala de texto, a sala de voz sumia da vista: sobrava uma linha de texto no
 * cabeçalho ("voz em Geral") que não dizia quem está lá nem quem está transmitindo, e o
 * caminho de volta era procurar a sala na barra da esquerda. Aqui a call continua à
 * mostra — quem está nela, quantas telas no ar — e voltar é um clique.
 *
 * Só aparece quando a voz está NOUTRA sala: olhando a própria sala de voz, o palco já
 * está na tela e a faixa seria uma segunda cópia do que se está vendo.
 */
export function FaixaDoPalco({ sala, participantes, pessoas, transmitindo, servidorAberto, onAbrir }: {
  sala: SalaDaVoz;
  /** Quem está na call agora, pelo LiveKit — inclusive você. */
  participantes: { identity: string; nome: string }[];
  pessoas: Map<string, PessoaNaCall>;
  /** Quantas telas estão no ar nessa sala. */
  transmitindo: number;
  /** O servidor que está sendo lido: se for outro, o nome do servidor da voz entra junto. */
  servidorAberto: number;
  onAbrir?: () => void;
}) {
  const cabem = participantes.slice(0, ROSTOS);
  const sobra = participantes.length - cabem.length;
  const deOutroServidor = sala.servidorId !== servidorAberto;

  return (
    <div className="faixa-palco">
      <span className="faixa-icone"><Icon name="speaker" size={15} /></span>
      <span className="faixa-nome strong">{sala.nome}</span>
      {deOutroServidor && <span className="muted small">· {sala.servidorNome}</span>}

      {/* Os rostos empilhados são o que faz a faixa dizer "tem gente lá" sem ler nada. */}
      <span className="faixa-rostos" title={participantes.map((p) => p.nome).join(', ')}>
        {cabem.map((p) => (
          <Avatar key={p.identity} nome={p.nome} foto={pessoas.get(p.identity)?.foto}
            enquadramento={pessoas.get(p.identity)?.enquadramento?.foto} />
        ))}
        {sobra > 0 && <span className="faixa-mais">+{sobra}</span>}
      </span>

      {transmitindo > 0 && (
        <span className="faixa-live">
          <Icon name="screen" size={14} />
          {transmitindo === 1 ? '1 compartilhando' : `${transmitindo} compartilhando`}
        </span>
      )}

      <span className="spacer" />
      {onAbrir && (
        <button type="button" className="faixa-abrir" onClick={onAbrir}>
          Abrir palco
        </button>
      )}
    </div>
  );
}

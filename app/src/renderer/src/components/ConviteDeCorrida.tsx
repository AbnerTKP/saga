import type { ConviteDeCorrida as Convite } from '../api';
import { equipeDoCarro } from '../corrida';
import { definicao, type IdDaPista } from '../pista';
import bahrein from '../pistas/miniaturas/bahrein.webp';
import interlagos from '../pistas/miniaturas/interlagos.webp';
import monaco from '../pistas/miniaturas/monaco.webp';
import monza from '../pistas/miniaturas/monza.webp';
import spa from '../pistas/miniaturas/spa.webp';
import vegas from '../pistas/miniaturas/vegas.webp';
import { CartaoDeConvite } from './CartaoDeConvite';

/**
 * A miniatura de cada pista, desenhada pelo próprio desenhista da corrida e guardada: montar a
 * pista inteira só para a capa de um convite travaria a tela por uma fração de segundo.
 */
const MINIATURAS: Record<IdDaPista, string> = { interlagos, monza, monaco, spa, bahrein, vegas };

/**
 * O convite para correr. "Correr" abre o grid — é lá que se escolhe o carro —, e o convite pode
 * ser de um servidor que não é o aberto: aí ele diz de qual.
 */
export function ConviteDeCorrida({ convite, servidorAberto, ocupado, onCorrer, onRecusar }: {
  convite: Convite;
  servidorAberto: number | null;
  ocupado: boolean;
  onCorrer: () => void;
  onRecusar: () => void;
}) {
  const pista = definicao(convite.pista ?? 'interlagos');
  const deOutro = convite.servidor !== undefined && convite.servidor !== servidorAberto && convite.servidorNome;
  const sentados = convite.sentados ?? [];
  return (
    <CartaoDeConvite
      jogo="Fórmula 1"
      capa={<img src={MINIATURAS[pista.id]} alt="" />}
      de={convite.de}
      titulo={`${convite.de.nome} te chamou para correr`}
      detalhe={`${pista.gp} · ${convite.voltas} voltas${deOutro ? ` · em ${convite.servidorNome}` : ''}`}
      junto={{
        pessoas: sentados.map((s) => ({ pessoa: s.pessoa, cor: equipeDoCarro(s.carro).cor })),
        texto: `${convite.pilotos} de 8 no grid`,
      }}
      aceitar="Correr"
      ocupado={ocupado}
      onAceitar={onCorrer}
      onRecusar={onRecusar}
    />
  );
}

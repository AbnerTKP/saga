import type { ConviteDeCatan as Convite } from '../catan';
import { CartaoDeConvite } from './CartaoDeConvite';
import { CapaDoCatan } from './CapaDoCatan';

/**
 * O convite para o Catan, no mesmo cartão dos outros jogos. "Sentar" senta na mesa e abre a tela
 * dela; quem abriu começa quando quiser. O convite pode ser de um servidor que não é o aberto:
 * aí ele diz de qual.
 */
export function ConviteDeCatan({ convite, servidorAberto, ocupado, onSentar, onRecusar }: {
  convite: Convite;
  servidorAberto: number | null;
  ocupado: boolean;
  onSentar: () => void;
  onRecusar: () => void;
}) {
  const deOutro = convite.servidor !== undefined && convite.servidor !== servidorAberto && convite.servidorNome;
  return (
    <CartaoDeConvite
      jogo="Catan"
      capa={<CapaDoCatan className="capa-do-catan" />}
      de={convite.de}
      titulo={`${convite.de.nome} te chamou para o Catan`}
      detalhe={`de 2 a 4 jogadores${deOutro ? ` · em ${convite.servidorNome}` : ''}`}
      junto={{
        // As cores da partida só se sabem ao começar: na mesa esperando, todo mundo é neutro.
        pessoas: convite.sentados.map((pessoa) => ({ pessoa, cor: 'var(--borda-forte)' })),
        texto: `${convite.sentados.length} de 4 na mesa`,
      }}
      aceitar="Sentar"
      ocupado={ocupado}
      onAceitar={onSentar}
      onRecusar={onRecusar}
    />
  );
}

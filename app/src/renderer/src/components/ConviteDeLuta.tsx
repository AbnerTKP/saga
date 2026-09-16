import type { ConviteDeLuta as Convite } from '../api';
import { FICHAS } from '../dragao/fichas';
import { CartaoDeConvite } from './CartaoDeConvite';
import { QuadroNaTela, miniaturaDoCenario } from './TelaDaLuta';

const NOMES = { torneio: 'Torneio', planeta: 'Planeta Verde', ilha: 'Ilha da Tartaruga', canion: 'Cânion' } as const;

/**
 * O convite para lutar, no mesmo cartão do xadrez e da Fórmula 1. A capa é o cenário da arena, e
 * o detalhe diz com que lutador quem chamou está esperando. "Lutar" abre a arena: é lá que se
 * escolhe o lutador, e escolher é a resposta.
 */
export function ConviteDeLuta({ convite, servidorAberto, onLutar, onRecusar }: {
  convite: Convite;
  servidorAberto: number | null;
  onLutar: () => void;
  onRecusar: () => void;
}) {
  const deOutro = convite.servidor !== undefined && convite.servidor !== servidorAberto && convite.servidorNome;
  // Lutador que este app não conhece fica de fora, em vez de derrubar a tela inteira: foi o que
  // deixou a Saga 0.56 preta ao ser chamada por alguém de Goteira (o servidor já não manda, e isto
  // é para o dia em que ele esquecer — ver `LUTADOR_DESDE`, em server/lutas.mjs).
  const lutador = convite.oponente ? FICHAS[convite.oponente.lutador] : undefined;
  const com = lutador ? ` · ${lutador.nome}` : '';
  return (
    <CartaoDeConvite
      jogo="Dragão Quadrado"
      capa={<QuadroNaTela chave={`capa-${convite.cenario}`} className="luta-capa" quadro={() => miniaturaDoCenario(convite.cenario)} />}
      de={convite.de}
      titulo={`${convite.de.nome} te chamou para lutar`}
      detalhe={`${NOMES[convite.cenario]} · ${convite.rounds === 1 ? 'luta única' : 'melhor de 3'}${com}${deOutro ? ` · em ${convite.servidorNome}` : ''}`}
      aceitar="Lutar"
      ocupado={false}
      onAceitar={onLutar}
      onRecusar={onRecusar}
    />
  );
}

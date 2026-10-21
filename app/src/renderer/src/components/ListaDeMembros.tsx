import type { Cargo, Membro } from '../api';
import type { ResumoDaMesa } from '../jogos';
import { agruparPessoas } from '../listaDePessoas';
import { Avatar } from './Avatar';
import { Nome } from './Nome';
import { Icon } from './Icon';
import { IconeDoJogo } from './IconeDoJogo';

/**
 * Todo mundo do servidor, e não só quem está numa sala: é a diferença entre saber quem está
 * agora e saber quem faz parte. Os cargos só com quem está aqui, e quem está offline num
 * grupo único no fim — ver listaDePessoas.ts.
 */
export function ListaDeMembros({ membros, cargos, naVoz, eu, jogando, nomeDoJogador, onPartida, onPessoa, onFechar }: {
  membros: Membro[];
  cargos: Cargo[];
  /** Ids de quem está em alguma sala de voz agora. */
  naVoz: Set<number>;
  eu: Membro;
  /** Quem está numa partida de xadrez agora, e em qual mesa — ver jogos.ts. */
  jogando: Map<number, ResumoDaMesa>;
  nomeDoJogador: (id: number | null) => string;
  /** Abrir a partida de alguém: aqui é o caminho de quem joga FORA da call. */
  onPartida: (mesaId: number) => void;
  /** Esquerdo abre o perfil; direito, as ações. */
  onPessoa: (m: Membro, em: { x: number; y: number }, tipo: 'perfil' | 'acoes') => void;
  /** No celular a lista abre por cima de tudo, e precisa de um jeito de fechar. */
  onFechar?: () => void;
}) {
  // Banido não é pessoa DESTE servidor: some daqui e mora nas configurações, em Banidos.
  // Ficava na lista com o nome riscado, como se ainda fizesse parte.
  const presentes = membros.filter((m) => !m.banido);
  const grupos = agruparPessoas(membros, cargos);

  return (
    <aside className="lista-membros">
      <div className="lista-membros-topo">
        Pessoas <span className="count">{presentes.length}</span>
        {onFechar && (
          <button type="button" className="fechar-lista-de-membros" onClick={onFechar} aria-label="Fechar a lista de pessoas">
            <Icon name="close" size={20} />
          </button>
        )}
      </div>

      <div className="lista-membros-corpo">
        {grupos.map((g) => (
          <div key={g.chave} className="grupo-de-cargo">
            <div className="cabecalho-do-grupo" style={g.cor ? { color: g.cor } : undefined}>
              {g.titulo} — {g.gente.length}
            </div>

            {g.gente.map((m) => {
              const naCall = naVoz.has(m.id);
              // Apagado é quem NÃO ESTÁ, e não quem está fora da call: quem está ausente
              // ou ocupado está aí. A variável aqui já se chamava `online` querendo dizer
              // "na voz" — era essa a confusão.
              const offline = m.status === 'offline';
              // A cor é a do cargo DA PESSOA, não a do grupo: no grupo de offline é só por
              // ela que ainda se vê o cargo de cada um.
              const cor = m.cargo?.cor;
              const mesa = jogando.get(m.id);
              const atv = m.atividade;
              return (
                <button
                  key={m.id}
                  className={`membro-linha ${naCall ? 'na-voz' : ''} ${offline ? 'offline' : ''} ${atv ? 'atv-com-jogo' : ''}`}
                  title={`${m.nome} — ${m.cargoNome}${naCall ? ' · na voz agora' : ''}${atv ? ` · jogando ${atv.nome}` : ''}`}
                  onClick={(e) => onPessoa(m, { x: e.clientX, y: e.clientY }, 'perfil')}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onPessoa(m, { x: e.clientX, y: e.clientY }, 'acoes'); }}
                >
                  <Avatar nome={m.nome} foto={m.foto} enquadramento={m.enquadramento?.foto}
                    tamanho="big" status={m.status} />
                  <span className="membro-nome" style={cor && !m.turbo ? { color: cor } : undefined}>
                    <Nome membro={m} />
                  </span>
                  {/* As marcas num grupo: sem jogo ele some (`display: contents`) e a linha é a de
                      sempre; com jogo, ficam na primeira linha e o jogo passa embaixo delas. */}
                  <span className="atv-marcas">
                    {m.turbo && <span className="marca-berserk" title="Berserk"><Icon name="berserk" size={13} /></span>}
                    {atv && <IconeDoJogo atividade={atv} tamanho={20} />}
                    {/* O controle é o botão, como o selo AO VIVO na barra. Aqui ele é um span
                        dentro do botão da linha: botão dentro de botão o navegador desfaz. */}
                    {mesa && (
                      <span
                        className="selo-na-linha jogo"
                        role="button"
                        title={m.id === eu.id
                          ? 'Voltar à sua partida'
                          : `Assistir ${nomeDoJogador(mesa.brancas)} × ${nomeDoJogador(mesa.pretas)}`}
                        onClick={(e) => { e.stopPropagation(); onPartida(mesa.id); }}
                      >
                        <Icon name="controle" size={13} />
                      </span>
                    )}
                    {m.id === eu.id && <span className="muted small">você</span>}
                  </span>
                  {/* O jogo aberto mora embaixo do nome, e o ícone dele à direita (opção C da
                      prancheta de 20/10/2026). A segunda linha cabe na altura da foto, e passa por
                      baixo das marcas: na sua própria linha, Berserk + ícone + "você" comiam o
                      nome do jogo inteiro ("Jogando…"), visto na foto da conferência. */}
                  {atv && <span className="atv-jogando">Jogando <b>{atv.nome}</b></span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}

import type { Cargo, Membro } from '../api';
import { Avatar } from './Avatar';
import { Nome } from './Nome';
import { Icon } from './Icon';

/**
 * Todo mundo do servidor, agrupado por cargo — não só quem está numa sala. É a diferença
 * entre saber quem está agora e saber quem faz parte.
 */
export function ListaDeMembros({ membros, cargos, naVoz, eu, onPessoa }: {
  membros: Membro[];
  cargos: Cargo[];
  /** Ids de quem está em alguma sala de voz agora. */
  naVoz: Set<number>;
  eu: Membro;
  /** Esquerdo abre o perfil; direito, as ações. */
  onPessoa: (m: Membro, em: { x: number; y: number }, tipo: 'perfil' | 'acoes') => void;
}) {
  // Banido não é pessoa DESTE servidor: some daqui e mora nas configurações, em Banidos.
  // Ficava na lista com o nome riscado, como se ainda fizesse parte.
  const presentes = membros.filter((m) => !m.banido);

  // Do cargo mais alto para o mais baixo, como se lê uma hierarquia.
  const grupos = cargos
    .slice()
    .sort((a, b) => b.nivel - a.nivel)
    .map((c) => ({ cargo: c, gente: presentes.filter((m) => m.cargo?.id === c.id) }))
    .filter((g) => g.gente.length > 0);

  const semCargo = presentes.filter((m) => !m.cargo);
  if (semCargo.length) grupos.push({ cargo: null as unknown as Cargo, gente: semCargo });

  return (
    <aside className="lista-membros">
      <div className="lista-membros-topo">Pessoas <span className="count">{presentes.length}</span></div>

      <div className="lista-membros-corpo">
        {grupos.map((g) => (
          <div key={g.cargo?.id ?? 'sem'} className="grupo-de-cargo">
            <div className="cabecalho-do-grupo" style={g.cargo?.cor ? { color: g.cargo.cor } : undefined}>
              {g.cargo?.nome ?? 'Sem cargo'} — {g.gente.length}
            </div>

            {g.gente.map((m) => {
              const naCall = naVoz.has(m.id);
              // Apagado é quem NÃO ESTÁ, e não quem está fora da call: quem está ausente
              // ou ocupado está aí, e some da lista tanto quanto quem fechou o app. A
              // variável aqui já se chamava `online` querendo dizer "na voz" — era essa a
              // confusão.
              const offline = m.status === 'offline';
              return (
                <button
                  key={m.id}
                  className={`membro-linha ${naCall ? 'na-voz' : ''} ${offline ? 'offline' : ''}`}
                  title={`${m.nome} — ${m.cargoNome}${naCall ? ' · na voz agora' : ''}`}
                  onClick={(e) => onPessoa(m, { x: e.clientX, y: e.clientY }, 'perfil')}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onPessoa(m, { x: e.clientX, y: e.clientY }, 'acoes'); }}
                >
                  <Avatar nome={m.nome} foto={m.foto} enquadramento={m.enquadramento?.foto}
                    tamanho="big" status={m.status} />
                  <span className="membro-nome" style={g.cargo?.cor && !m.turbo ? { color: g.cargo.cor } : undefined}>
                    <Nome membro={m} />
                  </span>
                  {m.turbo && <span className="marca-berserk" title="Berserk"><Icon name="berserk" size={13} /></span>}
                  {m.id === eu.id && <span className="muted small">você</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}

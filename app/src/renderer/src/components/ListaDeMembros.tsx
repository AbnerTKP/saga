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
  onPessoa: (m: Membro, em: { x: number; y: number }) => void;
}) {
  // Do cargo mais alto para o mais baixo, como se lê uma hierarquia.
  const grupos = cargos
    .slice()
    .sort((a, b) => b.nivel - a.nivel)
    .map((c) => ({ cargo: c, gente: membros.filter((m) => m.cargo?.id === c.id) }))
    .filter((g) => g.gente.length > 0);

  const semCargo = membros.filter((m) => !m.cargo);
  if (semCargo.length) grupos.push({ cargo: null as unknown as Cargo, gente: semCargo });

  return (
    <aside className="lista-membros">
      <div className="lista-membros-topo">Pessoas <span className="count">{membros.length}</span></div>

      <div className="lista-membros-corpo">
        {grupos.map((g) => (
          <div key={g.cargo?.id ?? 'sem'} className="grupo-de-cargo">
            <div className="cabecalho-do-grupo" style={g.cargo?.cor ? { color: g.cargo.cor } : undefined}>
              {g.cargo?.nome ?? 'Sem cargo'} — {g.gente.length}
            </div>

            {g.gente.map((m) => {
              const online = naVoz.has(m.id);
              return (
                <button
                  key={m.id}
                  className={`membro-linha ${online ? 'na-voz' : ''} ${m.banido ? 'banido' : ''}`}
                  title={`${m.nome} — ${m.cargoNome}${online ? ' · na voz agora' : ''}`}
                  onClick={(e) => onPessoa(m, { x: e.clientX, y: e.clientY })}
                >
                  <Avatar nome={m.nome} foto={m.foto} />
                  <span className="membro-nome" style={g.cargo?.cor && !m.turbo ? { color: g.cargo.cor } : undefined}>
                    <Nome membro={m} />
                  </span>
                  {m.turbo && <span className="raio-turbo" title="Vorcaro Turbo"><Icon name="raio" size={13} /></span>}
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

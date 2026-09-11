import type { Cargo, Membro } from '../api';
import { agruparPessoas } from '../listaDePessoas';
import { Avatar } from './Avatar';
import { Nome } from './Nome';
import { Icon } from './Icon';

/**
 * Todo mundo do servidor, e não só quem está numa sala: é a diferença entre saber quem está
 * agora e saber quem faz parte. Os cargos só com quem está aqui, e quem está offline num
 * grupo único no fim — ver listaDePessoas.ts.
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
  const grupos = agruparPessoas(membros, cargos);

  return (
    <aside className="lista-membros">
      <div className="lista-membros-topo">Pessoas <span className="count">{presentes.length}</span></div>

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
                  <span className="membro-nome" style={cor && !m.turbo ? { color: cor } : undefined}>
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

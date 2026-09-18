import { useMemo, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { useFecharComEsc } from '../useFechar';
import { buscarPaginas, type Pagina } from '../paginasDeConfiguracao';

/**
 * As três casas de configuração num componente só: menu lateral agrupado, busca, o caminho
 * no cabeçalho e uma página por assunto.
 *
 * Quem usa passa as páginas (a mesma lista que o botão direito do servidor mostra no
 * submenu — as duas não têm como divergir) e desenha a página aberta como `children`.
 *
 * O cartão do alto diz DE QUEM é o que se mexe aqui: você, o servidor, a Saga. Nos painéis de
 * antes o do servidor tinha só o nome dele como título, sem a palavra "Configurações".
 */
export function Configuracoes<Id extends string>({ casa, escopo, paginas, atual, onIr, onClose, children }: {
  /** "Configurações", "Configurações do servidor" — o começo do caminho no cabeçalho. */
  casa: string;
  /**
   * O cartão do alto do menu: a foto (ou as iniciais), o nome e uma linha de legenda. Com
   * `pessoa`, a foto é redonda — redondo é pessoa, quadrado é servidor.
   */
  escopo: { quadro: ReactNode; nome: ReactNode; meta?: ReactNode; pessoa?: boolean };
  paginas: Pagina<Id>[];
  atual: Id;
  onIr: (id: Id) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  // Esc fecha: uma saída que não depende de acertar o X — ver useFechar.ts.
  useFecharComEsc(onClose);
  const [busca, setBusca] = useState('');
  const achadas = useMemo(() => buscarPaginas(paginas, busca), [paginas, busca]);
  const aberta = paginas.find((p) => p.id === atual);

  // Os grupos na ordem em que aparecem na lista: é a lista que decide, não este componente.
  const grupos: { titulo: string | undefined; paginas: Pagina<Id>[] }[] = [];
  for (const p of paginas.filter((x) => !x.fim)) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.titulo === p.grupo) ultimo.paginas.push(p);
    else grupos.push({ titulo: p.grupo, paginas: [p] });
  }
  const noFim = paginas.filter((p) => p.fim);

  const item = (p: Pagina<Id>, nome: ReactNode = p.titulo) => (
    <button
      key={p.id}
      className="cfg-item"
      aria-current={p.id === atual && !p.acao ? 'page' : undefined}
      data-tom={p.tom}
      data-armado={p.armado ? '' : undefined}
      onClick={() => { if (p.acao) p.acao(); else { onIr(p.id); setBusca(''); } }}
    >
      <Icon name={p.icone} size={16} />
      <span className="cfg-item-nome">{nome}</span>
      {p.fimDoItem && <span className="cfg-item-fim">{p.fimDoItem}</span>}
    </button>
  );

  return (
    <div className="cfg-veu" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cfg-caixa" role="dialog" aria-label={casa}>
        <nav className="cfg-menu" aria-label={casa}>
          <div className="cfg-escopo">
            <span className="cfg-escopo-quadro" data-pessoa={escopo.pessoa ? '' : undefined}>{escopo.quadro}</span>
            <span className="cfg-escopo-texto">
              <span className="cfg-escopo-nome">{escopo.nome}</span>
              {escopo.meta && <span className="cfg-escopo-meta">{escopo.meta}</span>}
            </span>
          </div>

          <label className="cfg-busca">
            <Icon name="busca" size={16} />
            <input
              value={busca}
              placeholder="Buscar nas configurações"
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && achadas[0]) { e.preventDefault(); achadas[0].acao ? achadas[0].acao() : onIr(achadas[0].id); setBusca(''); }
                // O Esc da busca só limpa a busca; com ela vazia, fecha a caixa (useFechar).
                if (e.key === 'Escape' && busca) { e.stopPropagation(); setBusca(''); }
              }}
            />
          </label>

          {busca.trim() ? (
            achadas.length
              ? achadas.map((p) => item(p, destacar(p.titulo, busca)))
              : <div className="cfg-nada">Nada com “{busca.trim()}” aqui.</div>
          ) : (
            <>
              {grupos.map((g, i) => (
                <div key={g.titulo ?? `sem-${i}`}>
                  {g.titulo && <div className="cfg-grupo">{g.titulo}</div>}
                  {g.paginas.map((p) => item(p))}
                </div>
              ))}
              {noFim.length > 0 && <div className="cfg-risco" />}
              {noFim.map((p) => item(p))}
            </>
          )}
        </nav>

        <section className="cfg-conteudo">
          <div className="cfg-cabeca">
            <div className="cfg-migalhas">
              <span>{casa}</span>
              <Icon name="setaDir" size={14} />
              <b>{aberta?.titulo ?? ''}</b>
            </div>
            <span className="cfg-fechar">
              <span className="cfg-tecla" aria-hidden>ESC</span>
              <button className="cfg-botao-icone" aria-label="Fechar" title="Fechar (Esc)" onClick={onClose}>
                <Icon name="close" size={18} />
              </button>
            </span>
          </div>
          <div className="cfg-corpo">{children}</div>
        </section>
      </div>
    </div>
  );
}

/** O pedaço buscado, aceso dentro do nome da página. */
function destacar(texto: string, busca: string): ReactNode {
  const b = busca.trim();
  const i = semAcento(texto).indexOf(semAcento(b));
  if (!b || i < 0) return texto;
  return <>{texto.slice(0, i)}<mark>{texto.slice(i, i + b.length)}</mark>{texto.slice(i + b.length)}</>;
}
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A página: título, frase do que ela guarda, e o resto. */
export function Pagina({ titulo, descricao, largura, children }: { titulo: string; descricao?: ReactNode; largura?: 'cheia'; children: ReactNode }) {
  return (
    <div className="cfg-pagina" data-largura={largura}>
      <h1 className="cfg-titulo">{titulo}</h1>
      {descricao ? <p className="cfg-descricao">{descricao}</p> : <div style={{ height: 'var(--e5)' }} />}
      {children}
    </div>
  );
}

/** Um bloco da página, com o título em versalete. */
export function Secao({ titulo, selo, children }: { titulo?: string; selo?: ReactNode; children: ReactNode }) {
  return (
    <section className="cfg-secao">
      {titulo && <h2 className="cfg-secao-titulo">{titulo}{selo}</h2>}
      {children}
    </section>
  );
}

/** Linha de ajuste: o que é · o que faz · o controle à direita (ou embaixo, empilhada). */
export function Linha({ rotulo, explica, empilhada, travada, motivo, children }: {
  rotulo: ReactNode; explica?: ReactNode; empilhada?: boolean;
  /** Travada diz POR QUÊ, em vez de só apagar o controle. */
  travada?: boolean; motivo?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="cfg-linha" data-empilhada={empilhada ? '' : undefined} aria-disabled={travada || undefined}>
      <div className="cfg-linha-texto">
        <span className="cfg-rotulo">{rotulo}</span>
        {explica && <span className="cfg-explica">{explica}</span>}
        {travada && motivo && <span className="cfg-motivo">{motivo}</span>}
      </div>
      {children && <div className="cfg-controle">{children}</div>}
    </div>
  );
}

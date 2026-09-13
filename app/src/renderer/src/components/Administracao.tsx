import { useEffect, useRef, useState } from 'react';
import {
  servidorDaSaga, servidoresDaSaga, urlDoArquivo,
  type DetalheDoServidorDaSaga, type ServidorDaSaga,
} from '../api';
import {
  cargosDoMaisAlto, contar, emQueDia, explicarFalha, haQuanto,
  pessoasPorCargo, quemVe, salasPorCategoria, servidoresNaOrdem,
} from '../administracao';
import { rotuloDoDia } from '../dias';
import { aoDespertar } from '../despertar';
import { contaDaIdentidade } from '../pessoas';
import { useFecharComEsc } from '../useFechar';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Nome } from './Nome';
import { BlocosDaSaga } from './PainelDaSaga';

/** De quanto em quanto tempo a lista e o servidor escolhido são buscados de novo. */
const VOLTA = 10_000;

/** O texto de uma falha, com a explicação de servidor antigo quando é o caso. */
const textoDaFalha = (e: unknown) =>
  explicarFalha((e as { status?: number }).status ?? 0, (e as Error)?.message ?? 'Algo deu errado.');

/**
 * Resposta que não muda sozinha: a sessão caiu (401), a conta deixou de ser dona da Saga
 * (403), ou o pedido não existe (404 — o servidor que sumiu, ou um servidor da Saga antigo,
 * que ainda não tem estas rotas).
 *
 * Pedir de novo de 10 em 10 s não traz nada, e cada falha vira uma linha no registro de
 * erros: uma hora com a administração aberta contra o servidor antigo seriam 720 linhas
 * iguais, no arquivo que é feito para circular no grupo. Diante disso a busca para; o
 * "Tentar de novo" e reabrir a administração recomeçam.
 */
const naoPassaSozinha = (e: unknown) => [401, 403, 404].includes((e as { status?: number }).status ?? 0);

/**
 * A administração da Saga: todos os servidores — inclusive os de que o dono da Saga não faz
 * parte — e, na outra aba, as contas com o Berserk.
 *
 * Mostra como cada servidor está MONTADO, e nunca a conversa: pessoas, cargos, salas (as
 * privadas também), quem está em call e QUANTAS mensagens — mas nem uma linha do que foi
 * escrito, e o servidor nem manda. Hoje é só ver. Linhas e seções, e não um formulário, é o
 * que deixa lugar para os botões de gerenciar chegarem sem refazer a tela.
 */
export function Administracao({ meuId, inicial, onAbrirServidor, onClose }: {
  meuId: number;
  /**
   * O servidor aberto no app, se houver: a administração abre nele. Aberta de dentro do
   * CORNUME, ela abria no CARDUME só por ser o primeiro em ordem alfabética — e o que a
   * pessoa esperava ver primeiro era o lugar de onde tinha vindo.
   */
  inicial?: number | null;
  /** "Abrir" num servidor de que se faz parte. Quem chamou fecha isto e troca de servidor. */
  onAbrirServidor?: (id: number) => void;
  onClose: () => void;
}) {
  // Esc fecha: uma saída que não depende de acertar o X — ver useFechar.ts.
  useFecharComEsc(onClose);
  const [aba, setAba] = useState<'servidores' | 'contas'>('servidores');
  const [busca, setBusca] = useState('');
  // Lidos de dentro da busca da lista, que não pode depender deles — ver o efeito abaixo.
  const buscaAtual = useRef(busca);
  buscaAtual.current = busca;
  const aberto = useRef(inicial ?? null);

  /**
   * Falhar em carregar NÃO é o mesmo que não ter nada — a lição do painel do servidor, que
   * com a busca caída afirmou que o servidor não tinha cargo nenhum. `null` é "ainda não
   * chegou"; lista vazia é resposta.
   */
  const [lista, setLista] = useState<ServidorDaSaga[] | null>(null);
  const [falhaDaLista, setFalhaDaLista] = useState<string | null>(null);
  const [tentativaDaLista, setTentativaDaLista] = useState(0);

  const [escolhido, setEscolhido] = useState<number | null>(null);
  const escolheuSozinho = useRef(false);
  const [detalhe, setDetalhe] = useState<{ id: number; dados: DetalheDoServidorDaSaga } | null>(null);
  const [falhaDoDetalhe, setFalhaDoDetalhe] = useState<{ id: number; texto: string } | null>(null);
  const [tentativaDoDetalhe, setTentativaDoDetalhe] = useState(0);
  const colunaDoDetalhe = useRef<HTMLDivElement>(null);

  /**
   * A lista, de 10 em 10 s enquanto isto estiver aberto.
   *
   * O efeito depende só de `tentativaDaLista` — NUNCA da lista. Efeito que grava no que ele
   * mesmo lê refaz a si mesmo e não dá erro nenhum: foi assim que o app pediu /servidor
   * 4.204 vezes em 10 s (ver a busca de /servidor em App.tsx).
   */
  useEffect(() => {
    let vivo = true;
    let desistiu = false;
    const buscar = () => {
      if (desistiu) return;
      servidoresDaSaga()
        .then((servidores) => {
          if (!vivo) return;
          setLista(servidores);
          setFalhaDaLista(null);
          // A primeira lista escolhe UMA vez: o servidor aberto no app, se ele estiver na
          // ordem, e senão o primeiro dela. As voltas seguintes não mexem na escolha: a
          // lista muda debaixo do mouse, a escolha não.
          if (escolheuSozinho.current) return;
          const ordem = servidoresNaOrdem(servidores, buscaAtual.current);
          const primeiro = ordem.find((s) => s.id === aberto.current) ?? ordem[0];
          if (!primeiro) return;
          escolheuSozinho.current = true;
          setEscolhido((atual) => atual ?? primeiro.id);
        })
        .catch((e) => {
          if (!vivo) return;
          setFalhaDaLista(textoDaFalha(e));
          desistiu = naoPassaSozinha(e);
        });
    };
    buscar();
    const relogio = setInterval(buscar, VOLTA);
    // Relógio é a primeira coisa que o sistema desliga — ver despertar.ts.
    const pararDeDespertar = aoDespertar(buscar);
    return () => { vivo = false; clearInterval(relogio); pararDeDespertar(); };
  }, [tentativaDaLista]);

  /**
   * O servidor escolhido, também de 10 em 10 s. Depende de QUAL é e de `tentativaDoDetalhe`,
   * nunca do que chega.
   *
   * O que chega é guardado com o id e só se desenha se ainda for o escolhido: trocar de
   * servidor não pode mostrar as pessoas do anterior com o nome do novo no alto — a mesma
   * confusão que salas e cargos tiveram no App ao trocar de servidor. `vivo` descarta a
   * resposta de quem deixou de ser o escolhido no meio do caminho.
   */
  useEffect(() => {
    if (escolhido === null) return;
    const id = escolhido;
    let vivo = true;
    // Servidor que sumiu responde 404 para sempre: a lista já diz que ele não existe mais.
    let desistiu = false;
    const buscar = () => {
      if (desistiu) return;
      servidorDaSaga(id)
        .then((dados) => {
          if (!vivo) return;
          setDetalhe({ id, dados });
          setFalhaDoDetalhe(null);
        })
        .catch((e) => {
          if (!vivo) return;
          setFalhaDoDetalhe({ id, texto: textoDaFalha(e) });
          desistiu = naoPassaSozinha(e);
        });
    };
    buscar();
    const relogio = setInterval(buscar, VOLTA);
    const pararDeDespertar = aoDespertar(buscar);
    return () => { vivo = false; clearInterval(relogio); pararDeDespertar(); };
  }, [escolhido, tentativaDoDetalhe]);

  // Outro servidor começa do alto: continuar no meio das pessoas do anterior faria o novo
  // parecer a continuação dele.
  useEffect(() => { colunaDoDetalhe.current?.scrollTo({ top: 0 }); }, [escolhido]);

  const agora = Date.now();
  const naBusca = lista ? servidoresNaOrdem(lista, busca) : [];
  // O escolhido que a busca esconde continua na lista, no alto e marcado. Sem ele, a coluna
  // da direita seguia mostrando um servidor sem nenhuma linha acesa — e, rolada até as
  // pessoas, parecia ser do único que tinha sobrado na lista.
  const escondido = lista && escolhido !== null && !naBusca.some((s) => s.id === escolhido)
    ? lista.find((s) => s.id === escolhido) ?? null
    : null;
  const visiveis = escondido ? [escondido, ...naBusca] : naBusca;
  const sumiu = lista !== null && escolhido !== null && !lista.some((s) => s.id === escolhido);
  const dados = detalhe && detalhe.id === escolhido ? detalhe.dados : null;
  const falhaDaqui = falhaDoDetalhe && falhaDoDetalhe.id === escolhido ? falhaDoDetalhe.texto : null;

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal painel administracao" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="strong">Administração da Saga</span>
          <button className="icon" title="Fechar" onClick={onClose}><Icon name="close" /></button>
        </div>

        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={aba === 'servidores'}
            className={aba === 'servidores' ? 'active' : ''} onClick={() => setAba('servidores')}>
            Servidores{lista && <span className="adm-contagem">{lista.length}</span>}
          </button>
          <button role="tab" aria-selected={aba === 'contas'}
            className={aba === 'contas' ? 'active' : ''} onClick={() => setAba('contas')}>
            Contas
          </button>
        </div>

        {/* A aba Contas fica MONTADA, só escondida. Desmontá-la a cada troca de aba levava
            junto o código de senha recém-gerado para alguém — que aparece uma vez só e não
            tem como voltar à tela. Achado pela sessão que fez a recuperação de senha. Montada,
            ela busca as contas de novo cada vez que fica à vista (`ativa`). */}
        <div className="painel-corpo" hidden={aba !== 'contas'}>
          <BlocosDaSaga meuId={meuId} ativa={aba === 'contas'} />
        </div>

        {aba === 'servidores' && (
          <div className="adm-colunas">
            <div className="adm-lista">
              <div className="adm-busca">
                <input
                  placeholder="Procurar servidor ou quem criou"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>

              {lista === null ? (
                falhaDaLista
                  ? <FalhaAoCarregar texto={falhaDaLista} onTentar={() => { setFalhaDaLista(null); setTentativaDaLista((n) => n + 1); }} />
                  : <p className="adm-estado muted small">Carregando…</p>
              ) : (
                <>
                  {falhaDaLista && <p className="adm-falha-discreta">Não consegui atualizar a lista. {falhaDaLista}</p>}
                  {visiveis.map((s) => (
                    <button
                      key={s.id}
                      className={`adm-linha ${s.id === escolhido ? 'escolhido' : ''}`}
                      aria-current={s.id === escolhido ? 'true' : undefined}
                      title={s.criador ? `${s.nome} — criado por ${s.criador.apelido}` : s.nome}
                      onClick={() => setEscolhido(s.id)}
                    >
                      <QuadroDoServidor nome={s.nome} foto={s.foto} />
                      <span className="adm-linha-texto">
                        <span className="adm-linha-nome">{s.nome}</span>
                        <span className="adm-linha-numeros">{contar(s.pessoas, 'pessoa', 'pessoas')} · {s.online} online</span>
                        {s.id === escondido?.id
                          ? <span className="adm-linha-fora">fora da busca</span>
                          : s.souMembro && <span className="adm-linha-voce">você está aqui</span>}
                      </span>
                      {s.emCall > 0 && <span className="adm-selo-call">{s.emCall} em call</span>}
                    </button>
                  ))}
                  {naBusca.length === 0 && (
                    <p className="adm-estado muted small">
                      {lista.length === 0 ? 'Nenhum servidor na Saga ainda.' : 'Nenhum servidor com esse nome, nem criado por esse apelido.'}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="adm-detalhe" ref={colunaDoDetalhe}>
              {escolhido === null ? (
                lista !== null && lista.length > 0 && <p className="adm-estado muted">Escolha um servidor na lista.</p>
              ) : sumiu ? (
                <p className="adm-estado muted">Este servidor não existe mais.</p>
              ) : dados ? (
                <Detalhe
                  d={dados}
                  meuId={meuId}
                  agora={agora}
                  falha={falhaDaqui}
                  onAbrir={onAbrirServidor ? () => onAbrirServidor(dados.id) : undefined}
                />
              ) : falhaDaqui ? (
                <FalhaAoCarregar texto={falhaDaqui} onTentar={() => { setFalhaDoDetalhe(null); setTentativaDoDetalhe((n) => n + 1); }} />
              ) : (
                <p className="adm-estado muted">Carregando…</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Sem ter carregado uma vez: dizer que não chegou, em vez de desenhar uma lista vazia. */
function FalhaAoCarregar({ texto, onTentar }: { texto: string; onTentar: () => void }) {
  return (
    <div className="adm-estado">
      <span className="strong">Não consegui carregar</span>
      <p className="muted small">{texto}</p>
      <button className="adm-botao" onClick={onTentar}>Tentar de novo</button>
    </div>
  );
}

/** A cara do quadrado da trilha: a foto, ou duas letras — e a foto que não carrega volta às letras. */
function QuadroDoServidor({ nome, foto, grande = false }: { nome: string; foto: string | null; grande?: boolean }) {
  const url = urlDoArquivo(foto);
  const [quebrada, setQuebrada] = useState<string | null>(null);
  return (
    <span className={`adm-quadro ${grande ? 'adm-quadro-grande' : ''}`}>
      {url && quebrada !== url
        ? <img src={url} alt="" draggable={false} onError={() => setQuebrada(url)} />
        : nome.slice(0, 2).toUpperCase()}
    </span>
  );
}

function Numero({ rotulo, valor, extra }: { rotulo: string; valor: string | number; extra?: string }) {
  return (
    <div className="adm-numero">
      <span className="adm-numero-rotulo">{rotulo}</span>
      <span className="adm-numero-valor" title={String(valor)}>{valor}</span>
      {extra && <span className="adm-numero-extra">{extra}</span>}
    </div>
  );
}

/** O servidor escolhido, por inteiro. Só desenha: buscar e decidir o que mostrar é de quem chama. */
function Detalhe({ d, meuId, agora, falha, onAbrir }: {
  d: DetalheDoServidorDaSaga;
  meuId: number;
  agora: number;
  /** A última volta falhou: o que está aqui é da anterior, e isso se diz numa linha. */
  falha: string | null;
  onAbrir?: () => void;
}) {
  const banner = urlDoArquivo(d.banner);
  // Banner que não carrega some, em vez de virar um rasgo — a mesma regra da foto.
  const [bannerQuebrado, setBannerQuebrado] = useState<string | null>(null);

  const presentes = d.membros.filter((m) => !m.banido);
  const banidos = d.membros.filter((m) => m.banido);
  const vozes = d.salas.filter((s) => s.tipo === 'voz');
  const comGente = vozes.filter((s) => s.naCall.length > 0);
  // No detalhe `salas` é a LISTA, e não a contagem da lista da esquerda — as duas moram no
  // mesmo nome. Os números das salas saem daqui, do mesmo pedido que desenha a seção Salas.
  const privadas = d.salas.filter((s) => s.privada).length;

  // Em que call cada pessoa está, pela conta. Quem o servidor não achou entre os membros vem
  // sem `usuarioId`, e aí vale o que a identidade diz.
  const salaDaCall = new Map<number, string>();
  for (const s of comGente) {
    for (const p of s.naCall) {
      const conta = p.usuarioId ?? contaDaIdentidade(p.identity);
      if (conta !== null) salaDaCall.set(conta, s.nome);
    }
  }

  return (
    <>
      {falha && <p className="adm-falha-discreta">Não consegui atualizar agora; o que está aqui é da última busca. {falha}</p>}

      <div className="adm-topo">
        {banner && bannerQuebrado !== banner && (
          <div className="adm-banner">
            <img src={banner} alt="" draggable={false} onError={() => setBannerQuebrado(banner)} />
          </div>
        )}
        <div className="adm-identidade">
          <QuadroDoServidor nome={d.nome} foto={d.foto} grande />
          <div className="adm-identidade-texto">
            <div className="adm-nome">
              <span className="adm-corta" title={d.nome}>{d.nome}</span>
              <span className="adm-id">#{d.id}</span>
            </div>
            <div className="muted small adm-corta">
              {d.criador ? `criado por ${d.criador.apelido}` : 'nasceu sem dono'} · {rotuloDoDia(d.criadoEm, agora).toLowerCase()}
            </div>
          </div>
          {d.souMembro && (
            <div className="adm-voce">
              <span className="adm-selo adm-selo-casa">você faz parte</span>
              {onAbrir && <button className="adm-botao" onClick={onAbrir}>Abrir</button>}
            </div>
          )}
        </div>
      </div>

      <div className="adm-numeros">
        <Numero rotulo="Pessoas" valor={d.pessoas} />
        <Numero rotulo="Online agora" valor={d.online} />
        <Numero rotulo="Em call" valor={d.emCall} />
        <Numero rotulo="Salas" valor={`${vozes.length} voz · ${d.salas.length - vozes.length} texto`} extra={contar(privadas, 'privada', 'privadas')} />
        <Numero rotulo="Mensagens em 7 dias" valor={d.mensagens.ultimos7Dias} extra={`${d.mensagens.total} no total`} />
        <Numero rotulo="Última atividade" valor={haQuanto(d.mensagens.ultimaEm, agora)} />
      </div>

      <section className="painel-bloco">
        <h3>Em call agora</h3>
        {comGente.length === 0 && <p className="muted small">Ninguém em call.</p>}
        {comGente.map((s) => (
          <div key={s.id} className="adm-call">
            <div className="adm-call-sala"><Icon name="speaker" size={15} /><span className="adm-corta">{s.nome}</span></div>
            <ul className="adm-call-gente">
              {s.naCall.map((p) => (
                <li key={p.identity} title={p.name}>
                  <Avatar nome={p.name} foto={p.foto} enquadramento={p.enquadramento?.foto} />
                  <span className="adm-corta adm-nome-membro"><Nome nome={p.name} id={p.idExibido} turbo={p.turbo} /></span>
                  {p.screen && <span className="adm-icone adm-icone-tela" title="Transmitindo a tela"><Icon name="screen" size={14} /></span>}
                  {p.camera && <span className="adm-icone" title="Câmera ligada"><Icon name="camera" size={14} /></span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="painel-bloco">
        <h3>Pessoas <span className="count">{presentes.length}</span></h3>
        {presentes.length === 0 && <p className="muted small">Ninguém faz parte deste servidor.</p>}
        {pessoasPorCargo(d.membros, d.cargos).map((g) => (
          <div key={g.cargo?.id ?? 'sem-cargo'} className="adm-grupo">
            <div className="cabecalho-do-grupo" style={g.cargo?.cor ? { color: g.cargo.cor } : undefined}>
              {g.cargo?.nome ?? 'Sem cargo'} — {g.pessoas.length}
            </div>
            <ul className="adm-pessoas">
              {g.pessoas.map((m) => {
                const sala = salaDaCall.get(m.id);
                const deCastigo = !!m.castigoAte && m.castigoAte > agora;
                const temSelo = !!m.cargo?.dono || m.turbo || !!m.donoDaSaga || deCastigo || !!sala;
                return (
                  <li key={m.id} className="adm-pessoa">
                    {/* Grande, como na lista de pessoas: no tamanho normal a bolinha de
                        presença cobria a inicial de quem não tem foto. */}
                    <Avatar nome={m.nome} foto={m.foto} enquadramento={m.enquadramento?.foto} tamanho="big" status={m.status} />
                    <div className="adm-pessoa-quem">
                      <div className="adm-pessoa-nome">
                        <span className="adm-corta strong adm-nome-membro"><Nome membro={m} /></span>
                        <span className="adm-corta adm-apelido">@{m.apelido}</span>
                        {m.id === meuId && <span className="adm-apelido">· você</span>}
                      </div>
                      {temSelo && (
                        <div className="adm-selos">
                          {m.cargo?.dono && <span className="adm-selo">criou o servidor</span>}
                          {m.turbo && <span className="selo-berserk">BERSERK</span>}
                          {m.donoDaSaga && <span className="adm-selo adm-selo-casa">dono da Saga</span>}
                          {deCastigo && <span className="adm-selo adm-selo-aviso">de castigo</span>}
                          {sala && <span className="adm-selo adm-selo-ok" title={`Em call em ${sala}`}>em call · {sala}</span>}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      {banidos.length > 0 && (
        <section className="painel-bloco">
          <h3>Banidos <span className="count">{banidos.length}</span></h3>
          <ul className="adm-pessoas">
            {banidos.map((m) => (
              <li key={m.id} className="adm-pessoa adm-banido">
                <Avatar nome={m.nome} foto={m.foto} enquadramento={m.enquadramento?.foto} tamanho="big" />
                <div className="adm-pessoa-quem">
                  <div className="adm-pessoa-nome">
                    <span className="adm-corta strong adm-nome-membro"><Nome membro={m} /></span>
                    <span className="adm-corta adm-apelido">@{m.apelido}</span>
                  </div>
                  <div className="muted small adm-corta">
                    banido por {m.banidoPor ?? 'alguém'}{m.banidoEm ? ` ${emQueDia(m.banidoEm, agora)}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="painel-bloco">
        <h3>Salas <span className="count">{d.salas.length}</span></h3>
        {d.salas.length === 0 && <p className="muted small">Nenhuma sala.</p>}
        {salasPorCategoria(d.salas, d.categorias).map((g) => (
          <div key={g.categoria?.id ?? 'sem-gaveta'} className="adm-grupo">
            {g.categoria && <div className="cabecalho-do-grupo">{g.categoria.nome}</div>}
            <ul className="adm-salas">
              {g.salas.map((s) => {
                const veem = quemVe(s, d.cargos);
                return (
                  <li key={s.id} className="adm-sala">
                    <span className="tipo-da-sala">{s.tipo === 'texto' ? 'texto' : 'voz'}</span>
                    <div className="adm-sala-quem">
                      <div className="adm-sala-nome">
                        <span className="adm-corta" title={s.nome}>{s.nome}</span>
                        {s.privada && <span className="adm-tranca" title="Só alguns cargos veem esta sala"><Icon name="cadeado" size={13} /></span>}
                        {s.papel === 'notas' && <span className="adm-selo">notas da Saga</span>}
                      </div>
                      {s.privada && (
                        <div className="muted small adm-corta" title={veem.join(', ') || undefined}>
                          vê: {veem.length > 0 ? veem.join(', ') : 'nenhum cargo — só quem criou'}
                        </div>
                      )}
                      {s.tipo === 'texto' && (
                        <div className="muted small adm-corta">
                          {s.mensagens.total === 0
                            ? 'nenhuma mensagem'
                            : `${contar(s.mensagens.total, 'mensagem', 'mensagens')} · última ${haQuanto(s.mensagens.ultimaEm, agora)}`}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <section className="painel-bloco">
        <h3>Cargos <span className="count">{d.cargos.length}</span></h3>
        {d.cargos.length === 0 && <p className="muted small">Nenhum cargo.</p>}
        <ul className="adm-cargos">
          {cargosDoMaisAlto(d.cargos).map((c) => (
            <li key={c.id} className="adm-cargo">
              <span className="bolinha-cargo" style={{ background: c.cor ?? 'var(--text3)' }} />
              <span className="adm-cargo-nome adm-corta" title={c.nome}>{c.nome}</span>
              <span className="adm-cargo-dado">nível {c.nivel}</span>
              <span className="adm-cargo-dado">{contar(c.pessoas, 'pessoa', 'pessoas')}</span>
              <span className="adm-cargo-dado">{contar(c.permissoes.length, 'permissão', 'permissões')}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="adm-rodape">
        <p>Convites ativos: {d.convitesAtivos} · Sons no soundboard: {d.sons}</p>
        <p>
          O que se escreve nas salas não aparece aqui: a administração mostra como o servidor
          está montado, não a conversa.
        </p>
      </footer>
    </>
  );
}

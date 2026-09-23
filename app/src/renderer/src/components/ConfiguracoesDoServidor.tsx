import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  pode, podeSobre, verServidor, renomearServidor, moderar, urlDoArquivo,
  fotoDoServidor, bannerDoServidor, usarGif, salvarEnquadramentoDoServidor, ErroDoServidor,
  criarSala, renomearSala, apagarSala, editarSala, reordenarSalas,
  criarCategoria, renomearCategoria, apagarCategoria,
  criarCargo, editarCargo, apagarCargo, criarConvite, verConvites, sairDoServidor,
  type Acao, type AcaoDeModeracao, type Cargo, type CargoNovo, type Categoria, type Convite, type ConviteVivo,
  type Membro, type Permissao, type Servidor, type Sala, type TipoDeSala,
} from '../api';
import { destronados, empatadosCom, nivelParaCargoNovo } from '../cargos';
import type { Enquadramento } from '../enquadramento';
import { moverSala } from '../ordenacao';
import { paginasDoServidor, type Pagina, type PaginaDoServidor } from '../paginasDeConfiguracao';
import { useFecharComEsc } from '../useFechar';
import { Configuracoes, Linha, Pagina as Folha, Secao } from './Configuracoes';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { Nome } from './Nome';
import { EscolherImagem } from './EscolherImagem';
import { FotoDoServidor } from './TrilhaDeServidores';

// Espelho da regra do servidor, só para não mostrar botão que será recusado. Quem decide
// de verdade é o servidor: aqui é conveniência, não segurança.
const PERMISSAO_DE: Record<AcaoDeModeracao, Permissao> = {
  mutar: 'mutar', desconectar: 'desconectar', timeout: 'timeout', tirarTimeout: 'timeout',
  expulsar: 'expulsar', banir: 'banir', desbanir: 'banir', cargo: 'definirCargo',
};
const posso = (eu: Membro, acao: AcaoDeModeracao, alvo: Membro) => podeSobre(eu, PERMISSAO_DE[acao], alvo);
const emCastigo = (m: Membro) => !!m.castigoAte && m.castigoAte > Date.now();
const hora = (t: number) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** O castigo tinha 10 minutos fixos. O servidor aceita de 1 minuto a 1 dia. */
const CASTIGOS: { rotulo: string; minutos: number }[] = [
  { rotulo: '1 min', minutos: 1 }, { rotulo: '10 min', minutos: 10 }, { rotulo: '1 hora', minutos: 60 }, { rotulo: '1 dia', minutos: 60 * 24 },
];

/**
 * O que cada permissão faz, dito além do nome que o servidor manda — onde o nome sozinho
 * engana. O identificador fica FORA do editor: quem define é o dono da Saga, e a caixinha
 * que existia não fazia nada ao ser marcada.
 */
const DETALHE: Partial<Record<Permissao, string>> = {
  mutar: 'Cala para todos quem tem cargo abaixo do seu.',
  desconectar: 'Tira da sala de voz. A pessoa pode voltar.',
  timeout: 'Por um tempo, a pessoa não fala nem escreve. De 1 minuto a 1 dia.',
  expulsar: 'Tira do servidor. Volta se tiver um convite.',
  banir: 'Tira do servidor e não deixa voltar. Também dá desbanir.',
  definirCargo: 'Só cargos abaixo do seu.',
  gerirCargos: 'Nome, cor, nível e permissões dos cargos.',
  gerirSalas: 'Inclui categorias e quem pode ver cada sala.',
  gerirSons: 'Só vale para o cargo MAIS ALTO do servidor.',
  gerirServidor: 'Nome, foto e capa. Também deixa ver os convites vivos.',
  convidar: 'Vem ligada para todo mundo.',
  apagarMensagens: 'A própria mensagem qualquer um apaga.',
  transmitir: 'Sem ela, o botão de tela fica apagado. Tirar com a tela no ar derruba a transmissão.',
  tocarMusica: 'O bot de música: /tocar, /pular e /parar no chat. Ver a fila (/fila) é de todos.',
  moverPessoas: 'Arrastar alguém de uma sala de voz para outra, na barra. Só quem está abaixo do seu cargo.',
};
const GRUPOS_DE_PERMISSAO: { titulo: string; permissoes: Permissao[] }[] = [
  { titulo: 'Moderação', permissoes: ['mutar', 'desconectar', 'timeout', 'expulsar', 'banir', 'apagarMensagens'] },
  { titulo: 'Pessoas e cargos', permissoes: ['definirCargo', 'gerirCargos', 'convidar'] },
  { titulo: 'Na call', permissoes: ['transmitir', 'tocarMusica', 'moverPessoas'] },
  { titulo: 'O servidor', permissoes: ['gerirServidor', 'gerirSalas', 'gerirSons'] },
];

/**
 * As Configurações do servidor: uma página por assunto, com menu lateral.
 *
 * Eram um modal de 720 px com sete blocos numa rolagem só, e o título era só o nome do
 * servidor. A lógica de cada bloco veio de lá sem mudar (PainelDoServidor, até a v0.61); o
 * que mudou foi onde cada coisa mora, e o que só existia no botão direito da barra — quem
 * pode ver a sala, as categorias, tirar o castigo — ganhou lugar aqui também.
 */
export function ConfiguracoesDoServidor({ eu, servidor, categoriasDaBarra, donoDaSaga, inicial, onServidor, onSaiu, onClose }: {
  eu: Membro; servidor: Servidor;
  /**
   * As categorias, como a barra de salas já as tem. A rota `/servidor` não as manda (só a
   * busca de salas), e sem elas a árvore da página Salas saía vazia.
   */
  categoriasDaBarra: Categoria[];
  /** O identificador é da Saga inteira: só o dono da Saga o define. */
  donoDaSaga: boolean;
  /** A página que abre: a do submenu do botão direito, ou a primeira que a pessoa pode ver. */
  inicial?: PaginaDoServidor;
  onServidor: (s: Servidor) => void;
  onSaiu: () => void;
  onClose: () => void;
}) {
  const [membros, setMembros] = useState<Membro[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [permissoes, setPermissoes] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [saindo, setSaindo] = useState(false);
  /**
   * Falhar em carregar NÃO é o mesmo que não ter nada: sem ter carregado uma vez, a página
   * diz que não conseguiu e oferece tentar de novo, em vez de afirmar que não há cargo, sala
   * nem gente. O dono já achou que os cargos tinham sumido por causa disso.
   */
  const [carregou, setCarregou] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await verServidor();
      setMembros(r.membros); setSalas(r.salas); setCategorias(r.categorias ?? categoriasDaBarra);
      setCargos(r.cargos); setPermissoes(r.permissoes);
      setCarregou(true); setErro(null);
    } catch (e) { setErro((e as Error).message); }
    finally { setCarregando(false); }
  }, [categoriasDaBarra]);
  useEffect(() => { recarregar(); }, [recarregar]);

  /** Toda ação passa por aqui: erro e acerto no alto da página, e a lista relida. */
  const fazer = async (acao: () => Promise<unknown>, feito?: string) => {
    setErro(null); setAviso(null); setOcupado(true);
    try { await acao(); if (feito) setAviso(feito); await recarregar(); return true; }
    catch (e) { setErro((e as Error).message); return false; }
    finally { setOcupado(false); }
  };

  const podeSair = !eu.cargo?.dono;
  const disponiveis = paginasDoServidor(eu.cargo);
  const [pagina, setPagina] = useState<PaginaDoServidor>(() =>
    inicial && disponiveis.some((p) => p.id === inicial) ? inicial : (disponiveis[0]?.id ?? 'pessoas'));

  const paginas: Pagina<PaginaDoServidor>[] = [
    ...disponiveis,
    ...(podeSair ? [{
      id: 'sair' as PaginaDoServidor, titulo: saindo ? `Sair mesmo de ${servidor.nome}` : `Sair de ${servidor.nome}`,
      icone: 'sair', fim: true, tom: 'perigo' as const, armado: saindo,
      acao: () => {
        if (!saindo) { setSaindo(true); setTimeout(() => setSaindo(false), 4000); return; }
        fazer(async () => { await sairDoServidor(); onSaiu(); });
      },
    }] : []),
  ];

  const escopo = {
    quadro: urlDoArquivo(servidor.foto) ? <FotoDoServidor url={urlDoArquivo(servidor.foto)!} enquadramento={servidor.enquadramento?.foto} /> : servidor.nome.slice(0, 2).toUpperCase(),
    nome: servidor.nome,
    meta: carregou ? `${membros.filter((m) => !m.banido).length} pessoas` : 'Configurações do servidor',
  };

  const ctx = { eu, servidor, membros, salas, categorias, cargos, permissoes, ocupado, donoDaSaga, fazer, onServidor, setErro, setAviso };

  return (
    <Configuracoes casa="Configurações do servidor" escopo={escopo} paginas={paginas} atual={pagina} onIr={(id) => { setPagina(id); setErro(null); setAviso(null); }} onClose={onClose}>
      {erro && <div className="cfg-alerta" data-tom="perigo" role="alert">{erro}</div>}
      {aviso && <div className="cfg-alerta" data-tom="ok">{aviso}</div>}
      {!carregou ? (
        <Folha titulo="Configurações do servidor">
          {carregando
            ? <p className="cfg-vazio">Carregando as configurações…</p>
            : (
              <div className="cfg-alerta" data-tom="aviso">
                <span>As configurações deste servidor não chegaram — nada foi perdido, é a busca que não completou.</span>
                <button className="cfg-botao" data-tamanho="pequeno" onClick={recarregar}>Tentar de novo</button>
              </div>
            )}
        </Folha>
      ) : pagina === 'perfil' ? <PaginaPerfil {...ctx} />
        : pagina === 'pessoas' ? <PaginaPessoas {...ctx} />
        : pagina === 'cargos' ? <PaginaCargos {...ctx} />
        : pagina === 'convites' ? <PaginaConvites {...ctx} />
        : pagina === 'banidos' ? <PaginaBanidos {...ctx} />
        : pagina === 'salas' ? <PaginaSalas {...ctx} />
        : null}
    </Configuracoes>
  );
}

type Ctx = {
  eu: Membro; servidor: Servidor; membros: Membro[]; salas: Sala[]; categorias: Categoria[]; cargos: Cargo[];
  permissoes: Record<string, string>; ocupado: boolean; donoDaSaga: boolean;
  fazer: (acao: () => Promise<unknown>, feito?: string) => Promise<boolean>;
  onServidor: (s: Servidor) => void;
  setErro: (e: string | null) => void;
  setAviso: (a: string | null) => void;
};

// ---- Perfil do servidor ---------------------------------------------------------------

function PaginaPerfil({ servidor, ocupado, onServidor, setErro, setAviso }: Ctx) {
  const [nome, setNome] = useState(servidor.nome);
  const mudou = nome.trim() !== servidor.nome;
  const salvar = async () => {
    setErro(null);
    try { onServidor((await renomearServidor(nome)).servidor); setAviso('Nome do servidor salvo.'); }
    catch (e) { setErro((e as Error).message); }
  };
  /**
   * Enquadrar a foto do servidor é novo (v0.62): o servidor de antes não conhece a rota e
   * responde 404. O app e o servidor sobem separados, então isso acontece de verdade por
   * alguns minutos — e a frase diz o que é, em vez de um "não encontrado".
   */
  const enquadrar = async (papel: 'foto' | 'banner', v: Enquadramento) => {
    try { onServidor(await salvarEnquadramentoDoServidor(papel, v)); }
    catch (e) {
      if (e instanceof ErroDoServidor && e.status === 404) throw new Error('O servidor ainda não sabe enquadrar a imagem dele: chega junto com a versão nova do servidor.');
      throw e;
    }
  };
  return (
    <Folha titulo="Perfil do servidor" descricao={`Nome, foto e capa do ${servidor.nome}. É o que aparece na trilha, no convite e no alto do menu do servidor.`}>
      <Secao>
        <div className="cfg-campo">
          <label htmlFor="cfg-nome-servidor">Nome</label>
          <div className="cfg-campo-linha">
            <input id="cfg-nome-servidor" value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && mudou) salvar(); }} />
            <button className="cfg-botao" data-variante="primario" disabled={ocupado || !mudou || !nome.trim()} onClick={salvar}>Salvar</button>
          </div>
        </div>
      </Secao>
      <Secao titulo="Imagens">
        <div className="imagens">
          <EscolherImagem
            rotulo="Foto do servidor" formato="quadrado" atual={servidor.foto}
            papel="foto" enquadramento={servidor.enquadramento?.foto}
            onEnquadrar={(v) => enquadrar('foto', v)}
            onEnviar={async (a) => { setErro(null); try { onServidor((await fotoDoServidor(a)).servidor); } catch (e) { setErro((e as Error).message); } }}
            onGif={async (url) => { setErro(null); const r = await usarGif('servidor.foto', url); if (r.servidor) onServidor(r.servidor); }}
          />
          <EscolherImagem
            rotulo="Capa do servidor" formato="faixa" atual={servidor.banner}
            papel="banner" enquadramento={servidor.enquadramento?.banner}
            onEnquadrar={(v) => enquadrar('banner', v)}
            onEnviar={async (a) => { setErro(null); try { onServidor((await bannerDoServidor(a)).servidor); } catch (e) { setErro((e as Error).message); } }}
            onGif={async (url) => { setErro(null); const r = await usarGif('servidor.banner', url); if (r.servidor) onServidor(r.servidor); }}
          />
        </div>
        <p className="cfg-ajuda">A foto aparece quadrada em todo lugar: na trilha, no alto da barra e aqui.</p>
      </Secao>
      <div className="cfg-ponte">
        <Icon name="info" size={16} />
        <span>O <b>seu</b> nome neste servidor fica em <b>Configurações › Seu perfil</b> — a engrenagem ao lado do seu nome, embaixo.</span>
      </div>
    </Folha>
  );
}

// ---- Pessoas --------------------------------------------------------------------------

function PaginaPessoas(ctx: Ctx) {
  const { eu, membros, cargos, ocupado, fazer } = ctx;
  const [busca, setBusca] = useState('');
  const [soCastigo, setSoCastigo] = useState(false);
  const [menu, setMenu] = useState<{ m: Membro; x: number; y: number } | null>(null);
  const presentes = membros.filter((m) => !m.banido);
  const emCastigoAgora = presentes.filter(emCastigo);
  const b = busca.trim().toLowerCase();
  const lista = presentes
    .filter((m) => !soCastigo || emCastigo(m))
    .filter((m) => !b || m.nome.toLowerCase().includes(b) || m.apelido.toLowerCase().includes(b));
  const cargosQueDou = cargos.filter((c) => c.nivel < (eu.cargo?.nivel ?? 0) || eu.cargo?.dono);

  return (
    <Folha titulo="Pessoas" largura="cheia" descricao="Quem está neste servidor. O “…” de cada linha é o mesmo menu do botão direito sobre a pessoa.">
      <div className="cfg-filtros">
        <label className="cfg-busca">
          <Icon name="busca" size={16} />
          <input value={busca} placeholder="Buscar pessoa" onChange={(e) => setBusca(e.target.value)} />
        </label>
        {emCastigoAgora.length > 0 && (
          <button className="cfg-botao" data-variante={soCastigo ? 'primario' : undefined} data-tamanho="pequeno" onClick={() => setSoCastigo(!soCastigo)}>
            Em castigo · {emCastigoAgora.length}
          </button>
        )}
      </div>
      <div className="cfg-tabela" role="table">
        <div className="cfg-tabela-cabeca" role="row"><span>Pessoa</span><span>Cargo</span><span className="cfg-estado">Estado</span><span /></div>
        {lista.map((m) => {
          const acoes = acoesSobre(eu, m, ctx.donoDaSaga);
          return (
            <div key={m.id} className="cfg-tabela-linha" role="row" aria-selected={menu?.m.id === m.id || undefined}
              onContextMenu={(e) => { if (acoes) { e.preventDefault(); setMenu({ m, x: e.clientX, y: e.clientY }); } }}>
              <span className="cfg-quem">
                <Avatar nome={m.nome} foto={m.foto} enquadramento={m.enquadramento?.foto} tamanho="big" />
                <span className="cfg-quem-texto">
                  <span className="cfg-quem-nome"><Nome membro={m} />{m.id === eu.id && <span className="cfg-selo">você</span>}</span>
                  <span className="cfg-quem-meta">@{m.apelido}</span>
                </span>
              </span>
              {posso(eu, 'cargo', m) ? (
                <select value={m.cargo?.id ?? ''} disabled={ocupado} aria-label={`Cargo de ${m.nome}`}
                  onChange={(e) => fazer(() => moderar('cargo', m.id, { cargo: Number(e.target.value) }), `${m.nome} agora é ${cargos.find((c) => c.id === Number(e.target.value))?.nome ?? 'outro cargo'}.`)}>
                  {m.cargo && !cargosQueDou.some((c) => c.id === m.cargo!.id) && <option value={m.cargo.id}>{m.cargoNome}</option>}
                  {cargosQueDou.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              ) : (
                <span className="cfg-estado" style={m.cargo?.cor && !m.cargo.dono ? { color: m.cargo.cor } : undefined}>{m.cargo?.dono ? 'Criou o servidor' : m.cargoNome}</span>
              )}
              <span className="cfg-estado" data-tom={emCastigo(m) ? 'aviso' : undefined}>
                {emCastigo(m) ? `castigo até ${hora(m.castigoAte!)}` : m.idExibido ? `identificador ${m.idExibido}` : ''}
              </span>
              {acoes ? (
                <button className="cfg-botao-icone" aria-label={`Mais ações sobre ${m.nome}`} disabled={ocupado}
                  onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ m, x: r.right, y: r.bottom + 4 }); }}>
                  <Icon name="pontos" size={18} />
                </button>
              ) : <span />}
            </div>
          );
        })}
        {lista.length === 0 && <p className="cfg-vazio">Ninguém com “{busca.trim()}”.</p>}
      </div>
      {menu && <MenuDeAcoes {...ctx} m={menu.m} em={menu} onClose={() => setMenu(null)} />}
    </Folha>
  );
}

/** Se há alguma coisa que eu posso fazer sobre esta pessoa aqui. */
const acoesSobre = (eu: Membro, m: Membro, donoDaSaga: boolean) =>
  donoDaSaga || (['mutar', 'desconectar', 'timeout', 'expulsar', 'banir'] as AcaoDeModeracao[]).some((a) => posso(eu, a, m));

/**
 * O "…" da linha. As ações que moravam em sete botões miúdos por linha — dois deles só
 * ícone, sem nome —, e as que só existiam aqui (tirar o castigo) ou só no botão direito.
 * Expulsar e banir levam o nome da pessoa e armam no próprio botão: o segundo clique confirma.
 */
function MenuDeAcoes({ eu, m, em, donoDaSaga, ocupado, fazer, onClose }: Ctx & { m: Membro; em: { x: number; y: number }; onClose: () => void }) {
  useFecharComEsc(onClose);
  const caixa = useRef<HTMLDivElement>(null);
  const [armado, setArmado] = useState<'expulsar' | 'banir' | null>(null);
  const [id, setId] = useState(m.idExibido ?? '');
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', fora), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', fora); };
  }, [onClose]);
  const agir = async (acao: Acao, extra?: { minutos?: number; idExibido?: string }, feito?: string) => {
    onClose();
    await fazer(() => moderar(acao, m.id, extra), feito);
  };
  const largura = 244;
  const x = Math.min(em.x - largura, window.innerWidth - largura - 8);
  const y = Math.min(em.y, window.innerHeight - 440);
  return (
    <div ref={caixa} className="cfg-menu-acoes" style={{ left: Math.max(8, x), top: Math.max(8, y), width: largura }} role="menu">
      <div className="cfg-menu-acoes-cabeca"><b>{m.nome}</b> · {m.cargoNome}</div>
      {posso(eu, 'timeout', m) && (emCastigo(m) ? (
        <button disabled={ocupado} onClick={() => agir('tirarTimeout', undefined, `${m.nome} saiu do castigo.`)}><Icon name="check" size={16} /> Tirar o castigo</button>
      ) : (
        <>
          <div className="cfg-menu-acoes-grupo">Castigo</div>
          <div className="cfg-chips">
            {CASTIGOS.map((c) => (
              <button key={c.minutos} className="cfg-chip" disabled={ocupado} onClick={() => agir('timeout', { minutos: c.minutos }, `${m.nome} de castigo por ${c.rotulo}.`)}>{c.rotulo}</button>
            ))}
          </div>
        </>
      ))}
      {posso(eu, 'mutar', m) && <button disabled={ocupado} onClick={() => agir('mutar', undefined, `${m.nome} mutado para todos.`)}><Icon name="micOff" size={16} /> Mutar para todos</button>}
      {posso(eu, 'desconectar', m) && <button disabled={ocupado} onClick={() => agir('desconectar', undefined, `${m.nome} saiu da call.`)}><Icon name="hangup" size={16} /> Tirar da call</button>}
      {(posso(eu, 'expulsar', m) || posso(eu, 'banir', m)) && <div className="cfg-menu-acoes-risco" />}
      {posso(eu, 'expulsar', m) && (
        <button data-tom="perigo" data-armado={armado === 'expulsar' ? '' : undefined} disabled={ocupado}
          onClick={() => armado === 'expulsar' ? agir('expulsar', undefined, `${m.nome} foi expulso. Volta com um convite.`) : setArmado('expulsar')}>
          <Icon name="sair" size={16} /> {armado === 'expulsar' ? `Expulsar mesmo ${m.nome}` : `Expulsar ${m.nome}`}
        </button>
      )}
      {posso(eu, 'banir', m) && (
        <button data-tom="perigo" data-armado={armado === 'banir' ? '' : undefined} disabled={ocupado}
          onClick={() => armado === 'banir' ? agir('banir', undefined, `${m.nome} foi banido.`) : setArmado('banir')}>
          <Icon name="banir" size={16} /> {armado === 'banir' ? `Banir mesmo ${m.nome}` : `Banir ${m.nome}`}
        </button>
      )}
      {donoDaSaga && (
        <>
          <div className="cfg-menu-acoes-grupo">Da Saga</div>
          <div className="cfg-chips">
            <input value={id} maxLength={8} placeholder="identificador" aria-label="Identificador" onChange={(e) => setId(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') agir('id', { idExibido: id }, 'Identificador salvo.'); }}
              style={{ flex: 1, minWidth: 0, height: 28, padding: '0 8px', fontSize: 13 }} />
            <button className="cfg-chip" disabled={ocupado || id === (m.idExibido ?? '')} onClick={() => agir('id', { idExibido: id }, 'Identificador salvo.')}>Salvar</button>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Cargos ---------------------------------------------------------------------------

const CORES = ['#e04852', '#e0a233', '#2ea36a', '#4a8fe7', '#c084fc', '#ec4899', '#99a1b0'];

function PaginaCargos({ eu, cargos, membros, permissoes, ocupado, fazer }: Ctx) {
  const meuNivel = eu.cargo?.nivel ?? 0;
  const souDono = !!eu.cargo?.dono;
  const novo = (): CargoNovo & { id?: number } => ({
    nome: '', cor: '#99aab5', permissoes: [],
    // Acima do mais alto que existe: dois cargos criados sem mexer no número caíam no mesmo
    // nível, e nível igual é empate — ver cargos.ts.
    nivel: nivelParaCargoNovo(cargos.map((c) => c.nivel), meuNivel, souDono),
  });
  const [escolhido, setEscolhido] = useState<number | 'novo' | null>(cargos[0]?.id ?? null);
  const original = escolhido === 'novo' ? null : cargos.find((c) => c.id === escolhido) ?? null;
  const [editando, setEditando] = useState<CargoNovo & { id?: number }>(() => original ? { ...original } : novo());
  const [apagando, setApagando] = useState(false);
  useEffect(() => { setEditando(original ? { ...original } : novo()); setApagando(false); }, [escolhido]); // eslint-disable-line react-hooks/exhaustive-deps

  const pessoasNo = (id: number) => membros.filter((m) => !m.banido && m.cargo?.id === id).length;
  const travado = !!original && !souDono && original.nivel >= meuNivel;
  const mudou = !original || JSON.stringify({ ...original, permissoes: [...original.permissoes].sort() }) !== JSON.stringify({ ...original, ...editando, permissoes: [...editando.permissoes].sort() });
  const empatados = empatadosCom(editando.nivel, cargos, editando.id);
  const perdem = destronados(editando.nivel, cargos, editando.id);

  const salvar = async () => {
    const dados = { nome: editando.nome, cor: editando.cor, nivel: editando.nivel, permissoes: editando.permissoes };
    const ok = await fazer(() => (editando.id ? editarCargo(editando.id, dados) : criarCargo(dados)), 'Cargo salvo.');
    if (ok && !editando.id) setEscolhido(null);
  };

  return (
    <Folha titulo="Cargos" largura="cheia" descricao="Cada pessoa tem um cargo neste servidor. Quem tem nível maior age sobre quem tem nível menor; quem criou o servidor fica acima de todos sem ocupar nenhum.">
      <div className="cfg-lista-e-detalhe">
        <div className="cfg-lista">
          {cargos.map((c) => (
            <button key={c.id} className="cfg-lista-linha" aria-selected={escolhido === c.id} onClick={() => setEscolhido(c.id)}>
              <span className="cfg-cor" style={{ ['--cor-do-cargo' as string]: c.cor ?? undefined }} />
              <span className="cfg-lista-nome">{c.nome}</span>
              <span className="cfg-item-fim">{pessoasNo(c.id)}</span>
            </button>
          ))}
          <button className="cfg-botao" data-variante="fantasma" data-tamanho="pequeno" style={{ justifyContent: 'flex-start', marginTop: 8 }} onClick={() => setEscolhido('novo')}>
            <Icon name="maisSimples" size={16} /> Criar cargo
          </button>
        </div>

        {escolhido === null ? <p className="cfg-vazio">Escolha um cargo na lista, ou crie um.</p> : (
          <div>
            {travado && <div className="cfg-alerta" data-tom="aviso">Este cargo está no seu nível ou acima dele: você vê, mas não mexe.</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 96px', gap: 12 }}>
              <div className="cfg-campo">
                <label htmlFor="cfg-cargo-nome">Nome</label>
                <input id="cfg-cargo-nome" value={editando.nome} maxLength={24} disabled={travado} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} />
              </div>
              <div className="cfg-campo">
                <label htmlFor="cfg-cargo-nivel">Nível</label>
                <input id="cfg-cargo-nivel" type="number" min={1} max={99} value={editando.nivel} disabled={travado} style={{ textAlign: 'center' }}
                  onChange={(e) => setEditando({ ...editando, nivel: Number(e.target.value) })} />
              </div>
            </div>
            {empatados.length > 0 && <p className="cfg-ajuda">Nível {editando.nivel} é o mesmo de <b>{empatados.join(', ')}</b>: empatados, um não age sobre o outro, e na lista fica em cima quem foi criado antes.</p>}
            {perdem.length > 0 && <p className="cfg-ajuda">Isto passa a ser o cargo mais alto — e o soundboard é sempre do mais alto. Quem está em <b>{perdem.join(', ')}</b> deixa de subir e apagar sons.</p>}

            <div className="cfg-campo" style={{ marginTop: 12 }}>
              <span className="cfg-campo-rotulo">Cor do nome</span>
              <div className="cfg-cores">
                {CORES.map((c) => (
                  <button key={c} className="cfg-amostra" aria-label={`Cor ${c}`} aria-pressed={editando.cor?.toLowerCase() === c} disabled={travado}
                    style={{ ['--cor-do-cargo' as string]: c }} onClick={() => setEditando({ ...editando, cor: c })} />
                ))}
                <input type="color" value={editando.cor ?? '#99aab5'} disabled={travado} title="Outra cor" aria-label="Outra cor"
                  onChange={(e) => setEditando({ ...editando, cor: e.target.value })} />
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
            {GRUPOS_DE_PERMISSAO.map((g) => (
              <Secao key={g.titulo} titulo={g.titulo}>
                {g.permissoes.filter((p) => p in permissoes).map((p) => {
                  const naoTenho = !souDono && !pode(eu.cargo, p);
                  return (
                    <Linha key={p} rotulo={permissoes[p]} explica={DETALHE[p]} travada={travado || naoTenho}
                      motivo={naoTenho ? 'Você não pode dar uma permissão que não tem.' : undefined}>
                      <input type="checkbox" role="switch" className="cfg-chave" aria-label={permissoes[p]} disabled={travado || naoTenho}
                        checked={editando.permissoes.includes(p)}
                        onChange={(e) => setEditando({ ...editando, permissoes: e.target.checked ? [...editando.permissoes, p] : editando.permissoes.filter((x) => x !== p) })} />
                    </Linha>
                  );
                })}
              </Secao>
            ))}
            </div>

            {!travado && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
                <button className="cfg-botao" data-variante="primario" disabled={ocupado || !mudou || !editando.nome.trim()} onClick={salvar}>
                  {editando.id ? 'Salvar' : 'Criar cargo'}
                </button>
                {editando.id && mudou && <button className="cfg-botao" data-variante="fantasma" onClick={() => setEditando(original ? { ...original } : novo())}>Desfazer</button>}
                {editando.id && (
                  <button className="cfg-botao" data-variante="perigo" data-armado={apagando ? '' : undefined} style={{ marginLeft: 'auto' }} disabled={ocupado}
                    onClick={async () => {
                      if (!apagando) { setApagando(true); return; }
                      if (await fazer(() => apagarCargo(editando.id!), 'Cargo apagado.')) setEscolhido(null);
                    }}>
                    {apagando ? `Apagar mesmo (${pessoasNo(editando.id)} descem para o mais baixo)` : 'Apagar cargo'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Folha>
  );
}

// ---- Convites -------------------------------------------------------------------------

function PaginaConvites({ eu, servidor, ocupado, setErro, setAviso }: Ctx) {
  const [convite, setConvite] = useState<Convite | null>(null);
  const [vivos, setVivos] = useState<ConviteVivo[] | null>(null);
  const veLista = pode(eu.cargo, 'gerirServidor');
  const lerLista = useCallback(() => { if (veLista) verConvites().then(setVivos).catch(() => setVivos(null)); }, [veLista]);
  useEffect(() => { lerLista(); }, [lerLista]);
  const gerar = async () => {
    setErro(null);
    try { setConvite(await criarConvite()); setAviso('Convite gerado.'); lerLista(); }
    catch (e) { setErro((e as Error).message); }
  };
  return (
    <Folha titulo="Convites" descricao={`Quem tem o código entra no ${servidor.nome}. Ele vale por uma semana, e quem entra cai no cargo mais baixo.`}>
      <Secao>
        <div className="cfg-campo-linha">
          <input readOnly value={convite?.codigo ?? ''} placeholder="Gere um código" className="cfg-codigo" style={{ textAlign: 'center', fontSize: 16 }} aria-label="Código do convite" />
          <button className="cfg-botao" data-variante="primario" disabled={ocupado} onClick={gerar}>{convite ? 'Gerar outro' : 'Gerar'}</button>
          {convite && <button className="cfg-botao" onClick={() => { navigator.clipboard?.writeText(convite.codigo); setAviso('Código copiado.'); }}>Copiar</button>}
        </div>
      </Secao>
      {veLista && vivos && (
        <Secao titulo={`Convites vivos · ${vivos.length}`}>
          {vivos.length === 0 && <p className="cfg-vazio">Nenhum convite vivo agora.</p>}
          {vivos.map((c) => (
            <Linha key={c.codigo} rotulo={<span className="cfg-codigo">{c.codigo}</span>}
              explica={`${c.usos} uso${c.usos === 1 ? '' : 's'}${c.maxUsos ? ` de ${c.maxUsos}` : ''} · ${c.expiraEm ? `vence ${new Date(c.expiraEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora(c.expiraEm)}` : 'não vence'}`} />
          ))}
        </Secao>
      )}
    </Folha>
  );
}

// ---- Banidos --------------------------------------------------------------------------

function PaginaBanidos({ eu, membros, ocupado, fazer }: Ctx) {
  const banidos = membros.filter((m) => m.banido);
  return (
    <Folha titulo="Banidos" descricao="Quem foi banido não aparece na lista de pessoas e não entra nem com convite. Desbanir devolve a chance de entrar com um convite novo.">
      {banidos.length === 0 && <p className="cfg-vazio">Ninguém banido deste servidor.</p>}
      {banidos.map((m) => (
        <div key={m.id} className="cfg-linha">
          <span className="cfg-quem">
            <Avatar nome={m.nome} foto={m.foto} enquadramento={m.enquadramento?.foto} tamanho="big" />
            <span className="cfg-quem-texto">
              <span className="cfg-quem-nome"><Nome membro={m} /></span>
              <span className="cfg-quem-meta">
                @{m.apelido} · banido por {m.banidoPor ?? 'alguém'}
                {m.banidoEm ? ` em ${new Date(m.banidoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
              </span>
            </span>
          </span>
          {posso(eu, 'desbanir', m) && (
            <div className="cfg-controle">
              <button className="cfg-botao" data-tamanho="pequeno" disabled={ocupado} onClick={() => fazer(() => moderar('desbanir', m.id), `${m.nome} desbanido.`)}>Desbanir</button>
            </div>
          )}
        </div>
      ))}
    </Folha>
  );
}

// ---- Salas e categorias ---------------------------------------------------------------

type Escolha = { tipo: 'sala'; id: number } | { tipo: 'categoria'; id: number } | { tipo: 'nova' } | null;

function PaginaSalas({ eu, salas, categorias, cargos, ocupado, fazer }: Ctx) {
  const [escolha, setEscolha] = useState<Escolha>(salas[0] ? { tipo: 'sala', id: salas[0].id } : null);
  const ordemDosGrupos: (number | null)[] = [null, ...categorias.slice().sort((a, b) => a.ordem - b.ordem).map((c) => c.id)];
  const grupos = useMemo(() => ordemDosGrupos.map((id) => ({
    categoria: id === null ? null : categorias.find((c) => c.id === id) ?? null,
    salas: salas.filter((s) => s.categoriaId === id).sort((a, b) => a.ordem - b.ordem),
  })), [salas, categorias]); // eslint-disable-line react-hooks/exhaustive-deps
  const naOrdem = grupos.flatMap((g) => g.salas);
  const moviveis = naOrdem.filter((s) => !s.papel);

  /** Mover é mandar a ordem inteira de novo (o servidor pede todas as salas, uma vez cada). */
  const mover = (id: number, categoriaId: number | null, indice: number) => {
    const itens = moviveis.map((s) => ({ id: s.id, categoriaId: s.categoriaId }));
    const nova = moverSala(itens, ordemDosGrupos, id, { categoriaId, indice });
    return fazer(() => reordenarSalas(nova));
  };

  return (
    <Folha titulo="Salas e categorias" largura="cheia" descricao="Na ordem em que aparecem na barra. Arrastar na barra continua valendo; aqui também dá pelas setas.">
      <div className="cfg-lista-e-detalhe" style={{ gridTemplateColumns: '260px minmax(0,1fr)' }}>
        <div className="cfg-lista">
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <button className="cfg-botao" data-tamanho="pequeno" onClick={() => setEscolha({ tipo: 'nova' })}><Icon name="maisSimples" size={16} /> Sala ou categoria</button>
          </div>
          {grupos.map((g) => (
            <div key={g.categoria?.id ?? 'soltas'}>
              {g.categoria && (
                <button className="cfg-lista-grupo" style={{ width: '100%', textAlign: 'left' }} onClick={() => setEscolha({ tipo: 'categoria', id: g.categoria!.id })}
                  aria-selected={escolha?.tipo === 'categoria' && escolha.id === g.categoria.id}>
                  {g.categoria.nome}
                </button>
              )}
              {g.salas.map((s) => {
                const i = g.salas.indexOf(s);
                return (
                  <div key={s.id} className="cfg-lista-linha" aria-selected={escolha?.tipo === 'sala' && escolha.id === s.id} role="button" tabIndex={0}
                    onClick={() => setEscolha({ tipo: 'sala', id: s.id })}
                    onKeyDown={(e) => { if (e.key === 'Enter') setEscolha({ tipo: 'sala', id: s.id }); }}>
                    <Icon name={s.tipo === 'texto' ? 'texto' : 'speaker'} size={16} />
                    <span className="cfg-lista-nome">{s.nome}</span>
                    {s.privada && <Icon name="cadeado" size={14} />}
                    {!s.papel && (
                      <span className="cfg-item-fim">
                        <button className="cfg-botao-icone" style={{ width: 24, height: 24 }} aria-label={`Subir ${s.nome}`} disabled={ocupado || i === 0}
                          onClick={(e) => { e.stopPropagation(); mover(s.id, s.categoriaId, i - 1); }}><Icon name="setaCima" size={16} /></button>
                        <button className="cfg-botao-icone" style={{ width: 24, height: 24 }} aria-label={`Descer ${s.nome}`} disabled={ocupado || i === g.salas.length - 1}
                          onClick={(e) => { e.stopPropagation(); mover(s.id, s.categoriaId, i + 2); }}><Icon name="seta" size={16} /></button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div>
          {escolha?.tipo === 'sala' && (() => {
            const s = salas.find((x) => x.id === escolha.id);
            return s ? <EditorDeSala key={s.id} sala={s} ultima={salas.length <= 1} categorias={categorias} cargos={cargos} eu={eu} ocupado={ocupado} fazer={fazer}
              onMover={(categoriaId) => mover(s.id, categoriaId, Number.MAX_SAFE_INTEGER)} onApagada={() => setEscolha(null)} /> : null;
          })()}
          {escolha?.tipo === 'categoria' && (() => {
            const c = categorias.find((x) => x.id === escolha.id);
            return c ? <EditorDeCategoria key={c.id} categoria={c} ocupado={ocupado} fazer={fazer} onApagada={() => setEscolha(null)} /> : null;
          })()}
          {escolha?.tipo === 'nova' && <CriarSalaOuCategoria ocupado={ocupado} fazer={fazer} />}
          {!escolha && <p className="cfg-vazio">Escolha uma sala ou uma categoria na lista.</p>}
        </div>
      </div>
    </Folha>
  );
}

function EditorDeSala({ sala, ultima, categorias, cargos, eu, ocupado, fazer, onMover, onApagada }: {
  sala: Sala; ultima: boolean; categorias: Categoria[]; cargos: Cargo[]; eu: Membro; ocupado: boolean;
  fazer: Ctx['fazer']; onMover: (categoriaId: number | null) => void; onApagada: () => void;
}) {
  const [nome, setNome] = useState(sala.nome);
  const [privada, setPrivada] = useState(!!sala.privada);
  const [quem, setQuem] = useState<number[]>(sala.cargos ?? []);
  const [apagando, setApagando] = useState(false);
  const tipo = sala.tipo === 'texto' ? 'sala de texto' : 'sala de voz';
  const privacidadeMudou = privada !== !!sala.privada || (privada && [...quem].sort().join() !== [...(sala.cargos ?? [])].sort().join());
  // Quem tranca pode ficar de fora da própria sala — não é impedido (quem criou vê tudo e
  // desfaz), mas é bom saber antes de ela sumir da própria lista.
  const vouMeExcluir = privada && !eu.cargo?.dono && !quem.includes(eu.cargo?.id ?? -1);

  if (sala.papel) {
    return (
      <div>
        <h2 className="cfg-secao-titulo">{sala.nome}</h2>
        <p className="cfg-ajuda">Esta sala é da Saga — as notas de versão chegam por ela. Aqui ela só se lê: não se renomeia, não muda de lugar e não se apaga.</p>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="cfg-campo">
        <label htmlFor="cfg-sala-nome">Nome da {tipo}</label>
        <div className="cfg-campo-linha">
          <input id="cfg-sala-nome" value={nome} maxLength={32} onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && nome.trim() && nome !== sala.nome) fazer(() => renomearSala(sala.id, nome), 'Sala renomeada.'); }} />
          <button className="cfg-botao" disabled={ocupado || !nome.trim() || nome === sala.nome} onClick={() => fazer(() => renomearSala(sala.id, nome), 'Sala renomeada.')}>Salvar</button>
        </div>
      </div>
      {categorias.length > 0 && (
        <div className="cfg-campo">
          <label htmlFor="cfg-sala-categoria">Categoria</label>
          <select id="cfg-sala-categoria" value={sala.categoriaId ?? ''} disabled={ocupado}
            onChange={(e) => onMover(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">Sem categoria (no alto)</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
      )}

      <div>
        <Linha rotulo={<><Icon name="cadeado" size={14} /> Sala privada</>}
          explica="Só os cargos marcados veem. Para quem não está na lista, a sala não aparece — nem na barra, nem no chat, nem na voz.">
          <input type="checkbox" role="switch" className="cfg-chave" aria-label="Sala privada" checked={privada} onChange={(e) => setPrivada(e.target.checked)} />
        </Linha>
        {privada && (
          <div className="cfg-alerta" style={{ display: 'grid', gap: 8 }}>
            {cargos.slice().sort((a, b) => b.nivel - a.nivel).map((c) => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={quem.includes(c.id)} onChange={() => setQuem((q) => q.includes(c.id) ? q.filter((x) => x !== c.id) : [...q, c.id])} />
                <span style={c.cor ? { color: c.cor, fontWeight: 600 } : { fontWeight: 600 }}>{c.nome}</span>
              </label>
            ))}
            <span className="cfg-ajuda">Quem criou o servidor sempre vê.</span>
            {vouMeExcluir && <span className="cfg-ajuda">Seu cargo não está marcado: a sala some da sua lista ao salvar.</span>}
          </div>
        )}
        {privacidadeMudou && (
          <button className="cfg-botao" data-variante="primario" data-tamanho="pequeno" disabled={ocupado}
            onClick={() => fazer(() => editarSala(sala.id, { privada, cargos: privada ? quem : [] }), privada ? 'Quem pode ver foi salvo.' : 'A sala voltou a ser de todo mundo.')}>
            Salvar quem pode ver
          </button>
        )}
      </div>

      <div>
        <button className="cfg-botao" data-variante="perigo" data-tamanho="pequeno" data-armado={apagando ? '' : undefined} disabled={ocupado || ultima}
          title={ultima ? 'É a única sala: sem sala, ninguém teria para onde ir.' : undefined}
          onClick={async () => {
            if (!apagando) { setApagando(true); return; }
            if (await fazer(() => apagarSala(sala.id), 'Sala apagada.')) onApagada();
          }}>
          {apagando ? (sala.tipo === 'texto' ? `Apagar mesmo ${sala.nome} e as mensagens` : `Apagar mesmo ${sala.nome}`) : `Apagar a sala ${sala.nome}`}
        </button>
      </div>
    </div>
  );
}

function EditorDeCategoria({ categoria, ocupado, fazer, onApagada }: { categoria: Categoria; ocupado: boolean; fazer: Ctx['fazer']; onApagada: () => void }) {
  const [nome, setNome] = useState(categoria.nome);
  const [apagando, setApagando] = useState(false);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="cfg-campo">
        <label htmlFor="cfg-categoria-nome">Nome da categoria</label>
        <div className="cfg-campo-linha">
          <input id="cfg-categoria-nome" value={nome} maxLength={32} onChange={(e) => setNome(e.target.value)} />
          <button className="cfg-botao" disabled={ocupado || !nome.trim() || nome === categoria.nome} onClick={() => fazer(() => renomearCategoria(categoria.id, nome), 'Categoria renomeada.')}>Salvar</button>
        </div>
      </div>
      <p className="cfg-ajuda">A categoria é uma gaveta: apagá-la não apaga as salas, que voltam para o alto da lista.</p>
      <div>
        <button className="cfg-botao" data-variante="perigo" data-tamanho="pequeno" data-armado={apagando ? '' : undefined} disabled={ocupado}
          onClick={async () => {
            if (!apagando) { setApagando(true); return; }
            if (await fazer(() => apagarCategoria(categoria.id), 'Categoria apagada.')) onApagada();
          }}>
          {apagando ? `Apagar mesmo ${categoria.nome}` : `Apagar a categoria ${categoria.nome}`}
        </button>
      </div>
    </div>
  );
}

function CriarSalaOuCategoria({ ocupado, fazer }: { ocupado: boolean; fazer: Ctx['fazer'] }) {
  const [nomeSala, setNomeSala] = useState('');
  const [tipo, setTipo] = useState<TipoDeSala>('texto');
  const [nomeCategoria, setNomeCategoria] = useState('');
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div className="cfg-campo">
        <label htmlFor="cfg-nova-sala">Sala nova</label>
        <div className="cfg-campo-linha">
          <input id="cfg-nova-sala" value={nomeSala} maxLength={32} placeholder="Nome da sala" onChange={(e) => setNomeSala(e.target.value)} />
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeSala)} aria-label="Tipo da sala" style={{ minWidth: 0, width: 150 }}>
            <option value="texto">Sala de texto</option>
            <option value="voz">Sala de voz</option>
          </select>
          <button className="cfg-botao" data-variante="primario" disabled={ocupado || !nomeSala.trim()}
            onClick={async () => { if (await fazer(() => criarSala(nomeSala, tipo), 'Sala criada.')) setNomeSala(''); }}>Criar</button>
        </div>
        <span className="cfg-ajuda">Sala de voz é onde se conversa; sala de texto guarda o que foi escrito. A sala nova nasce no alto; mude a categoria depois.</span>
      </div>
      <div className="cfg-campo">
        <label htmlFor="cfg-nova-categoria">Categoria nova</label>
        <div className="cfg-campo-linha">
          <input id="cfg-nova-categoria" value={nomeCategoria} maxLength={32} placeholder="Nome da categoria" onChange={(e) => setNomeCategoria(e.target.value)} />
          <button className="cfg-botao" disabled={ocupado || !nomeCategoria.trim()}
            onClick={async () => { if (await fazer(() => criarCategoria(nomeCategoria), 'Categoria criada.')) setNomeCategoria(''); }}>Criar</button>
        </div>
      </div>
    </div>
  );
}

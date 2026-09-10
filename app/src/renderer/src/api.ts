// Conversa com o servidor do grupo.
//
// O endereço não é perguntado a ninguém: quem instala digita só apelido e senha. Se o
// servidor mudar de IP ou ganhar um domínio, troca-se aqui — e é preciso publicar uma
// versão nova para todo mundo receber.
// Em desenvolvimento aponta para a máquina local, senão testar qualquer mudança
// significaria mexer no servidor de produção, onde o pessoal está conversando.
import type { Enquadramento, Enquadramentos, Papel } from './enquadramento';
import { lerResposta } from './resposta';

export const SERVIDOR = import.meta.env.DEV ? 'localhost:3001' : '76.13.225.79:3001';

const BASE = /^https?:\/\//i.test(SERVIDOR)
  ? SERVIDOR.replace(/\/+$/, '')
  : `${/^\d+\.\d+\.\d+\.\d+/.test(SERVIDOR) || SERVIDOR.startsWith('localhost') ? 'http' : 'https'}://${SERVIDOR}`;

export type Permissao =
  | 'mutar' | 'desconectar' | 'timeout' | 'expulsar' | 'banir'
  | 'definirCargo' | 'gerirCargos' | 'gerirSalas' | 'gerirSons'
  | 'gerirServidor' | 'definirId';

export type Cargo = {
  id: number;
  nome: string;
  cor: string | null;
  /** Hierarquia: ninguém age sobre alguém de nível igual ou maior. */
  nivel: number;
  /**
   * Só vem no cargo de um MEMBRO, e vale "esta pessoa criou o servidor". A lista de
   * cargos do servidor não o traz: não há cargo de dono para vestir — mandar é de quem
   * criou, e isso mora em `servidores.criado_por`, não num cargo.
   */
  dono?: boolean;
  permissoes: Permissao[];
};

/** Quem criou o servidor tem tudo por ter criado, não por constar na lista. */
export const pode = (cargo: Cargo | null | undefined, p: Permissao) =>
  !!cargo && (cargo.dono || cargo.permissoes.includes(p));

/**
 * O soundboard é do cargo mais alto do servidor.
 *
 * Espelho da regra do servidor (`podeMexerNosSons`), só para não mostrar botão que será
 * recusado. Quem decide de verdade é o servidor. Som toca para a call inteira e quem não
 * gostou não desfaz — por isso não basta a permissão, tem de ser o topo.
 */
export const podeMexerNosSons = (eu: Membro, cargos: Cargo[]) => {
  if (!pode(eu.cargo, 'gerirSons')) return false;
  if (eu.cargo?.dono) return true;
  const niveis = cargos.map((c) => c.nivel).filter((n) => Number.isFinite(n));
  return niveis.length === 0 || (eu.cargo?.nivel ?? 0) >= Math.max(...niveis);
};

/** Ações que recaem sobre alguém passam também pela hierarquia. */
export const SOBRE_ALGUEM: Permissao[] = ['mutar', 'desconectar', 'timeout', 'expulsar', 'banir', 'definirCargo'];

export const podeSobre = (eu: Membro, p: Permissao, alvo: { id: number; cargo: Cargo | null }) =>
  pode(eu.cargo, p)
  && (!SOBRE_ALGUEM.includes(p) || (eu.id !== alvo.id && (alvo.cargo?.nivel ?? 0) < (eu.cargo?.nivel ?? 0)));

export type Membro = {
  id: number;
  apelido: string;
  nome: string;
  cargo: Cargo | null;
  cargoNome: string;
  foto: string | null;
  banner: string | null;
  /** Como esta pessoa enquadrou a própria foto e o próprio banner. */
  enquadramento: Enquadramentos;
  turbo: boolean;
  /** Dono da SAGA — outra coisa de `cargo.dono`, que é o cargo mais alto de um servidor. */
  donoDaSaga?: boolean;
  /** O que vale agora: 'online' | 'ausente' | 'ocupado' | 'offline'. */
  status?: string;
  /** Identificador curto que aparece antes do nome. */
  idExibido: string | null;
  banido: boolean;
  banidoPor: string | null;
  castigoAte: number | null;
  /** Quando entrou neste servidor. */
  entrouEm: number | null;
};

export type Servidor = { id: number; nome: string; foto: string | null; banner: string | null };

export type RoomParticipant = {
  identity: string; name: string; camera: boolean; screen: boolean; muted: boolean;
  /** Fone desligado: a pessoa não ouve ninguém. Vem do que o app dela anuncia. */
  surdo?: boolean;
  /**
   * A transmissão que esta pessoa escolheu assistir, ou null. Também vem do anúncio do
   * app dela, e serve para contar a plateia de uma live sem estar dentro da call.
   */
  assistindo?: string | null;
  usuarioId?: number; cargo?: Cargo | null; foto?: string | null;
  banner?: string | null; enquadramento?: Enquadramentos; entrouEm?: number | null;
  turbo?: boolean; idExibido?: string | null;
  status?: string;
};
export type TipoDeSala = 'voz' | 'texto';
export type RoomInfo = {
  id: number; name: string; tipo: TipoDeSala; participants: RoomParticipant[];
  /** 'notas' na sala de novidades, que é do app: não se renomeia, apaga nem move. */
  papel?: string | null;
  /**
   * Sala privada: só alguns cargos a enxergam. Se ela chegou até aqui, é porque você é
   * um deles — quem não pode simplesmente não a recebe.
   */
  privada?: boolean;
  /** Os cargos que a veem. Só vem preenchido no painel de quem administra. */
  cargos?: number[];
  /** Quantas mensagens chegaram depois da última que eu li. Sala de voz é sempre 0. */
  naoLidas: number;
  /** A gaveta em que a sala está, ou null quando está solta no topo. */
  categoriaId: number | null;
};
export type Sala = {
  id: number; nome: string; tipo: TipoDeSala; ordem: number; categoriaId: number | null;
  papel?: string | null; privada?: boolean; cargos?: number[];
};
/** A gaveta onde as salas ficam guardadas. Não guarda conversa: só agrupa. */
export type Categoria = { id: number; nome: string; ordem: number };

export type Sessao = {
  token: string;
  eu: Membro | null;
  servidor: Servidor | null;
  servidores: Servidor[];
  salas: Sala[];
  impedimento?: string | null;
};

// --- guardar a sessão -------------------------------------------------------

// Fica no computador para o app abrir já logado. É um crachá, não a senha: quem
// for banido ou expulso perde o dele no servidor, e ele deixa de valer na hora.
/**
 * As chaves guardam o prefixo `cantinho.` de propósito, com o app já se chamando Saga.
 * Elas não aparecem para ninguém, e renomear teria um preço só: deslogar todo mundo e
 * zerar qualidade, marcador de lidas e último apelido, tudo de uma vez, sem ninguém
 * entender por quê. Prefixo antigo é dívida barata; conta perdida, não.
 */
const CHAVE = 'cantinho.sessao';
const CHAVE_SERVIDOR = 'cantinho.servidor';

/** Em qual servidor o app está. Vai em cabeçalho, porque quase toda rota depende dele. */
export const lerServidorAtual = (): number | null => {
  try { const v = localStorage.getItem(CHAVE_SERVIDOR); return v ? Number(v) : null; } catch { return null; }
};
export const guardarServidorAtual = (id: number | null) => {
  try { id ? localStorage.setItem(CHAVE_SERVIDOR, String(id)) : localStorage.removeItem(CHAVE_SERVIDOR); }
  catch { /* sem storage */ }
};

export const lerToken = (): string | null => {
  try { return localStorage.getItem(CHAVE); } catch { return null; }
};
export const guardarToken = (token: string | null) => {
  try { token ? localStorage.setItem(CHAVE, token) : localStorage.removeItem(CHAVE); } catch { /* sem storage */ }
};

// --- chamadas ---------------------------------------------------------------

export class ErroDoServidor extends Error {
  /**
   * Com que cara a tela deve mostrar isto. Quem decide é o servidor: "isso é do Vorcaro
   * Turbo" é convite, não falha, e o app não deveria adivinhar isso pelo texto.
   */
  constructor(mensagem: string, readonly status: number, readonly tipo = 'erro') {
    super(mensagem);
  }
}

// Toda falha de servidor entra no registro. 401 fica de fora: é o caminho normal de
// "sessão expirou", e encheria o arquivo de ruído.
function anotarFalha(rota: string, e: ErroDoServidor) {
  if (e.status === 401) return;
  window.desktop?.registrar('erro', 'servidor', `${rota} → ${e.status} ${e.message}`).catch(() => undefined);
}

async function pedir<T>(metodo: string, rota: string, corpo?: unknown): Promise<T> {
  const token = lerToken();
  const servidor = lerServidorAtual();
  let res: Response;
  try {
    res = await fetch(BASE + rota, {
      method: metodo,
      headers: {
        ...(corpo ? { 'content-type': 'application/json' } : {}),
        ...(token ? { 'x-sessao': token } : {}),
        ...(servidor ? { 'x-servidor': String(servidor) } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    const falha = new ErroDoServidor('Não consegui falar com o servidor. Confira sua internet.', 0);
    anotarFalha(`${metodo} ${rota}`, falha);
    throw falha;
  }
  // Corpo que não é JSON vira `null` aqui, e quem decide o que isso significa é
  // `lerResposta` — inclusive que um 200 pela metade é FALHA, e não objeto vazio. Ver o
  // comentário de lá: foi assim que a lista de pessoas derrubou a janela.
  const dados = await res.json().catch(() => null);
  const leitura = lerResposta(res.ok, res.status, dados);
  if (!leitura.ok) {
    const falha = new ErroDoServidor(leitura.mensagem, leitura.status, leitura.tipo);
    anotarFalha(`${metodo} ${rota}`, falha);
    throw falha;
  }
  return leitura.dados as T;
}

export const cadastrar = (c: { apelido: string; senha: string; senhaRepetida: string }) =>
  pedir<Sessao>('POST', '/cadastrar', c);

export const entrar = (c: { apelido: string; senha: string }) =>
  pedir<Sessao>('POST', '/entrar', c);

export const sair = () => pedir<{ ok: true }>('POST', '/sair');

/**
 * Quem sou eu e onde estou.
 *
 * `servidor` vem nulo quando a conta não está em servidor nenhum — que é onde toda conta
 * nova começa. Isso não é erro: é a tela inicial vazia. A LISTA vai junto porque a barra
 * de servidores se desenha com ela, e este é o pedido que o app já faz ao abrir e a cada
 * troca de servidor.
 */
export const quemSou = () =>
  pedir<{
    eu: Membro; servidor: Servidor | null; servidores: Servidor[];
    salas: Sala[]; impedimento: string | null;
  }>('GET', '/eu');

// --- servidores -------------------------------------------------------------

export const meusServidores = async () =>
  (await pedir<{ servidores: Servidor[] }>('GET', '/servidores')).servidores;

export const criarServidor = (nome: string) =>
  pedir<{ servidor: Servidor }>('POST', '/servidores/criar', { nome });

export type Convite = { codigo: string; expiraEm: number | null; maxUsos: number | null };

export const criarConvite = async (maxUsos?: number) =>
  (await pedir<{ convite: Convite }>('POST', '/servidores/convite', { maxUsos })).convite;

export const entrarComConvite = (codigo: string) =>
  pedir<{ servidor: Servidor }>('POST', '/servidores/entrar', { codigo });

export const sairDoServidor = () => pedir<{ ok: true }>('POST', '/servidores/sair');

export const mudarMeuNome = (nome: string) => pedir<{ eu: Membro }>('PATCH', '/eu', { nome });

export const verServidor = () =>
  pedir<{
    servidor: Servidor; salas: Sala[]; membros: Membro[];
    cargos: Cargo[]; permissoes: Record<Permissao, string>; servidores: Servidor[];
  }>('GET', '/servidor');

// --- cargos -----------------------------------------------------------------

export type CargoNovo = { nome: string; cor: string | null; nivel: number; permissoes: Permissao[] };

export const criarCargo = (c: CargoNovo) => pedir<{ cargo: Cargo }>('POST', '/cargos/criar', c);
export const editarCargo = (id: number, c: CargoNovo) => pedir<{ cargo: Cargo }>('POST', '/cargos/editar', { id, ...c });
export const apagarCargo = (id: number) => pedir<{ ok: true }>('POST', '/cargos/apagar', { id });

// --- salas ------------------------------------------------------------------

export const criarSala = (nome: string, tipo: TipoDeSala) =>
  pedir<{ sala: Sala }>('POST', '/salas/criar', { nome, tipo });

export const renomearSala = (id: number, nome: string) =>
  pedir<{ sala: Sala }>('POST', '/salas/renomear', { id, nome });

/**
 * Muda nome, privacidade e quem vê numa decisão só.
 *
 * `cargos` é a lista INTEIRA, não um acréscimo: é o estado da tela, e tirar um cargo é
 * mandar a lista sem ele. Servidor antigo não conhece esta rota e responde 404 — quem
 * chama mostra o erro, porque aqui a pessoa está esperando uma mudança acontecer.
 */
export const editarSala = (id: number, o: { nome?: string; privada?: boolean; cargos?: number[] }) =>
  pedir<{ sala: Sala }>('POST', '/salas/editar', { id, ...o });

export const apagarSala = (id: number) => pedir<{ ok: true }>('POST', '/salas/apagar', { id });

/** A ordem manda a gaveta junto: arrastar entre categorias é o mesmo gesto de reordenar. */
export const reordenarSalas = (salas: { id: number; categoriaId: number | null }[]) =>
  pedir<{ salas: Sala[] }>('POST', '/salas/ordem', { salas });

export const criarCategoria = (nome: string) =>
  pedir<{ categoria: Categoria }>('POST', '/categorias/criar', { nome });

export const renomearCategoria = (id: number, nome: string) =>
  pedir<{ categoria: Categoria }>('POST', '/categorias/renomear', { id, nome });

export const apagarCategoria = (id: number) =>
  pedir<{ ok: true }>('POST', '/categorias/apagar', { id });

export const reordenarCategorias = (ids: number[]) =>
  pedir<{ categorias: Categoria[] }>('POST', '/categorias/ordem', { ids });

// --- chat -------------------------------------------------------------------

export type Mensagem = {
  id: number;
  texto: string;
  /** Nome do arquivo, quando a mensagem é uma imagem (um GIF do Giphy). */
  imagem: string | null;
  /**
   * Anexo. `url` é o nome NO DISCO (hash + .bin, servido como octet-stream); `nome` é o
   * que a pessoa escolheu, e é só isso que se mostra e se sugere ao salvar.
   */
  arquivo: { url: string; nome: string; bytes: number } | null;
  criadoEm: number;
  autorId: number | null;
  nome: string;
  foto: string | null;
  enquadramento?: Enquadramentos;
  turbo: boolean;
  /** Dono da SAGA — outra coisa de `cargo.dono`, que é o cargo mais alto de um servidor. */
  donoDaSaga?: boolean;
  /** O que vale agora: 'online' | 'ausente' | 'ocupado' | 'offline'. */
  status?: string;
  idExibido: string | null;
};

/** Quem está escrevendo agora numa sala, fora você. */
export type Digitando = { id: number; nome: string };

/**
 * Sem `depoisDe`, traz as últimas; com ele, só o que chegou desde então.
 *
 * Quem está digitando vem na MESMA resposta: não há empurrão no servidor, e uma segunda
 * busca de 2 em 2 segundos só para isso dobraria o trânsito da rota mais chamada do app.
 * Servidor antigo não manda o campo — aí não aparece ninguém digitando, e nada quebra.
 */
export const lerMensagens = (sala: number, depoisDe?: number) =>
  pedir<{ mensagens: Mensagem[]; digitando?: Digitando[] }>(
    'GET',
    `/mensagens?sala=${sala}${depoisDe ? `&depoisDe=${depoisDe}` : ''}`,
  );

/**
 * "Estou escrevendo." Vale por alguns segundos e o app repete enquanto a pessoa digita —
 * nunca a cada tecla: escrever a cada tecla é exatamente o que `vista_em` ensinou a não
 * fazer. Falhar aqui não é motivo para nada aparecer na tela.
 */
export const avisarQueDigito = (sala: number) =>
  pedir<{ ok: true }>('POST', '/digitando', { sala });

export const enviarMensagem = async (sala: number, texto: string) =>
  (await pedir<{ mensagem: Mensagem }>('POST', '/mensagens', { sala, texto })).mensagem;

/**
 * Manda um arquivo qualquer. O corpo é o arquivo cru — o nome vai na URL, porque não há
 * espaço para campos ao lado dos bytes.
 */
/**
 * Manda um arquivo qualquer, avisando o quanto já subiu.
 *
 * Usa `XMLHttpRequest` e não `fetch` por um motivo só: o `fetch` não conta o que já
 * SUBIU. Sem isso, mandar um zip de 20 MB era um botão apagado e nada mais acontecendo
 * na tela — foi o que aconteceu com um amigo do dono, e ele não tinha como saber se
 * estava subindo, se tinha travado ou se tinha dado errado.
 */
export function enviarArquivoNoChat(
  sala: number,
  arquivo: File,
  texto = '',
  aoProgredir?: (fracao: number) => void,
): Promise<Mensagem> {
  const q = new URLSearchParams({ sala: String(sala), nome: arquivo.name, texto });
  const servidor = lerServidorAtual();
  const token = lerToken();

  return new Promise((ok, falha) => {
    const req = new XMLHttpRequest();
    req.open('POST', `${BASE}/mensagens/arquivo?${q}`);
    req.setRequestHeader('content-type', 'application/octet-stream');
    if (token) req.setRequestHeader('x-sessao', token);
    if (servidor) req.setRequestHeader('x-servidor', String(servidor));

    req.upload.onprogress = (e) => {
      if (e.lengthComputable && aoProgredir) aoProgredir(e.loaded / e.total);
    };
    req.onload = () => {
      let dados: { mensagem?: Mensagem; error?: string } = {};
      try { dados = JSON.parse(req.responseText); } catch { /* resposta sem corpo */ }
      if (req.status >= 200 && req.status < 300 && dados.mensagem) ok(dados.mensagem);
      else falha(new ErroDoServidor(dados.error ?? `erro ${req.status}`, req.status));
    };
    // Aqui cai o que nem chegou a virar resposta: rede fora, ou o servidor fechando a
    // conexão no meio — que é como o limite de tamanho se comportava antes.
    req.onerror = () => falha(new ErroDoServidor('A conexão caiu no meio do envio.', 0));
    req.onabort = () => falha(new ErroDoServidor('Envio cancelado.', 0));
    req.send(arquivo);
  });
}

/** O servidor baixa o GIF, guarda como qualquer imagem e publica a mensagem. */
export const enviarGifNoChat = async (sala: number, url: string) =>
  (await pedir<{ mensagem: Mensagem }>('POST', '/mensagens/gif', { sala, url })).mensagem;

export const renomearServidor = (nome: string) =>
  pedir<{ servidor: Servidor }>('PATCH', '/servidor', { nome });

/** `lidas` é "sala:última lida" — o servidor devolve quanto falta ler em cada uma. */
export const buscarSalas = async (lidas = '') =>
  pedir<{ rooms: RoomInfo[]; categorias: Categoria[] }>(
    'GET', `/rooms${lidas ? `?lidas=${encodeURIComponent(lidas)}` : ''}`);

export const pedirTokenDaSala = (room: string) =>
  pedir<{ url: string; token: string; identity: string }>('POST', '/token', { room });

// --- imagens ----------------------------------------------------------------

/** Endereço público do arquivo (imagem ou som). O nome é o hash, então pode ser cacheado. */
export const urlDoArquivo = (nome: string | null | undefined) =>
  nome ? `${BASE}/arquivos/${nome}` : null;

/** Envia os bytes crus. Passar null remove a imagem. */
async function enviarImagem<T>(rota: string, arquivo: File | null): Promise<T> {
  const token = lerToken();
  const corpo = arquivo ? await arquivo.arrayBuffer() : new ArrayBuffer(0);
  let res: Response;
  try {
    res = await fetch(BASE + rota, {
      method: 'POST',
      headers: {
        'content-type': arquivo?.type || 'application/octet-stream',
        ...(token ? { 'x-sessao': token } : {}),
        ...(lerServidorAtual() ? { 'x-servidor': String(lerServidorAtual()) } : {}),
      },
      body: corpo,
    });
  } catch {
    // Quando o servidor corta um envio grande demais, a conexão morre antes da resposta.
    throw new ErroDoServidor('A imagem é grande demais ou a conexão caiu no meio.', 413);
  }
  // Mesma regra do `pedir`: corpo pela metade é falha, não `{}` — ver resposta.ts.
  const leitura = lerResposta(res.ok, res.status, await res.json().catch(() => null));
  if (!leitura.ok) throw new ErroDoServidor(leitura.mensagem, leitura.status, leitura.tipo);
  return leitura.dados as T;
}

export const minhaFoto = (a: File | null) => enviarImagem<{ eu: Membro }>('/eu/foto', a);
export const meuBanner = (a: File | null) => enviarImagem<{ eu: Membro }>('/eu/banner', a);
export const fotoDoServidor = (a: File | null) => enviarImagem<{ servidor: Servidor }>('/servidor/foto', a);
export const bannerDoServidor = (a: File | null) => enviarImagem<{ servidor: Servidor }>('/servidor/banner', a);

/**
 * Tempo de ida e volta até o servidor, em milissegundos. Não é o ping da mídia — para
 * esse o LiveKit não expõe nada público — mas o LiveKit roda na mesma máquina, então
 * serve como medida honesta de "quão longe estou do servidor".
 */
export async function medirPing(): Promise<number | null> {
  const inicio = performance.now();
  try {
    const r = await fetch(`${BASE}/health`, { cache: 'no-store' });
    if (!r.ok) return null;
    await r.text();
    return Math.round(performance.now() - inicio);
  } catch {
    return null;
  }
}

// --- soundboard ---------------------------------------------------------------

export type Som = { id: number; nome: string; arquivo: string; porQuem: string | null; criado_em: number };

export const listarSons = async () => (await pedir<{ sons: Som[] }>('GET', '/sons')).sons;

export const apagarSom = (id: number) => pedir<{ ok: true }>('POST', '/sons/apagar', { id });

export async function subirSom(nome: string, arquivo: File): Promise<Som> {
  const token = lerToken();
  let res: Response;
  try {
    res = await fetch(`${BASE}/sons?nome=${encodeURIComponent(nome)}`, {
      method: 'POST',
      headers: {
        'content-type': arquivo.type || 'application/octet-stream',
        ...(token ? { 'x-sessao': token } : {}),
        ...(lerServidorAtual() ? { 'x-servidor': String(lerServidorAtual()) } : {}),
      },
      body: await arquivo.arrayBuffer(),
    });
  } catch {
    throw new ErroDoServidor('O som é grande demais ou a conexão caiu no meio.', 413);
  }
  const leitura = lerResposta(res.ok, res.status, await res.json().catch(() => null));
  if (!leitura.ok) throw new ErroDoServidor(leitura.mensagem, leitura.status, leitura.tipo);
  return (leitura.dados as { som: Som }).som;
}

/**
 * Ações de moderação: exigem cargo mínimo e nunca valem sobre si mesmo nem sobre um igual.
 */
export type AcaoDeModeracao =
  | 'mutar' | 'desconectar' | 'timeout' | 'tirarTimeout' | 'expulsar' | 'banir' | 'desbanir' | 'cargo';

/**
 * Turbo e identificador são distinção, não punição: o dono aplica em quem quiser,
 * inclusive em si. Por isso ficam fora da régua de moderação.
 */
export type AcaoDoDono = 'id';

export type Acao = AcaoDeModeracao | AcaoDoDono;

export const moderar = (
  acao: Acao,
  alvo: number,
  extra?: { minutos?: number; cargo?: number; idExibido?: string },
) => pedir<{ alvo?: Membro; ok?: boolean }>('POST', '/moderar', { acao, alvo, ...extra });

// --- Giphy ------------------------------------------------------------------

export type Gif = { id: string; titulo: string; previa: string | null; arquivo: string };

export const buscarGifs = async (termo: string) =>
  (await pedir<{ gifs: Gif[] }>('GET', `/giphy?q=${encodeURIComponent(termo)}`)).gifs;

export type OndeAImagemVai = 'usuario.foto' | 'usuario.banner' | 'servidor.foto' | 'servidor.banner';

/** Grava só a posição e a aproximação: o arquivo enviado não é tocado. */
export const salvarEnquadramento = async (papel: Papel, valor: Enquadramento | null) =>
  (await pedir<{ eu: Membro }>('PATCH', '/eu/enquadramento', { papel, valor })).eu;

export const usarGif = (onde: OndeAImagemVai, url: string) =>
  pedir<{ eu?: Membro; servidor?: Servidor }>('POST', '/giphy/usar', { onde, url });

// --- o que é da Saga, e não de um servidor ----------------------------------

/** Uma conta vista do painel do dono da Saga. */
export type ContaDaSaga = {
  id: number; apelido: string; foto: string | null;
  berserk: boolean; dono: boolean; criadoEm: number; servidores: number;
};

export const contasDaSaga = async () =>
  (await pedir<{ contas: ContaDaSaga[] }>('GET', '/saga/contas')).contas;

export const definirBerserk = async (alvo: number, berserk: boolean) =>
  (await pedir<{ conta: ContaDaSaga }>('POST', '/saga/berserk', { alvo, berserk })).conta;

/** Sinal de vida. Sem `status`, só renova o sinal sem mexer no que a pessoa escolheu. */
export const baterPresenca = async (status?: string) =>
  (await pedir<{ status: string }>('POST', '/eu/presenca', status ? { status } : {})).status;

// Conversa com o servidor do grupo.
//
// O endereço não é perguntado a ninguém: quem instala digita só apelido e senha. Se o
// servidor mudar de IP ou ganhar um domínio, troca-se aqui — e é preciso publicar uma
// versão nova para todo mundo receber.
// Em desenvolvimento aponta para a máquina local, senão testar qualquer mudança
// significaria mexer no servidor de produção, onde o pessoal está conversando.
export const SERVIDOR = import.meta.env.DEV ? 'localhost:3001' : '76.13.225.79:3001';

const BASE = /^https?:\/\//i.test(SERVIDOR)
  ? SERVIDOR.replace(/\/+$/, '')
  : `${/^\d+\.\d+\.\d+\.\d+/.test(SERVIDOR) || SERVIDOR.startsWith('localhost') ? 'http' : 'https'}://${SERVIDOR}`;

export type Permissao =
  | 'mutar' | 'desconectar' | 'timeout' | 'expulsar' | 'banir'
  | 'definirCargo' | 'gerirCargos' | 'gerirSalas' | 'gerirSons'
  | 'gerirServidor' | 'concederTurbo' | 'definirId';

export type Cargo = {
  id: number;
  nome: string;
  cor: string | null;
  /** Hierarquia: ninguém age sobre alguém de nível igual ou maior. */
  nivel: number;
  dono: boolean;
  permissoes: Permissao[];
};

/** O dono tem tudo por ser dono, não por constar na lista. */
export const pode = (cargo: Cargo | null | undefined, p: Permissao) =>
  !!cargo && (cargo.dono || cargo.permissoes.includes(p));

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
  turbo: boolean;
  /** Identificador curto que aparece antes do nome. */
  idExibido: string | null;
  banido: boolean;
  banidoPor: string | null;
  castigoAte: number | null;
};

export type Servidor = { id: number; nome: string; foto: string | null; banner: string | null };

export type RoomParticipant = {
  identity: string; name: string; camera: boolean; screen: boolean; muted: boolean;
  usuarioId?: number; cargo?: Cargo | null; foto?: string | null;
  banner?: string | null; turbo?: boolean; idExibido?: string | null;
};
export type TipoDeSala = 'voz' | 'texto';
export type RoomInfo = { id: number; name: string; tipo: TipoDeSala; participants: RoomParticipant[] };
export type Sala = { id: number; nome: string; tipo: TipoDeSala; ordem: number };

export type Sessao = { token: string; eu: Membro; servidor: Servidor; salas: Sala[]; impedimento?: string | null };

// --- guardar a sessão -------------------------------------------------------

// Fica no computador para o app abrir já logado. É um crachá, não a senha: quem
// for banido ou expulso perde o dele no servidor, e ele deixa de valer na hora.
const CHAVE = 'cantinho.sessao';

export const lerToken = (): string | null => {
  try { return localStorage.getItem(CHAVE); } catch { return null; }
};
export const guardarToken = (token: string | null) => {
  try { token ? localStorage.setItem(CHAVE, token) : localStorage.removeItem(CHAVE); } catch { /* sem storage */ }
};

// --- chamadas ---------------------------------------------------------------

export class ErroDoServidor extends Error {
  constructor(mensagem: string, readonly status: number) { super(mensagem); }
}

// Toda falha de servidor entra no registro. 401 fica de fora: é o caminho normal de
// "sessão expirou", e encheria o arquivo de ruído.
function anotarFalha(rota: string, e: ErroDoServidor) {
  if (e.status === 401) return;
  window.desktop?.registrar('erro', 'servidor', `${rota} → ${e.status} ${e.message}`).catch(() => undefined);
}

async function pedir<T>(metodo: string, rota: string, corpo?: unknown): Promise<T> {
  const token = lerToken();
  let res: Response;
  try {
    res = await fetch(BASE + rota, {
      method: metodo,
      headers: {
        ...(corpo ? { 'content-type': 'application/json' } : {}),
        ...(token ? { 'x-sessao': token } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    const falha = new ErroDoServidor('Não consegui falar com o servidor. Confira sua internet.', 0);
    anotarFalha(`${metodo} ${rota}`, falha);
    throw falha;
  }
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) {
    const falha = new ErroDoServidor((dados as { error?: string }).error ?? `erro ${res.status}`, res.status);
    anotarFalha(`${metodo} ${rota}`, falha);
    throw falha;
  }
  return dados as T;
}

export const cadastrar = (c: { apelido: string; senha: string; senhaRepetida: string; senhaDoGrupo: string }) =>
  pedir<Sessao>('POST', '/cadastrar', c);

export const entrar = (c: { apelido: string; senha: string }) =>
  pedir<Sessao>('POST', '/entrar', c);

export const sair = () => pedir<{ ok: true }>('POST', '/sair');

export const quemSou = () =>
  pedir<{ eu: Membro; servidor: Servidor; salas: Sala[]; impedimento: string | null }>('GET', '/eu');

export const mudarMeuNome = (nome: string) => pedir<{ eu: Membro }>('PATCH', '/eu', { nome });

export const verServidor = () =>
  pedir<{
    servidor: Servidor; salas: Sala[]; membros: Membro[];
    cargos: Cargo[]; permissoes: Record<Permissao, string>;
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

export const apagarSala = (id: number) => pedir<{ ok: true }>('POST', '/salas/apagar', { id });

export const reordenarSalas = (ids: number[]) => pedir<{ salas: Sala[] }>('POST', '/salas/ordem', { ids });

// --- chat -------------------------------------------------------------------

export type Mensagem = {
  id: number;
  texto: string;
  criadoEm: number;
  autorId: number | null;
  nome: string;
  foto: string | null;
  turbo: boolean;
  idExibido: string | null;
};

/** Sem `depoisDe`, traz as últimas; com ele, só o que chegou desde então. */
export const lerMensagens = async (sala: number, depoisDe?: number) =>
  (await pedir<{ mensagens: Mensagem[] }>(
    'GET',
    `/mensagens?sala=${sala}${depoisDe ? `&depoisDe=${depoisDe}` : ''}`,
  )).mensagens;

export const enviarMensagem = async (sala: number, texto: string) =>
  (await pedir<{ mensagem: Mensagem }>('POST', '/mensagens', { sala, texto })).mensagem;

export const renomearServidor = (nome: string) =>
  pedir<{ servidor: Servidor }>('PATCH', '/servidor', { nome });

export const buscarSalas = async () => (await pedir<{ rooms: RoomInfo[] }>('GET', '/rooms')).rooms;

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
      },
      body: corpo,
    });
  } catch {
    // Quando o servidor corta um envio grande demais, a conexão morre antes da resposta.
    throw new ErroDoServidor('A imagem é grande demais ou a conexão caiu no meio.', 413);
  }
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw new ErroDoServidor((dados as { error?: string }).error ?? `erro ${res.status}`, res.status);
  return dados as T;
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
      headers: { 'content-type': arquivo.type || 'application/octet-stream', ...(token ? { 'x-sessao': token } : {}) },
      body: await arquivo.arrayBuffer(),
    });
  } catch {
    throw new ErroDoServidor('O som é grande demais ou a conexão caiu no meio.', 413);
  }
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw new ErroDoServidor((dados as { error?: string }).error ?? `erro ${res.status}`, res.status);
  return (dados as { som: Som }).som;
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
export type AcaoDoDono = 'turbo' | 'id';

export type Acao = AcaoDeModeracao | AcaoDoDono;

export const moderar = (
  acao: Acao,
  alvo: number,
  extra?: { minutos?: number; cargo?: number; turbo?: boolean; idExibido?: string },
) => pedir<{ alvo?: Membro; ok?: boolean }>('POST', '/moderar', { acao, alvo, ...extra });

// --- Giphy ------------------------------------------------------------------

export type Gif = { id: string; titulo: string; previa: string | null; arquivo: string };

export const buscarGifs = async (termo: string) =>
  (await pedir<{ gifs: Gif[] }>('GET', `/giphy?q=${encodeURIComponent(termo)}`)).gifs;

export type OndeAImagemVai = 'usuario.foto' | 'usuario.banner' | 'servidor.foto' | 'servidor.banner';

export const usarGif = (onde: OndeAImagemVai, url: string) =>
  pedir<{ eu?: Membro; servidor?: Servidor }>('POST', '/giphy/usar', { onde, url });

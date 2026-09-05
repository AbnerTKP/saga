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

export const CARGO = { MEMBRO: 10, MODERADOR: 50, DONO: 100 } as const;

export type Membro = {
  id: number;
  apelido: string;
  nome: string;
  cargo: number;
  cargoNome: string;
  foto: string | null;
  banner: string | null;
  banido: boolean;
  banidoPor: string | null;
  castigoAte: number | null;
};

export type Servidor = { id: number; nome: string; foto: string | null; banner: string | null };

export type RoomParticipant = {
  identity: string; name: string; camera: boolean; screen: boolean; muted: boolean;
  usuarioId?: number; cargo?: number; foto?: string | null;
};
export type RoomInfo = { name: string; participants: RoomParticipant[] };

export type Sessao = { token: string; eu: Membro; servidor: Servidor; salas: string[]; impedimento?: string | null };

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
  pedir<{ eu: Membro; servidor: Servidor; salas: string[]; impedimento: string | null }>('GET', '/eu');

export const mudarMeuNome = (nome: string) => pedir<{ eu: Membro }>('PATCH', '/eu', { nome });

export const verServidor = () =>
  pedir<{ servidor: Servidor; salas: string[]; membros: Membro[] }>('GET', '/servidor');

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

export type Acao = 'mutar' | 'desconectar' | 'timeout' | 'tirarTimeout' | 'expulsar' | 'banir' | 'desbanir' | 'cargo';

export const moderar = (acao: Acao, alvo: number, extra?: { minutos?: number; cargo?: number }) =>
  pedir<{ alvo?: Membro; ok?: boolean }>('POST', '/moderar', { acao, alvo, ...extra });

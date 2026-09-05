// Endereço do servidor do grupo. Não é perguntado a ninguém: quem instala digita só a
// senha e o apelido. Se o servidor mudar de IP ou ganhar um domínio, é aqui que se troca
// — e é preciso publicar uma versão nova para todo mundo receber.
export const SERVIDOR = '76.13.225.79:3001';

export type RoomParticipant = { identity: string; name: string; camera: boolean; screen: boolean; muted: boolean };
export type RoomInfo = { name: string; participants: RoomParticipant[] };

export function normalizeServer(input: string): string {
  let s = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(s)) s = (s.startsWith('localhost') || /^\d+\.\d+\.\d+\.\d+/.test(s) ? 'http://' : 'https://') + s;
  return s;
}

async function handle<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `erro ${res.status}`);
  return body as T;
}

export async function fetchRooms(server: string, password: string): Promise<RoomInfo[]> {
  const res = await fetch(`${server}/rooms`, { headers: { 'x-password': password } });
  return (await handle<{ rooms: RoomInfo[] }>(res)).rooms;
}

export async function fetchToken(server: string, password: string, name: string, room: string) {
  const res = await fetch(`${server}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password, name, room }),
  });
  return handle<{ url: string; token: string; identity: string }>(res);
}

// Servidor de token: único backend do app. Valida a senha compartilhada,
// emite tokens do LiveKit e lista quem está em cada sala.
import http from 'node:http';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

const PORT = Number(process.env.PORT ?? 3001);
const PASSWORD = process.env.APP_PASSWORD ?? '';
const ROOMS = (process.env.ROOMS ?? 'Geral').split(',').map(s => s.trim()).filter(Boolean);
const KEY = process.env.LIVEKIT_API_KEY;
const SECRET = process.env.LIVEKIT_API_SECRET;
const HOST = process.env.LIVEKIT_HOST ?? 'http://localhost:7880';
const PUBLIC_URL = process.env.LIVEKIT_PUBLIC_URL ?? 'ws://localhost:7880';

if (!KEY || !SECRET || !PASSWORD) {
  console.error('Defina LIVEKIT_API_KEY, LIVEKIT_API_SECRET e APP_PASSWORD');
  process.exit(1);
}

const svc = new RoomServiceClient(HOST, KEY, SECRET);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-password',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', ...CORS });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 10_000) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// Controle simples contra chute de senha: 20 tentativas por IP a cada 10 min
const attempts = new Map();
function tooMany(ip) {
  const now = Date.now();
  const a = attempts.get(ip) ?? [];
  const recent = a.filter(t => now - t < 10 * 60_000);
  recent.push(now);
  attempts.set(ip, recent);
  return recent.length > 20;
}

function authorized(req) {
  const p = req.headers['x-password'];
  return typeof p === 'string' && p === PASSWORD;
}

async function listRooms() {
  const live = await svc.listRooms().catch(() => []);
  const result = [];
  for (const name of ROOMS) {
    const r = live.find(x => x.name === name);
    let participants = [];
    if (r && r.numParticipants > 0) {
      const ps = await svc.listParticipants(name).catch(() => []);
      participants = ps.map(p => ({
        identity: p.identity,
        name: p.name || p.identity,
        // publica câmera ou tela? (para os ícones da barra lateral)
        camera: p.tracks.some(t => t.source === 1 /* CAMERA */),
        screen: p.tracks.some(t => t.source === 2 /* SCREEN_SHARE */),
        muted: p.tracks.filter(t => t.source === 3 /* MICROPHONE */).every(t => t.muted),
      }));
    }
    result.push({ name, participants });
  }
  return result;
}

const server = http.createServer(async (req, res) => {
  const ip = req.socket.remoteAddress ?? '?';
  const url = new URL(req.url ?? '/', 'http://x');

  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (url.pathname === '/health') return json(res, 200, { ok: true });

  if (url.pathname === '/rooms' && req.method === 'GET') {
    if (!authorized(req)) { if (tooMany(ip)) return json(res, 429, { error: 'muitas tentativas' }); return json(res, 401, { error: 'senha errada' }); }
    return json(res, 200, { rooms: await listRooms() });
  }

  if (url.pathname === '/token' && req.method === 'POST') {
    if (tooMany(ip)) return json(res, 429, { error: 'muitas tentativas, espere 10 minutos' });
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'json inválido' }); }
    const { name, password, room } = body;
    if (password !== PASSWORD) return json(res, 401, { error: 'senha errada' });
    if (typeof name !== 'string' || !name.trim() || name.length > 32) return json(res, 400, { error: 'nome inválido' });
    if (!ROOMS.includes(room)) return json(res, 400, { error: 'sala não existe' });

    const clean = name.trim();
    const identity = `${clean}#${Math.random().toString(36).slice(2, 6)}`;
    const at = new AccessToken(KEY, SECRET, { identity, name: clean, ttl: '12h' });
    at.addGrant({
      room, roomJoin: true, roomCreate: true,
      canPublish: true, canSubscribe: true, canPublishData: true,
    });
    return json(res, 200, { url: PUBLIC_URL, token: await at.toJwt(), identity });
  }

  json(res, 404, { error: 'não encontrado' });
});

server.listen(PORT, () => console.log(`token server em http://0.0.0.0:${PORT}  salas: ${ROOMS.join(', ')}`));

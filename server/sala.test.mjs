// Teste de integração: várias pessoas entrando na mesma sala, de verdade.
//
// Sobe participantes reais no LiveKit (WebRTC nativo, via @livekit/rtc-node), publica
// microfone e confere o que o /rooms devolve — que é exatamente o que a barra lateral
// do app desenha. Pega tanto ícone errado quanto "não consigo entrar na sala".
//
// Precisa de um servidor de verdade; a senha nunca fica no repositório:
//   TESTE_SERVIDOR=1.2.3.4:3001 TESTE_SENHA=asenha node --test sala.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, AudioSource, LocalAudioTrack, TrackPublishOptions, TrackSource } from '@livekit/rtc-node';

const SERVIDOR = process.env.TESTE_SERVIDOR;
const SENHA = process.env.TESTE_SENHA;
const SALA = process.env.TESTE_SALA ?? 'Geral';
const PREFIXO = 'zz-teste-';           // marca os nossos, para não olhar gente de verdade

const base = SERVIDOR?.startsWith('http') ? SERVIDOR : `http://${SERVIDOR}`;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedirToken(nome) {
  const r = await fetch(`${base}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: nome, password: SENHA, room: SALA }),
  });
  if (!r.ok) throw new Error(`token de ${nome}: HTTP ${r.status} — ${await r.text()}`);
  return r.json();
}

async function entrar(nome) {
  const { url, token } = await pedirToken(nome);
  const sala = new Room();
  await sala.connect(url, token, { autoSubscribe: true });
  return sala;
}

async function publicarMicrofone(sala) {
  const fonte = new AudioSource(48000, 1);
  const faixa = LocalAudioTrack.createAudioTrack('microfone', fonte);
  await sala.localParticipant.publishTrack(
    faixa,
    new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }),
  );
  return faixa;
}

async function nossosNaSala() {
  const r = await fetch(`${base}/rooms`, { headers: { 'x-password': SENHA } });
  if (!r.ok) throw new Error(`/rooms: HTTP ${r.status}`);
  const { rooms } = await r.json();
  const sala = rooms.find((s) => s.name === SALA);
  assert.ok(sala, `a sala ${SALA} não existe no servidor`);
  return sala.participants.filter((p) => p.name.startsWith(PREFIXO));
}

// Só os participantes deste teste. A sala pode ter gente de verdade dentro, e o teste
// não pode nem contar com isso nem se incomodar com isso.
const nossosRemotos = (sala) =>
  [...sala.remoteParticipants.values()].filter((p) => (p.name || p.identity).startsWith(PREFIXO));

// O servidor leva um instante para refletir o estado; tenta de novo antes de desistir.
async function ateQue(oQue, verificar, tentativas = 20, espera = 500) {
  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    try { return await verificar(); } catch (e) { ultimoErro = e; await dormir(espera); }
  }
  throw new Error(`${oQue} — não aconteceu em ${(tentativas * espera) / 1000}s: ${ultimoErro?.message}`);
}

test('três pessoas na mesma sala, se enxergando e com os ícones certos', { skip: !SERVIDOR || !SENHA ? 'defina TESTE_SERVIDOR e TESTE_SENHA' : false, timeout: 180_000 }, async (t) => {
  const nomes = [`${PREFIXO}ana`, `${PREFIXO}bruno`, `${PREFIXO}caio`];
  const salas = [];

  try {
    await t.test('todas conseguem entrar na mesma sala', async () => {
      for (const nome of nomes) salas.push(await entrar(nome));
      assert.equal(salas.length, 3);
    });

    await t.test('cada uma enxerga as outras duas', async () => {
      // É o cenário que falhou de verdade: entrar numa sala onde já tem alguém.
      await ateQue('todas se enxergarem', () => {
        for (const [i, sala] of salas.entries()) {
          const vistos = nossosRemotos(sala).length;
          assert.equal(vistos, 2, `${nomes[i]} vê ${vistos} das outras 2`);
        }
      });
    });

    await t.test('com microfone publicado, ninguém aparece mudo nem compartilhando tela', async () => {
      for (const sala of salas) await publicarMicrofone(sala);
      await ateQue('os três aparecerem falando', async () => {
        const nossos = await nossosNaSala();
        assert.equal(nossos.length, 3, `o /rooms mostra ${nossos.length} de 3`);
        for (const p of nossos) {
          assert.equal(p.muted, false, `${p.name} apareceu mudo`);
          assert.equal(p.screen, false, `${p.name} apareceu compartilhando tela`);
          assert.equal(p.camera, false, `${p.name} apareceu com câmera`);
        }
      });
    });

    await t.test('quem tira o microfone passa a aparecer mudo, e só essa pessoa', async () => {
      const pubs = [...salas[0].localParticipant.trackPublications.values()];
      await salas[0].localParticipant.unpublishTrack(pubs[0].sid);
      await ateQue('só a ana ficar muda', async () => {
        const nossos = await nossosNaSala();
        const ana = nossos.find((p) => p.name === nomes[0]);
        assert.equal(ana?.muted, true, 'a ana continuou aparecendo com microfone');
        for (const p of nossos.filter((p) => p.name !== nomes[0])) {
          assert.equal(p.muted, false, `${p.name} ficou mudo junto`);
        }
      });
    });

    await t.test('ao sair, todas somem da lista', async () => {
      for (const sala of salas) await sala.disconnect();
      salas.length = 0;
      await ateQue('a sala esvaziar', async () => {
        assert.equal((await nossosNaSala()).length, 0);
      });
    });
  } finally {
    for (const sala of salas) await sala.disconnect().catch(() => {});
  }
});

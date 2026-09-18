// Semeia o servidor LOCAL da Saga com um grupo de mentira, pelas MESMAS rotas HTTP que o app usa.
// Nada de SQL: se a regra do servidor recusar algo, a semente falha em voz alta.
//
// Uso sozinho:  node semear.mjs http://127.0.0.1:3901 saida.json
// Uso pelo fotografar.mjs: import { semear } from './semear.mjs'
import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

export const SENHA = 'senha-das-fotos';
export const PESSOAS = ['TKP', 'Marina', 'Rafa', 'Bia', 'Duda', 'Leo', 'Novato'];

/** PNG de verdade, gerado aqui: um degradê com uma "letra" de blocos. Sem arquivo externo. */
function png(w, h, cor1, cor2) {
  const linhas = [];
  for (let y = 0; y < h; y++) {
    const linha = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) {
      const t = (x + y) / (w + h);
      const i = 1 + x * 3;
      linha[i] = Math.round(cor1[0] * (1 - t) + cor2[0] * t);
      linha[i + 1] = Math.round(cor1[1] * (1 - t) + cor2[1] * t);
      linha[i + 2] = Math.round(cor1[2] * (1 - t) + cor2[2] * t);
    }
    linhas.push(linha);
  }
  const bloco = (tipo, dados) => {
    const t = Buffer.from(tipo, 'ascii');
    const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([t, dados])) >>> 0);
    return Buffer.concat([tam, t, dados, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', zlib.deflateSync(Buffer.concat(linhas))),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

export async function semear(BASE, { log = console.log } = {}) {
  async function pedir(metodo, caminho, { token, sid, corpo, cru } = {}) {
    const headers = {};
    if (token) headers['x-sessao'] = token;
    if (sid) headers['x-servidor'] = String(sid);
    let body;
    if (cru) { body = cru; headers['content-type'] = 'application/octet-stream'; }
    else if (corpo !== undefined) { body = JSON.stringify(corpo); headers['content-type'] = 'application/json'; }
    const r = await fetch(BASE + caminho, { method: metodo, headers, body });
    const texto = await r.text();
    let json; try { json = JSON.parse(texto); } catch { json = { texto }; }
    if (!r.ok) throw new Error(`${metodo} ${caminho} → ${r.status}: ${json.error ?? texto}`);
    return json;
  }

  const conta = {};
  for (const apelido of PESSOAS) {
    const r = await pedir('POST', '/cadastrar', { corpo: { apelido, senha: SENHA, senhaRepetida: SENHA } });
    conta[apelido] = { token: r.token, id: r.eu?.id ?? r.usuario?.id ?? r.conta?.id ?? null };
  }
  // O id da conta vem do /eu quando o cadastro não o devolve no formato esperado.
  for (const apelido of PESSOAS) {
    if (conta[apelido].id) continue;
    const eu = await pedir('GET', '/eu', { token: conta[apelido].token });
    conta[apelido].id = eu.eu?.id ?? eu.conta?.id ?? eu.id;
  }
  log('contas:', Object.fromEntries(PESSOAS.map((p) => [p, conta[p].id])));
  const T = (p) => conta[p].token;

  // --- o servidor principal, do TKP ------------------------------------------------
  const cantinho = (await pedir('POST', '/servidores/criar', { token: T('TKP'), corpo: { nome: 'Cantinho' } })).servidor;
  const C = cantinho.id;
  const categoria = async (nome) => (await pedir('POST', '/categorias/criar', { token: T('TKP'), sid: C, corpo: { nome } })).categoria;
  const catPapo = await categoria('Bate-papo');
  const catVoz = await categoria('Voz');
  const catJogos = await categoria('Jogatina');
  // A sala de voz que nasce com o servidor chama-se "Geral", e nome de sala não repete nem
  // mudando maiúscula: ela vira "Sala 1" para a de texto poder ser a #geral.
  const iniciais = (await pedir('GET', '/servidor', { token: T('TKP'), sid: C })).salas;
  await pedir('POST', '/salas/renomear', { token: T('TKP'), sid: C, corpo: { id: iniciais.find((s) => s.nome === 'Geral').id, nome: 'Sala 1' } });
  const sala = async (nome, tipo) => (await pedir('POST', '/salas/criar', { token: T('TKP'), sid: C, corpo: { nome, tipo } })).sala;
  for (const [nome, tipo] of [['geral', 'texto'], ['memes', 'texto'], ['clipes-e-prints', 'texto'], ['staff', 'texto'],
    ['Sala 2', 'voz'], ['Cinema', 'voz'], ['Ranked', 'voz'], ['Lobby do xadrez', 'texto']]) {
    await sala(nome, tipo);
  }

  // Cargos: os dois de fábrica (Moderador, Membro) e mais três.
  const cargo = async (nome, cor, nivel, permissoes) =>
    (await pedir('POST', '/cargos/criar', { token: T('TKP'), sid: C, corpo: { nome, cor, nivel, permissoes } })).cargo;
  const admin = await cargo('Admin', '#e05555', 70,
    ['mutar', 'desconectar', 'timeout', 'expulsar', 'banir', 'definirCargo', 'gerirCargos', 'gerirSalas', 'gerirSons', 'convidar', 'apagarMensagens']);
  const veterano = await cargo('Veterano', '#e0a53f', 30, ['convidar', 'apagarMensagens']);
  const streamer = await cargo('Streamer', '#a855f7', 20, ['convidar']);

  const doServidor = await pedir('GET', '/servidor', { token: T('TKP'), sid: C });
  const moderador = doServidor.cargos.find((c) => c.nome === 'Moderador');
  const porNome = Object.fromEntries(doServidor.salas.map((s) => [s.nome, s]));

  // A sala "staff" só para Admin e Moderador — é o que desenha o cadeado na barra.
  await pedir('POST', '/salas/editar', {
    token: T('TKP'), sid: C,
    corpo: { id: porNome.staff.id, nome: 'staff', privada: true, cargos: [admin.id, moderador.id] },
  });

  // Gavetas: cada sala na sua categoria, na ordem em que aparecem.
  const ordem = [
    ['Avisos', catPapo], ['geral', catPapo], ['memes', catPapo], ['clipes-e-prints', catPapo], ['staff', catPapo],
    ['Sala 1', catVoz], ['Sala 2', catVoz], ['Cinema', catVoz],
    ['Ranked', catJogos], ['Lobby do xadrez', catJogos],
  ];
  const salasDoTkp = (await pedir('GET', '/servidor', { token: T('TKP'), sid: C })).salas;
  const semPapel = salasDoTkp.filter((s) => !s.papel);
  const itens = ordem.map(([nome, cat]) => ({ id: semPapel.find((s) => s.nome === nome).id, categoriaId: cat.id }));
  for (const s of semPapel) if (!itens.some((i) => i.id === s.id)) itens.push({ id: s.id, categoriaId: null });
  await pedir('POST', '/salas/ordem', { token: T('TKP'), sid: C, corpo: { salas: itens } });

  // Todo mundo entra por convite, como na vida real.
  const convite = (await pedir('POST', '/servidores/convite', { token: T('TKP'), sid: C, corpo: {} })).convite;
  for (const p of ['Marina', 'Rafa', 'Bia', 'Duda', 'Leo']) {
    await pedir('POST', '/servidores/entrar', { token: T(p), corpo: { codigo: convite.codigo } });
  }
  const darCargo = (p, c) => pedir('POST', '/moderar', { token: T('TKP'), sid: C, corpo: { acao: 'cargo', alvo: conta[p].id, cargo: c.id } });
  await darCargo('Marina', admin);
  await darCargo('Rafa', moderador);
  await darCargo('Bia', veterano);
  await darCargo('Duda', streamer);

  // --- mensagens ---------------------------------------------------------------------
  const dizer = (p, nomeDaSala, texto) =>
    pedir('POST', '/mensagens', { token: T(p), sid: C, corpo: { sala: porNome[nomeDaSala].id, texto } });
  await dizer('TKP', 'Avisos', 'Bem-vindos ao Cantinho! Duas regras: respeito, e spoiler só com aviso.');
  await dizer('TKP', 'Avisos', 'Versão nova no ar. Quem puder, atualiza e me conta se o som ficou bom.');
  const conversa = [
    ['Marina', 'alguém on hoje à noite?'],
    ['Rafa', 'eu, depois das 21h'],
    ['Bia', 'to dentro, mas só se for pra jogar e não pra passar 1h escolhendo o jogo 😅'],
    ['TKP', 'subi a versão nova, quem puder atualiza e me fala se o som ficou bom'],
    ['TKP', 'as notas estão aqui: https://github.com/AbnerTKP/saga/releases/latest'],
    ['Duda', 'atualizei aqui, o compartilhamento de tela ficou bem mais liso'],
    ['Marina', 'a régua de volume do soundboard sumiu pra mim, é normal?'],
    ['TKP', 'é sim, agora ela fica só comigo'],
    ['Rafa', 'bora de F1 mais tarde? quero revanche de Interlagos'],
    ['Bia', 'revanche nada, você bateu na primeira curva kkkk'],
    ['Leo', 'gente, alguém tem o link daquele vídeo de ontem?'],
    ['Marina', 'manda no #clipes-e-prints que fica mais fácil de achar depois'],
    ['TKP', '21h na Sala 2 então. Quem chegar primeiro abre a mesa de xadrez'],
  ];
  for (const [p, t] of conversa) await dizer(p, 'geral', t);
  await dizer('Rafa', 'memes', 'quando o jogo atualiza bem na hora que todo mundo entrou');
  await dizer('Duda', 'memes', 'kkkkkkk real');
  await dizer('Duda', 'clipes-e-prints', 'o clipe da ranked de ontem, 1 contra 3');
  await dizer('Rafa', 'staff', 'deixei o Leo de Membro por enquanto, depois a gente vê');

  // --- amizades e conversa privada ---------------------------------------------------
  await pedir('POST', '/amigos/pedir', { token: T('Marina'), corpo: { apelido: 'TKP' } });
  await pedir('POST', '/amigos/responder', { token: T('TKP'), corpo: { alvo: conta.Marina.id, aceitar: true } });
  await pedir('POST', '/amigos/pedir', { token: T('Duda'), corpo: { apelido: 'TKP' } });
  await pedir('POST', '/amigos/responder', { token: T('TKP'), corpo: { alvo: conta.Duda.id, aceitar: true } });
  await pedir('POST', '/amigos/pedir', { token: T('Rafa'), corpo: { apelido: 'TKP' } });   // fica esperando o TKP
  await pedir('POST', '/amigos/pedir', { token: T('TKP'), corpo: { apelido: 'Bia' } });     // fica esperando a Bia
  const dm = (await pedir('POST', '/conversas/abrir', { token: T('TKP'), corpo: { alvo: conta.Marina.id } })).conversa;
  const privado = (p, texto) => pedir('POST', '/mensagens', { token: T(p), corpo: { conversa: dm.id, texto } });
  await privado('Marina', 'oi! consegue me passar o convite do servidor novo?');
  await privado('TKP', 'claro, gero agora');
  await privado('TKP', 'é só colar no + da barra dos servidores');
  await privado('Marina', 'valeu 🙌');

  // --- outros servidores (a trilha e a administração ficam com mais de um) -----------
  const noite = (await pedir('POST', '/servidores/criar', { token: T('Rafa'), corpo: { nome: 'Noite de Jogos' } })).servidor;
  const conviteNoite = (await pedir('POST', '/servidores/convite', { token: T('Rafa'), sid: noite.id, corpo: {} })).convite;
  for (const p of ['TKP', 'Marina', 'Bia']) {
    await pedir('POST', '/servidores/entrar', { token: T(p), corpo: { codigo: conviteNoite.codigo } });
  }
  const estudos = (await pedir('POST', '/servidores/criar', { token: T('Leo'), corpo: { nome: 'Estudos' } })).servidor;
  const conviteEstudos = (await pedir('POST', '/servidores/convite', { token: T('Leo'), sid: estudos.id, corpo: {} })).convite;
  await pedir('POST', '/servidores/entrar', { token: T('Duda'), corpo: { codigo: conviteEstudos.codigo } });

  // --- imagens: algumas pessoas com foto, outras só com a inicial ---------------------
  const subir = (p, rota, bytes, sid = C) => pedir('POST', rota, { token: T(p), sid, cru: bytes });
  await subir('Marina', '/eu/foto', png(128, 128, [236, 72, 153], [249, 168, 37]));
  await subir('Marina', '/eu/banner', png(600, 200, [124, 58, 237], [236, 72, 153]));
  await subir('Rafa', '/eu/foto', png(128, 128, [14, 165, 233], [34, 197, 94]));
  await subir('Duda', '/eu/foto', png(128, 128, [168, 85, 247], [59, 130, 246]));
  await subir('TKP', '/eu/foto', png(128, 128, [245, 158, 11], [239, 68, 68]));
  await subir('TKP', '/servidor/foto', png(128, 128, [16, 185, 129], [59, 130, 246]));

  return {
    base: BASE, senha: SENHA,
    contas: conta,
    servidores: { cantinho: C, noite: noite.id, estudos: estudos.id },
    salas: Object.fromEntries(Object.entries(porNome).map(([n, s]) => [n, s.id])),
    cargos: { admin: admin.id, veterano: veterano.id, streamer: streamer.id, moderador: moderador.id },
    conversa: dm.id,
  };
}

/** Depois do reinício com DONO=TKP: o Berserk do TKP e da Duda, que só o dono da Saga dá. */
export async function depoisDoDono(BASE, dados) {
  const pedir = async (caminho, corpo) => {
    const r = await fetch(BASE + caminho, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sessao': dados.contas.TKP.token },
      body: JSON.stringify(corpo),
    });
    if (!r.ok) throw new Error(`${caminho} → ${r.status}: ${await r.text()}`);
    return r.json();
  };
  await pedir('/saga/berserk', { alvo: dados.contas.TKP.id, berserk: true });
  await pedir('/saga/berserk', { alvo: dados.contas.Duda.id, berserk: true });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [base = 'http://127.0.0.1:3901', saida] = process.argv.slice(2);
  const dados = await semear(base);
  if (saida) writeFileSync(saida, JSON.stringify(dados, null, 2));
  else console.log(JSON.stringify(dados, null, 2));
}

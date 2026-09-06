// Chat que não some. Antes as mensagens viviam só na memória de quem estava dentro da
// sala, porque não havia banco — quem chegasse depois não via nada, e um link mandado
// virava pó quando a sala esvaziava.
import { ErroDeConta } from './contas.mjs';
import { buscarSala } from './salas.mjs';

const TAMANHO_MAXIMO = 2000;

// Quanto a tela carrega de uma vez. Chat de cinco amigos não precisa de mais que isso, e
// mandar tudo tornaria a abertura lenta com o tempo.
export const QUANTAS = 100;

const SELECT = `
  SELECT m.id, m.texto, m.imagem, m.criado_em, m.usuario_id,
         COALESCE(NULLIF(mem.nome_exibido, ''), u.apelido) AS nome,
         u.foto, mem.turbo, mem.id_exibido
    FROM mensagens m
    LEFT JOIN usuarios u   ON u.id = m.usuario_id
    LEFT JOIN membros  mem ON mem.usuario_id = m.usuario_id AND mem.servidor_id = ?`;

/** Da mais antiga para a mais nova, que é a ordem em que se lê. */
export function listarMensagens(db, servidorId, salaId, { depoisDe } = {}) {
  const sala = buscarSala(db, servidorId, salaId);
  if (!sala) throw new ErroDeConta('Essa sala não existe.', 404);

  // Com "depoisDe", a tela pede só o que chegou desde a última vez.
  const linhas = depoisDe
    ? db.prepare(`${SELECT} WHERE m.sala_id = ? AND m.id > ? ORDER BY m.id LIMIT ?`)
        .all(servidorId, sala.id, Number(depoisDe), QUANTAS)
    : db.prepare(`${SELECT} WHERE m.sala_id = ? ORDER BY m.id DESC LIMIT ?`)
        .all(servidorId, sala.id, QUANTAS).reverse();

  return linhas.map((m) => ({
    id: m.id,
    texto: m.texto,
    imagem: m.imagem ?? null,
    criadoEm: m.criado_em,
    autorId: m.usuario_id,
    // Quem apagou a conta vira "alguém": a mensagem fica, o vínculo não.
    nome: m.nome ?? 'alguém',
    foto: m.foto ?? null,
    turbo: !!m.turbo,
    idExibido: m.id_exibido ?? null,
  }));
}

/** `imagem` é o nome do arquivo já guardado — um GIF do Giphy, por exemplo. */
export function enviarMensagem(db, servidorId, quem, salaId, texto, imagem = null) {
  const sala = buscarSala(db, servidorId, salaId);
  if (!sala) throw new ErroDeConta('Essa sala não existe.', 404);

  const limpo = String(texto ?? '').trim();
  // Mensagem só de imagem é o caso normal do GIF: o texto vazio ali não é engano.
  if (!limpo && !imagem) throw new ErroDeConta('Mensagem vazia.');
  if (limpo.length > TAMANHO_MAXIMO) {
    throw new ErroDeConta(`A mensagem passa de ${TAMANHO_MAXIMO} caracteres.`);
  }

  const info = db.prepare(
    'INSERT INTO mensagens (sala_id, usuario_id, texto, imagem, criado_em) VALUES (?, ?, ?, ?, ?)',
  ).run(sala.id, quem.id, limpo, imagem, Date.now());

  const [nova] = listarMensagens(db, servidorId, sala.id, { depoisDe: Number(info.lastInsertRowid) - 1 });
  return nova;
}

/**
 * Quantas mensagens chegaram numa sala depois da última que a pessoa leu.
 *
 * O marcador de leitura fica no app, não no banco: cada pessoa lê no computador dela, e
 * guardar isso no servidor pediria uma tabela nova para resolver um problema que ninguém
 * tem — cinco amigos, um computador cada.
 *
 * As mensagens da própria pessoa não contam: ver "1 nova" por causa do que você mesmo
 * escreveu é ruído, não aviso.
 */
export function contarNaoLidas(db, salaId, desdeId, exceto) {
  return db.prepare(
    'SELECT count(*) c FROM mensagens WHERE sala_id = ? AND id > ? AND usuario_id IS NOT ?',
  ).get(Number(salaId), Number(desdeId) || 0, exceto ?? null).c;
}

/**
 * Lê "12:340,15:9" — sala:última lida — como o app manda na busca de salas. Entrada
 * estranha vira marcador nenhum, e nunca exceção: isso aqui vem da URL.
 */
export function lerMarcadores(texto) {
  const marcadores = new Map();
  for (const parte of String(texto ?? '').split(',')) {
    const [sala, lida] = parte.split(':');
    if (Number(sala) > 0 && Number(lida) >= 0) marcadores.set(Number(sala), Number(lida));
  }
  return marcadores;
}

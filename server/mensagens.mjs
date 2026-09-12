// Chat que não some. Antes as mensagens viviam só na memória de quem estava dentro da
// sala, porque não havia banco — quem chegasse depois não via nada, e um link mandado
// virava pó quando a sala esvaziava.
import { ErroDeConta } from './contas.mjs';
import { salaVisivel } from './salas.mjs';
import { buscarMembro } from './membros.mjs';
import { podeApagarMensagem } from './permissoes.mjs';
import { ler as lerEnquadramento } from './enquadramento.mjs';
import * as tabela from './repositorios/mensagens.mjs';
// Só para saber se a pessoa faz parte da conversa. A regra da conversa privada mora em
// `conversas.mjs`; o que vem aqui é a pergunta que apagar precisa fazer, e apagar é um
// caminho só — o app manda o id da mensagem, não o lugar dela.
import * as conversasDaConta from './repositorios/conversas.mjs';

const TAMANHO_MAXIMO = 2000;

// Quanto a tela carrega de uma vez. Chat de cinco amigos não precisa de mais que isso, e
// mandar tudo tornaria a abertura lenta com o tempo.
export const QUANTAS = 100;

/**
 * A linha do banco como a tela a desenha.
 *
 * Mora aqui, e não em cada lugar que lista mensagens, porque a conversa privada desenha
 * exatamente a mesma coisa: mudar o formato da mensagem num lugar e esquecer o outro é
 * como o cartão de perfil nasceu com duas versões.
 *
 * `semAutor` é o que escrever quando a mensagem não tem dono: "alguém" na sala (a conta
 * foi apagada e a mensagem ficou) e "Saga" na sala de notas, onde ninguém escreveu de fato.
 */
export const verMensagem = (m, semAutor = 'alguém') => ({
  id: m.id,
  texto: m.texto,
  imagem: m.imagem ?? null,
  // O que vai para a tela é o nome que a pessoa escolheu; `arquivo` é o do disco, que
  // é o hash e não diz nada a ninguém.
  arquivo: m.arquivo ? { url: m.arquivo, nome: m.arquivo_nome ?? 'arquivo', bytes: m.arquivo_bytes ?? 0 } : null,
  criadoEm: m.criado_em,
  autorId: m.usuario_id,
  nome: m.nome ?? semAutor,
  foto: m.foto ?? null,
  enquadramento: lerEnquadramento(m.enquadramento),
  turbo: !!m.turbo,
  idExibido: m.id_exibido ?? null,
});

/** Da mais antiga para a mais nova, que é a ordem em que se lê. */
export function listarMensagens(db, servidorId, quem, salaId, { depoisDe } = {}) {
  // Sala que a pessoa não vê responde igual a sala que não existe: um 403 numa sala
  // privada ensina que ela existe, que é justamente o que privada evita.
  const sala = salaVisivel(db, servidorId, quem, salaId);
  if (!sala) throw new ErroDeConta('Essa sala não existe.', 404);

  // Com "depoisDe", a tela pede só o que chegou desde a última vez.
  const linhas = depoisDe
    ? tabela.depoisDe(db, servidorId, sala.id, depoisDe, QUANTAS)
    : tabela.ultimas(db, servidorId, sala.id, QUANTAS);

  // Quem apagou a conta vira "alguém": a mensagem fica, o vínculo não. Já na sala de
  // notas ninguém escreveu de fato — foi a Saga —, e "alguém" ali seria mentira.
  return linhas.map((m) => verMensagem(m, sala.papel === 'notas' ? 'Saga' : 'alguém'));
}

/** `imagem` é o nome do arquivo já guardado — um GIF do Giphy, por exemplo. */
export function enviarMensagem(db, servidorId, quem, salaId, texto, imagem = null, arquivo = null) {
  const sala = salaVisivel(db, servidorId, quem, salaId);
  if (!sala) throw new ErroDeConta('Essa sala não existe.', 404);

  const limpo = String(texto ?? '').trim();
  // Mensagem só de imagem é o caso normal do GIF, e só de arquivo é o de mandar algo sem
  // ter o que dizer: o texto vazio nesses dois não é engano.
  if (!limpo && !imagem && !arquivo) throw new ErroDeConta('Mensagem vazia.');
  if (limpo.length > TAMANHO_MAXIMO) {
    throw new ErroDeConta(`A mensagem passa de ${TAMANHO_MAXIMO} caracteres.`);
  }

  const id = tabela.inserir(db, {
    salaId: sala.id, usuarioId: quem.id, texto: limpo, imagem, arquivo, criadoEm: Date.now(),
  });

  const [nova] = listarMensagens(db, servidorId, quem, sala.id, { depoisDe: id - 1 });
  return nova;
}

/**
 * Apaga uma mensagem: a própria, ou a de alguém abaixo, com a permissão — ver
 * `podeApagarMensagem`.
 *
 * A linha fica, vazia, com a hora em que foi apagada. Não é apego ao registro: é como as
 * OUTRAS telas ficam sabendo. O app só pergunta pelo que chegou depois da última mensagem
 * que viu, então uma linha simplesmente removida continuaria na tela de quem já a tinha,
 * até essa pessoa trocar de sala. Com a hora anotada, a busca de sempre responde também
 * "estas foram apagadas desde a sua última pergunta". O conteúdo sai de verdade — texto,
 * imagem e anexo —; o arquivo em disco fica, pelo mesmo motivo dos sons: o nome é o hash, e
 * outra mensagem pode apontar para o mesmo conteúdo.
 */
export function apagarMensagem(db, servidorId, quem, id) {
  const msg = tabela.buscar(db, id);
  if (!msg) throw new ErroDeConta('Essa mensagem não existe.', 404);
  if (msg.apagada_em) return { ok: true, id: msg.id };

  /**
   * Numa conversa privada não existe moderação: cada um apaga o que DISSE, e ninguém
   * apaga o do outro. Não há cargo entre duas pessoas, e "quem está acima" — que é o que
   * sustenta toda a moderação do resto do app — não quer dizer nada aqui.
   */
  if (msg.conversa_id) {
    if (!conversasDaConta.souDela(db, msg.conversa_id, quem.id)) {
      throw new ErroDeConta('Essa mensagem não existe.', 404);
    }
    if (msg.usuario_id !== quem.id) {
      throw new ErroDeConta('Não dá para apagar: numa conversa privada, cada um apaga só o que disse.', 403);
    }
    tabela.apagar(db, msg.id, { porQuem: quem.id, quando: Date.now() });
    return { ok: true, id: msg.id };
  }

  // Mensagem de sala que a pessoa não vê responde como inexistente, igual à própria sala.
  const sala = salaVisivel(db, servidorId, quem, msg.sala_id);
  if (!sala) throw new ErroDeConta('Essa mensagem não existe.', 404);

  const autor = msg.usuario_id ? buscarMembro(db, servidorId, msg.usuario_id) : null;
  const r = podeApagarMensagem(quem, autor, {
    minha: msg.usuario_id === quem.id,
    daSaga: sala.papel === 'notas',
  });
  if (!r.pode) throw new ErroDeConta(`Não dá para apagar: ${r.motivo}.`, 403);

  tabela.apagar(db, msg.id, { porQuem: quem.id, quando: Date.now() });
  return { ok: true, id: msg.id };
}

/** As mensagens desta sala apagadas a partir de `desde`, para as outras telas tirarem. */
export function apagadasDesde(db, servidorId, quem, salaId, desde) {
  const sala = salaVisivel(db, servidorId, quem, salaId);
  if (!sala || !(Number(desde) > 0)) return [];
  return tabela.apagadasDesde(db, sala.id, Number(desde));
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
  return tabela.contarDepoisDe(db, salaId, desdeId, exceto);
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

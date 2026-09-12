// A conversa privada entre duas pessoas.
//
// Ela é da CONTA e não de servidor nenhum: sair do servidor onde vocês se conheceram não
// apaga o que foi dito, e o mesmo par de amigos tem UMA conversa, não uma por servidor.
// Por isso quem fala aqui aparece como conta — apelido e foto —, sem cargo, sem nome
// exibido e sem identificador: os três pertencem ao vínculo com um servidor, e aqui não
// há um. É a mesma linha do `/eu` de quem não está em servidor nenhum.
//
// A mensagem é a MESMA do chat das salas: mesma tabela, mesmo formato, mesmo apagar com
// hora, mesmo anexo. Duas tabelas seriam duas implementações de tudo isso, e a segunda
// envelheceria em silêncio.
import { ErroDeConta } from './contas.mjs';
import { saoAmigos, verConta } from './amigos.mjs';
import { verMensagem, QUANTAS } from './mensagens.mjs';
import * as tabela from './repositorios/conversas.mjs';
import * as mensagens from './repositorios/mensagens.mjs';
import * as usuarios from './repositorios/usuarios.mjs';

const TAMANHO_MAXIMO = 2000;

/** Conversa de que você não faz parte responde igual a conversa que não existe. */
function minha(db, eu, conversaId) {
  const id = Number(conversaId);
  if (!(id > 0) || !tabela.souDela(db, id, eu.id)) {
    throw new ErroDeConta('Essa conversa não existe.', 404);
  }
  return id;
}

/** Com quem estou falando, e se ainda dá para falar. */
function comQuem(db, eu, conversaId) {
  const [outroId] = tabela.outros(db, conversaId, eu.id);
  const outro = outroId ? usuarios.buscarPorId(db, outroId) : null;
  return {
    outro: outro ? verConta(outro) : null,
    // A amizade é perguntada AGORA, e não guardada na conversa: desfazer amizade fecha o
    // campo de escrever sem tocar em linha nenhuma de mensagem.
    amigos: !!outro && saoAmigos(db, eu.id, outro.id),
  };
}

/**
 * Abre a conversa com alguém — ou devolve a que já existe.
 *
 * Só entre amigos: é esta linha que faz a amizade valer alguma coisa. Sem ela, saber o
 * apelido de alguém bastaria para aparecer na tela dele, que é justamente o que a
 * amizade existe para impedir.
 */
export function abrir(db, eu, alvoId) {
  const outro = usuarios.buscarPorId(db, alvoId);
  if (!outro || outro.id === eu.id) throw new ErroDeConta('Essa pessoa não existe.', 404);
  if (!saoAmigos(db, eu.id, outro.id)) {
    throw new ErroDeConta(`Vocês precisam ser amigos para conversar. Mande um pedido para ${outro.apelido}.`, 403);
  }

  const id = tabela.entre(db, eu.id, outro.id) ?? tabela.criar(db, [eu.id, outro.id], Date.now());
  return { id, com: verConta(outro), podeEscrever: true };
}

/** A conversa aberta na tela: com quem é, e se o campo de escrever está aberto. */
export function ver(db, eu, conversaId) {
  const id = minha(db, eu, conversaId);
  const { outro, amigos } = comQuem(db, eu, id);
  return { id, com: outro, podeEscrever: amigos };
}

/**
 * O começo da última mensagem, para a lista da esquerda.
 *
 * Mensagem só de imagem ou só de arquivo não tem texto nenhum, e uma linha vazia na lista
 * pareceria conversa sem nada dentro. O "você:" na frente é o que diz, de relance, que a
 * bola está com o outro.
 */
export function previa(l, eu) {
  if (!l.ultima_id) return null;
  const texto = l.ultima_texto || (l.ultima_imagem ? 'GIF' : l.ultima_arquivo || 'arquivo');
  return l.ultima_de === eu ? `você: ${texto}` : texto;
}

/**
 * As minhas conversas, com o começo da última mensagem e quanto falta ler.
 *
 * `lidas` é o mesmo mecanismo das salas: o marcador fica no computador de quem lê e volta
 * na busca que já acontece. Guardar isso no servidor pediria tabela nova para um problema
 * que ninguém tem.
 */
export function minhas(db, eu, lidas = new Map()) {
  return tabela.minhas(db, eu.id).map((l) => ({
    id: l.id,
    com: verConta({ id: l.outro_id, nome: l.outro_nome, foto: l.foto, enquadramento: l.enquadramento,
                    turbo: l.turbo, status: l.status, visto_em: l.visto_em }),
    previa: previa(l, eu.id),
    ultimaEm: l.ultima_em ?? null,
    ultimaId: l.ultima_id ?? 0,
    naoLidas: mensagens.contarDaConversaDepoisDe(db, l.id, lidas.get(l.id) ?? 0, eu.id),
  }));
}

/** Da mais antiga para a mais nova, como no chat das salas. */
export function listarMensagens(db, eu, conversaId, { depoisDe } = {}) {
  const id = minha(db, eu, conversaId);
  const linhas = depoisDe
    ? mensagens.daConversaDepoisDe(db, id, depoisDe, QUANTAS)
    : mensagens.ultimasDaConversa(db, id, QUANTAS);
  return linhas.map((m) => verMensagem(m));
}

export function enviar(db, eu, conversaId, texto, imagem = null, arquivo = null) {
  const id = minha(db, eu, conversaId);
  // Perguntado a cada mensagem, e não só ao abrir a conversa: a amizade pode ter sido
  // desfeita com a janela aberta, e foi isto que o dono pediu — mensagem só entre amigos.
  const { outro, amigos } = comQuem(db, eu, id);
  if (!amigos) {
    throw new ErroDeConta(
      outro ? `Vocês não são mais amigos. Só dá para mandar mensagem para amigos.` : 'Essa conversa não existe.',
      outro ? 403 : 404,
    );
  }

  const limpo = String(texto ?? '').trim();
  if (!limpo && !imagem && !arquivo) throw new ErroDeConta('Mensagem vazia.');
  if (limpo.length > TAMANHO_MAXIMO) {
    throw new ErroDeConta(`A mensagem passa de ${TAMANHO_MAXIMO} caracteres.`);
  }

  const novaId = mensagens.inserir(db, {
    conversaId: id, usuarioId: eu.id, texto: limpo, imagem, arquivo, criadoEm: Date.now(),
  });
  const [nova] = listarMensagens(db, eu, id, { depoisDe: novaId - 1 });
  return nova;
}

/** As que sumiram desde a última pergunta desta tela — igual à sala. */
export function apagadasDesde(db, eu, conversaId, desde) {
  const id = Number(conversaId);
  if (!tabela.souDela(db, id, eu.id) || !(Number(desde) > 0)) return [];
  return mensagens.apagadasDaConversaDesde(db, id, Number(desde));
}

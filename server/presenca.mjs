// Quem está online, ausente ou ocupado.
//
// O status guardado sozinho não basta: alguém que fechou o app no "ocupado" continuaria
// ocupado para sempre. Por isso `visto_em` — o último sinal de vida. Sem sinal recente,
// a pessoa está OFFLINE, seja qual for o status que ficou escrito.
//
// Quem decide "ausente" é o app de quem está ausente, não o servidor: só ele sabe se a
// pessoa largou a máquina. O servidor guarda o que recebe e cronometra o silêncio.
import { ErroDeConta } from './contas.mjs';
import * as usuarios from './repositorios/usuarios.mjs';

export const STATUS = ['online', 'ausente', 'ocupado'];

/**
 * Depois de quanto tempo sem sinal a pessoa vira offline.
 *
 * O app manda sinal a cada 30 s; o dobro disso mais folga tolera uma máquina engasgada
 * ou uma rede que piscou, sem deixar alguém "online" por minutos depois de fechar o app.
 */
export const SILENCIO_ATE_OFFLINE = 90_000;

export const ehStatusConhecido = (s) => STATUS.includes(s);

/**
 * O status que vale AGORA, a partir do que está guardado e de quando foi o último sinal.
 * Puro de propósito: é a regra, e a regra é testável sem banco.
 */
export function statusDeVerdade(guardado, vistoEm, agora = Date.now()) {
  if (!vistoEm || agora - vistoEm > SILENCIO_ATE_OFFLINE) return 'offline';
  return ehStatusConhecido(guardado) ? guardado : 'online';
}

/**
 * Recebe o sinal de vida. Devolve o status que passou a valer.
 *
 * `atividade` ausente não mexe na que está guardada: a Saga do navegador não sabe que jogo
 * está aberto, e o sinal dela não pode apagar o que o computador da mesma pessoa contou.
 * `null` apaga. Ela é conferida ANTES de anotar qualquer coisa: pedido recusado não renova
 * sinal pela metade.
 */
export function bater(db, usuarioId, status, atividade) {
  if (status !== undefined && !ehStatusConhecido(status)) {
    throw new ErroDeConta('Status desconhecido.');
  }
  const agora = Date.now();
  const lida = atividade === undefined ? undefined : lerAtividade(atividade, agora);
  if (status === undefined) usuarios.anotarSinal(db, usuarioId, agora);
  else usuarios.anotarStatus(db, usuarioId, status, agora);
  if (lida !== undefined) anotarAtividade(usuarioId, lida, agora);
  const u = usuarios.lerPresenca(db, usuarioId);
  return statusDeVerdade(u?.status, u?.visto_em, agora);
}

/** Marca que a pessoa saiu — fechar o app não pode deixá-la online até o silêncio vencer. */
export function saiu(db, usuarioId) {
  usuarios.apagarSinal(db, usuarioId);
  atividades.delete(usuarioId);
}

// --- a atividade: o jogo aberto no computador da pessoa ----------------------
//
// Mora na MEMÓRIA, e não no banco, de propósito. Ela muda ao abrir e fechar um jogo e só vale
// enquanto o app de quem joga continua contando — o mesmo sinal de 30 s da presença a renova.
// Reiniciar o servidor esquece todas, e o próximo sinal de cada um devolve a sua: são 30 s
// sem a linha "Jogando", contra uma migração e uma escrita no SQLite a cada jogo aberto numa
// VPS de um núcleo que já sofreu com escrita demais (o `vista_em`).

const atividades = new Map();

/** O nome que aparece: sem caractere de controle, sem espaço sobrando, e com teto. */
const NOME_MAXIMO = 80;
/** "Jogando há 9 dias" seria relógio errado de alguém, não maratona. */
const DESDE_MAIS_ANTIGO = 7 * 24 * 60 * 60_000;

/**
 * O que o app mandou, conferido. Devolve `null` para "nada aberto" e lança para o que não
 * dá para mostrar a ninguém.
 *
 * Do Steam vêm o número do jogo e o hash do ícone, e é com eles que a Saga de quem olha monta
 * o endereço da imagem no Steam. Por isso os dois são conferidos à risca: número inteiro, hash
 * de 40 letras hexadecimais. Um endereço livre aqui faria o app de todo mundo buscar o que
 * quem mandou quisesse.
 */
export function lerAtividade(a, agora = Date.now()) {
  if (a === null) return null;
  if (typeof a !== 'object' || Array.isArray(a)) throw new ErroDeConta('Atividade inválida.');
  const limpo = String(a.nome ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
  // Por letra, e não por unidade de UTF-16: cortar no meio de um emoji deixa meio emoji.
  const nome = Array.from(limpo).slice(0, NOME_MAXIMO).join('');
  if (!nome) throw new ErroDeConta('A atividade precisa de um nome.');
  const pedido = Number(a.desde);
  const desde = Number.isFinite(pedido) ? Math.min(agora, Math.max(agora - DESDE_MAIS_ANTIGO, pedido)) : agora;
  const steam = Number.isInteger(a.steam) && a.steam > 0 && a.steam < 2 ** 31 ? a.steam : null;
  const icone = steam !== null && typeof a.icone === 'string' && /^[0-9a-f]{40}$/.test(a.icone) ? a.icone : null;
  return { nome, desde, steam, icone };
}

/** Guarda (ou apaga, com `null`) a atividade de alguém, anotando quando ela foi contada. */
export function anotarAtividade(usuarioId, atividade, agora = Date.now()) {
  if (atividade === null) atividades.delete(usuarioId);
  else atividades.set(usuarioId, { ...atividade, em: agora });
}

/**
 * A atividade que vale AGORA, ou `null`.
 *
 * A mesma regra do status: quem está offline não está jogando nada para ninguém, e atividade
 * que o app parou de renovar é lembrança — o computador desligou no meio do jogo.
 */
export function atividadeDe(usuarioId, vistoEm, agora = Date.now()) {
  const a = atividades.get(usuarioId);
  if (!a) return null;
  if (agora - a.em > SILENCIO_ATE_OFFLINE || statusDeVerdade('online', vistoEm, agora) === 'offline') return null;
  return { nome: a.nome, desde: a.desde, steam: a.steam, icone: a.icone };
}

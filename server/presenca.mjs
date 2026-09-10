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

/** Recebe o sinal de vida. Devolve o status que passou a valer. */
export function bater(db, usuarioId, status) {
  if (status !== undefined && !ehStatusConhecido(status)) {
    throw new ErroDeConta('Status desconhecido.');
  }
  const agora = Date.now();
  if (status === undefined) usuarios.anotarSinal(db, usuarioId, agora);
  else usuarios.anotarStatus(db, usuarioId, status, agora);
  const u = usuarios.lerPresenca(db, usuarioId);
  return statusDeVerdade(u?.status, u?.visto_em, agora);
}

/** Marca que a pessoa saiu — fechar o app não pode deixá-la online até o silêncio vencer. */
export function saiu(db, usuarioId) {
  usuarios.apagarSinal(db, usuarioId);
}

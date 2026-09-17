// A Urna: o minijogo de votar para Presidente, com a apuração de todo mundo do servidor.
//
// O jogo é do app (a seção eleitoral, a urna, o título FAKE); o servidor só guarda o voto e
// soma. Pode votar quantas vezes quiser — foi o pedido —, com um freio de alguns segundos entre
// um voto e outro, que o caminho da porta até a urna leva mais do que isso: é contra laço, não
// contra quem joga. O voto é secreto no banco (ver as migrações `urna_*`).
//
// A apuração é da SAGA INTEIRA, e não de cada servidor. Nasceu por servidor (v0.60.0), e o dono
// corrigiu: "o resultado deve ser para todo o Saga". As tabelas continuam anotando o servidor em
// que o voto foi dado — elas já estavam na produção, e trocar de tabela só para apagar uma coluna
// seria migração sem ganho —, mas a leitura soma todos, e o "você votou N vezes" e o freio
// também contam a pessoa em qualquer servidor.
import { ErroDeConta } from './contas.mjs';
import * as votos from './repositorios/urna_votos.mjs';
import * as eleitores from './repositorios/urna_eleitores.mjs';

/**
 * Os números que existem na urna, os mesmos de `app/src/renderer/src/urna/candidatos.ts` — o
 * teste confere os dois. Número fora daqui não é recusado: a urna de verdade chama de NULO, e o
 * app já manda `nulo` nesse caso.
 */
export const NUMEROS = [13, 14, 16, 21, 22, 27, 28, 29, 30, 35, 55, 70, 80];
export const INTERVALO = 3000;

export function escolhaValida(escolha) {
  if (escolha === 'branco' || escolha === 'nulo') return escolha;
  const n = Number(escolha);
  if (Number.isInteger(n) && NUMEROS.includes(n)) return String(n);
  throw new ErroDeConta('Essa escolha não existe na urna.', 400);
}

export function apuracao(db, usuarioId) {
  const contagem = votos.contagem(db).map((l) => ({
    numero: l.escolha === 'branco' || l.escolha === 'nulo' ? l.escolha : Number(l.escolha),
    votos: l.votos,
  }));
  return { contagem, meus: eleitores.buscar(db, usuarioId)?.votos ?? 0 };
}

/** O voto é dado num servidor (é lá que se é membro), e conta para a apuração da Saga inteira. */
export function votar(db, servidorId, usuarioId, escolha, agora = Date.now()) {
  const valida = escolhaValida(escolha);
  const antes = eleitores.buscar(db, usuarioId);
  if (antes && agora - antes.ultimo_em < INTERVALO) {
    throw new ErroDeConta('Calma: a urna ainda está gravando o seu último voto.', 429);
  }
  votos.somar(db, servidorId, valida);
  eleitores.contar(db, servidorId, usuarioId, agora);
  return apuracao(db, usuarioId);
}

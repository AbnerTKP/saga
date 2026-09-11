/**
 * Como a lista de pessoas da direita se agrupa.
 *
 * Era só por cargo e, dentro do cargo, na ordem do nome — então quem estava offline ficava
 * ACIMA de quem está aqui: "Rafa", apagado, em cima de você, e a lista não dizia de relance
 * quem está por aí. Hoje é como no Discord: os cargos só com quem está aqui, do mais alto
 * ao mais baixo, e quem está offline num grupo único no fim, seja qual for o cargo — o cargo
 * dele continua na cor do nome.
 *
 * Ausente e ocupado estão AQUI: são recados de quem está com o app aberto.
 */
import type { Cargo, Membro } from './api.ts';

export type GrupoDePessoas = {
  chave: string;
  titulo: string;
  /** A cor do cargo, no título. O grupo de offline não tem: ele é presença, não cargo. */
  cor: string | null;
  gente: Membro[];
};

export function agruparPessoas(membros: Membro[], cargos: Cargo[]): GrupoDePessoas[] {
  // Banido não é pessoa DESTE servidor: mora nas configurações, em Banidos.
  const presentes = membros.filter((m) => !m.banido);
  const aqui = presentes.filter((m) => m.status !== 'offline');
  const offline = presentes.filter((m) => m.status === 'offline');

  // Do cargo mais alto para o mais baixo, como se lê uma hierarquia.
  const grupos: GrupoDePessoas[] = cargos
    .slice()
    .sort((a, b) => b.nivel - a.nivel)
    .map((c) => ({ chave: `cargo-${c.id}`, titulo: c.nome, cor: c.cor, gente: aqui.filter((m) => m.cargo?.id === c.id) }))
    .filter((g) => g.gente.length > 0);

  // Cargo que não está na lista (quem criou o servidor e não veste nenhum, por exemplo) cai
  // aqui em vez de sumir da lista sem ninguém notar.
  const semCargo = aqui.filter((m) => !m.cargo || !cargos.some((c) => c.id === m.cargo!.id));
  if (semCargo.length) grupos.push({ chave: 'sem-cargo', titulo: 'Sem cargo', cor: null, gente: semCargo });
  if (offline.length) grupos.push({ chave: 'offline', titulo: 'Offline', cor: null, gente: offline });
  return grupos;
}

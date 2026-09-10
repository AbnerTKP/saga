/**
 * Quem está com a tela no ar, visto de FORA da call.
 *
 * Lendo uma sala de texto, alguém começa a transmitir na sala de voz e o chat não dizia
 * nada: para descobrir era preciso voltar à sala de voz e olhar. Agora a conversa avisa,
 * com quem é e um caminho de um clique para assistir.
 *
 * A lista sai da busca de salas — do SERVIDOR, e não do LiveKit desta máquina — porque é
 * a única fonte que funciona sem você estar na call. O preço é o atraso da busca (até uns
 * 4 s), e ele é aceitável: transmissão dura minutos, não segundos.
 */
import { porTransmissao } from './espectadores.ts';
import type { RoomInfo } from './api.ts';

export type LiveNoChat = {
  identity: string;
  nome: string;
  /** A sala de voz onde isso está acontecendo — o chat é de outra sala. */
  salaId: number;
  salaNome: string;
  /** Quem está vendo, pelo que cada app anuncia. Vazio é "ninguém ainda". */
  espectadores: string[];
  /** A transmissão é sua: aqui não se oferece "assistir", se diz quantos estão vendo. */
  souEu: boolean;
};

/**
 * As transmissões no ar em todas as salas de voz do servidor.
 *
 * Todas, e não só a da sala em que você está: quem está transmitindo fica sempre à
 * vista, e essa é a regra que faz uma live não sumir de quem quer voltar a ela.
 */
export function livesNasSalas(rooms: RoomInfo[], minhaIdentity: string | null): LiveNoChat[] {
  const lives: LiveNoChat[] = [];
  for (const sala of rooms) {
    if (sala.tipo !== 'voz') continue;
    // A mesma conta do palco: quem "assiste" à própria transmissão está olhando a prévia
    // do que ele mesmo manda, e isso não é plateia.
    const plateia = porTransmissao(sala.participants.map((p) => ({
      identity: p.identity,
      nome: p.name,
      assistindo: p.assistindo ?? null,
    })));
    for (const p of sala.participants) {
      if (!p.screen) continue;
      lives.push({
        identity: p.identity,
        nome: p.name,
        salaId: sala.id,
        salaNome: sala.name,
        espectadores: (plateia.get(p.identity) ?? []).map((e) => e.nome),
        souEu: p.identity === minhaIdentity,
      });
    }
  }
  return lives;
}

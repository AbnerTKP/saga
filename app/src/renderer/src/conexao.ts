/**
 * O cartão da conexão (o ping): o que se mede, como se resume e o que se diz.
 *
 * O ping que vale é o da VOZ: o tempo de ida e volta que o próprio WebRTC mede até o
 * servidor de voz (`currentRoundTripTime` do par de candidatos em uso). Ele vem de graça
 * nas estatísticas da conexão — não manda nada pela rede — e por isso dá para medir de 2 em
 * 2 segundos e desenhar o último minuto, como o Discord. O "ping" de antes era o tempo de
 * um pedido ao site da Saga (`medirPing`), que continua no cartão com outro nome:
 * "Servidor". Os dois juntos separam "a minha internet" de "o servidor apertado" — a
 * dúvida da noite de 07/10/2026, quando a VPS perdia até metade da CPU para os vizinhos.
 *
 * Tudo aqui é conta pura, testada em `conexao.test.ts`; quem mede é `useConexao.ts`.
 */

export const INTERVALO_MS = 2000;
export const JANELA_MS = 60_000;
/** Quantas amostras cabem na janela. */
export const AMOSTRAS = JANELA_MS / INTERVALO_MS;

/** O que se tira de uma leitura das estatísticas do WebRTC. */
export type Leitura = {
  /** Ida e volta até o servidor de voz, em ms. */
  rtt: number | null;
  /** Contadores do SEU áudio: enviados por você, e perdidos no caminho até o servidor. */
  enviados: number | null;
  perdidos: number | null;
};

type Estatistica = {
  id: string; type: string; kind?: string;
  state?: string; nominated?: boolean; currentRoundTripTime?: number;
  selectedCandidatePairId?: string;
  packetsSent?: number; packetsLost?: number; roundTripTime?: number;
};

/**
 * Lê o que interessa de um `RTCStatsReport` (ou de qualquer coleção de estatísticas — o
 * teste passa um array). O par de candidatos é o que o transporte diz que está em uso; sem
 * essa informação, o primeiro par que deu certo.
 */
export function lerEstatisticas(relatorio: { forEach(f: (e: Estatistica) => void): void }): Leitura {
  // `forEach` entrega o VALOR tanto no RTCStatsReport (um Map) quanto num array; iterar o
  // Map com `for…of` daria pares [id, valor].
  const todas: Estatistica[] = [];
  relatorio.forEach((e) => todas.push(e));
  const porId = new Map(todas.map((e) => [e.id, e]));
  const transporte = todas.find((e) => e.type === 'transport' && e.selectedCandidatePairId);
  const par = (transporte && porId.get(transporte.selectedCandidatePairId!))
    ?? todas.find((e) => e.type === 'candidate-pair' && e.state === 'succeeded' && e.nominated && e.currentRoundTripTime !== undefined)
    ?? todas.find((e) => e.type === 'candidate-pair' && e.state === 'succeeded' && e.currentRoundTripTime !== undefined);
  const retorno = todas.find((e) => e.type === 'remote-inbound-rtp' && e.kind === 'audio');
  const saida = todas.find((e) => e.type === 'outbound-rtp' && e.kind === 'audio');

  const segundos = par?.currentRoundTripTime ?? retorno?.roundTripTime;
  return {
    rtt: typeof segundos === 'number' && Number.isFinite(segundos) ? Math.round(segundos * 1000) : null,
    enviados: typeof saida?.packetsSent === 'number' ? saida.packetsSent : null,
    perdidos: typeof retorno?.packetsLost === 'number' ? retorno.packetsLost : null,
  };
}

export type Amostra = { rtt: number | null; enviados: number | null; perdidos: number | null };

/** Guarda a amostra nova e esquece o que saiu da janela. Não muda a lista que recebeu. */
export function guardar(historico: readonly Amostra[], nova: Amostra): Amostra[] {
  const lista = [...historico, nova];
  return lista.length > AMOSTRAS + 1 ? lista.slice(lista.length - (AMOSTRAS + 1)) : lista;
}

export type Resumo = {
  agora: number | null;
  media: number | null;
  pior: number | null;
  /** Fração dos SEUS pacotes perdidos na janela, de 0 a 1; null sem contador. */
  perda: number | null;
  /** Os pings da janela, do mais antigo ao mais novo, para o gráfico. */
  pings: number[];
};

export function resumir(historico: readonly Amostra[]): Resumo {
  const pings = historico.map((a) => a.rtt).filter((x): x is number => x !== null).slice(-AMOSTRAS);
  const agora = historico.length ? historico[historico.length - 1].rtt : null;
  const media = pings.length ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : null;
  const pior = pings.length ? Math.max(...pings) : null;

  // Perda pelo que andou dentro da janela: o contador é desde o começo da call, e a perda
  // de meia hora atrás não diz nada sobre agora.
  const comContador = historico.filter((a) => a.enviados !== null && a.perdidos !== null);
  let perda: number | null = null;
  if (comContador.length >= 2) {
    const primeira = comContador[0], ultima = comContador[comContador.length - 1];
    const perdidos = Math.max(0, ultima.perdidos! - primeira.perdidos!);
    const enviados = Math.max(0, ultima.enviados! - primeira.enviados!);
    perda = enviados + perdidos > 0 ? perdidos / (enviados + perdidos) : 0;
  }
  return { agora, media, pior, perda, pings };
}

export type Grafico = {
  /** Os pontos da linha, prontos para `<polyline points>`. */
  pontos: string;
  /** Altura, no desenho, da linha dos 100 ms; null quando ela ficaria fora. */
  linhaDos100: number | null;
  /** Onde fica o último ponto. */
  ultimo: { x: number; y: number } | null;
  /** O ping que vale o topo do desenho. */
  topo: number;
};

/**
 * A linha do último minuto. A escala vai de 0 a pelo menos 150 ms, para que uma conexão boa
 * não pareça uma montanha-russa por causa de 3 ms de variação; um pico acima disso abre a
 * escala até ele, com folga. Os pontos ocupam a largura a partir da direita: o mais novo
 * fica sempre na borda, e no começo da call a linha cresce para a esquerda.
 */
export function desenharGrafico(pings: readonly number[], largura: number, altura: number): Grafico {
  const topo = Math.max(150, Math.ceil((Math.max(0, ...pings) * 1.15) / 50) * 50);
  const y = (ms: number) => Math.round((altura - (ms / topo) * altura) * 10) / 10;
  const passo = largura / (AMOSTRAS - 1);
  const inicio = largura - passo * (pings.length - 1);
  const pts = pings.map((ms, i) => ({ x: Math.round((inicio + passo * i) * 10) / 10, y: y(ms) }));
  return {
    pontos: pts.map((p) => `${p.x},${p.y}`).join(' '),
    linhaDos100: 100 <= topo ? y(100) : null,
    ultimo: pts.length ? pts[pts.length - 1] : null,
    topo,
  };
}

/**
 * Uma frase quando dá para dizer de que lado está o problema — e nenhuma quando não dá.
 * Os limites são conservadores de propósito: uma dica errada manda a pessoa reiniciar o
 * roteador por causa de um servidor apertado, que é pior que dica nenhuma.
 */
export function dica(r: { voz: number | null; servidor: number | null; perda: number | null }): string | null {
  if (r.servidor !== null && r.servidor >= 250 && (r.voz === null || r.servidor >= 2 * r.voz)) {
    return 'O servidor está demorando mais que a sua internet: o aperto é do lado de lá, não aí.';
  }
  if (r.perda !== null && r.perda >= 0.02) {
    return 'Parte do seu som está se perdendo no caminho. Costuma ser Wi-Fi fraco ou a internet daí.';
  }
  return null;
}

/** "3,2%", como se escreve aqui. */
export function porcento(fracao: number) {
  return `${(fracao * 100).toFixed(1).replace('.', ',')}%`;
}

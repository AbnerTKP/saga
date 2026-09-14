/**
 * A luta pela internet, sem atraso no teclado.
 *
 * Esperar o botão do outro atravessar a internet a cada quadro deixaria a luta pesada: o soco
 * sairia 100 ms depois da tecla. O jeito dos jogos de luta é o ROLLBACK: os dois computadores
 * rodam a MESMA simulação (`luta.ts`), cada um aplica o próprio botão quase na hora (com um atraso
 * fixo de dois quadros, que quase ninguém sente) e CHUTA o do outro repetindo o último que chegou.
 * Quando o botão de verdade chega e é diferente do chute, a sessão volta ao quadro em que errou e
 * refaz até agora — em milissegundos, antes do próximo desenho.
 *
 * Ninguém pode ficar longe demais do que o outro confirmou: passando de `janela` quadros sem
 * notícia, a sessão ESPERA (a luta congela) em vez de adivinhar um segundo inteiro de botões.
 *
 * O pacote vai pelo canal de dados do LiveKit sem garantia de entrega (o que perde, o seguinte
 * repete: cada pacote leva todos os botões que o outro ainda não confirmou). Quem assiste recebe
 * os pacotes dos dois e anda só pelo que os dois já confirmaram.
 *
 * Nada aqui sabe de luta nem de LiveKit: é um `Jogo` qualquer por um `Transporte` qualquer — é o
 * que deixa testar com uma rede de mentira que perde, atrasa e embaralha pacote.
 */

export type Jogo<E> = {
  avancar(e: E, entradas: readonly [number, number]): void;
  clonar(e: E): E;
  impressao(e: E): number;
};

export type Transporte = {
  enviar(dados: Uint8Array, confiavel: boolean): void;
  aoReceber(cb: (dados: Uint8Array) => void): () => void;
};

const VERSAO = 1;
const TIPO = { ENTRADAS: 1, IMPRESSAO: 2, PEDIR_ESTADO: 3, ESTADO: 4 } as const;
/** Botões por pacote, no máximo: mais que isto o outro está sem ouvir há tempo demais para ajudar. */
const MAXIMO_POR_PACOTE = 40;
/** De quantos em quantos quadros confirmados os dois comparam a impressão digital. */
const INTERVALO_DA_IMPRESSAO = 120;
/** Quanto do passado se guarda para quem entra assistindo no meio (10 s). */
const HISTORICO = 600;
/** De quantos em quantos quadros o lado 0 manda o estado para a plateia (5 s). */
const ESTADO_A_CADA = 300;

// ---- o formato do pacote -------------------------------------------------------------------------

export type Pacote =
  | { tipo: 'entradas'; lado: 0 | 1; primeiro: number; entradas: number[]; confirmado: number; quadro: number; enviadoEm: number; eco: number }
  | { tipo: 'impressao'; lado: 0 | 1; quadro: number; impressao: number }
  | { tipo: 'pedirEstado' }
  | { tipo: 'estado'; quadro: number; estado: unknown; entradas: [number[], number[]] };

export function codificar(p: Pacote): Uint8Array {
  if (p.tipo === 'entradas') {
    const n = Math.min(p.entradas.length, MAXIMO_POR_PACOTE);
    const b = new DataView(new ArrayBuffer(3 + 4 * 5 + 2 * n));
    b.setUint8(0, VERSAO); b.setUint8(1, TIPO.ENTRADAS); b.setUint8(2, p.lado | (n << 1));
    b.setInt32(3, p.primeiro); b.setInt32(7, p.confirmado); b.setInt32(11, p.quadro);
    b.setUint32(15, p.enviadoEm >>> 0); b.setUint32(19, p.eco >>> 0);
    for (let i = 0; i < n; i++) b.setUint16(23 + 2 * i, p.entradas[i]);
    return new Uint8Array(b.buffer);
  }
  if (p.tipo === 'impressao') {
    const b = new DataView(new ArrayBuffer(11));
    b.setUint8(0, VERSAO); b.setUint8(1, TIPO.IMPRESSAO); b.setUint8(2, p.lado);
    b.setInt32(3, p.quadro); b.setUint32(7, p.impressao >>> 0);
    return new Uint8Array(b.buffer);
  }
  if (p.tipo === 'pedirEstado') return new Uint8Array([VERSAO, TIPO.PEDIR_ESTADO]);
  const json = new TextEncoder().encode(JSON.stringify({ q: p.quadro, e: p.estado, i: p.entradas }));
  const saida = new Uint8Array(2 + json.length);
  saida[0] = VERSAO; saida[1] = TIPO.ESTADO; saida.set(json, 2);
  return saida;
}

/** Pacote estranho, cortado ou de outra versão vira `null`: a rede não derruba a luta. */
export function decodificar(dados: Uint8Array): Pacote | null {
  try {
    if (dados.length < 2 || dados[0] !== VERSAO) return null;
    const b = new DataView(dados.buffer, dados.byteOffset, dados.byteLength);
    switch (dados[1]) {
      case TIPO.ENTRADAS: {
        if (dados.length < 23) return null;
        const cab = b.getUint8(2);
        const n = cab >> 1;
        if (dados.length < 23 + 2 * n) return null;
        const entradas: number[] = [];
        for (let i = 0; i < n; i++) entradas.push(b.getUint16(23 + 2 * i));
        return {
          tipo: 'entradas', lado: (cab & 1) as 0 | 1, primeiro: b.getInt32(3), confirmado: b.getInt32(7), quadro: b.getInt32(11),
          enviadoEm: b.getUint32(15), eco: b.getUint32(19), entradas,
        };
      }
      case TIPO.IMPRESSAO:
        if (dados.length < 11) return null;
        return { tipo: 'impressao', lado: (b.getUint8(2) & 1) as 0 | 1, quadro: b.getInt32(3), impressao: b.getUint32(7) };
      case TIPO.PEDIR_ESTADO:
        return { tipo: 'pedirEstado' };
      case TIPO.ESTADO: {
        const o = JSON.parse(new TextDecoder().decode(dados.subarray(2)));
        if (typeof o?.q !== 'number' || !Array.isArray(o?.i)) return null;
        return { tipo: 'estado', quadro: o.q, estado: o.e, entradas: o.i };
      }
    }
  } catch { /* pacote quebrado */ }
  return null;
}

// ---- a sessão de quem luta ---------------------------------------------------------------------

type Opcoes<E> = {
  jogo: Jogo<E>;
  inicial: E;
  lado: 0 | 1;
  transporte: Transporte;
  atraso?: number;
  janela?: number;
  /** Relógio em ms; o teste passa um de mentira. */
  relogio?: () => number;
  /** Estado que chega por JSON precisa virar estado de novo (o padrão serve para objeto simples). */
  desserializar?: (o: unknown) => E;
  aoDessincronizar?: (quadro: number) => void;
  /** Avisa cada botão local e o quadro em que ele vale (o teste monta a luta de referência com isto). */
  aoAgendar?: (quadro: number, botoes: number) => void;
};

/**
 * `entradas[lado][q]` é o botão daquele lado no quadro q (o avanço do quadro q para q+1). O
 * estado `e` é o do começo do quadro `quadro`.
 */
export class SessaoDaLuta<E> {
  readonly lado: 0 | 1;
  estado: E;
  quadro = 0;
  esperando = false;
  quadrosDeVolta = 0;
  dessincronia = false;
  /** Ida e volta estimada até o outro, em ms. */
  ping = 0;

  private readonly jogo: Jogo<E>;
  private readonly transporte: Transporte;
  private readonly atraso: number;
  private readonly janela: number;
  private readonly relogio: () => number;
  private readonly aoDessincronizar?: (q: number) => void;
  private readonly aoAgendar?: (q: number, b: number) => void;
  private readonly soltar: () => void;
  /** Botões dos dois lados por quadro; os do outro só existem até `confirmadoDoOutro`. */
  private readonly entradas: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
  /** Até que quadro (exclusivo) temos os botões de verdade do outro. */
  private confirmadoDoOutro = 0;
  /** Até que quadro (exclusivo) o outro já tem os nossos. */
  private confirmadoPeloOutro = 0;
  /** O chute usado para o outro em cada quadro já simulado. */
  private readonly chutes = new Map<number, number>();
  /** Estado no começo de cada quadro recente, para voltar. */
  private readonly fotos = new Map<number, E>();
  private primeiroErrado: number | null = null;
  private ouvidoEm: number;
  private ecoDoOutro = 0;
  private ecoRecebidoEm = 0;
  private readonly impressoes = new Map<number, number>();
  private readonly impressoesDoOutro = new Map<number, number>();
  private readonly impressoesEnviadas = new Set<number>();
  private estadoMandadoEm = 0;
  private readonly inicial: E;

  constructor(o: Opcoes<E>) {
    this.jogo = o.jogo;
    this.lado = o.lado;
    this.transporte = o.transporte;
    this.atraso = o.atraso ?? 2;
    this.janela = o.janela ?? 8;
    this.relogio = o.relogio ?? (() => Date.now());
    this.aoDessincronizar = o.aoDessincronizar;
    this.aoAgendar = o.aoAgendar;
    this.inicial = o.jogo.clonar(o.inicial);
    this.estado = o.jogo.clonar(o.inicial);
    this.fotos.set(0, this.jogo.clonar(this.estado));
    this.ouvidoEm = this.relogio();
    // Os primeiros `atraso` quadros não têm botão de ninguém: são zero dos dois lados.
    for (let q = 0; q < this.atraso; q++) { this.entradas[0].set(q, 0); this.entradas[1].set(q, 0); }
    this.confirmadoDoOutro = this.atraso;
    this.soltar = this.transporte.aoReceber((d) => this.receber(d));
  }

  fechar() { this.soltar(); }

  /** Há quanto tempo não chega nada do outro. */
  msSemOuvir(): number { return this.relogio() - this.ouvidoEm; }

  /**
   * Leva a luta até `alvo` (o quadro que o relógio manda), com o botão local de agora valendo em
   * `quadro + atraso`. Chamada a cada volta do laço da tela; é aqui que se volta no tempo.
   */
  avancarAte(alvo: number, entradaLocal: number) {
    const agendar = (q: number) => {
      const meus = this.entradas[this.lado];
      if (meus.has(q)) return;
      meus.set(q, entradaLocal);
      this.aoAgendar?.(q, entradaLocal);
    };
    agendar(this.quadro + this.atraso);
    this.refazerSePreciso();
    this.esperando = false;
    let passos = 0;
    while (this.quadro < alvo && passos < 12) {
      if (this.quadro >= this.confirmadoDoOutro + this.janela) { this.esperando = true; break; }
      agendar(this.quadro + this.atraso);
      this.passo();
      passos++;
    }
    this.enviar();
    this.compararImpressoes();
    // Quem assiste não pode publicar nada na sala (o passe da plateia só assina) — então não
    // adianta esperar o pedido dela: o lado 0 manda o estado confirmado de tempos em tempos, e
    // quem entra no meio pega a luta em até ESTADO_A_CADA quadros.
    if (this.lado === 0 && this.quadro - this.estadoMandadoEm >= ESTADO_A_CADA) {
      this.estadoMandadoEm = this.quadro;
      this.responderEstado();
    }
    this.esquecer();
  }

  private botoes(q: number): [number, number] {
    const meu = this.entradas[this.lado].get(q) ?? 0;
    let outro = this.entradas[1 - this.lado].get(q);
    if (outro === undefined) {
      // chute: o último botão de verdade que chegou
      outro = this.entradas[1 - this.lado].get(this.confirmadoDoOutro - 1) ?? 0;
      this.chutes.set(q, outro);
    } else {
      this.chutes.delete(q);
    }
    return this.lado === 0 ? [meu, outro] : [outro, meu];
  }

  private passo() {
    const q = this.quadro;
    this.jogo.avancar(this.estado, this.botoes(q));
    this.quadro = q + 1;
    this.fotos.set(this.quadro, this.jogo.clonar(this.estado));
    // Anotada mesmo com chute: se o chute estava errado, a volta no tempo passa aqui de novo e
    // reescreve. Só vai para o outro quando o quadro estiver confirmado (compararImpressoes).
    if (this.quadro % INTERVALO_DA_IMPRESSAO === 0) this.impressoes.set(this.quadro, this.jogo.impressao(this.estado));
  }

  private refazerSePreciso() {
    if (this.primeiroErrado === null) return;
    const de = this.primeiroErrado;
    this.primeiroErrado = null;
    const foto = this.fotos.get(de);
    if (de >= this.quadro || !foto) return;
    const ate = this.quadro;
    this.quadrosDeVolta = ate - de;
    this.estado = this.jogo.clonar(foto);
    this.quadro = de;
    while (this.quadro < ate) this.passo();
  }

  private receber(dados: Uint8Array) {
    const p = decodificar(dados);
    if (!p) return;
    if (p.tipo === 'pedirEstado') { if (this.lado === 0) this.responderEstado(); return; }
    if (p.tipo === 'impressao') {
      if (p.lado !== this.lado) this.impressoesDoOutro.set(p.quadro, p.impressao);
      return;
    }
    if (p.tipo !== 'entradas' || p.lado === this.lado) return;
    this.ouvidoEm = this.relogio();
    this.confirmadoPeloOutro = Math.max(this.confirmadoPeloOutro, p.confirmado);
    // O eco é a nossa hora de envio devolvida, somada ao tempo que ficou parada do lado de lá.
    if (p.eco) this.ping = Math.max(0, ((this.relogio() >>> 0) - p.eco) >>> 0);
    this.ecoDoOutro = p.enviadoEm;
    this.ecoRecebidoEm = this.relogio();
    const deles = this.entradas[1 - this.lado];
    p.entradas.forEach((botao, i) => {
      const q = p.primeiro + i;
      if (deles.has(q)) return;
      deles.set(q, botao);
      const chute = this.chutes.get(q);
      if (q < this.quadro && chute !== undefined && chute !== botao) {
        this.primeiroErrado = this.primeiroErrado === null ? q : Math.min(this.primeiroErrado, q);
      }
      if (q < this.quadro) this.chutes.delete(q);
    });
    while (deles.has(this.confirmadoDoOutro)) this.confirmadoDoOutro++;
  }

  private enviar() {
    const meus = this.entradas[this.lado];
    let fim = this.confirmadoPeloOutro;
    while (meus.has(fim)) fim++;
    const primeiro = Math.max(this.confirmadoPeloOutro, fim - MAXIMO_POR_PACOTE);
    const lista: number[] = [];
    for (let q = primeiro; q < fim; q++) lista.push(meus.get(q) ?? 0);
    const agora = this.relogio() >>> 0;
    const eco = this.ecoRecebidoEm ? (this.ecoDoOutro + (agora - (this.ecoRecebidoEm >>> 0))) >>> 0 : 0;
    this.transporte.enviar(codificar({
      tipo: 'entradas', lado: this.lado, primeiro, entradas: lista, confirmado: this.confirmadoDoOutro, quadro: this.quadro,
      enviadoEm: agora, eco,
    }), false);
  }

  private compararImpressoes() {
    for (const [q, h] of this.impressoes) {
      if (q > this.confirmadoDoOutro || q > this.quadro) continue;
      // Confirmado: todo chute antes dele já foi corrigido, então a impressão é a de verdade.
      if (!this.impressoesEnviadas.has(q)) {
        this.impressoesEnviadas.add(q);
        this.transporte.enviar(codificar({ tipo: 'impressao', lado: this.lado, quadro: q, impressao: h }), true);
      }
      const deles = this.impressoesDoOutro.get(q);
      if (deles !== undefined) {
        if (deles !== h && !this.dessincronia) { this.dessincronia = true; this.aoDessincronizar?.(q); }
        this.impressoes.delete(q);
        this.impressoesDoOutro.delete(q);
      }
    }
  }

  /** Memória constante: fotos só da janela, botões só do histórico de quem assiste. */
  private esquecer() {
    const volta = Math.min(this.confirmadoDoOutro, this.quadro) - 1;
    for (const q of this.fotos.keys()) if (q < volta) this.fotos.delete(q);
    const velho = this.quadro - HISTORICO;
    for (const m of this.entradas) for (const q of m.keys()) if (q < velho) m.delete(q);
    for (const q of this.chutes.keys()) if (q < volta) this.chutes.delete(q);
    for (const m of [this.impressoes, this.impressoesDoOutro]) for (const q of m.keys()) if (q < velho) m.delete(q);
    for (const q of this.impressoesEnviadas) if (q < velho) this.impressoesEnviadas.delete(q);
  }

  /**
   * Quem entra assistindo no meio pede o estado: vai o do último quadro que os dois confirmaram,
   * e os botões dos dois dali para a frente.
   */
  private responderEstado() {
    const q = Math.min(this.confirmadoDoOutro, this.quadro);
    // refaz a partir da foto mais antiga até q, sem chute: é o estado de verdade
    const base = [...this.fotos.keys()].filter((k) => k <= q).sort((a, b) => a - b)[0];
    let estado: E | null = null;
    if (base !== undefined && !this.chutesAntes(q, base)) {
      estado = this.jogo.clonar(this.fotos.get(base)!);
      for (let k = base; k < q; k++) this.jogo.avancar(estado, [this.entradas[0].get(k) ?? 0, this.entradas[1].get(k) ?? 0]);
    }
    if (!estado) return;
    const lista: [number[], number[]] = [[], []];
    for (let k = q; k < this.quadro + this.atraso; k++) {
      lista[0].push(this.entradas[0].get(k) ?? -1);
      lista[1].push(this.entradas[1].get(k) ?? -1);
    }
    this.transporte.enviar(codificar({ tipo: 'estado', quadro: q, estado, entradas: lista }), true);
  }

  private chutesAntes(q: number, base: number) {
    for (let k = base; k < q; k++) if (!this.entradas[0].has(k) || !this.entradas[1].has(k)) return true;
    return false;
  }

  /** Só para testes: o estado do começo da luta. */
  get estadoInicial() { return this.inicial; }
}

// ---- quem assiste ----------------------------------------------------------------------------

export class EspectadorDaLuta<E> {
  estado: E | null;
  quadro = 0;
  private readonly jogo: Jogo<E>;
  private readonly transporte: Transporte;
  private readonly soltar: () => void;
  private readonly entradas: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
  private readonly desserializar: (o: unknown) => E;
  private pediuEm = -Infinity;
  private readonly relogio: () => number;
  ouvidoEm: number;

  /** `inicial` é o estado do quadro 0; quem entra no meio passa `null` e pede o estado. */
  constructor(o: { jogo: Jogo<E>; inicial: E | null; transporte: Transporte; relogio?: () => number; desserializar?: (o: unknown) => E }) {
    this.jogo = o.jogo;
    this.transporte = o.transporte;
    this.estado = o.inicial ? o.jogo.clonar(o.inicial) : null;
    this.desserializar = o.desserializar ?? ((x) => x as E);
    this.relogio = o.relogio ?? (() => Date.now());
    this.ouvidoEm = this.relogio();
    this.soltar = this.transporte.aoReceber((d) => this.receber(d));
  }

  fechar() { this.soltar(); }

  /**
   * Anda tudo o que os dois lados já confirmaram. Sem estado — ou com um buraco nos botões, de
   * quem chegou depois de eles passarem —, pede o estado (de 2 em 2 s).
   */
  avancar() {
    const buraco = this.estado !== null && !(this.entradas[0].has(this.quadro) && this.entradas[1].has(this.quadro))
      && [...this.entradas[0].keys(), ...this.entradas[1].keys()].some((q) => q > this.quadro + 30);
    if (!this.estado || buraco) {
      if (this.relogio() - this.pediuEm > 2000) {
        this.pediuEm = this.relogio();
        this.transporte.enviar(codificar({ tipo: 'pedirEstado' }), true);
      }
      return;
    }
    let passos = 0;
    while (this.entradas[0].has(this.quadro) && this.entradas[1].has(this.quadro) && passos < 30) {
      this.jogo.avancar(this.estado, [this.entradas[0].get(this.quadro)!, this.entradas[1].get(this.quadro)!]);
      this.entradas[0].delete(this.quadro);
      this.entradas[1].delete(this.quadro);
      this.quadro++;
      passos++;
    }
  }

  private receber(dados: Uint8Array) {
    const p = decodificar(dados);
    if (!p) return;
    if (p.tipo === 'estado') {
      // Quem já está andando em dia ignora: o estado que chega de tempos em tempos é para quem chegou agora.
      const emDia = this.estado && (this.entradas[0].has(this.quadro) && this.entradas[1].has(this.quadro) || p.quadro <= this.quadro + 30);
      if (emDia) return;
      this.estado = this.desserializar(p.estado);
      this.quadro = p.quadro;
      for (const m of this.entradas) for (const q of m.keys()) if (q < p.quadro) m.delete(q);
      p.entradas.forEach((lista, lado) => lista.forEach((b, i) => { if (b >= 0) this.entradas[lado].set(p.quadro + i, b); }));
      return;
    }
    if (p.tipo !== 'entradas') return;
    this.ouvidoEm = this.relogio();
    p.entradas.forEach((b, i) => {
      const q = p.primeiro + i;
      if (q >= this.quadro) this.entradas[p.lado].set(q, b);
    });
  }
}

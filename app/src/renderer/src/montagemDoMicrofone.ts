import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor';
import urlDoFiltro from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import urlDoWasm from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import urlDoWasmSimd from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import urlDoMicrofone from './microfone.worklet.ts?worker&url';
import type { AjustesDoMicrofone } from './sensibilidade';
import type { MensagemDoMicrofone, MensagemParaOMicrofone } from './microfone.worklet';

/**
 * O caminho do som do microfone por dentro: cru → filtro de voz → corte → para a call.
 *
 * O MESMO caminho serve à call e à barra dos ajustes fora dela, e é por isso que mora
 * aqui e não dentro do LiveKit: a barra que a pessoa olha para acertar o corte tem de
 * medir exatamente o que a call vai receber.
 *
 * O filtro de voz é o RNNoise, e não o GTCRN que vem no mesmo pacote. Medido na mesma
 * mistura: o GTCRN tira mais teclado, mas processa em blocos quatro vezes mais pesados, e
 * numa máquina mais fraca que o Mac onde isso foi medido o bloco passaria do tempo que o
 * áudio tem — voz picotando, que é pior que o barulho.
 */

export type Medida = { nivel: number; corte: number; aberto: boolean };
export type EstadoDoFiltro = 'carregando' | 'vivo' | 'falhou' | 'desligado';

/** Cada contexto de áudio carrega os dois processadores uma vez só. */
const carregados = new WeakMap<BaseAudioContext, Promise<void>>();
let wasm: Promise<ArrayBuffer> | null = null;

function carregar(ctx: BaseAudioContext) {
  let p = carregados.get(ctx);
  if (!p) {
    p = Promise.all([ctx.audioWorklet.addModule(urlDoMicrofone), ctx.audioWorklet.addModule(urlDoFiltro)]).then(() => undefined);
    carregados.set(ctx, p);
    // Uma falha não pode ficar guardada: a próxima montagem tenta de novo.
    p.catch(() => carregados.delete(ctx));
  }
  return p;
}

export class MontagemDoMicrofone {
  /** O que vai para a call. */
  readonly saida: MediaStreamTrack;
  private fonte: MediaStreamAudioSourceNode;
  private filtro: RnnoiseWorkletNode | null = null;
  private fim: AudioWorkletNode;
  private destino: MediaStreamAudioDestinationNode;
  private ouvintes = new Set<(m: Medida) => void>();
  private ouvintesDoFiltro = new Set<(e: EstadoDoFiltro) => void>();
  private _estadoDoFiltro: EstadoDoFiltro = 'desligado';
  private ajustes: AjustesDoMicrofone;
  ultimaMedida: Medida | null = null;
  erroDoFiltro: Error | null = null;

  private constructor(ctx: AudioContext, faixa: MediaStreamTrack, ajustes: AjustesDoMicrofone) {
    this.ajustes = ajustes;
    this.fonte = ctx.createMediaStreamSource(new MediaStream([faixa]));
    this.fim = new AudioWorkletNode(ctx, 'saga-microfone', {
      numberOfInputs: 2,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: this.mensagem(),
    });
    this.destino = ctx.createMediaStreamDestination();
    this.destino.channelCount = 1;
    this.fonte.connect(this.fim, 0, 0);
    this.fim.connect(this.destino);
    this.saida = this.destino.stream.getAudioTracks()[0];
    this.fim.port.onmessage = (e: MessageEvent<MensagemDoMicrofone>) => {
      const m = e.data;
      if (m.tipo === 'medida') {
        this.ultimaMedida = { nivel: m.nivel, corte: m.corte, aberto: m.aberto };
        for (const f of this.ouvintes) f(this.ultimaMedida);
      } else if (m.tipo === 'filtro') {
        this.definirEstado(m.estado);
      }
    };
  }

  /** Monta o caminho. Falhar em carregar o filtro não impede a montagem: o cru segue. */
  static async criar(ctx: AudioContext, faixa: MediaStreamTrack, ajustes: AjustesDoMicrofone) {
    await carregar(ctx);
    const m = new MontagemDoMicrofone(ctx, faixa, ajustes);
    await m.aplicarFiltro(ctx);
    return m;
  }

  get estadoDoFiltro() { return this._estadoDoFiltro; }

  private definirEstado(e: EstadoDoFiltro) {
    if (e === this._estadoDoFiltro) return;
    this._estadoDoFiltro = e;
    for (const f of this.ouvintesDoFiltro) f(e);
  }

  private mensagem(): MensagemParaOMicrofone {
    return { tipo: 'ajustes', usarFiltro: this.ajustes.supressao === 'forte', auto: this.ajustes.auto, corte: this.ajustes.corte };
  }

  /**
   * Liga ou desliga o filtro de voz sem trocar a faixa que sai: a call continua com a
   * mesma, e mudar o ajuste no meio de uma conversa não derruba nada.
   */
  private async aplicarFiltro(ctx: AudioContext) {
    const querFiltro = this.ajustes.supressao === 'forte';
    if (querFiltro && !this.filtro) {
      this.definirEstado('carregando');
      try {
        wasm ??= loadRnnoise({ url: urlDoWasm, simdUrl: urlDoWasmSimd });
        const binario = await wasm;
        this.filtro = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: binario });
        this.fonte.connect(this.filtro);
        this.filtro.connect(this.fim, 0, 1);
      } catch (e) {
        // Não derruba nada: sem filtro, o som cru segue com o corte. Quem monta lê o
        // estado e anota o motivo.
        wasm = null;
        this.erroDoFiltro = e as Error;
        this.definirEstado('falhou');
      }
    } else if (!querFiltro && this.filtro) {
      // Desconectado, ele para de gastar processador; o nó é destruído de verdade.
      this.fonte.disconnect(this.filtro);
      this.filtro.disconnect();
      this.filtro.destroy();
      this.filtro = null;
      this.definirEstado('desligado');
    }
  }

  async ajustar(ajustes: AjustesDoMicrofone) {
    this.ajustes = ajustes;
    this.fim.port.postMessage(this.mensagem());
    await this.aplicarFiltro(this.fonte.context as AudioContext);
  }

  aoMedir(f: (m: Medida) => void) {
    this.ouvintes.add(f);
    return () => { this.ouvintes.delete(f); };
  }

  aoMudarOFiltro(f: (e: EstadoDoFiltro) => void) {
    this.ouvintesDoFiltro.add(f);
    return () => { this.ouvintesDoFiltro.delete(f); };
  }

  fechar() {
    this.ouvintes.clear();
    this.ouvintesDoFiltro.clear();
    this.fim.port.onmessage = null;
    try { this.fonte.disconnect(); } catch { /* já desligada */ }
    if (this.filtro) { this.filtro.disconnect(); this.filtro.destroy(); this.filtro = null; }
    this.fim.disconnect();
    this.saida.stop();
  }
}

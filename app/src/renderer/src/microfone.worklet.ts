/**
 * O fim da linha do seu microfone, antes de ir para a call: escolhe entre o som cru e o
 * filtrado, aplica o corte e conta à tela o nível, para a barra andar.
 *
 * Roda na thread de áudio, não na da tela: o corte decide a cada 128 amostras (2,7 ms), e
 * a tela — ocupada desenhando — atrasaria o começo de cada sílaba. A conta é a de
 * `sensibilidade.ts`, a mesma dos testes; aqui só mora o que precisa do áudio.
 *
 * Entrada 0 é o som cru; entrada 1, o que saiu do filtro de voz (quando há um).
 */
import { avancar, corteVigente, nivelDoBloco, novoPortao } from './sensibilidade.ts';

declare const sampleRate: number;
declare function registerProcessor(nome: string, classe: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(opcoes?: unknown);
}

export type MensagemParaOMicrofone =
  | { tipo: 'ajustes'; usarFiltro: boolean; auto: boolean; corte: number };

export type MensagemDoMicrofone =
  | { tipo: 'medida'; nivel: number; corte: number; aberto: boolean }
  | { tipo: 'filtro'; estado: 'vivo' | 'falhou' };

/**
 * O filtro de voz devolve SILÊNCIO enquanto não terminou de carregar — e para sempre, se
 * não carregar. Medido: com o WebAssembly recusado pelo CSP, a saída dele ficou em −120 dB
 * com a voz a −14. Confiar nele de cara seria um microfone mudo sem erro nenhum. Então o
 * som cru segue valendo até o filtro entregar a primeira amostra; se o cru tiver som por
 * este tempo e o filtro nada, ele falhou.
 */
const DESISTIR_DO_FILTRO_MS = 4000;
/** A barra anda a 20 quadros por segundo: mais que isso é mensagem que a tela não vê. */
const MEDIR_A_CADA_MS = 50;

class Microfone extends AudioWorkletProcessor {
  private portao = novoPortao();
  private usarFiltro = false;
  private auto = true;
  private corte = -50;
  private filtroVivo = false;
  private filtroFalhou = false;
  private semFiltroMs = 0;
  private ganho = 0;
  private desdeAMedidaMs = 0;
  private readonly blocoMs = (128 / sampleRate) * 1000;
  // Abrir é quase instantâneo (o começo da sílaba); fechar é um desvanecer curto, senão
  // o corte vira um estalo.
  private readonly subida = 1 / (0.004 * sampleRate);
  private readonly descida = 1 / (0.06 * sampleRate);

  constructor(opcoes: { processorOptions?: Partial<MensagemParaOMicrofone> }) {
    super(opcoes);
    const o = opcoes?.processorOptions;
    if (o) this.ajustar(o);
    this.port.onmessage = (e: MessageEvent<MensagemParaOMicrofone>) => {
      if (e.data?.tipo === 'ajustes') this.ajustar(e.data);
    };
  }

  private ajustar(o: Partial<MensagemParaOMicrofone>) {
    if (typeof o.usarFiltro === 'boolean') this.usarFiltro = o.usarFiltro;
    if (typeof o.auto === 'boolean') this.auto = o.auto;
    if (typeof o.corte === 'number') this.corte = o.corte;
  }

  process(entradas: Float32Array[][], saidas: Float32Array[][]) {
    const cru = entradas[0]?.[0];
    const saida = saidas[0]?.[0];
    if (!saida) return true;
    if (!cru) { saida.fill(0); return true; }

    let fonte = cru;
    const filtrado = entradas[1]?.[0];
    if (this.usarFiltro && filtrado && !this.filtroFalhou) {
      if (!this.filtroVivo) {
        for (let i = 0; i < filtrado.length; i++) {
          if (filtrado[i] !== 0) { this.filtroVivo = true; this.port.postMessage({ tipo: 'filtro', estado: 'vivo' } satisfies MensagemDoMicrofone); break; }
        }
      }
      if (this.filtroVivo) fonte = filtrado;
      else if (nivelDoBloco(cru) > -70) {
        this.semFiltroMs += this.blocoMs;
        if (this.semFiltroMs >= DESISTIR_DO_FILTRO_MS) {
          this.filtroFalhou = true;
          this.port.postMessage({ tipo: 'filtro', estado: 'falhou' } satisfies MensagemDoMicrofone);
        }
      }
    }

    avancar(this.portao, nivelDoBloco(fonte), this.blocoMs, this.auto, this.corte);
    const alvo = this.portao.aberto ? 1 : 0;
    for (let i = 0; i < fonte.length; i++) {
      if (this.ganho < alvo) this.ganho = Math.min(alvo, this.ganho + this.subida);
      else if (this.ganho > alvo) this.ganho = Math.max(alvo, this.ganho - this.descida);
      saida[i] = fonte[i] * this.ganho;
    }

    this.desdeAMedidaMs += this.blocoMs;
    if (this.desdeAMedidaMs >= MEDIR_A_CADA_MS) {
      this.desdeAMedidaMs = 0;
      this.port.postMessage({
        tipo: 'medida',
        nivel: this.portao.nivel,
        corte: corteVigente(this.portao, this.auto, this.corte),
        aberto: this.portao.aberto,
      } satisfies MensagemDoMicrofone);
    }
    return true;
  }
}

registerProcessor('saga-microfone', Microfone);

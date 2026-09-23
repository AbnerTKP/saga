import { useCallback, useEffect, useRef, useState } from 'react';
import {
  lerMensagens, enviarMensagem, enviarGifNoChat, enviarArquivoNoChat, enviarImagemNoChat, avisarQueDigito, apagarMensagem,
  type Digitando, type Mensagem, type Onde, type ErroDoServidor,
} from './api';
import { vaiComoImagem } from './anexos';
import { aoDespertar } from './despertar';
import { mesmoSeIgual } from './igual';
import { lerComando } from './comandos';
import { executarComando, respostaLocal } from './musicaDoBot';

// Com que frequência buscamos o que chegou. Só o que é novo vem, então a conta é pequena;
// e para cinco amigos, dois segundos passam por instantâneo.
const INTERVALO = 2000;

/**
 * De quanto em quanto tempo o app conta que estou escrevendo.
 *
 * Nunca a cada tecla: escrever a cada tecla é exatamente o que `vista_em` ensinou a não
 * fazer aqui. Três segundos ficam bem abaixo dos sete que o aviso vale no servidor, então
 * quem está escrevendo sem parar nunca some da tela dos outros no meio de uma frase.
 */
const AVISAR_A_CADA = 3000;

/**
 * O chat de um LUGAR: uma sala de um servidor, ou uma conversa privada.
 *
 * O mesmo laço serve os dois porque a resposta do servidor é a mesma — só muda `sala=`
 * para `conversa=`. Uma segunda cópia disto para a conversa privada seria uma segunda
 * implementação do apagar, do "está digitando" e da busca do que chegou, e a segunda
 * envelheceria em silêncio.
 *
 * A dependência do efeito é a CHAVE do lugar (`s12`, `c3`), e não o objeto: `{sala: 12}`
 * nasce de novo a cada desenho, e com ele o laço reiniciaria a cada volta — o mesmo
 * defeito que fez a busca de `/servidor` rodar 4.204 vezes em 10 s.
 */
export const chaveDoLugar = (onde: Onde | null) =>
  (!onde ? null : 'sala' in onde ? `s${onde.sala}` : `c${onde.conversa}`);

export function useChat(onde: Onde | null) {
  const chave = chaveDoLugar(onde);
  // O lugar em referência: o efeito depende da chave, mas precisa do objeto para pedir.
  const lugar = useRef(onde);
  lugar.current = onde;
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [digitando, setDigitando] = useState<Digitando[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const ultima = useRef(0);
  const ultimoAviso = useRef(0);
  // O relógio do SERVIDOR na última resposta: a próxima pergunta é "o que foi apagado
  // desde então". Relógio de lá, e não daqui, porque é o mesmo para todas as telas.
  const apagadasDesde = useRef(0);

  useEffect(() => {
    setMensagens([]);
    setDigitando([]);
    ultima.current = 0;
    apagadasDesde.current = 0;
    // A primeira tecla num lugar novo avisa na hora, sem herdar o relógio do anterior.
    ultimoAviso.current = 0;
    const aqui = lugar.current;
    if (!aqui) return;

    let vivo = true;
    const buscar = async () => {
      try {
        const r = await lerMensagens(aqui, ultima.current || undefined, apagadasDesde.current || undefined);
        if (!vivo) return;
        // Servidor antigo não manda o campo: aí ninguém aparece digitando, e nada quebra.
        setDigitando((antes) => mesmoSeIgual(antes, r.digitando ?? []));
        setErro(null);
        if (r.agora) apagadasDesde.current = r.agora;
        // Apagada por alguém noutra tela: sai desta também. A busca só traz o que é NOVO, e
        // sem isto a mensagem ficava aqui até a pessoa trocar de sala.
        if (r.apagadas?.length) {
          const fora = new Set(r.apagadas);
          setMensagens((antigas) => antigas.filter((m) => !fora.has(m.id)));
        }
        if (r.mensagens.length === 0) return;
        ultima.current = r.mensagens.at(-1)!.id;
        // A primeira busca traz o histórico; as seguintes, só o que chegou.
        setMensagens((antigas) => [...antigas, ...r.mensagens].slice(-300));
      } catch (e) {
        if (vivo) setErro((e as Error).message);
      }
    };

    buscar();
    const id = setInterval(buscar, INTERVALO);
    // A internet voltou, a janela voltou a aparecer, a máquina acordou: busca AGORA, em
    // vez de esperar a próxima volta de um relógio que pode ter passado minutos parado.
    const pararDeDespertar = aoDespertar(buscar);
    return () => { vivo = false; clearInterval(id); pararDeDespertar(); };
  }, [chave]);

  // Quem acabou de escrever não pode esperar a próxima busca para se ver na tela.
  const mostrarJa = useCallback((m: Mensagem) => {
    ultima.current = Math.max(ultima.current, m.id);
    setMensagens((antigas) => (antigas.some((x) => x.id === m.id) ? antigas : [...antigas, m]));
    setErro(null);
  }, []);

  /**
   * "Estou escrevendo", freado.
   *
   * Chamado a cada tecla e mandado a cada três segundos. O servidor esquece sozinho
   * depois de sete, então parar de digitar apaga a frase sem ninguém precisar avisar que
   * parou — e desistir de escrever é justamente a hora em que ninguém avisa nada.
   */
  const contarQueDigito = useCallback(() => {
    const aqui = lugar.current;
    if (!aqui) return;
    const agora = Date.now();
    if (agora - ultimoAviso.current < AVISAR_A_CADA) return;
    ultimoAviso.current = agora;
    // Servidor antigo responde 404 aqui. Não é assunto de ninguém: a frase simplesmente
    // não aparece do outro lado.
    avisarQueDigito(aqui).catch(() => undefined);
  }, [chave]);

  // Mandou: o servidor já tira a frase, e o relógio zera para a próxima tecla avisar logo.
  const mandou = useCallback(() => { ultimoAviso.current = 0; }, []);

  /** Mostra uma resposta do bot que só quem pediu vê; `tirar` a apaga. */
  const mostrarLocal = useCallback((m: Mensagem) => setMensagens((antigas) => [...antigas, m]), []);
  const tirarLocal = useCallback((id: number) => setMensagens((antigas) => antigas.filter((m) => m.id !== id)), []);

  /**
   * Um comando do bot de música. Não vira mensagem com a barra: o que aparece é a resposta
   * do bot — e, no erro, uma que só você vê, como no Discord.
   */
  const comando = useCallback(async (c: NonNullable<ReturnType<typeof lerComando>>) => {
    const aqui = lugar.current;
    if (!aqui) return;
    if (!('sala' in aqui)) {
      mostrarLocal(respostaLocal('O bot de música só atende nas salas de texto de um servidor.', c.nome));
      return;
    }
    const procurando = respostaLocal(`Procurando "${c.arg || '…'}"…`, c.nome);
    try {
      const m = await executarComando(aqui.sala, c, () => mostrarLocal(procurando));
      tirarLocal(procurando.id);
      // A busca pode levar segundos: quem trocou de sala nesse meio-tempo não recebe a resposta na sala errada.
      if (chaveDoLugar(lugar.current) === chaveDoLugar(aqui)) mostrarJa(m);
      mandou();
    } catch (e) {
      tirarLocal(procurando.id);
      mostrarLocal(respostaLocal((e as Error).message, c.nome));
    }
  }, [chave, mostrarJa, mandou, mostrarLocal, tirarLocal]);

  const enviar = useCallback(async (texto: string) => {
    const aqui = lugar.current;
    if (!aqui) return;
    const limpo = texto.trim();
    if (!limpo) return;
    const c = lerComando(limpo);
    if (c) { await comando(c); return; }
    try {
      mostrarJa(await enviarMensagem(aqui, limpo));
      mandou();
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [chave, mostrarJa, mandou, comando]);

  const enviarGif = useCallback(async (url: string) => {
    const aqui = lugar.current;
    if (!aqui) return;
    // Deixa o erro subir: quem abriu o seletor de GIF precisa vê-lo lá dentro.
    mostrarJa(await enviarGifNoChat(aqui, url));
    mandou();
  }, [chave, mostrarJa, mandou]);

  const enviarArquivo = useCallback(async (
    arquivo: File,
    texto = '',
    aoProgredir?: (fracao: number) => void,
  ) => {
    const aqui = lugar.current;
    if (!aqui) return;
    // O erro sobe para quem chamou: é lá, ao lado do arquivo escolhido, que ele precisa
    // aparecer — e não numa tarja no alto, longe do que a pessoa estava fazendo.
    //
    // Imagem aparece NA conversa, e não num cartão de baixar (ver anexos.ts). Servidor
    // antigo não tem a rota e responde 404: aí ela vai como arquivo, que é como ia antes —
    // app e servidor sobem separados, e colar um print não pode falhar por isso.
    if (vaiComoImagem(arquivo)) {
      try {
        mostrarJa(await enviarImagemNoChat(aqui, arquivo, texto, aoProgredir));
        mandou();
        return;
      } catch (e) {
        if ((e as ErroDoServidor).status !== 404) throw e;
      }
    }
    mostrarJa(await enviarArquivoNoChat(aqui, arquivo, texto, aoProgredir));
    mandou();
  }, [chave, mostrarJa, mandou]);

  /**
   * Apaga uma mensagem. Sai desta tela na hora; as outras ficam sabendo na busca delas. O
   * erro sobe para quem clicou — é ao lado da mensagem que ele precisa aparecer.
   */
  const apagar = useCallback(async (id: number) => {
    // A resposta que só você vê nunca foi ao servidor: apagar é só tirar da tela.
    if (id < 0) { tirarLocal(id); return; }
    await apagarMensagem(id);
    setMensagens((antigas) => antigas.filter((m) => m.id !== id));
  }, [tirarLocal]);

  return { mensagens, digitando, erro, enviar, comando, enviarGif, enviarArquivo, contarQueDigito, apagar };
}

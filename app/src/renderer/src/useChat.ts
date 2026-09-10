import { useCallback, useEffect, useRef, useState } from 'react';
import {
  lerMensagens, enviarMensagem, enviarGifNoChat, enviarArquivoNoChat, avisarQueDigito,
  type Digitando, type Mensagem,
} from './api';
import { aoDespertar } from './despertar';

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

/** Chat de uma sala. As mensagens moram no servidor, então sobrevivem a todo mundo sair. */
export function useChat(salaId: number | null) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [digitando, setDigitando] = useState<Digitando[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const ultima = useRef(0);
  const ultimoAviso = useRef(0);

  useEffect(() => {
    setMensagens([]);
    setDigitando([]);
    ultima.current = 0;
    // A primeira tecla numa sala nova avisa na hora, sem herdar o relógio da anterior.
    ultimoAviso.current = 0;
    if (!salaId) return;

    let vivo = true;
    const buscar = async () => {
      try {
        const r = await lerMensagens(salaId, ultima.current || undefined);
        if (!vivo) return;
        // Servidor antigo não manda o campo: aí ninguém aparece digitando, e nada quebra.
        setDigitando(r.digitando ?? []);
        setErro(null);
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
  }, [salaId]);

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
    if (!salaId) return;
    const agora = Date.now();
    if (agora - ultimoAviso.current < AVISAR_A_CADA) return;
    ultimoAviso.current = agora;
    // Servidor antigo responde 404 aqui. Não é assunto de ninguém: a frase simplesmente
    // não aparece do outro lado.
    avisarQueDigito(salaId).catch(() => undefined);
  }, [salaId]);

  // Mandou: o servidor já tira a frase, e o relógio zera para a próxima tecla avisar logo.
  const mandou = useCallback(() => { ultimoAviso.current = 0; }, []);

  const enviar = useCallback(async (texto: string) => {
    if (!salaId) return;
    const limpo = texto.trim();
    if (!limpo) return;
    try {
      mostrarJa(await enviarMensagem(salaId, limpo));
      mandou();
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [salaId, mostrarJa, mandou]);

  const enviarGif = useCallback(async (url: string) => {
    if (!salaId) return;
    // Deixa o erro subir: quem abriu o seletor de GIF precisa vê-lo lá dentro.
    mostrarJa(await enviarGifNoChat(salaId, url));
    mandou();
  }, [salaId, mostrarJa, mandou]);

  const enviarArquivo = useCallback(async (
    arquivo: File,
    texto = '',
    aoProgredir?: (fracao: number) => void,
  ) => {
    if (!salaId) return;
    // O erro sobe para quem chamou: é lá, ao lado do arquivo escolhido, que ele precisa
    // aparecer — e não numa tarja no alto, longe do que a pessoa estava fazendo.
    mostrarJa(await enviarArquivoNoChat(salaId, arquivo, texto, aoProgredir));
    mandou();
  }, [salaId, mostrarJa, mandou]);

  return { mensagens, digitando, erro, enviar, enviarGif, enviarArquivo, contarQueDigito };
}

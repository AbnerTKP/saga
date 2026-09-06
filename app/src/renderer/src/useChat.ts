import { useCallback, useEffect, useRef, useState } from 'react';
import { lerMensagens, enviarMensagem, enviarGifNoChat, type Mensagem } from './api';

// Com que frequência buscamos o que chegou. Só o que é novo vem, então a conta é pequena;
// e para cinco amigos, dois segundos passam por instantâneo.
const INTERVALO = 2000;

/** Chat de uma sala. As mensagens moram no servidor, então sobrevivem a todo mundo sair. */
export function useChat(salaId: number | null) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const ultima = useRef(0);

  useEffect(() => {
    setMensagens([]);
    ultima.current = 0;
    if (!salaId) return;

    let vivo = true;
    const buscar = async () => {
      try {
        const novas = await lerMensagens(salaId, ultima.current || undefined);
        if (!vivo || novas.length === 0) return;
        ultima.current = novas.at(-1)!.id;
        // A primeira busca traz o histórico; as seguintes, só o que chegou.
        setMensagens((antigas) => [...antigas, ...novas].slice(-300));
        setErro(null);
      } catch (e) {
        if (vivo) setErro((e as Error).message);
      }
    };

    buscar();
    const id = setInterval(buscar, INTERVALO);
    return () => { vivo = false; clearInterval(id); };
  }, [salaId]);

  // Quem acabou de escrever não pode esperar a próxima busca para se ver na tela.
  const mostrarJa = useCallback((m: Mensagem) => {
    ultima.current = Math.max(ultima.current, m.id);
    setMensagens((antigas) => (antigas.some((x) => x.id === m.id) ? antigas : [...antigas, m]));
    setErro(null);
  }, []);

  const enviar = useCallback(async (texto: string) => {
    if (!salaId) return;
    const limpo = texto.trim();
    if (!limpo) return;
    try {
      mostrarJa(await enviarMensagem(salaId, limpo));
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [salaId, mostrarJa]);

  const enviarGif = useCallback(async (url: string) => {
    if (!salaId) return;
    // Deixa o erro subir: quem abriu o seletor de GIF precisa vê-lo lá dentro.
    mostrarJa(await enviarGifNoChat(salaId, url));
  }, [salaId, mostrarJa]);

  return { mensagens, erro, enviar, enviarGif };
}

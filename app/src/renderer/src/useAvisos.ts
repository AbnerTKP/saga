import { useCallback, useRef, useState } from 'react';
import { DURACAO, empilhar, tipoDaFalha, type Aviso, type TipoDeAviso } from './avisosDeTela';

/** Fila de avisos da tela. As regras moram em `avisosDeTela.ts`, testáveis sem navegador. */
export function useAvisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const proximo = useRef(1);
  const relogios = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const fechar = useCallback((id: number) => {
    clearTimeout(relogios.current.get(id));
    relogios.current.delete(id);
    setAvisos((atuais) => atuais.filter((a) => a.id !== id));
  }, []);

  const mostrar = useCallback((tipo: TipoDeAviso, texto: string) => {
    const limpo = String(texto ?? '').trim();
    if (!limpo) return;
    const aviso: Aviso = { id: proximo.current++, tipo, texto: limpo, duracao: DURACAO[tipo] };
    setAvisos((atuais) => empilhar(atuais, aviso));
    if (aviso.duracao) {
      relogios.current.set(aviso.id, setTimeout(() => fechar(aviso.id), aviso.duracao));
    }
  }, [fechar]);

  /** Atalho para o `catch`: o servidor diz se aquilo é erro ou convite ao Turbo. */
  const mostrarFalha = useCallback((e: unknown, prefixo = '') => {
    const texto = (e as Error)?.message ?? String(e);
    mostrar(tipoDaFalha(e), prefixo ? `${prefixo}: ${texto}` : texto);
  }, [mostrar]);

  return { avisos, mostrar, mostrarFalha, fechar };
}

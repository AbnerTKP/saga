import { useState } from 'react';
import { urlDoArquivo } from '../api';
import { estilo, type Enquadramento } from '../enquadramento';
import { useApontado, useImagemParada } from '../imagemParada';

export type TamanhoDoAvatar = 'normal' | 'big' | 'huge';

/** Foto da pessoa, ou a inicial do nome enquanto não houver foto. */
export function Avatar({ nome, foto, enquadramento, tamanho = 'normal', extra, titulo, status, onClick }: {
  nome: string;
  foto?: string | null;
  /** Como a pessoa posicionou a própria foto. Sem isto ela aparece torta aqui e certa lá. */
  enquadramento?: Enquadramento | null;
  tamanho?: TamanhoDoAvatar;
  extra?: string;
  titulo?: string;
  /** Bolinha de presença no canto. Sem isto, não desenha nenhuma. */
  status?: string;
  onClick?: () => void;
}) {
  const url = urlDoArquivo(foto);
  // Foto que não carrega volta a ser a inicial. Sem isto sobra um buraco transparente —
  // `.avatar.com-foto` tira o fundo —, que foi o que os últimos a chegar viram quando as
  // imagens sumiram do servidor: nem foto, nem letra, nada. Guarda-se a URL que falhou,
  // não um sim/não, para que trocar de foto tente de novo sozinho.
  const [quebrada, setQuebrada] = useState<string | null>(null);
  const temFoto = !!url && quebrada !== url;
  // GIF parado no primeiro quadro, e animando com o mouse sobre a linha da pessoa: animado o
  // tempo todo, cada foto redesenhava a janela inteira sem parar (ver imagemParada.ts).
  const [apontado, apontar] = useApontado();
  const src = useImagemParada(url, apontado);

  const classe = ['avatar', tamanho !== 'normal' ? tamanho : '', temFoto ? 'com-foto' : '',
    onClick && temFoto ? 'clicavel' : '', extra ?? ''].filter(Boolean).join(' ');
  const corpo = temFoto
    ? <img src={src ?? undefined} alt="" draggable={false} style={estilo(enquadramento)} onError={() => src === url && setQuebrada(url)} />
    : nome.slice(0, 1).toUpperCase();

  // Sem status, nada muda: a bolinha só existe onde faz sentido mostrá-la.
  if (!status) {
    return (
      <span ref={apontar} className={classe} title={titulo} onClick={temFoto && onClick ? onClick : undefined}>
        {corpo}
      </span>
    );
  }
  return (
    <span ref={apontar} className={`com-presenca ${tamanho !== 'normal' ? tamanho : ''}`}>
      <span className={classe} title={titulo} onClick={temFoto && onClick ? onClick : undefined}>
        {corpo}
      </span>
      <span className={`presenca ${status}`} title={titulo} />
    </span>
  );
}

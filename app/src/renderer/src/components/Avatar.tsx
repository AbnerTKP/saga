import { useState } from 'react';
import { urlDoArquivo } from '../api';
import { estilo, type Enquadramento } from '../enquadramento';

export type TamanhoDoAvatar = 'normal' | 'big' | 'huge';

/** Foto da pessoa, ou a inicial do nome enquanto não houver foto. */
export function Avatar({ nome, foto, enquadramento, tamanho = 'normal', extra, titulo, onClick }: {
  nome: string;
  foto?: string | null;
  /** Como a pessoa posicionou a própria foto. Sem isto ela aparece torta aqui e certa lá. */
  enquadramento?: Enquadramento | null;
  tamanho?: TamanhoDoAvatar;
  extra?: string;
  titulo?: string;
  onClick?: () => void;
}) {
  const url = urlDoArquivo(foto);
  // Foto que não carrega volta a ser a inicial. Sem isto sobra um buraco transparente —
  // `.avatar.com-foto` tira o fundo —, que foi o que os últimos a chegar viram quando as
  // imagens sumiram do servidor: nem foto, nem letra, nada. Guarda-se a URL que falhou,
  // não um sim/não, para que trocar de foto tente de novo sozinho.
  const [quebrada, setQuebrada] = useState<string | null>(null);
  const temFoto = !!url && quebrada !== url;

  const classe = ['avatar', tamanho !== 'normal' ? tamanho : '', temFoto ? 'com-foto' : '',
    onClick && temFoto ? 'clicavel' : '', extra ?? ''].filter(Boolean).join(' ');
  return (
    <span className={classe} title={titulo} onClick={temFoto && onClick ? onClick : undefined}>
      {temFoto
        ? <img src={url} alt="" draggable={false} style={estilo(enquadramento)}
            onError={() => setQuebrada(url)} />
        : nome.slice(0, 1).toUpperCase()}
    </span>
  );
}

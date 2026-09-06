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
  const classe = ['avatar', tamanho !== 'normal' ? tamanho : '', url ? 'com-foto' : '',
    onClick && url ? 'clicavel' : '', extra ?? ''].filter(Boolean).join(' ');
  return (
    <span className={classe} title={titulo} onClick={url && onClick ? onClick : undefined}>
      {url
        ? <img src={url} alt="" draggable={false} style={estilo(enquadramento)} />
        : nome.slice(0, 1).toUpperCase()}
    </span>
  );
}

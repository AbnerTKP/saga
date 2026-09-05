import { urlDaImagem } from '../api';

export type TamanhoDoAvatar = 'normal' | 'big' | 'huge';

/** Foto da pessoa, ou a inicial do nome enquanto não houver foto. */
export function Avatar({ nome, foto, tamanho = 'normal', extra, titulo }: {
  nome: string;
  foto?: string | null;
  tamanho?: TamanhoDoAvatar;
  extra?: string;
  titulo?: string;
}) {
  const url = urlDaImagem(foto);
  const classe = ['avatar', tamanho !== 'normal' ? tamanho : '', url ? 'com-foto' : '', extra ?? '']
    .filter(Boolean).join(' ');
  return (
    <span className={classe} title={titulo}>
      {url ? <img src={url} alt="" draggable={false} /> : nome.slice(0, 1).toUpperCase()}
    </span>
  );
}

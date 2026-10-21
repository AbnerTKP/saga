import { useState } from 'react';
import { iconeDoJogo, type Atividade } from '../atividade';
import { urlDoArquivo } from '../api';
import { Icon } from './Icon';

/**
 * O ícone do jogo: o do Steam, quando o jogo é de lá; o da janela do jogo, subido ao nosso
 * servidor, quando não é (o LoL, o VALORANT); e o controle da Saga quando não há nenhum — ou
 * quando a imagem não carrega. Imagem que falha vira o controle, e não um quadrado vazio: a
 * mesma regra da foto que não carrega. `local` é o ícone que ainda nem subiu (a SUA página).
 */
export function IconeDoJogo({ atividade, tamanho, local }: {
  atividade: Pick<Atividade, 'steam' | 'icone' | 'imagem'>; tamanho: number; local?: string | null;
}) {
  const url = iconeDoJogo(atividade) ?? urlDoArquivo(atividade.imagem) ?? local ?? null;
  // Guarda a URL que falhou, e não um sim/não: outro jogo tenta a imagem dele de novo.
  const [quebrou, setQuebrou] = useState<string | null>(null);
  if (url && quebrou !== url) {
    return <img className="atv-icone" src={url} alt="" width={tamanho} height={tamanho} draggable={false} onError={() => setQuebrou(url)} />;
  }
  return (
    <span className="atv-icone atv-sem-imagem" style={{ width: tamanho, height: tamanho }} aria-hidden="true">
      <Icon name="controle" size={Math.round(tamanho * 0.65)} />
    </span>
  );
}

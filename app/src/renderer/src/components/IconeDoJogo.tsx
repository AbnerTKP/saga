import { useState } from 'react';
import { iconeDoJogo, type Atividade } from '../atividade';
import { Icon } from './Icon';

/**
 * O ícone do jogo: o do Steam, quando o jogo é de lá; o controle da Saga, quando não é — ou
 * quando a imagem não carrega (sem internet para o Steam, jogo tirado da loja). Imagem que
 * falha vira o controle, e não um quadrado vazio: a mesma regra da foto que não carrega.
 */
export function IconeDoJogo({ atividade, tamanho }: { atividade: Pick<Atividade, 'steam' | 'icone'>; tamanho: number }) {
  const url = iconeDoJogo(atividade);
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

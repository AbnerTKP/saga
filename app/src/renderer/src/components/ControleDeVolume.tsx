import { useRef } from 'react';
import { Icon } from './Icon';
import { alternarMudo } from '../volume';

/**
 * O volume de uma live, à vista: o alto-falante corta e devolve o som, e a barra ajusta.
 *
 * Morava no botão direito do vídeo, e ninguém o achava — foi uma das queixas que refizeram
 * o assistir live. Hoje ele aparece nos controles por cima da live, no quadro flutuante do
 * chat e no cartão da barra lateral de quem você já está assistindo.
 */
export function ControleDeVolume({ volume, onVolume, largura = 96, claro = false, porcentagem = true }: {
  volume: number;
  onVolume: (v: number) => void;
  /** A barra, em px. */
  largura?: number;
  /** Por cima da imagem, em branco; no resto do app, na cor da casa. */
  claro?: boolean;
  /** No quadro flutuante não cabe o número. */
  porcentagem?: boolean;
}) {
  // O volume de antes de cortar: devolver o som volta a ele — ver alternarMudo.
  const guardado = useRef(volume > 0 ? volume : 1);
  const pct = Math.round(volume * 100);

  return (
    <span
      className={`volume-da-live ${claro ? 'claro' : ''}`}
      // Mexer no volume não é clicar na imagem de baixo, nem pedir tela cheia.
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="volume-mudo"
        title={volume === 0 ? 'Ligar o som' : 'Tirar o som'}
        onClick={() => {
          const r = alternarMudo(volume, guardado.current);
          guardado.current = r.guardado;
          onVolume(r.volume);
        }}
      >
        <Icon name={volume === 0 ? 'speakerOff' : 'speaker'} size={18} />
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        aria-label="Volume da live"
        style={{ width: largura, '--cheio': `${pct}%` } as React.CSSProperties}
        onChange={(e) => {
          const v = Number(e.target.value) / 100;
          if (v > 0) guardado.current = v;
          onVolume(v);
        }}
      />
      {porcentagem && <span className="volume-pct">{pct}%</span>}
    </span>
  );
}

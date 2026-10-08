import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AMOSTRAS, INTERVALO_MS, desenharGrafico, dica, porcento, type Resumo } from '../conexao';
import { COMO_SE_LE, type Cor } from '../sinal';

const LARGURA = 238;
const ALTURA = 56;

const ESTADO: Record<Cor, string> = { bom: 'Boa', medio: 'Instável', ruim: 'Ruim', sem: 'Medindo' };

const ms = (x: number | null) => (x === null ? '—' : `${x} ms`);

/**
 * O cartão da conexão, ao passar o mouse nas barrinhas da voz. Foi a opção B entre três,
 * desenhadas lado a lado com o `styles.css` de verdade (08/10/2026): balão só com o número
 * (A), este cartão (B), e balão com o cartão no clique, como o Discord (C). O dono pediu
 * "na hora, ao passar o mouse", e o cartão da live já abre assim.
 *
 * Fica por cima do painel da voz, no canto da barra, como o cartão da live: em `fixed`, na
 * camada dos menus, porque a barra lateral não pode cortar o que passa da largura dela.
 */
export function CartaoDaConexao({ ancora, cor, resumo, servidor, onManter, onSoltar }: {
  ancora: HTMLElement;
  cor: Cor;
  resumo: Resumo;
  servidor: number | null;
  onManter: () => void;
  onSoltar: () => void;
}) {
  const [mira, setMira] = useState<number | null>(null);
  const painel = (ancora.closest('.voice-panel') ?? ancora).getBoundingClientRect();
  const grafico = desenharGrafico(resumo.pings, LARGURA, ALTURA);
  const frase = dica({ voz: resumo.agora, servidor, perda: resumo.perda });

  // A mira: o ponto mais perto do mouse, e há quanto tempo ele foi medido.
  const passo = LARGURA / (AMOSTRAS - 1);
  const primeiro = AMOSTRAS - resumo.pings.length;
  const apontar = (e: React.MouseEvent<SVGSVGElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const i = Math.round(x / passo) - primeiro;
    setMira(i >= 0 && i < resumo.pings.length ? i : null);
  };
  const xDaMira = mira === null ? 0 : (primeiro + mira) * passo;
  const haQuanto = mira === null ? 0 : Math.round(((resumo.pings.length - 1 - mira) * INTERVALO_MS) / 1000);

  return createPortal(
    // O cartão é filho do botão "voltar para a call" no React: sem parar o clique aqui, ele
    // subiria pelo portal e abriria o palco.
    <div className="cx-cartao" role="dialog" aria-label="Conexão de voz"
      style={{ left: painel.left + 8, bottom: window.innerHeight - painel.top + 6 }}
      onMouseEnter={onManter} onMouseLeave={onSoltar} onClick={(e) => e.stopPropagation()}>
      <div className="cx-topo">
        <span className="cx-titulo">Conexão de voz</span>
        <span className={`cx-estado ${cor}`}>{ESTADO[cor]}</span>
      </div>
      <div className="cx-agora">
        <span className="cx-numero">{ms(resumo.agora)}</span>
        <span className="cx-legenda">{resumo.agora === null ? COMO_SE_LE.sem : 'ping da voz, agora'}</span>
      </div>
      <div className="cx-grafico">
        {resumo.pings.length >= 2 ? (
          <svg width={LARGURA} height={ALTURA} viewBox={`0 0 ${LARGURA} ${ALTURA}`}
            aria-label={`Ping no último minuto: média ${ms(resumo.media)}, pior ${ms(resumo.pior)}`}
            onMouseMove={apontar} onMouseLeave={() => setMira(null)}>
            {grafico.linhaDos100 !== null && <>
              <line className="cx-guia" x1="0" x2={LARGURA} y1={grafico.linhaDos100} y2={grafico.linhaDos100} />
              {/* Com a mira, o rótulo dela ocupa o alto do gráfico: o da guia sai da frente. */}
              {mira === null && <text className="cx-guia-texto" x={LARGURA - 2}
                y={grafico.linhaDos100 > 14 ? grafico.linhaDos100 - 4 : grafico.linhaDos100 + 11} textAnchor="end">100 ms</text>}
            </>}
            <line className="cx-base" x1="0" x2={LARGURA} y1={ALTURA - 0.5} y2={ALTURA - 0.5} />
            <polyline className="cx-linha" points={grafico.pontos} />
            {mira !== null
              ? <>
                  <line className="cx-mira" x1={xDaMira} x2={xDaMira} y1="0" y2={ALTURA} />
                  <text className="cx-mira-texto" x={xDaMira < LARGURA / 2 ? xDaMira + 5 : xDaMira - 5} y="10"
                    textAnchor={xDaMira < LARGURA / 2 ? 'start' : 'end'}>
                    {resumo.pings[mira]} ms · {haQuanto ? `há ${haQuanto} s` : 'agora'}
                  </text>
                </>
              : grafico.ultimo && <circle className="cx-ponto" cx={grafico.ultimo.x} cy={grafico.ultimo.y} r="4" />}
          </svg>
        ) : (
          <div className="cx-grafico-vazio">o gráfico aparece em alguns segundos</div>
        )}
        <div className="cx-eixo"><span>1 min atrás</span><span>agora</span></div>
      </div>
      <dl className="cx-numeros">
        <div><dt>Média</dt><dd>{ms(resumo.media)}</dd></div>
        <div><dt>Pior</dt><dd>{ms(resumo.pior)}</dd></div>
        <div><dt>Pacotes perdidos</dt><dd>{resumo.perda === null ? '—' : porcento(resumo.perda)}</dd></div>
        <div><dt>Servidor</dt><dd>{ms(servidor)}</dd></div>
      </dl>
      {frase && (
        <div className="cx-dica">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" />
          </svg>
          <span>{frase}</span>
        </div>
      )}
    </div>,
    document.body,
  );
}

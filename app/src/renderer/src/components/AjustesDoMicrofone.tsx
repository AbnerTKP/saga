import { useEffect, useRef, useState } from 'react';
import type { MicrofoneDaCall } from '../useMicrofone';
import { dbDoPorcento, porcentoDoDb, type Supressao } from '../sensibilidade';
import { useFecharComEsc } from '../useFechar';

/**
 * Supressão de ruído e sensibilidade: o bloco de "Sua conta" e o cartão do botão direito
 * no microfone. Os dois são o MESMO ajuste — mexer num aparece no outro —, desenhados de
 * dois jeitos: no painel há largura para as três escolhas lado a lado; no cartão, que tem
 * a largura da barra lateral, elas empilham com a explicação embaixo, como no do status.
 * O desenho foi escolhido pelo dono entre três, renderizados antes do código.
 */

const OPCOES: { id: Supressao; nome: string; curta: string; longa: string }[] = [
  // O texto diz o que foi MEDIDO: o filtro levou ventilador de −36 a −70 dB, mas mal
  // tocou no teclado (−29 a −34) e deixou a TV onde estava. Prometer teclado seria mentir.
  { id: 'forte', nome: 'Forte', curta: 'Filtra ventilador, chiado e zumbido',
    longa: 'Filtra o que não é voz — ventilador, chiado, zumbido. Teclado e TV ao fundo quase não mudam com ela: quem os tira é a sensibilidade, nas suas pausas. Gasta um pouco mais do computador.' },
  { id: 'padrao', nome: 'Padrão', curta: 'Só chiado constante',
    longa: 'A de antes: tira chiado constante, mas deixa passar TV e conversa ao fundo.' },
  { id: 'desligada', nome: 'Desligada', curta: 'Como o microfone captou',
    longa: 'O som sai como o microfone captou.' },
];

/**
 * A barra que anda com o seu microfone, e o marcador do corte por cima.
 *
 * O nível chega 20 vezes por segundo e NÃO passa pelo estado do React: redesenhar a tela
 * nesse ritmo seria pagar o painel inteiro por uma barra. Ele vai direto para duas
 * variáveis de CSS. Só "passando / em silêncio", que muda pouco, vira estado.
 */
function Medidor({ microfone, compacto }: { microfone: MicrofoneDaCall; compacto?: boolean }) {
  const barra = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState<boolean | null>(null);
  const { ajustes, definir } = microfone;

  useEffect(() => microfone.ouvir((m) => {
    const el = barra.current;
    if (!el) return;
    el.style.setProperty('--nivel', String(m ? porcentoDoDb(m.nivel) : 0));
    if (m && ajustes.auto) el.style.setProperty('--corte', String(porcentoDoDb(m.corte)));
    setAberto(m ? m.aberto : null);
  }), [microfone.ouvir, ajustes.auto]);

  useEffect(() => {
    if (!ajustes.auto) barra.current?.style.setProperty('--corte', String(porcentoDoDb(ajustes.corte)));
  }, [ajustes.auto, ajustes.corte]);

  const selo = aberto === null ? null : (
    <span className={`selo-do-microfone ${aberto ? 'passando' : ''}`}>
      {aberto ? (compacto ? 'passando' : 'sua voz está passando') : (compacto ? 'em silêncio' : 'em silêncio para a call')}
    </span>
  );

  return (
    <>
      <div className="linha-da-sensibilidade">
        <span className="rotulo-da-sensibilidade">Sensibilidade</span>
        {selo}
      </div>
      <label className="check">
        <input type="checkbox" checked={ajustes.auto} onChange={(e) => definir({ auto: e.target.checked })} />
        Ajustar sozinha
      </label>
      <div className={`medidor ${ajustes.auto ? 'automatico' : ''}`} ref={barra}>
        <div className="medidor-trilho">
          <div className="medidor-cortado" />
          <div className="medidor-passa" />
        </div>
        {ajustes.auto && <div className="medidor-marca" />}
        <input
          type="range" min={0} max={100} step={1}
          aria-label="Sensibilidade do microfone"
          disabled={ajustes.auto}
          value={Math.round(porcentoDoDb(ajustes.corte))}
          onChange={(e) => definir({ corte: dbDoPorcento(Number(e.target.value)) })}
        />
      </div>
    </>
  );
}

function AvisoDoFiltro({ microfone }: { microfone: MicrofoneDaCall }) {
  if (microfone.ajustes.supressao !== 'forte' || microfone.estadoDoFiltro !== 'falhou') return null;
  return (
    <p className="aviso-do-filtro">
      O filtro Forte não carregou neste computador — está valendo o Padrão. O motivo ficou
      no registro de erros.
    </p>
  );
}

/** O bloco de "Sua conta". */
export function BlocoDoMicrofone({ microfone, semTitulo }: { microfone: MicrofoneDaCall; semTitulo?: boolean }) {
  const { ajustes, definir } = microfone;
  const atual = OPCOES.find((o) => o.id === ajustes.supressao)!;
  return (
    <section className={semTitulo ? undefined : 'painel-bloco'}>
      {!semTitulo && <h3>Seu microfone</h3>}
      <div className="form">
        <div className="campo-do-microfone">
          <span className="rotulo-da-sensibilidade">Supressão de ruído</span>
          <div className="segmentos" role="radiogroup" aria-label="Supressão de ruído">
            {[...OPCOES].reverse().map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={o.id === ajustes.supressao}
                className={o.id === ajustes.supressao ? 'atual' : ''} onClick={() => definir({ supressao: o.id })}>
                {o.nome}
              </button>
            ))}
          </div>
          <small className="muted">{atual.longa}</small>
          <AvisoDoFiltro microfone={microfone} />
        </div>
        <div className="campo-do-microfone">
          <Medidor microfone={microfone} />
          <small className="muted">
            A barra anda com o seu microfone, e o que fica à esquerda do corte não sai para a
            call. {ajustes.auto
              ? 'Sozinha, a Saga põe o corte (o tracejado) acima do barulho de casa e um pouco abaixo da sua voz — é por isso que ela precisa te ouvir falar uma vez.'
              : 'Arraste a bolinha para logo acima do barulho de casa, falando normalmente.'}
            {' '}Vale só para o SEU microfone: para você não ouvir a casa de alguém, é ele quem precisa disto ligado.
          </small>
        </div>
      </div>
    </section>
  );
}

/** O cartão do botão direito no microfone, acima do painel de baixo da barra lateral. */
export function CartaoDoMicrofone({ microfone, onMaisAjustes, onClose }: {
  microfone: MicrofoneDaCall;
  onMaisAjustes: () => void;
  onClose: () => void;
}) {
  useFecharComEsc(onClose);
  const cartao = useRef<HTMLDivElement>(null);
  const { ajustes, definir } = microfone;

  // Fecha ao clicar fora — e não ao tirar o mouse, como o do status: arrastando a
  // bolinha, o ponteiro sai do cartão sem ninguém ter desistido de nada.
  useEffect(() => {
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (cartao.current?.contains(alvo)) return;
      if ((alvo as Element).closest?.('[data-abre-microfone]')) return;
      onClose();
    };
    window.addEventListener('pointerdown', fora, true);
    return () => window.removeEventListener('pointerdown', fora, true);
  }, [onClose]);

  return (
    <div className="escolher-status cartao-do-microfone" ref={cartao} role="dialog" aria-label="Seu microfone">
      <div className="cartao-titulo">Supressão de ruído</div>
      {OPCOES.map((o) => (
        <button key={o.id} role="radio" aria-checked={o.id === ajustes.supressao}
          className={o.id === ajustes.supressao ? 'atual' : ''} onClick={() => definir({ supressao: o.id })}>
          <span className="radio" />
          <span className="quem">
            <span className="strong">{o.nome}</span>
            <span className="muted small">{o.curta}</span>
          </span>
        </button>
      ))}
      <AvisoDoFiltro microfone={microfone} />
      <div className="menu-risco" />
      <div className="cartao-sensibilidade">
        <Medidor microfone={microfone} compacto />
      </div>
      <div className="menu-risco" />
      <button className="cartao-mais" onClick={onMaisAjustes}>Mais ajustes em Sua conta</button>
    </div>
  );
}

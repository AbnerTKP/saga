import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { alvos, candidatos, capturaObrigatoria, clicar, ehDama, montarVoo, type LanceDaDama, type Voo } from '../dama';
import { casaClara, indiceDaCasa, ladoDaPeca, lerCasas, nomeDaCasa, ordemDasCasas, type Lado } from '../xadrez';

const COROA = 'M3 18h18l-1.6-9.5-4.6 4L12 5l-2.8 7.5-4.6-4z';
/** Quanto dura cada trecho do voo: o pulo sobre uma peça, e o passo de um lance simples. */
const PULO_MS = 360;
const PASSO_MS = 240;
const semMovimento = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A peça redonda: creme ou chocolate, em relevo, e a dama com a coroa dourada. */
export function PecaDeDama({ letra, mini = false }: { letra: string; mini?: boolean }) {
  const lado = ladoDaPeca(letra) === 'w' ? 'branca' : 'preta';
  return (
    <span className={`peca-de-dama ${lado} ${ehDama(letra) ? 'dama' : ''} ${mini ? 'mini' : ''}`} aria-hidden>
      {ehDama(letra) && !mini && <svg className="coroa" viewBox="0 0 24 24"><path d={COROA} /></svg>}
    </span>
  );
}

/**
 * O tabuleiro da dama, na madeira do xadrez. Clicar numa peça mostra até onde ela vai — na
 * captura, a rota inteira, com as paradas numeradas e um X nas peças que saem —, e clicar na
 * chegada joga a sequência de uma vez. Quem diz o que vale é o servidor, pela lista `legais`:
 * havendo captura, só vêm as que tomam mais peças, e só as peças delas respondem ao clique.
 */
export function TabuleiroDaDama({ fen, embaixo, legais, ultimo, ultimoSan, numeroDeLances, pendente, casa, onLance }: {
  fen: string;
  embaixo: Lado;
  legais: LanceDaDama[];
  ultimo: { de: string; para: string } | null;
  /** O último lance anotado e quantos já houve: é o que diz que chegou um lance novo para animar. */
  ultimoSan: string | null;
  numeroDeLances: number;
  /** O lance que acabou de sair daqui e o servidor ainda não confirmou: já aparece feito. */
  pendente: LanceDaDama | null;
  /** O lado de uma casa, em px. */
  casa: number;
  onLance?: (lance: LanceDaDama) => void;
}) {
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [parcial, setParcial] = useState<string[]>([]);
  const [apontada, setApontada] = useState<string | null>(null);
  useEffect(() => { setEscolhida(null); setParcial([]); }, [fen]);

  /**
   * O VOO: todo lance novo — o seu, o do outro, e o que quem assiste vê — anda pela rota em vez
   * de aparecer pronto. Um lance é "novo" pela chave número:anotação; o seu ganha a chave que vai
   * ter quando o servidor confirmar, para não voar duas vezes. A diferença é calculada DURANTE o
   * desenho (o estado da leitura anterior), como a peça que cai no Catan: num efeito, o tabuleiro
   * pintaria um quadro com o lance já feito antes de a peça sair do lugar.
   */
  const chave = pendente ? `${numeroDeLances}:${pendente.san}` : ultimoSan ? `${numeroDeLances - 1}:${ultimoSan}` : null;
  const [vistas, setVistas] = useState(() => new Set([chave]));
  const [antes, setAntes] = useState(() => ({ fen, casas: lerCasas(fen) }));
  const [voo, setVoo] = useState<(Voo & { chave: string }) | null>(null);
  if (chave && !vistas.has(chave)) {
    setVistas(new Set(vistas).add(chave));
    const san = pendente ? pendente.san : ultimoSan;
    const novo = san && !semMovimento() ? montarVoo(antes.casas, san) : null;
    setVoo(novo ? { ...novo, chave } : null);
  }
  if (fen !== antes.fen) setAntes({ fen, casas: lerCasas(fen) });

  const casas = lerCasas(fen);
  if (pendente) {
    // O lance aparece feito antes de o servidor confirmar, com as tomadas já fora e a coroa
    // de quem chegou ao fim — a resposta demora dezenas de milissegundos.
    const de = indiceDaCasa(pendente.de), para = indiceDaCasa(pendente.para);
    let peca = casas[de];
    casas[de] = null;
    for (const c of pendente.capturadas) casas[indiceDaCasa(c)] = null;
    if (peca === 'P' && pendente.para[1] === '8') peca = 'D';
    if (peca === 'p' && pendente.para[1] === '1') peca = 'd';
    casas[para] = peca;
  }

  // Enquanto a peça voa, ela some da casa de chegada (é a do voo que se vê ali).
  if (voo) casas[indiceDaCasa(voo.pontos.at(-1)!)] = null;

  const mexe = !!onLance && legais.length > 0 && !pendente && !voo;
  const saem = new Set(mexe ? legais.map((l) => l.de) : []);
  const obrigatoria = mexe && capturaObrigatoria(legais);
  const { chegadas, paradas } = mexe && escolhida ? alvos(legais, escolhida, parcial) : { chegadas: [], paradas: [] };
  const cands = mexe && escolhida ? candidatos(legais, escolhida, parcial) : [];
  // A rota que se desenha forte: a da chegada apontada, se só um caminho chega nela; senão,
  // a única que sobrou. As outras, quando há, vão fracas.
  const daApontada = apontada ? cands.filter((l) => l.para === apontada) : [];
  const forte = daApontada.length === 1 ? daApontada[0] : cands.length === 1 ? cands[0] : null;
  const marcado = pendente ?? ultimo;

  const ordem = ordemDasCasas(embaixo);
  const centro = (nome: string) => {
    const k = ordem.indexOf(indiceDaCasa(nome));
    return `${((k % 8) + 0.5) * casa},${(Math.floor(k / 8) + 0.5) * casa}`;
  };
  const linha = (l: LanceDaDama) => [l.de, ...l.caminho].map(centro).join(' ');
  const canto = (nome: string) => {
    const k = ordem.indexOf(indiceDaCasa(nome));
    return { x: (k % 8) * casa, y: Math.floor(k / 8) * casa };
  };

  // A peça anda de casa em casa; no meio de cada pulo ela sobe (cresce), e a peça saltada some.
  // Pela Web Animations, só `transform` e `opacity`: a placa de vídeo desliza, e o React não
  // redesenha nada quadro a quadro.
  const voando = useRef<HTMLDivElement>(null);
  const saltadas = useRef<(HTMLDivElement | null)[]>([]);
  useLayoutEffect(() => {
    const el = voando.current;
    if (!voo || !el) return;
    const trecho = voo.captura ? PULO_MS : PASSO_MS;
    const n = voo.pontos.length - 1;
    const p = voo.pontos.map(canto);
    const quadros: Keyframe[] = [];
    for (let i = 0; i < n; i++) {
      const meio = { x: (p[i].x + p[i + 1].x) / 2, y: (p[i].y + p[i + 1].y) / 2 };
      quadros.push({ offset: i / n, transform: `translate(${p[i].x}px, ${p[i].y}px) scale(1)` });
      quadros.push({ offset: (i + 0.5) / n, transform: `translate(${meio.x}px, ${meio.y - (voo.captura ? casa * 0.18 : 0)}px) scale(${voo.captura ? 1.22 : 1.06})` });
    }
    quadros.push({ offset: 1, transform: `translate(${p[n].x}px, ${p[n].y}px) scale(1)` });
    const animacao = el.animate(quadros, { duration: n * trecho, easing: 'linear', fill: 'forwards' });
    const somem = voo.tomadas.map((_, i) => saltadas.current[i]?.animate(
      [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.55)' }],
      { duration: trecho * 0.6, delay: (i + 0.45) * trecho, easing: 'ease-in', fill: 'forwards' },
    ));
    const chaveDoVoo = voo.chave;
    animacao.onfinish = () => setVoo((v) => (v?.chave === chaveDoVoo ? null : v));
    return () => { animacao.cancel(); somem.forEach((a) => a?.cancel()); };
    // `canto` muda com o tamanho da casa; o voo recomeça só por um lance novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voo]);

  const tocar = (nome: string) => {
    if (!mexe || !onLance) return;
    if (escolhida) {
      const r = clicar(legais, escolhida, parcial, nome);
      if (r && 'jogar' in r) { onLance(r.jogar); setEscolhida(null); setParcial([]); return; }
      if (r) { setParcial(r.parcial); return; }
    }
    if (saem.has(nome) && nome !== escolhida) { setEscolhida(nome); setParcial([]); return; }
    setEscolhida(null);
    setParcial([]);
  };

  return (
    <div className={`tabuleiro ${mexe ? 'mexe' : ''}`} style={{ width: casa * 8, height: casa * 8 }}
      onMouseLeave={() => setApontada(null)}>
      {ordem.map((i, k) => {
        const nome = nomeDaCasa(i);
        const letra = casas[i];
        const chegada = chegadas.includes(nome);
        const parada = paradas.includes(nome);
        const classes = [
          'casa', casaClara(i) ? 'clara' : 'escura',
          marcado && (marcado.de === nome || marcado.para === nome) ? 'ultimo' : '',
          escolhida === nome ? 'escolhida' : '',
          parcial.includes(nome) ? 'passo-escolhido' : '',
          // Obrigado a capturar: as peças que capturam ganham o anel, até você escolher uma —
          // quem não conhece a regra vê na hora por que as outras não respondem.
          obrigatoria && !escolhida && saem.has(nome) ? 'obrigada' : '',
          saem.has(nome) || chegada || parada ? 'clicavel' : '',
        ].filter(Boolean).join(' ');
        const numero = forte ? forte.caminho.indexOf(nome) : -1;
        return (
          <div key={i} className={classes} data-casa={nome} onClick={() => tocar(nome)}
            onMouseEnter={() => setApontada(chegada ? nome : null)}>
            {letra && <PecaDeDama letra={letra} />}
            {forte?.capturadas.includes(nome) && <span className="sai-da-dama" />}
            {numero >= 0 && forte!.capturadas.length > 0
              ? <span className="passo-da-dama">{numero + 1}</span>
              : chegada ? <span className={cands.some((l) => l.para === nome && l.capturadas.length) ? 'alvo-captura' : 'alvo'} />
              : parada ? <span className="alvo" />
              : null}
            {k % 8 === 0 && <span className="coord linha">{nome[1]}</span>}
            {k >= 56 && <span className="coord coluna">{nome[0]}</span>}
          </div>
        );
      })}
      {voo && (
        <>
          {voo.tomadas.map((t, i) => {
            const c = canto(t.casa);
            return (
              <div key={t.casa} ref={(el) => { saltadas.current[i] = el; }} className="voo-da-dama saltada"
                style={{ width: casa, height: casa, left: c.x, top: c.y }}>
                <PecaDeDama letra={t.letra} />
              </div>
            );
          })}
          <div ref={voando} className="voo-da-dama" style={{ width: casa, height: casa, transform: `translate(${canto(voo.pontos[0]).x}px, ${canto(voo.pontos[0]).y}px)` }}>
            <PecaDeDama letra={voo.letra} />
          </div>
        </>
      )}
      {cands.some((l) => l.capturadas.length) && (
        <svg className="rota-da-dama" width={casa * 8} height={casa * 8} aria-hidden>
          {cands.filter((l) => l !== forte).map((l) => (
            <polyline key={l.caminho.join()} className="fraca" points={linha(l)} />
          ))}
          {forte && <polyline points={linha(forte)} />}
        </svg>
      )}
    </div>
  );
}

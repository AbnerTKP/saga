import { useEffect, useState } from 'react';
import { alvos, candidatos, capturaObrigatoria, clicar, ehDama, type LanceDaDama } from '../dama';
import { casaClara, indiceDaCasa, ladoDaPeca, lerCasas, nomeDaCasa, ordemDasCasas, type Lado } from '../xadrez';

const COROA = 'M3 18h18l-1.6-9.5-4.6 4L12 5l-2.8 7.5-4.6-4z';

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
export function TabuleiroDaDama({ fen, embaixo, legais, ultimo, pendente, casa, onLance }: {
  fen: string;
  embaixo: Lado;
  legais: LanceDaDama[];
  ultimo: { de: string; para: string } | null;
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

  const mexe = !!onLance && legais.length > 0 && !pendente;
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

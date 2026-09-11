import { useEffect, useState } from 'react';
import { useFecharComEsc } from '../useFechar';
import {
  casaClara, destinosDe, indiceDaCasa, ladoDaPeca, lerCasas, nomeDaCasa, ordemDasCasas, pedePromocao,
  type Lado, type LanceLegal, type Promocao,
} from '../xadrez';

const CHEIO: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const CONTORNO: Record<string, string> = { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' };
const NOME_DA_PROMOCAO: Record<Promocao, string> = { q: 'Dama', n: 'Cavalo', r: 'Torre', b: 'Bispo' };

/**
 * A peça é o desenho CHEIO: a branca pintada de claro com o contorno escuro por cima, a preta
 * escura. Duas camadas na mesma célula — é o tabuleiro B aprovado, e o que deixa a branca
 * legível na casa clara. A fonte vai dentro do app (`fontes/pecas.woff2`, só estas doze
 * letras): com a do sistema, cada computador desenhava as peças de um jeito.
 */
export function Peca({ letra }: { letra: string }) {
  const tipo = letra.toLowerCase();
  const branca = ladoDaPeca(letra) === 'w';
  return (
    <span className={`peca ${branca ? 'branca' : 'preta'}`} aria-hidden>
      <span className="peca-corpo">{CHEIO[tipo]}</span>
      {branca && <span className="peca-traco">{CONTORNO[tipo]}</span>}
    </span>
  );
}

/**
 * O tabuleiro B. Clicar numa peça mostra para onde ela pode ir; clicar num desses lugares
 * joga. Quem diz o que vale é o servidor, pela lista `legais` — vazia, o tabuleiro só se vê.
 */
export function Tabuleiro({ fen, embaixo, legais, ultimo, xeque, vez, pendente, casa, onLance }: {
  fen: string;
  embaixo: Lado;
  legais: LanceLegal[];
  ultimo: { de: string; para: string } | null;
  /** O rei de quem está na vez está em xeque. */
  xeque: boolean;
  vez: Lado;
  /** O lance que acabou de sair daqui e o servidor ainda não confirmou: já aparece feito. */
  pendente: { de: string; para: string } | null;
  /** O lado de uma casa, em px. */
  casa: number;
  onLance?: (de: string, para: string, promocao?: Promocao) => void;
}) {
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [promovendo, setPromovendo] = useState<{ de: string; para: string } | null>(null);
  // O que se escolheu numa posição não vale na seguinte: o outro jogou, e a peça pode nem
  // estar mais lá.
  useEffect(() => { setEscolhida(null); setPromovendo(null); }, [fen]);

  const casas = lerCasas(fen);
  if (pendente) {
    // O lance que saiu daqui já aparece feito, antes de o servidor confirmar: a resposta
    // demora dezenas de milissegundos, e nesse vão a peça ficaria parada onde estava.
    const de = indiceDaCasa(pendente.de);
    const para = indiceDaCasa(pendente.para);
    if (de >= 0 && para >= 0) { casas[para] = casas[de]; casas[de] = null; }
  }
  const mexe = !!onLance && legais.length > 0 && !pendente;
  const destinos = mexe && escolhida ? destinosDe(legais, escolhida) : [];
  const saem = new Set(mexe ? legais.map((l) => l.de) : []);
  const rei = xeque && !pendente ? casas.indexOf(vez === 'w' ? 'K' : 'k') : -1;
  const marcado = pendente ?? ultimo;

  const clicar = (nome: string) => {
    if (!mexe || !onLance) return;
    if (escolhida && destinos.some((d) => d.para === nome)) {
      if (pedePromocao(legais, escolhida, nome)) { setPromovendo({ de: escolhida, para: nome }); return; }
      onLance(escolhida, nome);
      setEscolhida(null);
      return;
    }
    setEscolhida(saem.has(nome) && escolhida !== nome ? nome : null);
  };

  const ordem = ordemDasCasas(embaixo);
  const posicaoDe = (nome: string) => ordem.findIndex((i) => nomeDaCasa(i) === nome);

  return (
    <div className={`tabuleiro ${mexe ? 'mexe' : ''}`} style={{ width: casa * 8, height: casa * 8, fontSize: Math.round(casa * 0.8) }}>
      {ordem.map((i, k) => {
        const nome = nomeDaCasa(i);
        const letra = casas[i];
        const destino = destinos.find((d) => d.para === nome);
        const classes = [
          'casa', casaClara(i) ? 'clara' : 'escura',
          marcado && (marcado.de === nome || marcado.para === nome) ? 'ultimo' : '',
          escolhida === nome ? 'escolhida' : '',
          rei === i ? 'xeque' : '',
          saem.has(nome) || destino ? 'clicavel' : '',
        ].filter(Boolean).join(' ');
        return (
          <div key={i} className={classes} data-casa={nome} onClick={() => clicar(nome)}>
            {destino && <span className={destino.captura ? 'alvo-captura' : 'alvo'} />}
            {letra && <Peca letra={letra} />}
            {k % 8 === 0 && <span className="coord linha">{nome[1]}</span>}
            {k >= 56 && <span className="coord coluna">{nome[0]}</span>}
          </div>
        );
      })}
      {promovendo && (
        <EscolherPromocao
          lado={vez}
          coluna={posicaoDe(promovendo.para) % 8}
          deCima={posicaoDe(promovendo.para) < 8}
          casa={casa}
          onEscolher={(p) => { onLance?.(promovendo.de, promovendo.para, p); setPromovendo(null); setEscolhida(null); }}
          onDesistir={() => setPromovendo(null)}
        />
      )}
    </div>
  );
}

/** As quatro peças da promoção, em coluna sobre a casa de chegada, a partir da borda. */
function EscolherPromocao({ lado, coluna, deCima, casa, onEscolher, onDesistir }: {
  lado: Lado; coluna: number; deCima: boolean; casa: number;
  onEscolher: (p: Promocao) => void;
  onDesistir: () => void;
}) {
  useFecharComEsc(onDesistir);
  const ordem: Promocao[] = ['q', 'n', 'r', 'b'];
  return (
    <>
      <div className="promocao-fundo" onClick={onDesistir} />
      <div className="promocao" style={{ left: coluna * casa, top: deCima ? 0 : casa * 4, width: casa }}>
        {(deCima ? ordem : [...ordem].reverse()).map((p) => (
          <button key={p} type="button" className="promocao-peca" style={{ height: casa }}
            title={NOME_DA_PROMOCAO[p]} onClick={() => onEscolher(p)}>
            <Peca letra={lado === 'w' ? p.toUpperCase() : p} />
          </button>
        ))}
      </div>
    </>
  );
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { desenharQuadros, type DoOverlay, type ParaOverlay } from './quadros.ts';
import { esticarJanela } from './overlayJanela.ts';
import type { Quina } from './flutuante.ts';
import { Icon } from './components/Icon';
import { comoSeLe } from './atalho.ts';

/**
 * O overlay da live: a janela que fica por cima do jogo.
 *
 * É uma página à parte, e não um pedaço do app, porque ela vive numa JANELA à parte — sem
 * moldura, acima de tudo e deixando o clique atravessar. Ela não fala com o servidor nem
 * sabe de sala, cargo ou call: recebe quadros da janela do app e desenha. Se o app fechar,
 * ela fecha junto.
 *
 * O desenho é o que o dono escolheu entre três, renderizados antes do código: só a imagem,
 * com um selo pequeno dizendo de quem é a live. Nome e botões maiores só quando ela está
 * destravada — jogando, o que se quer ver é o jogo e a imagem, e mais nada.
 */

/** Quanto o mouse precisa parar quieto para os controles sumirem. */
const SOME_EM = 2500;

function Overlay() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [nome, setNome] = useState('');
  const [temImagem, setTemImagem] = useState(false);
  const [travado, setTravado] = useState(true);
  const [mudo, setMudo] = useState(false);
  const [atalho, setAtalho] = useState('');
  const [mouse, setMouse] = useState(false);
  const pararDeDesenhar = useRef<null | (() => void)>(null);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Os quadros chegam da janela do app, um stream de cada vez: trocar de live manda um
  // stream novo, e o anterior é cancelado aqui.
  useEffect(() => {
    const ouvir = (e: MessageEvent<ParaOverlay>) => {
      const recado = e.data;
      if (!recado || typeof recado !== 'object') return;
      if (recado.tipo === 'quem') { setNome(recado.nome); return; }
      if (recado.tipo === 'mudo') { setMudo(recado.mudo); return; }
      if (recado.tipo === 'semLive') {
        // A transmissão acabou. A janela fica, dizendo que está vazia — é aqui que a
        // próxima aparece, no tamanho e no canto em que a pessoa a deixou.
        pararDeDesenhar.current?.();
        pararDeDesenhar.current = null;
        setTemImagem(false);
        setNome('');
        return;
      }
      if (recado.tipo !== 'live') return;
      setNome(recado.nome);
      pararDeDesenhar.current?.();
      setTemImagem(false);
      if (canvas.current) {
        pararDeDesenhar.current = desenharQuadros(recado.leitura, canvas.current, () => setTemImagem(true));
      }
    };
    window.addEventListener('message', ouvir);
    // "Estou de pé": sem isso o app mandaria os quadros antes de haver quem os lesse.
    const pronto: DoOverlay = { tipo: 'pronto' };
    window.opener?.postMessage(pronto, '*');
    return () => {
      window.removeEventListener('message', ouvir);
      pararDeDesenhar.current?.();
    };
  }, []);

  // Travado é o estado normal, e quem manda nele é o processo principal — o atalho é
  // global, então ele pode mudar sem ninguém tocar nesta janela.
  useEffect(() => {
    const solta = window.desktop.overlay.aoTravar(setTravado);
    window.desktop.overlay.estado().then((e) => { setTravado(e.travado); setAtalho(e.atalho); }).catch(() => {});
    return solta;
  }, []);

  /** Os controles aparecem com o mouse e somem sozinhos, como os da live no palco. */
  const mostrar = useCallback(() => {
    setMouse(true);
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => setMouse(false), SOME_EM);
  }, []);

  // O atalho pode ter mudado em "Sua conta" com esta janela aberta: relê quando ele vai
  // aparecer, em vez de guardar para sempre o que valia na hora de abrir.
  useEffect(() => {
    if (!mouse) return;
    window.desktop.overlay.estado().then((e) => setAtalho(e.atalho)).catch(() => {});
  }, [mouse]);

  const pegarQuina = (quina: Quina) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // As contas são em coordenadas de TELA: a janela inteira anda, não um elemento dentro
    // dela. `screenX/screenY` são as únicas que não mudam quando a própria janela muda.
    const inicio = { x: window.screenX, y: window.screenY, width: window.outerWidth, height: window.outerHeight };
    const px = e.screenX;
    const py = e.screenY;
    const mover = (ev: PointerEvent) => {
      window.desktop.overlay.redimensionar(esticarJanela(inicio, quina, ev.screenX - px, ev.screenY - py));
    };
    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  };

  const controles = !travado && mouse;

  return (
    <div
      className={`overlay ${travado ? 'travado' : 'destravado'}`}
      onMouseMove={mostrar}
      onMouseLeave={() => setMouse(false)}
    >
      <canvas ref={canvas} className="overlay-imagem" />
      {!temImagem && <div className="overlay-esperando">{nome ? 'esperando a imagem…' : 'nenhuma live agora'}</div>}

      {/* O selo fica SEMPRE: travado, ele é a única coisa que diz de quem é a tela que
          você está vendo — e é para isso que o quadro está ali. */}
      <span className="overlay-selo"><span className="ponto" />{nome || 'live'}</span>

      {controles && (
        <div className="overlay-controles">
          <button
            type="button"
            className={`overlay-icone ${mudo ? 'ligado' : ''}`}
            title={mudo ? 'Ouvir de novo' : 'Tirar o som desta live'}
            onClick={() => {
              const recado: DoOverlay = { tipo: 'mudo' };
              window.opener?.postMessage(recado, '*');
            }}
          >
            <Icon name={mudo ? 'speakerOff' : 'speaker'} size={16} />
          </button>
          <button type="button" className="overlay-icone" title="Fechar o overlay (a live continua na Saga)"
            onClick={() => window.close()}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {!travado && (
        <>
          {/* Só destravado: travado o clique atravessa, e uma quina que não recebe clique
              é tinta pedindo gesto que não acontece. */}
          {(['nw', 'ne', 'sw', 'se'] as Quina[]).map((q) => (
            <span key={q} className={`overlay-quina ${q}`} onPointerDown={pegarQuina(q)} />
          ))}
          {mouse && atalho && (
            <span className="overlay-dica">{comoSeLe(atalho, window.desktop.platform === 'darwin')} trava</span>
          )}
        </>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Overlay />
  </React.StrictMode>,
);

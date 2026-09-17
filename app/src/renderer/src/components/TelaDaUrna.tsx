import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { apuracaoDaUrna, votarNaUrna, type ApuracaoDaUrna } from '../api';
import { anotar } from '../registro';
import { criarQuadro } from '../dragao/quadro';
import { desenharApuracao } from '../urna/apuracao';
import { desenharCabine } from '../urna/cabine';
import { H, W, regiaoEm, type Regiao } from '../urna/comum';
import {
  agir, alternarCola, andar, animando, avancar, comandoDaTecla, dicaDaSecao, escolherNaApuracao, falaDaMesa,
  novoEstado, passoDoDesenho, teclar, voltar, type Som,
} from '../urna/jogo';
import { desenharSecao } from '../urna/secao';
import somDaTecla from '../urna/sons/tecla.ogg';
import somDoFim from '../urna/sons/fim.ogg';

/**
 * A Urna: a seção eleitoral, a urna em primeira pessoa e a apuração, numa canvas só, como o Dragão
 * Quadrado. É um jogo de uma pessoa — o que é de todos é a apuração, que soma a Saga inteira e,
 * enquanto está na tela, é buscada de novo a cada 3 s para os votos dos outros aparecerem.
 *
 * Nada anima sozinho: o laço só roda enquanto o bonequinho anda, uma tecla sobe ou o FIM conta; o
 * cursor da urna pisca num relógio de meio segundo só dentro da cabine.
 */
export function TelaDaUrna({ servidorId, euId, apelido, surdo, live, onFechar }: {
  servidorId: number;
  euId: number;
  apelido: string;
  surdo: boolean;
  live?: ReactNode;
  onFechar: () => void;
}) {
  const e = useRef(novoEstado()).current;
  const [versao, redesenhar] = useReducer((n: number) => n + 1, 0);
  const quadro = useMemo(() => criarQuadro(W, H), []);
  const regioes = useRef<Regiao[]>([]);
  const [apuracao, setApuracao] = useState<ApuracaoDaUrna | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [piscar, setPiscar] = useState(true);
  const seguradas = useRef(new Set<string>());
  /** Para onde o clique mandou andar. */
  const destino = useRef<number | null>(null);
  const fechar = useRef(onFechar);
  fechar.current = onFechar;
  const surdoRef = useRef(surdo);
  surdoRef.current = surdo;
  // A inscrição do título sai da conta: a mesma pessoa tem sempre o mesmo título.
  const inscricao = `${String((euId * 7919) % 10000).padStart(4, '0')} ${String((euId * 104729) % 10000).padStart(4, '0')} 2026`;

  const tocar = (som: Som | null) => {
    if (!som || surdoRef.current) return;
    const audio = new Audio(som === 'fim' ? somDoFim : somDaTecla);
    audio.volume = som === 'fim' ? 0.9 : 0.8;
    audio.play().catch((erro) => anotar('erro', 'som', `o som "${som}" da urna não tocou: ${(erro as Error)?.message ?? erro}`));
  };

  /** Manda o voto que o CONFIRMA deixou pendente. */
  const mandarVoto = () => {
    if (e.voto === null) return;
    const voto = e.voto;
    e.voto = null;
    setAviso(null);
    votarNaUrna(voto, servidorId)
      .then(setApuracao)
      .catch((erro) => {
        // Voto que não entrou não pode aparecer como contado: o "você votou" volta.
        e.votos = Math.max(0, e.votos - 1);
        setAviso((erro as Error)?.message ?? 'O voto não chegou ao servidor.');
      });
  };

  // ---- o laço: só enquanto algo se mexe
  const laco = useRef<number | null>(null);
  const antes = useRef(0);
  const passo = (agora: number) => {
    const dt = Math.min(0.05, (agora - antes.current) / 1000);
    antes.current = agora;
    const s = seguradas.current;
    let direcao = ((s.has('ArrowRight') || s.has('KeyD') ? 1 : 0) - (s.has('ArrowLeft') || s.has('KeyA') ? 1 : 0)) as -1 | 0 | 1;
    if (direcao === 0 && destino.current !== null) {
      const falta = destino.current - e.x;
      if (Math.abs(falta) <= 2 || falaDaMesa(e)) destino.current = null;
      else direcao = falta > 0 ? 1 : -1;
    }
    andar(e, direcao, dt);
    avancar(e, dt);
    mandarVoto();
    redesenhar();
    if (animando(e) || direcao !== 0) laco.current = requestAnimationFrame(passo);
    else laco.current = null;
  };
  const acordar = () => {
    if (laco.current !== null) return;
    antes.current = performance.now();
    laco.current = requestAnimationFrame(passo);
  };
  useEffect(() => () => { if (laco.current !== null) cancelAnimationFrame(laco.current); }, []);

  /** Depois de qualquer comando: fechar, mandar voto, redesenhar e acordar o laço se precisar. */
  const depois = () => {
    if (e.saiu) { fechar.current(); return; }
    mandarVoto();
    redesenhar();
    if (animando(e) || destino.current !== null) acordar();
  };

  // ---- o teclado
  useEffect(() => {
    const campo = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
    const desce = (ev: KeyboardEvent) => {
      if (campo(ev.target) || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const c = comandoDaTecla(e.fase, ev.code);
      if (!c) return;
      ev.preventDefault();
      if (c.tipo === 'andar') { destino.current = null; seguradas.current.add(ev.code); acordar(); return; }
      if (ev.repeat) return;
      if (c.tipo === 'agir') agir(e);
      else if (c.tipo === 'tecla') tocar(teclar(e, c.tecla));
      else if (c.tipo === 'cola') alternarCola(e);
      else if (c.tipo === 'voltar') voltar(e);
      else if (c.tipo === 'escolher') escolherNaApuracao(e, c.qual);
      depois();
    };
    const sobe = (ev: KeyboardEvent) => { seguradas.current.delete(ev.code); };
    const soltar = () => seguradas.current.clear();
    window.addEventListener('keydown', desce);
    window.addEventListener('keyup', sobe);
    window.addEventListener('blur', soltar);
    return () => {
      window.removeEventListener('keydown', desce);
      window.removeEventListener('keyup', sobe);
      window.removeEventListener('blur', soltar);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- o cursor da urna pisca só dentro da cabine
  const naCabine = e.fase === 'cabine';
  useEffect(() => {
    if (!naCabine) return;
    const id = setInterval(() => setPiscar((p) => !p), 500);
    return () => clearInterval(id);
  }, [naCabine]);

  // ---- a apuração: busca ao abrir, e de 3 em 3 s enquanto está na tela
  const naApuracao = e.fase === 'apuracao';
  useEffect(() => {
    let vivo = true;
    const buscar = () => apuracaoDaUrna(servidorId).then((a) => { if (vivo) setApuracao(a); }).catch(() => {});
    buscar();
    if (!naApuracao) return () => { vivo = false; };
    const id = setInterval(buscar, 3000);
    return () => { vivo = false; clearInterval(id); };
  }, [servidorId, naApuracao]);

  // ---- o palco: a canvas do tamanho do jogo, ampliada em múltiplo inteiro quando não desperdiça muito
  const canvas = useRef<HTMLCanvasElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const div = caixa.current, c = canvas.current;
    if (!div || !c) return;
    const ajustar = () => {
      const k = Math.min(div.clientWidth / W, div.clientHeight / H);
      const escala = Math.floor(k) >= 1 && Math.floor(k) >= k * 0.85 ? Math.floor(k) : k;
      c.style.width = `${Math.floor(W * escala)}px`;
      c.style.height = `${Math.floor(H * escala)}px`;
    };
    ajustar();
    const obs = new ResizeObserver(ajustar);
    obs.observe(div);
    return () => obs.disconnect();
  }, []);

  // ---- o desenho
  useLayoutEffect(() => {
    if (e.fase === 'secao') {
      regioes.current = desenharSecao(quadro, {
        x: e.x, passo: passoDoDesenho(e), virado: e.virado, comTitulo: e.etapa === 'pedindo',
        dica: dicaDaSecao(e), fala: falaDaMesa(e), votou: e.votos > 0,
        titulo: e.etapa === 'titulo' ? { apelido, inscricao } : null,
      });
    } else if (e.fase === 'cabine') {
      regioes.current = desenharCabine(quadro, { visor: e.visor, piscar, apertada: e.apertada, dedo: e.dedo, cola: e.cola });
    } else {
      regioes.current = desenharApuracao(quadro, {
        contagem: apuracao?.contagem ?? [], meus: apuracao?.meus ?? e.votos, selecionado: e.selecionado,
        carregando: !apuracao, aviso,
      });
    }
    const c = canvas.current;
    if (!c) return;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(quadro.px.buffer as ArrayBuffer, quadro.px.byteOffset, quadro.px.byteLength), W, H), 0, 0);
  }, [versao, piscar, apuracao, aviso]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- o mouse: na urna e na apuração, pelas regiões do desenho; na seção, clicar é andar até ali
  const pontoNoJogo = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    return [((ev.clientX - r.left) * W) / r.width, ((ev.clientY - r.top) * H) / r.height] as const;
  };
  const apontar = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const [x, y] = pontoNoJogo(ev);
    ev.currentTarget.style.cursor = regiaoEm(regioes.current, x, y) || e.fase === 'secao' ? 'pointer' : 'default';
  };
  const clicar = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const [x, y] = pontoNoJogo(ev);
    const reg = regiaoEm(regioes.current, x, y);
    if (reg) {
      const a = reg.alvo;
      if (a.tipo === 'tecla') tocar(teclar(e, a.tecla));
      else if (a.tipo === 'cola') alternarCola(e);
      else if (a.tipo === 'votarDeNovo') { escolherNaApuracao(e, 0); agir(e); }
      else if (a.tipo === 'sair') { escolherNaApuracao(e, 1); agir(e); }
    } else if (e.fase === 'secao') {
      // Com fala aberta, ou clicando perto de onde já está, o clique é o ESPAÇO; senão, é andar.
      if (falaDaMesa(e) || e.etapa === 'titulo' || dicaDaSecao(e) && Math.abs(x - e.x) < 24) agir(e);
      else destino.current = Math.round(x);
    }
    depois();
  };

  return (
    <div className="tela-da-urna">
      <div ref={caixa} className="luta-palco">
        <canvas ref={canvas} className="luta-canvas" width={W} height={H} onMouseMove={apontar} onClick={clicar} />
      </div>
      {live && <div className="xadrez-live">{live}</div>}
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { BALCOES, Garagem, HARLEY, LIMITE_DA_BARRIGA, SAHARA, type Ocorrencia, type Ponto } from '../garagem';
import { criarDesenho, type Desenho } from '../desenhoDaGaragem';
import { cantarParabens, tocarNaGaragem } from '../somDaGaragem';
import { cantarParabensNaGaragem, estarNaGaragem, sairDaGaragem } from '../api';

/** De quanto em quanto o seu boneco vai ao servidor (e volta a garagem inteira). */
const INTERVALO = 350;
/** Andando com as setas, o alvo muda a cada quadro: manda no máximo isto por segundo. */
const MENOR_ENTRE_ENVIOS = 120;

const em = (q: Ponto, k: { x1: number; x2: number; y1: number; y2: number }) => q.x >= k.x1 && q.x <= k.x2 && q.y >= k.y1 && q.y <= k.y2;
const TECLAS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1],
};

/**
 * A Garagem na tela: a cena de pixel no palco, como a partida de xadrez, e na barra de cima o que se
 * faz com a mão — a barriga, as luzes, sair e, só para o dono da Saga, o parabéns. A regra é do
 * `garagem.ts`, o desenho do `desenhoDaGaragem.ts`, o som do `somDaGaragem.ts`; aqui só se liga um
 * ao outro: o laço de quadros, a ida ao servidor e o mouse e o teclado.
 */
export function TelaDaGaragem({ servidorId, euId, nome, surdo, onFechar, onAviso }: {
  servidorId: number;
  euId: number;
  /** O seu nome neste servidor, até a primeira leitura trazer o que o servidor sabe. */
  nome: string;
  surdo: boolean;
  onFechar: () => void;
  onAviso: (tipo: 'erro' | 'info', texto: string) => void;
}) {
  const garagemRef = useRef<Garagem | null>(null);
  garagemRef.current ??= new Garagem(euId, nome);
  const garagem = garagemRef.current;
  const tela = useRef<HTMLCanvasElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const desenho = useRef<Desenho | null>(null);
  const enviar = useRef<(() => void) | null>(null);
  const ultimoEnvio = useRef(0);
  const teclas = useRef(new Set<string>());
  const pararCanto = useRef<(() => void) | null>(null);
  const surdoRef = useRef(surdo);
  surdoRef.current = surdo;
  const luzesRef = useRef(false);
  const fechar = useRef(onFechar);
  fechar.current = onFechar;
  const avisar = useRef(onAviso);
  avisar.current = onAviso;

  const [luzes, setLuzes] = useState(false);
  const [barra, setBarra] = useState({ podeCantar: false, festa: false, cheio: 0, quantos: 1 });
  const [falhou, setFalhou] = useState<string | null>(null);
  const [tamanho, setTamanho] = useState({ w: 640, h: 360 });

  // Fone desligado no meio da música: ela para na hora, como o resto do som da Saga.
  useEffect(() => { if (surdo) { pararCanto.current?.(); pararCanto.current = null; } }, [surdo]);

  // A letra de pixel da cena: o canvas não espera a fonte carregar sozinho.
  useEffect(() => { void document.fonts?.load('700 16px "Pixelify Sans"').catch(() => undefined); }, []);

  // A ida ao servidor: o seu boneco vai, a garagem inteira volta.
  useEffect(() => {
    let vivo = true;
    let indo = false;
    let deNovo = false;
    const ir = async () => {
      if (!vivo) return;
      if (indo) { deNovo = true; return; }
      indo = true;
      garagem.mudouMeuAlvo = false;
      ultimoEnvio.current = performance.now();
      try {
        const l = await estarNaGaragem(garagem.meuBoneco(), servidorId);
        if (!vivo) return;
        garagem.receber(l);
        setFalhou(null);
      } catch (e) {
        if (!vivo) return;
        // Servidor de antes da Garagem: a rota não existe.
        if ((e as { status?: number }).status === 404) {
          vivo = false;
          avisar.current('erro', 'A Garagem ainda não chegou a este servidor.');
          fechar.current();
          return;
        }
        setFalhou((e as Error).message);
      } finally {
        indo = false;
        if (deNovo && vivo) { deNovo = false; void ir(); }
      }
    };
    enviar.current = () => { void ir(); };
    void ir();
    const id = setInterval(() => void ir(), INTERVALO);
    return () => {
      vivo = false;
      clearInterval(id);
      enviar.current = null;
      void sairDaGaragem(servidorId).catch(() => undefined);
    };
  }, [garagem, servidorId]);

  // A cena cabe no palco inteiro, sempre em 16:9.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const medir = () => {
      const { width, height } = el.getBoundingClientRect();
      const w = Math.max(320, Math.min(width - 32, (height - 56) * 16 / 9));
      setTamanho({ w: Math.floor(w), h: Math.floor(w * 9 / 16) });
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  useEffect(() => { desenho.current?.redimensionar(); }, [tamanho]);

  // O laço de quadros.
  useEffect(() => {
    const canvas = tela.current;
    if (!canvas) return;
    const d = criarDesenho(canvas);
    desenho.current = d;
    d.redimensionar();
    const tocar = (o: Ocorrencia) => {
      if (surdoRef.current) return;
      if (o.tipo === 'gole' || o.tipo === 'mordida') tocarNaGaragem(o.tipo, o.meu ? 1 : 0.5);
      else if (o.tipo === 'soluco' && o.meu) tocarNaGaragem('soluco');
      else if (o.tipo === 'desmaio') tocarNaGaragem('desmaio', o.meu ? 1 : 0.6);
      else if (o.tipo === 'canto') { pararCanto.current?.(); pararCanto.current = cantarParabens(o.aPartirDe); }
      else if (o.tipo === 'fimDoCanto') pararCanto.current = null;
    };
    let antes = performance.now();
    let id = 0;
    const mostrado = { podeCantar: false, festa: false, cheio: 0, quantos: 1 };
    const quadro = (agora: number) => {
      const dt = Math.min(0.05, (agora - antes) / 1000);
      antes = agora;
      let vx = 0, vy = 0;
      for (const k of teclas.current) { const v = TECLAS[k]; if (v) { vx += v[0]; vy += v[1]; } }
      garagem.andarComTeclas(vx, vy);
      garagem.passo(dt);
      for (const o of garagem.colher()) { d.ocorreu(o); tocar(o); }
      if (garagem.mudouMeuAlvo && agora - ultimoEnvio.current > MENOR_ENTRE_ENVIOS) enviar.current?.();
      d.desenhar(garagem, dt, luzesRef.current);
      const agoraNaBarra = { podeCantar: garagem.podeCantar, festa: garagem.mesaNaTela, cheio: garagem.eu.cheio, quantos: garagem.bonecos.size };
      if (Object.entries(agoraNaBarra).some(([k, v]) => mostrado[k as keyof typeof mostrado] !== v)) {
        Object.assign(mostrado, agoraNaBarra);
        setBarra(agoraNaBarra);
      }
      id = requestAnimationFrame(quadro);
    };
    id = requestAnimationFrame(quadro);
    return () => {
      cancelAnimationFrame(id);
      desenho.current = null;
      pararCanto.current?.();
      pararCanto.current = null;
    };
  }, [garagem]);

  const clicar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = desenho.current;
    if (!d) return;
    e.currentTarget.focus({ preventScroll: true });
    const q = d.pontoDe(e);
    for (const [moto, caixa] of [['harley', HARLEY], ['sahara', SAHARA]] as const) {
      if (em(q, caixa) && !BALCOES.some((b) => em(q, b))) {
        if (d.acelerar(moto) && !surdoRef.current) tocarNaGaragem(moto);
        return;
      }
    }
    garagem.clicar(q);
  };
  const cursor = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const q = desenho.current?.pontoDe(e);
    if (!q) return;
    e.currentTarget.style.cursor = [HARLEY, SAHARA, ...BALCOES].some((k) => em(q, k)) ? 'pointer' : 'default';
  };
  const tecla = (e: React.KeyboardEvent, apertou: boolean) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!TECLAS[k]) return;
    e.preventDefault();
    if (apertou) teclas.current.add(k); else teclas.current.delete(k);
  };

  const cantar = () => {
    cantarParabensNaGaragem(servidorId)
      .then((l) => garagem.receber(l))
      .catch((e) => avisar.current('erro', (e as Error).message));
  };

  return (
    <div className="tela-da-garagem">
      <header className="stage-head">
        <Icon name="controle" />
        <span className="strong">Garagem</span>
        <span className="garagem-quantos">{barra.quantos === 1 ? 'só você aqui' : `${barra.quantos} aqui`}</span>
        <div className="garagem-acoes">
          <span className="garagem-barriga" title="No sexto gole ou mordida, o boneco desmaia.">
            Barriga
            <span className="gomos">
              {Array.from({ length: LIMITE_DA_BARRIGA }, (_, i) => (
                <i key={i} className={i < barra.cheio ? (barra.cheio >= LIMITE_DA_BARRIGA - 1 ? 'cheio quase' : 'cheio') : ''} />
              ))}
            </span>
          </span>
          <button type="button" className="secundario sm garagem-luzes" aria-pressed={luzes}
            onClick={() => { luzesRef.current = !luzes; setLuzes(!luzes); }}>Luzes</button>
          {barra.podeCantar && (
            <button type="button" className="primary sm" disabled={barra.festa} onClick={cantar}>Cantar parabéns</button>
          )}
          <button type="button" className="secundario sm" onClick={onFechar}>Sair</button>
        </div>
      </header>
      <div className="garagem-area" ref={area}>
        <canvas
          ref={tela}
          className="garagem-tela"
          style={{ width: tamanho.w, height: tamanho.h }}
          tabIndex={0}
          aria-label="A garagem: as motos, o isopor, a mesa de salgados e os bonecos de quem está aqui"
          onPointerDown={clicar}
          onPointerMove={cursor}
          onKeyDown={(e) => tecla(e, true)}
          onKeyUp={(e) => tecla(e, false)}
          onBlur={() => teclas.current.clear()}
        />
        <p className={`garagem-dica ${falhou ? 'erro' : ''}`}>
          {falhou
            ? `Sem resposta do servidor (${falhou}). Tentando de novo…`
            : 'Clique no chão para andar (ou use as setas). No isopor você bebe, na mesa de salgados você come — no sexto, desmaia. Clique numa moto para acelerar.'}
        </p>
      </div>
    </div>
  );
}

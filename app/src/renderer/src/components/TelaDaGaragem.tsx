import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import {
  BALCOES, FLIPERAMAS, Garagem, LIMITE_DA_BARRIGA, MAX_ANIVERSARIANTES, MAX_NOME_NO_TELAO, PECAS, TEMAS, TONTO,
  naCaixa, type Aniversariante, type Lado, type Ocorrencia,
} from '../garagem';
import { criarDesenho, type Desenho } from '../desenhoDaGaragem';
import { criarDesenhoDaNavinha, CAMPO_X } from '../desenhoDaNavinha';
import { Navinha, entraNoPlacar, type Comandos } from '../navinha';
import { cantarParabens, tocarNaGaragem } from '../somDaGaragem';
import { useFecharComEsc } from '../useFechar';
import {
  cantarParabensNaGaragem, estarNaGaragem, prepararFestaNaGaragem, recordeNaGaragem, sairDaGaragem,
} from '../api';

/** De quanto em quanto o seu boneco vai ao servidor (e volta a garagem inteira). */
const INTERVALO = 350;
/** Andando com as setas, o alvo muda a cada quadro: manda no máximo isto por segundo. */
const MENOR_ENTRE_ENVIOS = 120;
/** Mexeu no painel da festa: espera a mão parar antes de mandar (digitar o nome manda a cada letra). */
const ESPERA_DO_PREPARO = 500;

const TECLAS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1],
};
const ATIRAR = new Set([' ', 'ArrowUp', 'w', 'Enter']);

export type PessoaDaFesta = { id: number; nome: string; foto: string | null };

/**
 * O painel da festa, só na conta do dono da Saga: quem faz aniversário (até dois), o nome de cada um
 * no telão e o tema de cada um. Mexer aqui já muda a garagem de todo mundo — o tema é a decoração —,
 * mas os nomes ficam no servidor até o dono mandar cantar.
 */
function PainelDaFesta({ pessoas, naGaragem, preparo, festa, onMudar, onCantar, onFechar }: {
  pessoas: PessoaDaFesta[];
  naGaragem: Set<number>;
  preparo: Aniversariante[];
  festa: boolean;
  onMudar: (a: Aniversariante[]) => void;
  onCantar: () => void;
  onFechar: () => void;
}) {
  useFecharComEsc(onFechar);
  const escolhidos = new Set(preparo.map((a) => a.id));
  // Quem está na garagem vem primeiro (é quem vai para trás da mesa); a ordem não muda ao escolher,
  // senão a etiqueta clicada pularia de lugar debaixo do mouse.
  const ordem = useMemo(() => [...pessoas].sort((a, b) =>
    Number(naGaragem.has(b.id)) - Number(naGaragem.has(a.id)) || a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })), [pessoas, naGaragem]);
  const alternar = (p: PessoaDaFesta) => {
    if (escolhidos.has(p.id)) onMudar(preparo.filter((a) => a.id !== p.id));
    else if (preparo.length < MAX_ANIVERSARIANTES) {
      onMudar([...preparo, { id: p.id, nome: p.nome.slice(0, MAX_NOME_NO_TELAO), tema: preparo[0]?.tema ?? 'moto' }]);
    }
  };
  const mudar = (i: number, m: Partial<Aniversariante>) => onMudar(preparo.map((a, k) => (k === i ? { ...a, ...m } : a)));
  const ladoDe = (i: number) => (preparo.length === 1 ? 'a garagem inteira' : i === 0 ? 'o lado esquerdo' : 'o lado direito');
  return (
    <div className="garagem-festa" role="dialog" aria-label="Preparar a festa">
      <div className="garagem-festa-topo">
        <h3>Preparar a festa</h3>
        <button type="button" className="garagem-festa-fechar" aria-label="Fechar" onClick={onFechar}><Icon name="close" /></button>
      </div>
      <p className="garagem-festa-nota">
        Só você vê isto. O tema já enfeita a garagem de todo mundo; os nomes só aparecem quando você mandar cantar.
      </p>
      <span className="garagem-festa-rotulo">Quem faz aniversário <i>até {MAX_ANIVERSARIANTES} · o ponto verde está na garagem</i></span>
      <div className="garagem-festa-pessoas" role="group" aria-label="Quem faz aniversário">
        {ordem.map((p) => {
          const marcado = escolhidos.has(p.id);
          return (
            <button key={p.id} type="button" className="garagem-festa-pessoa" aria-pressed={marcado}
              title={naGaragem.has(p.id) ? `${p.nome} está na garagem` : `${p.nome} não está na garagem agora`}
              disabled={!marcado && preparo.length >= MAX_ANIVERSARIANTES} onClick={() => alternar(p)}>
              <Avatar nome={p.nome} foto={p.foto} />
              <span className="nome">{p.nome}</span>
              {naGaragem.has(p.id) && <i className="aqui" aria-label="na garagem" />}
            </button>
          );
        })}
      </div>
      {preparo.map((a, i) => (
        <div key={a.id} className="garagem-festa-aniversariante">
          <div className="garagem-festa-quem">
            <span className="numero">{i + 1}</span>
            <span className="nome">{pessoas.find((p) => p.id === a.id)?.nome ?? a.nome}</span>
            <span className="lado">{ladoDe(i)}</span>
          </div>
          <label className="garagem-festa-campo">
            <span>Nome no telão</span>
            <input value={a.nome} maxLength={MAX_NOME_NO_TELAO} onChange={(e) => mudar(i, { nome: e.target.value })} />
          </label>
          <div className="garagem-festa-temas" role="radiogroup" aria-label={`Tema de ${a.nome}`}>
            {TEMAS.map((t) => (
              <button key={t.tema} type="button" role="radio" aria-checked={a.tema === t.tema} onClick={() => mudar(i, { tema: t.tema })}>
                {t.nome}
              </button>
            ))}
          </div>
        </div>
      ))}
      {!preparo.length && <p className="garagem-festa-vazio">Escolha uma ou duas pessoas para o parabéns.</p>}
      <div className="garagem-festa-pe">
        <button type="button" className="primary sm" disabled={festa || !preparo.length || preparo.some((a) => !a.nome.trim())} onClick={onCantar}>
          Cantar parabéns
        </button>
      </div>
    </div>
  );
}

/**
 * A Garagem na tela: a cena de pixel no palco, como a partida de xadrez, e na barra de cima o que se
 * faz com a mão — a barriga, as luzes, sair e, só para o dono da Saga, a festa. A regra é do
 * `garagem.ts`, o desenho do `desenhoDaGaragem.ts`, o som do `somDaGaragem.ts`, o fliperama do
 * `navinha.ts`; aqui só se liga um ao outro: o laço de quadros, a ida ao servidor e o mouse e o teclado.
 *
 * Não há porta: cada um entra como ele mesmo (o dono, 27/10/2026, trocou a escolha de Tavão e Donis
 * pela festa que ele prepara). Chegando a um fliperama, a cena dá lugar à tela dele até a pessoa sair.
 */
export function TelaDaGaragem({ servidorId, euId, nome, pessoas, surdo, onFechar, onAviso }: {
  servidorId: number;
  euId: number;
  /** O seu nome neste servidor, até a primeira leitura trazer o que o servidor sabe. */
  nome: string;
  /** Quem é deste servidor: é de onde o dono escolhe quem faz aniversário. */
  pessoas: PessoaDaFesta[];
  surdo: boolean;
  onFechar: () => void;
  onAviso: (tipo: 'erro' | 'info', texto: string) => void;
}) {
  const garagemRef = useRef<Garagem | null>(null);
  garagemRef.current ??= new Garagem(euId, nome);
  const garagem = garagemRef.current;
  const navinhaRef = useRef<Navinha | null>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const desenho = useRef<Desenho | null>(null);
  const enviar = useRef<(() => void) | null>(null);
  const ultimoEnvio = useRef(0);
  const teclas = useRef(new Set<string>());
  const mouse = useRef<{ x: number | null; atirando: boolean; quando: number }>({ x: null, atirando: false, quando: 0 });
  const recordeNovo = useRef(false);
  const pararCanto = useRef<(() => void) | null>(null);
  const surdoRef = useRef(surdo);
  surdoRef.current = surdo;
  const luzesRef = useRef(false);
  const fechar = useRef(onFechar);
  fechar.current = onFechar;
  const avisar = useRef(onAviso);
  avisar.current = onAviso;

  const [luzes, setLuzes] = useState(false);
  const [barra, setBarra] = useState({ podeCantar: false, festa: false, cheio: 0, quantos: 0, jogando: null as number | null });
  const [falhou, setFalhou] = useState<string | null>(null);
  const [tamanho, setTamanho] = useState({ w: 640, h: 360 });
  const [painel, setPainel] = useState(false);
  /** O que o dono está mexendo no painel: vale o daqui até o servidor confirmar. */
  const [preparo, setPreparo] = useState<Aniversariante[] | null>(null);
  const [naGaragem, setNaGaragem] = useState<Set<number>>(new Set());
  const esperaDoPreparo = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fone desligado no meio da música: ela para na hora, como o resto do som da Saga.
  useEffect(() => { if (surdo) { pararCanto.current?.(); pararCanto.current = null; } }, [surdo]);

  // As letras da cena: o canvas não espera a fonte carregar sozinho.
  useEffect(() => {
    void document.fonts?.load('500 16px "Pixelify Sans"').catch(() => undefined);
    void document.fonts?.load('750 16px Figtree').catch(() => undefined);
  }, []);

  // A ida ao servidor: o seu boneco vai e a garagem inteira volta.
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
        const ids = new Set(l.pessoas.map((p) => p.id));
        setNaGaragem((a) => (a.size === ids.size && [...ids].every((id) => a.has(id)) ? a : ids));
        setFalhou(null);
      } catch (e) {
        if (!vivo) return;
        const status = (e as { status?: number }).status;
        // Servidor de antes da Garagem: a rota não existe.
        if (status === 404) {
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

  // O laço de quadros: a garagem anda sempre; na tela, ela ou o fliperama.
  useEffect(() => {
    const canvas = tela.current;
    if (!canvas) return;
    const d = criarDesenho(canvas);
    const dn = criarDesenhoDaNavinha(canvas);
    desenho.current = d;
    d.redimensionar();
    const som = (s: Parameters<typeof tocarNaGaragem>[0], forca = 1) => { if (!surdoRef.current) tocarNaGaragem(s, forca); };
    const tocar = (o: Ocorrencia) => {
      if (o.tipo === 'consumo') som(o.comida === 'agua' ? 'agua' : o.comida === 'cerveja' || o.comida === 'refri' || o.comida === 'suco' ? 'gole' : 'mordida', o.meu ? 1 : 0.5);
      else if (o.tipo === 'soluco' && o.meu) som('soluco');
      else if (o.tipo === 'desmaio') som('desmaio', o.meu ? 1 : 0.6);
      else if (o.tipo === 'fliperama') {
        navinhaRef.current = o.qual === null ? null : new Navinha();
        recordeNovo.current = false;
        if (o.qual !== null) som('comecou');
      } else if (o.tipo === 'canto') {
        if (surdoRef.current) return;
        pararCanto.current?.(); pararCanto.current = cantarParabens(o.aPartirDe);
      } else if (o.tipo === 'fimDoCanto') pararCanto.current = null;
    };
    let antes = performance.now();
    let id = 0;
    const mostrado = { podeCantar: false, festa: false, cheio: 0, quantos: 0, jogando: null as number | null };
    const quadro = (agora: number) => {
      const dt = Math.min(0.05, (agora - antes) / 1000);
      antes = agora;
      const nav = navinhaRef.current;
      if (!nav) {
        let vx = 0, vy = 0;
        for (const k of teclas.current) { const v = TECLAS[k]; if (v) { vx += v[0]; vy += v[1]; } }
        garagem.andarComTeclas(vx, vy);
      }
      garagem.passo(dt);
      for (const o of garagem.colher()) { d.ocorreu(o); tocar(o); }
      if (garagem.mudouMeuAlvo && agora - ultimoEnvio.current > MENOR_ENTRE_ENVIOS) enviar.current?.();
      const qual = garagem.eu.jogando;
      const jogo = navinhaRef.current;
      if (jogo && qual !== null) {
        const t = teclas.current;
        const m = mouse.current;
        const c: Comandos = {
          esq: t.has('ArrowLeft') || t.has('a'), dir: t.has('ArrowRight') || t.has('d'),
          atirar: [...ATIRAR].some((k) => t.has(k)) || m.atirando,
          mirarX: m.x !== null && agora - m.quando < 1500 ? m.x : null,
        };
        jogo.tonto = garagem.eu.cheio >= TONTO;
        jogo.passo(dt, c);
        for (const e of jogo.colher()) {
          if (e === 'fim' && entraNoPlacar(garagem.recordes, jogo.pontos)) {
            recordeNovo.current = true;
            recordeNaGaragem(jogo.pontos, servidorId).then((r) => { garagem.recordes = r.recordes; }).catch(() => undefined);
          }
          if (e === 'comecou') recordeNovo.current = false;
          som(e, e === 'tiro' ? 0.6 : 1);
        }
        dn.desenhar(jogo, qual, garagem.recordes, recordeNovo.current, dt);
      } else d.desenhar(garagem, dt, luzesRef.current);
      const agoraNaBarra = { podeCantar: garagem.podeCantar, festa: garagem.mesaNaTela, cheio: garagem.eu.cheio, quantos: garagem.bonecos.size, jogando: qual };
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
  }, [garagem, servidorId]);

  const clicar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = desenho.current;
    if (!d) return;
    e.currentTarget.focus({ preventScroll: true });
    const q = d.pontoDe(e);
    if (navinhaRef.current) {
      mouse.current = { x: q.x - CAMPO_X, atirando: true, quando: performance.now() };
      return;
    }
    const emAlgo = [...BALCOES, ...FLIPERAMAS].some((k) => naCaixa(q, k));
    for (const lado of [0, 1] as Lado[]) {
      if (naCaixa(q, PECAS[lado]) && !emAlgo) {
        const acao = d.acelerar(lado, garagem.temas[lado]);
        if (acao && !surdoRef.current) tocarNaGaragem(acao.som);
        return;
      }
    }
    garagem.clicar(q);
  };
  const soltarMouse = () => { mouse.current.atirando = false; };
  const cursor = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const q = desenho.current?.pontoDe(e);
    if (!q) return;
    if (navinhaRef.current) {
      mouse.current = { ...mouse.current, x: q.x - CAMPO_X, quando: performance.now() };
      e.currentTarget.style.cursor = 'none';
      return;
    }
    const algo = [...PECAS, ...BALCOES, ...FLIPERAMAS].some((k) => naCaixa(q, k));
    e.currentTarget.style.cursor = algo ? 'pointer' : 'default';
  };
  const tecla = (e: React.KeyboardEvent, apertou: boolean) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (navinhaRef.current && k === 'Escape' && apertou) { e.preventDefault(); garagem.sairDoFliperama(); return; }
    if (!TECLAS[k] && !(navinhaRef.current && ATIRAR.has(k))) return;
    e.preventDefault();
    if (apertou) teclas.current.add(k); else teclas.current.delete(k);
    // As setas e o espaço fazem a nave andar: o mouse para de mandar até mexer de novo.
    if (navinhaRef.current) mouse.current.quando = 0;
  };

  const mandarPreparo = (a: Aniversariante[]) => {
    setPreparo(a);
    if (esperaDoPreparo.current) clearTimeout(esperaDoPreparo.current);
    esperaDoPreparo.current = setTimeout(() => {
      prepararFestaNaGaragem(a.map((k) => ({ ...k, nome: k.nome.trim() })).filter((k) => k.nome), servidorId)
        .then((l) => garagem.receber(l))
        .catch((e) => avisar.current('erro', (e as Error).message));
    }, ESPERA_DO_PREPARO);
  };
  const cantar = () => {
    const a = (preparo ?? garagem.preparo).map((k) => ({ ...k, nome: k.nome.trim() }));
    if (esperaDoPreparo.current) clearTimeout(esperaDoPreparo.current);
    setPainel(false);
    prepararFestaNaGaragem(a, servidorId)
      .then(() => cantarParabensNaGaragem(servidorId))
      .then((l) => garagem.receber(l))
      .catch((e) => avisar.current('erro', (e as Error).message));
  };

  const quantos = barra.quantos <= 1 ? 'só você aqui' : `${barra.quantos} aqui`;
  const jogando = barra.jogando !== null;

  return (
    <div className="tela-da-garagem">
      <header className="stage-head">
        <Icon name="controle" />
        <span className="strong">{jogando ? 'Fliperama' : 'Garagem'}</span>
        <span className="garagem-quantos">{jogando ? 'Navinha' : quantos}</span>
        <div className="garagem-acoes">
          {jogando ? (
            <button type="button" className="secundario sm" onClick={() => garagem.sairDoFliperama()}>Sair do fliperama</button>
          ) : (
            <>
              <span className="garagem-barriga" title="No sexto gole ou mordida, o boneco desmaia. A água do bebedouro esvazia um.">
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
                <div className="garagem-festa-ancora">
                  <button type="button" className="primary sm" aria-expanded={painel} disabled={barra.festa}
                    onClick={() => { setPreparo(null); setPainel(!painel); }}>Festa</button>
                  {painel && (
                    <PainelDaFesta
                      pessoas={pessoas}
                      naGaragem={naGaragem}
                      preparo={preparo ?? garagem.preparo}
                      festa={barra.festa}
                      onMudar={mandarPreparo}
                      onCantar={cantar}
                      onFechar={() => setPainel(false)}
                    />
                  )}
                </div>
              )}
              <button type="button" className="secundario sm" onClick={onFechar}>Sair</button>
            </>
          )}
        </div>
      </header>
      <div className="garagem-area" ref={area}>
        <div className="garagem-moldura" style={{ width: tamanho.w, height: tamanho.h }}>
          <canvas
            ref={tela}
            className="garagem-tela"
            tabIndex={0}
            aria-label={jogando
              ? 'O fliperama: a Navinha. Setas ou o mouse para mover, espaço ou clique para atirar, Esc para sair.'
              : 'A garagem: a decoração do tema, os fliperamas, o isopor, a mesa de salgados, o bebedouro e os bonecos de quem está aqui'}
            onPointerDown={clicar}
            onPointerUp={soltarMouse}
            onPointerLeave={soltarMouse}
            onPointerMove={cursor}
            onKeyDown={(e) => tecla(e, true)}
            onKeyUp={(e) => tecla(e, false)}
            onBlur={() => { teclas.current.clear(); soltarMouse(); }}
          />
        </div>
        <p className={`garagem-dica ${falhou ? 'erro' : ''}`}>
          {falhou
            ? `Sem resposta do servidor (${falhou}). Tentando de novo…`
            : jogando
              ? 'Setas ou o mouse movem a nave; espaço ou clique atiram. Esc sai do fliperama.'
              : 'Clique no chão para andar (ou use as setas). No isopor você bebe, na mesa de salgados você come — no sexto, desmaia; a água esvazia. Os fliperamas são para jogar; clique na decoração para ver o que ela faz.'}
        </p>
      </div>
    </div>
  );
}


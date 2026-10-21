import { useState } from 'react';
import type { ProgramaAberto } from '../desktop';
import { DE_ONDE, haQuantoTempo, type JogoVisto } from '../atividade';
import { haQuanto } from '../administracao';
import type { AtividadeDaTela } from '../useAtividade';
import { Linha, Pagina as Folha, Secao } from './Configuracoes';
import { IconeDoJogo } from './IconeDoJogo';

/**
 * Configurações › Atividade: mostrar ou não o jogo aberto, esconder um jogo, e apontar o que
 * a Saga não achou sozinha. Mora em "Este computador" porque é ESTE computador que vê o jogo —
 * os ajustes ficam nele (`cantinho.atividade`), como a escolha do microfone.
 *
 * Desenho escolhido pelo dono na prancheta de 20/10/2026.
 */
export function PaginaDaAtividade({ atividade }: { atividade: AtividadeDaTela }) {
  const { ajustes, mudarAjustes, jogo, vistos } = atividade;
  const [janelas, setJanelas] = useState<ProgramaAberto[] | null>(null);
  const [procurando, setProcurando] = useState(false);
  const [escolhido, setEscolhido] = useState<ProgramaAberto | null>(null);
  const [nome, setNome] = useState('');
  const agora = Date.now();

  const escondido = (chave: string) => ajustes.escondidos.includes(chave);
  const alternarEscondido = (chave: string) => mudarAjustes((a) => ({
    ...a,
    escondidos: a.escondidos.includes(chave) ? a.escondidos.filter((c) => c !== chave) : [...a.escondidos, chave],
  }));

  const procurar = async () => {
    setProcurando(true);
    setEscolhido(null);
    try { setJanelas(await atividade.janelas()); } finally { setProcurando(false); }
  };
  const adicionar = () => {
    if (!escolhido || !nome.trim()) return;
    const exe = escolhido.exe;
    mudarAjustes((a) => ({
      ...a,
      meus: [...a.meus.filter((m) => m.exe !== exe), { exe, nome: nome.trim() }],
      // Apontar de novo um programa escondido é querer que ele apareça.
      escondidos: a.escondidos.filter((c) => c !== `exe:${exe}`),
    }));
    setJanelas(null);
    setEscolhido(null);
  };

  const linhaDoJogo = (v: JogoVisto) => {
    const aberto = jogo?.chave === v.chave;
    const quando = aberto && jogo ? haQuantoTempo(jogo.desde, agora) : haQuanto(v.vistoEm, agora);
    return (
      <div key={v.chave} className="cfg-linha atv-jogo" data-escondido={escondido(v.chave) ? '' : undefined}>
        <div className="atv-jogo-quem">
          <IconeDoJogo atividade={v} tamanho={32} />
          <div className="cfg-linha-texto">
            <span className="cfg-rotulo">
              {v.nome}
              {aberto && <span className="cfg-selo" data-tom="ok">jogando agora</span>}
              {escondido(v.chave) && <span className="cfg-selo">escondido</span>}
            </span>
            <span className="cfg-explica">{DE_ONDE[v.origem]} · {quando}</span>
          </div>
        </div>
        <div className="cfg-controle">
          <button type="button" className="cfg-botao" data-variante="fantasma" data-tamanho="pequeno"
            onClick={() => alternarEscondido(v.chave)}>
            {escondido(v.chave) ? 'Mostrar de novo' : 'Não mostrar'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <Folha titulo="Atividade" descricao="O jogo aberto neste computador aparece para o pessoal, como no Discord.">
      <Secao>
        <Linha rotulo="Mostrar o que estou jogando"
          explica="Quem está nos seus servidores e os seus amigos veem o nome do jogo na lista de pessoas e no seu perfil. Vai só o nome do jogo, nada da sua tela.">
          <input type="checkbox" role="switch" className="cfg-chave" aria-label="Mostrar o que estou jogando"
            checked={ajustes.mostrar} onChange={(e) => { const mostrar = e.target.checked; mudarAjustes((a) => ({ ...a, mostrar })); }} />
        </Linha>
      </Secao>

      <Secao titulo="Jogos que a Saga achou neste computador">
        {vistos.length
          ? vistos.map(linhaDoJogo)
          : <div className="cfg-nada">Nenhum ainda. Abra um jogo e ele aparece aqui em até um minuto.</div>}
      </Secao>

      <Secao titulo="A Saga não achou o seu jogo?">
        <Linha rotulo="Adicionar um programa aberto"
          explica="Abra o jogo, volte aqui e escolha ele na lista. Dá para dar o nome que aparece para os outros.">
          <button type="button" className="cfg-botao" data-variante="primario" disabled={procurando} onClick={procurar}>
            {procurando ? 'Procurando…' : janelas ? 'Procurar de novo' : 'Escolher'}
          </button>
        </Linha>

        {janelas && !escolhido && (
          <div className="atv-janelas">
            {janelas.length
              ? janelas.map((j) => (
                <button key={j.exe} type="button" className="atv-janela"
                  onClick={() => { setEscolhido(j); setNome(j.titulo.slice(0, 80)); }}>
                  <span className="atv-janela-titulo">{j.titulo}</span>
                  <span className="atv-janela-exe">{j.exe}</span>
                </button>
              ))
              : <div className="cfg-nada">Nenhum programa com janela aberta. Abra o jogo e procure de novo.</div>}
          </div>
        )}

        {escolhido && (
          <div className="cfg-linha" data-empilhada="">
            <div className="cfg-linha-texto">
              <span className="cfg-rotulo">Como aparece para os outros</span>
              <span className="cfg-explica">Quando <b>{escolhido.exe}</b> estiver aberto, aparece “Jogando {nome.trim() || '…'}”.</span>
            </div>
            <div className="cfg-campo-linha">
              <input value={nome} maxLength={80} autoFocus aria-label="Nome do jogo"
                onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') adicionar(); }} />
              <button type="button" className="cfg-botao" data-variante="primario" disabled={!nome.trim()} onClick={adicionar}>Adicionar</button>
              <button type="button" className="cfg-botao" data-variante="fantasma" onClick={() => setEscolhido(null)}>Voltar</button>
            </div>
          </div>
        )}

        {ajustes.meus.map((m) => (
          <Linha key={m.exe} rotulo={m.nome} explica={`Você apontou: ${m.exe}`}>
            <button type="button" className="cfg-botao" data-variante="fantasma" data-tamanho="pequeno"
              onClick={() => mudarAjustes((a) => ({ ...a, meus: a.meus.filter((x) => x.exe !== m.exe) }))}>
              Tirar
            </button>
          </Linha>
        ))}
      </Secao>
    </Folha>
  );
}

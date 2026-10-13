# A Saga no navegador e no celular

Pedido do dono em 12/10/2026: a Saga no navegador para usar no celular ("ver live e etc."),
com o login na própria página de download, e "cuidado com peso". O desenho saiu da prancheta
(https://claude.ai/artifact/5RFMSY9UrSYWK2br2LQ2Gy), com três opções de navegação
renderizadas com o CSS de verdade; o dono escolheu a **A, "como o Discord"**.

## Onde mora e como entra

- **A Saga web mora em `abnertkp.github.io/saga/app/`, no MESMO endereço da página de
  download.** É isso que faz o login da página valer: ela grava a sessão em `cantinho.sessao`
  (e o último apelido e o servidor), a página leva a `app/`, e a Saga encontra a sessão ao
  abrir. Servir a web pela VPS daria endereço feio para passar aos amigos, poria mais carga
  na máquina de um núcleo e obrigaria a passar a sessão de um endereço para outro.
- **O preço do mesmo endereço: toda página do GitHub Pages da conta AbnerTKP é o mesmo
  "lugar" para o navegador**, e leria a sessão. Hoje só existe o `saga` (conferido em
  12/10/2026). Antes de ligar o Pages em outro repositório dessa conta, lembrar disto.
- **No celular, o cartão de entrar vem antes dos botões de baixar** — lá não há o que
  instalar —, e os botões ficam embaixo da frase do que só o computador faz. Já logado, a
  página mostra "Abrir a Saga". "Criar conta" e "Esqueci a senha" levam à Saga, que já sabe
  fazer as duas coisas; o apelido digitado vai junto.

## Como é montada

- **O renderer é o mesmo do app instalado.** O que muda é a ponte: no lugar do preload do
  Electron, `src/renderer/web/navegador.ts` monta um `window.desktop` com o que o navegador
  sabe fazer — copiar pelo `navigator.clipboard` (aqui não há porteiro de permissões), baixar
  o anexo como arquivo, "acordar" quando a aba volta para a frente, registro de erros na
  memória da aba — e responde "não há" no resto (transmitir, overlay, atualizar, abrir com o
  sistema, bot de música). A tela esconde os botões pelo `platform: 'web'`
  (`recursosDaTela`, em `celular.ts`). É o mesmo truque do preload de mentira do
  `ferramentas/fotografar`, que sempre rodou a tela num navegador comum.
- **A ponte tem de carregar ANTES do app** (`web/entrada.ts`): há módulos que leem
  `window.desktop` ao serem importados.
- `pnpm --filter app build:web` → `app/out/web`, com endereços relativos (`base: './'`),
  porque a página mora numa subpasta. CSP próprio, com a `<meta viewport>`, o manifesto
  ("Adicionar à tela de início" abre sem a barra do navegador) e os ícones.

## O arranjo do celular (opção A)

- **Uma coisa na tela de cada vez**: a LISTA (trilha + salas, a faixa da call, as abas
  Servidores · Conversas · Você) ou o LUGAR aberto (sala de texto, conversa, palco). A classe
  `celular` só entra na `.app` no navegador E com a tela até 760 px — a janela do app
  instalado não fica abaixo de 900 px, então nada disto alcança o computador.
- **Abrir um lugar entra no histórico do navegador** (`useTelaDoCelular`): sem isso, o voltar
  do Android tiraria a pessoa da Saga em vez de levá-la às salas. O voltar do próprio app é o
  mesmo `history.back()`.
- **No celular, tocar numa sala de voz abre o palco.** No computador, "lendo uma conversa,
  entrar numa call só entra" (`navegacao.ts`); no celular, quem toca está olhando a lista, e
  não lendo nada.
- **No celular, tocar em quem está numa sala de voz também entra na call** (pedido do dono,
  13/10/2026: "ao clicar nas pessoas da call mesmo assim eu quero entrar direto na call"). Na
  tela do celular as pessoas são quase toda a sala de voz, e o perfil que elas abriam era o toque
  errado. Segurar o dedo continua abrindo as opções da pessoa, e o perfil fica a um toque dentro
  do palco. No computador, nada muda: o clique na pessoa abre o perfil. Conferido com toque de
  verdade (`Input.dispatchTouchEvent`) na lista de salas de verdade, numa bancada com a call
  fingida.
- **O palco desce, não fecha**: o ⌄ volta à lista e a call continua na faixa sobre as abas,
  com microfone, fone e sair.
- **As configurações** viram cabeçalho, as páginas numa faixa que rola para o lado e a página
  embaixo — só CSS. Atalhos e Inicialização somem no navegador (`paginasDaConta`).
- **Fica de fora na primeira versão** (decisão do dono): jogos (nem o menu, nem os convites —
  um "aceitar" que não leva a nada é pior que nada), tocar a soundboard e ligar a própria
  câmera. Transmitir a tela não existe em navegador nenhum: falta a captura com o som do
  sistema do app instalado.

## Peso

- **A live chega inteira** (escolha do dono): ela sai sem simulcast (`useRoom.ts`), até
  8 Mbit/s em 1080p60 — ~3,6 GB por hora no 4G. Ele recusou que quem transmite mande também
  versões menores. O que existe para aliviar:
  - **"Só o som"** nos controles da live: o vídeo some com `display: none` e o som da tela,
    que é outra faixa, continua;
  - **a live fora da tela não chega**: na lista, o palco fica montado mas escondido.
  As duas se apoiam no adaptiveStream do LiveKit, que pausa o vídeo que não está visível —
  `isElementInViewport` no livekit-client 2.22 dá por invisível o elemento com
  `display: none` ou dentro de algo escondido. **Lido no código do livekit-client, não medido
  numa call de verdade**: a bancada daqui não tem servidor de voz.
- **Os jogos chegam quando abertos** (`lazy` no App e no Sidebar): o JavaScript inicial caiu de
  469 KB para 323 KB comprimidos. No app instalado a espera é a de ler do disco.

## O que o navegador do celular faz diferente

- **Som travado**: o navegador do celular só toca áudio depois de um toque, e entrar na voz
  termina depois de esperar a rede, longe do toque. A call conectaria muda. `somTravado` (do
  `AudioPlaybackStatusChanged` do LiveKit) acende "Toque aqui para ouvir a call", e o toque
  chama `liberarSom`.
- **Safari do iPhone**: campo abaixo de 16 px dá zoom ao tocar (todos os campos vão a 16 px na
  tela estreita); tela cheia só existe no próprio `<video>` (`webkitEnterFullscreen`); e o
  campo de escrever cresce por JavaScript onde o `field-sizing` do CSS não existe.
- **A altura da tela é a `100dvh`**: com 100%, o campo de escrever ficava atrás da barra de
  endereço.

## Publicação

- **A web sobe COM a versão, nunca a cada push.** Ela é a mesma Saga e não pode chegar antes do
  servidor que a atende — a regra do app instalado. O job `pagina` do `release.yml`, depois do
  Release, dispara o `pages.yml` NA MAIN passando a tag em `versao`, e ele constrói o código
  daquela tag. Na main porque o ambiente `github-pages` só aceita publicar de lá (conferido
  em 12/10/2026: regra de branch `main`). O "Run workflow" à mão continua: com a tag da versão
  atual em `versao`.
- **Mudar só o texto da página de download também espera a versão** (ou o "Run workflow").
  Antes, qualquer push em `site/` publicava na hora; com a Saga dentro da página, isso
  publicaria código que ninguém recebeu no app.

## Como foi conferido

- `ferramentas/fotografar --celular --plataforma=web --tamanhos=390x844` (passo `22-celular`):
  a página `/web/` com a ponte do navegador de verdade, em tela de celular emulada.
- O palco da call foi desenhado por uma bancada de mentira (o `Stage` de verdade, com uma
  call fingida e o Catan num `<canvas>` como live), que ficou fora do repositório.
- Ponta a ponta com o BUILD de verdade, servido como o Pages serve, contra o servidor local
  das fotos: senha errada, entrar, a Saga abrindo logada, a página dizendo "já entrou" e o
  voltar do celular.

# Processo principal do Electron

Janela, arranque, captura de tela, assinatura no Mac, overlay. O geral está no `CLAUDE.md` da raiz.

## Decisões que não são óbvias no código

- **Trocar o nome do app muda a pasta de dados do Electron**, que leva o nome dele. Sem
  fazer nada, a versão nova nasceria sem sessão, sem ajustes e sem marcador de lidas — e
  pareceria que ela apagou as contas. Por isso `herdarDoNomeAntigo` copia
  `Local Storage`, `Session Storage`, `Preferences` e `registro` da pasta antiga na
  primeira abertura, e só nela. O cache fica para trás de propósito: são 68 MB que se
  refazem sozinhos.
- **A janela nasce escondida** e só aparece quando a consulta de atualização resolve — ou
  já com a barra de progresso. Quem clica no ícone espera um app já atualizado.
- **Abrir junto com o Windows nasce ligado, e é uma chave que a pessoa desliga.** O app
  existe para você estar lá, então o padrão é abrir; quem não quiser desliga em "Sua
  conta". Mas ligar sozinho acontece UMA vez, na primeira abertura do app instalado no
  Windows, e fica anotado em `inicio-automatico.txt` na pasta de dados — sem essa
  anotação, quem desligasse veria a Saga voltar sozinha na abertura seguinte, e ajuste que
  não obedece é pior que ajuste nenhum. **Só se liga o que se consegue anotar**: a
  anotação vem antes de mexer no arranque. No Mac a chave existe e começa DESLIGADA: não
  foi o que se pediu, e o caminho de lá (SMAppService, com o app auto-assinado) não foi
  exercido. A regra mora em `inicio.ts`, sem `electron` dentro, e é testada; quem fala com
  o registro do Windows é o `index.ts`.
- **A chave "abrir junto com o sistema" mostra o que o SISTEMA respondeu**, não o que foi
  clicado: escreve, lê de volta, e é a leitura que vai para a tela — recusando, a chave
  volta sozinha em vez de mentir. A leitura no Windows COMPARA: `openAtLogin` só volta
  verdadeiro se os `args` da pergunta forem os mesmos que foram gravados, por isso a
  pergunta carrega o `--ao-iniciar` junto. E quem responde de verdade é
  `executableWillLaunchAtLogin`, que conta também a entrada desligada à mão no Gerenciador
  de Tarefas: é a diferença entre "está escrito" e "vai abrir".
- **A entrada continua no registro depois de desinstalar, e mexer nisso é pior.** O
  desinstalador do `nsis` não sabe dela, e apagá-la de lá parece trivial — só que com
  `oneClick` cada ATUALIZAÇÃO passa pelo desinstalador: um macro sem cuidado tiraria a
  abertura automática de todo mundo na primeira versão nova, calado.
- **Aberta pelo arranque, a janela vem encolhida.** Quem ligou o computador ia fazer outra
  coisa — a Saga só precisa estar online. Encolhida, e não invisível: sem ícone ao lado do
  relógio, app escondido é app que não se acha de volta. Quem separa "o sistema me abriu"
  de "alguém me abriu" é o `--ao-iniciar` que a entrada de arranque carrega; no Mac não há
  argumento nenhum e quem responde é `wasOpenedAtLogin`. Medido no processo principal de
  verdade, com `show`, `showInactive` e `minimize` interceptados para nada aparecer na
  tela: sem o argumento, `show()`; com ele, `showInactive()` + `minimize()`.
- **Uma Saga por computador.** Abrindo junto com o sistema, "o app já está aberto quando eu
  clico no ícone" vira o caso NORMAL — e sem trava o clique abria uma SEGUNDA Saga: duas
  conexões, dois sinais de presença, dois avisos de quem chegou e a pessoa duas vezes na
  lista. Hoje quem não pega a trava sai na hora, e quem a tem traz a janela para a frente.
  Medido com o Electron do projeto: a segunda instância recebe `false` e sai; a primeira
  recebe o `second-instance` com os argumentos dela e chama `show()` + `focus()`.
- **Salvar o anexo acontece no processo PRINCIPAL, com o diálogo do sistema.** Dentro da
  tela não há para onde escrever, e a alternativa seria abrir no navegador — que é
  exatamente o que não se quer com arquivo que veio de fora. Nada é aberto nem executado:
  a pessoa escolhe onde põe.
- **O seletor de tela é sempre o nosso, inclusive no Mac.** O do sistema não chama o nosso
  handler, e é só dentro dele que se concede `audio: 'loopback'`: por ele vêm 0 faixas de
  áudio, pelo nosso vem 1, rotulada "System audio". Transmissão muda não serve.
- **Não se pergunta ao macOS se a permissão de tela existe.** `getMediaAccessStatus('screen')`
  respondeu "negado" com as duas chaves ligadas nos Ajustes — a permissão guardada é a da
  versão anterior, porque cada build nossa é assinada em ad-hoc e tem assinatura própria.
  Chegamos a escolher o seletor por essa resposta, e o app ficou preso no caminho sem som
  sem jeito de sair. A prova que não mente é o sistema entregar, ou não, as telas.
- **Sem permissão, `getSources` LANÇA — não devolve lista vazia.** Estava escrito aqui o
  contrário, e custou caro: o registro do dono tem dez `Failed to get sources` e zero
  passagens pelo ramo da lista vazia. Como o ipc rejeitava e o `ScreenPicker` não tinha
  `catch`, a janela "Compartilhar tela" ficava presa em "Carregando…" para sempre — a
  instrução de como conceder a permissão ficava inalcançável justo para quem precisava
  dela. Hoje a falha vira lista vazia no processo principal, e as duas formas caem na
  mesma explicação. Medir vale mais que deduzir: este parágrafo já esteve errado.
- **O áudio da tela é som, não voz.** Pedindo `audio: true` cru, o Chromium entrega a
  captura com o processamento de microfone ligado — ganho automático, cancelamento de eco e
  supressão de ruído — e em mono. Medido: `{autoGainControl: true, echoCancellation: true,
  noiseSuppression: true, channelCount: 1}`. Num filme, o ganho automático é o que "estoura":
  empurra as partes altas e bombeia. Desligamos os três, pedimos estéreo, e publicamos a
  128 kbps em vez dos 48 kbps mono do preset de voz, sem DTX nem RED — os dois foram feitos
  para fala e atrapalham música.
- **Áudio de tela recusado não lança erro** — vira faixa muda, e a própria Electron
  documenta isso. Depois de publicar, conferimos se a faixa existe; sem essa conferência
  o Mac transmitiu mudo por versões seguidas sem nada aparecer no registro.
- **`loopback` devolve a nossa própria voz, e fone não resolve.** Ele captura a mistura da
  saída padrão inteira, o que inclui as vozes que o próprio app está tocando: quem
  transmite manda todo mundo de volta para a call. Não é eco de microfone — é cópia
  digital do mix, antes de virar som no ar, então fone de ouvido não muda nada, e o
  `echoCancellation` do microfone não alcança. `loopbackWithMute` também não resolve: ele
  silencia o *endereço de saída da máquina*, não o app — quem transmite perde o filme e as
  vozes, e a captura continua a mesma.
- **`loopbackWithoutChrome` escolhe POR ONDE capturar; quem exclui a nossa voz é a
  constraint `restrictOwnAudio`.** Este parágrafo já disse que o id bastava, e o dono pagou
  a conta: transmitindo uma série do Mac, todo mundo na call se ouvia de volta. O registro
  dele mostrava `modo "loopbackWithoutChrome"` em TODAS as transmissões — o modo tido como
  certo estava sendo usado o tempo todo, e não excluía nada. Medido com o Electron do
  projeto, lendo o `getSettings()` da faixa que volta:

  | pedido | `restrictOwnAudio` efetivo |
  |---|---|
  | `loopbackWithoutChrome`, sozinho | **false** |
  | `loopback`, sozinho | **false** |
  | `loopbackWithoutChrome` + `restrictOwnAudio: true` | **true** |
  | `loopback` + `restrictOwnAudio: true` | **true** |

  Por isso a constraint entrou no `SOM_DE_VERDADE`, como pedido e não como `exact`: onde o
  Chromium não puder atender, a faixa vem do mesmo jeito em vez de a transmissão falhar. E
  o registro passou a escrever o que a faixa RESPONDEU (`sem a nossa voz: sim/NÃO`), não o
  modo pedido — foi o registro dizendo "modo certo" que escondeu isto por versões. **A
  lição é a de sempre, na forma mais cara:** "dispositivo distinto" foi medido e estava
  certo; "logo, exclusão feita" foi deduzido, e era isso que ninguém tinha medido.
  O id continua na fila, e continua valendo: a tipagem da Electron só conhece dois valores,
  mas ela repassa a string crua e o Chromium a reconhece — `loopback` →
  `deviceId: "loopback"`, `loopbackWithoutChrome` → `deviceId: "loopbackWithoutChrome"`, e
  uma string inventada → `NotReadableError`. Por dentro é captura por processo, então pede
  Windows 11 ou macOS 14.2: onde não houver, ou lança (e a fila cai para `loopback`) ou vem
  muda — e é só por isso que faixa muda **neste modo** cai para o próximo, em vez de só
  avisar como nos outros. Cair de `loopback` para `loopbackWithMute` seria pior que o
  problema. De quebra, ele destravou a máquina do headset Logitech — ver "A limitação que
  caiu sem ser atacada".
- **Ad-hoc não é identidade estável — é o contrário disso.** O `afterPack` assina, e
  assinar é obrigatório: sem assinatura nenhuma o macOS não tem a que associar permissão de
  microfone, câmera e tela. Mas ad-hoc não resolve, e por anos estava escrito aqui e no
  código que resolvia. O que o macOS guarda junto da permissão é o *requisito designado*, e
  no ad-hoc ele é o hash do build:

  | | ad-hoc | certificado próprio |
  |---|---|---|
  | requisito | `cdhash H"a644c9ee…"` | `identifier "br.com.vorcaro.cantinho" and certificate leaf = H"…"` |
  | build seguinte satisfaz o anterior | não | sim |

  Medido com o `afterPack` de verdade: três builds de conteúdo diferente assinados com o
  mesmo certificado deram CDHash diferente e requisito idêntico (`explicit requirement
  satisfied`). Por isso cada versão nova vira "outro app" e a chave ligada nos Ajustes
  deixa de valer. Daí `MAC_SIGN_IDENTITY`: com a variável, assina com o certificado
  guardado em secret; sem ela, cai no ad-hoc, e o build local de quem não tem o
  certificado continua saindo.
- **O certificado é auto-assinado e não muda o Gatekeeper.** `spctl` rejeita ad-hoc e
  auto-assinado exatamente igual — a dança de "Abrir Mesmo Assim" continua. Ele serve para
  uma coisa só: a permissão parar de cair a cada versão.
- **O som do sistema no Mac é uma permissão separada da tela.** Desde o macOS 14.4 a
  captura é por *audio tap* do CoreAudio, com TCC próprio. A chave
  `NSAudioCaptureUsageDescription` já vem do Electron — chegamos a "consertar" a ausência
  dela antes de conferir, e ela estava lá o tempo todo, inclusive no app instalado. O que
  mudamos foi só a frase, para o macOS pedir em português. **O Mac transmitir mudo continua
  sem explicação medida:** num teste aqui, a faixa capturada veio existente e silenciosa
  tanto em `loopback` quanto em `loopbackWithoutChrome`.
- **`fullscreen` é uma permissão do Electron.** O `setPermissionRequestHandler` liberava só
  `media`, `display-capture` e `notifications`, então todo `requestFullscreen()` era negado
  no processo principal. Negado, ele não vira erro: a promessa fica pendurada para sempre —
  nem resolve, nem rejeita —, então `catch` nenhum vê nada e o registro fica limpo. Medido
  com o Electron do projeto: sem `'fullscreen'` na lista, `NADA — promessa nunca respondeu`;
  com ela, `promessa resolveu`. A tela cheia da v0.18.0 nunca funcionou em versão nenhuma.
- **No Windows a barra da janela é do app; no Mac, continua a do sistema.** A do Windows
  era a branca do sistema, a única coisa na tela que não era da Saga. O dono escolheu entre
  três desenhos renderizados: a faixa de 34 px (logo e "Saga") com os três botões da altura
  inteira, colados na borda, e o fechar em vermelho cheio — maximizada, o canto da tela É o
  fechar. O Mac ficou de fora de propósito: lá o uso já é o dos botões do sistema, e igualar
  os dois não era o pedido. `titleBarStyle: 'hidden'` sem `titleBarOverlay` tira a barra e
  mantém borda de esticar, sombra e encaixe; os botões falam com o processo principal, e o
  do meio escuta `maximize`/`unmaximize`, porque dois cliques na faixa também maximizam.
  **A barra mora em `main.tsx`, acima de TODA tela** — atualização, entrada, tela inicial
  —, e não dentro do `App`: numa tela sem ela a janela ficaria sem fechar. Pelo mesmo motivo
  ela fica acima da escada de camadas (45), e o que cobre a tela inteira começa abaixo dela
  por `--topo-da-janela` (o fundo dos painéis, a altura máxima do painel, o X do ver
  imagem): com um painel aberto, a barra do sistema continuava ali para fechar. O menu de
  layouts do Windows 11 ao parar o mouse no maximizar se perde; Win+Z continua.
- **O CSP precisa de `http:`/`https:` em `img-src` e `media-src`**: a página vem de
  `file://`, então `'self'` não cobre o servidor.
- **A live sai da Saga por uma JANELA, e a imagem vai por quadros.** Jogo em tela cheia
  tapa o app inteiro: o quadro flutuante resolve "estou no chat", não "estou jogando". A
  janela do overlay fica acima de tudo (`alwaysOnTop` no nível `screen-saver`, e
  `visibleOnAllWorkspaces` com `visibleOnFullScreen`, que no Mac é o que a faz existir no
  espaço do jogo). O caminho para a imagem chegar lá foi medido, não deduzido, com o
  Electron deste projeto:

  | caminho | resultado |
  |---|---|
  | `documentPictureInPicture` | não existe — é API de navegador, não do Electron |
  | transferir a `MediaStreamTrack` | `DataCloneError: does not have a transferable type` |
  | `MediaStreamTrackProcessor` + `ReadableStream` transferível | **26 quadros/s a 1280x720** |

  E ler os quadros não tira a imagem de quem já a exibe: com a mesma faixa num `<video>` e
  num processador ao mesmo tempo, o vídeo recebeu 61 quadros nos mesmos 2 s em que o
  processador leu 61 — é o que faz a live continuar no palco enquanto está por cima do
  jogo. Vale o terceiro: o stream de `VideoFrame` é transferível, então os quadros atravessam
  sem codificar nada — o mesmo quadro que já estava na memória. E é por isso que quem abre
  a janela é a TELA (`window.open`), não o processo principal: só quem tem a outra janela
  na mão consegue transferir o stream para dentro dela. Entrar de novo no LiveKit não era
  opção — mesma identidade derruba a conexão anterior, e identidade nova põe um fantasma
  na lista de todo mundo. **O som não vai junto**: ele continua saindo pela Saga, que é
  onde mora o volume da live; duas saídas tocariam a mesma coisa.
- **O overlay nasce TRAVADO, e travado quer dizer que o clique atravessa.**
  `setIgnoreMouseEvents(true, { forward: true })`: clique, mira e teclado vão todos para o
  jogo, e o `forward` mantém o movimento do mouse chegando à página — sem ele, a janela
  não saberia nem que o ponteiro passou. Quem destrava é um atalho GLOBAL (Ctrl+Shift+O
  de fábrica, trocável em "Sua conta"), porque uma tecla da janela não chega a quem está
  com o jogo na frente. O campo do atalho ESCUTA a combinação em vez de aceitar texto, e
  o que fica escrito é o que o sistema aceitou: `globalShortcut.register` devolve falso
  quando outro programa já tem a tecla, e afirmar o que não aconteceu é pior que dizer
  "não deu". `atalhoAceito` recusa o que faria o `register` LANÇAR, no meio de abrir a
  janela — o erro apareceria a três camadas de distância.
- **Do overlay só se vê a imagem e um selo com o nome.** Foi a escolha do dono entre três
  desenhos renderizados antes do código: sem nada por cima, com uma barrinha fixa no alto,
  e este — selo pequeno no canto, que não gasta altura nenhuma. Travado, o selo é a única
  coisa que diz de quem é a tela; destravado, entram a moldura de acento, as quinas de
  esticar e os botões de som e fechar. Medido no app de verdade, em janela escondida, com
  o processo principal do build: travado, 0 quinas e 0 botões; destravado, 4 e 2; os
  quadros chegando a 1280x720; esticar e reabrir voltando no mesmo canto e tamanho.
  **Numa call de verdade, por cima de um jogo de verdade, não foi exercido.**
- **Segredos são removidos antes de gravar no registro de erros** — é um arquivo feito
  para circular no grupo.

## A limitação que caiu sem ser atacada

Numa das cinco máquinas (Windows 11 25H2, headset USB Logitech como único dispositivo de
áudio), o áudio do sistema no compartilhamento falhava com `Could not start audio source`.
Foi investigado a fundo, não se achou saída, e o dono encerrou o caso. **Voltou a funcionar
na v0.20.0**, confirmado por ele: parou exatamente nessa versão, naquela máquina.

Ninguém foi atrás disso. O que mudou foi a entrada do `loopbackWithoutChrome`, feita para
cortar o retorno de voz — e ela pegou o caso de carona. O motivo é a diferença de caminho
por dentro do Chromium: `loopback` e `loopbackWithMute` abrem o **dispositivo de saída
padrão**, e era ali que a placa recusava; a captura por processo do `loopbackWithoutChrome`
**não abre o endpoint**, então nem passa pelo trecho que falhava. Foi por isso que os dois
modos antigos falhavam igual, e por isso Chrome, Meet e Teams funcionavam na mesma máquina.

A lição, que é o que interessa guardar: a investigação estava certa em tudo que descartou —
escolha de tela ou janela, modo exclusivo, elevação de privilégio, ausência de dispositivo,
nossas opções de captura e as do LiveKit — e mesmo assim não achou a saída, porque a saída
não estava em nenhuma opção nossa: estava num modo de captura que a gente não sabia existir.
Antes de encerrar um caso por esgotamento, vale perguntar que caminho o próprio motor tem e
a gente não conhece.

- **Relógio não é o único jeito de o app saber que precisa buscar de novo.** Toda busca
  do app é `setInterval` — salas de 4 em 4 s, mensagens de 2 em 2 s, servidor de 10 em 10 s
  —, e relógio é a primeira coisa que o sistema desliga: o Chromium estrangula os
  intervalos de janela que está atrás de outra (e quase os congela depois de alguns
  minutos), e a máquina dormindo simplesmente para todos. Medido: com os relógios da
  página zerados, uma mensagem publicada nesse meio-tempo **nunca aparecia** — que foi o
  que o dono viu ao voltar sem conexão. Hoje há quatro momentos que disparam a busca na
  hora, e nenhum é relógio: a internet voltou (`online`), a janela voltou a ser vista, ela
  ganhou o foco, e a máquina acordou (`powerMonitor`, que só o processo principal enxerga).
  A regra mora em `despertar.ts`, e a janela ainda ganhou `backgroundThrottling: false` —
  aqui isso não é economia de bateria, é o sinal de vida: a pessoa apareceria offline para
  os amigos só por estar com o app atrás do navegador.

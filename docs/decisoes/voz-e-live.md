# Voz, call e transmissão de tela

Decisões de `useRoom`, palco, live, quadro flutuante e quem está falando.

## Decisões que não são óbvias no código

- **Trocar de servidor não desliga a voz.** Desligava, com som de saída e tudo, como se
  você tivesse encerrado a call — e às vezes a pessoa só quer espiar o que está
  acontecendo do outro lado. Olhar não é sair. Tecnicamente nunca foi preciso: a sala do
  LiveKit é o id, então falar no "Geral" de um servidor enquanto se lê outro sempre
  coube. Por isso o mapa de quem-é-quem **acumula** em vez de refletir só o servidor
  aberto: quem está na sua call não vem no `/rooms` do servidor que você está olhando, e
  sem guardar os rostos da conversa virariam iniciais no meio dela.
- **1080p e 60 quadros são do Berserk**, e a régua (`qualidades.ts`) vale tanto na
  escolha quanto na hora de transmitir. É trava do app, não do servidor: o LiveKit não
  limita bitrate por participante, então é regra de conduta, não cerca.
- **Numa cena pesada não cabem nitidez e fluidez — e quem escolhe é a pessoa, no menu.**
  Medido no servidor de produção, sala descartável, dois participantes reais, cena difícil
  (textura fina em panorâmica):

  | pedido | protegendo quadros (`motion`) | protegendo nitidez (`detail`) |
  |---|---|---|
  | 720p30, 2,5 Mbps | 960x540 | 1280x720 |
  | 1080p30, 5 Mbps | 960x540 | 1920x1080 |
  | 1080p60, 8 Mbps | 960x540 | 1920x1080 |
  | 1080p60, **16** Mbps | 960x540 | — |

  **Dobrar o teto de banda não devolve um pixel** — 8, 12 e 16 Mbps deram os mesmos
  960x540 —, então "está ruim, sobe o bitrate" não é caminho. Era essa a queixa de imagem
  "de 360p", e ela caía nas **quatro** opções por igual: trocar de opção não mudava nada
  porque todas terminavam em 540p. Pior, a volta é lenta: medido, ~20 s de cena leve para
  sair de 540p e chegar a 1080p, aos saltos — e como jogo alterna pesado e leve o tempo
  todo, a transmissão vive lá embaixo. Protegendo a nitidez a volta é imediata (5 s).
  Hoje o `contentHint` sai da escolha: 30 quadros → `detail` (modo de tela, resolução
  intocável, quadros cedem); 60 → `motion` (quadros intocados, resolução cede). No modo de
  tela a `degradationPreference` é ignorada — medido: `maintain-framerate`,
  `maintain-resolution` e `text` deram exatamente o mesmo.
- **H.264 é o pior dos codecs aqui, não o melhor.** A intuição diz "hardware, VideoToolbox,
  deve ganhar"; medido na mesma cena e no mesmo teto de 8 Mbps: VP8 960x540, VP9 1280x720,
  **H.264 480x270**. VP9 entrega um degrau a mais de resolução, mas custa ~1,6x o tempo de
  codificação (7,9 ms/quadro contra 4,9) e perde quadros — não foi adotado, e não foi
  exercido em máquina fraca.
- **O registro de quem transmite diz o que saiu de verdade.** `useRoom` anota aos 10 s e
  aos 45 s a resolução, os quadros e o bitrate que o codificador está mandando. Sem isso,
  "a imagem está ruim" não tinha resposta: a resolução que sai não é a que se pediu, e
  descobrir os 960x540 exigiu montar uma sala de medição no servidor de produção.
- **`volume` de elemento de áudio só aceita de 0 a 1.** Passar disso lança exceção, e
  dentro de um efeito do React isso derruba a tela inteira. Tudo passa por `volume.ts`.
- **A call que CAIU volta sozinha; a que foi TIRADA, não.** O LiveKit avisa a saída da
  sala com um evento só, aconteça o que acontecer — internet piscou, servidor reiniciou,
  você desligou, ou um moderador te desconectou. Tratar tudo como queda faz o app pôr a
  pessoa de volta segundos depois de alguém a tirar: a moderação desfeita sozinha, e
  parecendo defeito dos dois lados. Quem separa é o MOTIVO que vem no evento, e a lista
  mora em `queda.ts`, pura e testada — voltam `CONEXAO_FECHOU`, `SERVIDOR_REINICIOU`,
  `ESTADO_DIVERGENTE`, `MUDANCA_DE_SERVIDOR` e motivo nenhum; ficam de fora `ME_TIRARAM`,
  `EU_DESLIGUEI`, `ENTREI_NOUTRO_LUGAR`, sala apagada ou fechada e `NAO_CONSEGUI_ENTRAR`.
  Medido no app de verdade contra um LiveKit local: tirando a pessoa pelo `removeParticipant`,
  ela continua fora nove segundos depois. E a volta é **com o microfone como estava** —
  reaparecer falando para quem tinha se mutado seria pior que não voltar.
- **Efeito de reconexão não pode depender do que muda a cada busca.** O efeito que traz
  a call de volta dependia de `rooms` e de `entrarNaVoz` — e as duas nascem de novo a cada
  busca de salas, de 4 em 4 segundos. O efeito era refeito junto e disparava uma tentativa
  nova por cima da anterior, cada uma derrubando a que estava no meio da conexão. Medido
  com o LiveKit local: o app ficava em "Conectando…" de 50 s a 100 s e terminava fora da
  call, com o servidor de voz já de pé. Hoje ele depende só de `caiuDaCall` (a sala de que
  se caiu vem dentro dele, então nem se procura na lista) e uma trava impede empilhar
  tentativas — entrar tem tempo limite de dezenas de segundos, e bater de novo antes disso
  garante que nenhuma termine.
- **A volta da call pede o passe ao servidor DA SALA, pelo id.** Pedia ao servidor aberto,
  pelo nome. Dá no mesmo enquanto só se clica em sala do servidor aberto, e não na volta de
  uma call que caiu enquanto se olhava o vizinho: o passe saía para a sala de mesmo nome do
  servidor aberto, se houvesse — "Geral" existe em todos —, e a voz passava a guardar o
  servidor aberto como sendo o da call; sem sala de mesmo nome, a volta era recusada de 30
  em 30 s para sempre. Medido por HTTP contra um servidor local com as duas "Geral" (sala-1
  no CORNUME, sala-3 no "teste"): pedido do jeito antigo, olhando o "teste", o passe saía
  para a **sala-3**; do jeito de agora sai para a sala-1, e o mesmo id pedido ao servidor
  errado é recusado. Hoje `entrarNaVoz` recebe a sala com
  o servidor dela (`SalaDaVoz`) e `pedirTokenDaSala` manda o id e o cabeçalho desse
  servidor; o `/token` da produção já aceitava o id. Não foi exercido numa queda de verdade.
- **Queda curta o LiveKit resolve sozinho; a longa é que precisava de conserto.** Medido:
  matando o servidor de voz, o app passa a "Reconectando…" e o próprio cliente refaz a
  conexão se ela voltar em ~40 s. Passado isso ele DESISTE, e era aí que a call morria de
  vez e ninguém voltava. É essa a queda que o app agora cobre.
- **A tela vai sem simulcast.** Com ele, o `adaptiveStream` de quem assiste escolhia a
  versão menor sempre que a janela era menor que a tela transmitida — era a imagem borrada.
  Com uma faixa só, `adaptiveStream` não tira nada: medido, quem assiste num `<video>` de
  1280x720 recebe os 1920x1080 inteiros. O `dynacast` continua útil — ele para de mandar
  quando ninguém assiste (medido: sala sem plateia, 0 kbps) e volta sozinho.
- **Quem está transmitindo fica sempre à vista, mesmo o que você não está vendo.** É a
  diferença entre esconder e sumir: uma live que você cortou sem deixar rastro obriga a
  procurar o caminho de volta, e não havia um. Vale para qualquer coisa que a pessoa
  desliga — o desligado precisa continuar visível, senão não tem como religar.
- **Só a escolhida chega, imagem E som.** Este parágrafo já disse o contrário — que a
  imagem de todas chegava e só o som era de uma. Estava errado, e a objeção que sustentava
  isso ("não dá para escolher o que não se vê") tinha resposta melhor que gastar banda:
  o **cartão**. Quem está no ar e não está sendo recebido aparece na faixa de baixo com
  selo "AO VIVO" piscando, retrato grande e nome — dá para escolher entre pessoas, que é
  o que se escolhe, e não entre nomes soltos. Medido, inscrita contra não inscrita:
  229.809 bytes contra 0.
- **Quem transmite vê quem está assistindo, e isso não vem do LiveKit.** Não existe essa
  pergunta na API dele — nem no cliente nem no servidor: ninguém conta a quem publica quem
  se inscreveu na faixa. Então cada app ANUNCIA o que escolheu assistir, num atributo de
  participante (`assistindo`), e todo mundo lê o de todo mundo. Medido contra um LiveKit de
  verdade: quem já está na sala passa a ler o atributo, e **quem chega depois já o recebe
  sem ninguém repetir nada** — que é o que descarta mandar recado por dados, onde o
  retardatário ficaria sem saber. O nome do atributo é protocolo entre versões do app, como
  o `turbo`: amigo com versão velha não anuncia, não aparece na lista, e nada quebra.
- **O crachá da sala precisa de `canUpdateOwnMetadata`, senão o anúncio não sai.** Medido
  nos dois lados, e eles falham diferente: com o crachá antigo o `livekit-client` recusa na
  hora — *"does not have permission to update own metadata"* — e o `catch` registra; pelo
  `rtc-node` a mesma chamada RESOLVE e o atributo é descartado em silêncio (quem lê vê
  `{}`). Como app e servidor sobem separados, **app novo com servidor antigo não mostra
  espectador nenhum**: o servidor tem de ser publicado junto. `api.test.mjs` abre o crachá
  e trava a permissão, porque tirá-la de volta não dá erro em lugar nenhum.
- **A lista de espectadores se conserta sozinha a cada 1,5 s**, e não confia no evento.
  Medido com o `livekit-client` deste projeto: LIGAR o `assistindo` não emitiu
  `ParticipantAttributesChanged` em quem já estava na sala; duas mudanças renderam um
  evento só. O evento continua ligado, porque quando vem é imediato — quem garante é a
  volta, igual ao medidor de quem está falando.
- **Quem olha a própria transmissão não é plateia.** Dá para pôr a sua live no palco (é a
  prévia do que você manda), e contar isso diria "1 assistindo" para quem está sozinho. A
  regra vive em `espectadores.ts`, pura e testada.
- **Dois nomes e a conta fora do corte: "Juninho, Junio +5".** Os NOMES encolhem quando
  não cabem; a conta, não. Com os dois no mesmo texto, "Juninho, Junio e mais 5" virava
  "Juninho, Junio e mai…" num quadro de 180 px — comia justamente o número, que é o que
  não se sabe de outro jeito. A lista inteira vem parando o mouse em cima, e isso só
  funciona porque a etiqueta RECEBE o mouse: ela chegou a ter `pointer-events: none` para
  não roubar o clique do quadro, e junto foi embora o passar o mouse. Não precisava: a
  etiqueta é filha do quadro, então o clique sobe sozinho. Na transmissão dos OUTROS
  continua só o número — ali importa se tem gente, não quem. No cartão de quem está no ar
  a contagem entra na MESMA linha do "assistir": aquele cartão tem 110 px e uma quarta
  linha ali já saiu por cima do retrato uma vez. E na sua transmissão o zero aparece —
  "ninguém ainda" é a informação, não a ausência dela.
- **Os cartões saem da PUBLICAÇÃO, não da faixa.** Uma faixa só existe se estiver
  inscrita, então listar lives por faixa mostraria exatamente a única que já se está
  vendo. `rm.lives` vem das publicações de tela dos participantes.
- **Entrar numa sala onde alguém JÁ transmitia inscrevia a transmissão sozinho.** O
  `TrackPublished` só fala das que começam DEPOIS de você chegar; as que já estavam vêm
  direto em `TrackSubscribed`, e as duas apareciam rodando até o primeiro clique. Por isso
  o `TrackSubscribed` também recusa: chegou tela de quem não é o escolhido, desinscreve.
  Medido contra a produção, entrando numa sala com duas telas no ar: **0 `TrackPublished`
  e 2 `TrackSubscribed`**. E desinscrever de dentro do próprio `TrackSubscribed` pega —
  não é ignorado por chegar cedo demais: `TrackUnsubscribed` dispara e a publicação fica
  `subscribed=false`, enquanto a escolhida fica `true`.
- **A escolha é um clique na própria imagem, não numa lista à parte.** Chegou a ser uma
  faixa de fichas no alto da tela, e escolher longe do que se escolhe foi rejeitado na
  hora. O palco tem dois campos: em cima a escolhida, embaixo quem está no ar. Sem
  escolha, o campo de cima não some — ele diz o que fazer.
- **Quem transmite ganha, na barra, um selo AO VIVO que já é o botão.** O "assistir" só
  existia DENTRO do palco; depois veio um cartão ao passar o mouse, que esperava 250 ms e
  foi a primeira queixa quando o dono mandou refazer o assistir live ("demora muito pra
  aparecer"). Hoje um clique no selo faz o que o cartão faria, e o que ele faz depende de
  onde você está (`seloDaLive` e `acaoDaLive`, em `cartaoDaLive.ts`, puros e testados): na
  sua call, assistir; noutra sala, entrar e assistir, pela regra do clique na sala
  (`navegacao.ts`); na live que você já vê, o selo vira ASSISTINDO e abre o palco; a sua
  própria só diz que está no ar. O cartão continua, abrindo em 60 ms, com um relógio só
  para abrir e fechar — sair do nome marca o fechar, chegar ao cartão o desmarca —, e na
  live que você já assiste ele traz o volume e o Sair. **Não traz a imagem da
  transmissão**: só a escolhida chega, e uma prévia gastaria a banda que essa regra poupa.
  Medido no app de verdade, em janela escondida, com uma tela no ar num LiveKit local: o
  cartão abre em ~0,1 s, e o clique no selo põe a live no palco, entrando na call, em 1,4 s.
- **Os controles da live ficam por cima da imagem e aparecem com o mouse.** Foi a escolha
  do dono entre isto e uma barra fixa embaixo da live, desenhadas lado a lado antes do
  código. No alto, quem é, o selo, quem assiste e "Sair da live" escrito; embaixo, o volume
  com a porcentagem e o mudo, preencher e tela cheia. Somem 2,5 s depois de o mouse parar,
  nunca com o mouse em cima deles, e aparecem também com o foco do teclado. **Clicar na
  imagem mostra os controles, e não sai mais da live**: saía, e um clique para dar foco à
  janela bastava para perder a transmissão. Volume e preencher moravam no botão direito do
  vídeo, onde ninguém os achava — o menu saiu. **Devolver o som volta ao volume de antes, e
  não a 100%** (`alternarMudo`, em `volume.ts`, testado). Sem live escolhida, o palco mostra
  quem está transmitindo em cartões grandes com "Assistir", no lugar do quadro tracejado;
  com uma escolhida, ela fica marcada na faixa de baixo e as outras levam o botão escrito.
  No quadro flutuante do chat os controles são FIXOS — num quadro daquele tamanho, controle
  que some é controle que ninguém acha —, e a faixa do alto diz qual live está rodando. Os
  avisos do canto sobem quando o quadro flutuante está aberto: nasciam por cima dos
  controles dele e cobriam justamente o Sair, o que só apareceu na foto. Tudo isso foi
  exercido na janela escondida, inclusive o mudo voltando aos 30% de antes.
- **O cartão da live é deitado, não empilhado.** A faixa de baixo tem 110 px de altura, e
  selo + retrato + nome + chamada empilhados não cabem: o selo acabava por cima do
  retrato. Largura é o que sobra ali. Medido renderizando o `styles.css` de verdade — o
  primeiro desenho passou no typecheck e saiu quebrado na imagem.
- **O palco não escolhe a transmissão; quem assiste escolhe.** Ele focava a primeira que
  aparecesse, e "a primeira" é a ordem em que os participantes calharam de vir — que muda
  quando alguém liga a câmera ou troca de faixa. Com duas pessoas transmitindo, o quadro
  grande pulava de uma para a outra sozinho e não havia como dizer "quero esta". Sem
  clique, todas ficam do mesmo tamanho, esperando. A escolha vale para imagem **e** som:
  palco vazio é silêncio, que é o que `audivel.ts` já dizia.
- **Uma coisa por vez no palco: vídeo OU chat.** O chat já morou como coluna dentro da
  sala de voz, dividindo espaço com a transmissão — as duas ficavam apertadas, e chat não é
  da sala de voz, é da sala de chat. Quem está na voz e abre o chat não perde a live: ela
  vira um quadro flutuante no canto, que abre em tela cheia com dois cliques.
- **O quadro flutuante se arrasta pela BARRA e se estica pelas quinas.** Ele nascia
  chumbado no canto de baixo à direita, e chumbado ele tapa justamente o que estiver ali —
  o fim da conversa, o campo de escrever. A alça é a barra de controles, como a barra de
  título de qualquer janela: a imagem continua sendo imagem (clique mostra, dois cliques
  abrem em tela cheia) e os botões dentro da barra continuam sendo botões. O que se guarda
  não é um par de pixels: é um POUSO — a distância do canto mais PRÓXIMO, com o lado junto
  (`flutuante.ts`, puro e testado). Guardando "a 900 px da esquerda", quem encostou o
  quadro na direita o veria no meio do nada depois de esticar a janela; guardando "colado
  na direita", ele continua colado. A regra dos avisos do canto era 322 px chumbados no
  CSS, de quando o quadro só podia estar num lugar e num tamanho — hoje quem escreve
  `--avisos-fundo` é o próprio quadro, e só enquanto ele estiver NAQUELE canto.
- **A live que está no palco é uma pergunta só, em `useRoom`.** Três lugares perguntam a
  mesma coisa agora — o palco, o quadro flutuante e o overlay —, e a conta nascendo em
  cada um é o defeito que o cartão de perfil já teve. Aqui daria pior: cada lugar podia
  acabar mostrando uma live diferente.
- **O anúncio do fone vai ANTES do microfone, e não depende dele.** Religar o fone
  readquire o microfone, e isso pode falhar — headset ocupado (o caso Logitech), permissão
  negada, dispositivo que sumiu. Com o `anunciar()` depois de um `await` sem `catch`, a
  falha pulava o anúncio: a sua tela dizia que você voltou e todo mundo continuava te vendo
  de fone desligado. A marca conta quem não ouve; isso já foi decidido três linhas acima, e
  o microfone é consequência. O `catch` é o mesmo de `join` e `toggleMic`: falhar o
  microfone avisa, não derruba.
- **Surdo é `muted` E volume zero, porque o LiveKit escreve o `muted` sozinho** (22/09/2026).
  O dono: "muto meu fone e ouço alguém normal falar". O `room.startAudio()`, que o `join` chama
  logo depois de conectar, põe `muted = false` em TODO elemento de áudio — e a Saga o chamava
  sem reaplicar a surdez depois. Quem entrava ou trocava de sala de fone desligado (ou voltava
  sozinho de uma queda) ouvia quem já estava lá. Medido numa bancada escondida (duas páginas
  Electron com `livekit-client` num LiveKit local): `muted` true antes, false depois do
  `startAudio`; o volume fica em 0. Hoje o `join` reaplica, e o volume zero segura o que vier
  de novo. **Hipótese descartada pela bancada:** o `setMuted` que reprende o elemento quando o
  outro desmuta também zera o `muted`, mas é só da faixa de VÍDEO — com áudio, o elemento
  continuou mudo. No iOS o LiveKit chama `startAudio` também ao voltar a janela; aqui não.
- **O mudo do microfone é da PESSOA, não da sala** (`querFalar`, 22/09/2026). O dono: "eu muto e
  às vezes eles voltam a me ouvir". O `join` ligava o microfone a cada sala, então trocar de
  sala desmutava quem tinha se mutado. O mudo do LiveKit em si foi medido e segura: com o
  processador no caminho, mutado, a faixa reaberta, a troca de aparelho, a troca de supressão, a
  reconexão rápida e a completa (`simulateScenario`) — −120 dB chegando ao robô em todas.
- **Fone desligado tem marca própria, e ela entra NO LUGAR da do microfone.** Surdez é
  decisão local: não é faixa nenhuma, e o LiveKit não conta a ninguém. De fora só se via o
  microfone mudo — que é a consequência (desligar o fone muta o microfone junto) e diz a
  coisa errada: "ele não fala", quando o que houve foi "ele não te ouve". Agora o app
  anuncia `surdo` junto do `assistindo`, no mesmo atributo de participante, e manda os
  DOIS a cada vez — assim nada depende de o servidor juntar o que veio agora com o que
  veio antes. Na linha da call vai o fone cortado, e não os dois ícones: a linha é a mais
  estreita do app, e repetir a consequência esconderia a causa. Medido contra um LiveKit
  de verdade: os dois atributos viajam juntos, o outro app lê os dois, e o SERVIDOR também
  os enxerga no `listParticipants` — que é o que faz a marca valer também nas salas em que
  você não está (`verParticipante`, testado).
- **O som da live também anda em faixa própria** (`ScreenShareAudio`), separada do vídeo.
  Quem corta a live tem de cortar as duas: "não assistir" desinscrevia só o vídeo, e o som
  de todas as lives continuava entrando e tocando com a tela apagada. Medido: cortando só
  o vídeo, `screen_share=cortado` e `screen_share_audio=RECEBENDO`.
- **"Parar de ver" saiu; o que existe é escolher.** Foram três formas antes desta: um link
  geral no topo que cortava todas de uma vez sem dizer de quem eram; uma lista de cortadas
  guardada por identidade; e uma faixa de fichas no alto. Todas partiam de "recebo tudo e
  desligo o que não quero", e o pedido era o contrário — recebo uma. Sem lista de cortadas
  não há estado para envelhecer: a pergunta "esta é a escolhida?" se responde sozinha.
- **Só a live que está no palco é ouvida, e "nenhuma no palco" quer dizer silêncio.** A
  regra antiga só calava uma live quando havia OUTRA em destaque — sem destaque, não calava
  nada, que é o mesmo que tocar todas. Bastava clicar numa câmera, ou pedir "não assistir",
  para o palco ficar sem live e a sopa voltar. A regra mora em `audivel.ts`, pura e testada,
  e o palco é uma conta só (`Stage`): a live em destaque ou, se o destaque for câmera, a
  primeira no ar — a mesma que vai para o quadro flutuante.
- **`track.detach()` no `TrackUnsubscribed` devolve ZERO elementos.** Medido no servidor de
  verdade: o LiveKit já esqueceu quais eram, então o `<audio>` ficava na página para sempre
  e cada "não assistir / assistir de novo" deixava mais um para trás. Por isso o elemento
  carrega o `sid` da faixa: é por ele que se acha o dono na hora de tirar.

## Quem está falando

- **A minha presença na barra lateral sai do LiveKit; a dos outros, da busca.** As duas
  fontes têm relógios diferentes — a busca anda de 4 em 4 segundos e ainda espera o
  LiveKit esquecer quem saiu —, e trocar de sala me punha nas DUAS até ela alcançar. Sobre
  mim não é preciso perguntar: eu sei onde estou. A regra mora em `ocupantes.ts`, pura e
  testada, e conserta junto o "saí da call e continuo aparecendo".
- **Falando é o azul da logo, não verde.** O verde já quer dizer "deu certo" no resto do
  app — o selo "no ar", a bolinha de online —, e falar não é um resultado.
- **Quem está falando é decidido AQUI, do som, não perguntado ao servidor.** O caminho do
  LiveKit é juntar, decidir e mandar de volta; o meu microfone não sai da máquina, e o
  áudio do outro já chegou quando o servidor ainda está decidindo. Medido contra a
  produção, sete voltas na mesma rodada, pelo caminho que o app usa:

  | caminho | mediana |
  |---|---|
  | eu, medindo o meu próprio microfone | **25 ms** |
  | o outro, medindo o áudio que chegou aqui | **267 ms** |
  | o outro, esperando o LiveKit avisar | **394 ms** |

  Cheguei a baixar o `update_interval` do LiveKit de 400/4 para 150/2 e voltei atrás: com
  a conta feita no cliente, ninguém lê mais o `ActiveSpeakersChanged`, e um botão que
  nada exercita é pior que botão nenhum — ainda mais um que só se aplica reiniciando o
  LiveKit, o que derruba todo mundo que estiver em call.
- **A faixa remota só entrega amostras se alguém a estiver consumindo.** Medir o nível de
  uma faixa que chegou, sem `<audio>` preso nela, lê **zero para sempre** — e sem erro
  nenhum, então o anel simplesmente nunca acenderia para os outros e nada apareceria no
  registro. Medido: com o `attach`, 267 ms; sem ele, nunca. Funciona porque o
  `onSubscribed` já prende um elemento em toda faixa de áudio que chega; quem mexer nisso
  precisa saber que o medidor depende disso.
- **O laço que mede se conserta sozinho a cada volta**, em vez de acompanhar eventos de
  faixa. Com oito pessoas entrando, saindo, mutando e trocando de dispositivo, um medidor
  perdido deixaria alguém aceso para sempre. Comparar o que existe com o que está medido
  é barato e não tem ordem de evento para errar.
- **Contexto de áudio suspenso lê zero em tudo**, e não lança nada: seria o anel nunca
  acendendo, para ninguém, sem pista. Entrar na call é sempre um clique, então o
  `resume()` passa — mas ele precisa estar lá.

## O bot de música (23/09/2026)

Pedido do dono: colar um link do YouTube ou do Spotify e tocar na call, como os bots do
Discord — chamado por comando no chat (`/tocar`, `/pular`, `/parar`, `/fila`). Desenho
escolhido na prancheta: opção A, o cartão com capa e botões.

- **A música NÃO sai do servidor, e isso foi medido antes de desenhar.** `yt-dlp` na VPS pegou
  1 vídeo de 5: do segundo em diante, "Sign in to confirm you're not a bot" (IP de
  datacenter). Numa internet de casa, 4 de 4. Contornar isso na VPS pediria logar uma conta
  Google lá, que o YouTube costuma banir. Então quem toca é o APP do **anfitrião** — quem pediu
  a primeira música; se ele sai da call, o servidor passa a quem ficou, e a música continua do
  ponto (pela hora em que começou, no relógio do servidor). A faixa vai como `unknown`, nome
  `musica`: o crachá sem a permissão de transmitir continua deixando passar, e quem ouve tem
  volume próprio para ela (Configurações › Voz e vídeo › Bot de música), separado de voz e de
  soundboard.
- **O servidor só guarda a fila** (`musica.mjs`, na memória: reiniciar zera). Ela é conferida
  na busca de salas, sem relógio de fundo: anfitrião que saiu é trocado, música que passou da
  hora anda sozinha (o app do anfitrião morreu no meio), e sala vazia perde a fila — **depois
  de 20 s vazia**, porque o LiveKit que não responde devolve a lista vazia sem erro, e um
  soluço dele apagaria a fila de quem está ouvindo.
- **O `yt-dlp` não vai no instalador.** Ele é baixado na primeira música para a pasta da Saga e
  trocado quando sai versão nova (conferido a cada 3 dias, e na hora quando ele falha). O
  YouTube quebra o `yt-dlp` mais ou menos por mês; embutido, cada quebra pediria mandar 93 MB a
  todo mundo. **Vai a versão em pasta** (`yt-dlp_macos.zip`), não a de arquivo único: medido
  num Mac, a de arquivo único se desempacota numa pasta nova a cada execução e o macOS a
  inspeciona toda vez — 10 s só para `--version`, a 11% de CPU. A em pasta paga isso uma vez
  e depois parte em 0,26 s. Achar e baixar numa ida só: 3,6 s. Primeira música de um
  computador novo (baixar o programa incluído): ~20 s.
- **A última versão sai do redirecionamento de `releases/latest`, não da API do GitHub.** A API
  tem cota de 60 por hora por IP e respondeu 403 no meio de um teste — cinco amigos atrás do
  mesmo roteador poderiam cair nisso no primeiro `/tocar`.
- **Sem `--no-part`.** Com ele, a música pedida pela segunda vez falhava com HTTP 416: sem o
  `.part`, o arquivo pronto parece um download pela metade, e o YouTube recusa "do fim em
  diante". Achado na bancada, pedindo a mesma música duas vezes.
- **Spotify não entrega áudio**: o link vira "artista título" e a busca é no YouTube, como nos
  bots do Discord. A página do Spotify pedida com cabeçalho de navegador volta vazia (é o app
  web); com o de um programa, traz `og:title` e `og:description`.
- **O cartão diz o que a música é AGORA** (`cartaoDoBot.ts`): tocando (com botões), na fila (em
  que posição) ou já tocou — e só o cartão mais recente de cada música fica grande com botões;
  os anteriores encolhem. Duas cópias de "tocando agora" com os mesmos botões era ruído.
- **As notícias da fila chegam por dois caminhos e se cruzam** (`tocador.ts`): a busca que saiu
  antes do "acabou" do anfitrião chega depois dele, dizendo que a música velha ainda toca.
  Cada resposta traz a hora do servidor, e a mais velha é descartada — fora do estado das
  salas, para não redesenhar a tela de 4 em 4 s.
- **Medido na bancada escondida e muda** (Saga de verdade com o processo principal do build,
  servidor e LiveKit locais, um robô `rtc-node` na call medindo a faixa `musica`): `/tocar` por
  link, por nome e por link do Spotify; a música chegando ao robô entre −18 e −40 dB; fila,
  botão Pular, `/fila`, `/parar` (a faixa sai da call), a fila andando sozinha no fim da música,
  a mesma música duas vezes. **Não exercido**: Windows (o `yt-dlp_win.zip` e o `tar.exe` do
  sistema), o anfitrião passando para outra Saga de verdade, e ouvido humano na call.
- **Primeira semana com o dono (23/09/2026): lento, "travando" e cartão repetido no chat.** Medido
  no registro da Saga dele: 12 s para achar e baixar, e mais 9 s até tocar. O Mac dele estava
  com o **Cloudflare WARP** ligado (interface `utun6`, saída 104.28.x): pedidos ao servidor e ao
  GitHub falhando e voltando, e o SSH até a VPS fechado. O áudio sai do computador de quem pediu,
  então uma internet assim trava a música para todo mundo — na bancada, pelo LiveKit local, os
  20 s medidos chegaram com as 48 000 amostras de cada segundo, sem buraco. O que mudou do nosso
  lado:
  - **o servidor fica sabendo da música antes do download acabar** (`--print before_dl:%()j`):
    dados em 5,1 s, arquivo em 7,2 s, pelo WARP. Quem toca espera o download que já está em
    andamento (`baixando`, por id), sem baixar de novo;
  - **a faixa entra na call enquanto o yt-dlp procura** (`quandoForTocar`), e sai em meio minuto
    se a música for para outro anfitrião;
  - **o anfitrião só perde a vez depois de 10 s fora da call** (`AUSENTE`): internet que pisca
    reconecta em segundos, e trocar a cada piscada recomeçava a música noutro computador;
  - **a partida não é a música andando**: o tocador pulava os primeiros segundos de toda música,
    tratando a espera do download como posição. Só retoma do ponto a partir de 10 s;
  - **o chat não repete mensagem**: a busca de 2 em 2 s que saía antes da resposta do `/tocar` e
    voltava depois trazia de novo a mensagem já mostrada (`juntarMensagens`). Vale para qualquer
    mensagem, e a internet lenta só tornava comum. O servidor tinha gravado UMA — a repetição era
    só na tela.
  Resultado na bancada: do comando ao som no ouvinte, 5,5 a 7,8 s (a busca pelo WARP varia de 2,9
  a 4,4 s); no Mac do dono, antes, uns 21 s. O registro agora anota cada etapa (`achada em`,
  `servidor respondeu em`, `ms depois de saber`), para a próxima reclamação ser medida, não chutada.
- **A revisão antes da v0.63.1 (23/09/2026).** Dois revisores independentes leram tudo desde a
  v0.62.0 (servidor e app), e a bancada mediu o que eles apontaram. O que não é óbvio:
  - **Sala privada**: as rotas do bot procuravam a sala entre TODAS, e a resposta diferente
    contava que uma sala privada existia — e o "acabou" devolvia a fila dela, com quem estava lá
    dentro. Hoje as quatro rotas (`/musica`, `/musica/acabou`, `/musica/comecou`, `GET /musica`)
    respondem para a privada exatamente como para a inexistente (`api.test.mjs` trava), e o bot
    não escreve o nome de sala de voz privada no chat: diz "na call".
  - **A faixa encerrada pela sala** (o maior): ao sair da sala, o LiveKit ENCERRA as faixas
    locais, e publicar de novo uma faixa encerrada não dá erro — só silêncio para os outros,
    com quem toca ouvindo normal. A música (e o soundboard, desde antes do bot) reaproveitava a
    faixa morta. Medido depois do conserto: música e soundboard chegando depois de trocar de
    sala. O defeito antigo do soundboard NÃO foi reproduzido antes do conserto — é leitura do
    código, a mesma do da música, que foi.
  - **O prazo de um `/tocar` velho tirava a faixa da call** enquanto a música nova carregava:
    reproduzido na bancada (música tocando para ninguém), consertado, e três rodadas seguidas
    passaram.
  - **Reconexão**: "reconectando" conta como estar na call, e a faixa não é publicada de novo
    se o LiveKit já a republicou. Medido matando o LiveKit (`kill -9`; o `pkill` comum ele
    espera os participantes saírem e nada cai): volta UMA faixa, com som, em 10 s.
  - **O relógio da música é o do som**: o anfitrião avisa `comecou` com o ponto, e o fim é
    contado dali (a folga de 60 s fica só para o app morto). Quem pediu toca do começo; quem
    caiu e voltou continua do ponto.
  - **O `/pular` diz qual música quer pular**, e o servidor recusa se já for outra — corrida
    reproduzida por simulação na revisão.
  - **Quem cai da call voltava sempre mutado** (defeito antigo): o registro da queda lia o
    microfone depois de o LiveKit já tê-lo tirado. Hoje volta pela escolha (`querFalar`).
  - **Mensagem de amigo podia nunca aparecer** (defeito antigo): mostrar a SUA mensagem na hora
    avançava o marcador da busca para depois dela.
  - Processo principal: o zip do yt-dlp é conferido contra o `SHA2-256SUMS` da própria versão;
    a versão é validada antes de virar pasta; `--ignore-config`; um download por id; versões
    velhas apagadas só na abertura; prazo em todo pedido à internet; áudios limpos de hora em
    hora; o yt-dlp morre junto com a Saga.
  - **Ficou para depois, de propósito**: o áudio atravessa inteiro para a tela por IPC (o teto
    de 2 h limita a ~130 MB; servir por protocolo próprio é a saída); o anfitrião herdado pode
    ser alguém de app antigo, que não toca (aí a fila anda pelo tempo); e a trava de transmitir
    não segura um app modificado que declare a tela como câmera.

## O bot como pessoa, e mover gente entre calls (23/09/2026)

Pedido do dono: "que o bot tenha o mesmo comportamento de pessoa" e "mover pessoas entre as
calls". Escolhas dele na prancheta (fileiras 4 e 5): o menu do bot igual ao de pessoa, e mover
**só arrastando**, como no Discord — recusou o "Mover para" no menu, nas duas formas desenhadas.

- **O bot na barra e no palco**: o clique (esquerdo ou direito) na linha "Música", ou no avatar
  roxo do palco, abre o menu de pessoa dele (`MenuDoBot`): o volume (o mesmo da música, guardado
  neste computador), "Pular esta música", a fila por dentro, e "Tirar da call" (parar e limpar a
  fila). Tirar é de quem tem "Tocar música" — e então só na call em que está — ou de quem pode
  tirar PESSOAS da call, de onde estiver: um moderador cala o bot sem mexer com música
  (`POST /musica/acao`).
- **Mover é permissão própria**, "Mover pessoas" (`moverPessoas`), nascida desligada, e é ação
  sobre alguém: só alcança quem está abaixo. O destino tem de ser uma sala que a PESSOA MOVIDA
  enxerga. Arrastar a si mesmo é só trocar de sala.
- **Quem troca de sala é o app da pessoa**, pelo caminho de sempre (crachá novo, microfone como
  estava), e ela vê "TKP moveu você para Jogos". O servidor avisa pela call — e **a mensagem pela
  call não prova de onde veio**: medido na bancada, um "mover" forjado por uma participante comum
  chegou SEM remetente, igual ao do servidor, e a Saga obedeceu (qualquer um da call moveria
  qualquer um, o dono inclusive). Hoje pela call vai só `{tipo: 'confira'}`; a ordem fica no
  servidor, por um minuto e uma vez só, e o app a busca com a própria sessão
  (`POST /eu/movimento`). Medido depois: a forjada é ignorada, a de verdade move (a Saga da Bia foi
  para a Jogos e mostrou o aviso). Um "confira" no meio da espera de outro vira uma pergunta a
  mais, e não se perde.
- **Arrastar pessoa não arrasta a sala**: a linha da sala também é arrastável (reordenar), e o
  começo do arrastar da pessoa para a propagação. Só sala de voz, e não a de origem, acende.
- **App antigo não obedece**: a v0.63.1 e anteriores não conhecem o "confira", e quem estiver
  numa delas simplesmente não é movido.
- **Quem move vê a pessoa na sala nova NA HORA** (`aCaminho`, no `App`). O dono, na v0.64.0:
  "ele se vê na call que eu movi, porém ele some pra mim". Medido na bancada: a pessoa sumia da
  sala de origem em 0,2 s e só aparecia na de destino em ~8 s. Eram duas demoras somadas:
  - **A contagem do LiveKit atrasa**, e o servidor confiava nela. `listRooms` diz quantos há em
    cada sala (`numParticipants`), e o servidor pulava as salas com 0 — mas o LiveKit atualiza
    esse número de tempos em tempos: quem entrou numa sala vazia estava no `listParticipants`
    em 1,2 s e a contagem ficou em 0 até 6,1 s. Não era só mover: QUALQUER pessoa entrando numa
    sala vazia sumia da barra dos outros por esses segundos, e o bot respondia "entre numa sala
    de voz" a quem tinha acabado de entrar numa. Hoje o servidor olha só se a sala EXISTE
    (`nomesDasSalasVivas`); sala vazia some do LiveKit uns 20 s depois do último sair, então
    perguntar a ela custa pouco. `api-livekit.test.mjs` sobe o servidor contra um LiveKit de
    mentira com a contagem em 0 e gente dentro — com o código antigo, os dois testes falham.
  - **A barra só pergunta de 4 em 4 s.** Depois de mover, ela pergunta de novo em 1,5, 3, 5 e 8 s,
    e até lá mostra a pessoa na sala nova, um pouco apagada (`li.chegando`); sai do otimista
    quando a busca a confirma lá, ou em 15 s.

  Medido depois, com o arrasto para uma sala vazia: para quem moveu, a pessoa aparece na sala
  nova em 30 ms e a busca confirma em 1,5 s; a Saga da pessoa movida entra em 0,7 s.

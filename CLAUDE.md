# Cantinho do Vorcaro

App de desktop (Windows e Mac) estilo Discord para um grupo de amigos: contas com cargos
que o dono desenha, salas de voz e de texto, câmera, compartilhamento de tela, soundboard,
perfis com GIF e vários servidores. Hoje, ~5 pessoas num servidor.

```
app/      Electron + React (o que os amigos instalam)
server/   Node puro + SQLite + LiveKit (o que fica no ar 24 h)
```

## Como trabalhamos

- **Pergunte antes de publicar.** Agrupe vários pedidos numa versão só; publicar uma
  versão por pedido polui a lista e obriga cada amigo a baixar 93 MB de novo. Implemente,
  teste, deixe commitado **sem tag**, e pergunte "é só isso?". Correção que quebra o uso
  fura a fila.
- **Sem rodapé de atribuição em commits.** Nada de `Co-Authored-By` nem link de sessão.
- **Nada publica com teste falhando** — o CI roda testes e typecheck antes de gerar
  instalador.
- **O que não foi testado, se diz.** Windows, som, câmera e microfone dependem de o dono
  confirmar; nunca marcar como pronto o que só foi verificado no papel.
- Versão: mexe no **meio** (v0.**9**.0) quando chega funcionalidade; no **último**
  (v0.9.**1**) quando é conserto.

## Produção

| | |
|---|---|
| Servidor | `76.13.225.79:3001` (VPS Hostinger, Ubuntu 24.04, root por chave SSH) |
| Arquivos | `/root/server`, compose `docker-compose.ip.yml`, banco em `/dados` |
| Repositório | `AbnerTKP/cantinho-do-vorcaro`, link fixo `/releases/latest` |
| Dono | apelido `TKP` |
| Chave do Giphy | `GIPHY_KEY` no `.env` da VPS; vazio desliga a busca sem quebrar nada |

Publicar servidor: `scp *.mjs Dockerfile root@…:/root/server/` e
`docker compose -f docker-compose.ip.yml up -d --build token`.

## Como está montado

**Servidor** — Node puro, sem framework. `index.mjs` é a tabela de rotas; a lógica mora em
módulos que não sabem de HTTP: `permissoes.mjs` (regras puras de quem pode o quê),
`cargos.mjs`, `membros.mjs`, `salas.mjs`, `mensagens.mjs`, `sons.mjs`, `servidores.mjs`,
`arquivos.mjs`, `giphy.mjs`, `contas.mjs`, `banco.mjs`.

**App** — Electron + React. `useRoom.ts` cuida do LiveKit; `useChat.ts` do chat; a lógica
que dá para testar sem tela fica em módulos puros: `permissoes` do lado do servidor tem
paralelo em `api.ts` (`pode`, `podeSobre`), e `qualidades.ts`, `volume.ts`, `sinal.ts`,
`erros.ts` e `audivel.ts` são pequenos e testados.

**Identidade** — a conta (apelido + senha) é global; cargo, banimento, castigo, nome
exibido, Turbo e identificador pertencem ao vínculo pessoa↔servidor.

## Decisões que não são óbvias no código

- **Migrações são registradas pela posição na lista.** Nunca editar, remover ou inserir no
  meio — só acrescentar no fim. Inserir no meio já derrubou a produção; `banco.test.mjs`
  trava a ordem por impressão digital.
- **O `Dockerfile` copia `*.mjs` e descarta os testes.** Listar arquivo por arquivo já
  derrubou o servidor duas vezes.
- **Cargo, banimento e nome exibido pertencem ao vínculo pessoa↔servidor**, não à pessoa.
  A conta é global. É o que permitirá vários servidores sem migrar dados.
- **Ninguém age sobre alguém de cargo igual ou superior** — é o que sustenta toda a
  moderação. A regra vive em `permissoes.mjs`, puro e testado à exaustão, e só vale para
  ações que recaem sobre alguém: criar sala não pergunta "acima de quem?".
- **O dono tem todas as permissões por ser dono**, não por constar numa lista: editar o
  cargo dele no banco não pode deixar o servidor sem conserto.
- **Permissão inventada é descartada**, e **ninguém dá a um cargo permissão que não tem** —
  seria contornar o próprio limite criando um cargo mais forte e vestindo-o depois.
- **A sala no LiveKit é identificada pelo id, não pelo nome.** Duas salas "Geral" em
  servidores diferentes cairiam na mesma conversa.
- **Pedir por um servidor de que não se faz parte cai no seu próprio**, sem erro e sem
  entrada: saber o número de um servidor alheio não abre porta.
- **Quem foi banido de todos os servidores ainda entra na conta**, para ver o motivo.
- **As salas do `.env` semeiam só o primeiro arranque.** Semeando sempre, uma sala apagada
  voltaria no reinício seguinte e ninguém ligaria uma coisa à outra.
- **1080p e 60 quadros são do Vorcaro Turbo**, e a régua (`qualidades.ts`) vale tanto na
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
- **A janela nasce escondida** e só aparece quando a consulta de atualização resolve — ou
  já com a barra de progresso. Quem clica no ícone espera um app já atualizado.
- **`volume` de elemento de áudio só aceita de 0 a 1.** Passar disso lança exceção, e
  dentro de um efeito do React isso derruba a tela inteira. Tudo passa por `volume.ts`.
- **Banir e dar castigo também tiram da call.** Sem isso a punição parece não funcionar.
  A remoção é consequência: se o LiveKit estiver fora, o registro vale do mesmo jeito.
- **Nome de arquivo é o hash do conteúdo.** Dá cache eterno, deduplicação, e ninguém
  escolhe o nome — o que elimina escrita fora da pasta.
- **Imagem e som são validados pela assinatura dos bytes**, nunca pelo `content-type`.
- **A tela vai sem simulcast.** Com ele, o `adaptiveStream` de quem assiste escolhia a
  versão menor sempre que a janela era menor que a tela transmitida — era a imagem borrada.
  Com uma faixa só, `adaptiveStream` não tira nada: medido, quem assiste num `<video>` de
  1280x720 recebe os 1920x1080 inteiros. O `dynacast` continua útil — ele para de mandar
  quando ninguém assiste (medido: sala sem plateia, 0 kbps) e volta sozinho.
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
- **`loopbackWithoutChrome` é o modo que exclui o próprio app**, e é o primeiro da fila. A
  tipagem da Electron só conhece dois valores, mas ela repassa a string crua como id de
  dispositivo e o Chromium a reconhece — é o mesmo id que o Chrome usa para atender
  `restrictOwnAudio`. Medido aqui com o Electron do projeto: `loopback` →
  `deviceId: "loopback"`, `loopbackWithoutChrome` → `deviceId: "loopbackWithoutChrome"`, e
  uma string inventada → `NotReadableError`. Ou seja, é dispositivo de verdade, não string
  ignorada. Por dentro é captura por processo, então pede Windows 11 ou macOS 14.2: onde
  não houver, ou lança (e a fila cai para `loopback`) ou vem muda — e é só por isso que
  faixa muda **neste modo** cai para o próximo, em vez de só avisar como nos outros. Cair
  de `loopback` para `loopbackWithMute` seria pior que o problema. De quebra, ele destravou
  a máquina do headset Logitech — ver "A limitação que caiu sem ser atacada".
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
- **Região de arraste engole clique de tudo que é desenhado por cima.** Qualquer coisa
  flutuante precisa de `-webkit-app-region: no-drag`.
- **Contêiner de canto não recebe clique — só os cartões dentro dele.** A pilha de avisos
  é larga e quase toda vazia, e fica por cima do quadro flutuante da live: sem
  `pointer-events: none` no contêiner e `auto` nos cartões, o vão entre um aviso e outro
  come o clique do que está por baixo. Vale para qualquer coisa que se ancore num canto.
- **O CSP precisa de `http:`/`https:` em `img-src` e `media-src`**: a página vem de
  `file://`, então `'self'` não cobre o servidor.
- **Uma coisa por vez no palco: vídeo OU chat.** O chat já morou como coluna dentro da
  sala de voz, dividindo espaço com a transmissão — as duas ficavam apertadas, e chat não é
  da sala de voz, é da sala de chat. Quem está na voz e abre o chat não perde a live: ela
  vira um quadro flutuante no canto, que abre em tela cheia com dois cliques.
- **O soundboard vai numa faixa própria**, não misturado ao microfone: tocar não depende
  de microfone ligado, e mutar alguém não muta os sons dele.
- **O som da live também anda em faixa própria** (`ScreenShareAudio`), separada do vídeo.
  Quem corta a live tem de cortar as duas: "não assistir" desinscrevia só o vídeo, e o som
  de todas as lives continuava entrando e tocando com a tela apagada. Medido: cortando só
  o vídeo, `screen_share=cortado` e `screen_share_audio=RECEBENDO`.
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
- **Enquadrar não é recortar.** Recortar significa redesenhar a imagem, e um GIF
  redesenhado perde a animação — o que o Vorcaro Turbo destrava. Guardamos posição e
  aproximação, e aplicamos ao mostrar; o arquivo enviado nunca é tocado. A imagem também
  não é reduzida: vai como veio, e o que torna isso aceitável é o nome ser o hash do
  conteúdo, então cada pessoa baixa uma vez. A conta é uma só (`enquadramento.ts`), usada
  pela prévia do editor e por todo lugar que desenha — é isso que faz o resultado ser o
  que a pessoa viu ao ajustar. O servidor tem a mesma régua, porque o que vem do app
  nunca é palavra final.
- **Quem diz o tipo do aviso é o servidor**, não o app adivinhando pelo texto. "Isso é do
  Vorcaro Turbo" é convite, não falha, e pintá-lo de vermelho faz a pessoa achar que
  quebrou alguma coisa. Erro fica na tela até fecharem; o resto some sozinho.
- **O marcador de mensagem lida fica no computador de quem lê**, e viaja na busca de
  salas que já acontecia. Guardar no banco pediria tabela nova para um problema que
  ninguém tem. Ele só anda para a frente: uma resposta atrasada desmarcaria o que já foi
  lido. O que a própria pessoa escreveu não conta como não lido.
- **O aviso de quem chegou é da sala em que você está**, e só dela. O som avisa quem está
  de fone; o recado na tela avisa quem está com a janela noutro lugar — que é justamente
  quando você não vê a lista lateral. Sala em que você não está não vira aviso.
- **GIF no chat não é do Turbo.** O que o Turbo destrava é a imagem animada no perfil.
- **Os sons de aviso vão dentro do app.** São 30 KB; aviso que precisa ser baixado chega
  depois do fato. O mesmo som não repete em menos de 400 ms, senão três pessoas entrando
  juntas viram ruído.
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

## Testes

```bash
pnpm test        # servidor (184) + app (57), segundos, sem nada externo
pnpm test:sala   # 3 participantes WebRTC reais numa sala; precisa de servidor no ar
```

Os do app usam `--experimental-strip-types`, então rodam o `.ts` direto e o import precisa
da extensão (`allowImportingTsExtensions` no tsconfig).

`TESTE_SERVIDOR=76.13.225.79:3001 TESTE_SENHA=… pnpm test:sala`

## Depois disso

1. **Atualização automática no Mac** — hoje só avisa, e são **três** travas, não uma:
   (a) `update.ts` nem chama o atualizador no Mac — o caminho de lá é escrito à mão e só
   avisa; (b) o `electron-builder.yml` só gera `dmg`, e o mecanismo do Mac exige o alvo
   `zip`; (c) a assinatura, que o certificado próprio resolve. Certificado sozinho não liga
   nada — esta linha já atribuiu tudo à assinatura, e estava errada.
2. **Atalhos de teclado no soundboard** — ficou planejado na v0.4.0 e não saiu.
3. **Modo música** — desligar cancelamento de eco, ruído e ganho para quem toca instrumento.
4. **Ícone do Mac** em retângulo arredondado, como manda o sistema.

## O que só o dono pode confirmar

- A atualização abrindo já atualizada no Windows (v0.16.2) — exige uma atualização real
  acontecendo com alguém do outro lado.
- Som, câmera, microfone e compartilhamento de tela em máquinas que não são este Mac.
- **Se o modo de tela (`detail`) segura os quadros no conteúdo real dele.** O que está
  medido é o extremo: numa cena artificial de ruído fino em panorâmica, protegendo a
  nitidez a transmissão cai para 2–4 quadros — inútil. Nenhuma tela de verdade é tão
  difícil (na cena realista foram 30 quadros cheios, imediatos), mas jogo pesado a 30
  quadros é justamente o caso que não foi exercido. Se travar, o caminho é escolher 60
  quadros, que segue protegendo a fluidez como antes.
- **Se o certificado próprio realmente segura a permissão no macOS 26.** O que está medido
  é o requisito ficar idêntico entre builds; que o TCC case a permissão por ele é
  comportamento documentado da Apple, não coisa medida aqui — o `TCC.db` não abre sem
  Acesso Total ao Disco. O teste é: assinar, conceder a tela, subir a versão, reassinar com
  o mesmo certificado, reinstalar e ver se o `Failed to match existing code requirement`
  some do `log show`.
- **Se o DMG assinado com certificado próprio abre nos outros Macs** sem virar "está
  danificado". Ninguém testou, e é o risco que atinge os quatro de uma vez.
- **Se o `loopbackWithoutChrome` de fato corta o retorno de voz.** O que está medido é o
  dispositivo abrir e ser um dispositivo distinto. Que ele remova as nossas vozes da
  captura exige duas pessoas numa call de verdade — e no Windows nada disso foi exercido.
- **Por que a faixa de áudio da tela vem silenciosa neste Mac** nos dois modos, com a
  chave de permissão presente no Info.plist. Não foi explicado.

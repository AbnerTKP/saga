# O que só o dono pode confirmar

O que foi medido e o que não foi exercido, por funcionalidade. Quando o dono confirmar algo, risque aqui.

- **A reestruturação da interface (18/09/2026): trilha à esquerda, configurações em páginas,
  tema Noite, Figtree, foto do servidor enquadrável, barra da call no palco.** O que está medido:
  typecheck, os testes (os novos: `design.test.ts`, `configurar.test.ts`,
  `paginasDeConfiguracao.test.ts`, `ultimaSala.test.ts` e o de `PATCH /servidor/enquadramento`
  no `api.test.mjs`), e cada tela fotografada no RENDERER de verdade, num Chrome headless contra
  servidor e LiveKit locais, a 1280×800 e a 900×560, entrando pela tela de login e clicando:
  o menu do botão direito com o submenu, as seis páginas do servidor, as cinco das suas, a busca,
  o "…" de uma pessoa, a sala privada, a foto larga enquadrada aparecendo na trilha e no alto da
  barra, e a barra da call no palco. **Não foi exercido**: o app no ELECTRON (a janela, a faixa
  do Mac com os semáforos por cima, a barra do Windows acima da caixa de configurações); nada no
  WINDOWS (a Figtree lá, a caixa grande virando tela cheia sob a barra de 34 px); uma call com
  gente, câmera e live de verdade usando a barra do palco; o enquadramento feito ARRASTANDO no
  editor (a rota foi chamada direto); o soundboard e os jogos abertos pela call nova. **O servidor
  sobe junto**: a migração 56 roda na primeira subida; app novo com servidor antigo não enquadra
  a foto do servidor (diz por quê) e o resto funciona; app antigo com servidor novo ignora o
  campo novo.


- **O e-mail da conta, com um e-mail de verdade chegando a alguém que não é o dono.** Está
  DESLIGADO na produção até existir um domínio verificado no Resend. O que está medido: a
  chave do Resend, em 17/09/2026 — é válida, restrita a enviar, entrega em `abnertkp@gmail.com`
  e responde 403 ("You can only send testing emails to your own email address") para qualquer
  outro endereço, inclusive `abnertkp+saga@gmail.com`; as regras (`email-conta.test.mjs`), o
  envio contra um Resend de mentira com as respostas reais (`email.test.mjs`) e o caminho
  inteiro pela rede, com o código lido da caixa falsa (`api-email.test.mjs`); doze garantias
  quebradas de propósito, uma a uma, até o teste delas falhar; e as telas na Saga escondida
  contra servidor local e Resend falso, por clique — ver `docs/decisoes/telas-e-visual.md`. **Não
  foi exercido**: o e-mail saindo pelo Resend de verdade com um domínio, caindo ou não no spam
  do Gmail e do Outlook; alguém do grupo confirmando o código no próprio computador; o pedido
  aparecendo para as 33 contas antigas no dia em que o envio for ligado; e nada disso no
  Windows. **O servidor sobe junto**: app novo com servidor antigo não pede e-mail (o servidor
  antigo não manda `precisaDeEmail`), e app antigo com servidor novo também não — ele não
  conhece o campo. **Ligar é o dono pôr `RESEND_KEY` e `EMAIL_DE` no `.env` da VPS e reiniciar**
  — e só depois de verificar o domínio: sem ele, a trava fica de pé para o grupo inteiro e só
  cede pela saída de "entrar sem e-mail por agora".
- A atualização abrindo já atualizada no Windows (v0.16.2) — exige uma atualização real
  acontecendo com alguém do outro lado.
- **Recuperar a senha, de ponta a ponta, no app de verdade.** O que está medido: as rotas
  por HTTP contra o servidor de verdade (`api.test.mjs`), as regras em `contas.test.mjs`,
  cada garantia quebrada de propósito numa cópia até um teste falhar, e as telas com os
  componentes reais e o `styles.css`, só que com `fetch` e ponte falsos. Não foi
  exercido: gerar o código no bloco "Berserk e senha" — que hoje mora na aba Contas da
  administração da Saga, e não mais em "Sua conta", onde o dono aprovou as telas; copiar pela ponte do
  processo principal (`log:copiar`); usar o código noutra máquina e já entrar; ver a outra
  sessão cair e sair da call; a tela inicial sem servidor voltando ao login pelo sinal de
  vida; outra conta entrando depois naquele computador sem nada da anterior na tela, nem
  painel ou menu que estava aberto; e nada disso no Windows — o cartão de entrar debaixo
  da barra da janela foi medido só com o `styles.css` e a barra montada à mão, no Electron
  deste Mac. **O servidor sobe junto**: app novo com servidor antigo mostra "o servidor
  precisa ser atualizado". **As três telas foram feitas antes da regra do `/design`**, na
  v0.44.0, e o dono as aprovou em 13/09/2026 pelas capturas dos componentes reais, sem
  opções lado a lado: o "Esqueci a senha" e o modo de recuperar na tela de entrar, a seção
  Senha em "Sua conta" e o formulário da senha do dono com o código dentro do cartão da
  conta, em "Berserk e senha". Ficou como está o que a medição mostrou: com 712 px, o
  cartão de recuperar já nasce rolando na janela padrão do Windows (1200x760, 36 px); no
  Mac, numa janela de 720 px de altura, o "ver o registro" sai cortado na borda sem nada
  dizer que o cartão rola; e a barra de rolagem dele entra na curva do canto de baixo,
  como a de todo contêiner arredondado que rola no app (o corpo dos painéis, a lista de
  cargos).
- Som, câmera, microfone e compartilhamento de tela em máquinas que não são este Mac.
- **Se o modo de tela (`detail`) segura os quadros no conteúdo real dele.** O que está
  medido é o extremo: numa cena artificial de ruído fino em panorâmica, protegendo a
  nitidez a transmissão cai para 2–4 quadros — inútil. Nenhuma tela de verdade é tão
  difícil (na cena realista foram 30 quadros cheios, imediatos), mas jogo pesado a 30
  quadros é justamente o caso que não foi exercido. Se travar, o caminho é escolher 60
  quadros, que segue protegendo a fluidez como antes.
- ~~**Se o certificado próprio realmente segura a permissão no macOS 26.**~~ **Segura —
  medido em 10/09/2026, na máquina do dono.** O requisito designado da v0.40.0 instalada e
  o da v0.41.0 são idênticos byte a byte (`identifier "br.com.vorcaro.cantinho" and
  certificate leaf = H"9134fc12…"`), em dois builds de execuções diferentes do CI. E, com
  a v0.41.0 recém-instalada por cima, o registro dele mostra `capturando tela inteira` e
  `1728x1080 a 45 quadros` sem nenhuma passagem por conceder permissão de novo. Era a
  única coisa que o certificado prometia, e é a que ele entregou: o Gatekeeper continua
  recusando igual.
- **Se o DMG assinado com certificado próprio abre nos outros Macs** sem virar "está
  danificado". Ninguém testou, e é o risco que atinge os quatro de uma vez.
- **Se o `restrictOwnAudio` de fato corta o retorno de voz.** No Mac, o
  `loopbackWithoutChrome` sozinho NÃO cortava — isso está medido, e é o que causou o
  retorno que o dono ouviu. O que está medido do conserto é a constraint chegar e voltar
  `true` na faixa. **A prova acústica não foi feita**: o tom tocado dentro do app sumindo
  da captura exige som audível na máquina, e a captura do Electron de desenvolvimento aqui
  vem silenciosa com a saída no mudo e passou a recusar (`AbortError: Error starting
  capture`) depois de muitas aberturas seguidas. Quem fecha isto é transmitir com duas
  pessoas numa call — e no Windows nada disso foi exercido.
- **Por que a faixa de áudio da tela vem silenciosa neste Mac** nos dois modos, com a
  chave de permissão presente no Info.plist. Não foi explicado.
- **O volume do soundboard mexendo no som de verdade.** Está medido que o som do
  soundboard chega reconhecível (a fonte `unknown`, com o nome junto) e que o desenho da
  chave fecha; ouvir o som de outra pessoa mais baixo, numa call, não foi exercido.
- **A conversa privada entre duas pessoas de verdade.** O que está medido, no app de
  verdade e em janela escondida contra um servidor local: entrar, abrir as conversas, a
  tela de amigos com as três seções, aceitar um pedido, abrir a conversa pelo botão do
  amigo e pelo cartão do perfil, mandar mensagem e vê-la na tela, a prévia e o "não lidas"
  na coluna da esquerda, a lista de pessoas sumindo no modo conversas, e o clique no
  quadrado devolvendo o servidor com as salas — tudo conferido também em imagem. **Não
  foram exercidos**: duas pessoas em dois computadores (o aviso de mensagem nova chegando
  do outro lado, o "está digitando" de verdade), anexo e GIF dentro de uma conversa, e a
  amizade desfeita com a janela do outro aberta.
- **A lista de quem está assistindo, numa call de verdade.** O que está medido é o
  mecanismo — o atributo indo e voltando por um LiveKit de verdade, com o mesmo
  `livekit-client` do app, e o desenho conferido em imagem. Duas pessoas numa call, uma
  transmitindo e a outra escolhendo e largando a transmissão, não foi exercido.
- **A linha de "fulano está compartilhando a tela", com uma tela de verdade no ar.** O que
  está medido é a conta (`lives.ts`, pura e testada, inclusive a plateia sem contar quem
  olha a própria live) e o desenho, renderizado com o `styles.css` de verdade. O caminho
  inteiro — alguém abre a tela, a linha aparece na conversa em até 4 s, o "Entrar e
  assistir" entra na voz e põe a live no quadro flutuante sem tirar você do chat — precisa
  de LiveKit e de duas pessoas, e não foi exercido.
- **O assistir live novo com uma tela e um som de verdade.** O que está medido, na janela
  escondida contra um LiveKit local, é o fluxo inteiro com uma faixa de tela sem imagem e
  sem som: selo, cartão, entrar na call, controles aparecendo e sumindo, volume e mudo,
  preencher, quadro flutuante e sair. O volume mexendo num som de verdade, os controles em
  tela cheia e a imagem de alguém transmitindo não foram exercidos.
- **Abrir junto com o Windows, inteiro.** Nada disso foi exercido em Windows nenhum: a
  entrada aparecer no registro e na lista de programas que abrem sozinhos, o
  `--ao-iniciar` chegando de verdade ao app, a janela vindo encolhida na barra de tarefas
  em vez de tomar a tela, e o clique no ícone trazendo de volta a Saga que já estava
  aberta. O que está medido é o comportamento do processo principal aqui no Mac, com as
  chamadas de janela interceptadas.
- **O cartão e o menu de quem está numa call de OUTRO servidor.** O que está medido no app
  de verdade é o caso que o dono viu: cartão aberto pela lista do servidor aberto, com a
  pessoa vista antes na call de outro. O caminho do palco — voz no CORNUME, olhos no
  "teste", clique em alguém da call — mostrando o cargo do CORNUME e o menu sem moderação
  está nos testes de `pessoas.ts` e no typecheck; numa call de verdade, não foi exercido.
- **Os sons de mutar, desmutar e da própria live, ouvidos numa call.** O que está medido
  é o arquivo tocando no app de verdade, com o CSP de verdade e a saída muda. Clicar no
  microfone numa call e ouvir, e começar a compartilhar e ouvir o "live", precisa de
  LiveKit e de ouvido, e não foi exercido.
- **A supressão de ruído com microfone e casa de verdade.** O que está medido é o caminho
  inteiro com áudio sintetizado (voz do `say`, ruído rosa, uma TV feita de outra voz e
  cliques de teclado) entrando como faixa de microfone, e o que chega a um segundo
  participante por um LiveKit local; e, no app compilado em janela escondida contra
  servidor e LiveKit locais, o cartão do botão direito dentro e fora da call, o bloco de
  "Sua conta", ajustar à mão e trocar para Padrão. **Não foram exercidos**: voz humana num
  microfone de verdade (a fidelidade medida é com voz sintetizada), barulho de casa de
  verdade, o Forte em Windows e em máquina fraca, trocar de microfone com a call aberta, e
  um amigo dizendo que parou de ouvir a TV.
- **A barra da janela no Windows de verdade.** O que está medido é o app compilado numa
  janela escondida aqui no Mac, com a plataforma fingida de Windows: a barra de 34 px nas
  telas, os três botões de 46x33 colados no canto, a faixa arrastável e os botões não, o
  clique em cada um chamando minimizar, maximizar e fechar, o botão do meio virando
  "Restaurar", e o fundo de um painel começando abaixo dela. **Nada disso foi exercido
  numa janela Windows**: arrastar pela faixa, dois cliques maximizando, encaixar no topo e
  nas laterais, esticar pelas bordas, a janela maximizada sem sobrar borda, e o fechar no
  canto da tela.
- **O overlay por cima de um jogo de verdade.** O que está medido, no app de verdade e em
  janela escondida, é o mecanismo inteiro: a janela abrindo acima de tudo e fora da barra
  de tarefas, os quadros chegando a 1280x720, travar e destravar, esticar pela quina, o
  atalho sendo aceito e recusado, o botão de som falando com o app, fechar avisando o app,
  e reabrir no mesmo canto e tamanho. **Não foi exercido**: um jogo na frente. Jogo em
  **tela cheia exclusiva** no Windows tapa qualquer janela, overlay incluído — o caminho
  ali é jogar em janela sem borda, que é como quase todo jogo roda hoje. No Mac, o espaço
  próprio da tela cheia está coberto pela chamada de `visibleOnAllWorkspaces`, mas isso
  também não foi visto acontecendo. E a live por trás disso tudo vem de uma call de
  verdade, com duas pessoas, que não foi exercida.
- **O xadrez entre duas pessoas de verdade.** O que está medido, na janela escondida contra
  um servidor local, é o caminho inteiro com o adversário e a plateia agindo por HTTP: a
  mesa abrindo em 0,1 s, o convite chegando ao outro em 20 ms e ao canto da tela em 1,7 s, o
  lance do outro aparecendo em 0,3 s, o relógio andando, a plateia na coluna, a faixa no
  chat, o controle na barra e na lista, a desistência e a revanche — tudo conferido também
  em imagem. **Não foram exercidos**: duas pessoas em dois computadores, o som do convite
  tocando, e uma partida inteira até o mate ou até o tempo acabar.
- **A Fórmula 1 entre pessoas de verdade.** O que está medido, na janela escondida e MUDA contra
  servidor e LiveKit locais, com dois pilotos automáticos pelo `@livekit/rtc-node` usando a
  mesma física: a escolha da pista pela tela, a largada, corridas inteiras de 3 voltas
  assistindo (Mônaco, Las Vegas e Interlagos) e pilotando (Monza e Bahrein, com o meu carro
  guiado por teclas que um terceiro piloto automático mandava), a bandeira verde, a amarela com
  um carro parado, a preta e branca e os +3 s ao cortar a T1 do Bahrein, a punição somada no
  pódio, a torre, o mapinha, a velocidade e o tempo da volta — conferido em imagem, a 60
  quadros. **Não foram exercidos**: gente pilotando no teclado (o volante de verdade, a
  sensação de freada e de curva), dois computadores, a bandeira azul numa corrida (só no teste
  da regra), os sons de ouvido, uma corrida com oito carros e máquina fraca ou Windows. **Da
  segunda rodada**: o cartão de convite foi visto no app escondido (a F1 de outro servidor e o
  xadrez do aberto juntos no canto, o "Agora não" recusando no servidor e o "Correr" trocando
  de servidor); a volta da sala da corrida, medida com o participante tirado pelo LiveKit e com
  os outros calados. **Não foram exercidos**: o motor novo de ouvido, o som do convite, o
  cartão com uma foto de perfil de verdade, a queda do Tava1 como ela aconteceu (canal de dados
  indisponível numa rede ruim) e a corrida com ele de novo.
- **A administração da Saga com gente de verdade em call, e contra a produção.** O que está
  medido, na janela escondida contra um servidor local num cenário parecido com a produção
  (CORNUME e CARDUME, banido, sala privada com e sem cargo, sala de notas), é a tela
  inteira: a porta só para o dono, a lista e o detalhe, a busca, a aba Contas, a janela de
  900 px, e nenhum texto de mensagem na resposta nem na tela. "Em call" e "Em call agora"
  vieram de um LiveKit FALSO — as respostas de `ListRooms` e `ListParticipants` escritas à
  mão —, e não do LiveKit da produção. **Não foram exercidos**: a administração contra o
  servidor e o LiveKit de produção, com as pessoas de verdade, e o Windows.
- **Microfone de verdade: trocar, desconectar e o padrão do sistema** (16/09/2026). Medido numa
  bancada com os microfones falsos do Chromium (ver `decisoes/som-e-microfone.md`): trocar pela
  Saga, a faixa que acaba, mutar e religar, "Padrão do sistema" e a troca que falha. **Não foram
  exercidos**: tirar um headset USB ou Bluetooth de verdade no meio da call (no Mac e no Windows);
  a Saga voltar sozinha para o microfone escolhido quando ele é conectado de novo; trocar o
  microfone do SISTEMA com a Saga no "Padrão do sistema" e ela acompanhar (a conta é pelo grupo do
  aparelho, e o Chromium pode não mudar o grupo do `default` do mesmo jeito nos dois sistemas); e
  o microfone escolhido continuar valendo depois de fechar e abrir a Saga (os ids dos aparelhos
  não mudam entre aberturas, medido; a escolha voltando numa call de verdade, não). Nem o volume
  de cada pessoa, a saída de som e a câmera voltando depois de fechar e abrir.
- **O Dragão Quadrado entre duas pessoas de verdade.** O que está medido está na seção do
  jogo. **Não foram exercidos**: dois computadores com gente no teclado, pela produção e com
  a latência real entre as casas; o som (sintetizado em `sons.ts`, nunca ouvido — os testes
  são mudos); o Windows e máquina fraca; a plateia com a tela do app (só com robô); a
  reconexão depois de uma queda de verdade no meio da luta; e se a luta está equilibrada e
  divertida, que é de mão e não de teste. Os sons gravados (grito, transformação, teletransporte,
  raios) foram medidos em LUFS e nunca ouvidos aqui: o equilíbrio entre eles é de ouvido, e é do
  dono. **Os três de 16/09/2026** (Goiaba e Vegetal da Super Feira, Goteira) só foram vistos em
  imagem e simulados: a ficha de cada um — vida, velocidade, a bola lenta no especial — foi
  conferida por dano medido contra um alvo parado, e nunca jogada. O mesmo vale para o **Gotinha e o
  Tronco**, e a fileira de nove retratos só foi vista na prévia, nunca no app aberto. **As telas de
  jogo em pixel (17/09/2026)** — título, escolha, convite, opções, VS, desistir, fim e o cartão —
  foram percorridas pela Saga escondida contra servidor e LiveKit locais, por teclado e por clique,
  com o amigo respondendo pela rede. **Não foram exercidos**: duas pessoas de verdade, o Windows, os
  bipes de menu (nunca ouvidos) e a tela numa janela pequena.

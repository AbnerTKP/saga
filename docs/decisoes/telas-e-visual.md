# Telas e visual

Paleta, camadas, painéis, cargos na tela, perfis, administração da Saga, relatar.

## Decisões que não são óbvias no código

- **A marca do Berserk é o S da Saga.** Foi o Mjölnir, e antes dele um raio; um valknut e
  uma runa Thurisaz chegaram a ser desenhados e viraram triângulo e seta a 13 px. O que
  faltava a todos era o mesmo: eram símbolo à parte, e a distinção é do app. O desenho
  **não foi imitado de olho** — a logo foi lida em grade (silhueta clara dentro do disco
  preto, 60x30) e os oito vértices vieram convertidos daí, então as duas mordidas e a
  inclinação são as de lá. As três primeiras tentativas feitas de olho saíram "Z": a
  diagonal do meio desce da esquerda para a direita, e é ela que decide se é S ou Z.
  Continua cheio e sem detalhe, porque ele vive a 13 px ao lado do nome.
- **O Berserk não aparece dentro da call.** A linha da call é a mais estreita do app e
  carrega até quatro marcas; o nome de quem tem Berserk já vem na cor dele, então o ícone
  repetia o que a cor diz e ocupava a vaga de câmera, microfone e live — que dizem coisas
  do momento, não da conta. Nos outros lugares ele fica.
- **Na tela de entrar, quem rola é o CARTÃO.** A recuperação com erro tem 784 px e a
  janela mínima, 560. O `body` não rola, então o botão ficava inalcançável. Rolar o
  `.connect` resolvia a roda do mouse, mas punha a barra de rolagem na região de arraste,
  que engole clique. Medido no Electron do projeto, em 760, 700, 650 e 560 px: a roda
  sobre o cartão desce até o botão, e o `.connect` não rola. **A altura máxima desconta a
  barra da janela do Windows** (`--topo-da-janela`, como o painel): lá o `.connect` começa
  34 px abaixo, e sem o desconto o cartão ficava maior que o espaço — medido com a barra
  montada por cima, 7 px de folga acima e abaixo em vez de 24. **Quando chega um erro, o
  cartão rola até o fim**, e não só até o botão: `scrollIntoView({ block: 'nearest' })`
  deixava o botão encostado na borda, sem o respiro do cartão e com o "ver o registro"
  escondido. Medido a 900x560, no Mac e com a barra do Windows: 78 px abaixo do botão.
- **Reordenar sala é só dado, e por isso não derruba ninguém da call.** A sala do LiveKit
  é o id; arrastar mexe em `ordem` e `categoria_id`, e em id nenhum. A lista muda na hora
  e a busca seguinte confirma — dando errado, é ela que devolve a ordem de verdade.
- **Pegar a sala pelo botão de dentro arrasta a linha inteira** — medido no Electron deste
  projeto, com o protocolo do DevTools: `dragstart` na linha, `dragover` no alvo e `drop`
  no contêiner, mesmo com o ponteiro caindo sobre o `<button>`. Não é preciso alça
  separada nem `-webkit-user-drag`.
- **A conta de arrastar mora em `ordenacao.ts`, longe da tela.** É onde esse tipo de código
  erra: tirar da posição velha desloca a nova, e aparar o índice antes de descontar a
  própria sala fazia "soltar no fim" parar em penúltimo — o teste pegou.
- **Botão direito EM CIMA de uma sala é sobre AQUELA sala.** O clique subia para a lista e
  abria o menu dela — o de CRIAR sala: apontar para uma coisa e receber as opções de outra.
  Hoje o menu da sala traz renomear, "quem pode ver" e apagar; o da lista continua sendo
  o de criar, e o da categoria, o dela. A sala de notas é da Saga e por isso ali só se lê.
- **Efeito que grava no que ele mesmo lê refaz a si mesmo — e não dá erro nenhum.** A busca
  de `/servidor` dependia da sessão INTEIRA e, lá dentro, gravava na sessão a lista de
  servidores: cada resposta refazia o efeito, que pedia de novo na hora. O "de 10 em 10 s"
  do comentário nunca aconteceu, da v0.16.0 à v0.42.0. Medido no app de verdade, parado,
  contra um servidor local: **4.204 pedidos de `/servidor` em 10 s**, contra 2 de `/rooms`.
  Na produção, na mesma manhã, com três apps abertos, o servidor de token estava em 43% do
  único núcleo e o LiveKit em 1,6% — quanto disso era o laço só se sabe depois que todos
  atualizarem. Não aparece em registro nenhum: o app funciona, só que pedindo sem parar e
  redesenhando a tela a cada resposta. Hoje a dependência é o NÚMERO do servidor, e quem
  muda algo daqui — cargo pelo menu, foto e nome, painel do servidor, "Sua conta" — chama
  `recarregarServidor`, que era a parte boa que o laço fazia por acidente. **O laço escondia
  também um atraso da presença**, e tirá-lo o expôs: ao abrir o app você se via apagado na
  própria lista por 10,3 s, e "ocupado" levava 8,4 s para aparecer. Hoje status confirmado
  diferente do anterior pede a lista na hora — 0,3 s e 0,1 s, medidos. Tirar um laço assim
  pede perguntar o que mais ele mantinha fresco sem ninguém saber.
- **O seu cargo muda com o app aberto, e o app tem de ficar sabendo.** O `eu` da sessão —
  de onde sai todo "posso?" da tela — só era lido ao abrir o app, ao entrar e ao trocar de
  servidor; a busca de 10 em 10 s trazia a lista de pessoas e os cargos e deixava o `eu`
  como estava. Aconteceu com o Blankito em 11/09/2026: expulso, voltou pelo convite com o
  cargo padrão, ganhou o BEN 10 com o app aberto e seguiu sem botão nenhum — com o
  servidor, que confere o cargo a cada pedido, pronto para aceitar tudo. Não era coisa da
  expulsão: qualquer cargo dado com o app aberto só valia depois de reabrir, e o castigo
  também. Medido no app de verdade, em janela escondida, dando por fora ao Tava1 um cargo
  que mexe em salas: antes, a lista mostrava o cargo novo em 6,9 s e a barra não deixou
  arrastar sala em 25 s; depois, as duas em 6,7 s. Hoje a mesma busca atualiza o `eu`
  quando você aparece nela diferente — e só então, porque a identidade do objeto é o que
  segura a tela quieta.
- **Foto que não carrega volta a ser a inicial** (`Avatar`, `CartaoDoPerfil`). Sem isso
  sobra um buraco transparente, porque `.avatar.com-foto` tira o fundo: quem chegou depois
  do sumiço não via nem foto nem letra. Guarda-se a URL que falhou, não um sim/não, para
  que trocar de foto tente de novo sozinho.
- **Região de arraste engole clique de tudo que é desenhado por cima.** Qualquer coisa
  flutuante precisa de `-webkit-app-region: no-drag`.
- **A escada das camadas mora num lugar só, comentada em `.modal-back`.** O painel estava
  em `z-index: 10`, ABAIXO de tudo que flutua — o quadro da live (15), o aviso de versão
  (20), a pilha de avisos (21). Com uma live no canto ou um aviso na tela, pedaços do
  painel viravam decoração: o clique ia para a camada de cima e o botão "simplesmente não
  funcionava", sem erro nenhum em lugar nenhum. Hoje: live 15, aviso de versão 20, painéis
  25, ver imagem 30, menus 35, avisos 40, marca de versão 50 (esta com
  `pointer-events: none`). Camada nova entra na escada, não em cima dela.
- **Esc fecha, e é a segunda porta de todo painel** (`useFechar.ts`). A saída era o X, um
  quadrado de 28 px: qualquer coisa por cima dele e o painel deixava de ter saída. Uma
  porta que não depende de acertar pixel é o conserto barato disso. Com dois painéis
  abertos (a busca de GIF por cima do editor de imagem), Esc fecha só o de cima — daí a
  pilha, e daí a ação viver numa referência: dependendo de `onClose`, que nasce de novo a
  cada desenho, o painel de baixo subiria para o topo da pilha sozinho.
- **Nome de classe curto é variável global.** `.gif` estilizava o QUADRADINHO da busca de
  GIF — fundo preto, proporção 1:1 — e um botão novo na barra de escrever, chamado `gif`
  pelo mesmo motivo óbvio, herdou tudo: virou uma caixa preta quadrada com a palavra
  torta dentro. A regra do quadradinho agora vive presa à grade (`.grade-gifs .gif`), e o
  botão chama-se `rotulo-gif`. A varredura do resto do CSS não achou outra colisão: o que
  aparece em vários componentes (`.menu-pessoa`, `.selo-berserk`) é compartilhado de
  propósito. A mesma família tem outra forma, por ESPECIFICIDADE e não por nome: `.form
  label` é grid, versalete e negrito — o rótulo de um campo — e vencia `.check`, deixando
  as caixinhas de marcar empilhadas ACIMA dos nomes, tudo em maiúsculas. Quem escreve uma
  regra larga para "todo label do formulário" precisa deixar a exceção escrita junto. O
  `.perigo` fez o mesmo nos menus: é o contorno do botão de sair de um servidor, e a borda
  vazava para o "Banir" e o "Apagar mensagem", que são texto vermelho — só apareceu
  olhando a imagem.
- **Contêiner de canto não recebe clique — só os cartões dentro dele.** A pilha de avisos
  é larga e quase toda vazia, e fica por cima do quadro flutuante da live: sem
  `pointer-events: none` no contêiner e `auto` nos cartões, o vão entre um aviso e outro
  come o clique do que está por baixo. Vale para qualquer coisa que se ancore num canto.
- **Elemento com `transform` pinta acima dos irmãos seguintes que não estão posicionados.**
  Quem ENQUADRA o banner ganha um `transform` na imagem, e o retrato do perfil — que vem
  depois no HTML e sobe por `margin` negativa — ficava POR BAIXO dele, cortado ao meio.
  Só acontecia com banner ajustado, que é por que passou despercebido. `position:
  relative` + `z-index` no retrato resolve. Vale para qualquer coisa que suba por margem
  negativa sobre uma imagem que a pessoa possa enquadrar.
- **As barras de rolagem são nossas.** Sem `::-webkit-scrollbar`, o Windows desenha as
  dele — largas e brancas — no meio de um app escuro, e é a única coisa na tela que não é
  do app. No Mac elas são flutuantes e quase não aparecem, então o estrago só se vê do
  outro lado: dá para passar meses sem notar.
- **Trocar a imagem zera o enquadramento DELA.** O enquadramento é "onde esta imagem foi
  arrastada e o quanto foi aproximada" — é da imagem, não da pessoa. Sem zerar, a nova
  entrava com a aproximação da antiga: quem tinha dado zoom num banner e subia outro via
  um pedaço gigante no lugar do desenho. O do outro papel não é tocado; trocar o banner
  não mexe em como a foto está posta.
- **Enquadrar não é recortar.** Recortar significa redesenhar a imagem, e um GIF
  redesenhado perde a animação — o que o Berserk destrava. Guardamos posição e
  aproximação, e aplicamos ao mostrar; o arquivo enviado nunca é tocado. A imagem também
  não é reduzida: vai como veio, e o que torna isso aceitável é o nome ser o hash do
  conteúdo, então cada pessoa baixa uma vez. A conta é uma só (`enquadramento.ts`), usada
  pela prévia do editor e por todo lugar que desenha — é isso que faz o resultado ser o
  que a pessoa viu ao ajustar. O servidor tem a mesma régua, porque o que vem do app
  nunca é palavra final.
- **Resposta 200 pela metade é FALHA, não objeto vazio.** O `pedir` fazia
  `res.json().catch(() => ({}))`: corpo truncado — rede piscando, conexão morta no meio —
  virava `{}` e passava como SUCESSO. Aí `cargos` chegava `undefined` na lista de pessoas
  e o `cargos.slice()` estourava DENTRO do render: janela cinza, e no registro do dono só
  "Cannot read properties of undefined (reading 'slice')", sem dizer de onde vinha.
  Aconteceu com ele em 08/09/2026, minutos depois de uma sequência de `→ 0` no registro.
  Toda rota do servidor responde um OBJETO em JSON, sempre, então corpo que não é objeto
  não tem outra leitura possível. A regra mora em `resposta.ts`, pura e testada, e vale
  para os três caminhos (o `pedir`, o envio de imagem e o de som) — o erro passa a chegar
  como erro, com status 0, e quem já trata queda de rede trata isto junto.
- **Falhar em carregar não é o mesmo que não ter nada.** O painel do servidor pedia a
  configuração ao abrir e, se a busca caísse, ficava com as listas como nasceram: vazias.
  A tela então afirmava que o servidor não tinha cargo, nem sala, nem gente — e o dono
  achou que os cargos dele tinham sumido. O banco estava intacto o tempo todo. Hoje, sem
  ter carregado UMA vez, ele não desenha seção nenhuma: diz que não conseguiu e oferece
  tentar de novo. Vale para qualquer tela que abra pedindo dados.
- **O botão "Relatar" mora na faixa do alto da janela.** Foi a escolha do dono (opção B) entre
  três posições fotografadas no app de verdade: pé da trilha, barra da conta e esta. A faixa
  está em quase toda tela e é quase vazia, então o botão fica à mão sem pesar — cinza apagado,
  acende com o mouse. No Windows ele está na `BarraDaJanela`, acima de TODA tela, inclusive a
  de entrar; no Mac a faixa só existe dentro do app, e **a tela de entrar do Mac fica sem o
  botão**. Por isso a caixa não pergunta nada ao `App`: o `App` ANOTA onde a pessoa está
  (`relato.ts`), e o relato leva junto.

## O visual

- **A paleta sai da logo, não do Discord.** O acento era `#5865f2` — letra por letra o
  *blurple* do Discord —, e os cinzas de fundo também eram os dele. Enquanto isso estivesse
  ali, qualquer arrumação continuaria parecendo cópia. Hoje as cores são lidas do próprio
  ícone: azul-céu `#b7e3fc` no alto do balão, azure `#4379cf` no meio, marinho `#17336d` na
  ponta; os fundos acompanham, puxados para o frio.
- **"Você está aqui" é cor da casa e um risco à esquerda**, não um bloco cinza. O bloco
  cinza é o que o Discord faz, e não distinguia a sala aberta da sala em que a voz está.
- **Hierarquia por peso, não por tamanho.** Sala em 15px/500, categoria em 11px/800
  versalete, nome do servidor em 15,5px/700 com a foto ao lado — antes tudo tinha peso de
  legenda e nada se destacava.
- **A pessoa se abre pelo mesmo gesto em todo lugar** — na lista de salas, na call, na
  lista de pessoas e no chat. Era diferente em cada um, e no chat não abria nada.
- **Quem é a pessoa se pergunta a UM lugar** (`pessoas.ts`, puro e testado). O cartão saía
  do mapa de quem está na CALL, e quem não estivesse numa sala de voz naquele instante
  caía num objeto pelado: sem foto, sem cargo, sem identificador, sem "no servidor desde".
  Do chat esse era o caso NORMAL — quase ninguém está em call ao mesmo tempo —, então a
  mesma pessoa aparecia inteira pela lista da direita e vazia pelo chat. O conserto não é
  copiar mais campos em cada lugar que abre o cartão: é `acharPessoa` olhar as duas fontes
  que o app já tem (a call, e a lista de membros do servidor) e todo mundo perguntar a
  ela. A lista de pessoas montava o objeto dela à mão, e era assim que as duas versões
  nasciam; hoje ela chama o mesmo caminho.
- **E a pergunta é "quem é ela NESTE servidor".** O mapa de quem apareceu nas calls juntava
  todos os servidores numa pilha só, e `acharPessoa` o consultava ANTES da lista do servidor
  aberto: quem esteve numa call do CORNUME levava de lá o cargo, o nome exibido e o
  identificador para o cartão aberto no "teste". O dono abriu o próprio perfil no "teste" e
  leu "Peixe Souris". O servidor mandava certo — no banco de produção, nenhum vínculo aponta
  para cargo de outro servidor. Medido no app de verdade, em janela escondida, contra
  servidor e LiveKit locais montados como a produção: a lista da direita dizia
  `MODERADOR — TKP` e o cartão, na mesma tela, "Bagre", "Peixe Souris" e identificador TKP,
  tudo do CORNUME; o de Tava1 dizia "BEN 10" em vez de "Membro". Depois: "TKP", "Moderador",
  "Membro". Hoje o mapa é anotado POR SERVIDOR, `acharPessoa` recebe o servidor do lugar do
  clique (o aberto; no palco, o da call) e a lista de membros só vale se for daquele
  servidor. Sem nenhuma das duas, o cartão fica com o nome que tinha na mão e sem cargo — e
  não afirma "Sem cargo", que seria outra coisa. E ele diz de onde é o que mostra: "Cargo em
  teste", "Em teste desde".
- **Tudo que é de um servidor anda com o servidor junto, inclusive na memória do app.**
  Salas, cargos e pessoas eram listas soltas, e trocar de servidor não as troca na hora: até
  a busca voltar, eram as do servidor de onde se veio, desenhadas com o nome do novo no
  alto. Hoje cada uma guarda de que servidor é — as salas, o que se PEDIU; cargos e pessoas,
  o que a RESPOSTA diz, porque pedir por um servidor de que você não faz parte devolve
  outro — e só vale para ele. Enquanto a do novo não chega, a barra não diz "Nenhuma sala
  configurada": não ter carregado não é não ter. A mesma confusão morava no menu do botão
  direito: numa call de OUTRO servidor (a voz continua quando se troca), ele oferecia banir e
  expulsar com a régua do servidor ABERTO, e a ação ia para o aberto. Ali agora não há
  moderação, e o menu diz de qual servidor é a call.
- **Esquerdo abre o perfil; direito, as ações.** Era tudo no mesmo popover: retrato
  minúsculo no topo e, logo abaixo, banir e expulsar. Ver quem é a pessoa é o que mais se
  faz e era o que menos aparecia, enquanto o que quase nunca se usa — e que não se quer
  errar — ficava a um clique. O menu de ações guarda um cabeçalho de uma linha só, para
  não errar de pessoa.
- **A foto é da conta; o nome que aparece é de cada servidor.** A tela de "Sua conta"
  dizia que o nome valia "em todos os servidores", e nunca valeu: ele mora no vínculo
  (`membros.nome_exibido`), e com um servidor só ninguém tinha como notar. Hoje o campo
  diz de qual servidor está falando, e some quando não há nenhum — não há onde escrevê-lo.
- **O que é seu fica na engrenagem; o que é do servidor, no servidor.** A sua foto e o seu
  nome moravam dentro das configurações do SERVIDOR, junto de salas e cargos — e a conta é
  global: a foto vai com você para todos eles. Trocar de cara pelo painel de UM servidor
  era o único caminho que existia. Hoje a engrenagem abre "Sua conta" (perfil, qualidade,
  microfone, câmera, registro de erros) e o servidor se configura pelo nome dele, no topo,
  ou pelo botão direito no quadrado à direita. Botão direito noutro servidor troca ANTES
  de abrir: o painel lê o servidor da sessão ao montar.
- **A administração da Saga abre por uma porta na trilha que só o dono vê.** O painel da
  Saga já morou numa janela escondida no menu de status, e o dono teve de perguntar onde
  ficava; depois virou um bloco de "Sua conta", apertado para uma lista de servidores e que
  apertaria mais quando chegar o gerenciar. Hoje é um quadrado com a grade abaixo do "+" —
  contorno cheio, porque o tracejado do "+" quer dizer juntar — e um botão em "Sua conta",
  que é a porta de quem não tem trilha (a tela inicial). O Berserk e o código de senha foram
  junto, para a aba Contas. Essa aba fica MONTADA, com `hidden`, e não num ternário:
  desmontada, levava embora o código de senha recém-gerado, que aparece uma vez só. E ela
  só se desenha para o dono, conferido no próprio `App`, e é esquecida em `esquecerAConta`:
  o `App` não remonta ao trocar de conta, e a administração aberta passaria para a próxima.
- **Na administração, busca que recebe 401, 403 ou 404 para de repetir.** São respostas que
  não passam sozinhas, e cada falha vira uma linha no registro de erros, que é feito para
  circular no grupo. Medido com o app novo contra o servidor da v0.44.0, que não tem as
  rotas: 2 linhas em 25 s — a segunda é o StrictMode do desenvolvimento montando o efeito
  duas vezes —, contra 4 com a busca repetindo, e a tela dizendo que "ela chega quando o
  servidor for publicado". **App novo com servidor antigo não tem administração**: os dois
  sobem juntos. A lista é por nome, estável, porque se atualiza de 10 em 10 s e ordenar por
  atividade faria as linhas pularem debaixo do mouse; ela abre no servidor aberto no app, e
  o escolhido que a busca esconde continua na lista, marcado "fora da busca".
- **A bolinha de presença tem um anel da cor do fundo.** Sem ele encosta na foto e some
  em cima de imagem clara. E "offline" não é uma cor: é a ausência dela, senão um cinza
  cheio competiria com as três que significam algo.
- **Existe uma escada de espaço** (`--e1`..`--e5`, 4 a 24). Antes era tudo 4 e 8, e por
  isso nada tinha grupo nem respiro: a lista de salas era uma coluna contínua.
- **Apagado na lista quer dizer FORA DA SAGA, não fora da call.** A regra era
  `:not(.na-voz)`: quem estava online lendo o chat aparecia tão apagado quanto quem tinha
  fechado o app, e a lista dizia "não tem ninguém" com meia dúzia de pessoas acordadas.
  Ocupado e ausente também acendem — são recados de quem está aí. A variável no código já
  se chamava `online` querendo dizer "na voz", e era essa a confusão. Medido com os quatro
  casos na mesma tela: online fora da call, ocupado e o dono ficam em opacidade 1; só o
  offline vai a 0,45.
- **Na lista de pessoas, quem está aqui vem antes de quem não está.** A ordem era só a do
  nome dentro de cada cargo, e quem estava offline ficava ACIMA de quem está aqui — foi o
  exemplo com que o dono cobrou foco no visual. Hoje é como no Discord (`listaDePessoas.ts`,
  puro e testado): os cargos só com quem está aqui, e quem está offline num grupo único no
  fim, com o cargo ainda na cor do nome — por isso a cor sai do cargo da PESSOA, e não do
  grupo. Ausente e ocupado ficam nos cargos: são recados de quem está aí. Quem tem um cargo
  que não está na lista cai em "Sem cargo", em vez de sumir sem ninguém notar.
- **Quem está na sala fica pendurado nela por um fio** (`.people` com borda à esquerda).
  Sem ele, com duas salas cheias não se sabe quem está com quem.

- **Vários servidores voltaram, e a trava saiu do código.** Eles ficaram guardados atrás
  de duas constantes (`travas.ts`) por escolha do dono, com tudo inteiro por baixo — os
  servidores, os cargos e as configurações nunca saíram do banco, e a voz que atravessa
  servidor continuou funcionando o tempo todo. Foi essa aposta que se pagou: reabrir foi
  apagar o arquivo, não reescrever a funcionalidade. A trava saiu de vez porque uma
  constante que só vale `true` é peso morto — quem quiser fechar de novo fecha, e será
  outra decisão, não a mesma esperando.
- **Nada anima com a Saga parada.** Em 16/09/2026 o dono viu a Saga com o processo de desenho e o
  da GPU perto de 100% cada um no Mac dele, e um amigo, 50% num MacBook M5 Pro — "o Fluxer usa 1%".
  Medido com a Saga escondida, desenhando fora da tela sobre uma cópia dos dados de produção e
  parada numa tela sem nada acontecendo: 58 repinturas por segundo e 14% de CPU. Tirando só o
  arco-íris do Berserk, 47 repinturas e 6%; só os GIFs, 58 e 13%; os dois, ZERO e 0,4% — não havia
  mais nada. Texto com `background-clip: text` não anima fora do desenho, então cada nome Berserk
  repintava a janela a cada quadro, e um GIF de 200 px basta para o macOS recompor a janela inteira
  a cada quadro dele — na tela Retina a 120 Hz, é o que virava 100%. Hoje, como no Discord: **foto,
  banner e ícone de servidor em GIF ficam parados** num quadro e animam com o mouse sobre a linha da
  pessoa (`imagemParada.ts`, usado pelo `Avatar`); **o arco-íris fica pintado parado** e anda no
  mesmo hover; e **o GIF da conversa anima com a Saga em foco** e para quando ela vai para trás. Medido
  depois: parada, zero repinturas e 0,3%; com o chat aberto, zero e 2%. O quadro parado é o do
  MEIO, porque a foto do FelipeTKP entra aparecendo e o primeiro quadro dela é branco inteiro. O
  cartão de perfil aberto e o visualizador de imagem continuam animando: são abertos de propósito, e
  fecham. **Coisa nova que se mexe sozinha na tela tem de ser medida parada** antes de subir.
  Na mesma noite, medido na Saga DO DONO pela porta de diagnóstico (`--remote-debugging-port`),
  numa call com uma live: o ponto pulsante do "ao vivo", de 6 px, custava sozinho 18,5% de GPU (de
  22,8% para 4,3% ao parar). Hoje ele é parado, como o do Discord, o banner em arco-íris do cartão
  anda só com o mouse no cartão, e `animacoes.test.ts` falha se uma animação infinita aparecer sem
  `:hover` — regra escrita aqui dura até o primeiro dia corrido. O resto da call, por thread do
  processo de desenho (29% de um núcleo): a página 6%, a saída de som 5%, o filtro de ruído 3,5%,
  a rede 2,6%. A parte da página tinha desperdício: as buscas de relógio (salas de 4 em 4 s,
  "digitando" de 2 em 2, servidor de 10 em 10) gravavam a resposta como objeto novo mesmo igual, e o
  app inteiro redesenhava para mostrar a mesma tela — hoje só troca o que mudou (`igual.ts`).
  **Não medido e fica para depois:** quem toca um som do soundboard continua publicando uma faixa
  de silêncio sem DTX pelo resto da sessão (o DTX cortava o começo do som), e cada pessoa da call a
  decodifica; e o nível de quem está falando abre um segundo `AudioContext`, além do do microfone.

# Xadrez, Fórmula 1, Urna e Catan

App e servidor juntos. O Dragão Quadrado mora em `app/src/renderer/src/dragao/CLAUDE.md`.

## Decisões que não são óbvias no código

- **O xadrez é da DUPLA, e cada dupla joga na SUA tela.** Foi a correção do dono, duas
  vezes: mostrar as mesas como cartões na faixa do palco é "vários xadrez na mesma tela", e
  o pedido era o contrário — "é como se fosse um jogo multiplayer de dupla, cada dupla no
  seu". A partida toma o palco inteiro, sem a faixa da call e sem o resto da sala em volta.
  Várias duplas jogam ao mesmo tempo porque as mesas são independentes, não porque aparecem
  juntas em algum lugar.
- **A regra do xadrez mora no servidor, e o app só desenha.** `xadrez.mjs` é o motor
  (conferido por perft nas seis posições padrão) e `jogos.mjs` são as mesas; cada leitura da
  mesa já traz os LANCES QUE VALEM para quem está na vez, e a tela desenha esses e mais
  nada. Duas cópias da regra, uma em cada ponta, discordariam no primeiro caso raro — en
  passant, roque atravessando xeque — e quem perderia a partida seria quem confiou na tela.
- **As mesas vivem na MEMÓRIA do servidor**, como o "está digitando": reiniciar o servidor
  encerra as partidas, e é por isso que publicar servidor no meio de um jogo é uma decisão.
  Tabela nova para estado de agora só deixaria lixo para trás.
- **O relógio é contado no servidor; a tela só desconta o que passou desde a resposta.** O
  restante vem em cada leitura, e entre uma e outra o app subtrai o tempo local — senão o
  relógio andaria aos saltos, de busca em busca. Quem estoura perde na leitura seguinte:
  não há timer esperando ninguém do lado de lá.
- **Resposta mais velha que a última aplicada não entra**, e quem as data é o relógio do
  SERVIDOR (`agora`): a busca que saiu antes do seu lance e voltou depois dele desfaria o
  lance na tela até a busca seguinte. E o lance aparece feito antes de o servidor
  confirmar — a resposta leva dezenas de milissegundos, e nesse vão a peça ficaria parada
  onde estava.
- **O convite chega pela busca de salas, com som, onde a pessoa estiver** — e some quando
  quem chamou cancela. Ele não é aviso que sai sozinho: quem chamou está esperando, então o
  cartão fica até "Jogar", "agora não" ou o cancelamento. **Quem está jogando não recebe
  convite**: o servidor o segura até a partida acabar, senão tocaria um chamado que ele
  mesmo recusaria.
- **O convite é um CARTÃO, o mesmo para os dois jogos, e não uma notificação.** Era uma barrinha
  na pilha de avisos, e o dono cobrou: *"não seja somente uma barrinha de notificação no canto,
  e permaneça de pé para que ele possa aceitar ou negar"*. Ele escolheu entre três desenhos a
  opção C — no canto, maior — e os dois jogos iguais (`CartaoDeConvite`): capa (a miniatura da
  pista, ou uma faixa de tabuleiro com o cavalo), rótulo do jogo, quem chamou, o detalhe, quem
  já está sentado com o anel da cor da equipe, e "Agora não" e a ação escritos, da largura toda.
  As miniaturas das pistas são imagens GUARDADAS (`pistas/miniaturas/*.webp`, feitas pelo
  próprio desenhista da corrida): montar a pista inteira só para a capa travaria a tela.
- **O convite vem de TODOS os seus servidores, e diz de qual.** Só chegava o do servidor aberto,
  e quem estava olhando outro não sabia que foi chamado. O `/rooms` junta os grids e as mesas de
  qualquer servidor em que você é membro ativo (`resumo(ctx, fora)`), com `servidor` e
  `servidorNome`, e o cartão escreve "· em Paddock" quando não é o aberto. **Aceitar leva ao
  servidor do jogo** (`irAoServidorDoJogo`): a primeira versão abria a partida por cima do
  servidor aberto, e bastava sair dela para não ter caminho de volta — a faixa e o menu de jogos
  são do servidor aberto. Visto no app escondido: "Correr" num convite do Paddock, olhando o
  CORNUME, troca a trilha para o Paddock e abre o grid de lá.
- **Quem joga ganha um controle ao lado do nome, e ele É o botão** — o mesmo princípio do
  selo AO VIVO de quem transmite. Na linha da call e na lista de pessoas, porque quem joga
  FORA da call só aparece na segunda. Um clique e você está assistindo; a plateia aparece
  para os dois jogadores, com o olho, na coluna dos lances.
- **Saiu da partida para ler o chat, ela fica no alto**, logo abaixo da faixa da call,
  dizendo de quem é a vez e com a volta num clique: o relógio continua correndo, e uma
  partida que some da vista é uma partida perdida no tempo.
- **Na partida, a live que você assiste entra na COLUNA**, e não flutuando no canto: por
  cima do tabuleiro ela taparia casas e os botões da partida.
- **Desistir arma no próprio botão.** Abandonar é decisão de um segundo e uma janela a mais
  seria ruído, mas um clique só é fácil demais de errar: o primeiro clique vira um botão
  vermelho cheio, que desarma sozinho em 4 s.
- **A fonte das peças vai DENTRO do app** (`fontes/pecas.woff2`, 3 KB, só as doze letras de
  xadrez). Com a fonte do sistema cada computador desenha um rei diferente, e onde não
  houvesse o desenho o peão sairia como emoji colorido; o CSP não deixa buscar fonte de
  fora, e o resto do arquivo não é preciso.
- **A corrida de Fórmula 1 não passa pelo HTTP: anda pelo canal de dados do LiveKit.** Posição
  a vinte vezes por segundo, de até oito carros, seriam dezenas de pedidos por segundo numa VPS
  de um núcleo — a mesma que sofreu com a busca de salas. Então o servidor (`corridas.mjs`,
  na memória como as mesas do xadrez) cuida só do que muda devagar e precisa de árbitro: os
  lugares, a hora da largada e a chegada. A corrida mora numa sala do LiveKit SÓ DELA
  (`corrida-<nome>-<rodada>`), com passe sem áudio nem vídeo, e publicar dados é só de quem
  está sentado — quem assiste entra para ler. A sala muda a cada largada, para ninguém
  pendurado na anterior virar fantasma na seguinte.
- **A sala da corrida se refaz sozinha, e "conectado" não quer dizer que o dado chega.** Na
  primeira corrida a três, o Tava1 não via ninguém, ninguém o via, e ele aparecia na torre. O
  LiveKit de produção registrou, na sala daquela corrida, `send data message error … data
  channel is not available` para ele, e a voz dele tinha caído e voltado cinco vezes naquela
  noite. A sala da corrida não tinha volta nenhuma: um `connect` e fim. Hoje (`TelaDaCorrida`):
  caiu, entra de novo com passe novo em 1, 2, 4 e 8 s; e se ninguém que está correndo mandou
  posição em 6 s, ou 40 envios seguidos falharam, refaz a conexão — no máximo uma vez a cada
  15 s, porque quem está mudo pode ser o outro. Na torre, quem não manda nada há 3 s aparece
  "sem sinal", e na pista uma faixa diz que a conexão caiu. Medido no app escondido e mudo,
  contra LiveKit local: tirado da sala pelo `removeParticipant` aos 24,0 s, o aviso aparece e
  some em 1 s e as posições dele voltam a chegar aos outros em ~1,5 s; com os outros dois
  calados, a torre diz "sem sinal" em 3 s e a sala se refaz aos 6 s. **O defeito exato do
  Tava1 — canal de dados indisponível com a conexão de pé — não foi reproduzido**: o que se
  mediu foram as duas bordas dele.
- **App velho não senta mais** (`PROTOCOLO = 2` em `corridas.mjs`, `PROTOCOLO_DA_CORRIDA` no app).
  A pista, a punição e a volta mínima mudaram entre as versões, e um app antigo na mesma
  corrida veria outra pista. Sentar sem o protocolo é 409 com "A Fórmula 1 mudou: feche e abra a
  Saga para atualizar". Por isso **servidor e app sobem juntos**: app novo com servidor antigo
  senta igual (o servidor ignora o campo), mas servidor novo recusa todo app de antes.
- **Cada app simula o PRÓPRIO carro, e a batida é resolvida dos dois lados.** Árbitro central
  poria a latência no volante de todo mundo. Cada um empurra o próprio carro para fora do
  outro, pela posição que recebeu dele, e perde velocidade só no que ia contra — por isso a
  batida parece a mesma nas duas telas. A regra toda (`corrida.ts`) é pura e testada,
  inclusive duas voltas de piloto automático em cada uma das seis pistas; é quem pilota que diz
  o tempo de chegada e a punição, e o servidor só recusa conta impossível (antes da largada,
  volta de menos de 15 s, punição negativa). Entre amigos isso basta; contra trapaça, não.
- **O relógio da corrida é o do SERVIDOR.** O app guarda a MAIOR diferença entre o `agora` das
  respostas e o próprio relógio — a resposta chega sempre depois de escrita, então a
  diferença só erra para menos. Com ele, as luzes apagam juntas em todas as telas e as fotos
  dos outros carros são desenhadas 110 ms no passado, entre duas que chegaram.
- **A primeira Fórmula 1 foi recusada, e o que caiu foi justamente a escolha "da casa".** Na
  v0.50.0 o dono tinha escolhido, entre três desenhos, a pista inteira na tela com as cores do
  app (fundo escuro, zebras azuis) e a classificação na coluna. Jogado, veio: *"ficou péssimo,
  eu posso sair da pista, cortar caminho, não tem bandeira, a pista está feia, toda azul o
  fundo, a pista maior, modelos diferentes de pista"*. As cores da casa servem para o app, não
  para um jogo — e uma imagem estática do desenho não mostrava nada disso: a pista inteira na
  tela deixava o carro com 20 px, e sem muro o meio do mapa era atalho. O redesenho saiu de
  imagens do MOTOR de verdade (não de SVG à mão), e o dono escolheu: **câmera seguindo o carro
  SEM girar** (recusou a que gira mesmo sabendo que a seta esquerda continua sendo a esquerda
  do carro), **placar por cima da pista** e a **lista de pessoas fora** enquanto a corrida está
  aberta, **as seis pistas**, e **punição somada no fim**. Vagas vazias sem robô, carros que
  batem e plateia continuam das escolhas de antes.
- **As pistas são traçados de verdade** (`pistas/tracados.ts`, do levantamento aberto
  bacinger/f1-circuits, MIT — o aviso da licença vai no arquivo e em `LICENCA-f1-circuits.md`):
  Interlagos, Monza, Mônaco, Spa, Bahrein e Las Vegas, no sentido certo e começando na linha.
  O traçado é ENCOLHIDO (`k`, unidades por metro) para a volta dar uns 35 s — o piloto
  automático dos testes faz de 32 a 38 s —, e a LARGURA não encolhe: 110, umas seis larguras
  de carro. Encolher sem estreitar tem um preço que ficou: **as chicanes de Monza são suaves**.
  Medido: a reta pela Rettifilo nem sai do asfalto. Os dados têm um ponto a cada ~46 m, a
  chicane cabe entre dois, e nem escala maior nem amaciar menos a devolveram — só desenhando a
  chicane à mão. Mônaco usa `k` maior porque, no 3,6, a reta dos boxes e a Piscine ficavam a
  102 do eixo uma da outra, com a pista de 96: sem espaço nem para o muro.
- **Tudo em volta sai do traçado, e a física lê a MESMA pista que o desenho.** Zebra por
  dentro no ápice e por fora na saída, brita por fora (escape asfaltado e pintado no deserto,
  muro colado na rua), placas de 150/100/50, postos de fiscal, boxes do lado com mais espaço,
  arquibancadas onde o chão inteiro cabe, árvores, prédios, mar e túnel — com sorteio de
  semente, então é a mesma pista em todo computador. `pista.ts` é puro e testado.
- **O muro existe para o atalho não existir.** Cada lado tem um muro no fim do escape, e onde
  dois trechos passam perto mas longe na volta, um muro no meio deles. Do lado de dentro de um
  grampo o limite do escape dá um laço; os pontos do laço saem e o buraco é fechado por uma
  reta quando ela não encosta no asfalto — muro com buraco é atalho. O teste que segura isso
  (`pista.test.ts`) é o que interessa: **entre dois trechos perto no mapa e longe na volta,
  sempre há muro**. Ele pegou dois defeitos na primeira passada (um muro atravessando o
  asfalto em Interlagos e a reta dos boxes de Mônaco sem nada separando da Piscine). Pedaço de
  muro é sempre curto (≤ 15), porque a física acha o muro perto do carro pelo meio de cada
  pedaço: um pedaço longo teria a ponta encostando no carro e o meio longe demais para contar.
- **Cortar caminho soma 3 s no fim, e o que decide é o caminho, não o chão.** O carro está
  FORA quando o centro passou 10 da borda (as quatro rodas além da linha branca). Voltando, se
  avançou na pista mais do que andou lá fora — e a sobra passa de 30 —, cortou. Medido nas seis
  pistas: cortar uma chicane pela reta ganha de 40 a 150; pegar zebra e grama por dentro de uma
  curva, de 10 a 15. A punição anda com a posição (`pu`) e vai na chegada (`punicao`); o
  servidor soma e ordena a bandeirada pelo tempo com ela, e a torre mostra "+3 s". Correndo, a
  punição ainda não reordena ninguém — foi a opção A do dono, a da F1. Grama segura o carro em
  55% da máxima, brita em 25%, e o muro tira o que ia contra ele e deixa escorregar.
- **As bandeiras são uma regra só** (`bandeiras.ts`, pura e testada), na ordem do que importa:
  quadriculada, preta e branca (4 s depois do corte), amarela (carro parado a até 1.800 à
  frente; na largada não, porque todo mundo está devagar), azul (quem vai te dar volta a até
  450 atrás) e verde (valendo). O fiscal do posto mais perto balança a amarela, e a quadriculada
  aparece na mureta dos boxes desde a primeira chegada.
- **A diferença na torre é de cronometragem, não de distância** (`cronometro.ts`): marcas a cada
  250 e a hora em que cada carro passou por cada uma; a diferença é a da última marca que os
  dois passaram. Distância dividida por velocidade erraria justamente nas curvas.
- **A câmera não gira e o zoom é fixo, e é isso que deixa o mundo pronto em ladrilhos.** O mundo
  parado é desenhado em quadrados de 512 px e guardado (`Ladrilhos`); cada quadro cola os que
  aparecem, faz no máximo dois que faltam (quatro antes da largada) e desenha por cima só o
  que se mexe. Medido no app escondido, nas seis cenas: 60 quadros por segundo, o pior quadro
  com 19 a 28 ms (é quando nasce ladrilho novo). Em máquina fraca e no Windows, não medido.
- **O motor não é arquivo: é sintetizado ao vivo** (`motor.ts`), porque muda de tom a cada
  quadro. Só o SEU ronca. Luz, largada, batida e vitória são `.ogg` da família de sempre.
- **O motor tem marchas, e o talo é GRAVE.** O primeiro foi recusado: *"o carro parece que
  instantaneamente está na velocidade máxima, isso tudo bem, mas o som não remete a isso,
  parece pouco e fica insuportável de ruim na velocidade máxima"*. Era uma serra com uma
  quadrada uma oitava ACIMA, por um filtro ressonante que abria até ~2,2 kHz: o tom só subia e,
  na reta, ficava parado num apito. Hoje são oito marchas (`rotacao`, pura e testada) — o giro
  sobe dentro de cada uma e cai na troca, com uma respirada no volume —, o corpo é uma quadrada
  uma oitava ABAIXO, o ruído de admissão só aparece acelerando, e a saturação vem ANTES de um
  filtro sem ressonância. Gravado com `OfflineAudioContext` na mesma volta de mentira, no talo:
  centroide de 1.259 Hz para **490 Hz**, energia acima de 2 kHz de 23,6% para **3,2%**, volume
  igual (−24 dB). Na troca, o `setTargetAtTime` do quadro seguinte desfazia a respirada — por
  isso o volume fica quieto por 120 ms depois dela; as sete trocas aparecem na gravação.
  **Se ficou bom é de ouvido, e isso é do dono.**
- **Teste escondido tem de ser MUDO.** Na primeira rodada da corrida o app de teste tocou luzes
  e motor pelos alto-falantes do dono — com ele ao vivo na Saga, e a live levou o som junto:
  o `loopbackWithoutChrome` só exclui o processo da Saga dele, e o de teste é outro. A entrada
  do teste leva `mute-audio`.

## A Urna (17/09/2026)

Pedido do dono: "um minigame de urna eletrônica, em pixel art: um bonequinho passa na mesa, dá o
título fake e vai até a urna; na urna, primeira pessoa para votar", com os candidatos a Presidente de
verdade; depois, "deixa votar várias vezes e faça um rank multiplayer do mais votado" e "reformule a
escolha dos minigames para não ficar uma lista enorme". Ele viu as telas feitas pelo motor e escolheu
o **menu em grade de capas** (opção A), a apuração por servidor com voto secreto, e aprovou o resto. Depois de
publicado, corrigiu: **"o resultado deve ser para todo o Saga e não separado por servidor"** — a apuração soma
todos os servidores. As tabelas seguem anotando o servidor de cada voto (já estavam na produção; tirar a
coluna seria migração sem ganho), e a leitura soma; o freio de 3 s e o "você votou N vezes" também.

- **Os candidatos são os do TSE em 17/09/2026** (`urna/candidatos.ts`): 13 chapas, conferidas por dois
  levantamentos separados (a API do DivulgaCandContas e a imprensa) que bateram nome a nome. Pablo
  Marçal foi indeferido e trocado por Leonardo Avalanche, com registro ainda pendente. **Se alguém sair
  da disputa, sai de `candidatos.ts`, de `retratos.ts` e de `NUMEROS` em `server/urnas.mjs`** — o teste
  do servidor confere que as duas listas de números são a mesma. A ordem é sempre a do número.
- **Os rostos são as fotos oficiais do TSE em pixel** (`urna/retratos.ts`, 30x42 e 22x31, 16 e 14 tons
  por k-means), porque a urna de verdade mostra a foto. Gerado por script, não à mão.
- **O voto é secreto no BANCO, não só na tela.** `urna_votos` guarda o total de cada escolha por
  servidor; `urna_eleitores` guarda quantas vezes cada pessoa votou, sem a escolha. Não existe linha
  que ligue alguém a um candidato. Votar de novo pode, sem limite, com um freio de 3 s contra laço.
- **A regra do jogo é pura e testada** (`urna/jogo.ts`): etapas da mesa (pede o documento → título da Saga
  → libera), cabine, CORRIGE, BRANCO só com a tela vazia (como na urna), número inexistente vira NULO, e
  a mesária repara em quem volta. A urna é a UE2020: teclado 3x3 com o 0 embaixo do 8 e a coluna
  BRANCO/CORRIGE/CONFIRMA. Os sons são o arquivo que o dono mandou: o bipe da tecla e o som do FIM.
- **O menu de jogos virou grade de capas** (`MenuDeJogos.tsx`): duas por linha, com a frase do que
  acontece embaixo e um ponto azul quando há algo de pé. A classe `.menu-de-jogos-item` ficou nas capas
  porque os roteiros da bancada procuram por ela.
- **Medido** com a Saga escondida e muda contra servidor e LiveKit locais: menu, porta, mesa, título,
  cabine, voto, FIM, apuração, votar de novo e fechar, por teclado e clique. Parada: seção 0 quadro/s e
  0,3% de CPU; urna com o cursor piscando, 2 quadros/s e 0,5%. **Não foi ouvido** nenhum som (a bancada é
  muda) nem visto no Windows.

### O 2º turno (05/10/2026)

Pedido do dono: "atualiza o jogo da urna para somente os 2 candidatos do segundo turno, aprimore a parte
do jogo antes da votação também", e no meio, "melhore a mão do personagem na hora de votar". Ele viu as
telas do motor e escolheu **digital + caderno** na mesa e a **apuração do zero**.

- **13 Lula × 22 Flávio Bolsonaro**, como o TSE deu na madrugada de 05/10 (99,99% apuradas). Saíram de
  `candidatos.ts`, de `retratos.ts` e de `NUMEROS`; as onze chapas do 1º turno estão no git.
- **O 2º turno começa do zero, e o 1º fica guardado.** A migração 58 refaz `urna_votos` e
  `urna_eleitores` com o `turno` na chave; tudo o que havia virou turno 1. A apuração, o "você votou N
  vezes" e o freio leem só `TURNO` (2). O 1º turno da Saga, na produção: 13 com 51, 14 com 49, 22 com 19,
  70 com 3, 16 com 1, branco 1. O voto continua secreto: o turno entrou nas duas tabelas e nenhuma ganhou
  a coluna da outra.
- **O app de antes vota numa chapa que saiu** e o servidor recusa com "Essa chapa não está no 2º turno.
  Atualize a Saga para votar." — contar como nulo seria registrar em silêncio um voto que a pessoa viu
  ir para alguém.
- **A mesa ganhou duas etapas de SEGURAR ESPAÇO** (ou o botão do mouse) depois do título: o leitor de
  digital, que na primeira leitura da abertura NÃO reconhece ("esfrega o dedo na camisa"), e soltar
  antes do fim recomeça; e o caderno de votação, com a linha do jogador marcada e a caneta assinando
  enquanto se segura — solta, ela para onde parou. Segurar e não só apertar porque apertar ESPAÇO já
  era tudo o que a mesa fazia. Ao terminar uma etapa, o aperto seguinte só avança; a próxima pede outro
  aperto, senão o mesmo ESPAÇO que fechou o leitor começaria a assinar. **Quem volta pula as duas**: o
  mesário já conhece, e votar de novo é o jogo. O celular fica na mesa depois de liberado.
- **O mural com as duas chapas** substituiu a janela da sala, porque a seção de verdade afixa os
  candidatos; de perto (ESPAÇO), abre grande com foto, número, partido e vice. A lousa diz 2º turno, e
  há santinhos no chão perto da porta, metade de cada cor.
- **A apuração virou frente a frente**: a lista de treze ficava com duas linhas e muito vazio. Cada
  chapa no seu lado, sempre na ordem do número; a porcentagem é dos VÁLIDOS, como a do TSE, e soma 100
  (`porcentagens`, testada); quem está na frente em dourado; o cabo de guerra com o meio marcado.
- **A mão da cabine é desenhada letra a letra** (`MAO`, em `cabine.ts`), como os glifos: em retângulos
  ela era um bastão com um bloco embaixo. Vista por trás — indicador com unha e duas dobras, os outros
  dedos fechados em degrau, polegar do lado —, com a manga azul da camisa do bonequinho vindo de baixo,
  pela direita, e alargando ao descer. Uma tentativa de gerar a mão juntando peças arredondadas com
  contorno automático deixou costuras no meio da palma e foi descartada.
- A fonte ganhou `º` nos dois tamanhos e `%` na grande.

## O Catan (27/09/2026)

Pedido do dono: "faça o gameboard Catan para o Saga, poder jogar multiplayer, analise o game e traga
pra cá, com os dados e tudo". Antes do código, a prancheta (claude.ai/artifact/AmMrgETf88y4h215ACtUEB)
com a análise do jogo e as telas feitas com o CSS de verdade. Ele escolheu: **a disposição A** (a da
casa, como o xadrez: tabuleiro e mão à esquerda, coluna dos jogadores, custos e "Acontecendo" à
direita — e não a B, com os jogadores nos cantos como no colonist.io), **de 2 a 4 jogadores agora, 5–6
depois**, **tabuleiro sempre sorteado** e **arte ilustrada** — com "porém melhore as ilustrações", que
trouxe o volume nos terrenos, os pinheiros, as ovelhas, o trigo, o barro, os picos com neve, o píer e
o barco dos portos, e as cartas mostrando o RECURSO em vez do terreno.

- **A regra mora no servidor, como a do xadrez** (`catan.mjs`, o motor; `catans.mjs`, as mesas). O
  servidor rola os dados, embaralha as 25 cartas de desenvolvimento e sorteia o roubo — ninguém rola
  na própria máquina. Cada leitura (`vista`) já traz o que QUEM PERGUNTA pode fazer agora: os
  cruzamentos onde cabe aldeia, as arestas de estrada, as aldeias que viram cidade, os terrenos do
  ladrão com quem dá para roubar em cada um, as cartas jogáveis, a taxa do banco. A tela desenha só
  isso. A mão e as cartas de desenvolvimento dos outros chegam só como QUANTIDADE; a carta roubada só
  aparece para os dois envolvidos; a carta comprada, só para quem comprou. No fim, tudo aparece.
- **As peças se chamam pela posição.** O cruzamento é "x,y" numa grade inteira (meias-larguras e
  meios-raios de hexágono) e a aresta é o par dos dois cruzamentos. O app desenha qualquer peça
  sabendo só o nome dela — não há tabela de posições viajando, nem uma segunda geometria no app que
  pudesse discordar da do servidor. `catan.test.ts` confere que os seis cantos de um hexágono caem a
  1 do centro.
- **As regras do jogo base, inteiras**: colocação em ida e volta com a segunda aldeia rendendo;
  produção com o banco que falta não pagando ninguém daquele recurso (e pagando o que houver se só
  um pediu); 7 com descarte de metade para quem tem mais de 7, ladrão e roubo sorteado; regra da
  distância; estrada que não passa pela aldeia de outro; maior estrada (5+, cortável por aldeia no
  meio — e empatados os de cima depois do corte, ninguém fica com ela); maior exército (3+);
  desenvolvimento que não vale no turno em que foi comprado, um por turno, cavaleiro antes de rolar;
  monopólio, ano de fartura, duas estradas; portos 3:1 e 2:1; troca com os jogadores (oferta a todos,
  aceite, contraproposta, e quem está na vez fecha com quem quiser); vitória com 10 NA PRÓPRIA VEZ,
  contando as cartas de ponto escondidas.
- **Partidas inteiras de robôs são o teste que segura isso** (`catan.test.mjs`): 40 partidas de 2 a
  4 jogadores, cada robô sorteando uma ação qualquer do que a `vista` oferece. A cada passo: nada do
  que a tela oferece é recusado, as cartas se conservam (banco + mãos = 19 de cada), e ninguém fica
  com 10 pontos na própria vez sem a partida acabar. Foi essa última conferência, escrita junto com o
  teste da vitória, que achou o defeito de construir aldeia não conferir a vitória.
- **Sem relógio, até 04/10/2026** (decisão do dono, depois desfeita por ele mesmo): à mesa entre
  amigos ninguém cronometra a vez. O preço é alguém que fecha a Saga segurar todo mundo; por isso
  **quem não aparece há 10 minutos sai da partida sozinho** — nem na mesa, nem na busca de salas, que
  roda enquanto a Saga está aberta. Quem só foi ler o chat continua aparecendo. Quem sai deixa as
  peças (que continuam cortando estradas) e devolve as cartas ao banco; sobrando um, ele vence. Os
  10 minutos continuam valendo com o relógio.

### O relógio, os avisos e as cartas (04/10/2026)

Pedido do dono, jogando: tempo na vez e na troca, "mais evidente quando for minha rodada" e "que eu
vou mexer os dados", som na passagem da vez, na troca e em cada jogada, e "design mais evidente das
cartas, mais foco". Na prancheta (claude.ai/artifact/AmMrgETf88y4h215ACtUEB, página "Relógio, avisos
e cartas") havia A ou B para a vez e C ou D para as cartas; **o dono deixou a escolha comigo** e saiu
A e C. Depois pediu o aviso no meio — "mostrando, não falando".

- **O tempo da vez é de 30 s ou 1 min, escolhido por quem abriu a mesa** (`acao: 'tempo'`), e vale no
  "jogar de novo". **Estourou, o jogo joga por você** e a partida nunca fica parada: na colocação,
  aldeia e estrada num lugar sorteado; antes de rolar, rola; no ladrão, terreno e vítima sorteados;
  e passa a vez. No 7, quem deve cartas tem o mesmo tempo para devolver, e o relógio de quem rolou
  fica PARADO enquanto isso. Se o 7 saiu do próprio relógio (quem rolou já estava fora do tempo), o
  ladrão vai na hora e a vez passa. Cada coisa do relógio entra no "Acontecendo".
- **O prazo é um instante do relógio do servidor, vencido pela leitura seguinte** — o mesmo do
  xadrez, sem `setTimeout` no servidor. Toda tela pergunta de 800 em 800 ms e a busca de salas também
  vence a vez, então quem saiu da tela do jogo não segura a partida. Prazos vencidos andam em
  cascata, cada um no instante em que venceu. Jogada que chega depois do prazo é recusada: a leitura
  antes dela já jogou a vez vencida.
- **A troca tem 15 s fixos**: quem não respondeu conta como recusa; se ninguém quis, ela fecha
  sozinha ("ninguém quis"); se alguém aceitou, quem ofereceu ainda fecha dentro do tempo da vez dele.
  Com a vez de 30 s, uma troca come metade dela — foi dito ao dono antes.
- **A faixa da vez fica ACIMA do tabuleiro, e não por cima.** Na primeira prancheta ela ficava
  sobre o tabuleiro e tapava os portos da fileira de cima. Diz de quem é a vez, o que falta fazer e o
  tempo (vermelho nos últimos 5 s, quando tiquetaqueia), com uma barra da cor de quem joga; na sua
  vez ela acende. Na sua vez de rolar, os dados viram um botão grande no canto deles, e **a barra de
  espaço rola** — nunca dentro de campo de texto nem sobre um botão, que o espaço já apertaria.
- **O aviso "Sua vez!" / "Vez de Tava1" aparece no meio do tabuleiro a cada vez que começa**, inclusive
  no começo da partida (quem pôs a última aldeia rola primeiro, e a vez não muda de mão). Fica 1,6 s
  e não pega clique: a jogada de quem já está jogando não espera aviso.
- **As barras de tempo andam aos saltos, quatro por segundo, SEM transição.** Com `transition: width
  .25s`, cada salto virava uma animação emendada na seguinte: a janela se redesenhando a partida
  inteira, o que o `animacoes.test.ts` existe para impedir — e o teste não pegava, porque não era
  `infinite`. Quem pegou foi a ferramenta de fotos, que nunca achava a tela parada.
- **As cartas da mão têm o dobro do tamanho, com o nome e a quantidade, e a que chega sobe com "+1
  lã" por 2,5 s.** Pesou o relato do dono, "com casa no 4 e no 3 em 30 minutos não ganhei 1 carta
  direito": a produção foi conferida (300 partidas de robôs, 445 mil rolagens, zero diferenças contra
  uma conta independente pela geometria do desenho) e o dado também (1 milhão de rolagens). O 3 e o 4
  somados rendem o mesmo que UM terreno de 6 ou 8, e a carta chegava sem ninguém ver — agora se vê.
- **Os sons são sintetizados (`somDoCatan.ts`) e saem da DIFERENÇA entre leituras**
  (`oQueTocarNaPartida`, puro e testado): a vez que muda (a sua, mais alto), o tique dos últimos 5 s,
  a troca que chega para você, estrada, aldeia, cidade e carta comprada de QUALQUER um, e as cartas
  que renderam para você. Na primeira leitura, nada — abrir a tela não é acontecer. Com a tela do
  jogo aberta, o aviso de vez da busca de salas (`App.tsx`) não toca, para não sair dobrado.
- **Medido** no renderer de verdade pelo passo `19-catan` do `ferramentas/fotografar` (contra
  servidor local, com robôs nos outros lugares): o tempo escolhido pela tela, o aviso, o botão e a
  barra de espaço, o "+1", a troca vencendo sozinha, o relógio vermelho e a vez estourando (numa
  rodada, o dado do relógio deu 7 e o ladrão foi sozinho). **Não foi exercido**: o DESCARTE vencendo
  na tela (só nos testes do servidor); nenhum som foi ouvido; o Electron; o Windows.

### A troca para o relógio (06/10/2026)

Pedido do dono, jogando: "a troca de cartas deve pausar o tempo da rodada e começar a contar o tempo
da troca", e logo depois "ao abrir a aba de troca eu quero poder ter um tempo também, está passando
muito rápido: 20 segundos para definir a troca, e depois o tempo para aceitarem ou recusarem".

- **Abrir a janela de troca PARA o relógio da vez e dá 20 s para montar** (`montarTroca`); oferecer
  leva aos 15 s de resposta, ainda parado; quando a troca fecha para respostas, a vez volta com o que
  sobrava — o mesmo `pausa` do 7. Fechar a janela sem oferecer (`desistirDaTroca`) devolve o relógio
  na hora; os 20 s vencendo fecham a janela sozinhos ("Seu tempo para montar a troca acabou"). A tela
  avisa o servidor pela MUDANÇA da janela, num lugar só, para nenhum caminho de fechar (cancelar,
  Esc, outra janela, "passar a vez") esquecer de devolver o relógio — e o `desistirDaTroca` não
  recusa nada, porque fechar pode chegar junto com o "passar" que já levou a vez embora.
- **Até 3 trocas por vez param o relógio** (`TROCAS_COM_RELOGIO_PARADO`) — escolha minha, dita ao
  dono. Sem limite, abrir e fechar a janela seguraria a partida para sempre; da quarta em diante a
  troca continua valendo, correndo junto com a vez, como era antes. A oferta que chega sem montagem
  (o app antigo, que não avisa quando a janela abre) também para o relógio e gasta uma das três.
- **Todos responderam, a oferta fecha na hora**, sem esperar o resto dos 15 s: com o relógio da vez
  parado, esperar à toa seria tempo de ninguém.
- **A faixa da vez conta o tempo da troca** enquanto ela para a vez ("Monte a sua troca", "Tava1
  quer trocar com você"), e diz onde a vez parou ("a vez está parada em 0:23"); a janela de troca
  ganhou a mesma barra e os mesmos segundos da oferta. Nenhuma peça nova de tela: é o desenho que a
  oferta já tinha.
- **O limite de cartas no 7 FICA.** O dono pediu para tirar ("tire o limite de cartas") e, minutos
  depois, voltou atrás: "deixa do jeito que tá". Quem tem mais de 7 continua devolvendo metade.

### A mesa em volta (06/10/2026)

Pedido do dono, jogando: "pense um pouco no UNO de PC, que aparece o pessoal em volta da mesa, o
baralho deles — poderia ter mostrando na mesa as cartas escondidas, a quantidade, a carta de
desenvolvimento separadinha, as cartas do banco"; "melhora também a cola da carta de custos"; "quero
o jogo mais jogo e não tão integrado com a Saga — ao iniciar e estar dentro do jogo ele ser mais um
jogo individual"; e "faça design das cartas de desenvolvimento também, capricha". Na prancheta
(claude.ai/artifact/AmMrgETf88y4h215ACtUEB, página "Mesa em volta") havia A (mesa reta) e B (mesa
inclinada, como o UNO); **ele escolheu a A**. A B — a mesa em perspectiva com as cartas deitadas —
ficou recusada; o desenho das cartas era proposta única e entrou como estava.

- **Começada a partida, a janela inteira é o jogo.** A trilha, a barra de salas e a lista de pessoas
  saem pelo CSS (`.app:has(> .stage .catan-mesa)`, no catan.css), e não por estado no App: quem sabe
  que a partida começou é a tela do jogo, e o App não precisa perguntar. ESCONDIDAS, não
  desmontadas — a barra lateral continua com a rolagem e o que estava aberto. O áudio da call nunca
  dependeu delas (`getAudioRoot()`, no useRoom), e a live assistida continua chegando pelo `jogo(live)`
  do Stage. A mesa esperando gente, o convite e o "Começar" continuam dentro da Saga.
- **A barra da mesa traz o que a Saga escondida levaria junto**: "Voltar para a Saga" (o "Sair da
  tela" de antes — a partida continua e fica no alto do chat), a sala da call, o microfone e o fone
  (os MESMOS `toggleMic`/`toggleDeafen` do painel da conta, passados pelo App em `call`), a rodada, o
  "assistindo" e o "⋯" com o desistir, que continua armando no próprio botão.
- **Cada um senta num lado, na ordem da vez** (`lugaresEmVolta`, puro e testado): você embaixo, e
  quem joga depois de você à sua esquerda, como no UNO. Com quatro: esquerda, cima e direita. Com
  três: **esquerda e direita** — o lugar de cima fica vazio e o tabuleiro cresce para ele (escolha
  minha). Com dois: em frente. Quem só assiste vê o jogador 0 embaixo, como um lugar comum.
- **O lugar mostra o baralho de cada um**: a foto no anel da cor dele, o nome, o disco de pontos,
  cavaleiros e tamanho da estrada, as fitas de maior estrada e maior exército, as cartas de recurso
  VIRADAS em leque com a quantidade num selo, e as de desenvolvimento num montinho à parte com outro
  verso. Na vez dele, o tempo corre num anel em volta da foto (o mesmo prazo da pílula) e o lugar
  acende na cor dele. Quem deve cartas no 7 ganha "devolvendo N".
- **O banco vai para a mesa** (no alto à esquerda): cinco montes virados para cima, cada um com
  quantas cartas sobram, e o baralho de desenvolvimento virado, com quantas restam.
- **A faixa da vez virou a PÍLULA acima da sua mão**, com os mesmos dados (`faixaDaVez`, inclusive a
  troca parando a vez e o 7). Quem joga agora já acende na mesa — o anel e o lugar —, e o que sobra
  dizer fica junto da mão, onde se joga.
- **O "Acontecendo" ficou pequeno no alto à direita**, com as linhas mais novas embaixo e a de cima
  se apagando (máscara, em vez de cortar a linha ao meio); "abrir" mostra a partida inteira por cima
  do lugar da direita. A coluna de antes não cabe na mesa em volta.
- **A cola de custos é a carta do jogo de tabuleiro**: papel creme com borda dourada, a peça na sua
  cor (`iconeDeConstruir`, de `iconesDoCatan.ts`), as cartas que ela custa e o disco de pontos (a
  carta de desenvolvimento leva "?": algumas valem ponto). **Na sua vez, nas ações, acende exatamente
  o que os botões deixam fazer** (`pode`); fora dela, o que as SUAS cartas já pagam, com peça
  sobrando, para planejar a vez que vem (`oQueDaParaConstruir`, puro e testado). A primeira versão
  acendia pelas cartas sempre, e a foto da sua vez mostrou a linha da Cidade acesa com o botão Cidade
  apagado — cartas na mão, nenhuma aldeia para virar cidade: parecia defeito. Para quem assiste, e
  no fim, ela fica inteira.
- **A arte das cartas é um sprite** (`cartasDoCatan.ts`): as de recurso trazem o terreno do PRÓPRIO
  tabuleiro num medalhão (`defs()` + `terreno()`), as cinco de desenvolvimento têm ilustração e o
  que fazem escrito, o verso de recurso é o mar com os seis terrenos e o de desenvolvimento é vinho
  com a coroa. Tudo vira `<symbol>`s montados UMA vez, escondidos na mesa, e cada carta é um `<svg>`
  com `<use>`: a tela redesenha a cada leitura (800 ms) e tem dezenas de cartas — repetir o SVG
  inteiro de cada uma (o terreno passa de 10 KB) seria refazer centenas de KB de DOM a cada leitura.
  As cartas pequenas das janelas (troca, descarte, fartura, monopólio) usam a mesma arte, sem o nome.
- **As cores da mesa moram no desenho**, não no CSS: o feltro, o papel, o ouro e os selos estão em
  `CORES_DA_MESA` e a tela os escreve como variáveis no elemento da mesa; o `design.test.ts` as
  conhece pela lista `DA_HORA`. O catan.css continua só com tokens.
- **As medidas acompanham o espaço de verdade**: os lados são `clamp(196px, 23vw, 296px)`, e a
  carta da mão é `min(62px, 10cqw, 8.4vh)` do meio da mesa (container query) — com cinco recursos e
  as de desenvolvimento ao lado, ela tem de caber sem empurrar os lados. Com três ou mais tipos de
  desenvolvimento, as cartas se sobrepõem. Os dados e o botão de rolar ficam junto da borda do
  TABULEIRO (a caixa é mais larga que ele; numa tela larga eles iam parar longe), calculada pela
  proporção do SVG em `cqh`. Na janela baixa (até 720 px) tudo aperta; na mínima da Saga (900×560)
  a cola perde a coluna do nome e o banco quebra em duas linhas, mas nada sobrepõe nem rola.
- **A live assistida fica na coluna da direita, abaixo do lugar de quem senta ali** — nunca por cima
  do tabuleiro, a mesma regra de antes.
- **Visto** numa bancada no Chrome headless e mudo, com a TelaDoCatan de verdade e a partida vinda do
  `server/catan.mjs` rodando ali, jogada por robôs: sua vez, vez de outro, rolar, troca montando, 7 com
  descarte, três jogadores, dois, plateia, fim, histórico aberto, o "⋯", live, e 900×560, 1100×700,
  1280×800 e 1920×1080. **Não foi visto**: o Electron, o Windows de verdade, foto de gente (a bancada
  usa a inicial), a live de verdade, e nenhum som.

- **A mesa vive na MEMÓRIA do servidor, como as do xadrez**: publicar o servidor com gente jogando
  encerra a partida. Uma partida de Catan dura uma hora; se isso incomodar, é guardar no banco.
- **Anda por HTTP, perguntando de 800 em 800 ms**, como o xadrez: é jogo de turno, poucas ações por
  minuto — não precisa do canal de dados do LiveKit que a Fórmula 1 usa.
- **O tabuleiro é desenhado por código, em texto SVG** (`desenhoDoCatan.ts`): o fundo (mar, portos,
  terrenos) é montado uma vez por partida e as peças uma vez por mudança; os alvos de clique ficam
  numa camada de JSX por cima. O que há dentro de cada terreno sai de um sorteio com semente pela
  POSIÇÃO, então é o mesmo desenho em todo computador e não muda a cada leitura. As cores do jogo
  moram ali, não no CSS: as da casa servem para o app, não para um jogo (a lição da primeira F1).
- **Os dados rolam por 900 ms na tela de todo mundo, a cada rolagem** — inclusive a dos outros —, os
  terrenos que renderam acendem, e o som é sintetizado na hora (`somDosDados.ts`, como o motor da F1):
  doze estalos filtrados, cada vez mais espaçados, e as duas batidas do fim. Fone desligado cala.
- **O que está de fora desta versão**: 5–6 jogadores (o dono escolheu depois); o controle ao lado do
  nome de quem joga (só o xadrez tem; a F1 e o Dragão também não); o tabuleiro fixo do manual.
- **Medido** no renderer de verdade, num Chrome headless e mudo contra servidor local, com partidas
  semeadas por robôs pela rede: a colocação clicando no cruzamento e na aresta, rolar e acender os
  terrenos, a troca com o banco (as taxas dos portos certas) e entre dois jogadores (oferta, aceite,
  recusa, fechar), o descarte do 7, o lobby, o fim com o placar e o gráfico dos dados, o menu de jogos
  e o cartão de convite. **Não foi exercido**: o app no Electron, o convite chegando pela busca de
  salas numa Saga de verdade, a faixa da partida, o som dos dados (a bancada é muda), o Windows.
- **O ladrão é o mascarado de pele escura** (prancheta, página "Peças e ladrão": o dono escolheu o 1
  dos três e pediu a pele escura). Era um peão cinza, e ele queria "algo mais ladrão mesmo": touca,
  máscara nos olhos, camisa listrada e o saco de moedas nas costas. Tem um contorno claro
  (`ladrao-contorno`, um filtro de dilatação) porque, sem ele, a touca e a máscara somem na floresta.
  Os ids são fixos: só há um ladrão no tabuleiro. O gradiente do ladrão antigo saiu dos `defs`, e o
  `desenhoDoCatan.test.ts` confere que todo `url(#…)` do tabuleiro aponta para algo que existe —
  referência solta não dá erro, o desenho só some.
- **Os ícones de construir são as miniaturas** (opção 2 da mesma página; a 1 eram peças de madeira
  maciças): cada peça num pedacinho de grama, em isométrico, com parede creme e telhado ou bandeirola
  na cor de quem joga (`iconesDoCatan.ts`). Sem `<defs>` nem id, porque a mesma peça aparece no botão e
  na cola ao mesmo tempo. As peças NO tabuleiro continuam as de antes — ele não pediu para mudar.


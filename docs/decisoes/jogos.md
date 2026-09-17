# Xadrez, Fórmula 1 e Urna

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
o **menu em grade de capas** (opção A), a **apuração por servidor com voto secreto**, e aprovou o resto.

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

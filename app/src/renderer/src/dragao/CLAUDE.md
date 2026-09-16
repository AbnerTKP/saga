# O Dragão Quadrado

O geral está no `CLAUDE.md` da raiz; o árbitro mora em `server/lutas.mjs`.


Jogo de luta 1 contra 1 em pixel art, pedido pelo dono em 14/09/2026: quatro lutadores
paródia de Dragon Ball (Goiaba, Vegetal, Picolé, Geladeira) — sete desde 16/09, com o Goiaba e o
Vegetal da Super Feira e a Goteira —, vida e ki, quatro cenários
(Torneio, Planeta Verde, Ilha da Tartaruga, Cânion). O código do jogo mora em
`app/src/renderer/src/dragao/`; a tela, em `TelaDaLuta.tsx`; o árbitro, em `server/lutas.mjs`.

- **O dono escolheu vendo imagens do motor, e depois delegou o resto.** Viu os cenários, os
  lutadores e três placares renderizados pelo código de verdade, escolheu o **placar A**
  (vida larga no alto, ki em três barras nos cantos de baixo), disse que é **só jogador
  contra jogador** — "esqueça a IA do computador" — e mandou terminar e publicar sem depender
  dele. Controles simples, a arena no molde do grid da Fórmula 1 e o convite no mesmo cartão
  foram decisões tomadas por padrão da casa, não escolhidas por ele.
- **Os lutadores são o sprite do zip, pixel a pixel** (`dragao/pixel/`). O dono mandou um Goku
  32x32 feito numa ferramenta de pixel art e, depois de ver o estilo imitado, corrigiu: *"eu
  queria literalmente que você utilizasse o modelo do zip"*, e que os outros fossem gerados a
  partir do Goku parado. O Goiaba parado É o zip (o teste confere pixel por pixel); as poses de
  luta saem de PEÇAS recortadas dele (cabeça, tronco, pernas), mexidas de pixel em pixel, e de
  CARIMBOS de braço e perna pintados nas mesmas letras e paleta (`carimbos.ts`, `poses.ts`).
  Cada pixel carrega o seu MATERIAL — pele, cabelo, camisa, manga, mão, faixa, calça, bota,
  sola —, e é isso que faz os outros três: vestem o corpo do Goiaba trocando a rampa de cada
  material pelo brilho (`vestirPecas`), então o salpicado do zip continua, só que azul, roxo ou
  branco, e trazem cabeças e enfeites próprios (armadura, capa, rabo) num arquivo cada, que se
  registra ao ser importado (`registrarPixel`; `todos.ts` importa os três). A arte de 48x40 é
  ampliada 3x sem suavizar, com o pé na âncora do sprite de antes, e o resto do jogo não sabe a
  diferença. **O boneco de esqueleto continua no código como reserva** (`boneco.ts`,
  `raster.ts`, `personagens/`): lutador sem pixel cai nele sem erro nenhum — por isso o teste
  exige pixel dos quatro. A tela é 384x216 ampliada sem suavizar; o sprite é montado uma vez por
  pose e guardado (`animacoes.ts`), e o tempo de cada pose sai das fichas. **Saiu cru, com pressa
  pedida pelo dono**: a capa do Picolé pendurada é um bloco branco, o cabelo do Vegetal é quadrado
  demais e a forma dourada dele não tem a chama mais alta, a Geladeira não tem as placas do peito,
  e as caras de grito e dor dos três são as do Goiaba mal adaptadas.
- **A segunda cor (Goiaba contra Goiaba) gira a roupa pelo MATERIAL, não pela cor.** Pela cor,
  o cabelo escuro do zip tem matiz o bastante para girar, e o Goiaba do espelho saía de cabelo
  verde — visto na imagem de uma luta de verdade. Pele, cabelo, olho e o que usa a rampa da pele
  (o braço do Picolé) ficam.
- **As caixas de golpe e a altura dos disparos saem do sprite de pixel** (`GOLPES_BASE`, em
  `fichas.ts`; `PROTOCOLO` 4). As do boneco eram de perna e braço compridos: medido, o punho do
  zip esticado vai 37 px à frente do pé e o pé do chute também, e a caixa do chute ia a 60 — o
  chute acertava 20 px antes de encostar. O raio saía na altura do rosto (57 px), com as mãos a
  40–51. Hoje o soco acerta até 56 px entre os centros e o chute até 58 (o corpo de quem apanha
  tem uns 20 px do centro à frente), e simulado nos quatro lutadores as duas sequências
  continuam encadeando até o fim. O Picolé segue com 22% a mais de alcance e a rasteira da
  Geladeira com o rabo — são o jeito de cada um, não o desenho.
- **A simulação é inteira e determinística** (`luta.ts`, contra o contrato de `tipos.ts` e
  as fichas de `fichas.ts`): posição em 1/64 de pixel, nada de `Math.random`, relógio ou
  vírgula acumulada, e o estado é objeto simples que `clonar` copia campo a campo. O que o
  desenho e o som precisam de um golpe fica ESCRITO no estado (`impacto*`), e não disparado
  como evento — refazer um quadro não pode soltar a faísca duas vezes.
- **A luta online é rollback, como nos jogos de luta** (`rede.ts`). Esperar o botão do outro
  atravessar a internet a cada quadro deixaria o soco 100 ms atrás da tecla. Os dois rodam a
  mesma simulação, cada um aplica o próprio botão com dois quadros de atraso e chuta o do
  outro repetindo o último; quando o de verdade chega diferente, volta ao quadro errado e
  refaz. Sem notícia por mais de 8 quadros, ESPERA em vez de adivinhar. Os botões vão pelo
  canal de dados do LiveKit sem garantia de entrega — cada pacote repete tudo o que o outro
  ainda não confirmou — e os dois trocam a impressão digital do estado de 2 em 2 s; divergir
  vai para o registro. O servidor só arbitra o que muda devagar: arena, lados, convites,
  semente, a hora do início e o resultado (dos dois; discordando, vale o primeiro e ele anota).
  Como as corridas, **reiniciar o servidor encerra as lutas**.
- **Medido com uma rede de mentira e com uma de verdade.** Nos testes, com 0, 40, 120 e
  250 ms e até 20% de perda, os dois lados terminam idênticos à luta de referência sem rede.
  Pelo LiveKit local e o servidor local, dois robôs do `@livekit/rtc-node` com a mesma
  simulação lutaram até o nocaute: nenhuma divergência, no máximo 8 quadros de volta no tempo,
  e o servidor aceitou o resultado. E o app de verdade, escondido e mudo, contra um robô: o
  convite chegou e foi recusado pelo cartão, a arena abriu pelo menu de jogos, o robô sentou, a
  luta rodou a **61 quadros por segundo** com o teclado do app acertando o robô, e o desistir
  terminou a luta no servidor.
- **Quem assiste não pode publicar nada na sala, e isso falha calado.** O passe da plateia
  só assina; o primeiro desenho da plateia PEDIA o estado da luta a quem luta, e pelo
  `rtc-node` a publicação sem permissão resolve e é descartada — a plateia ficou no quadro 0
  para sempre, sem erro. Hoje o lado 0 manda o estado confirmado de 5 em 5 s, e quem entra no
  meio pega a luta em até 5 s. Medido pelo LiveKit local: a plateia entrou no meio e
  acompanhou, dois quadros à frente de quem luta (é o atraso dos botões).
- **A simulação anda num `setInterval`, e o desenho no `requestAnimationFrame`.** Com a
  janela escondida o rAF para, e o outro lado ficaria esperando por nós.
- **Protocolo**: `PROTOCOLO` em `lutas.mjs` e `PROTOCOLO_DA_LUTA` no app. Mudou a simulação
  de um jeito que a versão anterior não entende, sobe o número: app velho não senta.
- **O tamanho mudou duas vezes, e hoje a escala é 1** (`ESCALA`, em `medidas.ts`). Na v0.54 os
  lutadores ficaram 1,5× maiores para o boneco de esqueleto ter rosto e mão; com o sprite do zip
  ampliado 3x o dono achou "enorme", e na v0.56.1 o zip vai 2x (62 px) com a escala 1. Tudo o que
  a simulação mede escala junto, então encolher mudou a luta (`PROTOCOLO` 5), e com o raio mais
  lento a última batida da super deixava de caber nos 70 quadros: hoje a batida que derruba é a
  última que cabe. O que segue é da mudança para 1,5, e vale ao contrário:
  O dono achou os cenários perfeitos e disse que os personagens "merecem refinamento", e o
  limite era o tamanho: com 66 px de altura a cabeça tinha 12, e rosto, mão e músculo não
  cabiam. O motor escala sozinho o que passa pelos ajudantes de `boneco.ts` e os raios das
  peças; **medida em pixel somada direto a um ponto não escala**, e foi assim que a capa do
  Picolé e o rabo da Geladeira saíram soltos e curtos na primeira passada. O retrato do placar
  continua na escala 1, que é o que cabe nos 32 px dele. A simulação mede em pixels da tela, e
  por isso as fichas escalam junto (`escalar`, em `fichas.ts`): espaço e pulo 1,5×, velocidade
  1,3× — o mundo continua com 640 px, e lutador maior correndo na mesma proporção atravessaria a
  arena rápido demais.
- **O contorno é seletivo e a sombra tem cinco tons** (`raster.ts`): por fora do corpo, o
  contorno da peça; por dentro, onde uma peça cobre outra, um tom escuro da própria peça — o
  arame preto em volta de cada pedaço era o que dava cara de recorte. Quem sabe o que é contorno
  de FORA é o `bordas` do sprite (e não "é quase preto"), porque os contornos são coloridos: sem
  isso, a silhueta abria onde duas peças se encontram.
- **"No estilo do zip" foi lido primeiro como IMITAR o estilo, e não era.** A v0.55.0 saiu com o
  boneco de esqueleto redesenhado à maneira do zip — chibi, olho grande, contorno colorido,
  sombra pontilhada — e o dono cobrou o modelo em si. Esse boneco chibi é o que ficou de reserva
  em `personagens/`; a arte de antes dele — heróica, 1,5× e refinada, a da v0.54.0 — está na tag
  **`arte-esqueleto-v0.54`**, porque ele pediu para poder voltar. Quando alguém manda um arquivo
  de referência, perguntar se é para PARECER com ele ou para SER ele custa uma linha.
- **A transformação é da luta, não de vitrine** (`TRANSFORMACAO`, em `fichas.ts`): tecla P,
  precisa de uma barra e meia de ki e gasta meia; o grito dura 1,1 s e é **invulnerável**.
  Nasceu com 2,5 s e interrompível ("gritar na cara do outro é risco"), e o dono achou demorado:
  jogado, o grito virava esperar apanhar. Transformado, 25% mais dano e 15% mais rápido; o ki
  escoa uma barra a cada 10 s e, zerando, volta ao normal. Round novo começa na forma de sempre. Os nomes são do dono: Super Goiabadin, Super Vegetalzin; Picolé de Laranja e
  Geladeira Dourada seguem a obra (o Piccolo laranja e o Freeza dourado).
- **Os sons da transformação, do teletransporte e dos raios são gravações que o dono mandou**
  (`dragao/sons/`, tocadas por `somDeArquivo.ts`), recortadas e niveladas por LUFS, e não por
  pico: o estouro da transformação a -14, os disparos a -15, carga e teletransporte a -18 e -19.
  O grito dura enquanto o lutador grita e cala em 120 ms quando a transformação completa ou é
  interrompida — o pedido foi que o som não ficasse depois. Do "basic beam", só o estouro
  (2,3 s a 4,6 s) vai no disparo e o começo vai na carga; do arquivo dos ataques de dedo, o
  primeiro trecho é a carga do Picolé, o segundo o Picolé Espiral e o terceiro o Raio
  Congelante. Tocam por `<audio>`: a página vem de `file://`, e a Web Audio precisaria buscar o
  arquivo para decodificar. **Soco, chute e rajada de ki** também são gravações dele, com
  variações que se revezam (quatro socos e dois chutes tirados dos arquivos, duas rajadas tiradas
  do começo de dois trechos de um disparo contínuo, que não tinha disparo isolado dentro);
  o golpe forte leva junto o baque grave sintetizado, que dá o peso. Depois veio um pacote de
  40 sons de luta num arquivo só: separado por silêncio e, sem ouvir, classificado pelas medidas
  — soco é curto e de ataque seco (pico nos primeiros 70 ms), chute é mais longo e com mais
  grave, defesa é o estalo mais claro (menos grave em relação ao total). Deu mais cinco socos,
  três chutes, quatro defesas (a defesa era um estalo sintetizado que ninguém ouvia) e um golpe
  forte, sorteados sem repetir o anterior e igualados pela média (-16,5 dB; defesa -19). **Se
  alguma classificação estiver errada é de ouvido, e é do dono.** Duas daquelas "defesas" eram
  vento de golpe (subida lenta, quase sem grave) e viraram, com um terceiro trecho, o **golpe no
  ar** que o dono pediu "mais oco": toca quando o soco ou o chute passa do primeiro quadro que
  acerta sem encostar em ninguém, com os agudos cortados acima de 2,8 kHz e a -19. Achar de onde
  saiu cada recorte foi por envelope (5 ms) contra o pacote inteiro — correlação acima de 0,99. A aura de carregar ki é o
  mesmo arquivo do estouro da transformação (md5 igual): o estouro usa o começo, a aura usa o
  zumbido com raios de 1,8 s a 9,3 s, em laço enquanto a tecla está segurada.
- **O volume do jogo mora na arena, com um "Testar"** que toca soco, chute, rajada e raio no
  volume escolhido — foi o pedido: regular e ouvir antes de entrar na luta. Vale para os
  gravados e os sintetizados, muda também o que já está tocando, e fica no computador
  (`cantinho.volumeDaLuta`, lido por `volumeGuardado`: chave vazia não pode virar zero).
- **Os três de 16/09/2026: Goiaba e Vegetal da Super Feira, e a Goteira.** O pedido foi "o goiaba
  da super feira, o vegeta da superfeira, com transformação blue, e fusão do goten com trunks", e
  lia-se de dois jeitos — formas novas nos lutadores de hoje ou lutadores novos. O dono escolheu:
  **dois lutadores novos** (o P deles é o Blue; o Goiaba e o Vegetal de antes seguem dourados) e a
  fusão como **Gotenks já fundido, com o Super Saiyajin 3 no P**. Os nomes Goteira, Super Goiabadin
  Blue, Super Vegetalzin Blue e Super Goteira 3 NÃO são do dono: saíram por padrão, na linha do
  Super Goiabadin que ele deu, e são troca de uma linha.
  O corpo é o do zip, como o dos outros: os da Super Feira são o Goiaba e o Vegetal com outra roupa
  (marinho; azul-rei e sem ombreira — `pecasDoVegetal` recebe a roupa, `comOmbreira` é a conta da
  ombreira que a Goteira também usa para o enchimento mostarda do colete). Por isso o rosto normal
  deles é igual ao dos de antes, e **na escolha eles aparecem no Blue** (`formaNaEscolha`). A
  Goteira é o zip com o cabelo preto, espetos mais altos e a franja lilás pintada por cima; o Super
  3 troca a cabeça (testa limpa e coroa) e ganha a **juba**, que não pode morar na cabeça — ela
  passaria por cima do corpo — e entra por baixo da pose montada, presa onde a cabeça da pose está
  (`comJuba`). **A escolha virou fileira de retratos**: com sete, a grade de quatro deixava buraco;
  o dono viu as duas telas desenhadas e escolheu a fileira. App velho não conhece os ids novos e
  quebraria ao ver um deles do outro lado: `PROTOCOLO` 6. Pela primeira vez uma **bola é especial**
  (Big Bang de Brócolis, Fantasma Kamikaze), e não só super: medido contra um Picolé parado, tira
  140 e 150, como o Picolé Espiral, e a super de todos fica entre 180 e 280 — o teste passa pelos
  sete. O ki do Blue é anil e o da Alface Final é verde, para dois raios se encontrando não virarem
  uma mancha só.

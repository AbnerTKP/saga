# Som e microfone

Supressão de ruído, o corte, soundboard e os sons de aviso.

## Decisões que não são óbvias no código

- **O barulho de casa se tira em QUEM FALA, e por isso nasce ligado.** Supressão de ruído e
  sensibilidade agem no seu microfone antes de ele sair: quem ouve a casa de um amigo não
  tem ajuste nenhum que resolva, é o amigo quem precisa da versão nova. Por isso o padrão
  é Forte, com o corte em −50 dB (`AJUSTES_PADRAO`, testado) — desligado, só funcionaria
  para quem abrisse a tela. O desenho foi o escolhido pelo dono entre três: um bloco em
  "Sua conta" e o botão direito no microfone abrindo um cartão igual ao do status, para
  ajustar no meio da call. O microfone deixou de ser `disabled` fora da call — botão
  desabilitado não recebe o botão direito —, e ficou só com a mesma cara.
- **Supressão e sensibilidade fazem coisas diferentes, e as duas foram medidas.** Numa
  mistura de voz sintetizada com barulho, pelo caminho de verdade e medindo o que CHEGA a
  um segundo participante por um LiveKit local: com o corte aberto, o Forte (RNNoise)
  levou ventilador de −36 a −70/−87 dB e o Padrão, a −40; a voz chegou igual nos dois
  (−14). Mas o RNNoise mal toca em teclado (−29 → −34) e deixa voz de TV onde está —
  voz é voz. Quem tira TV e teclado é o CORTE, nas suas pausas: pelo mesmo caminho, o
  trecho só de TV chegou a −105 dB. O texto da tela diz isso e não promete teclado.
- **O filtro é o RNNoise, e não o GTCRN do mesmo pacote.** O GTCRN tirou muito mais teclado
  (−29 → −70), mas processa em blocos quatro vezes mais pesados (14 s de áudio em ~640 ms
  contra ~180 ms, neste Mac): numa máquina mais fraca o bloco passa do tempo que o áudio
  tem, e a voz picota — pior que o barulho. Isso não foi medido em máquina fraca; foi o
  risco que decidiu.
- **O filtro precisa de `'wasm-unsafe-eval'` no CSP, e sem ele EMUDECE em vez de dar erro.**
  Medido: WebAssembly recusado, a saída do RNNoise ficou em −120 dB com a voz a −14 — e ele
  devolve silêncio também enquanto carrega. Por isso quem escolhe a fonte é
  `microfone.worklet.ts`: o som cru vale até o filtro entregar a primeira amostra, e cru
  com som por 4 s sem nada do filtro é falha — medido com o CSP sem a liberação, a voz
  passou inteira e o estado virou "falhou" em 4,5 s, com aviso na tela e no registro.
  O processador de áudio vai como `?worker&url`, que o Vite empacota com a regra de
  `sensibilidade.ts` dentro e emite como ARQUIVO: embutido como `data:` o CSP o recusaria,
  a mesma armadilha dos sons.
- **O corte automático ("Ajustar sozinha") SAIU em 08/10/2026: era ele que "mutava a pessoa
  sozinha".** Ele punha o corte acima do barulho da casa (`piso + 15`) e até 14 dB abaixo da
  fala lembrada, subindo até −20 dB, e a fala lembrada esquecia só 0,02 dB por segundo. Medido
  na própria conta, antes de tirar: depois de uma risada alta, a fala normal passava 7% nos 30 s
  seguintes e 0% no minuto seguinte (uns 6 minutos até o corte descer); com o jogo saindo pela
  caixa a −34 dB, a voz a −24 passava 15%. Sem ícone de mudo: quem falava não tinha como saber,
  e quem joga ou faz live era o mais atingido. O corte agora é fixo (−50 dB, ou o que a pessoa
  arrastar), e os dois casos viraram teste. O `auto` guardado por quem o ligou é ignorado. O
  preço é a TV e o teclado nas pausas, que só ele tirava. Voz cortada é pior. A história de
  como ele foi afinado (a TV com pausas, a varredura de 14 dB e 0,02 dB/s) está no git, até 72db710.
- **O microfone que cai volta sozinho** (`microfoneCaido.ts`, 08/10/2026). Quando o aparelho
  some (fone Bluetooth piscando, Windows trocando o padrão), o livekit-client tenta o padrão
  UMA vez e, falhando, muta e desiste: "could not restart track, muting instead". Era a outra
  metade do "muta sozinha", com o ícone riscado. O Blankito ficou 7 minutos mudo às 00:53 UTC
  de 08/10 sem fone desligado nem nada mudando na sala. Hoje o app tenta de volta em 0,5, 2, 5
  e 10 s (a falha passa ao padrão do sistema para a próxima tentativa). Sem conseguir, avisa na
  tela e **não desiste**: o próximo aparelho conectado tenta de novo. "O negócio é parar de
  mutar quando desconecta o mic" (o dono): o mudo é escolha da pessoa, não do aparelho. **Só reabre faixa que TERMINOU**: o mudo de moderador, o seu e o do fone calam uma
  faixa viva, e reabrir aquilo desfaria a decisão de alguém. **Não foi exercido com aparelho
  de verdade**: os microfones falsos do Chromium não desconectam, e uma bancada com Electron
  nesta máquina abriria o aviso do firewall na tela do dono.
- **O anel de "falando" mede a minha voz DEPOIS do corte.** Medindo o cru, ele acenderia
  com a TV que o corte acabou de tirar da call. E o medidor agora é refeito quando a faixa
  muda — antes ele só era criado uma vez por pessoa, e trocar de microfone o deixava
  lendo uma faixa que não ia mais para lugar nenhum.
- **Trocar de microfone não funcionava, e o microfone que desconectava mutava com erro — a
  mesma causa.** O LiveKit 2.22 remonta o caminho do microfone (`restart` do processador) sem o
  `audioContext`, que só vem no primeiro `init`, apesar do tipo dizer o contrário. A montagem
  quebrava: escolher outro microfone falhava, a faixa morria e ia silêncio para a call — e a tela
  de configurações engolia o erro (`.catch(() => undefined)`), então o seletor mostrava o
  microfone novo. Desconectar o aparelho caía no mesmo lugar pelo lado do LiveKit: ele tenta o
  padrão, a remontagem quebra, e ele "muta em vez disso"; religar dava o erro na tela e nada no
  registro. **Medido** numa bancada escondida e muda (Electron com os microfones falsos do
  Chromium, o `useMicrofone` de verdade, `livekit-server --dev` e um robô do `rtc-node` medindo o
  que chega): antes, −19 dB até a troca e −120 dali em diante, erro `reading 'audioWorklet'` e
  microfone mudo ao religar; depois, a troca, o aparelho que some (a faixa crua terminando), mutar
  e religar, o "Padrão do sistema" e a supressão Forte seguem com som chegando, com um tropeço de
  meio segundo na troca. O processador usa o contexto de `aoPublicar` quando o LiveKit não manda.
- **O seletor mostra o aparelho EM USO, lido da sala, e não o clique.** Foi o seletor que mostrava
  o clique que escondeu a troca quebrada. Troca que falha aparece embaixo dele e vai para o
  registro — e **volta ao padrão do sistema** (`trocarAparelho`): o LiveKit fecha o microfone de
  antes ANTES de abrir o novo, e medido, sem a volta, um aparelho que não abre deixava a pessoa
  muda. "Padrão do sistema" era pedido como id exato vazio, que não é aparelho nenhum: vai como
  `default`. Os apelidos `default` e `communications` saem da lista e viram essa opção, com o nome
  do aparelho que o sistema usa entre parênteses.
- **O microfone escolhido é lembrado, e o padrão do sistema é seguido** (`aparelhos.ts`,
  `conferirMicrofone` no `useRoom`). A escolha vivia só na tela: fechar a Saga voltava ao padrão —
  no Windows, "só vale o microfone do sistema". Hoje ela fica em `cantinho.aparelhos` e vale ao
  abrir a Saga, ao entrar na call e quando o aparelho volta a ser conectado; enquanto ele está
  fora, vale o padrão. E quem está no padrão acompanha o sistema: a faixa aberta no `default`
  fica presa ao aparelho de quando abriu (no Mac, trocar o microfone do sistema não mudava nada),
  e quando o grupo do `default` na lista deixa de ser o da faixa, ela reabre. **Isso não foi
  medido em aparelho de verdade** — os microfones falsos do Chromium não mudam o padrão nem
  desconectam —, e está em `confirmar-com-o-dono.md`. **Os ids dos aparelhos não mudam de uma
  abertura para outra**: medido com o Electron do projeto, uma página `file://` e a mesma pasta de
  dados, aberta duas vezes — os mesmos ids. É o que deixa a escolha guardada valer depois de fechar.
- **Saída de som, câmera e o volume de cada pessoa também são lembrados** (16/09/2026). Os amigos
  do dono reclamaram que tudo voltava ao padrão ao fechar a Saga: o volume de quem eles tinham
  abaixado vivia só na memória, e só o microfone era guardado. Hoje a saída e a câmera escolhidas
  voltam nos mesmos momentos do microfone (`conferirSaidaECamera`, `escolhaParaVoltar`), e o volume
  de cada pessoa e o de cada live ficam em `cantinho.volumes` e `cantinho.volumesDaTela`, pela
  identidade da conta (`u` + id, que não muda), sem guardar quem está em 100% (`volume.ts`).
  **Testado só por fora**: a leitura e a escrita, com teste; voltar a ouvir alguém baixo numa call
  de verdade depois de fechar e abrir, e a saída de som voltando ao fone, não foram exercidos.
- **Os eventos da sala do microfone entram pelo efeito do `useRoom`.** Ele limpa TODOS os
  ouvintes da sala quando se refaz (`removeAllListeners`); um ouvinte registrado à parte
  sumiria calado e o microfone voltaria a ir cru sem erro nenhum.
- **O soundboard vai numa faixa própria**, não misturado ao microfone: tocar não depende
  de microfone ligado, e mutar alguém não muta os sons dele.
- **O volume do soundboard é um só, de quem OUVE, e mora nas configurações.** Um só porque
  som de soundboard não é voz: é efeito, e o que incomoda é o tranco em cima da conversa,
  venha de quem vier — abaixar isso não pode abaixar quem está falando junto. E de quem
  ouve porque o que sai para a sala é tirado ANTES do ganho, em `destinoDoSom`: a chave
  mexe no seu alto-falante, não na call inteira. Vale para os sons dos outros e para os
  seus, na hora, inclusive com um som já tocando — é ajustar ouvindo. O som é reconhecido
  pela FONTE da faixa: medido com o `livekit-client` deste projeto contra um LiveKit de
  verdade, o que é publicado como `Track.Source.Unknown` chega do outro lado como
  `unknown`, com o nome `soundboard` junto.
- **A régua ficou só para o dono da Saga (18/09/2026).** Pedido dele: "que não tenha mais
  regulagem de volume de som por enquanto, somente para mim". A chave, o ganho e a conta
  continuam iguais para todo mundo — quem não é dono ouve no que estiver guardado no próprio
  computador, 100% para quem nunca mexeu —; o que sumiu é o bloco "Soundboard" de "Sua conta".
  É uma condição só em `PainelDaConta`, e devolvê-la a todos é apagar essa linha.
- **`Number('')` é ZERO, e zero é silêncio.** O volume guardado passa por `volumeGuardado`:
  chave vazia, lixo ou nada voltam a 100%. Ler direto do `localStorage` calaria o
  soundboard inteiro por causa de uma chave vazia — sem erro nenhum, e sem ninguém ligar
  uma coisa à outra.
- **O aviso de quem chegou é da sala em que você está**, e só dela. O som avisa quem está
  de fone; o recado na tela avisa quem está com a janela noutro lugar — que é justamente
  quando você não vê a lista lateral. Sala em que você não está não vira aviso.
- **Os sons de aviso vão dentro do app.** São ~95 KB; aviso que precisa ser baixado chega
  depois do fato. O mesmo som não repete em menos de 400 ms, senão três pessoas entrando
  juntas viram ruído.
- **Os sons são FEITOS aqui, com ffmpeg, e a família é uma só:** senoides curtas com
  decaimento, entre 400 e 1400 Hz, pico a -3 dB. `/tmp` não guarda nada — quem os gera de
  novo é o mesmo caminho de sempre (`aevalsrc` com envelope, `libopus` a 96k, num `.ogg`),
  e o que separa um som bom de um estalo são duas medidas:
  - **a nota não pode ser cortada antes de o decaimento morrer.** Cortar em 10% de
    amplitude é um clique, e ele aparece no espectrograma como um risco vertical de cima a
    baixo que o `entrou.ogg` não tem. A duração de cada nota sai do decaimento dela
    (`8/decaimento`), nunca de um número escrito à mão.
  - **o ganho não é fixo: mede-se o pico e aplica-se o que falta.** A soma das parciais
    nunca chega a 1,0, então um `volume=-3.5dB` fixo entregou a primeira leva inteira 4 dB
    abaixo da família — cada som num nível diferente.
- **Som nunca é embutido no código — e os de mutar e desmutar nunca tinham tocado.** O
  Vite embute como `data:` todo arquivo abaixo de 4 KB, e três sons caíram ali: desmutar
  (3.831 bytes), mutar (3.787) e o lance do xadrez (1.501). O CSP da tela não libera
  `data:` para som, o navegador recusava, e o `catch` do aviso era `() => undefined`: os
  três nunca tocaram, em versão nenhuma, sem uma linha no registro. Medido com o CSP de
  verdade: o mesmo `.ogg` como arquivo "tocou"; como `data:`, `NotSupportedError`. E no
  app de verdade, depois do conserto, os onze tocam. O conserto não abriu o CSP: som
  deixou de ser embutido, **pelo tipo e não pelo tamanho** (`embutir.ts`, testado contra a
  pasta `sons/` inteira) — o tamanho é decidido por quem gera o som, e o próximo curto
  cairia abaixo dos 4 KB sem ninguém lembrar. E a recusa agora vai para o registro com o
  nome do som: foi o silêncio que deixou isto viver.
- **Quem começa a compartilhar ouve o próprio "live".** O som chegava aos outros pelo
  `TrackPublished`, que só fala das publicações DOS OUTROS — quem transmitia não ouvia
  nada e ficava sem confirmação de que a live começou. É o mesmo som, e sai depois de
  publicar, não no clique: tocar antes afirmaria uma live que ainda pode ser recusada.
- **Entrar é CLARO, sair é ESCURO — e vale para a live e para o microfone.** Foi o pedido
  do dono, e virou a regra do par: na live, si5 → mi6 subindo contra mi5 → si4 descendo
  (com a oitava abaixo, que é o que dá peso); no microfone, o mesmo gesto mais curto e
  6 dB mais baixo. Mais baixo porque **confirmação não é notícia**: mutar e desmutar tocam
  o dia inteiro e só respondem ao que a sua mão acabou de fazer. E o que toca sai do que o
  microfone FICOU, não do que foi pedido: falhar em adquirir o dispositivo deixaria um
  "ligou" mentindo.
- **A mensagem privada é um sino, e o convite de xadrez são duas notas.** Os dois chegam
  pelo canto da tela e precisam ser distinguíveis de ouvido, sem olhar. O **lance** do
  outro é madeira e não nota — estalo de ruído com um baque grave —, e fica 4 dB abaixo
  dos avisos porque toca a cada jogada. Ele sai da busca de salas, e não da tela do jogo:
  o som existe justamente para quem está com o tabuleiro fora da tela (`oQueTocarNaMesa`,
  puro e testado — o seu próprio lance não toca nada, e quem assiste não ouve nenhum).
- **Chamado não é aviso: o que é dirigido a você toca ALTO** (06/10/2026). Pedido do dono: "o
  som do saga deve ser bem mais, ao receber mensagem, ao ser a minha vez no catan… um som mais
  evidente". Tudo tocava a `0.45`, e mensagem e convite tinham pico a -3 e -6 dB: somavam um
  sino curto embaixo do som de um jogo — que é onde a pessoa está quando eles chegam. Agora há
  duas classes (`CHAMADOS` em `avisos.ts`, testado): **mensagem e convite** tocam a `0.9`, e o
  resto continua a `0.45`, cada um por um motivo — entrar e sair da call não são com você; mutar,
  desmutar e a live confirmam o que a sua mão fez; e o **lance do xadrez fica de fora** porque
  toca a cada jogada do outro, dezenas de vezes por partida. Os dois arquivos foram refeitos, mais
  longos e mais cheios, e continuam distinguíveis sem olhar: a **mensagem** é sino de metal (dois
  toques, lá5 → mi6, com as parciais 2,76× e 5,40× de uma barra livre, que é o "ding" e atravessa
  um jogo), 1,7 s; o **convite** são as duas notas subindo de sempre (ré5 → lá5, com a oitava e a
  quinta de cima), chamando duas vezes como telefone, 2,2 s. Pico a -1 dB nos dois. Medido (EBU
  R128, momentânea máxima): mensagem de -13,9 a -9,6 LUFS, convite de -12,2 a -8,7 — somado ao
  volume, ~10 dB acima do que eram. No Catan, **sua vez** virou quatro notas subindo (sol, si,
  ré → sol sustentado) e a **troca**, três "plim"; simulando o gráfico do WebAudio a 48 kHz, o
  pico foi de 0,21 a 0,71 e de 0,11 a 0,38. Duas coisas que a medida cobrou ao gerar:
  - **a soma das notas passa de 1,0, e o `.wav` de 16 bits a CORTA.** A primeira leva do convite
    saiu com energia a -38 dB acima de 10 kHz (o antigo: -73), e cada nota sozinha dava -90: era
    o corte no arquivo intermediário. Gerar em `pcm_f32le` e só então medir e aplicar o ganho
    resolveu (-70).
  - **o ataque é rampa de cosseno, e não reta.** Na reta, a quina no fim do ataque respingava no
    espectrograma de cima a baixo — o mesmo risco vertical do estalo de corte. O sino ataca em
    3 ms (é a batida do metal); as notas, em 12 ms.
  **A vez do Catan com a tela do jogo fechada tocava o LANCE** — a madeira baixa do xadrez —, e não
  o chamado: justo o caso em que a pessoa está noutro lugar. Agora a busca de salas toca o mesmo
  "sua vez" da tela (`tocarNoCatan('suaVez')` no `App.tsx`).
  **Não foi ouvido**: tudo foi medido (pico, loudness, espectrograma) numa máquina em que o dono
  podia estar em call. Se algum soar errado, é de ouvido que se conserta.

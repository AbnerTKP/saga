# Som e microfone

Supressão de ruído, corte automático, soundboard e os sons de aviso.

## Decisões que não são óbvias no código

- **O barulho de casa se tira em QUEM FALA, e por isso nasce ligado.** Supressão de ruído e
  sensibilidade agem no seu microfone antes de ele sair: quem ouve a casa de um amigo não
  tem ajuste nenhum que resolva, é o amigo quem precisa da versão nova. Por isso o padrão
  é Forte com "Ajustar sozinha" (`AJUSTES_PADRAO`, testado) — desligado, só funcionaria
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
- **O corte automático ouve a SUA voz, não só o ambiente — e isso veio de uma medida que
  falhou.** A primeira versão punha o corte acima do barulho da casa (mínimo dos últimos
  5 s). Pelo caminho de verdade a TV passou inteira: TV tem pausas, na pausa o "barulho"
  some, e o corte desceu a −70. Hoje o corte fica também até 14 dB abaixo da sua fala
  lembrada, que esquece 0,02 dB por segundo — números escolhidos numa varredura (a tabela
  está em `sensibilidade.ts`): TV 20 dB abaixo de você fica de fora por mais de 4 min de
  silêncio seu; 15 dB abaixo, volta em 24 s, e é o caso do ajuste à mão. TV mais alta que
  a sua voz, nenhuma régua de volume separa. Antes de você falar a primeira vez, a TV passa.
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
  desconectam —, e está em `confirmar-com-o-dono.md`. Só o microfone é lembrado; saída de som e
  câmera trocam na hora e esquecem ao fechar, como antes.
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

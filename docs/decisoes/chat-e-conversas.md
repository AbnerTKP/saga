# Chat e conversas privadas

Mensagens, anexos, "está digitando", amigos e o modo conversas (a regra do servidor está em `server/CLAUDE.md`).

## Decisões que não são óbvias no código

- **Escolher o arquivo não é mandá-lo.** Ia direto no clique, e mandar é público na hora
  — apagar depois não desfaz quem já viu. Hoje ele vira uma ficha ao lado do campo, com
  nome e peso, dá para escrever algo junto, desistir, e sai no mesmo botão de enviar de
  sempre. Arrastar para qualquer lugar da conversa também escolhe.
- **Apagar mora no botão direito da mensagem, e a confirmação MOSTRA a mensagem.** Saiu
  primeiro, na v0.44.0, como uma lixeira surgindo em cada mensagem ao passar o mouse — o
  primeiro clique armava, o segundo apagava —, e o dono recusou na hora: tinta pedindo
  clique por engano, num gesto que o app não usa em lugar nenhum. Ações moram no botão
  direito, na sala e na pessoa. Hoje o botão direito na mensagem abre um menu que diz de
  quem é e o começo do texto, com a mensagem marcada enquanto ele está aberto (na foto e no
  nome continua sendo o menu da pessoa); "Apagar mensagem" abre a caixa pequena do app com
  a mensagem desenhada dentro, porque o menu abre onde o clique caiu e numa conversa
  corrida ele pode cair na de cima. O vermelho cheio fica só ali, onde apagar É a ação da
  caixa; o foco nasce nele, então Enter apaga e Esc desiste. O desenho foi escolhido pelo
  dono entre opções renderizadas, antes do código.
- **O envio mostra o quanto já subiu, e por isso usa `XMLHttpRequest`.** O `fetch` não
  conta o que SUBIU — só o que desce. Sem a barra, mandar 20 MB era um botão apagado e
  nada acontecendo: não dava para saber se estava indo, se travou ou se deu errado.
- **A faixa do palco fica no ALTO do chat, e não é um cartão.** Lendo uma sala de texto, a
  call sumia da vista: sobrava a linha "voz em Geral" no cabeçalho, que não dizia quem
  estava lá nem quantas telas no ar, e o caminho de volta era caçar a sala na barra da
  esquerda. Hoje a faixa mostra a sala, os rostos empilhados (quatro e "+N"), quantos
  compartilham e um "Abrir palco". Barra e não cartão porque cartão diz "objeto à parte", e
  ela é a continuação do cabeçalho. **Só aparece quando a voz está NOUTRA sala** — na
  própria sala de voz o palco já está na tela, e a faixa seria uma segunda cópia do que se
  está vendo.
- **Abriu a sala de texto, o cursor já está no campo.** Clicar na sala e depois clicar no
  campo é um clique que não decide nada. A dep do efeito é o NOME da sala, nunca a lista de
  mensagens — com a lista, cada mensagem que chega roubaria o cursor de volta no meio de
  uma frase. Medido no app de verdade, numa janela escondida: clicando na sala, o
  `activeElement` vira o campo e continua nele três segundos depois, com o laço de busca
  rodando por baixo.
- **A conversa tem duas colunas, e três linhas seguidas são uma fala só.** A foto fica numa
  coluna e o que foi dito na outra, alinhado com o NOME — tudo colado à esquerda formava
  degraus e não se via onde uma pessoa parava e a outra começava. E quem manda três linhas
  seguidas mandou uma coisa só: da segunda em diante somem a foto e o nome, e a hora vai
  para a margem, aparecendo só com o mouse. A regra do que continua o quê é pura e testada
  (`agrupamento.ts`): mesma pessoa, menos de cinco minutos, e o mesmo dia — 23:59 e 00:01
  têm um separador entre elas, e a de baixo precisa do próprio cabeçalho. Sem autor não
  continua nada: é a Saga falando na sala de notas, e cada versão publicada é um recado
  inteiro.
- **"Está digitando" existe, e não precisou de empurrão nenhum.** Ficou anos na lista do
  impossível — mas o que faltava era o empurrão, não o recado. Quem lê o chat já pergunta
  de 2 em 2 segundos se chegou mensagem, e agora a resposta dessa pergunta carrega quem
  está escrevendo; o app avisa a cada 3 s enquanto alguém digita, nunca a cada tecla. Nada
  é gravado: um mapa na memória do processo (`digitando.mjs`), porque escrita no SQLite
  nesse ritmo é exatamente o que o `vista_em` ensinou a não fazer. O aviso vale 7 s — mais
  que o intervalo de quem avisa somado ao de quem pergunta, senão a frase pisca no meio de
  alguém escrevendo — e **mandar a mensagem apaga a frase na hora**, que é o pior lugar
  possível para ela sobreviver. A redação mora em `digitando.ts`, puro e testado: acima de
  três nomes vira "várias pessoas", porque nome de gente não é curto. Como tudo o que
  viaja entre app e servidor, isto tem versão dos dois lados: **app novo com servidor
  antigo não mostra ninguém digitando** — o `POST /digitando` cai em 404, o app engole, e
  a frase simplesmente não aparece. Publicar o servidor junto é o que liga a coisa.
- **Quem começa a compartilhar a tela aparece NA CONVERSA.** Lendo uma sala de texto não
  havia como saber que alguém abriu a tela na sala de voz — era preciso voltar lá e olhar.
  A linha sai da busca de salas, do SERVIDOR, e não do LiveKit desta máquina: lendo o chat
  você pode nem estar na call, e é justamente aí que não havia notícia. Ela mostra quantos
  estão assistindo — o mesmo atributo `assistindo` que os apps trocam entre si, que o
  servidor agora repassa em `/rooms` — e leva um "Entrar e assistir" que entra na voz sem
  tirar você da conversa: a live vai para o quadro flutuante que já existia. **Ela não tem
  hora e não fica no histórico**: é um acontecimento de agora, e some quando a transmissão
  acaba. Hora ali prometeria um registro que não existe.
- **O chat só te leva ao fim se você já estiver no fim.** Rolar para baixo a cada novidade
  é o certo enquanto se lê o fim; quem subiu para procurar uma coisa de ontem não pode ser
  puxado de volta porque alguém começou a digitar.
- **O modo conversas troca a COLUNA, não o servidor.** Foi a escolha do dono entre três
  desenhos renderizados com o `styles.css` de verdade: as conversas na trilha (redondo é
  pessoa, quadrado é servidor), uma seção "Conversas" acima das salas, e este — o botão no
  topo da trilha que troca a coluna inteira, como no Discord. O servidor aberto continua o
  mesmo por baixo, **a call continua tocando** (o painel dela diz de qual servidor é a
  sala), e voltar é um clique no quadrado. A lista de pessoas some junto: ela é do
  servidor, e ali não há um na tela.
- **Amigos é a primeira linha da coluna, e a única porta de uma conversa nova.** Adicionar
  é pelo APELIDO — é o que a pessoa sabe de cor e o que é global; o nome exibido é de um
  servidor e não serve para achar conta nenhuma. Do menu e do cartão de quem já está na
  sua frente, o pedido vai pelo ID, pelo mesmo motivo. As três seções (pedidos, esperando,
  amigos) existem porque são três coisas diferentes de fazer.
- **"Mandar mensagem" não é moderar: no menu da pessoa ela tem bloco próprio, e vem
  primeiro.** Falar com alguém é o que mais se faz; banir é o que menos se quer errar. No
  cartão do perfil ela é o botão cheio, e "Adicionar amigo" fica em cinza — pedir ainda não
  é falar.
- **As conversas e os pedidos vêm de carona na busca de salas**, como o xadrez e o "está
  digitando": é a busca que toda tela já faz. Elas são da CONTA e não daquele servidor —
  vão ali porque é o batimento do app, não porque pertençam a ele. Uma consequência
  honesta: **quem não está em servidor nenhum não alcança as conversas**, porque essa busca
  exige um. Para cinco amigos num servidor isso não aparece; num app sem servidor, apareceria.
  E, como tudo o que viaja entre app e servidor, isto tem versão dos dois lados: **app novo
  com servidor antigo não mostra conversa nenhuma** — o `/rooms` não manda o campo, a lista
  fica vazia e a tela de amigos não carrega. Publicar o servidor junto é o que liga a coisa.
- **O que é do SERVIDOR não entra na conversa privada — e a primeira coisa que entrou foi
  a linha da live.** Ela conta o que está acontecendo nas salas de voz do servidor aberto,
  e o chat da conversa é o mesmo componente do chat das salas: bastou passar a lista.
  Resultado, na máquina do dono, minutos depois de publicar: ele entrou num servidor novo
  pelo convite de um amigo e a conversa privada com esse amigo listou **todas as telas no
  ar de lá**, com "Entrar e assistir". Reproduzido no app de verdade (LiveKit local, uma
  tela publicada pelo `@livekit/rtc-node`): a mesma linha aparecia nos dois lugares; depois
  do conserto, aparece na sala de texto e não aparece na conversa. O quadro flutuante da
  live continua nos dois, porque aquele é o que VOCÊ escolheu assistir — a diferença é
  entre o que é seu e o que é do servidor. **A mesma família tinha um segundo caso**:
  `podeApagarMensagem` deixava quem modera o servidor apagar a fala do amigo DENTRO da
  conversa dos dois — e o servidor recusava com 403, que é o pior dos dois mundos (o botão
  aparece e não funciona). Ao pendurar uma tela nova no que já existe, a pergunta é o que
  aquilo carrega junto sem dizer.
- **Mensagem privada vira aviso no canto, e não som.** Ela é dirigida a VOCÊ, então avisa
  mesmo com a janela noutro lugar — mas a que está aberta na tela não avisa, porque você
  está lendo. Quem decide é a comparação com a ÚLTIMA mensagem que cada conversa tinha, e
  não o contador de não lidas: o contador também sobe quando o marcador anda noutra
  máquina, e daria aviso sem mensagem nenhuma por trás (`amizade.ts`, puro e testado).
- **A barra de escrever é UMA caixa**, com o anexar dentro à esquerda e o GIF e o enviar
  dentro à direita; quem acende ao receber o cursor é a caixa (`:focus-within`), não o
  campo. Eram quatro coisas soltas na mesma linha e nada dizia que formavam um lugar de
  escrever. O enviar é o único com cor preenchida: é a ação, e o resto é acessório dela.
- **O chat separa os dias** (`dias.ts`, puro e testado): "Hoje", "Ontem", ou a data por
  extenso. A hora sozinha mente — "22:08" pode ser de hoje ou de três semanas atrás, e as
  duas ficavam coladas. O fuso é o de QUEM LÊ, e não o de São Paulo como nas notas de
  versão: nota é um fato com data própria, mensagem é uma coisa que aconteceu no seu dia.
  E `agora` entra por parâmetro em vez de sair de `Date.now()` lá dentro, senão "Hoje"
  congelaria numa janela aberta desde ontem.
- **Entrar numa call não troca o que você está lendo.** É "olhar não é sair" visto do
  outro lado. Clicar numa sala fazia sempre as duas coisas — entrar na voz E trocar a
  tela —, e isso passou a estar errado no dia em que o app deixou de precisar escolher:
  dá para estar na voz de uma sala com os olhos numa conversa, com a faixa da call no
  alto e a live no quadro flutuante. Nesse mundo, trocar de call arrastava a pessoa para
  fora da conversa que ela estava lendo, no meio de uma frase. Hoje: lendo uma conversa,
  entrar numa call só entra; olhando o palco, trocar de call troca o palco; e clicar na
  sala de voz em que você JÁ está abre o palco — antes era um clique morto, porque não
  havia o que entrar. A regra é pura e testada (`navegacao.ts`), e quem quiser ir ao
  palco de propósito tem o "Abrir palco" na faixa.
- **O marcador de mensagem lida fica no computador de quem lê**, e viaja na busca de
  salas que já acontecia. Guardar no banco pediria tabela nova para um problema que
  ninguém tem. Ele só anda para a frente: uma resposta atrasada desmarcaria o que já foi
  lido. O que a própria pessoa escreveu não conta como não lido.
- **GIF no chat não é do Turbo.** O que o Turbo destrava é a imagem animada no perfil.

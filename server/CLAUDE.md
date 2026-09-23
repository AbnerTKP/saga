# Servidor

O que vale para quem mexe em `server/`: regras que não são óbvias no código. O geral
(publicar, produção, migrações) está no `CLAUDE.md` da raiz; os jogos, em `docs/decisoes/jogos.md`.

## Decisões que não são óbvias no código

- **O Berserk é da conta, e não do vínculo** — é a exceção da linha acima, e a diferença
  importa: cargo é de cada servidor, Berserk é da Saga inteira. Ele nasceu em `membros`, o
  que fazia a mesma pessoa ser Berserk num servidor e não ser no vizinho. Hoje a coluna que
  vale é `usuarios.turbo`, e quem concede é o dono da SAGA, no painel dele — não o dono de
  um servidor, que distribuiria distinção aparecendo em todos os outros. A coluna `membros.turbo`
  ficou onde estava, morta: migração publicada não se edita nem se remove.
- **Ninguém age sobre alguém de cargo igual ou superior** — é o que sustenta toda a
  moderação. A regra vive em `permissoes.mjs`, puro e testado à exaustão, e só vale para
  ações que recaem sobre alguém: criar sala não pergunta "acima de quem?".
- **Cargo novo nasce ACIMA do mais alto, não sempre no 20.** O formulário abria fixo em
  20, então criar dois cargos sem tocar no número punha os dois no mesmo nível — e nível
  igual é EMPATE: a ordem passa a ser a de criação, que ninguém vê. Aconteceu no CORNUME,
  com "BEN 10" (todas as permissões) embaixo de "Peixe Souris" (nenhuma), os dois no 20,
  só porque o outro foi criado antes. A ordem da lista é o NÍVEL, nunca o poder: cargo sem
  permissão nenhuma pode estar em cima, e é isso que confunde quando o empate é acidental.
  Empate continua permitido — quem quiser dois cargos lado a lado põe o número na mão, e o
  app não desempata cargo que alguém igualou de propósito —, e por isso o editor agora
  DIZ com quem o nível empata e o que isso significa (um não age sobre o outro). A conta
  do nível de nascença mora em `cargos.ts`, pura e testada, e respeita o teto de quem cria.
- **Mexer no padrão do cargo NOVO não move o que já existe — e a lista tem de contar o
  empate.** No CORNUME, "BEN 10" (todas as permissões) ficava embaixo de "Peixe Souris"
  (nenhuma), os dois no nível 20. Consertei o nível com que um cargo novo nasce e dei o
  caso por resolvido: os dois cargos já existiam, continuaram empatados, e o dono cobrou
  de novo — com razão. Duas lições. A primeira: **conserto que depende de a pessoa ir
  arrumar o dado à mão não é conserto**; o nível do BEN 10 foi para 21 na produção, e é
  isso que fecha a queixa. A segunda: o editor avisava do empate, mas **a lista** — que é
  o que se lê — não dizia nada, e empatados a ordem é a de criação. Hoje ela mostra
  `nível 20 · empatado`, com quem, ao parar o mouse.
- **Cargo novo nasce no topo, e o topo é dono do soundboard — o editor avisa.** As duas
  regras são boas sozinhas e se mordem juntas: o soundboard é do CARGO MAIS ALTO (não de
  quem tem `gerirSons`), e o teto sai da tabela de cargos inteira, com gente dentro ou não.
  Então criar um cargo enfeite aceitando o número sugerido tira de OUTRA pessoa o direito
  de subir e apagar sons — sem erro, sem aviso, e quem perde não é quem agiu. O servidor já
  nasce assim: o Moderador semeado é nível 50 e já vem com `gerirSons`. Não se mudou regra
  nenhuma — mudou o que a tela conta antes (`destronados`, puro e testado), pelo mesmo
  motivo do aviso de empate. Tocar som continua sendo de todo mundo; o que sai é subir e
  apagar.
- **O dono tem todas as permissões por ser dono**, não por constar numa lista: editar o
  cargo dele no banco não pode deixar o servidor sem conserto.
- **Dono da Saga e quem manda num servidor são coisas diferentes**, e confundi-las fazia
  a Saga parecer o servidor. `usuarios.dono` é quem cuida do APP: mora na conta, porque a
  conta é o que existe acima dos servidores, e é ele quem dá e tira o Berserk — que também
  é da conta. Quem manda num servidor é `servidores.criado_por`, e só isso.
- **Não existe cargo de dono.** Existiu chumbado, nível 100 e `dono = 1`, e aparecia na
  lista do CARDUME junto dos cargos que o pessoal de lá criou — como se o app tivesse
  opinião sobre a hierarquia deles. Hoje mandar vem de TER CRIADO o servidor: `comCargo`
  monta o cargo de quem criou com o **nome e a cor do cargo que ele veste**, mas com
  `dono: true` e nível 1000 — acima de qualquer coisa que se possa criar, já que o limite
  é 99. Então ele aparece na lista de pessoas dentro do cargo dele ("Lula", no CARDUME),
  continua com tudo, ninguém o alcança, e o app não impõe cargo nenhum. Sem cargo algum o
  nome vem **nulo**, nunca "Dono": escrever isso ali devolveria pela porta dos fundos o
  cargo que acabou de sair.
- **Quem criou o servidor escolhe o próprio cargo.** "Não faça em si mesmo" existe para
  impedir autopromoção, e para ele não quer dizer nada — já tem tudo. Sem essa brecha ele
  ficava preso no cargo com que entrou, sem conseguir vestir o que o pessoal de lá criou.
- **`concederTurbo` deixou de ser permissão de servidor.** Dar Berserk num servidor
  distribuiria distinção que aparece em todos os outros. Hoje é do dono da Saga, num
  painel próprio, **fora** das configurações do servidor — dentro delas pareceria uma
  distinção daquele servidor. Cargo antigo que ainda a tenha guardada perde na leitura,
  pela regra de sempre: permissão que não existe é descartada.
- **O dono da Saga é semeado do `.env` (`DONO`), e só se ainda não houver nenhum.** Semear
  sempre faria um `.env` trocado transferir o app em silêncio. E a semeadura acontece
  também no login, não só no arranque: num servidor novo o apelido do dono já está no
  `.env` mas a conta dele ainda não existe quando o processo sobe.
- **Permissão inventada é descartada**, e **ninguém dá a um cargo permissão que não tem** —
  seria contornar o próprio limite criando um cargo mais forte e vestindo-o depois.
- **A sala no LiveKit é identificada pelo id, não pelo nome.** Duas salas "Geral" em
  servidores diferentes cairiam na mesma conversa. O **app** demorou a aprender a mesma
  lição: ele guardava só o nome da sala em que a voz estava, e comparava por nome para
  saber "estou aqui?". Com dois servidores isso acende a sala errada na barra lateral e
  faz o clique na sala certa não fazer nada — "você já está aí". Hoje a voz guarda
  `SalaDaVoz`: id, nome, e de que servidor é.
- **Pedir por um servidor de que não se faz parte cai no seu próprio**, sem erro e sem
  entrada: saber o número de um servidor alheio não abre porta.
- **Quem foi banido de todos os servidores ainda entra na conta**, para ver o motivo.
- **Cadastrar não pede convite nenhum, e cadastrar não põe ninguém em servidor nenhum.**
  Havia a senha do grupo, e ela era a única porta: quem soubesse o endereço e não soubesse
  a senha não criava conta. Hoje quem souber o endereço cria — e cai numa TELA VAZIA, como
  no Discord. Antes a conta nova era despejada no servidor de casa, porque ele era o único
  que existia; com vários servidores isso passou a ser uma decisão tomada por ninguém.
  Quem abre a porta é o convite POR SERVIDOR. `api.test.mjs` trava as duas pontas — que o
  cadastro não peça convite, e que ele não entregue servidor —, para que voltar atrás em
  qualquer das duas seja uma decisão e não o efeito de alguém mexer no cadastro.
- **O servidor de casa é do dono, e a semeadura vale uma vez só.** Numa instalação NOVA o
  `.env` semeia um servidor (`SERVER_NAME`, `ROOMS`) que sobe sem dono; sem uma exceção
  ele ficaria de pé com ninguém capaz de entrar. Então o apelido do `DONO` — e só ele —
  entra nele automaticamente, e só enquanto `criado_por` estiver vazio. Todo o resto do
  mundo chega por convite.
- **Sem servidor não é erro: é a primeira tela.** `GET /eu` respondia 404 para quem não
  faz parte de nenhum, e o app lia isso como "essa sessão não vale mais" e apagava o
  crachá — quem acabava de se cadastrar era deslogado na primeira volta. Hoje ele responde
  200 dizendo quem você é, com `servidor: null`. E "quem você é" sem vínculo é a CONTA:
  foto, banner e apelido, com cargo, nome exibido e identificador nulos, porque esses três
  pertencem ao vínculo com um servidor. Pela mesma razão, o que é da conta funciona sem
  servidor nenhum — foto, banner, enquadramento, GIF de perfil, presença —, e só o nome
  exibido não aparece na tela de "Sua conta" enquanto não houver onde escrevê-lo.
- **Sair de um servidor fica fora de toda permissão.** Entrar é decisão de quem chega e de
  quem convida; sair é só de quem sai — não é moderação, e por isso não mora atrás de
  `gerirServidor`, que é o que esconderia o botão justamente de quem mais precisa dele.
  Quem CRIOU não sai (o servidor recusa com 409): ele ficaria sem ninguém capaz de
  administrá-lo e sem caminho de volta.
- **Não há freio de tentativas de senha, e a saída não é pôr de volta o que havia.** Havia
  um: 20 tentativas por IP a cada 10 minutos. Ele contava as tentativas CERTAS junto com
  as erradas e agrupava por IP — então o grupo todo atrás do mesmo roteador dividia um
  balde de 20, e bastava entrar e sair algumas vezes para trancar todo mundo. Um amigo do
  dono ficou 10 minutos de fora por errar a senha, e foi por isso que ele saiu. Um freio
  que vale a pena contaria só o que falhou, por CONTA e não por IP, e atrasaria a resposta
  em vez de fechar a porta — quem erra a senha é quase sempre quem a esqueceu.
- **Quem esqueceu a senha recupera com um código — pelo e-mail da conta, ou do DONO DA
  SAGA.** O caminho do dono nasceu primeiro, quando as contas não tinham e-mail e alguém
  precisava atestar que a pessoa é a pessoa: ele conhece o grupo e manda o código por
  fora. Continua existindo, por decisão do dono em 17/09/2026, para quem não tem e-mail ou
  perdeu o acesso a ele — ver "O e-mail da conta", logo abaixo. Os dois caminhos dão no
  MESMO código e na mesma rota (`/recuperar`, que aceita o e-mail no campo do apelido).
  O código tem 8 letras do alfabeto dos convites, vale **uma hora e uma vez**, e gerar
  outro mata o anterior (`recuperacoes`, uma linha por conta). As regras, cada uma com o
  seu motivo:
  - **Guardado com o scrypt da senha, nunca em sha256.** São 40 bits: em sha256, quem
    lesse o banco quebraria o código em minutos.
  - **5 erros matam o CÓDIGO, não a conta.** O login com senha continua sem freio (ver
    acima). O preço é que um estranho que saiba o apelido queima o código: não entra, só
    obriga a pedir outro. O servidor anota no `docker logs` quando isso acontece, junto
    de cada código emitido e de cada senha trocada por código. O código e a senha nunca
    aparecem ali — `api.test.mjs` lê o registro do servidor, stdout e stderr, e trava isso.
  - **A recusa é uma só**, 400, para apelido que não existe, conta sem código, código
    vencido, gasto ou errado: mensagens diferentes contariam quem tem código pendente.
    Não há scrypt "fantasma" para igualar o tempo de quem não tem código, porque numa VPS
    de um núcleo isso faria cada pedido de lixo custar um scrypt. O `/entrar` já tem a
    mesma propriedade.
  - **Nunca 401.** No app, 401 quer dizer "a sessão caiu" e desloga. Por isso a recusa da
    recuperação é 400, e senha atual errada ao trocar a senha em "Sua conta" é 403.
  - **Nem para a própria conta, nem para a de outro dono.** A própria, porque quem sabe a
    senha troca em "Sua conta", e o código derrubaria as sessões do dono. A de outro dono,
    porque com mais de um dono da Saga o código de um entraria na conta do outro — decisão
    do dono em 13/09/2026, ao dar a administração a mais uma pessoa. O botão some das duas,
    e o servidor recusa com 403 antes de conferir a senha (`plataforma.test.mjs`).
  - **Recuperar derruba TODAS as sessões e já entra**: quem tinha a senha antiga,
    inclusive um invasor, sai, e sai também das calls (sem esperar o LiveKit: um LiveKit
    lento prenderia a resposta com o código já gasto). Trocar logado derruba as OUTRAS
    sessões e mata o código pendente. O aviso não diz QUANTOS computadores saíram porque
    sessão não vence, e o número contaria crachás esquecidos. **Do outro lado, o 401
    esquece a conta como o "Sair"** (`esquecerAConta`, em `App.tsx`): antes só o `/sair`
    apagava sessão, e a volta ao login pelo 401 saía da call, limpava o crachá e mais
    nada — a próxima conta a entrar naquele computador receberia desenhadas, até a
    primeira busca, as salas privadas, as conversas e a partida aberta da anterior, e o
    aviso com som de cada conversa não lida dela. **O que estava aberto na tela vai
    junto**: o `App` não desmonta na tela de entrar, e o "quem pode ver" de uma sala
    privada, o cartão de alguém ou o "Convidar" (que gera convite ao montar) voltavam
    sozinhos para quem entrasse. `saidaDaConta.test.ts` lê o `App.tsx` e exige que todo
    estado novo seja esquecido ali ou diga por que fica. **Quem percebe o 401 são as duas
    buscas que rodam sozinhas**: a de salas e o sinal de vida. Só a de salas o tratava, e
    ela não roda sem servidor — na tela inicial vazia a conta derrubada ficava na tela sem
    prazo, até alguma ação responder "Faça login novamente.". Hoje o sinal de vida, que
    roda com ou sem servidor, a tira em até 30 s.
  - **Gerar pede a senha do dono, e não vale para a própria conta.** Uma sessão aberta
    não prova quem está no teclado, e um crachá roubado do dono viraria a chave de todas
    as contas. Na conta dele, o código derrubaria todas as sessões do único dono; ele
    troca a senha em "Sua conta". **Se o dono esquecer a dele, o caminho é a VPS**, pela
    mesma `trocarSenha` do app — um `UPDATE` com um hash feito à mão é a segunda cópia dos
    parâmetros do scrypt que o comentário dela proíbe, e o sintoma seria "a senha certa
    não entra":

    ```bash
    cd /root/server && docker compose -f docker-compose.ip.yml exec token \
      node --input-type=module -e "
        import { abrirBanco } from './banco.mjs';
        import { buscarPorApelido, trocarSenha } from './contas.mjs';
        const db = abrirBanco(process.env.BANCO);
        trocarSenha(db, buscarPorApelido(db, 'TKP').id, process.argv[1]);
        console.log('senha trocada');
      " 'senha-provisoria'
    ```

    Por aqui nenhuma sessão cai, e a provisória fica no histórico do shell: entre com ela
    e troque em "Sua conta", que derruba as outras sessões. O `node` da receita foi
    conferido com o Node 22 num banco de rascunho: a senha nova entra, a antiga é recusada
    e a sessão antiga continua de pé. O `docker compose exec` no contêiner de produção
    **não foi exercido**.
  - Na tela de entrar, **colar a mensagem inteira** ("Código: K7QM-2XPA") acha o código
    no meio do texto (`recuperacao.ts`, pura e testada): colar e somar letras formava um
    código completo e errado, que gastava tentativa.
- **O e-mail da conta existe para uma coisa só: recuperar a senha sem depender do dono.**
  Pedido do dono em 17/09/2026, com a trava que ele escolheu — sem e-mail confirmado não
  se entra. O que não é óbvio, cada um com o motivo:
  - **Só entra CONFIRMADO.** O endereço digitado vai para `emails_pendentes` (migração 53)
    com um código, e só vira `usuarios.email` quando o código volta certo. Gravado cru, um
    dígito trocado seria porta fechada descoberta no dia da emergência — o motivo que fez o
    e-mail ser descartado da primeira vez —, e o endereço de OUTRA pessoa viraria a chave da
    conta. Endereço só pendente não recebe código de senha nem serve de apelido.
  - **O código é o mesmo da recuperação** — 8 letras, uma hora, cinco erros, scrypt no
    banco, recusa única. Dois formatos para a mesma pessoa na mesma semana é como se ensina
    a digitar um no campo do outro; e o app já sabia formatar, colar e conferir este.
  - **O envio só liga com `RESEND_KEY` E `EMAIL_DE`**, e desligado a Saga não pede e-mail a
    ninguém (`precisaDeEmail` nunca é verdade; `/health` diz `email: false` e o cadastro
    nem mostra o campo). **Não ligue sem domínio verificado no Resend**: medido em
    17/09/2026 com a conta da Saga, sem domínio ele entrega SÓ no endereço do dono da conta
    e responde 403 ("You can only send testing emails to your own email address") para
    qualquer outro — com a trava ligada, o grupo inteiro pediria um código que nunca chega.
  - **Quem decide pedir é o servidor, e o app só pede ao ENTRAR** (login, cadastro, abrir já
    logado) — nunca ao reler a sessão. O dia em que o envio for ligado encontra gente numa
    call: lido a cada troca de servidor, o pedido trocaria o app inteiro por um cartão com
    a voz rodando atrás e sem botão, como já aconteceu com a tela de entrar.
  - **A trava cede quando o defeito é nosso.** Resend fora, modo de teste, chave recusada ou
    teto estourado chegam como 5xx/429, e o cartão oferece "entrar sem e-mail por agora" —
    o pedido volta no acesso seguinte. Erro de quem digitou (400, 409) não abre essa porta.
    Travar alguém por falha do envio é deixá-lo de fora sem nada que ele possa fazer.
  - **`/esqueci` responde `{ ok: true }` para tudo**: conta que não existe, conta sem
    e-mail, pedido repetido em menos de 2 minutos, teto estourado. A tela não diz PARA ONDE
    mandou, pela mesma razão. Freio duplo: `INTERVALO_ENTRE_CODIGOS` por conta, e
    `TETO_POR_HORA` (30) no servidor inteiro, porque sem ele varrer as 33 contas a cada dois
    minutos daria mil e-mails por hora — a cota do plano grátis e a caixa de todo mundo.
  - **Falha de envio apaga o pendente.** Um código que ninguém recebeu faria a tela pedir
    para sempre um código que não existe. No cadastro a conta já nasceu, então a resposta
    continua sendo a sessão, com `emailErro` junto — erro ali esconderia a conta criada e a
    segunda tentativa daria "esse apelido já está em uso", com o apelido sendo o da pessoa.
  - **Pedir e-mail não pede a senha atual**, ao contrário de trocar a senha: pedir não muda
    nada sozinho, e confirmar exige abrir a caixa do endereço novo. Trocar de e-mail mantém
    o antigo valendo até o novo confirmar.
  - **O registro anota a conta, nunca o endereço nem o código.** `api-email.test.mjs` lê
    stdout e stderr e trava as duas coisas, e a chave junto.
  - A recusa do código dizia "Peça outro ao dono da Saga" e passou a dizer "Peça outro.":
    ela serve aos três códigos, e duas das três pessoas pediriam no lugar errado.
- **Corpo que não é JSON é 400, não 500**, em toda rota. A mensagem do `JSON.parse` traz
  um pedaço do corpo (medido no Node 24), e o `console.error` do 500 escreveria no registro
  a senha do `/entrar` ou o código do `/recuperar`. **JSON que não é objeto também**:
  `null`, `5`, `"texto"` e `[]` passam pelo `JSON.parse`, e toda rota desestrutura o corpo
  — era 500 com a pilha no registro no `/entrar` e em quase toda rota com sessão. O
  `api.test.mjs` lê o stdout E o stderr do servidor, porque o `docker logs` junta os dois
  e o `console.error` do 500 é justamente o canal por onde um segredo vazaria.
- **Sala privada quer dizer INVISÍVEL, e quem vê é decidido por CARGO.** Uma sala que
  aparece na lista e recusa a entrada é um convite a perguntar "por que eu não entro aí?"
  — e o assunto que fez alguém criar a sala é justamente o que não se quer anunciar. Por
  isso ela some inteira para quem não pode: da barra, do `/eu`, do chat, do passe de voz e
  até do aviso de "está digitando", que de outro modo confirmaria que ela existe. **Sala
  que você não vê responde igual a sala que não existe** (404, "essa sala não existe"): um
  403 ensinaria que ela está lá. Por cargo e não por pessoa porque é assim que o resto do
  servidor pensa — cargo novo, quem muda de cargo e quem chega herdam o acesso sem ninguém
  refazer lista. **Quem criou o servidor vê todas**, e isso não é privilégio: é a saída
  para a sala que ficou sem cargo nenhum por engano, que de outro modo ninguém consertaria.
  A regra é pura e testada (`visibilidade.mjs`), e `api.test.mjs` tranca cada porta uma
  por uma — foi assim que apareceram as duas que eu tinha esquecido: a moderação, que
  precisa achar quem está numa sala privada para poder desconectá-lo, e a reordenação, que
  exigia "todas as salas" e travava a barra de quem não vê uma delas.
- **Categoria é gaveta, não dono da conversa.** Apagá-la devolve as salas para o topo em
  vez de levá-las junto; perder conversa é outra decisão, com outra pergunta. As salas sem
  gaveta vêm primeiro na lista, porque são as que ninguém guardou ainda.
- **A ordem das salas é dentro da gaveta**, não uma numeração corrida pelo servidor
  inteiro: assim mover uma sala de gaveta não obriga a renumerar a lista toda, e duas
  gavetas podem ter uma sala 0 cada.
- **`POST /salas/ordem` aceita as duas formas** — uma lista de ids (o app antes das
  categorias) e uma de `{id, categoriaId}`. App e servidor sobem separados; a forma antiga
  reordena sem tirar sala nenhuma da gaveta.
- **As salas do `.env` semeiam só o primeiro arranque.** Semeando sempre, uma sala apagada
  voltaria no reinício seguinte e ninguém ligaria uma coisa à outra.
- **Banir e dar castigo também tiram da call.** Sem isso a punição parece não funcionar.
  A remoção é consequência: se o LiveKit estiver fora, o registro vale do mesmo jeito.
- **Banir e expulsar são do SERVIDOR; a sessão é da CONTA.** Os dois derrubavam todas as
  sessões da conta, e a conta é da Saga inteira: quem era banido num servidor caía na tela
  de login e ficava fora de todos, inclusive dos que ele mesmo criou. Aconteceu com o dono
  em 11/09/2026, banido do servidor de um amigo — e a call dele NOUTRO servidor continuou
  rodando atrás da tela de login, sem botão nenhum para desligar, porque o app voltava ao
  login sem sair da call. Expulsar, de quebra, nem tirava do servidor: derrubava as sessões
  e deixava o vínculo lá, inteiro, esperando a pessoa entrar de novo. Hoje banir marca só o
  vínculo daquele servidor e tira a pessoa das calls de lá; expulsar apaga o vínculo, e a
  pessoa volta com convite, ao contrário do ban. Ninguém avisa o app: quem percebe é ele,
  porque pedir por um servidor de que você não faz mais parte devolve OUTRO — e o `/rooms`
  agora diz qual. Medido no app de verdade, em janela escondida, banido do servidor que
  estava aberto: em 0,6 s aparece "Você não faz mais parte de…", em 0,8 s a tela já é outro
  servidor, sem passar pelo login, e a sessão continua respondendo. Sessão que cai de
  verdade (401) agora sai da call antes de ir para o login — isso não foi exercido.
- **Banido não é pessoa do servidor.** Ficava na lista da direita com o nome riscado, como
  se ainda fizesse parte. Hoje some dela e da seção Pessoas das configurações, e mora numa
  seção Banidos — quem baniu, quando, e o desbanir —, que aparece para quem pode banir.
  Medido: banido por fora do app, sai da lista na volta seguinte da busca (8,6 s).
- **Nome de arquivo é o hash do conteúdo.** Dá cache eterno, deduplicação, e ninguém
  escolhe o nome — o que elimina escrita fora da pasta.
- **As imagens moram AO LADO DO BANCO** (`pastaDosArquivos`, derivada de `BANCO`), e isso
  não é arrumação: é o que impede de perdê-las. Era uma variável própria, e uma variável
  própria foi esquecida — em produção o banco foi apontado para o volume
  (`/dados/cantinho.db`) e as fotos continuaram no padrão relativo, indo parar em
  `/srv/dados/arquivos`, **dentro do contêiner**. Cada `up -d --build` levava tudo embora,
  com o banco intacto apontando para arquivos que já não existiam. Foram 6 imagens de 12.
- **Cache eterno esconde o sumiço dos arquivos, e foi metade do estrago.** Como a resposta
  vai com `immutable, max-age=31536000`, quem já tinha visto a foto continuou vendo do
  cache por um ano; só quem chegou depois viu o buraco. O sintoma chega como "os novatos
  não veem nossas fotos", que não parece perda de dados — e o dono só desconfiou porque
  dois amigos entraram. Quando o sintoma for "só os novos veem diferente", desconfie de
  arquivo que sumiu, não de permissão.
- **O arranque diz onde estão o banco e os arquivos, com a contagem.** `arquivos em
  /dados/arquivos (7)`. É barato e é o que teria gritado no primeiro deploy em vez de
  ficar seis meses calado.
- **Imagem e som são validados pela assinatura dos bytes**, nunca pelo `content-type`.
- **Arquivo no chat é guardado INERTE, e o nome da pessoa nunca vai para o disco.** Aqui
  não se reconhece tipo nenhum de propósito — é para mandar o que quiser. O que protege é
  o arquivo virar `<hash>.bin` no disco e ser servido como `application/octet-stream` com
  `content-disposition: attachment`; o nome escolhido fica na MENSAGEM, e serve só para
  mostrar e para sugerir ao salvar. Sem isso, um `.html` subiria e o servidor o serviria
  como página, com script dentro. Conferido contra a produção: `../../perigo.html` com
  `<script>` virou `9b503f….bin`, o nome virou `.._.._perigo.html`, e a resposta veio
  como anexo — com o conteúdo idêntico byte a byte.
- **Passar do tamanho é um NÃO com motivo, e um não precisa chegar.** `lerBinario` fazia
  `req.destroy()` ao estourar o limite: o servidor derrubava o socket no meio do envio, o
  app não recebia resposta nenhuma, e a tela ficava com o botão apagado e mais nada. Um
  amigo do dono perdeu um zip assim, e no registro sobrava só `Error: aborted`. Parar de
  ler é `pause()`, não `destroy()` — pausado, o socket vive e o 413 ainda sai; quem fecha
  é o `connection: close` da resposta, depois de escrita.
- **Arquivo grande vai para o disco EM FLUXO.** O caminho normal junta os pedaços num
  Buffer e só então grava — cabe para uma foto de 3 MB, não para 200. Com o contêiner
  limitado a 512 MB, um envio grande derrubaria o servidor, e falta de memória já derrubou
  a máquina inteira uma vez. Como o nome é o hash do CONTEÚDO, grava-se num temporário
  calculando o hash no caminho, e no fim ele é renomeado; conteúdo repetido descarta o
  temporário. Recusa no meio apaga o parcial, senão cada envio negado deixaria lixo.
- **Mensagem apagada fica no banco como linha VAZIA, com a hora.** Não é apego ao
  registro: o app só pergunta pelo que chegou DEPOIS da última mensagem que viu, então uma
  linha removida de verdade continuaria na tela de quem já a tinha até ele trocar de sala.
  Com `apagada_em`, a busca de sempre responde também "estas sumiram desde a sua última
  pergunta" — e esse "desde" é o `agora` do SERVIDOR na resposta anterior, anotado ANTES
  de ler, para que um apagar no meio da leitura caia na pergunta seguinte e não no vão
  entre as duas. Medido no app de verdade, numa janela escondida: some de quem apagou em
  12 ms e da tela do outro em ~2 s. O conteúdo sai de verdade — texto, imagem e anexo —;
  o arquivo no disco fica, porque o nome é o hash e outra mensagem pode apontar para ele.
  **A própria, qualquer um apaga**: desdizer não é moderar. **A dos outros** pede
  `apagarMensagens` e só alcança quem está abaixo, a regra de toda moderação. A sala de
  notas ninguém apaga: o servidor publicaria a nota de novo na volta seguinte. **O
  Moderador semeado já nasce com a permissão, mas só em servidor NOVO**: a semeadura não
  toca cargo que existe, então nos servidores de hoje quem manda marca a caixinha.
- **A conversa privada é da CONTA, e só existe entre AMIGOS.** Ela não é de servidor
  nenhum: sair do servidor onde vocês se conheceram não apaga o que foi dito, e o mesmo par
  tem UMA conversa, não uma por servidor. Por isso quem fala nela aparece como conta —
  apelido e foto —, sem cargo, sem nome exibido e sem identificador: os três pertencem ao
  vínculo com um servidor, e aqui não há um. O `SELECT` é o MESMO do chat das salas com o
  servidor nulo, e é isso que faz o nome cair no apelido sozinho.
- **A amizade é a porta, e pedir é bater nela.** Saber o apelido de alguém não abre nada:
  manda um pedido, e quem abre é o outro. É a mesma regra do convite de servidor ("saber o
  número de um servidor alheio não abre porta"), com a porta sendo a pessoa e não o lugar.
  **Quem pediu não aceita o próprio pedido** — senão bastava pedir e aceitar sozinho, que é
  exatamente o que a amizade fecha. **Pedidos cruzados viram amizade na hora**: dois
  pedidos esperando um ao outro nunca se resolveriam.
- **A amizade é uma linha por PAR, com os ids ordenados** (`a` é sempre o menor), e quem
  pediu fica numa COLUNA. Guardando uma linha por direção, A→B e B→A podiam existir ao
  mesmo tempo: duas verdades sobre o mesmo par. Recusar e desfazer APAGAM a linha — quem
  recusou hoje pode aceitar amanhã, e uma tabela que só cresce guardaria cada não para
  sempre sem ninguém nunca ler.
- **A amizade é perguntada a CADA mensagem, não só ao abrir a conversa.** É o que o dono
  pediu: mensagem só entre amigos. Desfazer a amizade com a janela aberta fecha o campo de
  escrever na volta seguinte da busca, **sem apagar a conversa** — o que foi dito continua
  lá, e destruir o registro dos dois por decisão de um seria outra coisa. No app,
  `podeEscrever` nem é guardado com a conversa: sai de quem é seu amigo AGORA.
- **Numa conversa privada não há moderação: cada um apaga o que DISSE.** Não existe cargo
  entre duas pessoas, e "quem está acima" — que sustenta toda a moderação do resto do app
  — não quer dizer nada ali. Nem o dono do servidor apaga o que o outro disse.
- **Uma mensagem é de uma SALA ou de uma CONVERSA, e é o banco que garante isso.** Duas
  tabelas de mensagem seriam escrever duas vezes tudo o que uma mensagem sabe fazer —
  anexo, GIF, apagar com hora, contagem de não lidas —, e a segunda envelheceria em
  silêncio, que foi o que o SQL espalhado por treze arquivos ensinou. Então `mensagens`
  ganhou `conversa_id`, `sala_id` passou a aceitar nulo e um `CHECK` recusa a linha sem
  dono e a linha com dois donos. Relaxar um NOT NULL no SQLite é RECONSTRUIR a tabela:
  medido antes de escrever, com dados dentro — 4 mensagens (com anexo, apagada e sem
  autor) entram e saem idênticas campo a campo, `foreign_key_check` vazio, índices
  refeitos, cascata intacta, as duas buscas usando índice. `banco.test.mjs` roda essa
  migração contra dados de novo a cada `pnpm test`.
- **O identificador é do DONO DA SAGA, e de mais ninguém.** A intenção é que ele apareça
  junto do nome em TODO servidor: definir o de alguém é mexer em como a pessoa é vista na
  Saga inteira, e isso não cabe ao cargo mais alto de UM servidor — nem a quem criou aquele
  servidor. Mesma regra do Berserk e pelo mesmo motivo: quem concede tem de estar no plano
  do que concede. `definirId` continua existindo como permissão de servidor e continua sendo
  o dono de lá quem a desenha; ela é que não alcança isto. **Mas o dado não acompanhou a
  regra:** ele mora em `membros.id_exibido`, por vínculo, e `definirIdExibido` grava só no
  servidor do pedido. Medido na produção em 11/09/2026: o dono tem "TKP" no CORNUME e nada
  no "teste". Mover para a conta pede migração nova e é decisão do dono — até lá, "em todo
  servidor" é o que se quis, não o que acontece.
- **O soundboard é do cargo mais alto do servidor, e não de quem só tem a permissão.**
  `gerirSons` continua existindo e continua sendo do dono do servidor desenhar, mas ela
  só vale de fato no topo. Som é diferente de sala ou de castigo: toca para a call
  inteira e quem não gostou não tem como desfazer. A regra é do APP, em `permissoes.mjs`,
  justamente para não precisar mexer nos cargos que o pessoal criou. Quem criou o
  servidor está sempre acima de todos, e empate no topo vale para os dois — não cabe ao
  app desempatar cargos que alguém pôs no mesmo nível de propósito.
- **A busca de salas pedia a lista do LiveKit UMA VEZ POR SALA.** `participantesDaSala`
  chamava `listRooms()` — a lista inteira — para cada sala, dentro de um `for` com
  `await`. Com 6 salas de voz, seis idas ao LiveKit em fila por pesquisa, e cada pessoa
  pesquisa de 4 em 4 segundos. Numa VPS de **um núcleo**, isso comia um terço dele.
  Medido, antes e depois de pedir a lista uma vez só e lembrá-la por 1 s:

  | | antes | depois |
  |---|---|---|
  | chamadas ao LiveKit em 6 s | 74 | **12** |
  | `/health` (rota que não faz nada) mediana | 77 ms | **57 ms** |
  | `/health` p90 | 433 ms | **86 ms** |
  | `/health` máx | 857 ms | **149 ms** |

  Comparar `/health` com o ICMP é o que separa rede de aplicação: 29 ms de ICMP contra
  77 ms numa rota vazia quer dizer que o problema não é a rede — é o event loop. A VPS
  fica em Campinas e o ping é de 29 ms com 0% de perda; a rede nunca foi o problema.
- **A contagem de gente do `listRooms` atrasa segundos — não decida nada por ela.** Quem
  entra numa sala vazia está no `listParticipants` em ~1 s e o `numParticipants` fica em 0
  até ~6 s (medido em 23/09/2026). O servidor pulava as salas com 0, e quem acabava de
  entrar sumia da barra dos outros, não era achado pelo bot e escapava do "tirar de todas
  as calls". Hoje vale a sala EXISTIR (`nomesDasSalasVivas`); `api-livekit.test.mjs` trava
  isso contra um LiveKit de mentira. Só a administração ainda soma a contagem
  (`emCallPorSalaDe`), porque ali é um número e alguns segundos não mudam nada.
- **Um segundo de memória vale mais que qualquer micro-otimização aqui.** Oito pessoas
  pesquisando de 4 em 4 segundos pedem a MESMA lista. `lembrado()` guarda por 1 s e ainda
  junta as buscas simultâneas numa só (`indo`), senão duas chegando juntas disparariam
  duas. Quando somos NÓS que mudamos a sala — expulsar, tirar da call —, a memória é
  esquecida na hora: expulsar que parece não funcionar é pior que expulsar devagar.
- **`vista_em` era escrito a cada pedido, e nunca lido.** O app faz um pedido a cada 4 s
  por pessoa, e cada um virava uma transação de escrita no SQLite com fsync. Medido: o
  servidor de token escrevia **3,5 MB/s** e a máquina passava **37–47% do tempo esperando
  disco**. Passou a ser anotado no máximo uma vez por minuto, por sessão — e o
  `synchronous` foi de `FULL` para `NORMAL`, que é a recomendação da própria SQLite em
  WAL. Depois: **0 blocos escritos por segundo, 0% de iowait.** O risco de `NORMAL` é
  perder as últimas transações numa queda de energia, nunca o banco corrompido.
- **O `keepAliveTimeout` do Node é 5 s e o app pesquisa a cada 4.** Um segundo de margem,
  e o registro do dono tem centenas de `→ 0` — a conexão morrendo na mão do cliente.
  Passou para 60 s (com `headersTimeout` acima disso, senão ele é quem fecha). Medir não
  reproduziu a corrida com o agente do Node, que repete pedido idempotente sozinho; o
  `fetch` do renderer não repete.
- **Quem diz o tipo do aviso é o servidor**, não o app adivinhando pelo texto. "Isso é do
  Berserk" é convite, não falha, e pintá-lo de vermelho faz a pessoa achar que
  quebrou alguma coisa. Erro fica na tela até fecharem; o resto some sozinho.
- **Os relatos são da SAGA e esperam o painel do dono.** Tabela `relatos`, com `estado`
  (novo, aceito, recusado, feito) e `decidido_por`/`decidido_em` já criados, para o painel não
  precisar de migração no dia em que existir. Hoje só se escreve: ninguém lê pelo app, e nenhum
  amigo vê o relato de outro. **Relatar não exige conta** — o erro que impede de entrar é o que
  mais precisa chegar —, e o teto é de 10 por hora por conta e de 30 por hora para TODOS os sem
  conta somados. Não é por IP: o freio por IP já trancou o grupo inteiro atrás do mesmo roteador.
  O registro de erros vai só no erro, marcado por padrão, cortado aos últimos 60 mil
  caracteres — o `lerCorpo` derruba pedido acima de 100 mil.

## Presença

- **Status guardado sem sinal recente é lembrança, não presença.** Quem fechou o app no
  "ocupado" continuaria ocupado para sempre. Por isso `visto_em`: sem sinal há mais de
  90 s (o app bate a cada 30), a pessoa está **offline**, seja qual for o status escrito.
  A regra é pura e testada (`presenca.mjs`), e sair do app apaga o sinal na hora.
- **Quem decide "ausente" é o app de quem está ausente**, não o servidor: só ele sabe se a
  pessoa largou a máquina. E só o processo PRINCIPAL sabe disso — dentro da janela não se
  vê teclado nem mouse fora do app, então a página acharia que você está ali enquanto você
  foi almoçar. Vem de `powerMonitor.getSystemIdleTime()`, e com a tela bloqueada o sistema
  já conta como ociosidade.
- **"Ocupado" não vira ausente sozinho.** É recado para os outros, não medição: quem se
  pôs ocupado continua ocupado mesmo saindo de perto. Já "online" vira ausente sozinho —
  um padrão que mente sobre você estar ali não serve para ninguém.

## Administração da Saga

- **A administração mostra como os servidores estão MONTADOS, nunca a conversa.** Decisão do
  dono em 11/09/2026: o dono da Saga vê todos os servidores, inclusive os de que não faz
  parte — pessoas, cargos, salas (as privadas também, com cadeado e quem vê), quem está em
  call e QUANTAS mensagens —, mas texto, imagem e anexo não saem das rotas, e o código de
  convite também não: código é chave de porta, e ver não é entrar. A conversa privada entre
  amigos não é de servidor nenhum e fica fora de toda conta. `plataforma.test.mjs` tranca as
  três — o texto, o código e a conversa privada —, e `api.test.mjs` tranca o texto e o código
  na rota do detalhe, procurando os dois no JSON inteiro; imagem e anexo não saem porque as
  leituras da administração nem pedem essas colunas. A
  conta do servidor ignora a sala de notas — senão uma nota de versão faria o servidor de
  casa parecer ativo —, e os números da lista e do detalhe saem de uma função só
  (`resumoDoServidor`). Hoje é só ver; a tela é de linhas e seções para os botões de
  gerenciar caberem depois sem refazê-la.
- **O nome da sala no LiveKit mora em `participantes.mjs`, onde tem teste.** A administração
  soma quem está em call pelo caminho de volta (`sala-12` → 12), e a ida (`salaNoLiveKit`)
  morava em `index.mjs`, que sobe o servidor ao ser importado — ali nenhuma das duas teria
  teste. Como o api.test aponta o LiveKit para uma porta morta, uma volta que devolvesse
  sempre null deixaria "Em call" em 0 em todo servidor com a suíte inteira verde: medido
  numa cópia, com as duas ainda em `index.mjs`.
- **A sala de notas é do APP, não do servidor.** Ela é a primeira da lista, não se
  renomeia, não se apaga e não sai do lugar — o dono do servidor manda em tudo lá dentro,
  menos nisto, porque o conteúdo dela não vem de ninguém de lá. Marcada por
  `salas.papel = 'notas'`, e não pelo nome: renomear à mão no banco não faz nascer uma
  segunda. Reordenar simplesmente a ignora, sem erro — arrastar a lista não pode falhar
  só porque ela estava no caminho.
- **A nota da versão nova cai na sala em até dez minutos, não em até uma hora.** O
  servidor sobe ANTES de o Release existir — essa ordem é a certa, senão o app novo chega
  antes do servidor que o atende —, e a busca de notas acontece no arranque, quando ainda
  não há release nenhum. Resultado: a nota da v0.41.0 não apareceu, e o dono teve de
  cobrar. Dez minutos são seis idas ao GitHub por hora, contra uma cota de sessenta.
- **É o servidor que vai buscar as notas, não o CI que empurra.** Ele lê os Releases do
  GitHub no arranque e de hora em hora, e publica o que faltar. Empurrar do CI pediria um
  segredo e daria um jeito novo de a coisa parar em silêncio; puxar não precisa de nada e
  se conserta sozinho na volta seguinte. O que já foi publicado se sabe pela ETIQUETA no
  início do texto — sem coluna nova para o que uma busca resolve.
- **A hora da mensagem é a do lançamento, não a da cópia.** As 53 versões antigas foram
  copiadas de uma vez; com `Date.now()` apareceriam todas como sendo de hoje, e o chat
  perderia justamente o que ele conta. E a data é sempre a de **São Paulo**: o contêiner
  roda em UTC e o pessoal está no Brasil — uma versão publicada às 21h daqui cairia no
  dia seguinte para quem lê.

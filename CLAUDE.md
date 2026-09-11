# Saga

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
- **Commit semântico, e a nota do amigo à parte.** O assunto é do repositório
  (`feat(chat): …`, `fix(servidor): …`); o que os amigos leem na versão sai da linha
  `Nota:` no corpo do commit — ver "As notas de versão", mais abaixo. Commit sem `Nota:`
  é trabalho de dentro e não vira notícia.
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
| Repositório | `AbnerTKP/saga`, link fixo `/releases/latest` |
| Dono | apelido `TKP` |
| Chave do Giphy | `GIPHY_KEY` no `.env` da VPS; vazio desliga a busca sem quebrar nada |
| Senha do grupo | **não existe mais** — `APP_PASSWORD` ficou no `.env` sem uso |

**Publicar servidor: `cd server && ./publicar.sh`** — nunca o `scp` na mão. Cada trava
lá dentro é um erro que já aconteceu, e o comentário ao lado diz qual: teste falhando,
arquivo de configuração indo junto, VPS sem swap ou sem memória, chave do LiveKit que
não bate com a do `.env`, contêiner em loop depois de subir. `./publicar.sh --so-conferir`
confere e não manda nada. **"Ter cuidado" não sobrevive a um dia corrido; uma conferência
que roda, sim.** A primeira versão da conferência do LiveKit subia o servidor de verdade
para ver se ele reclamava — e travava justamente quando a configuração estava BOA, porque
aí o processo não termina. Verificação que trava é pior que verificação nenhuma; hoje ela
é estática.

**Nunca mande `livekit.yaml` daqui.** O de produção tem a chave de verdade e mora só na
VPS; o do repositório é modelo e chama-se `livekit.exemplo.yaml` justamente porque um
`scp` já sobrescreveu a produção com o placeholder. O LiveKit continuou de pé com a
configuração antiga na memória e só recusou a chave HORAS depois, no primeiro reinício —
quando ninguém ligava mais uma coisa à outra. Depois, confira a linha
`arquivos em /dados/arquivos (N)` no `docker logs`: se o N zerar, alguma coisa saiu do
volume outra vez.

## A vez que a VPS travou inteira

Em 7 de setembro de 2026 a máquina parou por ~25 minutos: respondia **ping** (0% de perda,
19 ms) e nenhuma porta TCP atendia — o SSH conectava e o `sshd` nunca mandava o banner.
Kernel de pé, userspace sufocado.

O que ficou escrito, e é a única pista que sobrou:

```
17:52:16 systemd-journald: Under memory pressure, flushing caches.
17:53:30 systemd-journald: Under memory pressure, flushing caches.
17:54:37 systemd-journald: Under memory pressure, flushing caches.   ← última linha
```

**Não houve OOM kill** e o disco tinha 46 GB livres. A máquina tem **um núcleo** e **não
tinha swap nenhum**: sem swap o kernel não tem para onde despejar e fica reciclando cache
até nada mais conseguir rodar — nem o `sshd`, que é como se perde o acesso. Quem consumiu
a memória **não foi identificado**: o registro do arranque anterior não guardou nada além
disso, e o processo já não existia. Fica em aberto, e é honesto dizer que várias mudanças
minhas foram para produção naquele dia.

O que se fez, que vale independente da causa:
- **2 GB de swap** (`/swapfile`, no `fstab`, `vm.swappiness=10`). Sem ele, qualquer pico
  vira máquina inacessível em vez de máquina lenta.
- **Teto de memória por contêiner** (`mem_limit`): quem estourar morre sozinho e volta
  pelo `restart`, em vez de levar o resto junto.

E a lição que interessa: **numa máquina de um núcleo sem swap, "sem memória" não vira
erro — vira uma máquina que responde ping e mais nada.** Não há log a consultar depois,
porque escrever log também precisa de memória.

## Como está montado

**Servidor** — Node puro, sem framework, em três camadas:

```
index.mjs        tabela de rotas: lê o corpo, chama, responde. Não sabe SQL.
*.mjs            a REGRA: permissoes, cargos, membros, salas, mensagens, sons,
                 servidores, contas, notas, presenca, plataforma. Não sabem de HTTP.
repositorios/    o SQL, um arquivo por TABELA. Não sabem de regra.
banco.mjs        esquema e migrações — o único fora de repositorios/ que escreve SQL.
```

O SQL vivia espalhado por treze arquivos, inclusive dentro da tabela de rotas. Isso fazia
a mesma consulta nascer duas vezes em lugares diferentes (o mesmo defeito que o cartão de
perfil teve no app), misturava "quem pode" com `UPDATE` no mesmo parágrafo, e faria de uma
troca por ORM uma reescrita do servidor inteiro — hoje é reescrever uma pasta, sem quem
chama ficar sabendo. **`arquitetura.test.mjs` falha se o SQL vazar**: regra escrita num
LEIA-ME dura até o primeiro dia corrido, regra que quebra o `pnpm test` dura.

**App** — Electron + React. `useRoom.ts` cuida do LiveKit; `useChat.ts` do chat; a lógica
que dá para testar sem tela fica em módulos puros: `permissoes` do lado do servidor tem
paralelo em `api.ts` (`pode`, `podeSobre`), e `qualidades.ts`, `volume.ts`, `sinal.ts`,
`erros.ts` e `audivel.ts` são pequenos e testados.

**Identidade** — a conta (apelido + senha), o **Berserk** e o **dono da Saga** são globais;
cargo, banimento, castigo, nome exibido e identificador pertencem ao vínculo pessoa↔servidor.

## Decisões que não são óbvias no código

- **Migrações são registradas pela posição na lista.** Nunca editar, remover ou inserir no
  meio — só acrescentar no fim. Inserir no meio já derrubou a produção; `banco.test.mjs`
  trava a ordem por impressão digital.
- **O `Dockerfile` leva TUDO e o `.dockerignore` diz o que fica; `*.mjs` não pega
  subpasta.** Listar arquivo por arquivo já derrubou o servidor duas vezes; o glob
  consertou aquilo e derrubou uma TERCEIRA, do jeito novo: nasceu a pasta `repositorios/`,
  os 257 testes passaram aqui, o `scp` mandou 37 arquivos, o md5 dos dois lados bateu — e
  o contêiner subiu sem a pasta, em loop de `ERR_MODULE_NOT_FOUND`, com a produção fora do
  ar por sete minutos. Tudo conferia porque tudo conferia a MESMA lista incompleta:
  `*.mjs` no `Dockerfile`, `*.mjs` no `publicar.sh`, `*.mjs` na conferência. Hoje o
  `Dockerfile` é `COPY . ./` com `.dockerignore`, e a conferência do `publicar.sh` compara
  `find` de verdade, arquivo a arquivo, dentro das pastas. **A lição é a inversão:**
  enquanto o padrão for "levar o que está na lista", a lista vai esquecer o que nasceu
  depois — e vai esquecer em silêncio, porque quem escreve a lista é quem esqueceu.
  Levando tudo, o que fica de fora está escrito num lugar só e é visível.
- **Uma conferência que compara duas coisas montadas de jeitos diferentes não confere
  nada.** A primeira versão do "chegou o que saiu" usava `md5 -q` aqui e `md5sum` lá, cada
  um com o seu formato: a comparação nunca dava igual. Ela recusou uma transferência boa
  com a produção fora do ar — verificação errada custa duas vezes, uma por não pegar o que
  devia e outra por barrar o que estava certo. As duas listas se montam agora do mesmo
  jeito, `"md5 caminho"`, nos dois lados. **O `test` do app tinha o mesmo defeito** e por isso
  também virou glob: ele listava os treze arquivos à mão, então um teste novo simplesmente
  não rodava — e não rodar não dá erro nenhum. Ficaram cinco testes escritos, verdes na
  minha mão e ausentes do `pnpm test` e do CI. **O do servidor tinha o mesmo defeito**, e
  caiu na mesma armadilha semanas depois, com `notas.test.mjs`. Lista à mão de arquivo só
  falha em silêncio — os dois são glob agora.
- **Cargo, banimento e nome exibido pertencem ao vínculo pessoa↔servidor**, não à pessoa.
  A conta é global. É o que permitirá vários servidores sem migrar dados.
- **O Berserk é da conta, e não do vínculo** — é a exceção da linha acima, e a diferença
  importa: cargo é de cada servidor, Berserk é da Saga inteira. Ele nasceu em `membros`, o
  que fazia a mesma pessoa ser Berserk num servidor e não ser no vizinho. Hoje a coluna que
  vale é `usuarios.turbo`, e quem concede é o dono da SAGA, no painel dele — não o dono de
  um servidor, que distribuiria distinção aparecendo em todos os outros. A coluna `membros.turbo`
  ficou onde estava, morta: migração publicada não se edita nem se remove.
- **Três nomes ficaram "turbo" de propósito**: a coluna do banco, o campo `turbo` que anda
  entre app e servidor, e o `tipo: 'turbo'` do aviso. São protocolo e dado, não texto de
  tela — e app e servidor sobem separados, então renomear o que viaja entre eles faria a
  versão velha de um não entender a nova do outro. Um aviso de tipo desconhecido cairia em
  vermelho, que é justamente o que "isso é do Berserk" não pode parecer.
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
- **Trocar de servidor não desliga a voz.** Desligava, com som de saída e tudo, como se
  você tivesse encerrado a call — e às vezes a pessoa só quer espiar o que está
  acontecendo do outro lado. Olhar não é sair. Tecnicamente nunca foi preciso: a sala do
  LiveKit é o id, então falar no "Geral" de um servidor enquanto se lê outro sempre
  coube. Por isso o mapa de quem-é-quem **acumula** em vez de refletir só o servidor
  aberto: quem está na sua call não vem no `/rooms` do servidor que você está olhando, e
  sem guardar os rostos da conversa virariam iniciais no meio dela.
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
- **Botão direito EM CIMA de uma sala é sobre AQUELA sala.** O clique subia para a lista e
  abria o menu dela — o de CRIAR sala: apontar para uma coisa e receber as opções de outra.
  Hoje o menu da sala traz renomear, "quem pode ver" e apagar; o da lista continua sendo
  o de criar, e o da categoria, o dela. A sala de notas é da Saga e por isso ali só se lê.
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
- **O app se chamava "Cantinho do Vorcaro" e o Turbo, "Vorcaro Turbo".** Hoje são **Saga**
  (o sentido nórdico da palavra: a narrativa, e a deusa Sága) e **Berserk**. Em português
  "saga" é feminino, e é assim que a interface fala: *a* Saga. Três coisas **não** foram
  renomeadas junto, e cada uma por um motivo:
  - **As chaves do `localStorage` (`cantinho.sessao`, `cantinho.qualidade`, …)** — renomear
    desloga todo mundo e zera qualidade, marcador de lidas e último apelido de uma vez, sem
    ninguém entender por quê. Prefixo antigo é dívida barata; conta perdida, não.
  - **O `appId` `br.com.vorcaro.cantinho`** — é o identificador de pacote no macOS, e é
    por ele que o TCC guarda a permissão de tela. Trocar faria todo mundo conceder de novo,
    justamente o que o certificado próprio existe para evitar. Ninguém vê esse texto.
  - **O `MAC_CERT_NOME` no CI** — é o nome dentro do `.p12` que está no secret, não o nome
    do app. Trocar sem gerar certificado novo faz o `codesign` não achar a identidade e cair
    no ad-hoc.
- **Trocar o nome do app muda a pasta de dados do Electron**, que leva o nome dele. Sem
  fazer nada, a versão nova nasceria sem sessão, sem ajustes e sem marcador de lidas — e
  pareceria que ela apagou as contas. Por isso `herdarDoNomeAntigo` copia
  `Local Storage`, `Session Storage`, `Preferences` e `registro` da pasta antiga na
  primeira abertura, e só nela. O cache fica para trás de propósito: são 68 MB que se
  refazem sozinhos.
- **1080p e 60 quadros são do Berserk**, e a régua (`qualidades.ts`) vale tanto na
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
- **Abrir junto com o Windows nasce ligado, e é uma chave que a pessoa desliga.** O app
  existe para você estar lá, então o padrão é abrir; quem não quiser desliga em "Sua
  conta". Mas ligar sozinho acontece UMA vez, na primeira abertura do app instalado no
  Windows, e fica anotado em `inicio-automatico.txt` na pasta de dados — sem essa
  anotação, quem desligasse veria a Saga voltar sozinha na abertura seguinte, e ajuste que
  não obedece é pior que ajuste nenhum. **Só se liga o que se consegue anotar**: a
  anotação vem antes de mexer no arranque. No Mac a chave existe e começa DESLIGADA: não
  foi o que se pediu, e o caminho de lá (SMAppService, com o app auto-assinado) não foi
  exercido. A regra mora em `inicio.ts`, sem `electron` dentro, e é testada; quem fala com
  o registro do Windows é o `index.ts`.
- **A chave "abrir junto com o sistema" mostra o que o SISTEMA respondeu**, não o que foi
  clicado: escreve, lê de volta, e é a leitura que vai para a tela — recusando, a chave
  volta sozinha em vez de mentir. A leitura no Windows COMPARA: `openAtLogin` só volta
  verdadeiro se os `args` da pergunta forem os mesmos que foram gravados, por isso a
  pergunta carrega o `--ao-iniciar` junto. E quem responde de verdade é
  `executableWillLaunchAtLogin`, que conta também a entrada desligada à mão no Gerenciador
  de Tarefas: é a diferença entre "está escrito" e "vai abrir".
- **A entrada continua no registro depois de desinstalar, e mexer nisso é pior.** O
  desinstalador do `nsis` não sabe dela, e apagá-la de lá parece trivial — só que com
  `oneClick` cada ATUALIZAÇÃO passa pelo desinstalador: um macro sem cuidado tiraria a
  abertura automática de todo mundo na primeira versão nova, calado.
- **Aberta pelo arranque, a janela vem encolhida.** Quem ligou o computador ia fazer outra
  coisa — a Saga só precisa estar online. Encolhida, e não invisível: sem ícone ao lado do
  relógio, app escondido é app que não se acha de volta. Quem separa "o sistema me abriu"
  de "alguém me abriu" é o `--ao-iniciar` que a entrada de arranque carrega; no Mac não há
  argumento nenhum e quem responde é `wasOpenedAtLogin`. Medido no processo principal de
  verdade, com `show`, `showInactive` e `minimize` interceptados para nada aparecer na
  tela: sem o argumento, `show()`; com ele, `showInactive()` + `minimize()`.
- **Uma Saga por computador.** Abrindo junto com o sistema, "o app já está aberto quando eu
  clico no ícone" vira o caso NORMAL — e sem trava o clique abria uma SEGUNDA Saga: duas
  conexões, dois sinais de presença, dois avisos de quem chegou e a pessoa duas vezes na
  lista. Hoje quem não pega a trava sai na hora, e quem a tem traz a janela para a frente.
  Medido com o Electron do projeto: a segunda instância recebe `false` e sai; a primeira
  recebe o `second-instance` com os argumentos dela e chama `show()` + `focus()`.
- **`volume` de elemento de áudio só aceita de 0 a 1.** Passar disso lança exceção, e
  dentro de um efeito do React isso derruba a tela inteira. Tudo passa por `volume.ts`.
- **A call que CAIU volta sozinha; a que foi TIRADA, não.** O LiveKit avisa a saída da
  sala com um evento só, aconteça o que acontecer — internet piscou, servidor reiniciou,
  você desligou, ou um moderador te desconectou. Tratar tudo como queda faz o app pôr a
  pessoa de volta segundos depois de alguém a tirar: a moderação desfeita sozinha, e
  parecendo defeito dos dois lados. Quem separa é o MOTIVO que vem no evento, e a lista
  mora em `queda.ts`, pura e testada — voltam `CONEXAO_FECHOU`, `SERVIDOR_REINICIOU`,
  `ESTADO_DIVERGENTE`, `MUDANCA_DE_SERVIDOR` e motivo nenhum; ficam de fora `ME_TIRARAM`,
  `EU_DESLIGUEI`, `ENTREI_NOUTRO_LUGAR`, sala apagada ou fechada e `NAO_CONSEGUI_ENTRAR`.
  Medido no app de verdade contra um LiveKit local: tirando a pessoa pelo `removeParticipant`,
  ela continua fora nove segundos depois. E a volta é **com o microfone como estava** —
  reaparecer falando para quem tinha se mutado seria pior que não voltar.
- **Efeito de reconexão não pode depender do que muda a cada busca.** O efeito que traz
  a call de volta dependia de `rooms` e de `entrarNaVoz` — e as duas nascem de novo a cada
  busca de salas, de 4 em 4 segundos. O efeito era refeito junto e disparava uma tentativa
  nova por cima da anterior, cada uma derrubando a que estava no meio da conexão. Medido
  com o LiveKit local: o app ficava em "Conectando…" de 50 s a 100 s e terminava fora da
  call, com o servidor de voz já de pé. Hoje ele depende só de `caiuDaCall` (a sala de que
  se caiu vem dentro dele, então nem se procura na lista) e uma trava impede empilhar
  tentativas — entrar tem tempo limite de dezenas de segundos, e bater de novo antes disso
  garante que nenhuma termine.
- **Efeito que grava no que ele mesmo lê refaz a si mesmo — e não dá erro nenhum.** A busca
  de `/servidor` dependia da sessão INTEIRA e, lá dentro, gravava na sessão a lista de
  servidores: cada resposta refazia o efeito, que pedia de novo na hora. O "de 10 em 10 s"
  do comentário nunca aconteceu, da v0.16.0 à v0.42.0. Medido no app de verdade, parado,
  contra um servidor local: **4.204 pedidos de `/servidor` em 10 s**, contra 2 de `/rooms`.
  Na produção, na mesma manhã, com três apps abertos, o servidor de token estava em 43% do
  único núcleo e o LiveKit em 1,6% — quanto disso era o laço só se sabe depois que todos
  atualizarem. Não aparece em registro nenhum: o app funciona, só que pedindo sem parar e
  redesenhando a tela a cada resposta. Hoje a dependência é o NÚMERO do servidor, e quem
  muda algo daqui — cargo pelo menu, foto e nome, painel do servidor — chama
  `recarregarServidor`, que era a parte boa que o laço fazia por acidente.
- **Queda curta o LiveKit resolve sozinho; a longa é que precisava de conserto.** Medido:
  matando o servidor de voz, o app passa a "Reconectando…" e o próprio cliente refaz a
  conexão se ela voltar em ~40 s. Passado isso ele DESISTE, e era aí que a call morria de
  vez e ninguém voltava. É essa a queda que o app agora cobre.
- **Banir e dar castigo também tiram da call.** Sem isso a punição parece não funcionar.
  A remoção é consequência: se o LiveKit estiver fora, o registro vale do mesmo jeito.
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
- **Foto que não carrega volta a ser a inicial** (`Avatar`, `CartaoDoPerfil`). Sem isso
  sobra um buraco transparente, porque `.avatar.com-foto` tira o fundo: quem chegou depois
  do sumiço não via nem foto nem letra. Guarda-se a URL que falhou, não um sim/não, para
  que trocar de foto tente de novo sozinho.
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
- **Escolher o arquivo não é mandá-lo.** Ia direto no clique, e engano não tem volta — não
  há como apagar mensagem. Hoje ele vira uma ficha ao lado do campo, com nome e peso, dá
  para escrever algo junto, desistir, e sai no mesmo botão de enviar de sempre. Arrastar
  para qualquer lugar da conversa também escolhe.
- **O envio mostra o quanto já subiu, e por isso usa `XMLHttpRequest`.** O `fetch` não
  conta o que SUBIU — só o que desce. Sem a barra, mandar 20 MB era um botão apagado e
  nada acontecendo: não dava para saber se estava indo, se travou ou se deu errado.
- **Salvar o anexo acontece no processo PRINCIPAL, com o diálogo do sistema.** Dentro da
  tela não há para onde escrever, e a alternativa seria abrir no navegador — que é
  exatamente o que não se quer com arquivo que veio de fora. Nada é aberto nem executado:
  a pessoa escolhe onde põe.
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
  regra larga para "todo label do formulário" precisa deixar a exceção escrita junto.
- **Contêiner de canto não recebe clique — só os cartões dentro dele.** A pilha de avisos
  é larga e quase toda vazia, e fica por cima do quadro flutuante da live: sem
  `pointer-events: none` no contêiner e `auto` nos cartões, o vão entre um aviso e outro
  come o clique do que está por baixo. Vale para qualquer coisa que se ancore num canto.
- **O CSP precisa de `http:`/`https:` em `img-src` e `media-src`**: a página vem de
  `file://`, então `'self'` não cobre o servidor.
- **Quem está transmitindo fica sempre à vista, mesmo o que você não está vendo.** É a
  diferença entre esconder e sumir: uma live que você cortou sem deixar rastro obriga a
  procurar o caminho de volta, e não havia um. Vale para qualquer coisa que a pessoa
  desliga — o desligado precisa continuar visível, senão não tem como religar.
- **Só a escolhida chega, imagem E som.** Este parágrafo já disse o contrário — que a
  imagem de todas chegava e só o som era de uma. Estava errado, e a objeção que sustentava
  isso ("não dá para escolher o que não se vê") tinha resposta melhor que gastar banda:
  o **cartão**. Quem está no ar e não está sendo recebido aparece na faixa de baixo com
  selo "AO VIVO" piscando, retrato grande e nome — dá para escolher entre pessoas, que é
  o que se escolhe, e não entre nomes soltos. Medido, inscrita contra não inscrita:
  229.809 bytes contra 0.
- **Quem transmite vê quem está assistindo, e isso não vem do LiveKit.** Não existe essa
  pergunta na API dele — nem no cliente nem no servidor: ninguém conta a quem publica quem
  se inscreveu na faixa. Então cada app ANUNCIA o que escolheu assistir, num atributo de
  participante (`assistindo`), e todo mundo lê o de todo mundo. Medido contra um LiveKit de
  verdade: quem já está na sala passa a ler o atributo, e **quem chega depois já o recebe
  sem ninguém repetir nada** — que é o que descarta mandar recado por dados, onde o
  retardatário ficaria sem saber. O nome do atributo é protocolo entre versões do app, como
  o `turbo`: amigo com versão velha não anuncia, não aparece na lista, e nada quebra.
- **O crachá da sala precisa de `canUpdateOwnMetadata`, senão o anúncio não sai.** Medido
  nos dois lados, e eles falham diferente: com o crachá antigo o `livekit-client` recusa na
  hora — *"does not have permission to update own metadata"* — e o `catch` registra; pelo
  `rtc-node` a mesma chamada RESOLVE e o atributo é descartado em silêncio (quem lê vê
  `{}`). Como app e servidor sobem separados, **app novo com servidor antigo não mostra
  espectador nenhum**: o servidor tem de ser publicado junto. `api.test.mjs` abre o crachá
  e trava a permissão, porque tirá-la de volta não dá erro em lugar nenhum.
- **A lista de espectadores se conserta sozinha a cada 1,5 s**, e não confia no evento.
  Medido com o `livekit-client` deste projeto: LIGAR o `assistindo` não emitiu
  `ParticipantAttributesChanged` em quem já estava na sala; duas mudanças renderam um
  evento só. O evento continua ligado, porque quando vem é imediato — quem garante é a
  volta, igual ao medidor de quem está falando.
- **Quem olha a própria transmissão não é plateia.** Dá para pôr a sua live no palco (é a
  prévia do que você manda), e contar isso diria "1 assistindo" para quem está sozinho. A
  regra vive em `espectadores.ts`, pura e testada.
- **Dois nomes e a conta fora do corte: "Juninho, Junio +5".** Os NOMES encolhem quando
  não cabem; a conta, não. Com os dois no mesmo texto, "Juninho, Junio e mais 5" virava
  "Juninho, Junio e mai…" num quadro de 180 px — comia justamente o número, que é o que
  não se sabe de outro jeito. A lista inteira vem parando o mouse em cima, e isso só
  funciona porque a etiqueta RECEBE o mouse: ela chegou a ter `pointer-events: none` para
  não roubar o clique do quadro, e junto foi embora o passar o mouse. Não precisava: a
  etiqueta é filha do quadro, então o clique sobe sozinho. Na transmissão dos OUTROS
  continua só o número — ali importa se tem gente, não quem. No cartão de quem está no ar
  a contagem entra na MESMA linha do "assistir": aquele cartão tem 110 px e uma quarta
  linha ali já saiu por cima do retrato uma vez. E na sua transmissão o zero aparece —
  "ninguém ainda" é a informação, não a ausência dela.
- **Os cartões saem da PUBLICAÇÃO, não da faixa.** Uma faixa só existe se estiver
  inscrita, então listar lives por faixa mostraria exatamente a única que já se está
  vendo. `rm.lives` vem das publicações de tela dos participantes.
- **Entrar numa sala onde alguém JÁ transmitia inscrevia a transmissão sozinho.** O
  `TrackPublished` só fala das que começam DEPOIS de você chegar; as que já estavam vêm
  direto em `TrackSubscribed`, e as duas apareciam rodando até o primeiro clique. Por isso
  o `TrackSubscribed` também recusa: chegou tela de quem não é o escolhido, desinscreve.
  Medido contra a produção, entrando numa sala com duas telas no ar: **0 `TrackPublished`
  e 2 `TrackSubscribed`**. E desinscrever de dentro do próprio `TrackSubscribed` pega —
  não é ignorado por chegar cedo demais: `TrackUnsubscribed` dispara e a publicação fica
  `subscribed=false`, enquanto a escolhida fica `true`.
- **A escolha é um clique na própria imagem, não numa lista à parte.** Chegou a ser uma
  faixa de fichas no alto da tela, e escolher longe do que se escolhe foi rejeitado na
  hora. O palco tem dois campos: em cima a escolhida, embaixo quem está no ar. Sem
  escolha, o campo de cima não some — ele diz o que fazer.
- **O cartão da live é deitado, não empilhado.** A faixa de baixo tem 110 px de altura, e
  selo + retrato + nome + chamada empilhados não cabem: o selo acabava por cima do
  retrato. Largura é o que sobra ali. Medido renderizando o `styles.css` de verdade — o
  primeiro desenho passou no typecheck e saiu quebrado na imagem.
- **O palco não escolhe a transmissão; quem assiste escolhe.** Ele focava a primeira que
  aparecesse, e "a primeira" é a ordem em que os participantes calharam de vir — que muda
  quando alguém liga a câmera ou troca de faixa. Com duas pessoas transmitindo, o quadro
  grande pulava de uma para a outra sozinho e não havia como dizer "quero esta". Sem
  clique, todas ficam do mesmo tamanho, esperando. A escolha vale para imagem **e** som:
  palco vazio é silêncio, que é o que `audivel.ts` já dizia.
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
- **Uma coisa por vez no palco: vídeo OU chat.** O chat já morou como coluna dentro da
  sala de voz, dividindo espaço com a transmissão — as duas ficavam apertadas, e chat não é
  da sala de voz, é da sala de chat. Quem está na voz e abre o chat não perde a live: ela
  vira um quadro flutuante no canto, que abre em tela cheia com dois cliques.
- **O identificador é do DONO DA SAGA, e de mais ninguém.** Ele aparece junto do nome em
  TODO servidor: definir o de alguém é mexer em como a pessoa é vista na Saga inteira, e
  isso não cabe ao cargo mais alto de UM servidor — nem a quem criou aquele servidor.
  Mesma regra do Berserk e pelo mesmo motivo: quem concede tem de estar no plano do que
  concede. `definirId` continua existindo como permissão de servidor e continua sendo o
  dono de lá quem a desenha; ela é que não alcança isto.
- **O soundboard é do cargo mais alto do servidor, e não de quem só tem a permissão.**
  `gerirSons` continua existindo e continua sendo do dono do servidor desenhar, mas ela
  só vale de fato no topo. Som é diferente de sala ou de castigo: toca para a call
  inteira e quem não gostou não tem como desfazer. A regra é do APP, em `permissoes.mjs`,
  justamente para não precisar mexer nos cargos que o pessoal criou. Quem criou o
  servidor está sempre acima de todos, e empate no topo vale para os dois — não cabe ao
  app desempatar cargos que alguém pôs no mesmo nível de propósito.
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
- **O anúncio do fone vai ANTES do microfone, e não depende dele.** Religar o fone
  readquire o microfone, e isso pode falhar — headset ocupado (o caso Logitech), permissão
  negada, dispositivo que sumiu. Com o `anunciar()` depois de um `await` sem `catch`, a
  falha pulava o anúncio: a sua tela dizia que você voltou e todo mundo continuava te vendo
  de fone desligado. A marca conta quem não ouve; isso já foi decidido três linhas acima, e
  o microfone é consequência. O `catch` é o mesmo de `join` e `toggleMic`: falhar o
  microfone avisa, não derruba.
- **Fone desligado tem marca própria, e ela entra NO LUGAR da do microfone.** Surdez é
  decisão local: não é faixa nenhuma, e o LiveKit não conta a ninguém. De fora só se via o
  microfone mudo — que é a consequência (desligar o fone muta o microfone junto) e diz a
  coisa errada: "ele não fala", quando o que houve foi "ele não te ouve". Agora o app
  anuncia `surdo` junto do `assistindo`, no mesmo atributo de participante, e manda os
  DOIS a cada vez — assim nada depende de o servidor juntar o que veio agora com o que
  veio antes. Na linha da call vai o fone cortado, e não os dois ícones: a linha é a mais
  estreita do app, e repetir a consequência esconderia a causa. Medido contra um LiveKit
  de verdade: os dois atributos viajam juntos, o outro app lê os dois, e o SERVIDOR também
  os enxerga no `listParticipants` — que é o que faz a marca valer também nas salas em que
  você não está (`verParticipante`, testado).
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
- **O som da live também anda em faixa própria** (`ScreenShareAudio`), separada do vídeo.
  Quem corta a live tem de cortar as duas: "não assistir" desinscrevia só o vídeo, e o som
  de todas as lives continuava entrando e tocando com a tela apagada. Medido: cortando só
  o vídeo, `screen_share=cortado` e `screen_share_audio=RECEBENDO`.
- **"Parar de ver" saiu; o que existe é escolher.** Foram três formas antes desta: um link
  geral no topo que cortava todas de uma vez sem dizer de quem eram; uma lista de cortadas
  guardada por identidade; e uma faixa de fichas no alto. Todas partiam de "recebo tudo e
  desligo o que não quero", e o pedido era o contrário — recebo uma. Sem lista de cortadas
  não há estado para envelhecer: a pergunta "esta é a escolhida?" se responde sozinha.
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

- **Relógio não é o único jeito de o app saber que precisa buscar de novo.** Toda busca
  do app é `setInterval` — salas de 4 em 4 s, mensagens de 2 em 2 s, servidor de 10 em 10 s
  —, e relógio é a primeira coisa que o sistema desliga: o Chromium estrangula os
  intervalos de janela que está atrás de outra (e quase os congela depois de alguns
  minutos), e a máquina dormindo simplesmente para todos. Medido: com os relógios da
  página zerados, uma mensagem publicada nesse meio-tempo **nunca aparecia** — que foi o
  que o dono viu ao voltar sem conexão. Hoje há quatro momentos que disparam a busca na
  hora, e nenhum é relógio: a internet voltou (`online`), a janela voltou a ser vista, ela
  ganhou o foco, e a máquina acordou (`powerMonitor`, que só o processo principal enxerga).
  A regra mora em `despertar.ts`, e a janela ainda ganhou `backgroundThrottling: false` —
  aqui isso não é economia de bateria, é o sinal de vida: a pessoa apareceria offline para
  os amigos só por estar com o app atrás do navegador.

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
- **O painel da Saga é um bloco de "Sua conta", não uma janela.** Morava numa janela
  própria escondida no menu de status, e o dono teve de perguntar onde ficava. Menu de
  status não é lugar de painel de administração; a engrenagem é o que existe acima dos
  servidores, que é exatamente o que o Berserk é.
- **A minha presença na barra lateral sai do LiveKit; a dos outros, da busca.** As duas
  fontes têm relógios diferentes — a busca anda de 4 em 4 segundos e ainda espera o
  LiveKit esquecer quem saiu —, e trocar de sala me punha nas DUAS até ela alcançar. Sobre
  mim não é preciso perguntar: eu sei onde estou. A regra mora em `ocupantes.ts`, pura e
  testada, e conserta junto o "saí da call e continuo aparecendo".
- **Falando é o azul da logo, não verde.** O verde já quer dizer "deu certo" no resto do
  app — o selo "no ar", a bolinha de online —, e falar não é um resultado.
- **Quem está falando é decidido AQUI, do som, não perguntado ao servidor.** O caminho do
  LiveKit é juntar, decidir e mandar de volta; o meu microfone não sai da máquina, e o
  áudio do outro já chegou quando o servidor ainda está decidindo. Medido contra a
  produção, sete voltas na mesma rodada, pelo caminho que o app usa:

  | caminho | mediana |
  |---|---|
  | eu, medindo o meu próprio microfone | **25 ms** |
  | o outro, medindo o áudio que chegou aqui | **267 ms** |
  | o outro, esperando o LiveKit avisar | **394 ms** |

  Cheguei a baixar o `update_interval` do LiveKit de 400/4 para 150/2 e voltei atrás: com
  a conta feita no cliente, ninguém lê mais o `ActiveSpeakersChanged`, e um botão que
  nada exercita é pior que botão nenhum — ainda mais um que só se aplica reiniciando o
  LiveKit, o que derruba todo mundo que estiver em call.
- **A faixa remota só entrega amostras se alguém a estiver consumindo.** Medir o nível de
  uma faixa que chegou, sem `<audio>` preso nela, lê **zero para sempre** — e sem erro
  nenhum, então o anel simplesmente nunca acenderia para os outros e nada apareceria no
  registro. Medido: com o `attach`, 267 ms; sem ele, nunca. Funciona porque o
  `onSubscribed` já prende um elemento em toda faixa de áudio que chega; quem mexer nisso
  precisa saber que o medidor depende disso.
- **O laço que mede se conserta sozinho a cada volta**, em vez de acompanhar eventos de
  faixa. Com oito pessoas entrando, saindo, mutando e trocando de dispositivo, um medidor
  perdido deixaria alguém aceso para sempre. Comparar o que existe com o que está medido
  é barato e não tem ordem de evento para errar.
- **Contexto de áudio suspenso lê zero em tudo**, e não lança nada: seria o anel nunca
  acendendo, para ninguém, sem pista. Entrar na call é sempre um clique, então o
  `resume()` passa — mas ele precisa estar lá.
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
- **Quem está na sala fica pendurado nela por um fio** (`.people` com borda à esquerda).
  Sem ele, com duas salas cheias não se sabe quem está com quem.

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
- **Vários servidores voltaram, e a trava saiu do código.** Eles ficaram guardados atrás
  de duas constantes (`travas.ts`) por escolha do dono, com tudo inteiro por baixo — os
  servidores, os cargos e as configurações nunca saíram do banco, e a voz que atravessa
  servidor continuou funcionando o tempo todo. Foi essa aposta que se pagou: reabrir foi
  apagar o arquivo, não reescrever a funcionalidade. A trava saiu de vez porque uma
  constante que só vale `true` é peso morto — quem quiser fechar de novo fecha, e será
  outra decisão, não a mesma esperando.
- **As notas de versão saem das linhas `Nota:` dos commits — o assunto é do repositório,
  a nota é de quem baixa.** Saíam dos assuntos, e metade daquela ideia continua de pé:
  nota escrita depois, num arquivo à parte, é escrita com pressa — ou não é escrita. O
  errado era supor que **todo commit é notícia**. "A revisão antes de publicar achou duas
  coisas minhas, das últimas versões" foi parar na nota da v0.40.0: trabalho de dentro,
  dito na primeira pessoa, para um amigo que só queria saber o que mudou no app. Hoje o
  assunto é semântico (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `ci`, com
  escopo) e a nota é uma linha `Nota: <frase que um amigo entenda>` no corpo, escrita
  junto com o trabalho. Commit sem ela é trabalho de dentro e não aparece; um commit pode
  ter várias; o commit da versão também pode ter as suas, e é onde se recolhe o que ficou
  para trás. A lista sai em ordem de acontecimento, então o que o commit da versão
  acrescenta cai no fim. **Versão sem nota nenhuma não sobe**: o `criar-release` para com
  erro em vez de cair nos assuntos, porque cair nos assuntos devolveria em silêncio
  exatamente o que isto conserta. Ele precisa de `fetch-depth: 0`: o checkout padrão traz
  um commit só e nenhuma tag.
- **A página de download acha as notas por MARCA, não por posição.** O corpo do Release
  tem o que mudou e, depois, a instalação — igual em toda versão e notícia nenhuma. Ler
  "tudo até o primeiro `---`" seria palpite sobre como alguém escreveu; `<!-- mudancas -->`
  é acordo. O GitHub não mostra comentário de HTML, então a marca não aparece para quem lê
  o Release. Sem nota nenhuma, a seção inteira some: título com nada embaixo é pior que
  seção nenhuma.

## Testes

```bash
pnpm test        # servidor (267) + app (165), segundos, sem nada externo
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
3. **O resto do mock de chat que o dono mandou** (09/09/2026), com o preço de cada um.
   O que ENTROU na v0.41: o desenho da conversa, a faixa do palco, a linha de quem está
   compartilhando a tela, "está digitando" e o cursor já no campo. O que ficou, e por quê:
   **reações** (tabela nova, migração, rota, e a contagem viajando no `/mensagens` que já
   é polado de 2 em 2 s); **prévia de link** (o servidor teria de buscar URL que veio de
   fora — é SSRF, precisa de lista de permissão, tempo limite e cache, e não é coisa de
   fazer no susto); **fixar mensagem** e **buscar no chat** (tabela e consulta novas);
   **emoji no campo** (some junto com as reações, se elas vierem). Nada disso é ajuste de
   tela: são features de verdade, cada uma com o seu dia.
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
- **Se o `loopbackWithoutChrome` de fato corta o retorno de voz.** O que está medido é o
  dispositivo abrir e ser um dispositivo distinto. Que ele remova as nossas vozes da
  captura exige duas pessoas numa call de verdade — e no Windows nada disso foi exercido.
- **Por que a faixa de áudio da tela vem silenciosa neste Mac** nos dois modos, com a
  chave de permissão presente no Info.plist. Não foi explicado.
- **O volume do soundboard mexendo no som de verdade.** Está medido que o som do
  soundboard chega reconhecível (a fonte `unknown`, com o nome junto) e que o desenho da
  chave fecha; ouvir o som de outra pessoa mais baixo, numa call, não foi exercido.
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
- **Abrir junto com o Windows, inteiro.** Nada disso foi exercido em Windows nenhum: a
  entrada aparecer no registro e na lista de programas que abrem sozinhos, o
  `--ao-iniciar` chegando de verdade ao app, a janela vindo encolhida na barra de tarefas
  em vez de tomar a tela, e o clique no ícone trazendo de volta a Saga que já estava
  aberta. O que está medido é o comportamento do processo principal aqui no Mac, com as
  chamadas de janela interceptadas.

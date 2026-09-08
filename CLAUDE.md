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

**Servidor** — Node puro, sem framework. `index.mjs` é a tabela de rotas; a lógica mora em
módulos que não sabem de HTTP: `permissoes.mjs` (regras puras de quem pode o quê),
`cargos.mjs`, `membros.mjs`, `salas.mjs`, `mensagens.mjs`, `sons.mjs`, `servidores.mjs`,
`arquivos.mjs`, `giphy.mjs`, `contas.mjs`, `banco.mjs`.

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
- **O `Dockerfile` copia `*.mjs` e descarta os testes.** Listar arquivo por arquivo já
  derrubou o servidor duas vezes. **O `test` do app tinha o mesmo defeito** e por isso
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
- **Cadastrar não pede convite nenhum**, por decisão do dono. Havia a senha do grupo, e ela
  era a única porta: quem soubesse o endereço e não soubesse a senha não criava conta. Hoje
  quem souber o endereço cria. O que ainda barra é o convite POR SERVIDOR: a conta nova cai
  no servidor de casa e só entra noutro com o código dele. `api.test.mjs` trava isso, para
  que voltar a exigir convite seja uma decisão e não o efeito de alguém mexer no cadastro
  sem saber que ele tinha saído.
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
- **`volume` de elemento de áudio só aceita de 0 a 1.** Passar disso lança exceção, e
  dentro de um efeito do React isso derruba a tela inteira. Tudo passa por `volume.ts`.
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
- **O soundboard vai numa faixa própria**, não misturado ao microfone: tocar não depende
  de microfone ligado, e mutar alguém não muta os sons dele.
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
- **Esquerdo abre o perfil; direito, as ações.** Era tudo no mesmo popover: retrato
  minúsculo no topo e, logo abaixo, banir e expulsar. Ver quem é a pessoa é o que mais se
  faz e era o que menos aparecia, enquanto o que quase nunca se usa — e que não se quer
  errar — ficava a um clique. O menu de ações guarda um cabeçalho de uma linha só, para
  não errar de pessoa.
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
- **Quem está na sala fica pendurado nela por um fio** (`.people` com borda à esquerda).
  Sem ele, com duas salas cheias não se sabe quem está com quem.

- **A sala de notas é do APP, não do servidor.** Ela é a primeira da lista, não se
  renomeia, não se apaga e não sai do lugar — o dono do servidor manda em tudo lá dentro,
  menos nisto, porque o conteúdo dela não vem de ninguém de lá. Marcada por
  `salas.papel = 'notas'`, e não pelo nome: renomear à mão no banco não faz nascer uma
  segunda. Reordenar simplesmente a ignora, sem erro — arrastar a lista não pode falhar
  só porque ela estava no caminho.
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
- **Vários servidores estão GUARDADOS, não removidos** (`travas.ts`). Some a barra de
  servidores e o caminho de entrar noutro; os servidores, os cargos e as configurações
  continuam no banco, e a voz que atravessa servidor continua funcionando por baixo. As
  configurações do servidor seguem no nome dele, no alto da lista — era o outro caminho,
  virou o único.
- **As notas de versão saem dos assuntos dos commits**, entre a tag anterior e a nova.
  Escrever a mesma coisa duas vezes — uma no commit, outra na nota — é escrever a segunda
  com pressa, e a nota que ninguém escreve é a que fica vazia para sempre. Isso obriga o
  assunto do commit a ser uma frase que um amigo entenda, que é como já se escrevia aqui.
  O `criar-release` precisa de `fetch-depth: 0`: o checkout padrão traz um commit só e
  nenhuma tag.
- **A página de download acha as notas por MARCA, não por posição.** O corpo do Release
  tem o que mudou e, depois, a instalação — igual em toda versão e notícia nenhuma. Ler
  "tudo até o primeiro `---`" seria palpite sobre como alguém escreveu; `<!-- mudancas -->`
  é acordo. O GitHub não mostra comentário de HTML, então a marca não aparece para quem lê
  o Release. Sem nota nenhuma, a seção inteira some: título com nada embaixo é pior que
  seção nenhuma.

## Testes

```bash
pnpm test        # servidor (213) + app (85), segundos, sem nada externo
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
- **Se o certificado próprio realmente segura a permissão no macOS 26.** O que está medido
  é o requisito ficar idêntico entre builds; que o TCC case a permissão por ele é
  comportamento documentado da Apple, não coisa medida aqui — o `TCC.db` não abre sem
  Acesso Total ao Disco. O teste é: assinar, conceder a tela, subir a versão, reassinar com
  o mesmo certificado, reinstalar e ver se o `Failed to match existing code requirement`
  some do `log show`.
- **Se o DMG assinado com certificado próprio abre nos outros Macs** sem virar "está
  danificado". Ninguém testou, e é o risco que atinge os quatro de uma vez.
- **Se o `loopbackWithoutChrome` de fato corta o retorno de voz.** O que está medido é o
  dispositivo abrir e ser um dispositivo distinto. Que ele remova as nossas vozes da
  captura exige duas pessoas numa call de verdade — e no Windows nada disso foi exercido.
- **Por que a faixa de áudio da tela vem silenciosa neste Mac** nos dois modos, com a
  chave de permissão presente no Info.plist. Não foi explicado.

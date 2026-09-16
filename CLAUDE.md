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
- **Design antes do código, com o `/design`.** Feature com tela começa pelo desenho: como o
  app já resolve algo parecido, como o Discord resolve, e opções renderizadas com as
  medidas do `styles.css` para o dono escolher — antes de escrever componente. O "apagar
  mensagem" saiu com uma lixeira surgindo em cada mensagem, passou em todos os testes e foi
  recusado na hora: teste diz que funciona, não que cabe no app. Foco no visual é olhar a
  tela inteira como quem usa, e não só a peça pedida.
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

**Na tag, quem publica o servidor é o CI** (`.github/workflows/servidor.yml`, chamado pelo
`release.yml` depois de conferir que a versão tem `Nota:` e ANTES de criar o Release): o
mesmo `publicar.sh`, com a chave de root no segredo `VPS_SSH_KEY`. Falhando o servidor, o
Release não sai; faltando nota, nem o servidor sobe. Existe porque a v0.52.0 ficou pronta e
parada: o computador de quem a fez não alcançava a VPS. O "Run workflow" do `servidor`
publica só o servidor, e à mão continua valendo. Três coisas não óbvias:
- **Cada tag roda os workflows do PRÓPRIO commit.** Tag num commit anterior ao `servidor.yml`
  gera o Release sem publicar servidor nenhum — o app novo chega antes do servidor.
- **A chave só está protegida com o segredo no ambiente `producao`**, com aprovação
  obrigatória e só para tags `v*` (Settings › Environments). Segredo de REPOSITÓRIO chega a
  qualquer workflow de qualquer branch: com ele, ter push no GitHub é ter root na VPS, e o
  repositório é público. Configurar isso é do dono do repositório — quem só tem push não
  cria ambiente. As actions desse job vão presas por SHA, e o que ele imprime é público:
  por isso o passo 7 mostra só as linhas do arranque, e nunca o fim do `docker logs`.
  **Configurado em 13/09/2026**, na v0.52.0: o ambiente com o AbnerTKP como aprovador e a
  regra de tag `v*`, e a chave `saga-deploy@github-actions` gerada na máquina do dono,
  autorizada no root da VPS, guardada no segredo do ambiente e apagada de lá — a privada não
  existe em computador nenhum. A cada versão o job `servidor` para em "waiting" até alguém
  aprovar (no GitHub, ou por `gh api …/runs/<id>/pending_deployments`).
- **A identidade da VPS vai fixa, com `StrictHostKeyChecking yes`.** Não para proteger a
  chave — a assinatura do ssh vale só para aquela sessão, e um impostor não a leva —, mas
  porque quem se pusesse no caminho responderia as conferências do script do jeito que
  quisesse, e uma publicação que não aconteceu terminaria em "Publicado".

O script roda igual no Mac e no Linux do CI porque a lista de md5 deste lado usa `md5sum`
quando existe e `md5 -q` quando não — sempre só o hash, montada como a de lá.

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
                 servidores, contas, notas, presenca, plataforma, amigos, conversas.
                 Não sabem de HTTP.
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

## Onde mora o resto

Este arquivo tem só o que vale em qualquer tarefa. As decisões de cada área moram perto dela,
para não carregarem todas em toda conversa (o arquivo único passou de 178 mil caracteres).
**Antes de mexer numa área, leia o arquivo dela** — é ali que está o "já tentamos isso e deu
errado":

| área | arquivo | carrega sozinho? |
|---|---|---|
| Servidor: cargos, permissões, contas e recuperação de senha, salas, arquivos, amizade, desempenho, notas, relatos, administração | `server/CLAUDE.md` | sim, ao abrir arquivo de `server/` |
| Electron: janela, arranque, uma Saga por computador, captura de tela e som do sistema, assinatura no Mac, barra do Windows, overlay, CSP | `app/src/main/CLAUDE.md` | sim, ao abrir arquivo de `app/src/main/` |
| O Dragão Quadrado | `app/src/renderer/src/dragao/CLAUDE.md` | sim, ao abrir arquivo de `dragao/` |
| Voz, call, live, palco, quadro flutuante, quem está falando (`useRoom`, `Stage`, `audivel`, `espectadores`, `queda`) | `docs/decisoes/voz-e-live.md` | não — leia |
| Microfone, supressão de ruído, soundboard, sons de aviso (`useMicrofone`, `sensibilidade`, `embutir`, `sons/`) | `docs/decisoes/som-e-microfone.md` | não — leia |
| Chat, anexos, apagar mensagem, conversas privadas e amigos na tela (`Chat`, `useChat`, `TelaDeAmigos`) | `docs/decisoes/chat-e-conversas.md` | não — leia |
| Xadrez e Fórmula 1, app e servidor (`xadrez`, `corrida`, `pista`, `motor`, `jogos.mjs`, `corridas.mjs`) | `docs/decisoes/jogos.md` | não — leia |
| Telas e visual: paleta, camadas, painéis, perfil e pessoas, cargos na tela, administração, relatar (`styles.css`, `pessoas`, `listaDePessoas`, `Sidebar`) | `docs/decisoes/telas-e-visual.md` | não — leia |
| O que foi medido e o que falta o dono confirmar | `docs/confirmar-com-o-dono.md` | não — leia antes de dizer "pronto" |

O `app/src/renderer/src` é uma pasta plana: um `CLAUDE.md` ali carregaria as cinco áreas de
tela juntas em qualquer mudança. Por isso elas ficam em `docs/decisoes/`. Decisão nova vai
para o arquivo da área, não para cá — aqui só entra o que vale em qualquer tarefa.

## Decisões que valem em todo lugar

- **Migrações são registradas pela posição na lista.** Nunca editar, remover ou inserir no
  meio — só acrescentar no fim. Inserir no meio já derrubou a produção; `banco.test.mjs`
  trava a ordem por impressão digital.
  **Com duas pessoas mexendo, "o fim" é o fim da PRODUÇÃO, não o do seu ramo.** Em
  13/09/2026 a `relatos` (duas migrações) e a `recuperacoes` (uma) foram escritas em paralelo,
  as duas "no fim", ambas na posição 50. A `relatos` subiu primeiro; ao juntar os ramos, a
  `recuperacoes` foi para a 52. Na ordem de escrita, a produção a daria por aplicada e a tabela
  nunca existiria — sem erro nenhum. Antes de juntar migrações, pergunte à produção
  (`SELECT n FROM migracoes`) o que ela já tem.
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
- **Três nomes ficaram "turbo" de propósito**: a coluna do banco, o campo `turbo` que anda
  entre app e servidor, e o `tipo: 'turbo'` do aviso. São protocolo e dado, não texto de
  tela — e app e servidor sobem separados, então renomear o que viaja entre eles faria a
  versão velha de um não entender a nova do outro. Um aviso de tipo desconhecido cairia em
  vermelho, que é justamente o que "isso é do Berserk" não pode parecer.
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

## As notas de versão

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
pnpm test        # servidor (460) + app (395), segundos, sem nada externo
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

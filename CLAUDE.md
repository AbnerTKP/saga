# Cantinho do Vorcaro

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
| Repositório | `AbnerTKP/cantinho-do-vorcaro`, link fixo `/releases/latest` |
| Dono | apelido `TKP` |
| Chave do Giphy | `GIPHY_KEY` no `.env` da VPS; vazio desliga a busca sem quebrar nada |

Publicar servidor: `scp *.mjs Dockerfile root@…:/root/server/` e
`docker compose -f docker-compose.ip.yml up -d --build token`.

## Como está montado

**Servidor** — Node puro, sem framework. `index.mjs` é a tabela de rotas; a lógica mora em
módulos que não sabem de HTTP: `permissoes.mjs` (regras puras de quem pode o quê),
`cargos.mjs`, `membros.mjs`, `salas.mjs`, `mensagens.mjs`, `sons.mjs`, `servidores.mjs`,
`arquivos.mjs`, `giphy.mjs`, `contas.mjs`, `banco.mjs`.

**App** — Electron + React. `useRoom.ts` cuida do LiveKit; `useChat.ts` do chat; a lógica
que dá para testar sem tela fica em módulos puros: `permissoes` do lado do servidor tem
paralelo em `api.ts` (`pode`, `podeSobre`), e `qualidades.ts`, `volume.ts`, `sinal.ts`,
`erros.ts` são pequenos e testados.

**Identidade** — a conta (apelido + senha) é global; cargo, banimento, castigo, nome
exibido, Turbo e identificador pertencem ao vínculo pessoa↔servidor.

## Decisões que não são óbvias no código

- **Migrações são registradas pela posição na lista.** Nunca editar, remover ou inserir no
  meio — só acrescentar no fim. Inserir no meio já derrubou a produção; `banco.test.mjs`
  trava a ordem por impressão digital.
- **O `Dockerfile` copia `*.mjs` e descarta os testes.** Listar arquivo por arquivo já
  derrubou o servidor duas vezes.
- **Cargo, banimento e nome exibido pertencem ao vínculo pessoa↔servidor**, não à pessoa.
  A conta é global. É o que permitirá vários servidores sem migrar dados.
- **Ninguém age sobre alguém de cargo igual ou superior** — é o que sustenta toda a
  moderação. A regra vive em `permissoes.mjs`, puro e testado à exaustão, e só vale para
  ações que recaem sobre alguém: criar sala não pergunta "acima de quem?".
- **O dono tem todas as permissões por ser dono**, não por constar numa lista: editar o
  cargo dele no banco não pode deixar o servidor sem conserto.
- **Permissão inventada é descartada**, e **ninguém dá a um cargo permissão que não tem** —
  seria contornar o próprio limite criando um cargo mais forte e vestindo-o depois.
- **A sala no LiveKit é identificada pelo id, não pelo nome.** Duas salas "Geral" em
  servidores diferentes cairiam na mesma conversa.
- **Pedir por um servidor de que não se faz parte cai no seu próprio**, sem erro e sem
  entrada: saber o número de um servidor alheio não abre porta.
- **Quem foi banido de todos os servidores ainda entra na conta**, para ver o motivo.
- **As salas do `.env` semeiam só o primeiro arranque.** Semeando sempre, uma sala apagada
  voltaria no reinício seguinte e ninguém ligaria uma coisa à outra.
- **1080p e 60 quadros são do Vorcaro Turbo**, e a régua (`qualidades.ts`) vale tanto na
  escolha quanto na hora de transmitir. É trava do app, não do servidor: o LiveKit não
  limita bitrate por participante, então é regra de conduta, não cerca.
- **A janela nasce escondida** e só aparece quando a consulta de atualização resolve — ou
  já com a barra de progresso. Quem clica no ícone espera um app já atualizado.
- **`volume` de elemento de áudio só aceita de 0 a 1.** Passar disso lança exceção, e
  dentro de um efeito do React isso derruba a tela inteira. Tudo passa por `volume.ts`.
- **Banir e dar castigo também tiram da call.** Sem isso a punição parece não funcionar.
  A remoção é consequência: se o LiveKit estiver fora, o registro vale do mesmo jeito.
- **Nome de arquivo é o hash do conteúdo.** Dá cache eterno, deduplicação, e ninguém
  escolhe o nome — o que elimina escrita fora da pasta.
- **Imagem e som são validados pela assinatura dos bytes**, nunca pelo `content-type`.
- **A tela vai sem simulcast.** Com ele, o `adaptiveStream` de quem assiste escolhia a
  versão menor sempre que a janela era menor que a tela transmitida — era a imagem borrada.
- **No Mac o seletor do sistema é plano B, não o padrão.** Ele não chama o nosso handler,
  e é só dentro dele que se concede `audio: 'loopback'` — sem isso a transmissão vai muda.
  Medido nesta máquina: pelo seletor do sistema vêm 0 faixas de áudio; pelo nosso, 1,
  rotulada "System audio". Ele só volta a entrar quando a Gravação de Tela foi **negada**,
  porque aí o nosso seletor não lista nada; com a permissão pendente usamos o nosso, que
  faz o macOS perguntar. O motivo de um dia ele ter sido o padrão continua valendo: escolher
  no seletor do sistema é a própria autorização, e não há permissão a revogar.
- **Áudio de tela recusado não lança erro** — vira faixa muda, e a própria Electron
  documenta isso. Depois de publicar, conferimos se a faixa existe; sem essa conferência
  o Mac transmitiu mudo por versões seguidas sem nada aparecer no registro.
- **O app é assinado em ad-hoc pelo `afterPack`.** Sem identidade de código estável o
  macOS não guarda permissão de microfone, câmera e tela. Não remover.
- **Região de arraste engole clique de tudo que é desenhado por cima.** Qualquer coisa
  flutuante precisa de `-webkit-app-region: no-drag`.
- **O CSP precisa de `http:`/`https:` em `img-src` e `media-src`**: a página vem de
  `file://`, então `'self'` não cobre o servidor.
- **O soundboard vai numa faixa própria**, não misturado ao microfone: tocar não depende
  de microfone ligado, e mutar alguém não muta os sons dele.
- **Segredos são removidos antes de gravar no registro de erros** — é um arquivo feito
  para circular no grupo.

## Limitação conhecida, encerrada

Numa das cinco máquinas (Windows 11 25H2, headset USB Logitech como único dispositivo de
áudio), o áudio do sistema no compartilhamento falha com `Could not start audio source`.
Investigado a fundo e **encerrado por decisão do dono** — não reabrir sem pedido.

Descartados por evidência do registro: escolha de tela ou janela, modo exclusivo, elevação
de privilégio, ausência de dispositivo, nossas opções de captura e as do LiveKit. Os dois
modos do Chromium (`loopback` e `loopbackWithMute`) falham igual; Chrome, Meet e Teams
funcionam na mesma máquina porque usam o seletor interno do navegador, um caminho que um
app Electron não alcança. A máquina não tem "Mixagem estéreo", então o plano B pela entrada
de áudio também não se aplica. Um build com Electron 35 foi preparado para testar a
hipótese de regressão, e descartado sem teste.

## Testes

```bash
pnpm test        # servidor (171) + app (32), segundos, sem nada externo
pnpm test:sala   # 3 participantes WebRTC reais numa sala; precisa de servidor no ar
```

Os do app usam `--experimental-strip-types`, então rodam o `.ts` direto e o import precisa
da extensão (`allowImportingTsExtensions` no tsconfig).

`TESTE_SERVIDOR=76.13.225.79:3001 TESTE_SENHA=… pnpm test:sala`

## A próxima versão (v0.17.0) — combinada, não começada

### 1. GIF no chat — dívida
Quando perguntei onde a busca do Giphy deveria entrar, a resposta foi "nos dois lugares":
perfil e chat. Só o perfil foi entregue, e isso não foi avisado. Entra primeiro, e não
conta como novidade.

Onde mexer: `giphy.mjs` já busca e baixa (com lista de hosts permitidos); `EscolherGif.tsx`
já é a tela de busca. Falta ligar os dois no `Chat.tsx` e guardar a mensagem sabendo que é
imagem, não texto.

### 2. Aviso de mensagem nova
Sala de texto existe desde a v0.13.0 e ninguém sabe quando chega mensagem: sem bolinha,
sem contador, a sala só é vista por quem lembra de abrir. Fica **dentro do app** —
decisão do dono: nada de som nem notificação do sistema. Junto, aviso discreto quando
alguém entra numa sala de voz.

Onde mexer: `useChat.ts` já busca só o que chegou depois da última mensagem (`depoisDe`) —
é daí que sai a contagem. Guardar por sala o que já foi lido; a sala aberta zera sozinha.

### 3. Design dos avisos
Parar de usar a mesma tarja vermelha para tudo. Erro, aviso, sucesso e convite ao Turbo
com cores e pesos próprios: "isso é do Vorcaro Turbo" é convite, não falha.

Onde mexer: o toast de hoje é uma string só, em `App.tsx` e `styles.css` (`.toast`). Vira
tipo + texto. Lembrar do `-webkit-app-region: no-drag`, senão o clique não chega.

### 4. Enquadrar foto e banner — sem recortar
**O app nunca modifica o arquivo enviado.** Guarda a posição e o zoom escolhidos e aplica
na exibição.

Por quê: recortar significa redesenhar a imagem, e um GIF redesenhado perde a animação —
esvaziaria justamente o que o Turbo destrava. Enquadrando, o mesmo mecanismo serve para
imagem parada e animada.

O dono também decidiu **não reduzir a resolução**: a imagem vai como veio. O custo é
arquivo grande; o que o torna aceitável é o endereço ser o hash do conteúdo, então o
navegador guarda em cache para sempre e cada pessoa baixa uma vez por imagem.

Implica: guardar o ajuste (posição e zoom) junto da imagem, e aplicá-lo em todo lugar
onde ela aparece — avatar, cartão, lista de pessoas, trilha.

Onde mexer: coluna nova no fim de `MIGRACOES` (nunca no meio) e impressão digital nova em
`banco.test.mjs`; o ajuste viaja junto da foto em todas as respostas que já mandam `foto` e
`banner`; exibição em `Avatar.tsx`, no cartão da pessoa, `ListaDeMembros.tsx`,
`TrilhaDeServidores.tsx` e na prévia do `EscolherImagem.tsx`. `arquivos.mjs` não muda: ele
guarda o arquivo como veio, e o endereço continua sendo o hash do conteúdo.

### 5. Zoom na foto de perfil
Clicar na foto de alguém abre a imagem maior, para ver direito. Com o enquadramento
aplicado — é a mesma imagem, vista de perto.

## Depois disso

1. **Atualização automática no Mac** — hoje só avisa, porque o mecanismo do macOS confere
   assinatura e recusa a nossa, que é ad-hoc.
2. **Atalhos de teclado no soundboard** — ficou planejado na v0.4.0 e não saiu.
3. **Modo música** — desligar cancelamento de eco, ruído e ganho para quem toca instrumento.
4. **Ícone do Mac** em retângulo arredondado, como manda o sistema.

## O que só o dono pode confirmar

- A atualização abrindo já atualizada no Windows (v0.16.2) — exige uma atualização real
  acontecendo com alguém do outro lado.
- Som, câmera, microfone e compartilhamento de tela em máquinas que não são este Mac.

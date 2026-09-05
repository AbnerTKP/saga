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
- **No macOS a captura usa `useSystemPicker`.** O caminho antigo depende da permissão
  persistente de Gravação de Tela, que o macOS 15+ revoga sozinho de tempos em tempos.
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

## Próximos passos

Tudo que estava planejado (v0.12.0 a v0.16.2) está no ar. O que sobrou:

1. **Design dos avisos** — hoje todo aviso é a mesma tarja vermelha, inclusive os que não
   são erro: "isso é do Vorcaro Turbo" é convite, não falha.
2. **Atualização automática no Mac** — hoje só avisa e abre o download, porque o mecanismo
   do macOS confere assinatura e recusa a nossa, que é ad-hoc. Dá para o app baixar e se
   substituir sozinho, contornando esse mecanismo.
3. **Atalhos de teclado no soundboard** — ficou planejado na v0.4.0 e não saiu.
4. **Modo música** — desligar cancelamento de eco, ruído e ganho para quem toca instrumento.
5. **Ícone do Mac** em retângulo arredondado, como manda o sistema.

## O que só o dono pode confirmar

- A atualização abrindo já atualizada no Windows (v0.16.2) — exige uma atualização real
  acontecendo com alguém do outro lado.
- Som, câmera, microfone e compartilhamento de tela em máquinas que não são este Mac.

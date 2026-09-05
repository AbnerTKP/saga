# Cantinho do Vorcaro

App de desktop (Windows e Mac) estilo Discord para um grupo de amigos: salas de voz
fixas, câmera, compartilhamento de tela, chat e soundboard. Hoje, ~5 pessoas.

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

Publicar servidor: `scp *.mjs Dockerfile root@…:/root/server/` e
`docker compose -f docker-compose.ip.yml up -d --build token`.

## Decisões que não são óbvias no código

- **Migrações são registradas pela posição na lista.** Nunca editar, remover ou inserir no
  meio — só acrescentar no fim. Inserir no meio já derrubou a produção; `banco.test.mjs`
  trava a ordem por impressão digital.
- **O `Dockerfile` copia `*.mjs` e descarta os testes.** Listar arquivo por arquivo já
  derrubou o servidor duas vezes.
- **Cargo, banimento e nome exibido pertencem ao vínculo pessoa↔servidor**, não à pessoa.
  A conta é global. É o que permitirá vários servidores sem migrar dados.
- **Ninguém age sobre alguém de cargo igual ou superior** — é o que sustenta toda a
  moderação, e por isso `cargos.mjs` é puro e tem teste à exaustão.
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
pnpm test        # servidor (108) + app (15), segundos, sem nada externo
pnpm test:sala   # 3 participantes WebRTC reais numa sala; precisa de servidor no ar
```

`TESTE_SERVIDOR=76.13.225.79:3001 TESTE_SENHA=… pnpm test:sala`

## Próximos passos

Ordenados por dependência, não por vontade. Cargos configuráveis mexem em toda regra de
permissão; construir telas que exibem cargos antes disso significa refazê-las depois.

### v0.12.0 — no ar
Giphy nas quatro imagens, Vorcaro Turbo, identificador antes do nome, cartão de perfil com
banner ao clicar na pessoa, e o modal de configuração que transbordava.

### v0.13.0 — Salas e chat em evidência (no ar)
- Criar, renomear e apagar salas (hoje vêm do banco mas não há tela)
- Salas de **texto**, além das de voz; a de texto ocupa a área principal, como no Discord
- Mensagens que não somem — hoje evaporam quando a sala esvazia, por não haver banco. Agora há
- Opção de **não assistir transmissão nenhuma**, para quem só quer a voz

### v0.14.0 — Cargos configuráveis
Substitui os três níveis fixos (Dono, Moderador, Membro) por cargos criados pelo dono, com
nome, cor, ordem e permissões marcáveis uma a uma. É a fundação: `cargos.mjs` deixa de ser
uma escala numérica e passa a ser conjunto de permissões, e todo `cargo >=` do código muda.
Manter a regra de ouro: ninguém age sobre alguém de cargo igual ou superior.

### v0.15.0 — A cara do Cantinho
- Barra do servidor **à direita** e **quadrada** — de propósito diferente do Discord
- Lista de pessoas do servidor com seus cargos, também à direita
- Com um servidor só, por enquanto

### v0.16.0 — Vários servidores
Criar servidores, convidar, entrar. O banco já foi construído para isto desde a v0.2.0:
cargo e banimento pertencem ao vínculo pessoa↔servidor, não à pessoa.

### v0.17.0 — Design dos avisos
Hoje todo aviso é a mesma tarja vermelha, inclusive os que não são erro: "isso é do
Vorcaro Turbo" é convite, não falha. Separar por natureza — erro, aviso, sucesso,
convite ao Turbo — cada um com sua cor e seu peso, e o do Turbo com o tratamento que a
distinção merece.

### Sem data
- Atualização automática no Mac (hoje só avisa, por falta de certificado da Apple)
- Ícone do Mac em retângulo arredondado, como manda o sistema
- Atalhos de teclado no soundboard
- "Modo música": desligar cancelamento de eco para quem toca instrumento

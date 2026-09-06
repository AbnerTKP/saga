# Cantinho do Vorcaro — voz, vídeo e tela entre amigos

App de desktop (Windows e Mac) no estilo Discord, sem cadastro e sem servidores de comunidade:
uma senha compartilhada, algumas salas de voz fixas, câmera, compartilhamento de tela com áudio
e chat da sala. Feito para até ~10 pessoas ao mesmo tempo.

```
app/      Electron + React (o programa que os amigos instalam)
server/   servidor de token (um arquivo Node) + configuração do LiveKit + docker-compose
docs/     plano original, versão grande (arquivado)
```

Como funciona: o app pede a senha e o nome, o servidor de token devolve um passe do LiveKit,
e o LiveKit (servidor de mídia) distribui áudio, vídeo e tela entre todo mundo.

## Rodar no seu computador (para testar)

Precisa de Node 22, pnpm e livekit-server (`brew install node@22 pnpm livekit`).

```bash
pnpm install
pnpm dev:livekit     # terminal 1: LiveKit em modo dev (chave devkey/secret)
pnpm dev:server      # terminal 2: token server em http://localhost:3001, senha "amigos"
pnpm dev:app         # terminal 3: abre o app
```

No app: servidor `localhost:3001`, senha `amigos`, seu nome. Salas: Geral, Jogos, Filmes
(mude em `server/.env.dev`, variável `ROOMS`).

## Testes

```bash
pnpm test        # unitários, rodam em segundos e sem depender de nada externo
pnpm test:sala   # integração: sobe 3 participantes de verdade numa sala
```

Os unitários cobrem a tradução do estado do LiveKit para os ícones da barra lateral
(`server/participantes.mjs`) — de onde já saiu um bug em que todo mundo aparecia mudo e
compartilhando tela, porque `MICROPHONE` é 2 e `SCREEN_SHARE` é 3, não o contrário.

O de integração conecta três clientes WebRTC reais no servidor, publica microfone e
confere o que o `/rooms` devolve: que os três se enxergam, que ninguém aparece mudo ou
compartilhando sem estar, que mutar um não muta os outros e que a sala esvazia ao sair.
Ele ignora quem mais estiver na sala, então pode rodar com o pessoal usando. Precisa de um
servidor no ar e da senha, que nunca fica no repositório:

```bash
TESTE_SERVIDOR=76.13.225.79:3001 TESTE_SENHA=asenha pnpm test:sala
```

No GitHub Actions os unitários e o typecheck rodam antes de gerar qualquer instalador: se
falharem, nada é publicado.

## Hospedar para os amigos (uma vez só)

O que fica ligado 24 h é o **servidor de voz** (pasta `server/`). Precisa de uma máquina Linux
pequena com IP público: Oracle Cloud Always Free (grátis, São Paulo), AWS Lightsail São Paulo
(~US$ 6/mês) ou Hetzner/DigitalOcean (~US$ 6/mês, EUA). 1 vCPU / 1 GB atende 10 pessoas.

1. **Crie a máquina** com Ubuntu 24.04 e anote o IP público.
2. **No painel do provedor, libere as portas** (Security List / Security Group / Firewall):
   `22, 80, 443, 3001, 7880, 7881` em TCP e `3478, 40000–40100, 50000–50100` em UDP.
3. **Opcional:** aponte um subdomínio (ex.: `voz.seudominio.com.br`) para o IP. Com domínio o
   instalador liga HTTPS sozinho; sem domínio funciona só pelo IP.
4. **Copie a pasta `server/` para a máquina e rode o instalador**, do seu Mac:
   ```bash
   scp -r ~/Documents/app-comunicacao/server ubuntu@IP_DA_MAQUINA:~/
   ssh ubuntu@IP_DA_MAQUINA
   sudo bash ~/server/instalar.sh
   ```
   Ele instala o Docker, gera as chaves, pergunta a senha e as salas, abre o firewall da máquina
   e sobe tudo. No fim mostra o endereço e a senha para passar aos amigos.
   (Na Oracle o usuário costuma ser `ubuntu`; na DigitalOcean, `root`.)
5. No app, os amigos digitam o endereço mostrado e a senha.

Para trocar senha ou salas: edite `~/server/.env` na máquina e rode
`docker compose -f docker-compose.ip.yml up -d` (ou `docker-compose.yml` se usou domínio).
Logs: `docker compose -f docker-compose.ip.yml logs -f`.

### Se alguém não consegue conectar na voz
Quase sempre é rede corporativa ou 4G com CGNAT. O TURN embutido resolve. Para o caso mais
teimoso (firewall que só deixa 443), troque no `livekit.yaml` `tls_port: 5349` por `443` e no
`Caddyfile` mova o Caddy para a porta 8443 — ou simplesmente peça para a pessoa usar outra rede.

## Gerar os instaladores

```bash
pnpm dist:mac   # gera "app/dist/Cantinho do Vorcaro-0.1.0-universal.dmg" (Intel + Apple Silicon)
pnpm dist:win   # gera "app/dist/Cantinho do Vorcaro Setup 0.1.0.exe" (dá para gerar no Mac mesmo)
```

Os instaladores **não são assinados por uma autoridade** (o certificado custa US$ 99/ano na
Apple e ~US$ 10/mês na Microsoft), então o aviso de "app não verificado" aparece nos dois
sistemas. No Mac, o `afterPack` de `app/build/afterPack.js` assina o pacote de qualquer
jeito, porque sem assinatura nenhuma o macOS não tem a que associar as permissões de
microfone, câmera e tela. Não remova esse hook.

### Por que o Mac pede a permissão de tela de novo a cada versão

Porque assinar em ad-hoc não basta. O que o macOS guarda junto da permissão é o *requisito
designado* do app, e no ad-hoc ele é o hash do build — que muda em toda versão. Resultado:
cada atualização é "outro app" para o sistema, e a chave que você ligou nos Ajustes continua
aparecendo ligada sem valer nada.

```
ad-hoc        designated => cdhash H"a644c9ee…"                    ← muda a cada build
certificado   designated => identifier "br.com.vorcaro.cantinho"
                            and certificate leaf = H"…"            ← igual entre builds
```

O conserto é assinar sempre com o **mesmo** certificado. Ele não precisa ser da Apple: um
auto-assinado resolve, custa nada, e não muda o Gatekeeper (o aviso de "não verificado"
continua igual). Gere uma vez:

```bash
cat > cert.cnf <<'EOF'
[req]
distinguished_name=dn
x509_extensions=v3
prompt=no
[dn]
CN=Cantinho do Vorcaro
[v3]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=critical,codeSigning
EOF

openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout chave.pem -out cert.pem -config cert.cnf
openssl pkcs12 -legacy -export -out cantinho.p12 -inkey chave.pem -in cert.pem
base64 -i cantinho.p12 | pbcopy      # cola isto no secret MAC_CERT_P12
```

No GitHub, em **Settings › Secrets and variables › Actions**, crie `MAC_CERT_P12` (o texto
colado) e `MAC_CERT_SENHA` (a senha que você digitou no `pkcs12`). O `CN` precisa bater com
`MAC_CERT_NOME` em `.github/workflows/release.yml`. **Guarde o `cantinho.p12`**: perder a
chave privada é voltar à estaca zero, porque o requisito muda junto com o certificado.

Sem os secrets, o build sai em ad-hoc como antes — o CI não quebra, só não conserta.

Na **primeira** versão assinada, cada pessoa ainda precisa reconceder uma vez, porque o
requisito muda de hash para certificado justamente nesse build: em **Ajustes do Sistema ›
Privacidade e Segurança › Gravação do Áudio do Sistema e da Tela**, remover o Cantinho pelo
botão **−** (só desligar e ligar a chave costuma não bastar), compartilhar a tela de novo
para o macOS pedir, e sair do app por completo (⌘Q) antes de reabrir. Da versão seguinte em
diante, para de pedir.

Para amigos, basta explicar:

- **Mac**: arraste para Aplicativos. Na primeira vez, o macOS diz que "não pôde verificar".
  Abra **Ajustes do Sistema › Privacidade e Segurança**, role até o aviso e clique em
  **Abrir Mesmo Assim**. Alternativa no Terminal: `xattr -d com.apple.quarantine "/Applications/Cantinho do Vorcaro.app"`.
  Ao compartilhar tela pela primeira vez, o macOS pede permissão de **Gravação de Tela**; o app
  mostra o caminho e o botão que abre o painel certo. Depois de ligar, feche e abra o app.
- **Windows**: o SmartScreen mostra "Windows protegeu o seu PC". Clique em **Mais informações ›
  Executar mesmo assim**. O instalador é de um clique, sem admin.

Para distribuir, suba os dois arquivos num Google Drive, num GitHub Release ou no próprio VPS.

## Atualizações (como os amigos recebem versão nova)

O app olha o GitHub Releases do repositório a cada 6 horas (e 5 s depois de abrir):

- **Windows**: baixa a versão nova em silêncio e mostra "Reiniciar e atualizar". Se a pessoa
  ignorar, instala sozinho na próxima vez que fechar o app.
- **Mac**: aparece o aviso "Versão X disponível" com o botão **Baixar**, que abre o DMG novo;
  a pessoa arrasta por cima do antigo. São três travas para isso virar automático, não uma:
  `update.ts` nem chama o atualizador no Mac; o `electron-builder.yml` só gera `dmg`, e o
  mecanismo do Mac exige o alvo `zip`; e a assinatura. O certificado próprio resolve só a
  terceira — sozinho, não liga nada.

Para isso funcionar, uma configuração única:

1. Já feito: o repositório público é `AbnerTKP/cantinho-do-vorcaro`.
2. Já feito: `REPO` em `app/src/main/update.ts` e `owner`/`repo` em `app/electron-builder.yml`
   apontam para ele. (Se um dia mudar de repositório, são esses dois lugares.)
3. Para lançar uma versão: mude `version` em `app/package.json` (ex.: `0.2.0`), faça commit e
   crie a tag `v0.2.0` (`git tag v0.2.0 && git push --tags`). O GitHub Actions
   (`.github/workflows/release.yml`) gera o `.exe`, o `.dmg` e o `latest.yml` e publica o Release
   sozinho, em cerca de 10 minutos, sem precisar de Mac nem de Windows na sua mão.

O repositório precisa ser público só para o download não exigir login; não há nada secreto no
código (a senha do grupo fica no `.env` do servidor, que não é enviado).

## Limites conhecidos

- Chat some quando a sala esvazia (fica só na memória de quem está dentro). Foi de propósito: sem banco.
- Áudio do sistema no compartilhamento: Windows sempre funciona; Mac precisa de macOS 14.2+ e, se
  falhar, o app compartilha só o vídeo e avisa.
- No Mac a atualização é semiautomática (aviso + download), por falta de assinatura.
- Sem cargos, permissões, DMs ou histórico: qualquer um com a senha entra em qualquer sala.

## Mudar nome, ícone e salas

- Nome do app: `productName` em `app/package.json` e `app/electron-builder.yml`.
- Ícone: coloque `icon.icns` (Mac) e `icon.ico` (Windows) em `app/build/`.
- Salas: variável `ROOMS` no `.env` do servidor.
- Endereço do servidor que já vem preenchido no app: `SERVIDOR_PADRAO` em
  `app/src/renderer/src/api.ts` (hoje `76.13.225.79:3001`, a VPS na Hostinger).
- Qualidade da tela compartilhada: `PRESET_DE_TELA` em `app/src/renderer/src/useRoom.ts`
  (1080p, 60 fps, até 8 Mb/s). O servidor reenvia esse fluxo para *cada* pessoa na sala:
  8 Mb/s com 4 espectadores são 32 Mb/s saindo do VPS, e codificar 1080p60 puxa CPU de quem
  compartilha. Se travar, o degrau seguinte é `new VideoPreset(1280, 720, 4_000_000, 60)`
  (720p60, metade da banda) ou `ScreenSharePresets.h1080fps30`.

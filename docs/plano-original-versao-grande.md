# Plano completo — app desktop de comunicação (estilo Discord)

**Data:** 03/09/2026
**Plataformas:** Windows 10/11 (x64) e macOS 13+ (Apple Silicon e Intel)
**Modelo de produto:** equivalente ao Discord — servidores, canais de texto e de voz, mensagens diretas, chamada com voz, webcam e compartilhamento de tela, convites por link.

---

## 1. O que o produto faz

| Área | Funcionalidade |
|---|---|
| Comunidade | Criar servidor, convidar por link, cargos e permissões, canais de texto e de voz organizados por categoria |
| Voz | Entrar num canal de voz e falar (canal fica "aberto" como no Discord, sem agendar reunião), mutar, ensurdecer, push-to-talk, supressão de ruído |
| Vídeo | Ligar a webcam dentro do canal de voz, grade de vídeos, foco em um participante |
| Tela | Compartilhar tela inteira ou uma janela, com ou sem áudio do sistema, em 720p/1080p, vários compartilhando ao mesmo tempo |
| Texto | Chat por canal e DM, anexos, imagens, emojis, respostas, edição, histórico persistente |
| Presença | Online/ausente/ocupado, quem está em cada canal de voz, indicador de "falando" |
| Desktop | Instalador nativo, atualização automática, ícone na bandeja, atalhos globais, abrir convite por link `app://` |

### Escopo por versão

- **MVP (beta fechado):** conta, servidor, canais de texto, canal de voz, webcam, tela, DM, convite por link, instalador Win/Mac com atualização automática.
- **v1 (lançamento):** cargos e permissões, categorias de canais, anexos, supressão de ruído, push-to-talk, status, moderação básica (expulsar/banir), 2FA.
- **v2:** gravação de chamada, criptografia ponta a ponta opcional, chamadas de voz em DM/grupo sem servidor, versão web e mobile reaproveitando o mesmo backend, bots/webhooks.

---

## 2. Decisões de arquitetura (e por quê)

### 2.1 Mídia: SFU, não P2P

Chamada com mais de 3 pessoas em P2P (cada um manda vídeo para todos) estoura a banda de upload. A solução é um **SFU** (Selective Forwarding Unit): cada participante envia uma vez para o servidor, e o servidor encaminha para os demais.

**Escolha: LiveKit** (código aberto, Go, licença Apache 2.0).
Motivos: SDK de cliente JS maduro com suporte oficial a Electron, simulcast e stream adaptativo prontos, compartilhamento de tela com áudio, TURN embutido, webhooks de presença, gravação (egress) para a v2, criptografia ponta a ponta disponível, e pode rodar **na nuvem deles (LiveKit Cloud)** ou **no seu próprio servidor** com o mesmo código. Isso permite começar barato e migrar sem reescrever.

Alternativas descartadas: mediasoup (mais baixo nível, mais trabalho), Jitsi (produto pronto, difícil de moldar como Discord), Agora/Daily/100ms (só nuvem, preço por minuto mais alto e sem opção própria).

### 2.2 Desktop: Electron

Electron embute o Chromium, que traz WebRTC completo, captura de tela (`desktopCapturer`), áudio do sistema no Windows e, nas versões recentes, no macOS. É a mesma base do Discord, Slack e VS Code. Tauri é mais leve, mas a captura de tela e o WebRTC dependem do WebView de cada sistema e são inconsistentes. O peso do Electron (~150 MB instalado) é aceitável para este tipo de app.

### 2.3 Backend próprio para tudo que não é mídia

Contas, servidores, canais, mensagens, convites, permissões e presença ficam num backend Node.js. O LiveKit só cuida de áudio/vídeo/tela. O backend é quem emite o **token de acesso** do LiveKit quando o usuário entra num canal de voz, o que garante que a permissão é sempre sua.

---

## 3. Arquitetura

```
┌──────────────────────────┐        HTTPS (REST)         ┌──────────────────────┐
│  App desktop (Electron)  │ ──────────────────────────▶ │  API (Node/Fastify)  │
│  React + LiveKit client  │ ◀───── WebSocket ─────────▶ │  auth, servidores,   │
│                          │   chat, presença, eventos   │  canais, tokens      │
└──────────┬───────────────┘                             └───────┬──────────────┘
           │ WebRTC (UDP/TCP/TLS)                                │
           │ áudio, vídeo, tela                        ┌─────────▼──────────┐
           ▼                                           │ PostgreSQL + Redis │
┌──────────────────────────┐   webhooks (entrou/saiu)  └────────────────────┘
│  LiveKit SFU + TURN      │ ──────────────────────────▶ API
└──────────────────────────┘
                                                        Cloudflare R2: avatares, anexos
```

**Fluxo "entrar no canal de voz":**
1. Usuário clica no canal de voz.
2. App chama `POST /channels/:id/voice-token` na API.
3. API verifica se o usuário é membro do servidor e tem permissão de "conectar" no canal.
4. API gera um JWT do LiveKit (sala = id do canal, validade de 10 minutos, permissões de publicar/assinar) e devolve URL + token.
5. App conecta ao LiveKit com o token e publica microfone. Webcam e tela são publicadas sob demanda.
6. LiveKit dispara webhook `participant_joined` para a API, que atualiza a presença e avisa todos os clientes do servidor via WebSocket ("Fulano entrou em #geral").
7. Ao sair, mesmo processo com `participant_left`. Se o app fechar sem avisar, o LiveKit detecta pelo timeout e o webhook chega igual.

---

## 4. Stack detalhada

### App desktop
| Camada | Escolha |
|---|---|
| Shell | Electron (versão atual estável, ≥ 39 por causa do áudio do sistema no Mac) |
| UI | React 19 + TypeScript + Vite (via `electron-vite`) |
| Estilo | Tailwind CSS com tema escuro por padrão, Radix UI para menus/modais/tooltips |
| Estado | Zustand (estado local) + TanStack Query (dados da API) |
| Mídia | `livekit-client` + `@livekit/components-react` |
| Áudio | supressão de ruído: Krisp (plugin do LiveKit, licenciado) ou RNNoise (livre) via `@livekit/noise-filter` |
| Empacotamento | `electron-builder` (NSIS no Windows, DMG no Mac), `electron-updater` para atualização automática |
| Erros | Sentry (processo principal e renderer) |

### Backend
| Camada | Escolha |
|---|---|
| Runtime | Node.js 22 LTS + TypeScript |
| Framework | Fastify (REST) + `ws` (WebSocket) — ou NestJS se preferir estrutura mais rígida |
| Banco | PostgreSQL 16 via Prisma |
| Cache/pub-sub | Redis (presença, rate limit, fan-out do WebSocket entre instâncias) |
| Arquivos | Cloudflare R2 (compatível com S3, sem custo de saída de dados) |
| Auth | e-mail + senha (Argon2id), JWT de acesso de 15 min + refresh token rotativo; OAuth Google opcional |
| E-mail | Resend ou Amazon SES (confirmação de conta, recuperação de senha) |
| Mídia | `livekit-server-sdk` para gerar tokens e receber webhooks |

### Modelo de dados (tabelas principais)

```
users(id, email, password_hash, username, display_name, avatar_url, status, created_at)
servers(id, name, icon_url, owner_id, created_at)
server_members(server_id, user_id, nickname, joined_at)
roles(id, server_id, name, color, permissions_bitfield, position)
member_roles(server_id, user_id, role_id)
channels(id, server_id, category_id, type[text|voice], name, position, topic, bitrate, user_limit)
channel_overrides(channel_id, role_id|user_id, allow_bits, deny_bits)
messages(id, channel_id|dm_id, author_id, content, reply_to, edited_at, created_at)
attachments(id, message_id, url, filename, size, mime)
invites(code, server_id, channel_id, creator_id, max_uses, uses, expires_at)
dm_conversations(id) / dm_participants(dm_id, user_id)
voice_states(user_id, channel_id, muted, deafened, streaming, camera, joined_at)  -- em Redis
bans(server_id, user_id, reason, created_at)
```

Permissões em **bitfield** (como o Discord): `VIEW_CHANNEL, SEND_MESSAGES, CONNECT, SPEAK, STREAM, MUTE_MEMBERS, MANAGE_CHANNELS, MANAGE_ROLES, KICK, BAN, ADMINISTRATOR`. Cálculo: permissões base do cargo `@everyone` → soma dos cargos do membro → sobrescritas do canal.

---

## 5. Interface (equivalente ao Discord)

Layout de três colunas fixas mais um painel opcional à direita, tema escuro por padrão:

```
┌────┬───────────────┬───────────────────────────────────┬──────────────┐
│ S  │ Nome do servidor ▾ │ # geral                       │ MEMBROS      │
│ E  │               │                                   │ ● online     │
│ R  │ TEXTO         │  mensagens...                     │   Ana        │
│ V  │  # geral      │                                   │   Bruno      │
│ I  │  # avisos     │                                   │ ○ offline    │
│ D  │ VOZ           │                                   │   Carla      │
│ O  │  🔊 Sala 1    │                                   │              │
│ R  │     Ana 🎤    │                                   │              │
│ E  │     Bruno 📺  │                                   │              │
│ S  │  🔊 Sala 2    │───────────────────────────────────│              │
│    ├───────────────┤  [ Mensagem em #geral          ] │              │
│ +  │ 🟢 Conectado  │                                   │              │
│    │ Sala 1 · [📷][📺][📞] │                           │              │
│    │ 👤 você  [🎤][🎧][⚙] │                           │              │
└────┴───────────────┴───────────────────────────────────┴──────────────┘
```

- **Coluna 1 (72 px):** ícones redondos dos servidores, botão "+" para criar/entrar, DMs no topo.
- **Coluna 2 (240 px):** nome do servidor com menu, categorias recolhíveis, canais de texto (#) e de voz (🔊) com os participantes listados embaixo de cada canal de voz; no rodapé, o painel de voz conectado (câmera, tela, desligar) e o painel do usuário (mutar, ensurdecer, configurações).
- **Coluna 3 (flexível):** chat do canal de texto, ou, quando num canal de voz com vídeo/tela, a grade de vídeos com o chat do canal ao lado.
- **Coluna 4 (240 px, opcional):** lista de membros agrupada por cargo e status.
- **Paleta escura:** fundo do chat `#313338`, colunas `#2b2d31` e `#1e1f22`, destaque azul-violeta `#5865f2`, verde de online `#23a559`, vermelho `#f23f43`. Fonte: Inter ou a do sistema.
- **Tela compartilhada:** ao clicar em "📺", abre o seletor de fonte (telas e janelas com miniatura), escolha de resolução e FPS e a opção "compartilhar áudio do sistema". A tela aparece como um bloco na grade com botão de "assistir em foco".
- **Configurações de voz e vídeo:** seleção de dispositivo de entrada/saída, teste de microfone, sensibilidade, push-to-talk com atalho global, supressão de ruído, câmera com preview.

---

## 6. Especificidades de desktop

### Windows
- **Instalador:** NSIS (um clique, por usuário, sem admin), gerado pelo `electron-builder`.
- **Assinatura de código:** obrigatória para não cair no aviso do SmartScreen. Use **Azure Artifact Signing** (antigo Trusted Signing): plano Basic de ~US$ 10/mês, sem token USB, integra direto no CI. Exige conta Azure e validação da empresa (CNPJ e razão social). Alternativa: certificado OV tradicional (mais caro e com token físico).
- **Reputação do SmartScreen:** mesmo assinado, os primeiros downloads podem exibir aviso até acumular reputação. Assinar sempre com o mesmo certificado acelera.
- **Áudio do sistema no compartilhamento de tela:** funciona nativamente (`audio: 'loopback'` no handler do Electron).
- **Inicialização com o Windows, bandeja, notificações nativas:** APIs do Electron.

### macOS
- **Apple Developer Program:** US$ 99/ano, em nome da empresa (D-U-N-S necessário).
- **Assinatura + notarização:** obrigatórias, senão o Gatekeeper bloqueia. `electron-builder` faz as duas no CI com os certificados "Developer ID Application" e a chave da App Store Connect API.
- **Build universal** (arm64 + x64) ou dois builds separados; universal é mais simples para o usuário.
- **Permissões (TCC):** microfone, câmera e **Gravação de Tela** são pedidas pelo sistema na primeira vez. É preciso declarar no `Info.plist`: `NSMicrophoneUsageDescription`, `NSCameraUsageDescription`; e nos entitlements: `com.apple.security.device.audio-input`, `com.apple.security.device.camera`. A permissão de gravação de tela o usuário precisa ligar manualmente em Ajustes do Sistema; o app deve detectar a negação e mostrar um guia com botão que abre o painel certo.
- **Áudio do sistema ao compartilhar tela:** macOS 13+; o Electron 39+ usa Core Audio Taps por padrão. Teste isso na primeira semana, pois é o ponto mais frágil; se falhar, lance sem áudio do sistema no Mac e avise na interface.
- **DMG** com fundo "arraste para Aplicativos".

### Comum
- **Atualização automática:** `electron-updater` lendo um `latest.yml`/`latest-mac.yml` publicado em GitHub Releases (grátis, público) ou em bucket R2 (privado). Canais `stable` e `beta`.
- **Deep link:** registrar o protocolo `app://` (nome a definir) para abrir convites `app://invite/CODIGO` do navegador.
- **Atalhos globais:** push-to-talk e mutar via `globalShortcut`.
- **Segurança do Electron:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, preload com API mínima via `contextBridge`, CSP rígida, nunca carregar URL remota no renderer.
- **Captura de tela:** `session.setDisplayMediaRequestHandler` + `desktopCapturer.getSources` com miniaturas para montar o seletor próprio.
- **Desempenho:** limitar a webcam a 720p por padrão, tela a 1080p/15 fps por padrão (30 fps opcional), manter aceleração de hardware ligada, usar `adaptiveStream` e `dynacast` do LiveKit para não decodificar vídeos fora da tela.

---

## 7. Hospedagem

### Fase 1 — MVP e beta (até ~100 pessoas ao mesmo tempo em voz)

Objetivo: zero servidor para administrar, custo perto de zero, região no Brasil.

| Peça | Serviço | Custo aprox./mês |
|---|---|---|
| SFU + TURN | **LiveKit Cloud** (região `sa`, Brasil). Plano Build: grátis com 5.000 minutos-participante e 50 GB; Ship: US$ 50 com mais cota, depois ~US$ 0,0005/min e ~US$ 0,12/GB de descida | US$ 0 → 50 |
| API + WebSocket | Fly.io ou Railway, região São Paulo (`gru`), 1–2 máquinas pequenas | US$ 10–30 |
| PostgreSQL | Neon ou Supabase (gerenciado, com backup) | US$ 0–25 |
| Redis | Upstash (serverless) | US$ 0–10 |
| Arquivos | Cloudflare R2 (10 GB grátis, sem custo de saída) | US$ 0–5 |
| DNS, TLS, proteção | Cloudflare (plano grátis) | US$ 0 |
| E-mail transacional | Resend (3.000/mês grátis) | US$ 0 |
| Erros/monitoramento | Sentry free + Better Stack (uptime) free | US$ 0 |
| Atualizações do app | GitHub Releases | US$ 0 |
| **Total** | | **~US$ 20 a 120** |

### Fase 2 — produção com volume (a partir de ~200 simultâneos ou quando a conta da LiveKit Cloud passar de ~US$ 300/mês)

O LiveKit se hospeda em servidor próprio com o mesmo código do cliente; só muda a URL.

| Peça | Escolha | Observações |
|---|---|---|
| Servidor de mídia | VM com IP público em São Paulo: **AWS sa-east-1**, **Oracle Cloud São Paulo**, **Azure Brazil South** ou provedor nacional (Magalu Cloud, Hostinger). 4 vCPU / 8 GB atende ~300 participantes em voz + dezenas de vídeos | Precisa de UDP aberto: 7881/TCP, 50000–60000/UDP, TURN 3478/UDP e **443/TCP (TURN/TLS)** para atravessar firewalls corporativos |
| TURN | Embutido no LiveKit (ou coturn separado) | Sem TURN, ~10–15% dos usuários (redes corporativas, CGNAT) não conectam |
| API | Docker na mesma nuvem, 2 instâncias atrás do Caddy/Traefik com TLS automático | Ou manter no Fly.io |
| Banco | RDS/Cloud SQL gerenciado ou Neon | Nunca no mesmo host do SFU |
| Redis | Gerenciado; obrigatório se houver mais de um nó LiveKit | |
| Custo | VM ~US$ 60–150 + banda | **Banda é o custo dominante**: na AWS ~US$ 0,15/GB de saída no Brasil; Oracle dá 10 TB/mês grátis, o que torna a Oracle a opção mais barata para mídia |

**Conta de banda (para dimensionar):**
- Voz: ~40–64 kbps por participante. 10 pessoas 1 h ≈ 0,3 GB de saída.
- Webcam 720p: ~1,5 Mbps por vídeo enviado; o SFU envia para cada um dos outros. 6 pessoas com câmera 1 h ≈ 20 GB.
- Tela 1080p: ~2,5–4 Mbps. 1 tela para 10 pessoas 1 h ≈ 15 GB.
- Regra prática: **vídeo custa 30–50× a voz**. Simulcast + stream adaptativo (o LiveKit manda resolução menor para miniaturas) reduz isso bastante.

### Recomendação

Começar na **Fase 1** com LiveKit Cloud e API no Fly.io/Railway em São Paulo. Migrar a mídia para **Oracle Cloud São Paulo** (banda grátis generosa) quando o custo mensal da LiveKit Cloud passar o custo de uma VM + tempo de administração. O app não muda.

---

## 8. Segurança e LGPD

- TLS em tudo (API, WebSocket, WebRTC via DTLS-SRTP). WebRTC já cifra a mídia entre cliente e SFU por padrão.
- Tokens do LiveKit com validade curta (10 min) e permissões mínimas por canal.
- JWT de acesso de 15 min + refresh rotativo guardado no `safeStorage` do Electron (cofre do sistema), nunca em arquivo simples.
- Senhas com Argon2id; 2FA por TOTP na v1.
- Rate limit por IP e por usuário (login, criação de convite, mensagens).
- Convites com expiração e limite de usos; verificação de banimento ao entrar.
- Upload: limite de tamanho, validação de tipo, varredura de imagem (ex.: reprocessar com `sharp` para remover metadados).
- Criptografia ponta a ponta (E2EE) do LiveKit como opção por canal na v2 (impede gravação no servidor).
- **LGPD:** política de privacidade e termos de uso no cadastro; exportação e exclusão de conta pelo próprio usuário; retenção definida (mensagens ficam até apagar; logs de acesso 6 meses); registrar os operadores (LiveKit, Fly, Neon, Cloudflare) e assinar os termos de tratamento de dados de cada um; encarregado (DPO) nomeado no site.
- Dependências: Dependabot + `npm audit` no CI; Electron sempre na versão estável mais recente (correções de segurança do Chromium).

---

## 9. Estrutura do repositório (monorepo)

```
app-comunicacao/
├── apps/
│   ├── desktop/            # Electron + React
│   │   ├── src/main/       # processo principal: janelas, tray, atualização, captura de tela, deep link
│   │   ├── src/preload/    # ponte segura (contextBridge)
│   │   ├── src/renderer/   # React: layout Discord, chat, voz, vídeo, configurações
│   │   ├── build/          # ícones, entitlements.mac.plist, fundo do DMG
│   │   └── electron-builder.yml
│   └── api/                # Fastify + WebSocket + Prisma
│       ├── src/modules/    # auth, users, servers, channels, messages, invites, voice, uploads
│       ├── src/ws/         # gateway de eventos em tempo real
│       ├── src/livekit/    # emissão de token + webhooks
│       └── prisma/
├── packages/
│   ├── shared/             # tipos, permissões (bitfield), validação (zod), eventos do WS
│   └── ui/                 # componentes de UI compartilhados (útil para a versão web na v2)
├── infra/
│   ├── docker-compose.yml  # api + postgres + redis + livekit + caddy (Fase 2 / dev local)
│   ├── livekit.yaml
│   └── Caddyfile
├── .github/workflows/      # ci.yml (lint+test), release.yml (build+assina+publica)
├── pnpm-workspace.yaml
└── turbo.json
```

Ferramentas: pnpm, Turborepo, ESLint + Prettier, Vitest, Playwright (testes de ponta a ponta no Electron), Changesets para versionamento.

---

## 10. CI/CD e publicação

**`ci.yml` (cada PR):** lint, typecheck, testes unitários, build da API, build do renderer.

**`release.yml` (ao criar tag `v1.2.3`):**
1. Matriz: `windows-latest` e `macos-latest`.
2. Instala dependências, roda `electron-builder --publish always`.
3. Windows: assina o `.exe` e o instalador via Azure Artifact Signing (segredos: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, endpoint, conta e perfil de certificado).
4. Mac: assina com o certificado "Developer ID Application" (segredos: `CSC_LINK` em base64 e `CSC_KEY_PASSWORD`) e notariza com a chave da App Store Connect API (`APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`).
5. Publica os instaladores e os arquivos `latest.yml` / `latest-mac.yml` no GitHub Release.
6. Os apps instalados detectam a nova versão em até 1 h, baixam em segundo plano e pedem para reiniciar.

**Canais:** tags `v1.2.3-beta.1` vão para o canal beta (usuários que optaram); tags limpas vão para o estável.

**API:** deploy automático no Fly.io/Railway a partir da `main`, com migração do Prisma antes de trocar a versão.

---

## 11. Observabilidade

- **Sentry** no processo principal, no renderer e na API (com release e versão do app para saber qual build quebrou).
- **LiveKit** expõe métricas Prometheus (participantes, bytes, perda de pacote, jitter). Na LiveKit Cloud há painel pronto; em servidor próprio, Grafana.
- **Qualidade da chamada no cliente:** o SDK entrega `ConnectionQuality` por participante; mostrar barrinhas na UI e mandar amostras anonimizadas para a API para diagnosticar redes ruins.
- **Uptime:** Better Stack ou UptimeRobot na API e no endpoint do LiveKit, com página de status pública.
- **Logs:** Axiom ou Grafana Loki, com o id do usuário e do servidor em cada linha.

---

## 12. Testes

- **Unitários (Vitest):** cálculo de permissões, validação, geração de token, redutores de estado do cliente.
- **Integração (API):** banco em container, testes de cada rota e dos webhooks do LiveKit.
- **Ponta a ponta (Playwright + Electron):** login, criar servidor, entrar em canal de voz com câmera falsa do Chromium (`--use-fake-device-for-media-stream`), compartilhar tela.
- **Carga:** `lk load-test` do LiveKit simula 100–500 participantes publicando e assinando; medir CPU do SFU e banda.
- **Matriz manual antes de cada lançamento:** Windows 10 e 11, macOS Intel e Apple Silicon, rede corporativa com firewall (só 443), 4G compartilhado, fone Bluetooth, dois monitores, troca de dispositivo no meio da chamada.

---

## 13. Cronograma (equipe de 2 devs; solo dobre os prazos)

| Semana | Entrega |
|---|---|
| 0 | Fundação: monorepo, CI, contas (GitHub, LiveKit Cloud, Fly, Neon, Cloudflare, Apple, Azure), domínio, esqueleto Electron abrindo com layout Discord vazio. **Prova de conceito da captura de tela com áudio no Mac e no Windows.** |
| 1–3 | Auth (cadastro, login, refresh, e-mail), servidores, convites, canais de texto, chat em tempo real com histórico, DMs, upload de avatar/anexo |
| 4–6 | Voz: token do LiveKit, entrar/sair de canal, mutar/ensurdecer, lista de quem está no canal, indicador de "falando", seleção de dispositivo, push-to-talk, supressão de ruído |
| 7–8 | Webcam e tela: grade de vídeo, seletor de fonte, áudio do sistema, foco, várias telas ao mesmo tempo, stream adaptativo |
| 9–10 | Desktop: instaladores, assinatura Win/Mac, notarização, atualização automática, bandeja, deep link, atalhos globais, telas de permissão do Mac, Sentry |
| 11–12 | Beta fechado com 20–50 pessoas; corrigir NAT/firewall, qualidade de áudio, consumo de CPU; cargos e permissões; moderação |
| 13–14 | Endurecimento: rate limit, LGPD (exportar/excluir conta), 2FA, página de status, testes de carga, site com download; **lançamento** |

Total: **~14 semanas** com 2 devs; **~6 meses** solo.

---

## 14. Custos resumidos

**Únicos / anuais**
| Item | Valor |
|---|---|
| Apple Developer Program | US$ 99/ano |
| Domínio `.com.br` / `.app` | R$ 40 – US$ 20/ano |
| D-U-N-S (grátis, mas leva até 30 dias) | 0 |

**Mensais**
| Fase | Faixa |
|---|---|
| Desenvolvimento e beta (Fase 1) | US$ 30–130 (LiveKit Cloud + Fly + Neon + Azure Signing ~US$ 10) |
| Produção pequena (até ~200 simultâneos, ainda na LiveKit Cloud) | US$ 150–400 |
| Produção própria (Fase 2, Oracle SP + API + banco gerenciado) | US$ 150–300 fixos, banda quase inclusa |

Opcional: Krisp (supressão de ruído premium) tem licença por uso; RNNoise é grátis e razoável.

---

## 15. Riscos e como tratar

| Risco | Mitigação |
|---|---|
| Usuário atrás de firewall corporativo não conecta à voz | TURN sobre TLS na porta 443 (LiveKit Cloud já tem; no próprio servidor, configurar `turn.tls_port: 443` com certificado) |
| Áudio do sistema no Mac não funciona | Prova de conceito na semana 0; se falhar, lançar sem esse recurso no Mac com aviso na UI |
| Aviso do SmartScreen nos primeiros downloads | Assinar sempre com o mesmo certificado desde o primeiro build; pedir para os beta-testers clicarem em "executar mesmo assim" acelera a reputação |
| Notarização recusada | Entitlements corretos (`hardened runtime`), sem bibliotecas nativas sem assinatura; testar o pipeline de release na semana 0 com um build vazio |
| Custo de banda explode com vídeo | Limites padrão (720p webcam, 1080p/15 fps tela), simulcast, dynacast; alertas de custo na LiveKit Cloud e na nuvem |
| CPU alta no Electron com muitos vídeos | `adaptiveStream` (não decodifica o que não está visível), limitar a grade a 9–12 vídeos com paginação |
| Eco/ruído | Cancelamento de eco do Chromium (padrão), supressão de ruído, ensurdecer automaticamente ao entrar por um segundo dispositivo |
| Spam e abuso | Convites expiráveis, rate limit, banimento por servidor, denúncia com id da mensagem, e-mail verificado antes de criar servidor |
| Dependência do LiveKit Cloud | Mesmo software em servidor próprio; manter `docker-compose` da Fase 2 testado desde o começo |

---

## 16. Checklist prático — o que fazer, na ordem

**Contas e cadastros (semana 0)**
1. Registrar o domínio e colocar na Cloudflare.
2. Criar organização no GitHub; repositório privado; ativar Actions.
3. Conta na LiveKit Cloud; criar projeto na região `sa` (Brasil); anotar `LIVEKIT_URL`, `API_KEY`, `API_SECRET`.
4. Conta no Fly.io ou Railway (região São Paulo) para a API.
5. Neon (Postgres) e Upstash (Redis).
6. Cloudflare R2: bucket para avatares e anexos; token de acesso.
7. Resend: domínio verificado para e-mails.
8. Sentry: projetos `desktop` e `api`.
9. **Apple:** obter D-U-N-S da empresa → inscrever no Apple Developer Program (US$ 99) → gerar certificado "Developer ID Application" → criar chave da App Store Connect API para notarização.
10. **Microsoft:** conta Azure → recurso "Artifact Signing" (Basic) → validação da identidade da empresa (documentos do CNPJ) → perfil de certificado "Public Trust".

**Código (semanas 0–1)**
11. Criar o monorepo com `electron-vite` + Fastify + Prisma; fazer o app abrir com o layout Discord vazio.
12. Fazer o pipeline `release.yml` gerar um instalador **assinado e notarizado** de um app vazio e instalá-lo nas duas plataformas. Resolver isso antes de qualquer funcionalidade.
13. Prova de conceito: entrar numa sala do LiveKit Cloud com microfone, webcam e tela, com áudio do sistema, no Windows e no Mac.

**Depois:** seguir o cronograma da seção 13.

---

## 17. Apêndices (arquivos de exemplo na pasta `infra/` e `.github/`)

- `infra/docker-compose.yml` — API + Postgres + Redis + LiveKit + Caddy para a Fase 2 ou ambiente local.
- `infra/livekit.yaml` — configuração do LiveKit com TURN e webhooks.
- `infra/Caddyfile` — TLS automático para API e LiveKit.
- `apps/desktop/electron-builder.yml` — empacotamento, assinatura e atualização automática.
- `.github/workflows/release.yml` — build, assinatura, notarização e publicação.
- `exemplos/voice-token.ts` — rota que emite o token do LiveKit.
- `exemplos/screen-share.ts` — handler de captura de tela no Electron.

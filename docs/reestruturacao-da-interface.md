# A reestruturação da interface (setembro de 2026)

O pedido do dono, em 18/09/2026: uma reestruturação total da interface e um design system,
porque o grupo vai crescer (e ir para a AWS). As queixas, nas palavras dele: "a tela de
configurações é extremamente confusa, a disposição das coisas, exemplo configurações do
servidor difícil de localizar", e "o certo seria eu acessar as configurações do servidor
clicando com o botão direito na imagem dele, que hoje por sinal é recortada errada". As
referências: o Discord ("referência em encontrar as configurações necessárias") e o Trivo
(app brasileiro, "à frente em visual e UI, com comunidades verificáveis, hub de comunidades").
E o limite: "não tem problema ser semelhante ao Discord em vários aspectos, ele funciona.
Assim como 99food e Keeta pegaram do iFood, precisamos dessa inspiração funcional sem perder
identidade."

As decisões e o porquê de cada uma estão em `docs/decisoes/telas-e-visual.md`, seção "A
reestruturação da interface". Aqui fica o levantamento, o que foi feito e o que falta.

## O que o levantamento achou (v0.61.0)

- **~85 ajustes, 19 portas diferentes, 3 painéis grandes** — todos modais de 720 px com uma
  rolagem só, sem menu lateral. O do servidor tinha 7 blocos e o título era só o nome do
  servidor; "Sua conta" tinha 10 e misturava a conta, o que fica neste computador e portas para
  outros lugares. **9 coisas só existiam por botão direito ou arrastar**, sem pista visível
  (sala privada, categorias, tirar castigo, as configurações pelo quadrado).
- **Sete mudanças de lugar registradas no código** (convidar, a foto da pessoa, a administração,
  o volume da live, o volume da pessoa…): cada ajuste foi remendado sozinho, sem um mapa de onde
  as coisas moram.
- **O CSS**: 2.208 linhas, 279 cores escritas à mão (131 valores), 30 tamanhos de letra, 17
  raios, 34 sombras; nos painéis de configuração, 67 a 100% das cores eram cruas, quase todas da
  paleta do Discord. 5 jeitos de botão primário, 9 de secundário, 12 de perigo; ~15 botões sem
  classe virando texto solto. O texto 3 não passava contraste em fundo nenhum (2,90:1).
- **O Trivo** (o "trigo", ~90% de certeza — o corretor troca uma palavra pela outra): brasileiro,
  nascido em agosto de 2026 depois da suspensão do vídeo do Discord no Brasil pela ANPD; mesma
  tecnologia (LiveKit); beta fechada 18+, sem servidores de usuário. O que ele faz melhor:
  configurações com menu lateral agrupado, selo de verificado no ícone E no nome do servidor,
  bússola de "explorar" na trilha. Cuidado registrado: fundo quase preto neutro com azul
  `#68a9ef` é a cara dele — a Saga não vai para lá.
- **O Discord** levou um ano e meio (11/2025 a 08/2026) reorganizando as próprias
  configurações, em partes, com a busca como rede de segurança. Os padrões que tornam as coisas
  achadas lá: uma casa por escopo com o nome no título; mais de um caminho gerado da MESMA lista;
  grupos curtos; quem não pode não vê; busca por sinônimo; pouca profundidade; destrutivo
  separado, com o nome do alvo e confirmação.

## O que foi feito (fase 1, commits de 18/09/2026, sem versão ainda)

| commit | o quê |
|---|---|
| `feat(visual)` | `tokens.css` (primitivos da logo + semânticos), tema Noite, Figtree embutida, contraste corrigido, os cinzas do Discord que sobravam viraram tokens; `design.test.ts` |
| `feat(casca)` | trilha à esquerda com o risco de "você está aqui" e o alto-falante da voz; engrenagem do servidor; botão direito no quadrado abre o menu, com "Configurações do servidor" em primeiro; quem não configura nada não vê o item |
| `feat(configuracoes)` | as casas com menu lateral, busca e caminho; as páginas do servidor e as suas; o submenu do botão direito |
| `feat(servidor)` | foto do servidor quadrada em todo lugar e enquadrável (migração 56) |
| `fix(casca)` | não lida neutra, cabeçalhos em 56 px, última sala lembrada, "Voz conectada" leva à call |
| `feat(call)` | controles da call no palco, lista de pessoas fora da frente na call |

## Onde cada coisa mora agora

**Configurações** (a engrenagem ao lado do seu nome, embaixo):

| página | o quê |
|---|---|
| Seu perfil | foto, capa, enquadrar, GIF; o seu nome NESTE servidor |
| Conta e segurança | apelido de entrada (não muda), e-mail (se o envio estiver ligado), senha |
| Voz e vídeo | microfone, supressão de ruído e sensibilidade, saída de som, câmera, qualidade da tela, volume do soundboard (só o dono da Saga) |
| Atalhos | o atalho da live por cima do jogo |
| Inicialização | abrir com o computador, a versão |
| (ações) | Relatar um problema, Registro de erros, Administração da Saga (dono), Sair da conta |

**Configurações do servidor** (a engrenagem ao lado do nome do servidor; o nome ▾; o botão
direito no quadrado, com o submenu das páginas):

| página | quem vê | o quê |
|---|---|---|
| Perfil do servidor | `gerirServidor` | nome, foto (quadrada, enquadrável), capa |
| Pessoas | quem modera alguém | busca, cargo na linha, o "…" com castigo (1 min a 1 dia), tirar o castigo, mutar, tirar da call, expulsar e banir com o nome e confirmação, identificador (dono da Saga) |
| Cargos | `gerirCargos` | lista e editor: nome, nível, cor, permissões em chaves com o que cada uma faz e por que está travada; apagar com confirmação |
| Convites | `convidar` | gerar e copiar; a lista dos vivos para `gerirServidor` |
| Banidos | `banir` | desbanir |
| Salas e categorias | `gerirSalas` | a árvore na ordem real com setas, nome, categoria, sala privada e quem vê, apagar; criar sala e categoria |
| (ação) | quem não criou | Sair do servidor |

Continuam valendo os caminhos antigos: o botão direito numa sala, numa categoria, numa pessoa e
numa mensagem; arrastar as salas; o menu de status com "Sair da conta".

## O design system

- **Tokens** (`app/src/renderer/src/tokens.css`) — o único arquivo com cor escrita à mão.
  Semânticos: `--superficie-0..4`, `--texto-forte/--texto/--texto-2/--texto-3`, `--borda-*`,
  `--acento*`, `--ok/--aviso/--perigo*`, `--berserk*`; escala de letra (`--letra-*`), pesos,
  espaço (`--e0..--e7`), raios (`--raio-*`), sombras, camadas (`--z-*`). Os nomes antigos do
  `styles.css` (`--bg0`, `--text2`…) são ponte e somem com a migração.
- **Travas** (`design.test.ts`): cor crua fora do `tokens.css` falha; o `styles.css` tem um teto
  (240) que só desce; `var()` de variável inexistente falha; a escada de camadas em ordem; a fonte
  como arquivo. O `animacoes.test.ts` lê todo `.css`.
- **CSS novo**: arquivo próprio e prefixo (`configuracoes.css` com `cfg-`, `palco.css`).
- **Conferir tela**: `ferramentas/fotografar/fotografar.mjs` fotografa o renderer de verdade
  num Chrome headless contra servidor e LiveKit locais, sem abrir janela e sem som, e grava fora
  do repositório. `--so=04,05` roda só alguns passos; `--tamanhos=900x560` a janela mínima.

## O que falta

**Da fase 1 (a mesma reestruturação, ainda não feito):**
- Migrar o resto do `styles.css` para os tokens e componentes (240 cores cruas): chat, menus de
  botão direito, cartão de perfil, tela de entrar, amigos, administração, avisos. A
  administração da Saga ainda é o modal com abas de antes, e deve virar a terceira casa.
- Nas configurações: "Nos seus servidores" (o nome em cada servidor numa lista só — hoje só o do
  servidor aberto); Notificações e sons de aviso (não existem ajustes); atalhos de voz (mutar,
  ensurdecer, apertar para falar); revogar convite (o servidor não tem a rota); a ordem das
  categorias (a rota existe, sem tela); o soundboard como página das configurações do servidor
  (hoje só se gere de dentro da call); apagar e transferir o servidor.
- Na casca: marca de novidade nos OUTROS servidores da trilha (precisa de rota nova no
  servidor, com custo na VPS de um núcleo a medir); pastas na trilha; jogos fora da call;
  "Seu perfil neste servidor" no menu do servidor.
- Conferir no Electron e no Windows (ver `docs/confirmar-com-o-dono.md`).

**Fase 2: hub de comunidades e selo de verificado** (desenhados na prancheta, não feitos):
- Explorar (bússola tracejada na trilha e na tela inicial), cartões com capa, descrição,
  "online · pessoas" e nível de atividade, prévia do servidor antes de entrar.
- Selo **"Verificado pela Saga"**: quadrado (servidor é quadrado), azul-céu com o check em
  marinho; no quadrado da trilha e ao lado do nome. **Quem concede é o dono da Saga, na
  administração** — quem concede tem de estar no plano do que concede, como o Berserk.
- Recomendação: começar **curado** (só servidores que o dono da Saga põe lá, como os "ambientes
  oficiais" do Trivo) e abrir depois.
- O que o servidor precisa: `publico`/visibilidade, `verificado_em`/`verificado_por`, descrição,
  regras, categoria; rota pública de prévia com recorte MAIS estreito que o da administração (sem
  sala privada, nem a contagem delas, sem nome de quem está offline); entrar sem convite num
  público. **Isso revoga, para os públicos, duas regras travadas em teste**: "quem abre a porta é
  o convite por servidor" e "saber o número de um servidor não dá acesso" — é decisão explícita
  do dono, com teste novo.
- Antes de abrir para fora do grupo: canal de denúncia (o `relatos.tipo` tem CHECK e precisa de
  tabela refeita) e orientação jurídica — o ECA Digital vale para aplicativos desde 17/03/2026, e
  foi por ele que o Discord perdeu o vídeo no Brasil.

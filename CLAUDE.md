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

## Testes

```bash
pnpm test        # servidor (108) + app (15), segundos, sem nada externo
pnpm test:sala   # 3 participantes WebRTC reais numa sala; precisa de servidor no ar
```

`TESTE_SERVIDOR=76.13.225.79:3001 TESTE_SENHA=… pnpm test:sala`

## Próximos passos

1. **Giphy** — nas quatro imagens de perfil e no chat. **Parado**: precisa da chave de
   `developers.giphy.com` (Create an App → API, não SDK), que vai no `.env` do servidor,
   nunca dentro do app.
2. **Chat que persiste** — hoje as mensagens somem quando a sala esvazia, por não haver
   banco. Agora há.
3. **Vários servidores** — o banco já foi construído para isso. Ideia, não compromisso.
4. **Atualização automática no Mac** — hoje só avisa e abre o download, porque o
   mecanismo do macOS confere assinatura e recusa a nossa. Dá para o app baixar e se
   substituir sozinho, contornando esse mecanismo.

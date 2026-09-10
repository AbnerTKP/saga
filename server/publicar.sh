#!/usr/bin/env bash
#
# Publica o servidor. Existe porque "ter cuidado" não sobrevive a um dia corrido — o que
# sobrevive é uma conferência que roda sozinha. Cada trava aqui é um erro que já
# aconteceu de verdade, e a linha de comentário diz qual.
#
#   ./publicar.sh              confere tudo e publica
#   ./publicar.sh --so-conferir   só confere, não manda nada
set -euo pipefail

VPS=${VPS:-root@76.13.225.79}
REMOTO=/root/server
SO_CONFERIR=${1:-}
falhou=0
erro() { echo "  ✗ $*"; falhou=1; }
ok()   { echo "  ✓ $*"; }

echo "=== 1. Testes e tipos ==="
# Nada publica com teste falhando. Já foi só uma regra escrita, e regra escrita se pula.
(cd .. && pnpm test >/tmp/pub-test.log 2>&1) && ok "testes passam" || { erro "testes FALHANDO — veja /tmp/pub-test.log"; }
(cd ../app && pnpm typecheck >/tmp/pub-tsc.log 2>&1) && ok "typecheck limpo" || erro "typecheck falhou — veja /tmp/pub-tsc.log"

echo
echo "=== 2. O que vai subir ==="
# 07/09/2026: mandei o `livekit.yaml` do repositório junto do compose. Ele é MODELO, com
# chave `APIxxxxxxxx`, e sobrescreveu a configuração de produção. O LiveKit continuou de
# pé com a antiga na memória e só recusou a chave HORAS depois, no primeiro reinício.
ENVIAR=(*.mjs Dockerfile)
for f in "${ENVIAR[@]}"; do
  case "$f" in
    *.yaml|*.yml|.env|*.env) erro "$f NÃO pode subir: configuração de produção mora só na VPS"; ;;
  esac
done
[ -f livekit.yaml ] && erro "existe um livekit.yaml aqui; o modelo chama-se livekit.exemplo.yaml de propósito"
ok "só .mjs e Dockerfile"

echo
echo "=== 3. Como está a VPS ==="
LIVRE=$(ssh -o ConnectTimeout=15 "$VPS" "free -m | awk '/^Mem:/{print \$7}'")
SWAP=$(ssh -o ConnectTimeout=15 "$VPS" "free -m | awk '/^Swap:/{print \$2}'")
DISCO=$(ssh -o ConnectTimeout=15 "$VPS" "df -m / | awk 'NR==2{print \$4}'")
echo "  memória disponível: ${LIVRE} MB | swap: ${SWAP} MB | disco livre: ${DISCO} MB"
# 07/09/2026: a máquina travou inteira por pressão de memória, sem swap. Respondia ping e
# nenhuma porta TCP — nem o sshd. Sem swap, "sem memória" não vira erro: vira máquina muda.
[ "${SWAP:-0}" -ge 512 ] || erro "sem swap suficiente — sem ele, um pico derruba a máquina inteira"
[ "${LIVRE:-0}" -ge 300 ] || erro "menos de 300 MB disponíveis: publicar agora é arriscado"
[ "${DISCO:-0}" -ge 1024 ] || erro "menos de 1 GB de disco"
[ "$falhou" = 0 ] && ok "há folga para publicar"

echo
echo "=== 4. A configuração que está na VPS ainda serve? ==="
# A pergunta que ninguém fez em 07/09: o LiveKit rodava havia dias com uma configuração
# que já não existia em disco, e só quebrou quando reiniciou. Isto responde antes.
#
# A conferência é ESTÁTICA de propósito. A primeira versão subia o livekit-server de
# verdade para ver se ele reclamava — e travava justamente quando a configuração estava
# BOA, porque aí o processo não termina. Verificação que trava é pior que nenhuma.
CONF=$(ssh -o ConnectTimeout=20 "$VPS" "cat $REMOTO/livekit.yaml")
# Com , deixar isto sem valor derruba o script no ramo do placeholder — que é
# justamente quando ele mais precisa continuar e mostrar o resto.
SEGREDO=""
if grep -qE '^\s*APIxxxxxxxx|segredo-longo|SEUDOMINIO' <<<"$CONF"; then
  erro "o livekit.yaml da VPS está com o PLACEHOLDER do repositório — ele não sobe no próximo reinício"
else
  SEGREDO=$(awk '/^keys:/{p=1;next} p&&/^[[:space:]]+[A-Za-z0-9]+:/{print $2; exit}' <<<"$CONF")
  if [ "${#SEGREDO}" -lt 32 ]; then
    erro "a chave do livekit.yaml tem ${#SEGREDO} caracteres; o LiveKit exige 32 e recusa no arranque"
  else
    ok "chave do LiveKit com ${#SEGREDO} caracteres"
  fi
  # `tls_port` sem certificado é o outro jeito de ele não subir: "TURN tls cert required".
  if grep -qE '^\s*tls_port:' <<<"$CONF" && ! grep -qE '^\s*cert_file:' <<<"$CONF"; then
    erro "tls_port sem cert_file: o LiveKit morre com 'TURN tls cert required'"
  fi
fi
# E a chave tem de bater com a que o servidor de token usa, senão o token fala sozinho.
CHAVE_ENV=$(ssh -o ConnectTimeout=20 "$VPS" "grep -E '^LIVEKIT_API_SECRET=' $REMOTO/.env | cut -d= -f2-")
[ "$CHAVE_ENV" = "$SEGREDO" ] && ok "a chave do .env bate com a do livekit.yaml" \
  || erro "a chave do .env NÃO bate com a do livekit.yaml"

echo "=== 5. Tem gente em call? ==="
NA_CALL=$(ssh -o ConnectTimeout=20 "$VPS" 'docker exec server-token-1 node -e "
import(\"livekit-server-sdk\").then(async ({ RoomServiceClient }) => {
  const svc = new RoomServiceClient(process.env.LIVEKIT_HOST, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
  let t = 0; for (const s of await svc.listRooms()) t += (await svc.listParticipants(s.name)).length;
  console.log(t);
});" 2>/dev/null | tail -1')
echo "  $NA_CALL pessoa(s)"
# Recriar o token NÃO derruba call — a mídia vai direto ao LiveKit. Recriar o LiveKit sim.
ok "publicar o token não derruba ninguém"

echo
if [ "$falhou" != 0 ]; then echo "PAROU: conserte o que está marcado com ✗ antes de publicar."; exit 1; fi
if [ "$SO_CONFERIR" = "--so-conferir" ]; then echo "Só conferi, como pedido. Nada foi enviado."; exit 0; fi

echo "=== 6. Publicando ==="
# 10/09/2026: o scp morreu no meio ("Can't assign requested address" — a internet do dono
# piscou) e AINDA ASSIM saiu com status 0. O contêiner nunca foi reconstruído, e o script
# terminou como se tivesse publicado. Mandar não é ter chegado: quem responde isso é o
# md5 dos dois lados, não o código de saída do scp.
scp -q "${ENVIAR[@]}" "$VPS:$REMOTO/" || erro "o scp falhou"

# Mandar não é ter chegado. As duas listas são "md5 nome", uma de cada lado, e comparar
# texto evita depender de md5 (macOS) e md5sum (Linux) escreverem igual.
AQUI=$(for f in "${ENVIAR[@]}"; do printf '%s %s\n' "$(md5 -q "$f")" "$f"; done | sort)
LA=$(ssh -o ConnectTimeout=20 "$VPS" "cd $REMOTO && for f in ${ENVIAR[*]}; do printf '%s %s\n' \"\$(md5sum \$f | cut -d' ' -f1)\" \"\$f\"; done | sort")
if [ "$AQUI" = "$LA" ]; then
  ok "o que chegou é o que saiu ($(printf '%s\n' "${ENVIAR[@]}" | wc -l | tr -d ' ') arquivos)"
else
  erro "o que está na VPS não é o que foi enviado — a transferência caiu no meio"
  echo "PAROU antes de reconstruir: a VPS continua com a versão anterior de pé."
  exit 1
fi

ssh -o ConnectTimeout=30 "$VPS" "cd $REMOTO && docker compose -f docker-compose.ip.yml up -d --build token" 2>&1 | tail -2

echo
echo "=== 7. Conferindo depois ==="
sleep 8
ESTADO=$(ssh -o ConnectTimeout=20 "$VPS" 'docker ps --format "{{.Names}} {{.Status}}"')
echo "$ESTADO" | sed 's/^/  /'
echo "$ESTADO" | grep -qi restarting && erro "algum contêiner está reiniciando em loop"
SAUDE=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "http://${VPS#*@}:3001/health" || true)
[ "$SAUDE" = 200 ] && ok "health responde 200" || erro "health respondeu '$SAUDE'"
ssh -o ConnectTimeout=20 "$VPS" 'docker logs --tail 3 server-token-1 2>&1' | sed 's/^/  /'

[ "$falhou" = 0 ] && echo && echo "Publicado." || { echo; echo "PUBLICADO COM PROBLEMA — veja os ✗ acima."; exit 1; }

#!/usr/bin/env bash
# Instalador do servidor de voz do Cantinho do Vorcaro (Ubuntu 22.04/24.04).
# Uso, dentro da pasta server/ copiada para a máquina:   sudo bash instalar.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ "$(id -u)" -ne 0 ]; then echo "Rode com sudo: sudo bash instalar.sh"; exit 1; fi

echo "== Cantinho do Vorcaro: servidor de voz =="
IP_PUBLICO=$(curl -s https://api.ipify.org || curl -s https://ifconfig.me || echo "")
echo "IP público detectado: ${IP_PUBLICO:-desconhecido}"
echo
read -rp "Domínio apontando para este IP (deixe vazio para usar só o IP): " DOMINIO
read -rp "Senha que os amigos vão digitar no app: " SENHA
read -rp "Salas, separadas por vírgula [Geral,Jogos,Filmes]: " SALAS
SALAS=${SALAS:-Geral,Jogos,Filmes}
[ -z "$SENHA" ] && { echo "A senha não pode ficar vazia."; exit 1; }

# 1) Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "== Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
fi

# 2) Chaves do LiveKit
echo "== Gerando chaves..."
CHAVES=$(docker run --rm livekit/livekit-server:v1.9 generate-keys 2>/dev/null | tail -2)
API_KEY=$(echo "$CHAVES" | grep -i "api key" | awk '{print $NF}')
API_SECRET=$(echo "$CHAVES" | grep -i "api secret" | awk '{print $NF}')
[ -z "$API_KEY" ] && { echo "Não consegui gerar as chaves."; exit 1; }

# 3) Arquivos de configuração
if [ -n "$DOMINIO" ]; then
  PUBLIC_URL="wss://$DOMINIO"
  TURN_DOMAIN="$DOMINIO"
  COMPOSE="docker-compose.yml"
  sed "s/voz.SEUDOMINIO.com.br/$DOMINIO/g" Caddyfile.template > Caddyfile
else
  PUBLIC_URL="ws://$IP_PUBLICO:7880"
  TURN_DOMAIN="$IP_PUBLICO"
  COMPOSE="docker-compose.ip.yml"
fi

cat > .env <<ENV
PORT=3001
APP_PASSWORD=$SENHA
ROOMS=$SALAS
LIVEKIT_API_KEY=$API_KEY
LIVEKIT_API_SECRET=$API_SECRET
LIVEKIT_HOST=http://127.0.0.1:7880
LIVEKIT_PUBLIC_URL=$PUBLIC_URL
ENV

cat > livekit.yaml <<YAML
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50100
  use_external_ip: true
keys:
  $API_KEY: $API_SECRET
turn:
  enabled: true
  domain: $TURN_DOMAIN
  udp_port: 3478
  relay_range_start: 40000
  relay_range_end: 40100
room:
  auto_create: true
  empty_timeout: 120
  max_participants: 20
logging:
  level: info
YAML

# 4) Firewall da própria máquina (o do provedor você abre no painel)
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
  ufw allow 7880/tcp >/dev/null; ufw allow 7881/tcp >/dev/null; ufw allow 3001/tcp >/dev/null
  ufw allow 3478/udp >/dev/null; ufw allow 40000:40100/udp >/dev/null; ufw allow 50000:50100/udp >/dev/null
  ufw --force enable >/dev/null
fi
# Oracle Cloud bloqueia tudo no iptables da imagem; libera as mesmas portas
if iptables -L INPUT -n 2>/dev/null | grep -q "REJECT"; then
  for p in 80 443 7880 7881 3001; do iptables -I INPUT -p tcp --dport $p -j ACCEPT; done
  iptables -I INPUT -p udp --dport 3478 -j ACCEPT
  iptables -I INPUT -p udp --dport 40000:40100 -j ACCEPT
  iptables -I INPUT -p udp --dport 50000:50100 -j ACCEPT
  command -v netfilter-persistent >/dev/null && netfilter-persistent save >/dev/null || true
fi

# 5) Sobe tudo
echo "== Subindo os serviços..."
docker compose -f "$COMPOSE" up -d --build
sleep 5
echo
echo "================================================================"
if curl -sf http://127.0.0.1:3001/health >/dev/null; then
  echo "PRONTO. Passe para os amigos:"
  if [ -n "$DOMINIO" ]; then
    echo "  Servidor: $DOMINIO"
  else
    echo "  Servidor: $IP_PUBLICO:3001"
  fi
  echo "  Senha:    $SENHA"
  echo "  Salas:    $SALAS"
else
  echo "Algo não subiu. Veja os logs com:  docker compose -f $COMPOSE logs"
fi
echo "================================================================"
echo "Para mudar senha ou salas depois: edite .env e rode  docker compose -f $COMPOSE up -d"

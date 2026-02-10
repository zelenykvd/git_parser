#!/bin/bash
set -e

echo "=== Telegram Parser — Auto Deploy ==="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

APP_DIR="$(cd "$(dirname "$0")" && pwd)"

# ——— Docker ———
if command -v docker &>/dev/null; then
  ok "Docker installed"
else
  warn "Docker not found — installing..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  ok "Docker installed"
fi

# Verify Docker daemon is running
if docker info &>/dev/null; then
  ok "Docker daemon running"
else
  systemctl start docker
  sleep 3
  docker info &>/dev/null || fail "Cannot start Docker daemon"
  ok "Docker daemon started"
fi

# ——— Docker Compose (v2 plugin) ———
if docker compose version &>/dev/null; then
  ok "Docker Compose available"
else
  warn "Docker Compose plugin not found — installing..."
  apt-get update -qq && apt-get install -y -qq docker-compose-plugin
  ok "Docker Compose installed"
fi

# ——— Node.js ———
if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  ok "Node.js ${NODE_VER}"
else
  warn "Node.js not found — installing v20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
  ok "Node.js $(node -v) installed"
fi

# ——— npm dependencies ———
echo ""
echo "Installing dependencies..."
cd "$APP_DIR"
npm install --silent
ok "Backend dependencies"

if [ -d "admin" ]; then
  cd admin && npm install --silent
  echo "Building admin panel..."
  npm run build
  cd "$APP_DIR"
  ok "Admin panel built"
fi

# ——— Start containers ———
echo ""
echo "Starting Docker containers..."
cd "$APP_DIR"
docker compose up -d
ok "PostgreSQL + Nginx running"

# ——— Wait for Postgres ———
echo -n "Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if docker exec telegram_parser_db pg_isready -U parser &>/dev/null; then
    echo ""
    ok "PostgreSQL ready"
    break
  fi
  echo -n "."
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo ""
    fail "PostgreSQL did not start in 30s"
  fi
done

# ——— Prisma migrations ———
echo "Running database migrations..."
cd "$APP_DIR"
npx prisma migrate deploy 2>&1 | tail -3
npx prisma generate --no-hints 2>/dev/null
ok "Migrations complete"

# ——— systemd service ———
echo ""
echo "Setting up systemd service..."

NODE_PATH=$(which node)
NPX_PATH=$(which npx)
TSX_PATH="$APP_DIR/node_modules/.bin/tsx"

cat > /etc/systemd/system/telegram-parser.service <<EOF
[Unit]
Description=Telegram Parser & Translator
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
ExecStart=${TSX_PATH} src/launcher.ts
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PATH=${APP_DIR}/node_modules/.bin:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable telegram-parser
systemctl restart telegram-parser
ok "systemd service installed and started"

# ——— Summary ———
echo ""
echo "========================================="
echo -e "${GREEN}Deploy complete!${NC}"
echo ""
echo "App is running as a systemd service."
echo ""
echo "  Status:   systemctl status telegram-parser"
echo "  Logs:     journalctl -u telegram-parser -f"
echo "  Restart:  systemctl restart telegram-parser"
echo "  Stop:     systemctl stop telegram-parser"
echo ""
IP=$(hostname -I | awk '{print $1}')
echo "Open: http://${IP}"
echo "========================================="

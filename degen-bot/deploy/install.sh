#!/usr/bin/env bash
# Install degen-bot as a systemd service on a VPS.
# Run from the repo root or degen-bot directory:
#   sudo bash degen-bot/deploy/install.sh
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/degen-bot}"
SERVICE_USER="${SERVICE_USER:-degen}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18+ required. Install e.g. via NodeSource or nvm, then re-run."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "Node.js 18+ required (found $(node -v))"
  exit 1
fi

echo "==> Creating user $SERVICE_USER (if missing)"
if ! id "$SERVICE_USER" &>/dev/null; then
  useradd --system --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
fi

echo "==> Copying bot to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
rsync -a --delete \
  --exclude node_modules \
  --exclude data \
  --exclude .env \
  "$BOT_DIR/" "$INSTALL_DIR/"

chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/data"
chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/data"

if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
  chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/.env"
  chmod 600 "$INSTALL_DIR/.env"
  echo ""
  echo "Created $INSTALL_DIR/.env — edit it before starting:"
  echo "  DISCORD_USER_TOKEN, DEGEN_CHANNEL_ID, DEGEN_WATCH_USER_ID"
  echo "  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID"
  echo "  SOLANA_RPC_URL"
  echo ""
fi

echo "==> npm ci (production deps)"
cd "$INSTALL_DIR"
sudo -u "$SERVICE_USER" npm ci --omit=dev 2>/dev/null || sudo -u "$SERVICE_USER" npm ci

NODE_BIN="$(command -v node)"
# tsx is a devDependency — install it globally for the service if missing from prod install
if ! sudo -u "$SERVICE_USER" test -f "$INSTALL_DIR/node_modules/tsx/dist/cli.mjs"; then
  echo "==> Installing tsx for runtime"
  sudo -u "$SERVICE_USER" npm install tsx
fi
TSX_BIN="$INSTALL_DIR/node_modules/.bin/tsx"

echo "==> Installing systemd unit"
sed -e "s|/opt/degen-bot|$INSTALL_DIR|g" \
    -e "s|User=degen|User=$SERVICE_USER|g" \
    -e "s|ExecStart=.*|ExecStart=$NODE_BIN $TSX_BIN $INSTALL_DIR/src/index.ts|" \
    "$SCRIPT_DIR/degen-bot.service" > /etc/systemd/system/degen-bot.service

systemctl daemon-reload
systemctl enable degen-bot

echo ""
echo "Done. Next steps:"
echo "  1. Edit $INSTALL_DIR/.env"
echo "  2. sudo systemctl start degen-bot"
echo "  3. sudo journalctl -u degen-bot -f"
echo ""
echo "Status: sudo systemctl status degen-bot"

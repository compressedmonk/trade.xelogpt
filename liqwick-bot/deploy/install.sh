#!/usr/bin/env bash
# Install liqwick-bot as a systemd service + optional nginx dashboard proxy.
# Run on VPS as root:
#   sudo bash liqwick-bot/deploy/install.sh
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/liqwick-bot}"
SERVICE_USER="${SERVICE_USER:-liqwick}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_NGINX="${INSTALL_NGINX:-1}"
NGINX_SITE="${NGINX_SITE:-liqwick.conf}"
DASHBOARD_DOMAIN="${DASHBOARD_DOMAIN:-liqwick.xelogpt.com}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ required."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "Node.js 20+ required (found $(node -v))"
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
  echo "Created $INSTALL_DIR/.env — edit BINANCE_API_KEY/SECRET before live trading."
  echo ""
fi

echo "==> npm ci"
cd "$INSTALL_DIR"
sudo -u "$SERVICE_USER" npm ci --omit=dev 2>/dev/null || sudo -u "$SERVICE_USER" npm ci

if ! sudo -u "$SERVICE_USER" test -f "$INSTALL_DIR/node_modules/tsx/dist/cli.mjs"; then
  echo "==> Installing tsx for runtime"
  sudo -u "$SERVICE_USER" npm install tsx
fi

NODE_BIN="$(command -v node)"
TSX_BIN="$INSTALL_DIR/node_modules/.bin/tsx"

echo "==> Installing systemd unit"
sed -e "s|/opt/liqwick-bot|$INSTALL_DIR|g" \
    -e "s|User=t|User=$SERVICE_USER|g" \
    -e "s|ExecStart=.*|ExecStart=$NODE_BIN $TSX_BIN $INSTALL_DIR/src/index.ts|" \
    "$SCRIPT_DIR/liqwick-bot.service" > /etc/systemd/system/liqwick-bot.service

systemctl daemon-reload
systemctl enable liqwick-bot

if [[ "$INSTALL_NGINX" == "1" ]] && command -v nginx >/dev/null 2>&1; then
  echo "==> Installing nginx site ($DASHBOARD_DOMAIN -> 127.0.0.1:3850)"
  sed -e "s|liqwick.xelogpt.com|$DASHBOARD_DOMAIN|g" \
    "$SCRIPT_DIR/nginx-liqwick.conf" > "/etc/nginx/sites-available/$NGINX_SITE"
  ln -sf "/etc/nginx/sites-available/$NGINX_SITE" "/etc/nginx/sites-enabled/$NGINX_SITE"

  echo "==> Installing trade.xelogpt.com/liqwick/ snippet"
  cp "$SCRIPT_DIR/nginx-liqwick-snippet.conf" /etc/nginx/snippets/liqwick-dashboard.conf
  SOLTRADE_CONF="/etc/nginx/sites-enabled/soltrade.conf"
  if [[ -f "$SOLTRADE_CONF" ]] && ! grep -q 'liqwick-dashboard.conf' "$SOLTRADE_CONF"; then
    sed -i '/ssl_protocols/a \    include /etc/nginx/snippets/liqwick-dashboard.conf;' "$SOLTRADE_CONF"
  fi

  nginx -t
  systemctl reload nginx
fi

echo ""
echo "Done. Next steps:"
echo "  1. Edit $INSTALL_DIR/.env (DRY_RUN=true recommended initially)"
echo "  2. sudo systemctl restart liqwick-bot"
echo "  3. sudo journalctl -u liqwick-bot -f"
echo ""
echo "Dashboard: https://trade.xelogpt.com/liqwick/ (recommended)"
echo "           https://$DASHBOARD_DOMAIN/ (subdomain — needs DNS A/CNAME to VPS)"
echo "           http://127.0.0.1:3850 (localhost only)"
echo "Status: sudo systemctl status liqwick-bot"

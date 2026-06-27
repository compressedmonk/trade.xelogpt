#!/usr/bin/env bash
#
# Daily SQLite backup for the SolTrade web app DB.
# The DB lives on a host bind mount (see docker-compose.yml: /opt/soltrade/data).
#
# Usage:
#   ./scripts/backup-db.sh
#
# Recommended cron (keep, e.g., last 14 daily backups):
#   0 3 * * * /opt/soltrade/app/scripts/backup-db.sh >> /var/log/soltrade-backup.log 2>&1
#
set -euo pipefail

DB_PATH="${SOLTRADE_DB_PATH:-/opt/soltrade/data/dev.db}"
BACKUP_DIR="${SOLTRADE_BACKUP_DIR:-/opt/soltrade/backups}"
RETENTION_DAYS="${SOLTRADE_BACKUP_RETENTION_DAYS:-14}"

if [ ! -f "$DB_PATH" ]; then
  echo "[backup-db] DB not found at $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/dev-$STAMP.db"

# Use sqlite3's online backup if available (consistent snapshot), else cp.
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" ".backup '$DEST'"
else
  cp -a "$DB_PATH" "$DEST"
fi

gzip -f "$DEST"
echo "[backup-db] wrote ${DEST}.gz"

# Prune old backups.
find "$BACKUP_DIR" -name 'dev-*.db.gz' -mtime "+$RETENTION_DAYS" -delete
echo "[backup-db] pruned backups older than ${RETENTION_DAYS} days"

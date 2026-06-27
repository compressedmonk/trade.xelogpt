#!/usr/bin/env bash
# WAL-safe SQLite backup for liqwick.db (safe while bot is running).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DB_PATH="${DB_PATH:-$ROOT_DIR/data/liqwick.db}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/data/backups}"
RETENTION_DAYS="${JOURNAL_RETENTION_DAYS:-30}"

if [[ ! -f "$DB_PATH" ]]; then
  echo "Database not found: $DB_PATH" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required (apt install sqlite3)" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y-%m-%d)"
DEST="$BACKUP_DIR/liqwick-${STAMP}.db"

sqlite3 "$DB_PATH" ".backup '$DEST'"
echo "Backup written: $DEST"

if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && [[ "$RETENTION_DAYS" -gt 0 ]]; then
  find "$BACKUP_DIR" -name 'liqwick-*.db' -type f -mtime +"$RETENTION_DAYS" -delete
  echo "Removed backups older than ${RETENTION_DAYS} days"
fi

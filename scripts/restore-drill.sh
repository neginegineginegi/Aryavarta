#!/usr/bin/env bash
# Verified backup restore drill — the standing gate before any TCPD stage-2
# insert. A backup nobody has restored is a hope, not a backup, so this
# script proves the whole loop: dump the database at DATABASE_URL, restore
# the dump into a fresh sibling database, and compare exact per-table row
# counts on both sides. Exit 0 only when every table matches.
#
# The dump is kept (its path is printed): it is the recovery point the
# insert that follows relies on. Record the outcome, date, and diff in
# data/raw/tcpd/RESTORE_DRILL.md — the insert stage refuses to run without
# that record.
#
# ADMIN_URL (optional) is a connection URL allowed to CREATE/DROP DATABASE;
# it defaults to the same server's postgres database with the same
# credentials, which suffices where the app role owns its server (dev).
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must be set}"

STAMP=$(date -u +%Y%m%d-%H%M%S)
DRILL_DB="abhilekh_restore_drill"
BACKUP_DIR="${BACKUP_DIR:-data/backups}"
DUMP="${BACKUP_DIR}/abhilekh-${STAMP}.dump"

SERVER_URL="${DATABASE_URL%/*}"
DRILL_URL="${SERVER_URL}/${DRILL_DB}"
ADMIN_URL="${ADMIN_URL:-${SERVER_URL}/postgres}"

mkdir -p "$BACKUP_DIR"

echo "[drill] dumping $(echo "$DATABASE_URL" | sed 's|//[^@]*@|//…@|') -> ${DUMP}"
pg_dump -Fc -f "$DUMP" "$DATABASE_URL"
echo "[drill] dump size: $(du -h "$DUMP" | cut -f1)"

echo "[drill] recreating ${DRILL_DB}"
psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS ${DRILL_DB}"
psql "$ADMIN_URL" -q -c "CREATE DATABASE ${DRILL_DB}"

echo "[drill] restoring into ${DRILL_DB}"
pg_restore --no-owner --no-privileges -d "$DRILL_URL" "$DUMP"

counts() {
  local url="$1" out="$2"
  : > "$out"
  psql "$url" -tA -c \
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1" |
  while read -r t; do
    [ -z "$t" ] && continue
    n=$(psql "$url" -tA -c "SELECT count(*) FROM \"$t\"")
    echo "$t|$n" >> "$out"
  done
}

SRC_COUNTS=$(mktemp) DRILL_COUNTS=$(mktemp)
echo "[drill] counting rows on both sides (exact count(*), not estimates)"
counts "$DATABASE_URL" "$SRC_COUNTS"
counts "$DRILL_URL" "$DRILL_COUNTS"

echo "[drill] per-table counts (source):"
awk -F'|' '{ printf "  %-32s %s\n", $1, $2 }' "$SRC_COUNTS"

if diff -u "$SRC_COUNTS" "$DRILL_COUNTS" > /tmp/drill-diff.txt; then
  echo "[drill] VERIFIED: every table's row count matches between source and restored copy."
  echo "[drill] recovery point kept at ${DUMP}"
  # The marker the stage-2 insert scripts read (docs/PRODUCTION_RUNBOOK.md):
  # a backup is only trusted when THIS script verified its restore, within
  # the last 24 hours, against the same database label. Never an env var.
  DB_LABEL=$(echo "$DATABASE_URL" | sed 's|//[^@]*@|//…@|')
  TABLES=$(wc -l < "$SRC_COUNTS")
  cat > "${BACKUP_DIR}/LAST_VERIFIED_RESTORE.json" <<MARKER
{
  "verified_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "database_label": "${DB_LABEL}",
  "dump_path": "${DUMP}",
  "tables": ${TABLES}
}
MARKER
  echo "[drill] marker written: ${BACKUP_DIR}/LAST_VERIFIED_RESTORE.json"
  psql "$ADMIN_URL" -q -c "DROP DATABASE ${DRILL_DB}"
  exit 0
else
  echo "[drill] FAILED: row counts differ:"
  cat /tmp/drill-diff.txt
  echo "[drill] the drill database ${DRILL_DB} is kept for inspection."
  exit 1
fi

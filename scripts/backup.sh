#!/usr/bin/env bash
# Sprint 8b: backs up the console's SQLite DB, OME's config, .env, and
# docker-compose.yml. Does NOT back up recordings/vod (see BACKUP.md) —
# those are large/high-churn and deliberately kept off root fs.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

RETENTION_COUNT=14
STAMP="$(date +%Y-%m-%d_%H%M%S)"
BACKUP_DIR="$REPO_ROOT/backups/$STAMP"
CONTAINER_DB_TMP="/tmp/console-backup-$STAMP.sqlite"

mkdir -p "$BACKUP_DIR"

echo "==> Backing up console.sqlite (WAL-safe, via better-sqlite3's own .backup())"
docker exec console node -e "
const Database = require('better-sqlite3');
const db = new Database(process.env.DATABASE_PATH || '/app/data/console.sqlite');
db.backup('$CONTAINER_DB_TMP').then(() => { db.close(); process.exit(0); })
  .catch((err) => { console.error(err); process.exit(1); });
"
docker cp "console:$CONTAINER_DB_TMP" "$BACKUP_DIR/console.sqlite"
docker exec console rm -f "$CONTAINER_DB_TMP"

echo "==> Copying config and secrets"
cp ome/conf/Server.xml "$BACKUP_DIR/Server.xml"
cp ome/conf/Logger.xml "$BACKUP_DIR/Logger.xml"
cp docker-compose.yml "$BACKUP_DIR/docker-compose.yml"
cp .env "$BACKUP_DIR/.env"

echo "==> Verifying the backed-up database"
python3 - "$BACKUP_DIR/console.sqlite" <<'EOF'
import sqlite3, sys
conn = sqlite3.connect(sys.argv[1])
result = conn.execute("PRAGMA integrity_check").fetchone()[0]
if result != "ok":
    print(f"integrity check FAILED: {result}", file=sys.stderr)
    sys.exit(1)
print(f"integrity check ok, {conn.execute('SELECT COUNT(*) FROM audit').fetchone()[0]} audit rows")
EOF

ARCHIVE="$REPO_ROOT/backups/console-backup-$STAMP.tar.gz"
tar czf "$ARCHIVE" -C "$REPO_ROOT/backups" "$STAMP"
chmod 600 "$ARCHIVE"
rm -rf "$BACKUP_DIR"
echo "==> Wrote $ARCHIVE"

echo "==> Pruning backups beyond the last $RETENTION_COUNT"
# shellcheck disable=SC2012
ls -1t "$REPO_ROOT"/backups/console-backup-*.tar.gz 2>/dev/null | tail -n +$((RETENTION_COUNT + 1)) | xargs -r rm -f

echo "Done."

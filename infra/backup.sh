#!/usr/bin/env bash
# Nightly backup on the VM: WAL checkpoint + consistent SQLite copy (`.backup`, safe while the app runs) + subs/ + jobs/
# into one tarball under DATA_DIR/backups (mode 600 — it contains live invite / Stremio tokens), keeping the newest 14.
# The app also writes its own lumen-YYYYMMDD.sqlite there at 03:15; this script is the off-process, cron-driven
# safety net and the one to copy off the VM.
#
#   DATA_DIR=/opt/lumen/data infra/backup.sh            # one run
#   crontab -e →  30 3 * * * DATA_DIR=/opt/lumen/data /opt/lumen/infra/backup.sh >> /opt/lumen/data/backups/backup.log 2>&1
#   restore (README-deploy-vi.md §7): docker compose stop app → rm -f data/lumen.sqlite-wal data/lumen.sqlite-shm
#            → tar -xzf <tarball> lumen.sqlite → cp over data/lumen.sqlite → chown 1000:1000 → docker compose start app
set -euo pipefail

DATA_DIR="${DATA_DIR:-/opt/lumen/data}"
COMPOSE_DIR="${COMPOSE_DIR:-$(dirname "$DATA_DIR")}"
KEEP="${KEEP:-14}"
OUT="${DATA_DIR}/backups"
STAMP="$(date +%Y%m%d)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT"
[[ -f "${DATA_DIR}/lumen.sqlite" ]] || { echo "no database at ${DATA_DIR}/lumen.sqlite" >&2; exit 1; }

# sqlite3 CLI on the host (cloud-init installs it); fall back to the app container's node if missing
if command -v sqlite3 >/dev/null; then
  sqlite3 "${DATA_DIR}/lumen.sqlite" "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null
  sqlite3 "${DATA_DIR}/lumen.sqlite" ".backup '${WORK}/lumen.sqlite'"
else
  APP="$(docker compose -f "${COMPOSE_DIR}/docker-compose.yml" ps -q app 2>/dev/null | head -1)"
  [[ -n "$APP" ]] || { echo "sqlite3 missing and the compose app service is not running (COMPOSE_DIR=${COMPOSE_DIR})" >&2; exit 1; }
  docker exec "$APP" node -e "const d=require('better-sqlite3')('/data/lumen.sqlite');d.pragma('wal_checkpoint(TRUNCATE)');d.backup('/data/backups/.tmp-${STAMP}.sqlite').then(()=>{d.close();process.exit(0)})"
  mv "${OUT}/.tmp-${STAMP}.sqlite" "${WORK}/lumen.sqlite"
fi
for d in subs jobs; do [[ -d "${DATA_DIR}/${d}" ]] && cp -r "${DATA_DIR}/${d}" "${WORK}/" || true; done

TARBALL="${OUT}/lumen-${STAMP}.tar.gz"
tar -czf "$TARBALL" -C "$WORK" .
chmod 600 "$TARBALL"
# keep the newest KEEP tarballs / app snapshots (by date in the name, not mtime). `|| true`: under pipefail an unmatched
# glob makes `ls` exit 2 (no app snapshot yet) and would fail the whole backup — and deploy.sh with it — after the tarball was written
ls -1 "$OUT"/lumen-*.tar.gz 2>/dev/null | sort | head -n -"$KEEP" | xargs -r rm -f || true
ls -1 "$OUT"/lumen-*.sqlite 2>/dev/null | sort | head -n -"$KEEP" | xargs -r rm -f || true
echo "$(date -Is) wrote ${TARBALL} ($(du -h "$TARBALL" | cut -f1)); $(ls "$OUT"/lumen-*.tar.gz | wc -l) tarball(s) kept"

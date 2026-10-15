#!/usr/bin/env bash
# Deploys Lumen to the VM over SSH: rsync the repo (no node_modules / .next / data), copy .env (mode 600), make ./data
# 1000:1000 mode 700 (the container user), back the database up (default), build the image on the VM, run the SQLite
# migration in a one-off container BEFORE the running app is replaced, `docker compose up -d`, wait for the health check,
# then check https://APP_DOMAIN/api/health. Re-run for every update. Prints the rollback recipe at the end.
#
#   VM_HOST=1.2.3.4 [VM_USER=lumen] [APP_DIR=/opt/lumen] [ENV_FILE=.env] infra/deploy.sh [--no-build] [--no-backup]
#
# Requires: ssh key access to the VM (infra/azure/create-vm.sh), rsync + ssh on this machine (Git Bash / WSL / macOS).
set -euo pipefail

VM_HOST="${VM_HOST:?set VM_HOST=<public ip or hostname>}"
VM_USER="${VM_USER:-lumen}"
APP_DIR="${APP_DIR:-/opt/lumen}"
ENV_FILE="${ENV_FILE:-.env}"
BUILD=1
BACKUP=1
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    --no-backup) BACKUP=0 ;;
    --backup-first) BACKUP=1 ;; # kept for old notes: backups are the default now
    *) echo "unknown option $arg" >&2; exit 2 ;;
  esac
done
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -f "$ROOT/$ENV_FILE" ]] || { echo "missing $ENV_FILE (cp .env.example $ENV_FILE and fill it in)" >&2; exit 2; }

# fail fast: every key the HTTPS stack needs must be present and non-empty
envval() { grep -E "^$1=" "$ROOT/$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true; }
MISSING=()
for key in APP_URL APP_DOMAIN ACME_EMAIL SESSION_SECRET ADMIN_USERNAME ADMIN_PASSWORD; do
  [[ -n "$(envval "$key")" ]] || MISSING+=("$key")
done
[[ ${#MISSING[@]} -eq 0 ]] || { echo "$ENV_FILE is missing required keys: ${MISSING[*]}" >&2; exit 2; }
[[ "$(envval APP_URL)" == "https://$(envval APP_DOMAIN)" ]] || echo "note: APP_URL ($(envval APP_URL)) should normally be https://$(envval APP_DOMAIN)"
grep -q '^LUMEN_SCENARIOS=0' "$ROOT/$ENV_FILE" || echo "note: LUMEN_SCENARIOS is pinned to 0 by docker-compose.yml regardless of $ENV_FILE"
DOMAIN="$(envval APP_DOMAIN)"
PREV_COMMIT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo '<previous commit>')"
SSH=(ssh -o StrictHostKeyChecking=accept-new "${VM_USER}@${VM_HOST}")
rollback_hint() {
  cat <<EOF
Rollback: git checkout <previous commit> (this deploy was ${PREV_COMMIT}) && VM_HOST=${VM_HOST} infra/deploy.sh --no-backup
          database: see infra/README-deploy-vi.md §7 (stop app → remove -wal/-shm → copy the backup from ${APP_DIR}/data/backups → start)
EOF
}
trap '[[ $? -eq 0 ]] || { echo "deploy failed" >&2; rollback_hint >&2; }' EXIT

echo "== 1/6 sync sources → ${VM_USER}@${VM_HOST}:${APP_DIR}"
EXCLUDES=(node_modules .next data qa .git '.env*' tsconfig.tsbuildinfo spikes plans)
if command -v rsync >/dev/null 2>&1; then
  RSYNC_EX=(); for e in "${EXCLUDES[@]}"; do RSYNC_EX+=(--exclude "$e"); done
  rsync -az --delete "${RSYNC_EX[@]}" -e "ssh -o StrictHostKeyChecking=accept-new" "$ROOT/" "${VM_USER}@${VM_HOST}:${APP_DIR}/"
else
  # Windows Git Bash has no rsync: stream a tarball over ssh instead (no --delete; stale files are harmless, the image is rebuilt from scratch)
  echo "   (rsync not found - using tar over ssh)"
  TAR_EX=(); for e in "${EXCLUDES[@]}"; do TAR_EX+=(--exclude="./$e"); done
  "${SSH[@]}" "sudo install -d -o ${VM_USER} -g ${VM_USER} ${APP_DIR}"
  (cd "$ROOT" && tar czf - "${TAR_EX[@]}" .) | "${SSH[@]}" "tar xzf - -C ${APP_DIR}"
fi
echo "== 2/6 copy ${ENV_FILE} (chmod 600) + data dir owned by uid 1000 (container user), mode 700"
scp -q -o StrictHostKeyChecking=accept-new "$ROOT/$ENV_FILE" "${VM_USER}@${VM_HOST}:${APP_DIR}/.env"
"${SSH[@]}" "chmod 600 ${APP_DIR}/.env && sudo install -d -m 700 -o 1000 -g 1000 ${APP_DIR}/data && sudo chown -R 1000:1000 ${APP_DIR}/data"

if [[ $BACKUP -eq 1 ]]; then
  echo "== 3/6 backup before deploy"
  "${SSH[@]}" "cd ${APP_DIR} && if [[ -f data/lumen.sqlite ]]; then DATA_DIR=${APP_DIR}/data sudo -E bash infra/backup.sh; else echo 'no database yet — nothing to back up'; fi"
else
  echo "== 3/6 backup skipped (--no-backup)"
fi

echo "== 4/6 build image"
if [[ $BUILD -eq 1 ]]; then
  "${SSH[@]}" "cd ${APP_DIR} && docker compose build --pull app"
else
  echo "   (--no-build: reusing the image on the VM)"
fi

echo "== 5/6 migrate in a one-off container (the running app keeps serving until this succeeds)"
"${SSH[@]}" "cd ${APP_DIR} && docker compose run --rm --no-deps -T app node migrate.cjs"

echo "== 6/6 switch containers + wait for the health check"
"${SSH[@]}" "cd ${APP_DIR} && docker compose up -d --remove-orphans"
STATUS=starting
for i in $(seq 1 30); do
  STATUS="$("${SSH[@]}" "docker inspect --format '{{.State.Health.Status}}' \$(cd ${APP_DIR} && docker compose ps -q app)" 2>/dev/null || echo starting)"
  [[ "$STATUS" == "healthy" ]] && break
  sleep 5
done
[[ "$STATUS" == "healthy" ]] || { echo "app container not healthy: docker compose logs app" >&2; "${SSH[@]}" "cd ${APP_DIR} && docker compose logs --tail 50 app"; exit 1; }
"${SSH[@]}" "cd ${APP_DIR} && docker image prune -f >/dev/null"

if [[ "$DOMAIN" != "localhost" ]]; then
  for i in $(seq 1 12); do
    if curl -fsS --max-time 10 "https://${DOMAIN}/api/health" >/dev/null 2>&1; then
      echo "https://${DOMAIN}/api/health OK"
      curl -sI "https://${DOMAIN}/" | grep -i -E 'x-robots-tag|strict-transport' || true
      rollback_hint
      exit 0
    fi
    sleep 10 # first run: Caddy is still obtaining the certificate
  done
  echo "https://${DOMAIN}/api/health not reachable yet — DNS propagated? port 80/443 open? docker compose logs caddy" >&2
  exit 1
fi
"${SSH[@]}" "curl -fsS http://127.0.0.1:3000/api/health" && echo && echo "app healthy on the VM (APP_DOMAIN=localhost → no public check)"
rollback_hint

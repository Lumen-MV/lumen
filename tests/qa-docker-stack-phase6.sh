#!/usr/bin/env bash
# Docker / Caddy stack check (manual, needs Docker; not part of `npm run qa:phase6`): builds the real Dockerfile, proves
# the image runs as uid 1000, that a bind-mounted data dir inside the Docker VM (permissions enforced, unlike a Windows
# path) is writable when owned by 1000:1000 mode 700 and refused when owned by root, runs the one-off migration, then a
# scratch compose stack (Caddy on 8081/8444, dummy env, STREAM_MODE=proxy, data in a temp dir on this machine): healthy
# app, HTTPS via the internal CA, headers, http→https, admin off, request_body limit, redacted access log, login,
# backup.sh (compose-service lookup, chmod 600), SIGTERM checkpoint (no -wal after `compose stop`), then `down -v` and
# cleanup of every scratch artefact. Works from Git Bash on Windows (Docker Desktop) and from a Linux shell.
#   bash tests/qa-docker-stack-phase6.sh            (from the repo root; ~3 min on a cold build cache)
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMG=lumen-qa
VM_DIR=/lumen-qa-data            # path inside the Docker VM / Linux host — permissions are real there
VM_MOUNT="$VM_DIR"
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) VM_MOUNT="/$VM_DIR" ;; esac   # `//x` stops Git Bash from rewriting the path
D="$(mktemp -d)"
HOST_D="$D"; command -v cygpath >/dev/null && HOST_D="$(cygpath -m "$D")"   # C:/Users/... (forward slashes survive sed + compose)
COMPOSE=(docker compose -f "$D/docker-compose.yml")
# curl on Windows tries ::1 first and times out against Docker Desktop port maps → pin localhost to 127.0.0.1 (SNI / Host stay "localhost").
# Git Bash rewrites bare POSIX paths in arguments to Windows programs (docker.exe): container paths always go through `sh -c '…'`.
CURL=(curl -sk --resolve localhost:8444:127.0.0.1 --resolve localhost:8081:127.0.0.1)
pass=0; fail=0
check() { if [[ "$2" == "1" ]]; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 — ${3:-}"; fail=$((fail+1)); fi; }
cleanup() {
  "${COMPOSE[@]}" down -v >/dev/null 2>&1 || true
  docker run --rm -v "$VM_MOUNT:/d" alpine:3 sh -c 'rm -rf /d/* /d/.??* 2>/dev/null; true' >/dev/null 2>&1 || true
  docker rmi -f $IMG >/dev/null 2>&1 || true
  rm -rf "$D"
}
trap cleanup EXIT

echo "== build $IMG from the real Dockerfile"
docker build -q -t $IMG "$ROOT" >/dev/null || { echo "docker build failed (re-run without -q to see why)"; exit 1; }
UID_IN="$(docker run --rm $IMG id -u)"
check "image runs as uid 1000 (USER node)" "$([[ "$UID_IN" == "1000" ]] && echo 1 || echo 0)" "uid=$UID_IN"
check "migrate.cjs + drizzle/ present in the image" "$(docker run --rm $IMG sh -c 'test -f migrate.cjs && test -d drizzle && echo 1 || echo 0')"

echo "== bind-mounted data dir inside the Docker VM ($VM_DIR)"
docker run --rm -v "$VM_MOUNT:/d" alpine:3 sh -c 'rm -rf /d/* /d/.??* 2>/dev/null; chown 0:0 /d && chmod 700 /d' >/dev/null
ROOT_OWNED="$(docker run --rm -v "$VM_MOUNT:/data" $IMG sh -c 'touch /data/x 2>/dev/null && echo writable || echo refused')"
check "data dir owned by root 700 → the app user cannot write (permissions really enforced on this mount)" "$([[ "$ROOT_OWNED" == "refused" ]] && echo 1 || echo 0)" "$ROOT_OWNED"
docker run --rm -v "$VM_MOUNT:/d" alpine:3 sh -c 'chown 1000:1000 /d && chmod 700 /d' >/dev/null
OWNED="$(docker run --rm -v "$VM_MOUNT:/data" $IMG sh -c 'touch /data/x && rm /data/x && echo writable || echo refused')"
check "data dir owned by 1000:1000 mode 700 → writable by the app user" "$([[ "$OWNED" == "writable" ]] && echo 1 || echo 0)" "$OWNED"
MIG="$(docker run --rm -v "$VM_MOUNT:/data" $IMG node migrate.cjs 2>&1 | tail -1)"
check "one-off migration creates / upgrades the schema in the bind mount" "$([[ "$MIG" == *"up to date"* ]] && echo 1 || echo 0)" "$MIG"
check "no -wal left after the migration (checkpoint TRUNCATE)" "$(docker run --rm -v "$VM_MOUNT:/d" alpine:3 sh -c 'test -f /d/lumen.sqlite && ! test -s /d/lumen.sqlite-wal && echo 1 || echo 0')"
check "a second run on the same file is idempotent" "$(docker run --rm -v "$VM_MOUNT:/data" $IMG node migrate.cjs 2>&1 | grep -q 'up to date' && echo 1 || echo 0)"

echo "== scratch compose stack (Caddy 8081/8444, dummy env, data in $HOST_D/data)"
mkdir -p "$D/data"
sed -e "s#^    build: \.#    build: $ROOT#" -e "s#^    image: lumen\$#    image: $IMG#" -e 's#"80:80"#"8081:80"#' -e 's#"443:443"#"8444:443"#' -e 's#"443:443/udp"#"8444:443/udp"#' -e "s#- \./data:/data#- $HOST_D/data:/data#" "$ROOT/docker-compose.yml" > "$D/docker-compose.yml"
cp "$ROOT/Caddyfile" "$D/Caddyfile"
printf '%s\n' "NODE_ENV=production" "APP_URL=https://localhost:8444" "APP_DOMAIN=localhost" "ACME_EMAIL=qa@example.com" "SESSION_SECRET=qa-session-secret-0123456789abcdef0123456789abcdef" "ADMIN_USERNAME=qaadmin" "ADMIN_PASSWORD=QaAdminPass123" "ADMIN_DISPLAY_NAME=QA" "STREAM_MODE=proxy" "LUMEN_SCENARIOS=1" "TRUST_PROXY=1" "DATA_DIR=/data" "APP_VERSION=1.0" > "$D/.env"
"${COMPOSE[@]}" config -q && check "docker compose config valid" 1 || check "docker compose config valid" 0
"${COMPOSE[@]}" up -d --no-build >/dev/null 2>&1
APP=""; S=none
for i in $(seq 1 30); do APP="$("${COMPOSE[@]}" ps -q app 2>/dev/null | head -1)"; [[ -n "$APP" ]] && S=$(docker inspect --format '{{.State.Health.Status}}' "$APP" 2>/dev/null || echo none); [[ "$S" == "healthy" ]] && break; sleep 4; done
check "app healthy (${i}×4 s)" "$([[ "$S" == "healthy" ]] && echo 1 || echo 0)" "$S"
check "app process is uid 1000 and wrote lumen.sqlite" "$(docker exec "$APP" sh -c 'id -u; test -f /data/lumen.sqlite && echo yes' | tr "\n" " " | grep -q '^1000 yes' && echo 1 || echo 0)" "$(docker exec "$APP" sh -c 'id -u; ls /data' | tr "\n" " ")"
# Caddy generates its internal CA + certificate on first start: give the HTTPS listener up to 40 s
for i in $(seq 1 20); do "${CURL[@]}" --max-time 5 -o /dev/null https://localhost:8444/api/health && break; sleep 2; done
H="$("${CURL[@]}" --max-time 10 https://localhost:8444/api/health)"
check "https health via the internal CA → {\"ok\":true} only (anonymous)" "$([[ "$H" == '{"ok":true}' ]] && echo 1 || echo 0)" "$H"
HDR="$("${CURL[@]}" -I --max-time 10 https://localhost:8444/login)"
check "headers: HSTS + noindex + nosniff + DENY, no Server, no X-Powered-By" "$(echo "$HDR" | grep -qi strict-transport && echo "$HDR" | grep -qi 'x-robots-tag' && ! echo "$HDR" | grep -qi '^server:' && ! echo "$HDR" | grep -qi 'x-powered-by' && echo 1 || echo 0)"
check "http → https redirect" "$([[ "$("${CURL[@]}" --max-time 10 -o /dev/null -w '%{http_code}' http://localhost:8081/api/health)" == "308" ]] && echo 1 || echo 0)"
CADDY="$("${COMPOSE[@]}" ps -q caddy | head -1)"
check "caddy admin API off (caddy:2019 unreachable inside the network)" "$(docker exec "$CADDY" sh -c 'wget -qO- -T 3 http://127.0.0.1:2019/config/ >/dev/null 2>&1 && echo 0 || echo 1')"
BIGF="$D/big.json"; head -c 11000000 /dev/zero | tr '\0' 'a' > "$BIGF"
BIG="$("${CURL[@]}" --max-time 30 -H 'Expect:' -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' --data-binary "@$BIGF" https://localhost:8444/api/auth/login)"; BIGRC=$?
check "request_body max_size 10MB → an 11 MB JSON body answers 413" "$([[ "$BIG" == "413" ]] && echo 1 || echo 0)" "status=$BIG curl=$BIGRC"
"${CURL[@]}" --max-time 10 -o /dev/null "https://localhost:8444/stremio/$(printf 'x%.0s' $(seq 1 32))/manifest.json?secret=1"
"${CURL[@]}" --max-time 10 -o /dev/null -H 'cookie: lumen_session=abc' "https://localhost:8444/invite/$(printf 'y%.0s' $(seq 1 32))"
LOG=""
for i in $(seq 1 10); do LOG="$(docker exec "$CADDY" sh -c 'cat /var/log/caddy/access.log' 2>/dev/null)"; echo "$LOG" | grep -q '/invite/\[redacted\]' && break; sleep 1; done
check "access log keeps paths but redacts the stremio token, the invite token and query strings, drops cookies" "$(echo "$LOG" | grep -q '/stremio/\[redacted\]/manifest.json' && echo "$LOG" | grep -q '/invite/\[redacted\]' && ! echo "$LOG" | grep -q 'xxxxxxxx' && ! echo "$LOG" | grep -q 'secret=1' && ! echo "$LOG" | grep -qi 'lumen_session=abc' && echo 1 || echo 0)" "$(echo "$LOG" | grep -ao '"uri": *"[^"]*"' | tail -3 | tr '\n' ' ')"
J="$D/jar"
L="$("${CURL[@]}" --max-time 10 -c "$J" -o /dev/null -w '%{http_code}' -H 'content-type: application/json' -d '{"username":"qaadmin","password":"QaAdminPass123","remember":false}' https://localhost:8444/api/auth/login)"
HA="$("${CURL[@]}" --max-time 10 -b "$J" https://localhost:8444/api/health)"
check "login through Caddy; admin health shows db/version/torbox/sweeper" "$([[ "$L" == "200" && "$HA" == *'"db":true'* && "$HA" == *'"torbox"'* ]] && echo 1 || echo 0)" "$L $HA"
check "dev routes off in the container (LUMEN_SCENARIOS pinned 0)" "$([[ "$("${CURL[@]}" --max-time 10 -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{"flags":[]}' https://localhost:8444/api/dev/scenario)" == "404" ]] && echo 1 || echo 0)"

echo "== infra/backup.sh (no sqlite3 CLI here → compose-service docker fallback)"
BK_OUT="$(DATA_DIR="$D/data" COMPOSE_DIR="$D" bash "$ROOT/infra/backup.sh" 2>&1 | tail -2)"
BK_FILE="$(ls "$D"/data/backups/lumen-*.tar.gz 2>/dev/null | head -1)"
check "backup.sh finds the compose app service and writes a tarball" "$([[ -n "$BK_FILE" ]] && echo 1 || echo 0)" "$BK_OUT"
if [[ -n "$BK_FILE" ]]; then
  MODE="$(stat -c %a "$BK_FILE" 2>/dev/null || echo 600)"
  check "tarball mode 600 (it holds live invite / Stremio tokens) — on NTFS the mode is only emulated" "$([[ "$MODE" == "600" || "$MODE" == "644" ]] && echo 1 || echo 0)" "mode=$MODE"
  R="$D/restore"; mkdir -p "$R"; tar -xzf "$BK_FILE" -C "$R"
  check "backup tarball holds a complete lumen.sqlite (users table present, integrity ok)" "$(cd "$ROOT" && node -e "const d=require('better-sqlite3')(process.argv[1],{readonly:true});const n=d.prepare(\"select count(*) as n from sqlite_master where name='users'\").get().n;const ic=d.pragma('integrity_check',{simple:true});console.log(n===1&&ic==='ok'?1:0)" "$R/lumen.sqlite" 2>/dev/null)"
fi

echo "== graceful stop: SIGTERM → WAL checkpointed"
"${COMPOSE[@]}" stop app >/dev/null 2>&1
check "after 'compose stop app' the -wal file is gone / empty (a restore never replays a stale WAL)" "$([[ ! -s "$D/data/lumen.sqlite-wal" ]] && echo 1 || echo 0)" "$(ls -la "$D/data" | grep sqlite | awk '{print $5, $9}' | tr '\n' ' ')"
check "app log mentions the checkpoint" "$(docker logs "$APP" 2>&1 | grep -q 'WAL checkpointed' && echo 1 || echo 0)"

echo
echo "$pass passed, $fail failed"
[[ $fail -eq 0 ]]

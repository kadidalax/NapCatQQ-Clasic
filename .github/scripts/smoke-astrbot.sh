#!/usr/bin/env bash
# License: see repository LICENSE (NapCat Limited Redistribution License).
# Maintainer: kadidalax. No real QQ account or message delivery is tested here.
set -euo pipefail
: "${LOCAL_IMAGE:?LOCAL_IMAGE is required}"
: "${PLATFORM:?PLATFORM is required}"
case "$PLATFORM" in linux/amd64|linux/arm64) ;; *) echo 'Unsupported joint smoke platform'; exit 1 ;; esac
project="clasic-astrbot-smoke-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-${PLATFORM##*/}"
export NAPCAT_IMAGE="$LOCAL_IMAGE"
export DOCKER_DEFAULT_PLATFORM="$PLATFORM"
export ASTRBOT_IMAGE="${ASTRBOT_IMAGE:-soulter/astrbot:v4.29.4@sha256:72f341f0ffcf6621ef820277642c5d63955f7beeac3683433ce09cac96379c78}"
export WEBUI_TOKEN="clasic-joint-smoke-${GITHUB_RUN_ID:-local}-webui-token"
export MODE=astrbot ONEBOT_WS_URL=ws://astrbot:6199/ws
export ONEBOT_ACCESS_TOKEN="clasic-joint-smoke-${GITHUB_RUN_ID:-local}-protocol-token"
export ASTRBOT_DASHBOARD_INITIAL_PASSWORD="ClasicCiInitialPassword123-${GITHUB_RUN_ID:-local}"
export WEBUI_BIND=127.0.0.1 WEBUI_PORT=0 ASTRBOT_DASHBOARD_BIND=127.0.0.1 ASTRBOT_DASHBOARD_PORT=0 QQ_ACCOUNT=
compose=(docker compose -p "$project" -f astrbot.yml)
cleanup() {
  result=$?
  if [ "$result" -ne 0 ]; then "${compose[@]}" logs --no-color || true; fi
  "${compose[@]}" down --volumes --remove-orphans || true
  exit "$result"
}
trap cleanup EXIT
"${compose[@]}" config -q
docker pull --platform "$PLATFORM" "$ASTRBOT_IMAGE"
# Seed old global/account fixtures through a throwaway non-root Classic process,
# before the real entrypoint runs. This checks account precedence and migration.
"${compose[@]}" run --rm --no-deps --pull never --entrypoint node napcat -e '
const fs = require("node:fs");
fs.mkdirSync("/app/napcat/config", {recursive:true});
fs.writeFileSync("/app/napcat/config/onebot11.json", JSON.stringify({operatorGlobal:"preserved", network:{httpServers:[{name:"keep-global",enable:false,port:4300}],websocketClients:[{name:"rws",url:"ws://astrbot:6199/ws",token:"legacy-global-token"}]}}));
fs.writeFileSync("/app/napcat/config/onebot11_123456789.json", `// valid old JSON5 account fixture\n{operatorAccount:"preserved",network:{httpClients:[{name:"keep-account",enable:false,url:"http://example.invalid"}],websocketClients:[{name:"rws",url:"ws://astrbot:6199/ws",token:"legacy-account-token",}],},}\n`);
'
"${compose[@]}" up -d --no-build --pull never
wait_ready() {
  local service="$1" container running status
  container="$("${compose[@]}" ps -q "$service")"
  [ -n "$container" ] || { echo "Missing joint container: $service"; return 1; }
  for attempt in $(seq 1 180); do
    running="$(docker inspect --format '{{.State.Running}}' "$container")"
    status="$(docker inspect --format '{{.State.Health.Status}}' "$container")"
    [ "$running" = true ] || { echo "Joint process exited: $service"; return 1; }
    if [ "$status" = healthy ]; then return 0; fi
    sleep 2
  done
  echo "Joint service did not become healthy within 360 seconds: $service"
  return 1
}
wait_ready astrbot
wait_ready napcat
"${compose[@]}" exec -T astrbot python -c 'import urllib.request; response=urllib.request.urlopen("http://127.0.0.1:6185/", timeout=10); assert response.status == 200; print("AstrBot fresh dashboard HTTP 200 PASS")'
# Publish only our dedicated fixture directory/files; never chmod an entire data
# tree or private configuration. A root-owned 0600 file stays unreadable to 1000.
"${compose[@]}" exec -T astrbot python -c 'import os, tempfile; from pathlib import Path; directory=Path("/AstrBot/data/ci-media"); directory.mkdir(mode=0o755,exist_ok=True); directory.chmod(0o755); public=directory/"published.txt"; public.write_text("shared-published-media",encoding="utf8"); public.chmod(0o644); descriptor,temporary=tempfile.mkstemp(dir=directory); os.write(descriptor,b"private-fixture"); os.close(descriptor); os.replace(temporary,directory/"private.txt")'
"${compose[@]}" exec -T napcat node /usr/local/lib/napcatqq-clasic/assert-ready.mjs
"${compose[@]}" exec -T napcat node /usr/local/lib/napcatqq-clasic/assert-joint-ready.mjs
"${compose[@]}" restart napcat
wait_ready napcat
"${compose[@]}" exec -T napcat node /usr/local/lib/napcatqq-clasic/assert-joint-ready.mjs
echo "NapCatQQ-clasic/AstrBot joint smoke PASS: $PLATFORM; dashboards; JSON5 global/account migration; backup/idempotency; public shared media + private-file protection. No real QQ messages were tested."

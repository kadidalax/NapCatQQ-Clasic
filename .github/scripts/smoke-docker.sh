#!/usr/bin/env bash
# License: see repository LICENSE (NapCat Limited Redistribution License).
# Maintainer: kadidalax.
set -euo pipefail
: "${LOCAL_IMAGE:?LOCAL_IMAGE is required}"
: "${PLATFORM:?PLATFORM is required}"
case "$PLATFORM" in linux/amd64|linux/arm64) ;; *) echo 'Unsupported Docker smoke platform'; exit 1 ;; esac
project="clasic-smoke-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-${PLATFORM##*/}"
temporary="$(mktemp -d)"
printf 'services:\n  napcat:\n    platform: "%s"\n' "$PLATFORM" > "$temporary/platform.yaml"
export NAPCAT_IMAGE="$LOCAL_IMAGE"
export WEBUI_TOKEN="clasic-ci-smoke-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-temporary-token"
export WEBUI_BIND=127.0.0.1 WEBUI_PORT=0 QQ_ACCOUNT=
compose=(docker compose -p "$project" -f compose.yaml -f "$temporary/platform.yaml")
cleanup() {
  result=$?
  if [ "$result" -ne 0 ]; then "${compose[@]}" logs --no-color || true; fi
  "${compose[@]}" down --volumes --remove-orphans || true
  rm -rf "$temporary"
  exit "$result"
}
trap cleanup EXIT
"${compose[@]}" config -q
docker run --rm --platform "$PLATFORM" --user 1000:1000 --entrypoint node "$LOCAL_IMAGE" /usr/local/lib/napcatqq-clasic/verify-runtime.mjs
"${compose[@]}" up -d --no-build --pull never
wait_ready() {
  local container status running
  container="$("${compose[@]}" ps -q napcat)"
  [ -n "$container" ] || { echo 'Smoke container was not created'; return 1; }
  for attempt in $(seq 1 180); do
    running="$(docker inspect --format '{{.State.Running}}' "$container")"
    status="$(docker inspect --format '{{.State.Health.Status}}' "$container")"
    if [ "$running" != true ]; then echo 'QQ Shell process exited before WebUI readiness'; return 1; fi
    if [ "$status" = healthy ]; then return 0; fi
    sleep 2
  done
  echo 'WebUI did not become healthy within 360 seconds'
  return 1
}
wait_ready
"${compose[@]}" exec -T napcat node /usr/local/lib/napcatqq-clasic/assert-ready.mjs
"${compose[@]}" exec -T napcat node -e "require('node:fs').writeFileSync('/app/napcat/config/.ci-persistence-marker', 'persisted');"
"${compose[@]}" restart napcat
wait_ready
"${compose[@]}" exec -T napcat node /usr/local/lib/napcatqq-clasic/assert-ready.mjs
"${compose[@]}" exec -T napcat node -e "if (require('node:fs').readFileSync('/app/napcat/config/.ci-persistence-marker', 'utf8') !== 'persisted') process.exit(1);"
echo "NapCatQQ-clasic Docker smoke PASS: $PLATFORM; native dependencies; non-root read-only Compose; WebUI; persisted restart"

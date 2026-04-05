#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
. "${ROOT_DIR}/scripts/lib/go-env.sh"
LOG_DIR="${ROOT_DIR}/.open-kraken-run"
PID_FILE="${LOG_DIR}/backend.pid"
BACKEND_LOG="${LOG_DIR}/backend.log"
PROBE_ONLY=0

for arg in "$@"; do
  case "${arg}" in
    --probe)
      PROBE_ONLY=1
      ;;
    *)
      echo "unknown argument: ${arg}" >&2
      exit 64
      ;;
  esac
done

mkdir -p "${LOG_DIR}"
open_kraken_go_env_note

export OPEN_KRAKEN_HTTP_ADDR="${OPEN_KRAKEN_HTTP_ADDR:-127.0.0.1:8080}"
export OPEN_KRAKEN_API_BASE_PATH="${OPEN_KRAKEN_API_BASE_PATH:-/api/v1}"
export OPEN_KRAKEN_WS_PATH="${OPEN_KRAKEN_WS_PATH:-/ws}"
export OPEN_KRAKEN_APP_DATA_ROOT="${OPEN_KRAKEN_APP_DATA_ROOT:-${ROOT_DIR}/.open-kraken-data}"
export OPEN_KRAKEN_LOG_LEVEL="${OPEN_KRAKEN_LOG_LEVEL:-info}"
export OPEN_KRAKEN_WEB_DIST_DIR="${OPEN_KRAKEN_WEB_DIST_DIR:-${ROOT_DIR}/web/dist}"

PORT="${OPEN_KRAKEN_HTTP_ADDR##*:}"

cleanup() {
  if [[ -f "${PID_FILE}" ]]; then
    local pid
    pid="$(cat "${PID_FILE}")"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
    fi
    rm -f "${PID_FILE}"
  fi
}

trap cleanup EXIT INT TERM

if lsof -tiTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "open-kraken runtime refused to start: port ${PORT} is already listening on ${OPEN_KRAKEN_HTTP_ADDR}" >&2
  exit 65
fi

"${ROOT_DIR}/scripts/release/build-static.sh"

(
  cd "${ROOT_DIR}/backend/go"
  run_open_kraken_go run ./cmd/server >"${BACKEND_LOG}" 2>&1
) &
BACKEND_PID=$!
echo "${BACKEND_PID}" >"${PID_FILE}"

for _ in $(seq 1 50); do
  if ! kill -0 "${BACKEND_PID}" 2>/dev/null; then
    echo "open-kraken backend exited before readiness. log follows:" >&2
    cat "${BACKEND_LOG}" >&2
    exit 70
  fi
  if curl -fsS "http://${OPEN_KRAKEN_HTTP_ADDR}/healthz" >/dev/null 2>&1; then
    if [[ "${PROBE_ONLY}" -eq 1 ]]; then
      echo "probe succeeded: backend started, healthz responded, cleanup starting"
      exit 0
    fi
    echo "open-kraken backend running on http://${OPEN_KRAKEN_HTTP_ADDR} with static assets from ${OPEN_KRAKEN_WEB_DIST_DIR}"
    wait "${BACKEND_PID}"
    exit $?
  fi
  sleep 0.2
done

echo "open-kraken backend did not become ready before timeout. log follows:" >&2
cat "${BACKEND_LOG}" >&2
exit 70

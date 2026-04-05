#!/usr/bin/env bash
set -euo pipefail

readonly EXIT_USAGE=2

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="${ROOT_DIR}/../.open-kraken-run/backend.pid"

print_help() {
  cat <<'EOF'
Usage: bash scripts/dev-down.sh

Repository entrypoint for stopping the local open-kraken backend tracked by
.open-kraken-run/backend.pid.

Exit codes:
  0  success or backend already stopped
  2  invalid usage

Canonical root command:
  npm run dev:down
EOF
}

if [[ $# -gt 0 ]]; then
  case "$1" in
    --help|-h|help)
      print_help
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      print_help >&2
      exit "$EXIT_USAGE"
      ;;
  esac
fi

if [[ ! -f "${PID_FILE}" ]]; then
  echo "open-kraken backend is not running"
  exit 0
fi

PID="$(cat "${PID_FILE}")"
if [[ -n "${PID}" ]] && kill -0 "${PID}" 2>/dev/null; then
  kill "${PID}" 2>/dev/null || true
  for _ in $(seq 1 25); do
    if ! kill -0 "${PID}" 2>/dev/null; then
      break
    fi
    sleep 0.2
  done
fi
rm -f "${PID_FILE}"
echo "open-kraken backend stopped"

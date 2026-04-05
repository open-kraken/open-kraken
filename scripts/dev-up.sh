#!/usr/bin/env bash
set -euo pipefail

readonly EXIT_USAGE=2
readonly EXIT_MISSING_TARGET=10

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_SCRIPT="${ROOT_DIR}/dev/run-local.sh"

print_help() {
  cat <<'EOF'
Usage: bash scripts/dev-up.sh [--probe]

Repository entrypoint for starting the local open-kraken development runtime.

Options:
  --probe   Build assets, start the backend, wait for /healthz, then clean up.
  --help    Show this help text.

Delegation:
  scripts/dev-up.sh -> scripts/dev/run-local.sh

Exit codes:
  0   success
  2   invalid usage
  10  delegated target missing

Canonical root command:
  npm run dev:up
EOF
}

if [[ $# -gt 0 ]]; then
  case "$1" in
    --help|-h|help)
      print_help
      exit 0
      ;;
    --probe)
      ;;
    *)
      echo "unknown argument: $1" >&2
      print_help >&2
      exit "$EXIT_USAGE"
      ;;
  esac
fi

if [[ ! -x "${TARGET_SCRIPT}" ]]; then
  echo "missing delegated target: ${TARGET_SCRIPT}" >&2
  exit "$EXIT_MISSING_TARGET"
fi

exec "${TARGET_SCRIPT}" "$@"

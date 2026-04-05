#!/usr/bin/env bash
set -euo pipefail

readonly EXIT_USAGE=2
readonly EXIT_MISSING_TARGET=10

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${ROOT_DIR}/.."

steps=(
  "npm run verify:runtime"
  "npm run test:go"
  "npm run test:web:routes"
  "npm run test:web:unit"
  "npm run test:e2e:browser"
  "npm run test:e2e:smoke"
  "npm run verify:migration"
  "npm run verify:contract-sync"
  "npm run verify:production-readiness"
)

delegate_targets=(
  "${ROOT_DIR}/verify-runtime.sh"
  "${ROOT_DIR}/verify-go-tests.sh"
  "${ROOT_DIR}/verify-browser-smoke.mjs"
  "${ROOT_DIR}/verify-migration.mjs"
  "${ROOT_DIR}/verify-contract-sync.mjs"
  "${ROOT_DIR}/verify-production-readiness.mjs"
)

print_help() {
  cat <<'EOF'
Usage: bash scripts/verify-all.sh

Repository entrypoint for running the current open-kraken verification chain.

Delegation chain:
  npm run verify:runtime
  npm run test:go
  npm run test:web:routes
  npm run test:web:unit
  npm run test:e2e:browser
  npm run test:e2e:smoke
  npm run verify:migration
  npm run verify:contract-sync
  npm run verify:production-readiness

Exit codes:
  0   all delegated steps succeeded
  2   invalid usage
  10  delegated target missing
  N   first failing delegated command exit code

Canonical root command:
  npm run verify:all
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

for target in "${delegate_targets[@]}"; do
  if [[ ! -f "${target}" ]]; then
    echo "missing delegated target: ${target}" >&2
    exit "$EXIT_MISSING_TARGET"
  fi
done

cd "${REPO_DIR}"
for step in "${steps[@]}"; do
  echo "[verify-all] ${step}"
  bash -lc "${step}"
done

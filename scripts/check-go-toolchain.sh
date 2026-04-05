#!/usr/bin/env bash
set -euo pipefail

readonly EXIT_USAGE=2
readonly EXIT_GO_MISSING=10
readonly EXIT_GO_UNUSABLE=11

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${ROOT_DIR}/.."
. "${ROOT_DIR}/lib/go-env.sh"

print_help() {
  cat <<'EOF'
Usage: bash scripts/check-go-toolchain.sh

Repository-owned Go toolchain detection and reporting entrypoint.

What it does:
  - resolves the effective Go binary via scripts/lib/go-env.sh
  - ignores inherited GOROOT/GOTOOLDIR/GOPATH
  - prints the raw inherited environment when present
  - prints the sanitized repository Go binary, GOROOT, and GOVERSION
  - runs `go version` through the sanitized repository path

Exit codes:
  0   sanitized repository Go toolchain is usable
  2   invalid usage
  10  no usable Go binary could be resolved
  11  resolved Go binary exists but sanitized `go version` failed

Canonical root commands:
  bash scripts/check-go-toolchain.sh
  npm run check:go-toolchain
EOF
}

if [[ $# -gt 0 ]]; then
  case "$1" in
    --help|-h|help)
      print_help
      exit 0
      ;;
    *)
      printf 'unknown argument: %s\n' "$1" >&2
      print_help >&2
      exit "$EXIT_USAGE"
      ;;
  esac
fi

cd "${REPO_DIR}"
open_kraken_go_env_note

if ! require_open_kraken_go_bin >/dev/null 2>&1; then
  printf '[open-kraken-go-toolchain] no usable go binary found. install Go or set OPEN_KRAKEN_GO_BIN.\n' >&2
  exit "$EXIT_GO_MISSING"
fi

if [[ -n "${GOROOT:-}" ]]; then
  printf '[open-kraken-go-toolchain] inherited GOROOT=%s\n' "${GOROOT}"
fi
if [[ -n "${GOTOOLDIR:-}" ]]; then
  printf '[open-kraken-go-toolchain] inherited GOTOOLDIR=%s\n' "${GOTOOLDIR}"
fi
if [[ -n "${GOPATH:-}" ]]; then
  printf '[open-kraken-go-toolchain] inherited GOPATH=%s\n' "${GOPATH}"
fi

print_open_kraken_go_env | while IFS= read -r line; do
  printf '[open-kraken-go-toolchain] %s\n' "$line"
done

version_output="$(run_open_kraken_go version 2>&1)" || {
  printf '[open-kraken-go-toolchain] sanitized go version failed: %s\n' "$version_output" >&2
  exit "$EXIT_GO_UNUSABLE"
}
printf '[open-kraken-go-toolchain] %s\n' "$version_output"

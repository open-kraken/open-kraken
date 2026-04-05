#!/usr/bin/env bash

set -u

readonly EXIT_SCRIPT_FAILURE=10
readonly EXIT_UNIT_FAILURE=20
readonly EXIT_UNIT_BLOCKED=21
readonly EXIT_CONTRACT_FAILURE=30
readonly EXIT_CONTRACT_BLOCKED=31
readonly EXIT_INTEGRATION_FAILURE=40
readonly EXIT_INTEGRATION_BLOCKED=41
readonly EXIT_WORKSPACE_FAILURE=50
readonly EXIT_WORKSPACE_BLOCKED=51
readonly EXIT_PROJECTDATA_FAILURE=60
readonly EXIT_PROJECTDATA_BLOCKED=61
readonly EXIT_RUNTIME_FAILURE=70
readonly EXIT_RUNTIME_BLOCKED=71
readonly EXIT_DOMAIN_FAILURE=80
readonly EXIT_DOMAIN_BLOCKED=81
readonly EXIT_IMPORTER_FAILURE=90
readonly EXIT_IMPORTER_BLOCKED=91

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$ROOT_DIR/scripts/lib/go-env.sh"

if ! declare -F resolve_open_kraken_go_bin >/dev/null 2>&1; then
  resolve_open_kraken_go_bin() {
    command -v "${OPEN_KRAKEN_GO_BIN:-go}" 2>/dev/null || return 1
  }
fi

if ! declare -F print_open_kraken_go_env >/dev/null 2>&1; then
  print_open_kraken_go_env() {
    local go_bin
    go_bin="$(resolve_open_kraken_go_bin)"
    printf 'GO_BIN=%s\n' "$go_bin"
  }
fi

BACKEND_GO_DIR="${BACKEND_GO_DIR:-$ROOT_DIR/backend/go}"
GO_BIN="${OPEN_KRAKEN_GO_BIN:-$(resolve_open_kraken_go_bin)}"
MODE="${1:-layers}"
RECORD_FILE="${VERIFY_RECORD_FILE:-}"

record_command() {
  if [[ -n "$RECORD_FILE" ]]; then
    printf '%s\n' "$*" >>"$RECORD_FILE"
  fi
}

print_usage() {
  cat <<'EOF'
Usage: scripts/verify-go-tests.sh [layers|workspace|projectdata|runtime|domain|importer]

layers:
  Run unit, contract, and integration gates with stage-specific exit codes.

workspace:
  Run `go test ./...` from backend/go as a single recursive smoke entrypoint.

projectdata:
  Run only the roadmap/project-data persistence package gate.
  This mode is valid only for single-writer topology.
  pass: exit 0
  blocked: exit 61 when the sanitized Go toolchain is still unusable
  fail: exit 60 on projectdata regressions, exit 10 on unsupported multi-writer topology

runtime:
  Run only backend/runtime gates owned by the runtime/deployment chain.

domain:
  Run the domain-model mainline gate only.
  This is the only supported validation entry for repository/file-store boundary,
  message status enum alignment, and toolchain-sanitized domain+contract checks.

importer:
  Run only the migration importer contract gate.
  This is the only supported validation entry for importer preflight contracts,
  chat.redb discovery classification, alias persistence hooks, and rollback token boundaries.
  pass: exit 0
  blocked: exit 91 when the sanitized Go toolchain is still unusable
  fail: exit 90 on importer contract regressions
EOF
}

projectdata_writer_mode() {
  printf '%s' "${OPEN_KRAKEN_PROJECTDATA_WRITER_MODE:-single}"
}

ensure_projectdata_single_writer_topology() {
  local mode
  mode="$(projectdata_writer_mode)"
  if [[ "$mode" == "multi" ]]; then
    printf '[verify-go-tests] projectdata topology=multi is unsupported by current persistence contract\n' >&2
    printf '[verify-go-tests] promote file-lock or coordinator plan before treating this gate as valid\n' >&2
    exit "$EXIT_SCRIPT_FAILURE"
  fi
  printf '[verify-go-tests] projectdata topology=%s guard=single-writer-only\n' "$mode"
}

resolve_realpath() {
  perl -MCwd=realpath -e 'print realpath(shift)' "$1"
}

configure_go_env() {
  printf '[verify-go-tests] go resolver=%s\n' "$GO_BIN"
  print_open_kraken_go_env | while IFS= read -r line; do
    printf '[verify-go-tests] go env %s\n' "$line"
  done
}

classify_go_output() {
  local output_file="$1"

  if grep -Eq 'does not match go tool version|toolchain not available|failed to download toolchain|GOTOOLCHAIN' "$output_file"; then
    return 0
  fi

  return 1
}

run_go_test_stage() {
  local stage="$1"
  local failure_code="$2"
  local blocked_code="$3"
  shift 3

  local output_file
  output_file="$(mktemp)"
  local go_bin
  go_bin="$(resolve_open_kraken_go_bin)"
  local cmd=("env" "-u" "GOROOT" "-u" "GOTOOLDIR" "-u" "GOPATH" "$go_bin" "test" "$@")
  record_command "cd $BACKEND_GO_DIR && ${cmd[*]}"

  printf '[verify-go-tests] stage=%s command=cd %s && %s\n' "$stage" "$BACKEND_GO_DIR" "${cmd[*]}"

  if (
    cd "$BACKEND_GO_DIR" &&
      "${cmd[@]}"
  ) >"$output_file" 2>&1; then
    cat "$output_file"
    rm -f "$output_file"
    return 0
  fi

  cat "$output_file"
  if classify_go_output "$output_file"; then
    printf '[verify-go-tests] stage=%s classification=blocked reason=environment\n' "$stage"
    rm -f "$output_file"
    exit "$blocked_code"
  fi

  printf '[verify-go-tests] stage=%s classification=regression\n' "$stage"
  rm -f "$output_file"
  exit "$failure_code"
}

ensure_preconditions() {
  if [[ ! -d "$BACKEND_GO_DIR" ]]; then
    printf '[verify-go-tests] missing backend/go directory: %s\n' "$BACKEND_GO_DIR" >&2
    exit "$EXIT_SCRIPT_FAILURE"
  fi
  if [[ ! -d "$BACKEND_GO_DIR/tests/contract" ]]; then
    printf '[verify-go-tests] missing contract test directory: %s/tests/contract\n' "$BACKEND_GO_DIR" >&2
    exit "$EXIT_SCRIPT_FAILURE"
  fi
  if [[ ! -d "$BACKEND_GO_DIR/tests/integration" ]]; then
    printf '[verify-go-tests] missing integration test directory: %s/tests/integration\n' "$BACKEND_GO_DIR" >&2
    exit "$EXIT_SCRIPT_FAILURE"
  fi
  if [[ ! -d "$BACKEND_GO_DIR/testing/testkit" ]]; then
    printf '[verify-go-tests] missing testkit directory: %s/testing/testkit\n' "$BACKEND_GO_DIR" >&2
    exit "$EXIT_SCRIPT_FAILURE"
  fi
  if ! resolve_open_kraken_go_bin >/dev/null 2>&1; then
    printf '[verify-go-tests] go binary not found\n' >&2
    exit "$EXIT_SCRIPT_FAILURE"
  fi
}

run_layers_mode() {
  run_go_test_stage "unit" "$EXIT_UNIT_FAILURE" "$EXIT_UNIT_BLOCKED" ./cmd/... ./contracts ./internal/... ./testing/...
  run_go_test_stage "contract" "$EXIT_CONTRACT_FAILURE" "$EXIT_CONTRACT_BLOCKED" ./tests/contract/...
  run_go_test_stage "integration" "$EXIT_INTEGRATION_FAILURE" "$EXIT_INTEGRATION_BLOCKED" ./tests/integration/...
}

run_workspace_mode() {
  run_go_test_stage "workspace" "$EXIT_WORKSPACE_FAILURE" "$EXIT_WORKSPACE_BLOCKED" ./...
}

run_projectdata_mode() {
  ensure_projectdata_single_writer_topology
  run_go_test_stage "projectdata" "$EXIT_PROJECTDATA_FAILURE" "$EXIT_PROJECTDATA_BLOCKED" ./internal/projectdata/...
}

run_runtime_mode() {
  run_go_test_stage "runtime" "$EXIT_RUNTIME_FAILURE" "$EXIT_RUNTIME_BLOCKED" ./cmd/server ./internal/platform/... ./internal/api/http/...
}

run_domain_mode() {
  run_go_test_stage "domain" "$EXIT_DOMAIN_FAILURE" "$EXIT_DOMAIN_BLOCKED" ./internal/domain/... ./tests/contract/...
}

run_importer_mode() {
  run_go_test_stage "importer" "$EXIT_IMPORTER_FAILURE" "$EXIT_IMPORTER_BLOCKED" ./internal/migration/importer/...
}

configure_go_env
ensure_preconditions
open_kraken_go_env_note

case "$MODE" in
  layers)
    run_layers_mode
    ;;
  workspace)
    run_workspace_mode
    ;;
  projectdata)
    run_projectdata_mode
    ;;
  runtime)
    run_runtime_mode
    ;;
  domain)
    run_domain_mode
    ;;
  importer)
    run_importer_mode
    ;;
  -h|--help|help)
    print_usage
    ;;
  *)
    printf '[verify-go-tests] unknown mode: %s\n' "$MODE" >&2
    print_usage >&2
    exit "$EXIT_SCRIPT_FAILURE"
    ;;
esac

#!/usr/bin/env bash

resolve_realpath() {
  perl -MCwd=realpath -e 'print realpath(shift)' "$1"
}

resolve_open_kraken_go_bin() {
  local requested_go="${OPEN_KRAKEN_GO_BIN:-go}"
  local resolved_go
  resolved_go="$(command -v "$requested_go" 2>/dev/null || true)"
  if [[ -z "$resolved_go" ]]; then
    return 1
  fi

  local current_goroot=""
  current_goroot="$(env -u GOROOT -u GOTOOLDIR "$resolved_go" env GOROOT 2>/dev/null || true)"
  if [[ -n "$current_goroot" ]] && [[ -x "$current_goroot/bin/go" ]]; then
    printf '%s\n' "$current_goroot/bin/go"
    return 0
  fi

  local real_go=""
  real_go="$(resolve_realpath "$resolved_go" 2>/dev/null || true)"
  if [[ -n "$real_go" ]]; then
    printf '%s\n' "$real_go"
    return 0
  fi

  printf '%s\n' "$resolved_go"
}

require_open_kraken_go_bin() {
  local go_bin=""
  go_bin="$(resolve_open_kraken_go_bin 2>/dev/null || true)"
  if [[ -z "$go_bin" ]]; then
    printf '[open-kraken-go-env] no usable go binary found. Set OPEN_KRAKEN_GO_BIN or install Go.\n' >&2
    return 1
  fi
  printf '%s\n' "$go_bin"
}

print_open_kraken_go_env() {
  local go_bin
  go_bin="$(require_open_kraken_go_bin)" || return 1
  local goroot=""
  goroot="$(env -u GOROOT -u GOTOOLDIR "$go_bin" env GOROOT 2>/dev/null || true)"
  printf 'GO_BIN=%s\n' "$go_bin"
  if [[ -n "$goroot" ]]; then
    printf 'GOROOT=%s\n' "$goroot"
  fi
  local goversion=""
  goversion="$(env -u GOROOT -u GOTOOLDIR -u GOPATH "$go_bin" env GOVERSION 2>/dev/null || true)"
  if [[ -n "$goversion" ]]; then
    printf 'GOVERSION=%s\n' "$goversion"
  fi
}

open_kraken_go_env_note() {
  if [[ -n "${GOROOT:-}" || -n "${GOTOOLDIR:-}" || -n "${GOPATH:-}" ]]; then
    printf '[open-kraken-go-env] ignoring inherited GOROOT/GOTOOLDIR/GOPATH for repository go commands\n'
  fi
}

run_open_kraken_go() {
  local go_bin
  go_bin="$(require_open_kraken_go_bin)" || return 1
  env -u GOROOT -u GOTOOLDIR -u GOPATH "$go_bin" "$@"
}

open_kraken_go_run() {
  run_open_kraken_go "$@"
}

open_kraken_go_env() {
  local go_bin
  go_bin="$(require_open_kraken_go_bin)" || return 1
  env -u GOROOT -u GOTOOLDIR -u GOPATH "$go_bin" env "$@"
}

check_open_kraken_go_toolchain() {
  local go_bin
  go_bin="$(require_open_kraken_go_bin)" || return 1
  local version_output=""
  version_output="$(env -u GOROOT -u GOTOOLDIR -u GOPATH "$go_bin" version 2>&1)" || {
    printf '[open-kraken-go-env] go version failed: %s\n' "$version_output" >&2
    return 1
  }
  printf '[open-kraken-go-env] %s\n' "$version_output"
  print_open_kraken_go_env
}

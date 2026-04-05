#!/usr/bin/env bash
set -euo pipefail

readonly EXIT_USAGE=2
readonly EXIT_REVIEW_REQUIRED=20

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode="${1:---summary}"

print_help() {
  cat <<'EOF'
Usage: bash scripts/audit-changes.sh [--summary|--review]

File-based change audit for the non-git-root open-kraken workspace.

Modes:
  --summary  Print the current file inventory under the repository root.
  --review   Print a focused review set for machine-local artifacts.
  --help     Show this help text.

Failure conditions:
  20  manual review required because .env/.idea/.DS_Store/runtime artifacts are present

Recommended root command:
  bash scripts/audit-changes.sh --summary
EOF
}

summary() {
  find "${ROOT_DIR}" -maxdepth 2 -type f | sort
}

review() {
  summary | while IFS= read -r file; do
    case "${file}" in
      */.env|*/.DS_Store|*/workspace.xml|*/modules.xml|*/open-kraken.iml|*/backend.log)
        printf 'manual-review %s\n' "${file}"
        ;;
    esac
  done

  if summary | grep -Eq '/(\.env|\.DS_Store|workspace\.xml|modules\.xml|open-kraken\.iml|backend\.log)$'; then
    exit "$EXIT_REVIEW_REQUIRED"
  fi
}

case "$mode" in
  --help|-h|help)
    print_help
    ;;
  --summary)
    summary
    ;;
  --review)
    review
    ;;
  *)
    echo "unknown argument: ${mode}" >&2
    print_help >&2
    exit "$EXIT_USAGE"
    ;;
esac

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${ROOT_DIR}/.."

cd "${REPO_DIR}"

bash ./scripts/bootstrap-migration.sh --check
bash ./scripts/verify-go-tests.sh runtime
bash ./scripts/dev-up.sh --probe
bash ./scripts/dev-down.sh

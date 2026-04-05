#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="${ROOT_DIR}/.."
ARTIFACT_DIR="${OPEN_KRAKEN_CI_ARTIFACT_DIR:-${REPO_DIR}/.open-kraken-artifacts/ci}"
LOG_FILE="${ARTIFACT_DIR}/verify-all.log"
SUMMARY_FILE="${ARTIFACT_DIR}/summary.json"

mkdir -p "${ARTIFACT_DIR}"

run_status=0
(
  cd "${REPO_DIR}"
  npm run verify:all
) > >(tee "${LOG_FILE}") 2>&1 || run_status=$?

cat >"${SUMMARY_FILE}" <<EOF
{
  "command": "npm run verify:all",
  "exitCode": ${run_status},
  "logFile": "$(basename "${LOG_FILE}")",
  "workflow": "github-actions",
  "artifactDir": "${ARTIFACT_DIR}"
}
EOF

if [[ -f "${REPO_DIR}/.open-kraken-run/backend.log" ]]; then
  cp "${REPO_DIR}/.open-kraken-run/backend.log" "${ARTIFACT_DIR}/backend.log"
fi

exit "${run_status}"

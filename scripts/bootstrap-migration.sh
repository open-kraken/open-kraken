#!/usr/bin/env bash
set -euo pipefail

readonly EXIT_USAGE=2
readonly EXIT_MISSING_FILE=10

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$repo_root/scripts/lib/go-env.sh"
mode="${1:---check}"

required_files=(
  "$repo_root/docs/migration/data-migration-source-inventory.md"
  "$repo_root/docs/migration/data-migration-compatibility-strategy.md"
  "$repo_root/docs/mock-and-fixture.md"
  "$repo_root/backend/go/contracts/contracts.go"
  "$repo_root/backend/tests/fixtures/workspace-fixture.json"
  "$repo_root/scripts/mock-server/server.mjs"
  "$repo_root/web/src/fixtures/workspace-fixture.mjs"
  "$repo_root/web/src/mocks/mock-client.mjs"
  "$repo_root/backend/go/tests/contract/contracts_matrix_test.go"
)

print_help() {
  cat <<'EOF'
Usage: bash scripts/bootstrap-migration.sh [--check|--steps|--verify-result <target-workspace-path>]

Repository entrypoint for open-kraken migration bootstrap guards.

Options:
  --check   Seed local runtime files when missing, ensure web deps, then run guards.
  --steps   Print the operator-facing migration bootstrap sequence only.
  --verify-result <target-workspace-path>  Verify importer output artifacts after an import attempt.
  --help    Show this help text.

Exit codes:
  0   success
  2   invalid usage
  10  required migration file missing
  N   first failing delegated command exit code

Canonical root command:
  npm run bootstrap:migration
EOF
}

check_files() {
  local missing=0
  for file in "${required_files[@]}"; do
    if [[ ! -f "$file" ]]; then
      printf 'missing required file: %s\n' "$file" >&2
      missing=1
    fi
  done
  if [[ "$missing" -ne 0 ]]; then
    exit "$EXIT_MISSING_FILE"
  fi
}

ensure_runtime_dirs() {
  mkdir -p "$repo_root/.open-kraken-data" "$repo_root/.open-kraken-run"
}

check_go_toolchain() {
  bash "$repo_root/scripts/check-go-toolchain.sh"
}

seed_env_file() {
  local example_file="$1"
  local target_file="$2"

  if [[ ! -f "$target_file" && -f "$example_file" ]]; then
    cp "$example_file" "$target_file"
    printf 'seeded env file: %s\n' "$target_file"
  fi
}

seed_env_files() {
  seed_env_file "$repo_root/backend/.env.example" "$repo_root/backend/.env"
  seed_env_file "$repo_root/web/.env.example" "$repo_root/web/.env"
}

ensure_web_dependencies() {
  if [[ ! -d "$repo_root/web/node_modules" ]]; then
    npm --prefix "$repo_root/web" install
  fi
}

check_docs() {
  rg -n "Source Inventory|ID Mapping Summary|Skip Items|Risks And Rollback|mock-and-fixture|bootstrap-migration\\.sh" \
    "$repo_root/docs/migration/data-migration-source-inventory.md"
  rg -n "WorkspaceImportSource|ConversationImportBatch|ProjectDataImportSnapshot|ImportWarning|ImportReport|Trigger Conditions|Execution Path|bootstrap-migration\\.sh|verify-all\\.sh|rollback" \
    "$repo_root/docs/migration/data-migration-compatibility-strategy.md"
  rg -n 'Importer Boundary And Repository Hookup|Legacy `chat.redb` Discovery|Recorded Snapshot Inputs|Alias And Import Metadata Destination' \
    "$repo_root/docs/migration/data-migration-compatibility-strategy.md" \
    "$repo_root/docs/migration/data-migration-source-inventory.md"
  rg -n "Current Compatibility Layer|bootstrap-migration\\.sh|verify-all\\.sh|contracts\\.go|workspace-fixture\\.json|mock-server/server\\.mjs|rollback" \
    "$repo_root/docs/mock-and-fixture.md"
  rg -n "Skill And Command Channel Layering|Remote Deployment Local Capability Boundary|Verification entry" \
    "$repo_root/docs/runtime/deployment-and-operations.md"
}

check_contract_sync() {
  rg -n 'chat\.message\.created|chat\.message\.status\.changed|friends\.snapshot\.updated|roadmap\.updated|terminal\.ready|terminal\.output\.delta|terminal\.status\.changed' \
    "$repo_root/backend/go/contracts/contracts.go" \
    "$repo_root/scripts/mock-server/server.mjs" \
    "$repo_root/web/src/mocks/mock-client.mjs" \
    "$repo_root/backend/go/tests/contract/contracts_matrix_test.go"
}

check_fixture_shape() {
  REPO_ROOT="$repo_root" node <<'EOF'
const fs = require('node:fs');
const path = require('node:path');

const root = process.env.REPO_ROOT;
const fixture = JSON.parse(
  fs.readFileSync(path.join(root, 'backend', 'tests', 'fixtures', 'workspace-fixture.json'), 'utf8')
);

const requiredTopLevel = ['workspace', 'members', 'conversations', 'messages', 'roadmap', 'projectData', 'terminalSessions'];
for (const key of requiredTopLevel) {
  if (!(key in fixture)) {
    throw new Error(`fixture missing top-level key: ${key}`);
  }
}

if (!Array.isArray(fixture.members?.members) || fixture.members.members.length === 0) {
  throw new Error('fixture members.members must be a non-empty array');
}

const firstMember = fixture.members.members[0];
for (const key of ['workspaceId', 'memberId', 'displayName', 'avatar', 'roleType', 'manualStatus', 'terminalStatus']) {
  if (!(key in firstMember)) {
    throw new Error(`fixture member missing key: ${key}`);
  }
}

if (!Array.isArray(fixture.roadmap?.tasks)) {
  throw new Error('fixture roadmap.tasks must be an array');
}

if (!Array.isArray(fixture.terminalSessions) || fixture.terminalSessions.length === 0) {
  throw new Error('fixture terminalSessions must be a non-empty array');
}

console.log('fixture shape check passed');
EOF
}

check_importer_gate() {
  (cd "$repo_root" && npm run test:go:importer)
}

verify_import_result() {
  local target_workspace="${1:-}"
  if [[ -z "$target_workspace" ]]; then
    echo "missing target workspace path for --verify-result" >&2
    exit "$EXIT_USAGE"
  fi

  local project_file="$target_workspace/.open-kraken/project-data.json"
  local roadmap_file="$target_workspace/.open-kraken/roadmaps/global.json"
  local aliases_file="$target_workspace/.open-kraken/imports/aliases.json"
  local report_file="$target_workspace/.open-kraken/imports/report.json"

  for file in "$project_file" "$roadmap_file" "$aliases_file" "$report_file"; do
    if [[ ! -f "$file" ]]; then
      echo "missing importer result artifact: $file" >&2
      exit "$EXIT_MISSING_FILE"
    fi
  done

  REPO_ROOT="$repo_root" TARGET_WORKSPACE="$target_workspace" node <<'EOF'
const fs = require('node:fs');
const path = require('node:path');

const target = process.env.TARGET_WORKSPACE;
const read = (relative) => JSON.parse(fs.readFileSync(path.join(target, relative), 'utf8'));

const project = read('.open-kraken/project-data.json');
const roadmap = read('.open-kraken/roadmaps/global.json');
const aliases = read('.open-kraken/imports/aliases.json');
const report = read('.open-kraken/imports/report.json');

if (!project.projectId || !project.projectName) {
  throw new Error('project-data.json missing project identity');
}
if (!Array.isArray(roadmap.tasks)) {
  throw new Error('global roadmap missing tasks array');
}
if (!Array.isArray(aliases.records)) {
  throw new Error('aliases.json missing records array');
}
if (!report.rollbackToken?.value || !report.status) {
  throw new Error('report.json missing rollback token or status');
}

console.log('import result artifact check passed');
EOF
}

print_steps() {
  cat <<'EOF'
[bootstrap-migration] executable steps
1. Snapshot legacy workspace inputs before import:
   - <legacyWorkspacePath>/.golutra/workspace.json
   - <legacyAppData>/<workspaceId>/project.json
   - <legacyChatBaseDir>/<workspaceId>/chat.redb
2. Run sync guard:
   - bash scripts/bootstrap-migration.sh --check
3. Review import contracts, repository hookup, and rollback boundary:
   - docs/migration/data-migration-compatibility-strategy.md
   - docs/migration/data-migration-source-inventory.md
   - docs/mock-and-fixture.md
4. Persist canonical roadmap/project-data writes only through backend/go internal projectdata repository/service boundaries.
5. Persist alias maps, import report, and snapshot manifest beside the staged open-kraken target before classifying success/partial/skipped/failed.
6. Only after the guard passes, implement or run importer code against the frozen contracts and alias rules.
7. After a real import attempt, verify importer outputs:
   - bash scripts/bootstrap-migration.sh --verify-result <target-workspace-path>
8. If docs target vocabulary and compatibility-layer code disagree, treat that as explicit migration debt and resolve it before extending the compatibility layer.
EOF
}

case "$mode" in
  --help|-h|help)
    print_help
    ;;
  --check)
    ensure_runtime_dirs
    seed_env_files
    ensure_web_dependencies
    check_go_toolchain
    check_importer_gate
    check_files
    check_docs
    check_contract_sync
    check_fixture_shape
    print_steps
    ;;
  --verify-result)
    verify_import_result "${2:-}"
    ;;
  --steps)
    print_steps
    ;;
  *)
    echo "unknown argument: ${mode}" >&2
    print_help >&2
    exit "$EXIT_USAGE"
    ;;
esac

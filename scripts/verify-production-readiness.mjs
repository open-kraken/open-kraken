import { access, readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const requiredScripts = {
  'verify:all': 'bash ./scripts/verify-all.sh',
  'ci:remote-verify': 'bash ./scripts/ci/run-remote-verify.sh',
  'verify:production-readiness': 'node ./scripts/verify-production-readiness.mjs',
  'verify:runtime': 'bash ./scripts/verify-runtime.sh',
  'verify:migration': 'node ./scripts/verify-migration.mjs',
  'verify:contract-sync': 'node ./scripts/verify-contract-sync.mjs',
  'test:go': 'bash ./scripts/verify-go-tests.sh layers',
  'test:go:runtime': 'bash ./scripts/verify-go-tests.sh runtime',
  'test:web:routes': 'npm --prefix ./web run test:web:routes',
  'test:e2e:browser': 'node ./scripts/verify-browser-smoke.mjs',
  'dev:up': 'bash ./scripts/dev-up.sh',
  'dev:down': 'bash ./scripts/dev-down.sh'
};

const requiredFiles = [
  'scripts/verify-all.sh',
  '.github/workflows/verify.yml',
  'scripts/ci/run-remote-verify.sh',
  'scripts/verify-production-readiness.mjs',
  'scripts/verify-runtime.sh',
  'scripts/verify-contract-sync.mjs',
  'scripts/dev-up.sh',
  'scripts/dev-down.sh',
  'scripts/dev/run-local.sh',
  'scripts/release/build-static.sh',
  'docs/runtime/deployment-and-operations.md',
  'docs/testing/go-test-matrix.md',
  'docs/backend/authz-enforcement-and-go-env.md',
  'docs/backend/realtime-contract.md',
  'README.md'
];

const checks = [
  {
    file: 'README.md',
    patterns: [
      'npm run verify:all',
      'npm run ci:remote-verify',
      'npm run verify:runtime',
      'npm run verify:migration',
      'npm run test:web:routes',
      'npm run test:e2e:browser'
    ]
  },
  {
    file: 'docs/production-readiness/README.md',
    patterns: [
      'npm run verify:all',
      'npm run verify:production-readiness',
      'npm run verify:runtime',
      'npm run verify:contract-sync',
      'npm run test:go:runtime',
      'npm run test:web:routes',
      'npm run test:e2e:browser',
      'scripts/verify-runtime.sh',
      'GET /healthz',
      '.github/workflows/verify.yml'
    ]
  },
  {
    file: '.github/workflows/verify.yml',
    patterns: [
      'bash ./scripts/ci/run-remote-verify.sh',
      'actions/upload-artifact@v4',
      'web/package-lock.json',
      'backend/go/go.mod'
    ]
  },
  {
    file: 'docs/production-readiness/risk-register.md',
    patterns: [
      'release owner',
      'deployment/runtime owner',
      'scripts/verify-runtime.sh',
      'npm run verify:all',
      'npm run verify:production-readiness',
      'npm run verify:contract-sync'
    ]
  },
  {
    file: 'docs/production-readiness/regression-checklist.md',
    patterns: [
      'release owner',
      'CI / automation owner',
      'scripts/verify-runtime.sh',
      'npm run verify:all',
      'npm run verify:production-readiness',
      'npm run verify:contract-sync',
      'runtime/deployment gate'
    ]
  },
  {
    file: 'docs/production-readiness/observability-and-failure-handling.md',
    patterns: [
      'Alert source',
      'Runtime gate alert',
      'Forced Sync Mechanism',
      'npm run verify:contract-sync',
      'npm run test:go:runtime',
      'scripts/verify-runtime.sh',
      'docs/api/openapi.yaml',
      'docs/api/http-websocket-contract.md',
      'docs/backend/realtime-contract.md',
      'docs/backend/authz-enforcement-and-go-env.md',
      'npm run verify:all',
      'npm run verify:production-readiness'
    ]
  }
];

const failures = [];

for (const [name, command] of Object.entries(requiredScripts)) {
  if (packageJson.scripts?.[name] !== command) {
    failures.push(`package.json: script "${name}" drifted from "${command}"`);
  }
}

for (const file of requiredFiles) {
  try {
    await access(new URL(`../${file}`, import.meta.url));
  } catch {
    failures.push(`missing required file: ${file}`);
  }
}

for (const check of checks) {
  const contents = await readFile(new URL(`../${check.file}`, import.meta.url), 'utf8');
  for (const pattern of check.patterns) {
    if (!contents.includes(pattern)) {
      failures.push(`${check.file}: missing "${pattern}"`);
    }
  }
}

if (failures.length > 0) {
  console.error('production-readiness sync check failed');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('production-readiness sync check passed');

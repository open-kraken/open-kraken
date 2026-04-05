import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.OPEN_KRAKEN_SYNC_GUARD_ROOT
  ? path.resolve(process.env.OPEN_KRAKEN_SYNC_GUARD_ROOT)
  : path.resolve(scriptDir, '..');

const read = async (relativePath) =>
  readFile(path.join(repoRoot, relativePath), 'utf8');

const checks = [
  {
    file: 'docs/api/openapi.yaml',
    patterns: [
      'docs/api/http-websocket-contract.md',
      '/healthz:',
      'RuntimeHealthResponse'
    ]
  },
  {
    file: 'docs/api/http-websocket-contract.md',
    patterns: [
      '## Sync Guard Bindings',
      'npm run verify:contract-sync',
      'npm run verify:runtime',
      'GET /healthz',
      'docs/backend/realtime-contract.md',
      'docs/backend/authz-enforcement-and-go-env.md'
    ]
  },
  {
    file: 'docs/backend/realtime-contract.md',
    patterns: [
      '## Sync Guard Bindings',
      'npm run verify:contract-sync',
      'npm run verify:migration',
      'docs/api/http-websocket-contract.md',
      'docs/backend/authz-enforcement-and-go-env.md'
    ]
  },
  {
    file: 'docs/backend/authz-enforcement-and-go-env.md',
    patterns: [
      '## Sync Guard Bindings',
      'npm run verify:contract-sync',
      'npm run verify:runtime',
      'docs/api/http-websocket-contract.md',
      'docs/api/openapi.yaml',
      'docs/backend/realtime-contract.md'
    ]
  }
];

const failures = [];

for (const check of checks) {
  const contents = await read(check.file);
  for (const pattern of check.patterns) {
    if (!contents.includes(pattern)) {
      failures.push(`${check.file}: missing "${pattern}"`);
    }
  }
}

if (failures.length > 0) {
  console.error('contract sync guard failed');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('contract sync guard passed');

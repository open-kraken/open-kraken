import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  expectedPassConditions,
  formatSummary,
  runVerification,
  verificationSteps
} from '../../scripts/verify-migration.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const readRepoFile = (relativePath) => readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('smoke gate: verify entrypoint reuses stable script names and states pass criteria', () => {
  const packageJson = JSON.parse(readRepoFile('package.json'));
  const checklist = readRepoFile('docs/migration/manual-checklist.md');
  const browserReadme = readRepoFile('e2e/browser/README.md');

  assert.equal(packageJson.scripts['verify:migration'], 'node ./scripts/verify-migration.mjs');
  assert.equal(packageJson.scripts['test:go'], 'bash ./scripts/verify-go-tests.sh layers');
  assert.equal(
    packageJson.scripts['test:web:routes'],
    'npm --prefix ./web run test:web:routes'
  );
  assert.equal(packageJson.scripts['test:e2e:smoke'], 'node --test ./e2e/smoke/*.test.mjs');
  assert.equal(packageJson.scripts['test:e2e:browser'], 'node ./scripts/verify-browser-smoke.mjs');
  assert.deepEqual(
    verificationSteps.map((step) => step.name),
    ['test:go', 'test:web:routes', 'test:e2e:smoke', 'test:e2e:browser']
  );
  assert.match(checklist, /The entrypoint must execute the stable script names `test:go`, `test:web:routes`, `test:e2e:smoke`, and `test:e2e:browser`\./);
  assert.match(checklist, /test:go` must either return exit code `0` or a classified blocker exit/);
  assert.match(checklist, /Chat page enters through the shared `AppShell` route outlet/);
  assert.match(checklist, /Terminal page enters through the shared `AppShell` route outlet/);
  assert.match(checklist, /`npm run test:e2e:browser` is the fixed browser automation handoff entry/);
  assert.match(checklist, /`verify:migration` must execute `test:e2e:browser`/);
  assert.match(browserReadme, /OPEN_KRAKEN_BROWSER_BASE_URL/);
  assert.match(browserReadme, /\/roadmap/);
  assert.equal(expectedPassConditions.length, 5);
});

test('smoke gate: verify summary distinguishes known blockers from new regressions', () => {
  const report = runVerification({
    steps: verificationSteps,
    exec(command) {
      if (command.join(' ') === 'npm run test:go') {
        return { status: 21, stdout: '', stderr: 'go toolchain mismatch' };
      }
      if (command.join(' ') === 'npm run test:web:routes') {
        return { status: 1, stdout: '', stderr: 'typecheck failed before this task' };
      }
      if (command.join(' ') === 'npm run test:e2e:smoke') {
        return { status: 1, stdout: '', stderr: 'terminal panel assertion missing' };
      }
      return { status: 1, stdout: '', stderr: 'browser manifest missing route /terminal' };
    }
  });

  assert.equal(report.ok, false);
  assert.match(report.summary, /KNOWN_BLOCKER test:go: go layered gate is missing or root entrypoint drifted from backend\/go/);
  assert.match(report.summary, /NEW_REGRESSION test:web:routes: missing AppShell-routed chat\/member\/roadmap\/terminal\/settings real page-tree assertion/);
  assert.match(report.summary, /NEW_REGRESSION test:e2e:smoke: verify entrypoint or mock smoke contract is incomplete/);
  assert.match(report.summary, /NEW_REGRESSION test:e2e:browser: browser smoke handoff path is missing or route manifest drifted from real page entry selectors/);
  assert.match(report.summary, /verification failed: 3 new regressions, 1 known blockers/);
});

test('smoke gate: formatter emits a passing summary when every step succeeds', () => {
  const summary = formatSummary({
    results: [
      { name: 'test:go', ok: true, severity: 'PASS', gap: '', detail: '' },
      { name: 'test:web:routes', ok: true, severity: 'PASS', gap: '', detail: '' },
      { name: 'test:e2e:smoke', ok: true, severity: 'PASS', gap: '', detail: '' },
      { name: 'test:e2e:browser', ok: true, severity: 'PASS', gap: '', detail: '' }
    ]
  });

  assert.match(summary, /PASS test:go/);
  assert.match(summary, /PASS test:web:routes/);
  assert.match(summary, /PASS test:e2e:smoke/);
  assert.match(summary, /PASS test:e2e:browser/);
  assert.match(summary, /verification passed/);
});

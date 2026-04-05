import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const verificationSteps = [
  {
    name: 'test:go',
    command: ['npm', 'run', 'test:go'],
    gapHint: 'go layered gate is missing or root entrypoint drifted from backend/go',
    blockedStatuses: [21, 31, 41, 51, 61, 71]
  },
  {
    name: 'test:web:routes',
    command: ['npm', 'run', 'test:web:routes'],
    gapHint: 'missing AppShell-routed chat/member/roadmap/terminal/settings real page-tree assertion'
  },
  {
    name: 'test:e2e:smoke',
    command: ['npm', 'run', 'test:e2e:smoke'],
    gapHint: 'verify entrypoint or mock smoke contract is incomplete'
  },
  {
    name: 'test:e2e:browser',
    command: ['npm', 'run', 'test:e2e:browser'],
    gapHint: 'browser smoke handoff path is missing or route manifest drifted from real page entry selectors',
    blockedStatuses: [61]
  }
];

export const expectedPassConditions = [
  'test:go passes or reports a known environment blocker through scripts/verify-go-tests.sh',
  'test:web:routes passes with AppShell-routed chat/member/roadmap/terminal/settings page assertions over the real React component tree',
  'test:e2e:smoke passes with verify entrypoint, pass criteria, and failure classification checks',
  'test:e2e:browser passes with the frozen browser handoff manifest for chat/members/roadmap/terminal',
  'no step reports a new regression'
];

export const classifyFailure = ({ step, run, knownBlockers = new Set() }) => {
  if (knownBlockers.has(step.name)) {
    return 'KNOWN_BLOCKER';
  }
  if (step.blockedStatuses?.includes(run.status ?? -1)) {
    return 'KNOWN_BLOCKER';
  }
  return 'NEW_REGRESSION';
};

export const formatSummary = ({ results }) => {
  const lines = [
    '[verify:migration] expected pass conditions:',
    ...expectedPassConditions.map((item) => `- ${item}`),
    '[verify:migration] results:'
  ];

  for (const result of results) {
    if (result.ok) {
      lines.push(`PASS ${result.name}`);
      continue;
    }
    lines.push(`${result.severity} ${result.name}: ${result.gap}`);
    if (result.detail) {
      lines.push(`detail: ${result.detail}`);
    }
  }

  const failures = results.filter((result) => !result.ok && result.severity === 'NEW_REGRESSION');
  const blockers = results.filter((result) => !result.ok && result.severity === 'KNOWN_BLOCKER');
  if (failures.length === 0 && blockers.length === 0) {
    lines.push('verification passed');
  } else {
    lines.push(`verification failed: ${failures.length} new regressions, ${blockers.length} known blockers`);
  }

  return lines.join('\n');
};

export const runVerification = ({
  steps = verificationSteps,
  repoDir = repoRoot,
  exec = (command) =>
    spawnSync(command[0], command.slice(1), {
      cwd: repoDir,
      encoding: 'utf8',
      shell: false
    }),
  knownBlockers = new Set(
    (process.env.OPEN_KRAKEN_VERIFY_KNOWN_BLOCKERS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  )
} = {}) => {
  const results = steps.map((step) => {
    const run = exec(step.command);
    const ok = run.status === 0;
    const severity = ok ? 'PASS' : classifyFailure({ step, run, knownBlockers });
    const detail = [run.stdout, run.stderr]
      .filter(Boolean)
      .join('\n')
      .trim()
      .split('\n')
      .slice(-4)
      .join(' | ');

    return {
      name: step.name,
      ok,
      severity,
      gap: step.gapHint,
      detail
    };
  });

  return {
    ok: results.every((result) => result.ok),
    results,
    summary: formatSummary({ results })
  };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = runVerification();
  console.log(report.summary);
  process.exit(report.ok ? 0 : 1);
}

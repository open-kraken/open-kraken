# open-kraken Migration Manual Checklist

## Verify Entry

- Run `npm run verify:migration` from `/Users/claire/IdeaProjects/open-kraken`.
- The entrypoint must execute the stable script names `test:go`, `test:web:routes`, `test:e2e:smoke`, and `test:e2e:browser`.
- Expected pass condition: `test:web:routes`, `test:e2e:smoke`, and `test:e2e:browser` return exit code `0`, while `test:go` must either return exit code `0` or a classified blocker exit from `scripts/verify-go-tests.sh`; the output must end with either `verification passed` or a classified blocker/regression summary.
- `npm run test:e2e:browser` is the fixed browser automation handoff entry until a real browser runner lands behind the same command.
- If no Chrome/Chromium-compatible executable is available, `test:e2e:browser` must print a blocked classification with the missing executable condition, required executable/env precondition, and fallback route gate instead of silently passing.

## Required UI Coverage

- Chat page enters through the shared `AppShell` route outlet and renders the chat surface for `ws_open_kraken`.
- Members page enters through the shared `AppShell` route outlet and renders role/status coordination content for `ws_open_kraken`.
- Roadmap page enters through the shared `AppShell` route outlet and renders roadmap/project-data stream wording from shell realtime state.
- Terminal page enters through the shared `AppShell` route outlet and renders terminal attach/output wording plus shell connection detail.

If any one of the four surfaces is absent, the route gate is a failure and must be treated as a regression.

## Failure Classification

### Existing blockers

- Use this category only for already-known environment-wide issues such as pre-existing Go toolchain/bootstrap failures outside this task's change set.
- The verify output must print `KNOWN_BLOCKER` and include the blocked step name plus the gap summary.
- Current known blockers for this repository snapshot include the machine-level Go toolchain mismatch surfaced through `test:go`.

### New regressions

- Use this category for any newly introduced failure in chat, members, roadmap, terminal, verify script wiring, or smoke command behavior.
- The verify output must print `NEW_REGRESSION` and include the failing step plus the missing contract surface.
- Example gaps: `missing chat panel assertion`, `missing terminal panel assertion`, `smoke command omitted verify step`.

## Smoke Expectations

- `test:e2e:smoke` must verify the root `package.json` entry still exposes `verify:migration`.
- `test:e2e:smoke` must verify the mock server still serves chat, members, roadmap, and terminal attach flows.
- `test:e2e:smoke` must also verify the `verify:migration` entrypoint definition includes:
  - the Go gate
  - reusable step names
  - explicit pass criteria
  - classified failure summaries for known blockers vs new regressions
- `test:e2e:browser` must keep the first real browser route scope frozen to `/chat`, `/members`, `/roadmap`, and `/terminal` until the browser runner expands intentionally.
- `verify:migration` must execute `test:e2e:browser`, not just mention it in expected pass conditions.

# Browser E2E

## First Route Scope

The first real browser target set is frozen to:

- `/chat`
- `/members`
- `/roadmap`
- `/terminal`

These routes already render through the shared `AppShell` and expose stable route selectors:

- `[data-shell-route]`
- `[data-route-page="chat"]`
- `[data-route-page="members"]`
- `[data-route-page="roadmap"]`
- `[data-route-page="terminal"]`

## Current Entry

- Executable command: `npm run test:e2e:browser`
- Manifest: `/Users/claire/IdeaProjects/open-kraken/e2e/browser/browser-smoke.manifest.json`
- Browser runner: `/Users/claire/IdeaProjects/open-kraken/scripts/verify-browser-smoke.mjs`

The current script launches headless Chrome, opens `/roadmap` through the built `AppShell`, and verifies:

- route landing on `/roadmap`
- active AppShell navigation state
- roadmap/project-data page entry markers
- presence of the shared shell notice outlet together with local document feedback

If `OPEN_KRAKEN_BROWSER_BASE_URL` is unset, the script builds `web/dist`, starts a local static server with minimal roadmap/project-data API fixtures, and probes that local route. If the env var is set, the script probes the provided base URL instead.

Runtime classification:

- `classification=pass`: a real headless browser opened `/roadmap` and the required page markers were found.
- `classification=blocked`: no compatible browser executable was found; the script prints the checked paths, the required `OPEN_KRAKEN_BROWSER_EXECUTABLE` override path, and the fallback route gate.
- `classification=fail`: browser launch or page assertions regressed.

## Future Playwright Handoff

Required environment:

- `OPEN_KRAKEN_BROWSER_BASE_URL`

Landing path:

1. Keep the root command name `npm run test:e2e:browser`.
2. Preserve `/roadmap` as the minimum real-browser gate while adding deeper specs.
3. Add browser specs under `e2e/browser/*.spec.ts`.
4. Limit the first navigation set to `/chat`, `/members`, `/roadmap`, and `/terminal`.
5. Anchor assertions on the manifest selectors before adding deeper page-local selectors.

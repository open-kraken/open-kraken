import { spawn, spawnSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = path.join(repoRoot, 'web');
const distRoot = path.join(webRoot, 'dist');
const fixturePath = path.join(repoRoot, 'backend/tests/fixtures/workspace-fixture.json');
const preferredPort = Number(process.env.OPEN_KRAKEN_BROWSER_SMOKE_PORT ?? 4174);
const EXIT_BROWSER_REGRESSION = 60;
const EXIT_BROWSER_BLOCKED = 61;
const browserCandidates = [
  process.env.OPEN_KRAKEN_BROWSER_EXECUTABLE,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
].filter(Boolean);

const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
const manifest = JSON.parse(await readFile(path.join(repoRoot, 'e2e/browser/browser-smoke.manifest.json'), 'utf8'));

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const normalizeHtml = (html) => html.replace(/\s+/g, ' ').trim();

const readStaticAsset = async (pathname) => {
  const targetPath = pathname === '/' ? path.join(distRoot, 'index.html') : path.join(distRoot, pathname.slice(1));
  try {
    const body = await readFile(targetPath);
    return {
      body,
      contentType: contentTypes[path.extname(targetPath)] ?? 'application/octet-stream'
    };
  } catch {
    return {
      body: await readFile(path.join(distRoot, 'index.html')),
      contentType: 'text/html; charset=utf-8'
    };
  }
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
};

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

const listen = (server, port) =>
  new Promise((resolve, reject) => {
    const handleError = (error) => {
      server.off('listening', handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off('error', handleError);
      resolve(undefined);
    };
    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(port, '127.0.0.1');
  });

const assertCommand = (command, args, cwd) => {
  const run = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (run.status !== 0) {
    throw new Error([`${command} ${args.join(' ')} failed`, run.stdout, run.stderr].filter(Boolean).join('\n'));
  }
};

const resolveBrowserExecutable = async () => {
  for (const candidate of browserCandidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // keep scanning
    }
  }
  return null;
};

const printBlocked = (reason, details) => {
  console.log(`[verify-browser-smoke] classification=blocked reason=${reason}`);
  for (const detail of details) {
    console.log(`[verify-browser-smoke] ${detail}`);
  }
};

const runChrome = (browserExecutable, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(browserExecutable, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr || `chrome exited with ${code}`));
    });
  });

if (!process.env.OPEN_KRAKEN_BROWSER_BASE_URL) {
  assertCommand('npm', ['--prefix', webRoot, 'run', 'build'], repoRoot);
}

const localServer = http.createServer(async (req, res) => {
  const address = localServer.address();
  const activePort = typeof address === 'object' && address ? address.port : preferredPort;
  const requestUrl = new URL(req.url ?? '/', `http://127.0.0.1:${activePort}`);

  if (requestUrl.pathname === '/api/v1/workspaces/ws_open_kraken/roadmap') {
    if (req.method === 'GET') {
      return sendJson(res, 200, {
        readOnly: false,
        storage: 'workspace',
        warning: '',
        roadmap: {
          objective: fixture.roadmap.objective,
          tasks: [
            { id: 'task_1', number: 1, title: 'Freeze reusable backend and browser DTO names.', status: 'done', pinned: true },
            { id: 'task_2', number: 2, title: 'Provide mock chat, member, roadmap, and terminal flows.', status: 'in_progress', pinned: false }
          ]
        }
      });
    }
    if (req.method === 'PUT') {
      const body = JSON.parse(await readBody(req));
      return sendJson(res, 200, {
        readOnly: false,
        storage: 'workspace',
        warning: '',
        roadmap: body.roadmap
      });
    }
  }

  if (requestUrl.pathname === '/api/v1/workspaces/ws_open_kraken/project-data') {
    if (req.method === 'GET') {
      return sendJson(res, 200, {
        readOnly: false,
        storage: 'workspace',
        warning: '',
        payload: fixture.projectData
      });
    }
    if (req.method === 'PUT') {
      const body = JSON.parse(await readBody(req));
      return sendJson(res, 200, {
        readOnly: false,
        storage: 'workspace',
        warning: '',
        payload: body.payload
      });
    }
  }

  const response = await readStaticAsset(requestUrl.pathname);
  res.writeHead(200, { 'content-type': response.contentType });
  res.end(response.body);
});

const browserExecutable = await resolveBrowserExecutable();

if (!browserExecutable) {
  printBlocked('missing_browser', [
    `checked executables: ${browserCandidates.join(', ') || 'none'}`,
    'set OPEN_KRAKEN_BROWSER_EXECUTABLE to a Chrome/Chromium-compatible binary or install one of the default macOS browser targets',
    'fallback gate while blocked: npm run test:web:routes'
  ]);
  process.exit(EXIT_BROWSER_BLOCKED);
}

let baseUrl = process.env.OPEN_KRAKEN_BROWSER_BASE_URL ?? `http://127.0.0.1:${preferredPort}`;
let usingLocalServer = false;

try {
  if (!process.env.OPEN_KRAKEN_BROWSER_BASE_URL) {
    try {
      await listen(localServer, preferredPort);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE' && !process.env.OPEN_KRAKEN_BROWSER_SMOKE_PORT) {
        await listen(localServer, 0);
      } else {
        throw error;
      }
    }
    const address = localServer.address();
    const activePort = typeof address === 'object' && address ? address.port : preferredPort;
    baseUrl = `http://127.0.0.1:${activePort}`;
    usingLocalServer = true;
  }

  const dumpRoute = async (routePath) =>
    runChrome(browserExecutable, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--window-size=1440,1280',
      '--virtual-time-budget=12000',
      '--dump-dom',
      new URL(routePath, baseUrl).toString()
    ]);

  const roadmapUrl = new URL('/roadmap', baseUrl).toString();
  const dumpedDom = await dumpRoute('/roadmap');
  const normalized = normalizeHtml(dumpedDom);

  const terminalUrl = new URL('/terminal', baseUrl).toString();
  const terminalDom = await dumpRoute('/terminal');
  const terminalNormalized = normalizeHtml(terminalDom);

  const roadmapSelectors = manifest.requiredSelectors.slice(0, 1);
  for (const selector of roadmapSelectors) {
    if (!normalized.includes(selector.replaceAll('"', '&quot;').replaceAll('[', '').split('=')[0])) {
      break;
    }
  }

  const requiredRoadmapSnippets = [
    'data-shell-route="roadmap"',
    'data-route-page="roadmap"',
    'data-page-entry="roadmap-runtime"',
    'Roadmap and project data stream',
    'formal <code>/roadmap</code> entry inside AppShell navigation',
    'Save roadmap',
    'Save project data',
    'Global notices',
    'app-shell__nav-link app-shell__nav-link--active'
  ];

  for (const snippet of requiredRoadmapSnippets) {
    if (!normalized.includes(snippet)) {
      throw new Error(`browser roadmap smoke missing snippet: ${snippet}`);
    }
  }

  const requiredTerminalSnippets = [
    'data-shell-route="terminal"',
    'data-route-page="terminal"',
    'data-terminal-runtime="connected-panel"',
    'Session attach and output stream shell',
    'Replay-safe buffer',
    'terminal.attach',
    'terminal.snapshot',
    'terminal.delta',
    'terminal.status'
  ];

  for (const snippet of requiredTerminalSnippets) {
    if (!terminalNormalized.includes(snippet)) {
      throw new Error(`browser terminal smoke missing snippet: ${snippet}`);
    }
  }

  console.log(`[verify-browser-smoke] classification=pass browser=${browserExecutable}`);
  console.log(`[verify-browser-smoke] roadmap route rendered via ${roadmapUrl}`);
  console.log(`[verify-browser-smoke] terminal route rendered via ${terminalUrl}`);
} catch (error) {
  console.error('[verify-browser-smoke] classification=fail reason=browser_smoke_regression');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(EXIT_BROWSER_REGRESSION);
} finally {
  if (usingLocalServer) {
    await new Promise((resolve, reject) => localServer.close((error) => (error ? reject(error) : resolve())));
  }
}

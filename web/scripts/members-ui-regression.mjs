import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fixture from '../../backend/tests/fixtures/workspace-fixture.json' with { type: 'json' };

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = dirname(scriptDir);
const distDir = join(webRoot, 'dist');
const snapshotPath = join(webRoot, 'src/test/__snapshots__/members-page.browser.snapshot.html');
const artifactDir = join(webRoot, 'artifacts/ui-regression');
const screenshotPath = join(artifactDir, 'members-page.png');
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 4173;
const virtualTimeBudget = '10000';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const normalizeHtml = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/> </g, '><')
    .trim();

const hashOf = (value) => createHash('sha256').update(value).digest('hex');

const runChrome = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(chromePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
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
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`chrome_exit_${code}: ${stderr}`));
    });
  });

const readStaticResponse = async (pathname) => {
  const targetPath = pathname === '/' ? join(distDir, 'index.html') : join(distDir, pathname.slice(1));

  try {
    const body = await readFile(targetPath);
    return {
      body,
      contentType: contentTypes[extname(targetPath)] ?? 'application/octet-stream'
    };
  } catch {
    return {
      body: await readFile(join(distDir, 'index.html')),
      contentType: 'text/html; charset=utf-8'
    };
  }
};

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);

  if (requestUrl.pathname === '/api/workspaces/current/members') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(fixture.members));
    return;
  }

  if (requestUrl.pathname === `/api/v1/workspaces/${fixture.workspace.id}/members`) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ readOnly: false, members: fixture.members }));
    return;
  }

  if (requestUrl.pathname === '/api/workspaces/current/roadmap') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(fixture.roadmap));
    return;
  }

  if (requestUrl.pathname === `/api/v1/workspaces/${fixture.workspace.id}/roadmap`) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ readOnly: false, storage: 'workspace', warning: '', roadmap: fixture.roadmap }));
    return;
  }

  if (requestUrl.pathname === '/api/workspaces/current/summary') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        workspaceId: fixture.workspace.id,
        membersOnline: fixture.members.members.length,
        activeConversationId: fixture.conversations[0]?.id ?? 'conv_general'
      })
    );
    return;
  }

  const response = await readStaticResponse(requestUrl.pathname);
  res.writeHead(200, { 'Content-Type': response.contentType });
  res.end(response.body);
});

await rm(artifactDir, { recursive: true, force: true });
await mkdir(artifactDir, { recursive: true });
await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

try {
  await runChrome([
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--window-size=1440,1280',
    `--screenshot=${screenshotPath}`,
    `--virtual-time-budget=${virtualTimeBudget}`,
    `http://127.0.0.1:${port}/members`
  ]);

  const { stdout } = await runChrome([
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--window-size=1440,1280',
    `--virtual-time-budget=${virtualTimeBudget}`,
    '--dump-dom',
    `http://127.0.0.1:${port}/members`
  ]);

  const normalizedActual = normalizeHtml(stdout);
  const normalizedExpected = normalizeHtml(await readFile(snapshotPath, 'utf8'));

  if (normalizedActual !== normalizedExpected) {
    await writeFile(join(artifactDir, 'members-page.actual.html'), normalizedActual, 'utf8');
    throw new Error(
      `members_ui_snapshot_mismatch expected=${hashOf(normalizedExpected)} actual=${hashOf(normalizedActual)}`
    );
  }

  const screenshotBuffer = await readFile(screenshotPath);
  if (screenshotBuffer.length === 0) {
    throw new Error('members_ui_screenshot_empty');
  }

  await writeFile(
    join(artifactDir, 'members-page.meta.json'),
    JSON.stringify(
      {
        domHash: hashOf(normalizedActual),
        route: '/members',
        screenshotBytes: screenshotBuffer.length,
        screenshotPath
      },
      null,
      2
    ),
    'utf8'
  );
} finally {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

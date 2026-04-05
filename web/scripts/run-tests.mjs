import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';
import { spawn } from 'node:child_process';

const rootDir = new URL('..', import.meta.url);
const srcDir = new URL('../src', import.meta.url);
const rootPath = fileURLToPath(rootDir);
const srcPath = fileURLToPath(srcDir);
const filter = process.argv[2] ?? '';

const collectFiles = (directoryPath) => {
  const entries = readdirSync(directoryPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = `${directoryPath}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.test.mjs')) {
      files.push(entryPath);
    }
  }
  return files;
};

const files = collectFiles(srcPath)
  .map((filePath) => relative(rootPath, filePath))
  .filter((path) => path.includes(filter));

if (files.length === 0) {
  console.error(`No test files matched filter: ${filter || '(all)'}`);
  process.exit(1);
}

const child = spawn(process.execPath, ['--test', ...files], {
  cwd: rootPath,
  stdio: 'inherit'
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});

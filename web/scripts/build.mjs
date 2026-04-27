import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = dirname(scriptDir);
const outdir = `${webRoot}/dist`;
const entryPoint = `${webRoot}/src/main.tsx`;
const viteEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => key.startsWith('VITE_'))
);

await rm(outdir, { recursive: true, force: true });
await mkdir(`${outdir}/assets`, { recursive: true });

const result = await build({
  entryPoints: [entryPoint],
  outdir: `${outdir}/assets`,
  bundle: true,
  conditions: ['style'],
  define: {
    'import.meta.env': JSON.stringify({
      ...viteEnv,
      DEV: false,
      PROD: true,
      MODE: 'production'
    })
  },
  format: 'esm',
  jsx: 'automatic',
  metafile: true,
  entryNames: 'app',
  assetNames: 'app',
  loader: {
    '.css': 'css',
    '.ts': 'ts',
    '.tsx': 'tsx'
  }
});

const outputs = Object.keys(result.metafile.outputs);
const jsOutput = outputs.find((output) => output.endsWith('.js'));
const cssOutput = outputs.find((output) => output.endsWith('.css'));

if (!jsOutput || !cssOutput) {
  throw new Error('Expected both JS and CSS build outputs for the app shell bundle.');
}

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>open-kraken</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Space+Grotesk:wght@500;600;700&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="./assets/${cssOutput.split('/').at(-1)}" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./assets/${jsOutput.split('/').at(-1)}"></script>
  </body>
</html>
`;

await writeFile(`${outdir}/index.html`, html, 'utf8');

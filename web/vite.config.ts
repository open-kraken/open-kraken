import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const webSrc = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  appType: 'spa',
  base: '/',
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      '@': path.join(webSrc, 'src')
    },
    // Prefer TypeScript entrypoints over legacy .mjs when the import has no extension.
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json']
  },
  css: {
    modules: {
      /**
       * `dashesOnly` made Vite emit only camelCase keys (`ledgerPage`) while the app uses
       * bracket keys (`styles['ledger-page']`), so classes were undefined in `vite` dev — filters looked unstyled.
       * `dashes` keeps original dashed names in the import object (matches esbuild production build).
       */
      localsConvention: 'dashes' as const
    }
  },
  server: {
    host: '127.0.0.1',
    port: 3100,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/healthz': 'http://127.0.0.1:8080',
      '/ws': {
        target: 'ws://127.0.0.1:8080',
        ws: true
      }
    }
  }
});

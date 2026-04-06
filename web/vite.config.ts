import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webSrc = path.dirname(fileURLToPath(import.meta.url));

const viteConfig = {
  appType: 'spa',
  base: '/',
  resolve: {
    alias: {
      '@': path.join(webSrc, 'src')
    },
    // Prefer TypeScript entrypoints over legacy .mjs when the import has no extension.
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json']
  },
  css: {
    modules: {
      localsConvention: 'dashesOnly' as const
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
};

export default viteConfig;

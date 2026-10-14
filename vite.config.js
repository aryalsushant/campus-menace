import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// /privacy and /terms are standalone pages. Vercel serves them via cleanUrls;
// this does the same for the dev and preview servers.
const LEGAL = ['privacy', 'terms'];
const cleanUrls = () => {
  const rewrite = (req, _res, next) => {
    const path = (req.url || '').split('?')[0].replace(/\/$/, '');
    if (LEGAL.includes(path.slice(1))) req.url = `${path}.html`;
    next();
  };
  return {
    name: 'legal-clean-urls',
    configureServer: s => void s.middlewares.use(rewrite),
    configurePreviewServer: s => void s.middlewares.use(rewrite),
  };
};

export default defineConfig({
  plugins: [react(), cleanUrls()],
  server: { host: '127.0.0.1', port: 5173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        ...Object.fromEntries(LEGAL.map(p => [p, resolve(import.meta.dirname, `${p}.html`)])),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});

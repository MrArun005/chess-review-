import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SharedArrayBuffer (multi-threaded Stockfish) requires cross-origin isolation.
// These headers are applied to the dev server and preview server. Production
// hosting must set them too — see vercel.json / netlify.toml.
const crossOriginIsolation = {
  name: 'cross-origin-isolation',
  configureServer(server: { middlewares: { use: (fn: (req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      next();
    });
  },
  configurePreviewServer(server: { middlewares: { use: (fn: (req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), crossOriginIsolation],
  worker: {
    format: 'es',
  },
  // Stockfish assets in public/engine are served as-is; do not pre-bundle them.
  optimizeDeps: {
    exclude: ['stockfish'],
  },
});

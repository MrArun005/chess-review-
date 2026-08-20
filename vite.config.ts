import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The engine runs single-threaded (no SharedArrayBuffer), so cross-origin
// isolation is not required. Leaving the COOP/COEP headers off keeps
// third-party connections used by online play unencumbered.

export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  // Stockfish assets in public/engine are served as-is; do not pre-bundle them.
  optimizeDeps: {
    exclude: ['stockfish'],
  },
});

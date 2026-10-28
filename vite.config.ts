import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';
import path from 'path';
import { defineConfig } from 'vite';

// Stand der Auslieferung für den Footer: Build-Zeitpunkt und Commit. Gebaut
// wird beim Deployment (GitHub Actions), also ist das der letzte Publish.
const commit = (() => {
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; }
})();

export default defineConfig({
  base: '/arch-review/',
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(commit),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  server: {
    // fest auf IPv4: sonst lauscht Vite auf macOS nur auf [::1], und Aufrufe
    // über 127.0.0.1 (bzw. Browser, die localhost so auflösen) laufen ins Leere
    host: '127.0.0.1',
    // sample-data kann als geteilter Ordner gewählt werden — Schreibzugriffe
    // der App dürfen keinen Dev-Server-Reload auslösen
    watch: { ignored: ['**/sample-data/**'] },
  },
  build: {
    rollupOptions: {
      output: {
        // grosse, nur bei Bedarf genutzte Bibliotheken als eigene Chunks
        manualChunks: { pdfjs: ['pdfjs-dist'], pdflib: ['pdf-lib'], msal: ['@azure/msal-browser'] },
      },
    },
  },
});

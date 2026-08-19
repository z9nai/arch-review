import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/arch-review/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  server: {
    // sample-data kann als geteilter Ordner gewählt werden — Schreibzugriffe
    // der App dürfen keinen Dev-Server-Reload auslösen
    watch: { ignored: ['**/sample-data/**'] },
  },
  build: {
    rollupOptions: {
      output: {
        // grosse, nur bei Bedarf genutzte Bibliotheken als eigene Chunks
        manualChunks: { pdfjs: ['pdfjs-dist'], pdflib: ['pdf-lib'] },
      },
    },
  },
});

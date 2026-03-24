import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.js'),
      name: 'VoiceRealtimeSDK',
      formats: ['es', 'cjs'],
      fileName: format => (format === 'es' ? 'index.mjs' : 'index.cjs')
    },
    rollupOptions: {
      external: ['agora-rtc-sdk-ng'],
      output: {
        exports: 'named'
      }
    },
    sourcemap: true,
    emptyOutDir: true,
    outDir: 'dist'
  }
});

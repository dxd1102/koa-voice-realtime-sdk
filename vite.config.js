/* eslint-disable import/no-extraneous-dependencies -- demo devDependencies */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');

const PRE2_PROXY_TARGET = 'https://saibotan-pre2.100credit.cn';

const openApiProxy = {
  '/openapi': {
    target: PRE2_PROXY_TARGET,
    changeOrigin: true,
    secure: true
  }
};

export default defineConfig({
  plugins: [basicSsl()],
  root: __dirname,
  resolve: {
    alias: {
      '@koi-video/voice-realtime-sdk-beta': path.join(pkgRoot, 'src', 'index.js')
    }
  },
  server: {
    port: 5174,
    host: true,
    https: true,
    open: true,
    proxy: openApiProxy
  },
  preview: {
    host: true,
    port: 5174,
    https: true,
    proxy: openApiProxy
  }
});

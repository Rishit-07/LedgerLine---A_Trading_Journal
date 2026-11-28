import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { cloudflare } from '@cloudflare/vite-plugin';

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version ?? '';

const proxy = { '/api': 'http://127.0.0.1:8787' };
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [cloudflare()],
  server: { proxy },
  preview: { proxy },
});

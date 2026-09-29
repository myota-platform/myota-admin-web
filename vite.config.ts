// The repository keeps these vendored assets under web/ for the compatibility
// package. Vite executes this file in Node, while the application typecheck
// does not load Node's ambient type declarations.
// @ts-ignore -- Vite's runtime provides the Node module.
import { readFileSync } from 'node:fs';
// @ts-ignore -- Vite's runtime provides the Node module.
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const root = resolve((import.meta as ImportMeta & { dirname: string }).dirname);
const legacyAssetTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function legacyVendorPlugin() {
  return {
    name: 'myota-legacy-vendor-assets',
    configureServer(server: { middlewares: { use: (handler: (request: any, response: any, next: () => void) => void) => void } }) {
      server.middlewares.use((request, response, next) => {
        const requestPath = request.url?.split('?')[0] || '';
        if (!requestPath.startsWith('/vendor/')) return next();
        const file = resolve(root, 'web', requestPath.slice(1));
        if (!file.startsWith(resolve(root, 'web', 'vendor')) || !file.match(/\.(css|js)$/)) return next();
        try {
          const extension = file.slice(file.lastIndexOf('.'));
          response.statusCode = 200;
          response.setHeader('Content-Type', legacyAssetTypes[extension] || 'application/octet-stream');
          response.end(readFileSync(file));
        } catch {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [vue(), legacyVendorPlugin()],
  server: {
    port: 8099,
    proxy: {
      '/v1': 'http://localhost:8080',
      '/healthz': 'http://localhost:8080',
    },
  },
});

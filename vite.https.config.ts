import fs from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5174,
    https:
      fs.existsSync('certs/key.pem') && fs.existsSync('certs/cert.pem')
        ? {
            key: fs.readFileSync('certs/key.pem'),
            cert: fs.readFileSync('certs/cert.pem'),
          }
        : undefined,
    // Forces Vite to use node:https (HTTP/1.1) instead of node:http2 under Bun for iOS Safari
    proxy: {},
  },
});

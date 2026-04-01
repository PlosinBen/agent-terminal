import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fixMacOsPath, createServerCore, getPreferredPort, setupGracefulShutdown } from './server-core.js';
import { logger } from './core/logger.js';
import { checkForServerUpdate } from './update-check.js';
import { initRegistry } from './providers/registry.js';

fixMacOsPath();

// Initialize provider registry (detect available providers)
await initRegistry().catch((err) => {
  logger.error(`[startup] Failed to initialize provider registry: ${err instanceof Error ? err.message : String(err)}`);
});

const core = createServerCore();
setupGracefulShutdown(core);

// Resolve client/dist — detect packaged Electron context via env from main.ts
function getClientDistDir(): string {
  const resourcesPath = process.env.ELECTRON_RESOURCES_PATH;
  if (resourcesPath) {
    return path.join(resourcesPath, 'app.asar', 'client', 'dist');
  }
  // Dev / standalone server: two levels up from server/dist/
  return path.resolve(import.meta.dirname, '../../client/dist');
}

const clientDistDir = getClientDistDir();

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  let filePath = path.join(clientDistDir, url.pathname);

  // Serve index.html for SPA routes (non-file paths)
  if (!path.extname(filePath)) {
    filePath = path.join(clientDistDir, 'index.html');
  }

  // Prevent directory traversal
  if (!filePath.startsWith(clientDistDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Fallback to index.html for SPA
      fs.readFile(path.join(clientDistDir, 'index.html'), (err2, indexData) => {
        if (err2) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(indexData);
      });
      return;
    }
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// Attach WS to the HTTP server (shared port)
core.wsServer.attachToServer(httpServer);

const preferredPort = getPreferredPort();
httpServer.listen(preferredPort, () => {
  const addr = httpServer.address();
  const port = typeof addr === 'object' && addr ? addr.port : preferredPort;
  console.log(`[server] Standalone running on http://localhost:${port}`);

  // Version check for server-only mode (not when launched from Electron)
  if (!process.env.ELECTRON_RESOURCES_PATH) {
    const require = createRequire(import.meta.url);
    const { version } = require('../../package.json') as { version: string };
    setTimeout(() => {
      checkForServerUpdate(version).catch(() => {});
    }, 2000);
  }
});

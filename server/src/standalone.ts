import http from 'http';
import fs from 'fs';
import path from 'path';
import { fixMacOsPath, createServerCore, getPreferredPort, setupGracefulShutdown } from './server-core.js';
import { logger } from './core/logger.js';

fixMacOsPath();

const core = createServerCore();
setupGracefulShutdown(core);

// Resolve client/dist relative to server/dist/standalone.js → ../../client/dist
const clientDistDir = path.resolve(import.meta.dirname, '../../client/dist');

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
  logger.info(`Agent Terminal standalone server running on http://localhost:${port}`);
});

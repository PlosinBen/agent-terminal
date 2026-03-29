#!/usr/bin/env node
// Build a server-mode tarball for standalone deployment (requires system node >= 18)

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const serverPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'package.json'), 'utf8'));

const VERSION = pkg.version;
const PLATFORM = process.platform === 'darwin' ? 'darwin' : 'linux';
const ARCH = process.arch;
const TARBALL_DIR = 'agent-terminal-server';
const TARBALL_NAME = `agent-terminal-server-${VERSION}-${PLATFORM}-${ARCH}.tar.gz`;

const RELEASE_DIR = path.join(ROOT, 'release');
const STAGING = path.join(RELEASE_DIR, TARBALL_DIR);

// Clean
fs.rmSync(STAGING, { recursive: true, force: true });
fs.mkdirSync(STAGING, { recursive: true });

// Copy build outputs
fs.cpSync(path.join(ROOT, 'server', 'dist'), path.join(STAGING, 'server', 'dist'), { recursive: true });
fs.cpSync(path.join(ROOT, 'client', 'dist'), path.join(STAGING, 'client', 'dist'), { recursive: true });
fs.cpSync(path.join(ROOT, 'shared'), path.join(STAGING, 'shared'), { recursive: true });

// Write minimal package.json with server production deps only
const tarPkg = {
  name: 'agent-terminal-server',
  version: VERSION,
  type: 'module',
  engines: { node: '>=18.0.0' },
  dependencies: serverPkg.dependencies,
};
// Remove electron-updater from server tarball (not needed in server-only mode)
delete tarPkg.dependencies['electron-updater'];
fs.writeFileSync(path.join(STAGING, 'package.json'), JSON.stringify(tarPkg, null, 2));

// Install production deps
console.log('[build] Installing production dependencies...');
execSync('npm install --omit=dev', { cwd: STAGING, stdio: 'inherit' });

// Create bin entrypoint
fs.mkdirSync(path.join(STAGING, 'bin'));
fs.writeFileSync(path.join(STAGING, 'bin', 'agent-terminal-server'), `#!/bin/sh
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$DIR/server/dist/standalone.js" "$@"
`, { mode: 0o755 });

// Create tarball
const TARBALL_PATH = path.join(RELEASE_DIR, TARBALL_NAME);
execSync(`tar -czf "${TARBALL_NAME}" "${TARBALL_DIR}"`, { cwd: RELEASE_DIR, stdio: 'inherit' });

// Clean staging
fs.rmSync(STAGING, { recursive: true, force: true });

console.log(`[build] Server tarball: ${TARBALL_PATH}`);

import fs from 'fs';
import path from 'path';
import os from 'os';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const LOG_DIR = path.join(os.homedir(), '.config', 'agent-terminal');
const LOG_PATH = path.join(LOG_DIR, 'debug.log');

class Logger {
  private level: LogLevel = 'info';
  private stream: fs.WriteStream | null = null;

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private ensureStream(): fs.WriteStream {
    if (!this.stream) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      this.rotateIfNeeded();
      this.stream = fs.createWriteStream(LOG_PATH, { flags: 'a' });
    }
    return this.stream;
  }

  private rotateIfNeeded(): void {
    try {
      const stats = fs.statSync(LOG_PATH);
      if (stats.size > MAX_SIZE) {
        const rotated = LOG_PATH + '.1';
        if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
        fs.renameSync(LOG_PATH, rotated);
      }
    } catch {
      // File doesn't exist yet
    }
  }

  private write(level: LogLevel, message: string): void {
    if (LEVEL_ORDER[level] > LEVEL_ORDER[this.level]) return;
    const timestamp = new Date().toISOString();
    const line = `${timestamp} [${level.toUpperCase()}] ${message}\n`;
    this.ensureStream().write(line);
  }

  error(msg: string): void { this.write('error', msg); }
  warn(msg: string): void { this.write('warn', msg); }
  info(msg: string): void { this.write('info', msg); }
  debug(msg: string): void { this.write('debug', msg); }

  close(): void {
    this.stream?.end();
    this.stream = null;
  }
}

export const logger = new Logger();

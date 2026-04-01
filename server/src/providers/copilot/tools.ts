import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import type { ChatCompletionTool } from 'openai/resources/index.js';

const execFileAsync = promisify(execFile);

export interface ToolDefinition {
  spec: ChatCompletionTool;
  requiresPermission: boolean;
  execute(input: Record<string, unknown>, cwd: string): Promise<string>;
}

// ── Tool implementations ──────────────────────────────────────────────────

const BashTool: ToolDefinition = {
  requiresPermission: true,
  spec: {
    type: 'function',
    function: {
      name: 'Bash',
      description: 'Execute a shell command in the project directory.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute.' },
          timeout: { type: 'number', description: 'Timeout in milliseconds (default 30000).' },
        },
        required: ['command'],
      },
    },
  },
  async execute(input, cwd) {
    const command = String(input.command ?? '');
    const timeout = Number(input.timeout ?? 30000);
    try {
      const { stdout, stderr } = await execFileAsync('bash', ['-c', command], {
        cwd,
        timeout,
        maxBuffer: 1024 * 1024 * 10,
      });
      const output = [stdout, stderr].filter(Boolean).join('\n').trim();
      return output || '(no output)';
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      const parts = [e.stdout, e.stderr, e.message].filter(Boolean).join('\n');
      return `Error: ${parts}`;
    }
  },
};

const ReadTool: ToolDefinition = {
  requiresPermission: false,
  spec: {
    type: 'function',
    function: {
      name: 'Read',
      description: 'Read the contents of a file.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute or relative path to the file.' },
          offset: { type: 'number', description: 'Line number to start reading from (1-based).' },
          limit: { type: 'number', description: 'Number of lines to read.' },
        },
        required: ['file_path'],
      },
    },
  },
  async execute(input, cwd) {
    const filePath = resolvePath(String(input.file_path ?? ''), cwd);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      const offset = input.offset ? Number(input.offset) - 1 : 0;
      const limit = input.limit ? Number(input.limit) : lines.length;
      return lines.slice(offset, offset + limit).join('\n');
    } catch (err) {
      return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

const WriteTool: ToolDefinition = {
  requiresPermission: true,
  spec: {
    type: 'function',
    function: {
      name: 'Write',
      description: 'Write content to a file (creates or overwrites).',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Path to the file to write.' },
          content: { type: 'string', description: 'Content to write to the file.' },
        },
        required: ['file_path', 'content'],
      },
    },
  },
  async execute(input, cwd) {
    const filePath = resolvePath(String(input.file_path ?? ''), cwd);
    const content = String(input.content ?? '');
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf8');
      return `Written ${content.split('\n').length} lines to ${filePath}`;
    } catch (err) {
      return `Error writing file: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

const EditTool: ToolDefinition = {
  requiresPermission: true,
  spec: {
    type: 'function',
    function: {
      name: 'Edit',
      description: 'Replace an exact string in a file with a new string.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Path to the file to edit.' },
          old_string: { type: 'string', description: 'The exact string to find and replace.' },
          new_string: { type: 'string', description: 'The replacement string.' },
        },
        required: ['file_path', 'old_string', 'new_string'],
      },
    },
  },
  async execute(input, cwd) {
    const filePath = resolvePath(String(input.file_path ?? ''), cwd);
    const oldStr = String(input.old_string ?? '');
    const newStr = String(input.new_string ?? '');
    try {
      const content = await fs.readFile(filePath, 'utf8');
      if (!content.includes(oldStr)) {
        return `Error: old_string not found in ${filePath}`;
      }
      const count = (content.match(new RegExp(escapeRegex(oldStr), 'g')) ?? []).length;
      if (count > 1) {
        return `Error: old_string matches ${count} locations in ${filePath}. Make it more specific.`;
      }
      await fs.writeFile(filePath, content.replace(oldStr, newStr), 'utf8');
      return `Edited ${filePath}`;
    } catch (err) {
      return `Error editing file: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

const GlobTool: ToolDefinition = {
  requiresPermission: false,
  spec: {
    type: 'function',
    function: {
      name: 'Glob',
      description: 'Find files matching a glob pattern.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern (e.g. "**/*.ts").' },
          path: { type: 'string', description: 'Directory to search in (default: cwd).' },
        },
        required: ['pattern'],
      },
    },
  },
  async execute(input, cwd) {
    const pattern = String(input.pattern ?? '');
    const searchPath = input.path ? resolvePath(String(input.path), cwd) : cwd;
    try {
      const matches: string[] = [];
      for await (const file of fs.glob(pattern, { cwd: searchPath })) {
        matches.push(file);
        if (matches.length >= 200) break;
      }
      if (matches.length === 0) return '(no matches)';
      return matches.join('\n');
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

const GrepTool: ToolDefinition = {
  requiresPermission: false,
  spec: {
    type: 'function',
    function: {
      name: 'Grep',
      description: 'Search for a pattern in files.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search for.' },
          path: { type: 'string', description: 'File or directory to search in (default: cwd).' },
          include: { type: 'string', description: 'Glob pattern to filter files (e.g. "*.ts").' },
        },
        required: ['pattern'],
      },
    },
  },
  async execute(input, cwd) {
    const pattern = String(input.pattern ?? '');
    const searchPath = input.path ? resolvePath(String(input.path), cwd) : cwd;
    const include = input.include ? String(input.include) : undefined;

    try {
      const args = ['-rn', '--max-count=5', pattern];
      if (include) args.push('--include', include);
      args.push(searchPath);

      const { stdout } = await execFileAsync('grep', args, {
        cwd,
        timeout: 10000,
        maxBuffer: 1024 * 512,
      }).catch(err => ({ stdout: (err as { stdout?: string }).stdout ?? '', stderr: '' }));

      return stdout.trim() || '(no matches)';
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ── Exports ───────────────────────────────────────────────────────────────

export const TOOLS: Record<string, ToolDefinition> = {
  Bash: BashTool,
  Read: ReadTool,
  Write: WriteTool,
  Edit: EditTool,
  Glob: GlobTool,
  Grep: GrepTool,
};

export const TOOL_SPECS: ChatCompletionTool[] = Object.values(TOOLS).map(t => t.spec);

// ── Helpers ───────────────────────────────────────────────────────────────

function resolvePath(filePath: string, cwd: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  if (filePath.startsWith('~/')) {
    return path.join(process.env.HOME ?? '~', filePath.slice(2));
  }
  return path.resolve(cwd, filePath);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

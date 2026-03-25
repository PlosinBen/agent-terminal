import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface ClipboardContent {
  type: 'image' | 'file_image' | 'file_path' | 'text';
  data?: string;      // base64 for images
  mediaType?: string;  // image/png, image/jpeg, etc.
  filePath?: string;
  text?: string;
  size?: number;
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

function detectPlatform(): 'darwin' | 'linux-x11' | 'linux-wayland' | 'unsupported' {
  const platform = os.platform();
  if (platform === 'darwin') return 'darwin';
  if (platform === 'linux') {
    return process.env.WAYLAND_DISPLAY ? 'linux-wayland' : 'linux-x11';
  }
  return 'unsupported';
}

function getClipboardImage(): { data: Buffer; mediaType: string } | null {
  const platform = detectPlatform();
  try {
    switch (platform) {
      case 'darwin': {
        // Check if clipboard has image
        const types = execSync('osascript -e "clipboard info"', { encoding: 'utf8' });
        if (!types.includes('«class PNGf»') && !types.includes('«class TIFF»')) return null;
        const tmpFile = path.join(os.tmpdir(), `clipboard-${Date.now()}.png`);
        execSync(`osascript -e 'set png to (the clipboard as «class PNGf»)' -e 'set fp to open for access POSIX file "${tmpFile}" with write permission' -e 'write png to fp' -e 'close access fp'`);
        const data = fs.readFileSync(tmpFile);
        fs.unlinkSync(tmpFile);
        return { data, mediaType: 'image/png' };
      }
      case 'linux-x11': {
        const types = execSync('xclip -selection clipboard -t TARGETS -o', { encoding: 'utf8' });
        if (!types.includes('image/png')) return null;
        const data = execSync('xclip -selection clipboard -t image/png -o');
        return { data, mediaType: 'image/png' };
      }
      case 'linux-wayland': {
        const types = execSync('wl-paste --list-types', { encoding: 'utf8' });
        if (!types.includes('image/png')) return null;
        const data = execSync('wl-paste --type image/png');
        return { data, mediaType: 'image/png' };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function readClipboard(projectCwd: string): ClipboardContent {
  // 1. Check for image data
  const image = getClipboardImage();
  if (image) {
    return {
      type: 'image',
      data: image.data.toString('base64'),
      mediaType: image.mediaType,
      size: image.data.length,
    };
  }

  // 2. Get text from clipboard
  let text = '';
  try {
    const platform = detectPlatform();
    switch (platform) {
      case 'darwin':
        text = execSync('pbpaste', { encoding: 'utf8' });
        break;
      case 'linux-x11':
        text = execSync('xclip -selection clipboard -o', { encoding: 'utf8' });
        break;
      case 'linux-wayland':
        text = execSync('wl-paste', { encoding: 'utf8' });
        break;
    }
  } catch {
    return { type: 'text', text: '' };
  }

  // 3. Check if text is a file path to an image
  const trimmed = text.trim();
  if (trimmed.startsWith('/') || trimmed.startsWith('~')) {
    const resolved = trimmed.startsWith('~') ? path.join(os.homedir(), trimmed.slice(1)) : trimmed;
    const ext = path.extname(resolved).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext) && fs.existsSync(resolved)) {
      const data = fs.readFileSync(resolved);
      return {
        type: 'file_image',
        data: data.toString('base64'),
        mediaType: `image/${ext === '.jpg' ? 'jpeg' : ext.slice(1)}`,
        filePath: resolved,
        size: data.length,
      };
    }

    // 4. Simplify path if within project
    if (resolved.startsWith(projectCwd + '/')) {
      return { type: 'file_path', text: resolved.slice(projectCwd.length + 1) };
    }
    return { type: 'file_path', text: resolved };
  }

  return { type: 'text', text };
}

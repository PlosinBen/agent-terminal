import https from 'https';

const GITHUB_OWNER = 'PlosinBen';
const GITHUB_REPO = 'agent-terminal';

interface GithubRelease {
  tag_name: string;
  html_url: string;
}

function parseVersion(tag: string): number[] {
  return tag.replace(/^v/, '').split('.').map(Number);
}

function isNewer(remote: string, local: string): boolean {
  const r = parseVersion(remote);
  const l = parseVersion(local);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] ?? 0;
    const lv = l[i] ?? 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

export async function checkForServerUpdate(currentVersion: string): Promise<void> {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'agent-terminal-server' },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk; });
      res.on('end', () => {
        try {
          const release: GithubRelease = JSON.parse(data);
          if (isNewer(release.tag_name, currentVersion)) {
            console.log(`\n[update] New version available: ${release.tag_name} (current: v${currentVersion})`);
            console.log(`[update] ${release.html_url}`);
            console.log(`[update] To upgrade: curl -fsSL https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/install.sh | bash -s -- server\n`);
          }
        } catch {
          // Ignore parse errors
        }
        resolve();
      });
    });
    req.on('error', () => resolve());
    req.setTimeout(5000, () => { req.destroy(); resolve(); });
  });
}

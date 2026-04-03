import { execFileSync } from 'child_process';
import { logger } from '../../core/logger.js';
import { loadConfig } from '../../core/config.js';

interface CopilotTokenResponse {
  token: string;
  expires_at: number; // unix timestamp
}

export class CopilotAuth {
  private copilotToken: string | null = null;
  private expiresAt = 0;

  /** Get a valid Copilot session token, refreshing if necessary. */
  async getToken(): Promise<string> {
    const now = Date.now() / 1000;
    if (this.copilotToken && this.expiresAt - 300 > now) {
      return this.copilotToken;
    }

    const githubToken = this.getGitHubToken();
    const tokenData = await this.fetchCopilotToken(githubToken);

    this.copilotToken = tokenData.token;
    this.expiresAt = tokenData.expires_at;
    logger.info(`[copilot:auth] token refreshed, expires at ${new Date(this.expiresAt * 1000).toISOString()}`);

    return this.copilotToken;
  }

  /**
   * Check if Copilot auth is available (gh CLI installed + logged in + has Copilot).
   */
  async isAvailable(): Promise<boolean> {
    try {
      const githubToken = this.getGitHubToken();
      await this.fetchCopilotToken(githubToken);
      return true;
    } catch {
      return false;
    }
  }

  private getGitHubToken(): string {
    const ghPath = loadConfig().providerPaths?.copilot || 'gh';
    try {
      const token = execFileSync(ghPath, ['auth', 'token'], { encoding: 'utf8', timeout: 5000 }).trim();
      if (!token) throw new Error('gh auth token returned empty string');
      return token;
    } catch (err) {
      throw new Error(
        `GitHub Copilot auth failed: could not get token via "${ghPath} auth token".\n` +
        `Make sure you have the GitHub CLI installed and are logged in with "gh auth login".\n` +
        `You can set the gh binary path in Settings > Providers.\n` +
        `Original error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async fetchCopilotToken(githubToken: string): Promise<CopilotTokenResponse> {
    const response = await fetch('https://api.github.com/copilot_internal/v2/token', {
      method: 'GET',
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: 'application/json',
        'User-Agent': 'agent-terminal/0.3',
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Failed to get Copilot token (HTTP ${response.status}): ${body}\n` +
        `Make sure your GitHub account has an active Copilot subscription.`,
      );
    }

    const data = await response.json() as CopilotTokenResponse;
    if (!data.token) {
      throw new Error('Copilot token response missing "token" field');
    }
    return data;
  }
}

// Copilot AI-credit usage auto-sync via GitHub's billing REST API.
//
// Enterprise/org-managed Copilot seats do NOT expose usage on the personal
// billing endpoint, so we read the org/enterprise AI-credit usage report
// (admin-scoped) and reconcile the local ledger with the authoritative figure.
//
// Endpoint (API version 2026-03-10):
//   GET /organizations/{org}/settings/billing/ai_credit/usage
//   GET /enterprises/{enterprise}/settings/billing/ai_credit/usage
// Response: { timePeriod, organization?, user?, usageItems: [{ grossQuantity, netQuantity, grossAmount, ... }] }
// 1 AI credit = $0.01. grossQuantity = total credits consumed (what the gauge wants).

import * as vscode from 'vscode';

const TOKEN_KEY = 'tokenAnxiety.github.billingToken';
const API_VERSION = '2026-03-10';

export interface SyncOptions {
  scope: 'organization' | 'enterprise';
  slug: string;
  username?: string;
  now?: Date;
}

export interface SyncResult {
  usedCredits: number;
  asOf: Date;
  detail: string;
}

interface AiCreditUsageItem {
  product?: string;
  sku?: string;
  model?: string;
  unitType?: string;
  pricePerUnit?: number;
  grossQuantity?: number;
  grossAmount?: number;
  netQuantity?: number;
  netAmount?: number;
}

interface AiCreditUsageResponse {
  timePeriod?: { year: number; month?: number; day?: number };
  organization?: string;
  user?: string;
  usageItems?: AiCreditUsageItem[];
}

export class CopilotBillingSync {
  private readonly secrets: vscode.SecretStorage;

  constructor(secrets: vscode.SecretStorage) {
    this.secrets = secrets;
  }

  async setToken(token: string): Promise<void> {
    await this.secrets.store(TOKEN_KEY, token.trim());
  }

  async hasToken(): Promise<boolean> {
    return Boolean(await this.secrets.get(TOKEN_KEY));
  }

  async clearToken(): Promise<void> {
    await this.secrets.delete(TOKEN_KEY);
  }

  /** GitHub login to scope usage to. Prefers the explicit override, else the VS Code GitHub sign-in. */
  private async resolveUsername(override?: string): Promise<string | undefined> {
    if (override && override.trim()) return override.trim();
    try {
      const session = await vscode.authentication.getSession('github', ['read:user'], { createIfNone: false });
      return session?.account.label;
    } catch {
      return undefined;
    }
  }

  async sync(opts: SyncOptions): Promise<SyncResult> {
    const token = await this.secrets.get(TOKEN_KEY);
    if (!token) {
      throw new Error('No GitHub billing token. Run "Token Anxiety: Connect GitHub Billing".');
    }
    if (!opts.slug) {
      throw new Error(`Set "tokenAnxiety.github.slug" to your ${opts.scope} slug.`);
    }

    const now = opts.now ?? new Date();
    const base =
      opts.scope === 'enterprise'
        ? `https://api.github.com/enterprises/${encodeURIComponent(opts.slug)}/settings/billing/ai_credit/usage`
        : `https://api.github.com/organizations/${encodeURIComponent(opts.slug)}/settings/billing/ai_credit/usage`;

    const url = new URL(base);
    url.searchParams.set('year', String(now.getUTCFullYear()));
    url.searchParams.set('month', String(now.getUTCMonth() + 1));
    const username = await this.resolveUsername(opts.username);
    if (username) url.searchParams.set('user', username);

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': API_VERSION,
        },
      });
    } catch (e) {
      throw new Error(`Network error reaching GitHub: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (res.status === 401) throw new Error('GitHub returned 401 — the billing token is invalid or expired.');
    if (res.status === 403) {
      throw new Error(
        'GitHub returned 403 — the token lacks billing-read scope. Use manage_billing:enterprise / read:enterprise (enterprise) or an org billing-admin token.',
      );
    }
    if (res.status === 404) {
      throw new Error(
        `GitHub returned 404 — check the ${opts.scope} slug "${opts.slug}" and that the enhanced billing platform is enabled.`,
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`GitHub billing API error ${res.status}. ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as AiCreditUsageResponse;
    const items = Array.isArray(data.usageItems) ? data.usageItems : [];

    // Total AI credits consumed this calendar month (independent of included-allowance offsets).
    let usedCredits = items.reduce((sum, it) => sum + (Number(it.grossQuantity) || 0), 0);
    // Fallback: derive credits from dollar amounts if quantities are absent (1 credit = $0.01).
    if (usedCredits === 0) {
      const usd = items.reduce((sum, it) => sum + (Number(it.grossAmount) || 0), 0);
      if (usd > 0) usedCredits = usd / 0.01;
    }

    const detail = username ? `user ${username}` : `${opts.scope} ${opts.slug} (all users)`;
    return { usedCredits, asOf: now, detail };
  }
}

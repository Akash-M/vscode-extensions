// Sidebar dashboard (webview): budget summary, burn rate, projected run-out,
// the "where your spend went" breakdown, and quick actions. Themed via VS Code
// CSS variables so it matches the user's color theme.

import * as vscode from 'vscode';
import type { BudgetSummary } from './core/index.ts';
import { fmtCredits, fmtUsd, pct, isoDate } from './format.ts';

export interface DashboardData {
  summary: BudgetSummary;
  byModel: Array<{ modelId: string; credits: number; usd: number; count: number }>;
  planLabel: string;
  lastSyncedAt?: Date;
}

export class DashboardProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'tokenAnxiety.dashboard';
  private view?: vscode.WebviewView;
  private readonly getData: () => DashboardData;

  constructor(getData: () => DashboardData) {
    this.getData = getData;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage((msg: { type?: string }) => {
      if (msg?.type === 'estimate') vscode.commands.executeCommand('tokenAnxiety.estimate');
      else if (msg?.type === 'sync') vscode.commands.executeCommand('tokenAnxiety.sync');
      else if (msg?.type === 'setup') vscode.commands.executeCommand('tokenAnxiety.setup');
    });
    this.refresh();
  }

  refresh(): void {
    if (this.view) {
      this.view.webview.html = this.render(this.getData());
    }
  }

  private render(data: DashboardData): string {
    const s = data.summary;
    const total = s.usedCredits || 1;
    const synced = data.lastSyncedAt ? `Last synced ${data.lastSyncedAt.toLocaleString()}` : 'Not synced yet';
    const accent =
      s.pctUsed >= 0.9
        ? 'var(--vscode-statusBarItem-errorBackground, #f14c4c)'
        : s.pctUsed >= 0.5
          ? 'var(--vscode-statusBarItem-warningBackground, #cca700)'
          : 'var(--vscode-charts-green, #73c991)';

    const bars = data.byModel
      .map((r) => {
        const p = Math.round((r.credits / total) * 100);
        return `<div class="bar"><span class="lbl" title="${r.modelId}">${r.modelId}</span>
          <span class="track"><span class="fill" style="width:${p}%"></span></span>
          <span class="val">${fmtCredits(r.credits)} · ${p}%</span></div>`;
      })
      .join('');

    const topModel = data.byModel[0];
    const tip =
      topModel && topModel.credits / total > 0.5
        ? `<div class="tip">${Math.round((topModel.credits / total) * 100)}% of spend went to <b>${topModel.modelId}</b>. Routing routine work to a cheaper model could reclaim a big chunk.</div>`
        : '';

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; font-size: 13px; }
  .big { font-size: 28px; font-weight: 700; color: ${accent}; line-height: 1; }
  .big small { font-size: 12px; color: var(--vscode-descriptionForeground); font-weight: 400; }
  .meter { height: 8px; border-radius: 5px; background: var(--vscode-editorWidget-background, #2a2a2a); overflow: hidden; margin: 10px 0 6px; }
  .meter .fill { height: 100%; width: ${Math.min(Math.round(s.pctUsed * 100), 100)}%; background: ${accent}; }
  .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
  .warn { color: var(--vscode-statusBarItem-warningForeground, #f5d76e); }
  h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--vscode-descriptionForeground); margin: 18px 0 8px; }
  .bar { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
  .bar .lbl { width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar .track { flex: 1; height: 7px; background: var(--vscode-editorWidget-background, #2a2a2a); border-radius: 4px; overflow: hidden; }
  .bar .fill { height: 100%; background: var(--vscode-charts-blue, #6cb6ff); }
  .bar .val { width: 92px; text-align: right; color: var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums; }
  .tip { margin-top: 10px; padding: 9px 11px; border-radius: 6px; background: var(--vscode-textBlockQuote-background); border-left: 3px solid ${accent}; font-size: 12px; }
  .actions { display: flex; gap: 8px; margin-top: 18px; flex-wrap: wrap; }
  button { font: inherit; padding: 6px 11px; border: none; border-radius: 4px; cursor: pointer;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button.sec { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .sync { margin-top: 14px; font-size: 11px; color: var(--vscode-descriptionForeground); }
</style></head>
<body>
  <div class="muted">${data.planLabel}${s.promoActive ? ' · promo' : ''}${s.pooled ? ' · pooled' : ''}</div>
  <div class="big">${pct(s.pctRemaining)} <small>left · ${fmtCredits(s.remainingCredits)} of ${fmtCredits(s.allowanceCredits)}</small></div>
  <div class="meter"><div class="fill"></div></div>
  <div class="muted">Used ${fmtCredits(s.usedCredits)} (${fmtUsd(s.usedUsd)}) · burn ~${Math.round(s.burnPerDayCredits)} cr/day</div>
  <div class="${s.runsOutEarly ? 'warn' : 'muted'}">${s.projectedRunOut ? `Projected run-out ${isoDate(s.projectedRunOut)}${s.runsOutEarly ? ' — before cycle reset' : ''}` : 'No usage yet this cycle'}</div>

  <h3>Where your spend went</h3>
  ${bars || '<div class="muted">No tracked requests yet.</div>'}
  ${tip}

  <div class="actions">
    <button onclick="send('estimate')">Estimate a request</button>
    <button class="sec" onclick="send('sync')">Sync</button>
    <button class="sec" onclick="send('setup')">Change plan</button>
  </div>
  <div class="sync">${synced} · Sync reconciles with GitHub Copilot billing.</div>

  <script>
    const vscodeApi = acquireVsCodeApi();
    function send(type) { vscodeApi.postMessage({ type }); }
  </script>
</body></html>`;
  }
}

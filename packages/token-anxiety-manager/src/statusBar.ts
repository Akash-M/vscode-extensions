// The ambient budget gauge in the status bar: glanceable, color-coded, with a
// rich hover tooltip (burn rate + projected run-out).

import * as vscode from 'vscode';
import type { BudgetSummary } from './core/index.ts';
import { fmtCredits, pct, isoDate } from './format.ts';

export class BudgetStatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'tokenAnxiety.openDashboard';
    this.item.name = 'Token Anxiety';
  }

  update(summary: BudgetSummary, planLabel: string): void {
    this.item.text = `$(pulse) ${fmtCredits(summary.usedCredits)}/${fmtCredits(summary.allowanceCredits)} · ${pct(summary.pctRemaining)} left`;

    if (summary.pctUsed >= 0.9) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (summary.pctUsed >= 0.5) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.item.backgroundColor = undefined;
    }

    const md = new vscode.MarkdownString(undefined, true);
    md.appendMarkdown(`**${planLabel}**${summary.promoActive ? ' · _promo active_' : ''}${summary.pooled ? ' · _pooled_' : ''}\n\n`);
    md.appendMarkdown(`Used **${fmtCredits(summary.usedCredits)}** of ${fmtCredits(summary.allowanceCredits)} (${pct(summary.pctUsed)})\n\n`);
    md.appendMarkdown(`Burn ~${Math.round(summary.burnPerDayCredits)} cr/day · ${Math.round(summary.daysLeftInCycle)} days left in cycle\n\n`);
    if (summary.projectedRunOut) {
      md.appendMarkdown(`${summary.runsOutEarly ? '$(warning) ' : '$(check) '}Projected run-out: **${isoDate(summary.projectedRunOut)}**`);
    }
    this.item.tooltip = md;
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}

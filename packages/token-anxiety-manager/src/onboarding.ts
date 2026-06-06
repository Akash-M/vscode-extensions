// First-run / change-plan flow: prompt for tool + plan, store in settings.
// No sign-in, no credentials — we only need the plan to know the allowance.

import * as vscode from 'vscode';
import { CostRegistry, type Tool } from './core/index.ts';

interface PlanPickItem extends vscode.QuickPickItem {
  id: string;
}

export async function runSetup(registry: CostRegistry): Promise<boolean> {
  const toolPick = await vscode.window.showQuickPick(
    [
      { label: 'GitHub Copilot', value: 'copilot' as Tool },
      { label: 'Claude Code', value: 'claude-code' as Tool },
      { label: 'Codex', value: 'codex' as Tool },
    ],
    { placeHolder: 'Which assistant are you using?', ignoreFocusOut: true },
  );
  if (!toolPick) return false;

  const plans = registry.listPlans(toolPick.value);
  const planItems: PlanPickItem[] = plans.map((p) => ({
    id: p.id,
    label: p.label,
    description: p.monthlyCredits
      ? `${p.monthlyCredits.toLocaleString()} cr/mo${p.promo ? ` (promo: ${p.promo.monthlyCredits?.toLocaleString()})` : ''}`
      : `$${p.monthlyUsd}/mo`,
  }));
  const planPick = await vscode.window.showQuickPick(planItems, {
    placeHolder: 'Which plan are you on?',
    ignoreFocusOut: true,
  });
  if (!planPick) return false;

  const cfg = vscode.workspace.getConfiguration('tokenAnxiety');
  await cfg.update('tool', toolPick.value, vscode.ConfigurationTarget.Global);
  await cfg.update('plan', planPick.id, vscode.ConfigurationTarget.Global);

  vscode.window.showInformationMessage(
    `Token Anxiety set to ${planPick.label}. No sign-in needed — usage is tracked locally.`,
  );
  return true;
}

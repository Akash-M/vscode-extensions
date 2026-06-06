// Activation entry point. Instantiates the cost engine and wires it into the
// VS Code surfaces: status-bar gauge, pre-flight estimator, @tokenanxiety chat
// participant, sidebar dashboard, onboarding, manual sync, and — new — automatic
// reconciliation from GitHub Copilot Enterprise billing.

import * as vscode from 'vscode';
import {
  CostRegistry,
  Estimator,
  Ledger,
  type Tool,
  type Feature,
  type LedgerEntry,
  type EstimateResult,
} from './core/index.ts';
import { MementoStorage } from './storage.ts';
import { BudgetStatusBar } from './statusBar.ts';
import { runEstimate } from './estimateCommand.ts';
import { registerChatParticipant } from './chatParticipant.ts';
import { DashboardProvider } from './dashboard.ts';
import { runSetup } from './onboarding.ts';
import { CopilotBillingSync } from './sync/copilotBilling.ts';
import { fmtCredits } from './format.ts';

const LAST_SYNC_KEY = 'tokenAnxiety.lastSyncedAt';
const ONBOARDED_KEY = 'tokenAnxiety.onboarded';

export function activate(context: vscode.ExtensionContext): void {
  const registry = new CostRegistry();
  const estimator = new Estimator(registry);
  const ledger = new Ledger(new MementoStorage(context.globalState), registry);
  const billing = new CopilotBillingSync(context.secrets);

  const cfg = () => vscode.workspace.getConfiguration('tokenAnxiety');
  const getTool = (): Tool => (cfg().get<string>('tool') ?? 'copilot') as Tool;
  const getPlan = () =>
    registry.getPlan(cfg().get<string>('plan') ?? 'copilot-enterprise') ??
    registry.getPlan('copilot-enterprise')!;
  const getCompareIds = (): string[] => {
    const ids = cfg().get<string[]>('compareModels') ?? [];
    return ids.length ? ids : registry.listModels(getTool()).map((m) => m.id);
  };
  const highCost = () => cfg().get<number>('highCostCredits') ?? 50;
  const getLastSync = (): Date | undefined => {
    const v = context.globalState.get<string>(LAST_SYNC_KEY);
    return v ? new Date(v) : undefined;
  };

  const statusBar = new BudgetStatusBar();
  const dashboard = new DashboardProvider(() => ({
    summary: ledger.summary(getPlan()),
    byModel: ledger.byModel(new Date()),
    planLabel: getPlan().label,
    lastSyncedAt: getLastSync(),
  }));

  const refresh = () => {
    statusBar.update(ledger.summary(getPlan()), getPlan().label);
    dashboard.refresh();
  };

  const record = (modelId: string, est: EstimateResult, feature: Feature) => {
    const entry: LedgerEntry = {
      ts: new Date().toISOString(),
      tool: getTool(),
      modelId,
      feature,
      inputTokens: est.assumptions.inputTokens,
      outputTokens: est.assumptions.expectedOutputTokens,
      cachedTokens: est.assumptions.cachedInputTokens,
      costUsd: est.expected.totalUsd,
      costCredits: est.expected.totalCredits,
      estimated: true,
    };
    ledger.record(entry);
    if (est.expected.totalCredits >= highCost()) {
      vscode.window.showWarningMessage(
        `High-cost request: ~${fmtCredits(est.expected.totalCredits)} on ${modelId}. Consider a cheaper model or trimming context.`,
      );
    }
    refresh();
  };

  // ---- Sync (GitHub billing auto-pull, with manual fallback) ----
  const manualSync = async (): Promise<boolean> => {
    const value = await vscode.window.showInputBox({
      prompt: 'Credits used this cycle (from your GitHub usage dashboard)',
      validateInput: (x) => (x.trim() === '' || isNaN(Number(x)) ? 'Enter a number' : undefined),
      ignoreFocusOut: true,
    });
    if (value === undefined) return false;
    ledger.applySync(Number(value));
    await context.globalState.update(LAST_SYNC_KEY, new Date().toISOString());
    refresh();
    vscode.window.showInformationMessage('Synced with manually entered usage.');
    return true;
  };

  const connectBilling = async (): Promise<boolean> => {
    const token = await vscode.window.showInputBox({
      prompt:
        'GitHub token with billing read — enterprise: manage_billing:enterprise or read:enterprise; org: billing admin',
      password: true,
      ignoreFocusOut: true,
      placeHolder: 'github_pat_… or ghp_…',
    });
    if (!token) return false;
    await billing.setToken(token);
    vscode.window.showInformationMessage('GitHub billing token saved securely. Syncing…');
    return runBillingSync(false);
  };

  const runBillingSync = async (silent: boolean): Promise<boolean> => {
    if (!(await billing.hasToken())) {
      if (!silent) {
        const pick = await vscode.window.showInformationMessage(
          'No GitHub billing token configured. Connect one to auto-sync your Copilot AI-credit usage?',
          'Connect',
          'Enter manually',
        );
        if (pick === 'Connect') return connectBilling();
        if (pick === 'Enter manually') return manualSync();
      }
      return false;
    }
    const scope = (cfg().get<string>('github.scope') ?? 'enterprise') as 'enterprise' | 'organization';
    const slug = (cfg().get<string>('github.slug') ?? '').trim();
    const username = (cfg().get<string>('github.username') ?? '').trim();
    if (!slug) {
      if (!silent) {
        vscode.window.showErrorMessage(`Set "tokenAnxiety.github.slug" to your ${scope} slug, then sync again.`);
      }
      return false;
    }
    try {
      const result = await billing.sync({ scope, slug, username });
      ledger.applySync(result.usedCredits);
      await context.globalState.update(LAST_SYNC_KEY, new Date().toISOString());
      refresh();
      if (!silent) {
        vscode.window.showInformationMessage(
          `Synced from GitHub billing (${result.detail}): ${fmtCredits(result.usedCredits)} used this cycle.`,
        );
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!silent) vscode.window.showErrorMessage(`Token Anxiety sync failed: ${msg}`);
      return false;
    }
  };

  let timer: ReturnType<typeof setInterval> | undefined;
  const scheduleAutoSync = () => {
    if (timer) clearInterval(timer);
    const hours = Math.max(cfg().get<number>('autoSyncIntervalHours') ?? 6, 1);
    timer = setInterval(() => {
      void runBillingSync(true);
    }, hours * 3_600_000);
  };

  context.subscriptions.push(
    statusBar,
    { dispose: () => { if (timer) clearInterval(timer); } },
    vscode.window.registerWebviewViewProvider(DashboardProvider.viewType, dashboard),
    vscode.commands.registerCommand('tokenAnxiety.estimate', () =>
      runEstimate({ registry, estimator, tool: getTool(), compareIds: getCompareIds(), onChoose: record }),
    ),
    vscode.commands.registerCommand('tokenAnxiety.openDashboard', () =>
      vscode.commands.executeCommand('workbench.view.extension.tokenAnxiety'),
    ),
    vscode.commands.registerCommand('tokenAnxiety.setup', async () => {
      await runSetup(registry);
      refresh();
    }),
    vscode.commands.registerCommand('tokenAnxiety.sync', () => runBillingSync(false)),
    vscode.commands.registerCommand('tokenAnxiety.connectBilling', () => connectBilling()),
    vscode.commands.registerCommand('tokenAnxiety.disconnectBilling', async () => {
      await billing.clearToken();
      vscode.window.showInformationMessage('GitHub billing token removed.');
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('tokenAnxiety')) return;
      if (e.affectsConfiguration('tokenAnxiety.autoSyncIntervalHours')) scheduleAutoSync();
      refresh();
    }),
  );

  registerChatParticipant(context, { registry, estimator, tool: getTool(), record });

  // First-run onboarding.
  if (!context.globalState.get<boolean>(ONBOARDED_KEY)) {
    void context.globalState.update(ONBOARDED_KEY, true);
    void runSetup(registry).then(() => refresh());
  }

  // Initial silent reconciliation if a billing token is already configured.
  void runBillingSync(true);
  scheduleAutoSync();
  refresh();
}

export function deactivate(): void {
  /* no-op */
}

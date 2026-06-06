// Activation entry point. Instantiates the cost engine and wires it into the
// VS Code surfaces: status-bar gauge, pre-flight estimator, @tokenanxiety chat
// participant, sidebar dashboard, onboarding, and manual GitHub sync.

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
import { fmtCredits } from './format.ts';

export function activate(context: vscode.ExtensionContext): void {
  const registry = new CostRegistry();
  const estimator = new Estimator(registry);
  const ledger = new Ledger(new MementoStorage(context.globalState), registry);

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

  const statusBar = new BudgetStatusBar();
  const dashboard = new DashboardProvider(() => ({
    summary: ledger.summary(getPlan()),
    byModel: ledger.byModel(new Date()),
    planLabel: getPlan().label,
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

  context.subscriptions.push(
    statusBar,
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
    vscode.commands.registerCommand('tokenAnxiety.sync', async () => {
      const value = await vscode.window.showInputBox({
        prompt: 'Credits used this cycle (from your GitHub usage dashboard)',
        validateInput: (x) => (x.trim() === '' || isNaN(Number(x)) ? 'Enter a number' : undefined),
        ignoreFocusOut: true,
      });
      if (value === undefined) return;
      ledger.applySync(Number(value));
      refresh();
      vscode.window.showInformationMessage('Synced with GitHub-reported usage.');
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('tokenAnxiety')) refresh();
    }),
  );

  registerChatParticipant(context, { registry, estimator, tool: getTool(), record });

  // First-run onboarding.
  const ONBOARDED = 'tokenAnxiety.onboarded';
  if (!context.globalState.get<boolean>(ONBOARDED)) {
    void context.globalState.update(ONBOARDED, true);
    void runSetup(registry).then(refresh);
  }

  refresh();
}

export function deactivate(): void {
  /* no-op */
}

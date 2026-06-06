// Pre-flight estimator command: count the request's tokens, compare every
// configured model, and present a cheapest-capable-first picker.

import * as vscode from 'vscode';
import {
  CostRegistry,
  Estimator,
  type Feature,
  type ModelRate,
  type Tool,
  type EstimateResult,
} from './core/index.ts';
import { countTokens, pickDefaultModel } from './tokens.ts';
import { fmtCredits, fmtUsd } from './format.ts';

export interface EstimateDeps {
  registry: CostRegistry;
  estimator: Estimator;
  tool: Tool;
  compareIds: string[];
  onChoose?: (modelId: string, est: EstimateResult, feature: Feature) => void;
}

interface ModelPickItem extends vscode.QuickPickItem {
  modelId: string;
}

export async function runEstimate(deps: EstimateDeps): Promise<void> {
  const text = await vscode.window.showInputBox({
    prompt: 'Describe (or paste) the request to estimate',
    placeHolder: 'e.g. refactor this auth module to use async + retries',
    ignoreFocusOut: true,
  });
  if (text === undefined) return;

  const featurePick = await vscode.window.showQuickPick(
    [
      { label: '$(comment) Chat', value: 'chat' as Feature },
      { label: '$(edit) Edit', value: 'edit' as Feature },
      { label: '$(rocket) Agent run', value: 'agent' as Feature },
    ],
    { placeHolder: 'What kind of request is this?' },
  );
  if (!featurePick) return;

  const lmModel = await pickDefaultModel();
  const inputTokens = await countTokens(lmModel, text);

  const models = deps.compareIds
    .map((id) => deps.registry.getModel(id, deps.tool))
    .filter((m): m is ModelRate => Boolean(m));
  if (models.length === 0) {
    vscode.window.showWarningMessage('Token Anxiety: no models configured for comparison.');
    return;
  }

  const cmp = deps.estimator.compare(models, { inputTokens, feature: featurePick.value });

  const items: ModelPickItem[] = cmp.results.map((r) => {
    const tags: string[] = [];
    if (r.modelId === cmp.recommendedId) tags.push('recommended (cheapest capable)');
    if (r.modelId === cmp.mostExpensiveId) tags.push('most expensive');
    return {
      modelId: r.modelId,
      label: `${r.modelId === cmp.recommendedId ? '$(star-full) ' : ''}${r.label}`,
      description: `${fmtCredits(r.expected.totalCredits)} · ${fmtUsd(r.expected.totalUsd)}`,
      detail: `range ${fmtCredits(r.low.totalCredits)}–${fmtCredits(r.high.totalCredits)}${tags.length ? '  ·  ' + tags.join(', ') : ''}`,
    };
  });

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `~${inputTokens.toLocaleString()} input tokens · pick a model (estimates, not exact)`,
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!picked) return;

  const chosen = cmp.results.find((r) => r.modelId === picked.modelId);
  if (!chosen) return;

  deps.onChoose?.(picked.modelId, chosen, featurePick.value);
  vscode.window.showInformationMessage(
    `${chosen.label}: ~${fmtCredits(chosen.expected.totalCredits)} (${fmtUsd(chosen.expected.totalUsd)}) for this request.`,
  );
}

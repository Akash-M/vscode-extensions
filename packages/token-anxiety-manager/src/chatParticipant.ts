// The @tokenanxiety chat participant: a deliberate-use surface that estimates
// the cost of a prompt for the active model and suggests a cheaper alternative.

import * as vscode from 'vscode';
import {
  CostRegistry,
  Estimator,
  type ModelRate,
  type Tool,
  type EstimateResult,
  type Feature,
} from './core/index.ts';
import { countTokens } from './tokens.ts';
import { fmtCredits, fmtUsd } from './format.ts';

export interface ChatDeps {
  registry: CostRegistry;
  estimator: Estimator;
  tool: Tool;
  record?: (modelId: string, est: EstimateResult, feature: Feature) => void;
}

/** Best-effort map from a VS Code chat model to a registry rate card. */
function matchModel(registry: CostRegistry, tool: Tool, lm: vscode.LanguageModelChat | undefined): ModelRate {
  const all = registry.listModels(tool);
  if (lm) {
    const hay = `${lm.id} ${lm.family} ${lm.name}`.toLowerCase();
    const byName = all.find((m) => hay.includes(m.id.toLowerCase()) || hay.includes(m.label.toLowerCase()));
    if (byName) return byName;
    const byFamily = all.find((m) => hay.includes(m.family));
    if (byFamily) return byFamily;
  }
  return all[0];
}

export function registerChatParticipant(context: vscode.ExtensionContext, deps: ChatDeps): void {
  const handler: vscode.ChatRequestHandler = async (request, _ctx, stream, _token) => {
    const model = matchModel(deps.registry, deps.tool, request.model);
    const inputTokens = await countTokens(request.model, request.prompt);
    const feature: Feature = 'agent';
    const est = deps.estimator.estimate({ model, inputTokens, feature });

    const all = deps.registry.listModels(deps.tool);
    const cmp = deps.estimator.compare(all, { inputTokens, feature });
    const rec = cmp.results.find((r) => r.modelId === cmp.recommendedId);

    stream.markdown(`**Estimate for ${model.label}**\n\n`);
    stream.markdown(`- Input: ~${inputTokens.toLocaleString()} tokens\n`);
    stream.markdown(
      `- Est. cost: **${fmtCredits(est.expected.totalCredits)}** (${fmtUsd(est.expected.totalUsd)}) · range ${fmtCredits(est.low.totalCredits)}–${fmtCredits(est.high.totalCredits)}\n\n`,
    );

    if (rec && rec.modelId !== model.id) {
      const save = est.expected.totalCredits - rec.expected.totalCredits;
      if (save > 0.05) {
        stream.markdown(
          `💡 **${rec.label}** would cost ~${fmtCredits(rec.expected.totalCredits)} — saves ~${fmtCredits(save)} per request.\n\n`,
        );
      }
    }

    stream.button({ command: 'tokenAnxiety.estimate', title: 'Compare all models' });
    deps.record?.(model.id, est, feature);
    return {};
  };

  const participant = vscode.chat.createChatParticipant('tokenAnxiety.participant', handler);
  participant.iconPath = new vscode.ThemeIcon('pulse');
  context.subscriptions.push(participant);
}

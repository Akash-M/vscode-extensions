// Token counting via the VS Code Language Model API (exact, free, no quota
// cost), with a heuristic fallback when no model is available.

import * as vscode from 'vscode';

export async function countTokens(model: vscode.LanguageModelChat | undefined, text: string): Promise<number> {
  if (model) {
    try {
      return await model.countTokens(text);
    } catch {
      // fall through to heuristic
    }
  }
  return Math.ceil((text?.length ?? 0) / 4);
}

/** The user's default/active chat model, if the LM API is available. */
export async function pickDefaultModel(): Promise<vscode.LanguageModelChat | undefined> {
  try {
    const models = await vscode.lm.selectChatModels();
    return models?.[0];
  } catch {
    return undefined;
  }
}

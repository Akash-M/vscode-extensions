// Cost data, seeded from GitHub's published "Models and pricing" table
// (docs.github.com/copilot/reference/copilot-billing/models-and-pricing) and the
// Apr 27 2026 usage-based-billing announcement. All rates USD per 1M tokens.
//
// Verified: 2026-06-06. Re-check the source when GitHub updates the table.

import type { ModelRate, Plan } from './types.ts';

/** GitHub AI Credit conversion: 1 credit = $0.01 USD. */
export const CREDIT_USD = 0.01;

export const RATES_SOURCE =
  'GitHub Models & pricing (docs.github.com/copilot/reference/copilot-billing/models-and-pricing), verified 2026-06-06';

export const MODEL_RATES: ModelRate[] = [
  // ---------------- Copilot · OpenAI family ----------------
  { id: 'gpt-5-mini', label: 'GPT-5 mini', tool: 'copilot', family: 'openai',
    category: 'lightweight', inputPerM: 0.25, cachedInputPerM: 0.025, outputPerM: 2.0 },
  { id: 'gpt-5.3-codex', label: 'GPT-5.3-Codex', tool: 'copilot', family: 'openai',
    category: 'powerful', inputPerM: 1.75, cachedInputPerM: 0.175, outputPerM: 14.0 },
  { id: 'gpt-5.4', label: 'GPT-5.4', tool: 'copilot', family: 'openai',
    category: 'versatile', inputPerM: 2.5, cachedInputPerM: 0.25, outputPerM: 15.0,
    longContext: { thresholdInputTokens: 272_000, rate: { inputPerM: 5.0, cachedInputPerM: 0.5, outputPerM: 22.5 } } },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', tool: 'copilot', family: 'openai',
    category: 'lightweight', inputPerM: 0.75, cachedInputPerM: 0.075, outputPerM: 4.5 },
  { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano', tool: 'copilot', family: 'openai',
    category: 'lightweight', inputPerM: 0.2, cachedInputPerM: 0.02, outputPerM: 1.25 },
  { id: 'gpt-5.5', label: 'GPT-5.5', tool: 'copilot', family: 'openai',
    category: 'powerful', inputPerM: 5.0, cachedInputPerM: 0.5, outputPerM: 30.0,
    longContext: { thresholdInputTokens: 272_000, rate: { inputPerM: 10.0, cachedInputPerM: 1.0, outputPerM: 45.0 } } },

  // ---------------- Copilot · Anthropic family (cache-write applies) ----------------
  { id: 'claude-haiku-4.5', label: 'Claude Haiku 4.5', tool: 'copilot', family: 'anthropic',
    category: 'versatile', inputPerM: 1.0, cachedInputPerM: 0.1, cacheWritePerM: 1.25, outputPerM: 5.0 },
  { id: 'claude-sonnet-4', label: 'Claude Sonnet 4', tool: 'copilot', family: 'anthropic',
    category: 'versatile', inputPerM: 3.0, cachedInputPerM: 0.3, cacheWritePerM: 3.75, outputPerM: 15.0 },
  { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', tool: 'copilot', family: 'anthropic',
    category: 'versatile', inputPerM: 3.0, cachedInputPerM: 0.3, cacheWritePerM: 3.75, outputPerM: 15.0 },
  { id: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6', tool: 'copilot', family: 'anthropic',
    category: 'versatile', inputPerM: 3.0, cachedInputPerM: 0.3, cacheWritePerM: 3.75, outputPerM: 15.0 },
  { id: 'claude-opus-4.5', label: 'Claude Opus 4.5', tool: 'copilot', family: 'anthropic',
    category: 'powerful', inputPerM: 5.0, cachedInputPerM: 0.5, cacheWritePerM: 6.25, outputPerM: 25.0 },
  { id: 'claude-opus-4.6', label: 'Claude Opus 4.6', tool: 'copilot', family: 'anthropic',
    category: 'powerful', inputPerM: 5.0, cachedInputPerM: 0.5, cacheWritePerM: 6.25, outputPerM: 25.0 },
  { id: 'claude-opus-4.7', label: 'Claude Opus 4.7', tool: 'copilot', family: 'anthropic',
    category: 'powerful', inputPerM: 5.0, cachedInputPerM: 0.5, cacheWritePerM: 6.25, outputPerM: 25.0 },
  { id: 'claude-opus-4.8', label: 'Claude Opus 4.8', tool: 'copilot', family: 'anthropic',
    category: 'powerful', inputPerM: 5.0, cachedInputPerM: 0.5, cacheWritePerM: 6.25, outputPerM: 25.0 },

  // ---------------- Copilot · Google family ----------------
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tool: 'copilot', family: 'google',
    category: 'powerful', inputPerM: 1.25, cachedInputPerM: 0.125, outputPerM: 10.0 },
  { id: 'gemini-3-flash', label: 'Gemini 3 Flash', tool: 'copilot', family: 'google',
    category: 'lightweight', inputPerM: 0.5, cachedInputPerM: 0.05, outputPerM: 3.0,
    notes: 'Public preview' },
  { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro', tool: 'copilot', family: 'google',
    category: 'powerful', inputPerM: 2.0, cachedInputPerM: 0.2, outputPerM: 12.0,
    longContext: { thresholdInputTokens: 200_000, rate: { inputPerM: 4.0, cachedInputPerM: 0.4, outputPerM: 18.0 } },
    notes: 'Public preview' },

  // ---------------- Other tools (tool-agnostic demo; ≈ published API rates) ----------------
  { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', tool: 'claude-code', family: 'anthropic',
    category: 'versatile', inputPerM: 3.0, cachedInputPerM: 0.3, cacheWritePerM: 3.75, outputPerM: 15.0,
    source: 'Anthropic API list price (≈ GitHub published rate); verify direct rate' },
  { id: 'claude-opus-4.8', label: 'Claude Opus 4.8', tool: 'claude-code', family: 'anthropic',
    category: 'powerful', inputPerM: 5.0, cachedInputPerM: 0.5, cacheWritePerM: 6.25, outputPerM: 25.0,
    source: 'Anthropic API list price (≈ GitHub published rate); verify direct rate' },
  { id: 'gpt-5.3-codex', label: 'GPT-5.3-Codex', tool: 'codex', family: 'openai',
    category: 'powerful', inputPerM: 1.75, cachedInputPerM: 0.175, outputPerM: 14.0,
    source: 'OpenAI API list price (≈ GitHub published rate); verify direct rate' },
  { id: 'gpt-5-mini', label: 'GPT-5 mini', tool: 'codex', family: 'openai',
    category: 'lightweight', inputPerM: 0.25, cachedInputPerM: 0.025, outputPerM: 2.0,
    source: 'OpenAI API list price (≈ GitHub published rate); verify direct rate' },
];

export const PLANS: Plan[] = [
  // Copilot individual plans (base + flex; not pooled).
  { id: 'copilot-free', label: 'Copilot Free', tool: 'copilot', unit: 'ai_credits',
    monthlyCredits: 0, monthlyUsd: 0, pooled: false,
    notes: 'Numeric AI-credit allowance not published; select models. Completions free/unlimited.' },
  { id: 'copilot-pro', label: 'Copilot Pro', tool: 'copilot', unit: 'ai_credits',
    monthlyCredits: 1500, monthlyUsd: 15, pooled: false, notes: '1,000 base + 500 flex' },
  { id: 'copilot-pro-plus', label: 'Copilot Pro+', tool: 'copilot', unit: 'ai_credits',
    monthlyCredits: 7000, monthlyUsd: 70, pooled: false, notes: '3,900 base + 3,100 flex' },
  { id: 'copilot-max', label: 'Copilot Max', tool: 'copilot', unit: 'ai_credits',
    monthlyCredits: 20000, monthlyUsd: 200, pooled: false, notes: '10,000 base + 10,000 flex' },

  // Copilot org/enterprise plans (pooled at billing-entity level), with Jun–Sep 2026 promo.
  { id: 'copilot-business', label: 'Copilot Business', tool: 'copilot', unit: 'ai_credits',
    monthlyCredits: 1900, monthlyUsd: 19, pooled: true,
    promo: { monthlyCredits: 3000, monthlyUsd: 30, until: '2026-09-01', note: 'Existing-customer transition promo' } },
  { id: 'copilot-enterprise', label: 'Copilot Enterprise', tool: 'copilot', unit: 'ai_credits',
    monthlyCredits: 3900, monthlyUsd: 39, pooled: true,
    promo: { monthlyCredits: 7000, monthlyUsd: 70, until: '2026-09-01', note: 'Existing-customer transition promo' } },

  // Other tools: budget is a user-set dollar cap rather than a fixed allotment.
  { id: 'claude-code', label: 'Claude Code (custom budget)', tool: 'claude-code', unit: 'usd',
    monthlyUsd: 100, pooled: false, notes: 'Example user-set monthly USD budget' },
  { id: 'codex', label: 'Codex (custom budget)', tool: 'codex', unit: 'usd',
    monthlyUsd: 100, pooled: false, notes: 'Example user-set monthly USD budget' },
];

// Core domain types for the Token Anxiety Manager cost engine.
// All monetary rates are USD per 1,000,000 tokens. GitHub AI Credits are a
// fixed-rate dollar unit: 1 AI Credit = $0.01 USD (see CREDIT_USD in rates.ts).

/** The product/billing context a request runs in. Determines budget unit + allowance. */
export type Tool = 'copilot' | 'claude-code' | 'codex';

/** The underlying model vendor/family. */
export type Family = 'openai' | 'anthropic' | 'google';

/** Rough capability tier, used to recommend the cheapest *capable* model. */
export type Category = 'lightweight' | 'versatile' | 'powerful';

/** The unit a plan's budget is denominated in. */
export type BudgetUnit = 'ai_credits' | 'usd';

/** Feature surface that generated a request (completions are free and not tracked). */
export type Feature = 'chat' | 'edit' | 'agent' | 'cli' | 'review';

/** A single price tier (default or long-context). USD per 1M tokens. */
export interface TierRate {
  inputPerM: number;
  cachedInputPerM: number;
  outputPerM: number;
  /** Anthropic models bill a one-off cache-write cost in addition to cached reads. */
  cacheWritePerM?: number;
}

/** A model's full rate card within a given tool. */
export interface ModelRate extends TierRate {
  id: string;
  label: string;
  tool: Tool;
  family: Family;
  category: Category;
  /** Optional long-context tier that applies above a token threshold. */
  longContext?: {
    thresholdInputTokens: number;
    rate: TierRate;
  };
  notes?: string;
  source?: string;
}

/** A subscription plan and its monthly included budget. */
export interface Plan {
  id: string;
  label: string;
  tool: Tool;
  unit: BudgetUnit;
  /** Included credits per user per month (Copilot plans). */
  monthlyCredits?: number;
  /** Normalized dollar value of the monthly allowance. */
  monthlyUsd: number;
  /** Whether the allowance is pooled across the billing entity (org/enterprise). */
  pooled: boolean;
  /** Day of month the allowance resets (default 1). */
  cycleResetDay?: number;
  /** Temporary promotional allowance, if active. */
  promo?: {
    monthlyCredits?: number;
    monthlyUsd: number;
    until: string; // ISO date the promo ends
    note?: string;
  };
  notes?: string;
}

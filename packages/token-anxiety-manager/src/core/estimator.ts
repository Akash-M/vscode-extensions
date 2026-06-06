// Estimation engine: converts a request scenario into a credit/dollar cost with
// a confidence range, and compares models to surface the cheapest capable choice.
//
// Token counting is pluggable. The default HeuristicTokenCounter (~chars/4) keeps
// the engine dependency-free and runnable anywhere; inside the VS Code extension
// we inject an exact counter backed by LanguageModelChat.countTokens(), which is
// free and accurate. The costing logic below is identical regardless of counter.

import type { ModelRate, TierRate, Feature, Category } from './types.ts';
import { CREDIT_USD } from './rates.ts';
import { CostRegistry, categoryRank, defaultRegistry } from './registry.ts';

export interface TokenCounter {
  count(text: string): number;
}

export class HeuristicTokenCounter implements TokenCounter {
  private readonly charsPerToken: number;
  constructor(charsPerToken = 4) {
    this.charsPerToken = charsPerToken;
  }
  count(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / this.charsPerToken);
  }
}

/** Default expected output and [low, high] multipliers by feature surface. */
const OUTPUT_HEURISTICS: Record<Feature, { expected: number; low: number; high: number }> = {
  chat: { expected: 400, low: 0.3, high: 3.0 },
  edit: { expected: 900, low: 0.35, high: 2.8 },
  agent: { expected: 2500, low: 0.4, high: 3.2 },
  cli: { expected: 600, low: 0.3, high: 3.0 },
  review: { expected: 1200, low: 0.4, high: 2.5 },
};

/** Minimum capability tier we consider "appropriate" for each feature. */
const MIN_CATEGORY: Record<Feature, Category> = {
  chat: 'lightweight',
  edit: 'versatile',
  agent: 'versatile',
  cli: 'lightweight',
  review: 'versatile',
};

export interface EstimateInput {
  model: ModelRate;
  /** Total input tokens (prompt + context). */
  inputTokens: number;
  /** Portion of input served from cache (cheaper). Default 0. */
  cachedInputTokens?: number;
  /** Tokens written to cache this turn (Anthropic cache-write). Default 0. */
  cacheWriteTokens?: number;
  /** Known/expected output tokens. If omitted, derived from the feature heuristic. */
  expectedOutputTokens?: number;
  /** The feature surface, used to pick the output heuristic + capability bar. */
  feature?: Feature;
  /** Apply the 10% auto-model-selection discount. */
  autoSelectDiscount?: boolean;
}

export interface CostBreakdown {
  inputUsd: number;
  cachedUsd: number;
  cacheWriteUsd: number;
  outputUsd: number;
  totalUsd: number;
  totalCredits: number;
  outputTokens: number;
}

export interface EstimateResult {
  modelId: string;
  label: string;
  expected: CostBreakdown;
  low: CostBreakdown;
  high: CostBreakdown;
  longContext: boolean;
  discountApplied: boolean;
  assumptions: {
    inputTokens: number;
    cachedInputTokens: number;
    cacheWriteTokens: number;
    feature: Feature;
    expectedOutputTokens: number;
  };
}

function computeBreakdown(
  rate: TierRate,
  freshInput: number,
  cached: number,
  cacheWrite: number,
  output: number,
  discount: boolean,
): CostBreakdown {
  const inputUsd = (freshInput / 1e6) * rate.inputPerM;
  const cachedUsd = (cached / 1e6) * rate.cachedInputPerM;
  const cacheWriteUsd = cacheWrite > 0 && rate.cacheWritePerM ? (cacheWrite / 1e6) * rate.cacheWritePerM : 0;
  const outputUsd = (output / 1e6) * rate.outputPerM;
  let totalUsd = inputUsd + cachedUsd + cacheWriteUsd + outputUsd;
  if (discount) totalUsd *= 0.9;
  return {
    inputUsd,
    cachedUsd,
    cacheWriteUsd,
    outputUsd,
    totalUsd,
    totalCredits: totalUsd / CREDIT_USD,
    outputTokens: output,
  };
}

export class Estimator {
  private readonly registry: CostRegistry;
  private readonly counter: TokenCounter;

  constructor(registry: CostRegistry = defaultRegistry, counter: TokenCounter = new HeuristicTokenCounter()) {
    this.registry = registry;
    this.counter = counter;
  }

  /** Count tokens for arbitrary text using the configured counter. */
  countText(text: string): number {
    return this.counter.count(text);
  }

  estimate(input: EstimateInput): EstimateResult {
    const feature = input.feature ?? 'chat';
    const heur = OUTPUT_HEURISTICS[feature];
    const expectedOut = input.expectedOutputTokens ?? heur.expected;
    const cached = Math.min(input.cachedInputTokens ?? 0, input.inputTokens);
    const freshInput = Math.max(input.inputTokens - cached, 0);
    const cacheWrite = input.cacheWriteTokens ?? 0;
    const discount = input.autoSelectDiscount ?? false;

    const rate = this.registry.effectiveRate(input.model, input.inputTokens);
    const isLong =
      !!input.model.longContext && input.inputTokens > input.model.longContext.thresholdInputTokens;

    const mk = (outTokens: number) =>
      computeBreakdown(rate, freshInput, cached, cacheWrite, Math.round(outTokens), discount);

    // If the caller supplied an expected output, bracket it ±; otherwise use the heuristic spread.
    const lowOut = input.expectedOutputTokens ? expectedOut * 0.5 : expectedOut * heur.low;
    const highOut = input.expectedOutputTokens ? expectedOut * 2 : expectedOut * heur.high;

    return {
      modelId: input.model.id,
      label: input.model.label,
      expected: mk(expectedOut),
      low: mk(lowOut),
      high: mk(highOut),
      longContext: isLong,
      discountApplied: discount,
      assumptions: {
        inputTokens: input.inputTokens,
        cachedInputTokens: cached,
        cacheWriteTokens: cacheWrite,
        feature,
        expectedOutputTokens: expectedOut,
      },
    };
  }

  /**
   * Estimate the same scenario across many models, sorted cheapest-first, and
   * flag the recommended choice: the cheapest model that still meets the
   * feature's minimum capability tier.
   */
  compare(
    models: ModelRate[],
    scenario: Omit<EstimateInput, 'model'>,
  ): {
    results: EstimateResult[];
    recommendedId: string | undefined;
    cheapestId: string | undefined;
    mostExpensiveId: string | undefined;
  } {
    const feature = scenario.feature ?? 'chat';
    const minRank = categoryRank(MIN_CATEGORY[feature]);

    const results = models
      .map((model) => ({ model, est: this.estimate({ ...scenario, model }) }))
      .sort((a, b) => a.est.expected.totalUsd - b.est.expected.totalUsd);

    const capable = results.filter((r) => categoryRank(r.model.category) >= minRank);
    const recommendedId = (capable[0] ?? results[0])?.est.modelId;

    return {
      results: results.map((r) => r.est),
      recommendedId,
      cheapestId: results[0]?.est.modelId,
      mostExpensiveId: results[results.length - 1]?.est.modelId,
    };
  }
}

export const defaultEstimator = new Estimator();

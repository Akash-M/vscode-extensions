// Cost-model registry: normalized lookup over models and plans, with the
// tier selection and unit conversions the estimator and ledger rely on.

import type { ModelRate, Plan, Tool, TierRate, Category } from './types.ts';
import { MODEL_RATES, PLANS, CREDIT_USD } from './rates.ts';

const CATEGORY_RANK: Record<Category, number> = {
  lightweight: 0,
  versatile: 1,
  powerful: 2,
};

export function categoryRank(c: Category): number {
  return CATEGORY_RANK[c];
}

export class CostRegistry {
  private readonly models: ModelRate[];
  private readonly plans: Plan[];

  constructor(models: ModelRate[] = MODEL_RATES, plans: Plan[] = PLANS) {
    this.models = models;
    this.plans = plans;
  }

  listModels(tool?: Tool): ModelRate[] {
    return tool ? this.models.filter((m) => m.tool === tool) : [...this.models];
  }

  getModel(id: string, tool: Tool = 'copilot'): ModelRate | undefined {
    return this.models.find((m) => m.id === id && m.tool === tool);
  }

  listPlans(tool?: Tool): Plan[] {
    return tool ? this.plans.filter((p) => p.tool === tool) : [...this.plans];
  }

  getPlan(id: string): Plan | undefined {
    return this.plans.find((p) => p.id === id);
  }

  /** Pick the effective rate tier for a model given the input size (long-context aware). */
  effectiveRate(model: ModelRate, inputTokens: number): TierRate {
    if (model.longContext && inputTokens > model.longContext.thresholdInputTokens) {
      return model.longContext.rate;
    }
    return {
      inputPerM: model.inputPerM,
      cachedInputPerM: model.cachedInputPerM,
      outputPerM: model.outputPerM,
      cacheWritePerM: model.cacheWritePerM,
    };
  }

  /**
   * The monthly allowance for a plan, in both credits and dollars, honoring an
   * active promo as of `asOf`.
   */
  allowance(plan: Plan, asOf: Date = new Date()): { credits: number; usd: number; promoActive: boolean } {
    if (plan.promo && asOf < new Date(plan.promo.until)) {
      return {
        credits: plan.promo.monthlyCredits ?? plan.promo.monthlyUsd / CREDIT_USD,
        usd: plan.promo.monthlyUsd,
        promoActive: true,
      };
    }
    return {
      credits: plan.monthlyCredits ?? plan.monthlyUsd / CREDIT_USD,
      usd: plan.monthlyUsd,
      promoActive: false,
    };
  }

  usdToCredits(usd: number): number {
    return usd / CREDIT_USD;
  }

  creditsToUsd(credits: number): number {
    return credits * CREDIT_USD;
  }
}

export const defaultRegistry = new CostRegistry();

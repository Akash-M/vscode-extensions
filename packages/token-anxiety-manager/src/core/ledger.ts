// Local consumption ledger: an append-only record of spend with cycle-aware
// aggregation, burn-rate, projected run-out, and an optional manual sync that
// reconciles against the figure GitHub's usage dashboard reports.
//
// Persistence is abstracted behind Storage. In the VS Code extension this is
// backed by globalState (Memento); here we provide in-memory and JSON-file impls.

import type { Plan, Tool, Feature } from './types.ts';
import { CostRegistry, defaultRegistry } from './registry.ts';

const DAY_MS = 86_400_000;

export interface LedgerEntry {
  ts: string; // ISO timestamp
  tool: Tool;
  modelId: string;
  feature: Feature;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
  costCredits: number;
  /** True if this came from a pre-flight estimate rather than an observed/billed figure. */
  estimated: boolean;
}

/** A reconciliation point: "GitHub reported N credits used as of ts". */
export interface SyncBaseline {
  ts: string;
  reportedCredits: number;
}

export interface LedgerState {
  entries: LedgerEntry[];
  baseline?: SyncBaseline;
}

export interface Storage {
  load(): LedgerState | undefined;
  save(state: LedgerState): void;
}

export class MemoryStorage implements Storage {
  private state: LedgerState | undefined;
  load() {
    return this.state;
  }
  save(state: LedgerState) {
    this.state = state;
  }
}

/** Returns the most recent allowance-reset boundary at or before `now`. */
export function cycleStart(now: Date, resetDay = 1): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), resetDay, 0, 0, 0, 0));
  if (now.getUTCDate() < resetDay) {
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return d;
}

export interface BudgetSummary {
  allowanceCredits: number;
  allowanceUsd: number;
  usedCredits: number;
  usedUsd: number;
  remainingCredits: number;
  remainingUsd: number;
  pctUsed: number; // 0..1
  pctRemaining: number; // 0..1
  burnPerDayCredits: number;
  daysElapsed: number;
  daysLeftInCycle: number;
  projectedRunOut: Date | null;
  runsOutEarly: boolean;
  promoActive: boolean;
  pooled: boolean;
}

export class Ledger {
  private state: LedgerState;
  private readonly storage: Storage;
  private readonly registry: CostRegistry;

  constructor(storage: Storage = new MemoryStorage(), registry: CostRegistry = defaultRegistry) {
    this.storage = storage;
    this.registry = registry;
    this.state = storage.load() ?? { entries: [] };
  }

  private persist() {
    this.storage.save(this.state);
  }

  record(entry: LedgerEntry): void {
    this.state.entries.push(entry);
    this.persist();
  }

  /** Replace the local baseline with GitHub's reported figure as of `at`. */
  applySync(reportedCredits: number, at: Date = new Date()): void {
    this.state.baseline = { ts: at.toISOString(), reportedCredits };
    this.persist();
  }

  entriesInCycle(now: Date, resetDay = 1): LedgerEntry[] {
    const start = cycleStart(now, resetDay).getTime();
    const end = now.getTime();
    return this.state.entries.filter((e) => {
      const t = new Date(e.ts).getTime();
      return t >= start && t <= end;
    });
  }

  byModel(now: Date, resetDay = 1): Array<{ modelId: string; credits: number; usd: number; count: number }> {
    const map = new Map<string, { credits: number; usd: number; count: number }>();
    for (const e of this.entriesInCycle(now, resetDay)) {
      const agg = map.get(e.modelId) ?? { credits: 0, usd: 0, count: 0 };
      agg.credits += e.costCredits;
      agg.usd += e.costUsd;
      agg.count += 1;
      map.set(e.modelId, agg);
    }
    return [...map.entries()]
      .map(([modelId, v]) => ({ modelId, ...v }))
      .sort((a, b) => b.credits - a.credits);
  }

  /** Credits used this cycle, honoring a sync baseline if it falls within the cycle. */
  usedCredits(now: Date, resetDay = 1): number {
    const start = cycleStart(now, resetDay);
    let base = 0;
    let countFrom = start.getTime();
    if (this.state.baseline) {
      const bts = new Date(this.state.baseline.ts).getTime();
      if (bts >= start.getTime() && bts <= now.getTime()) {
        base = this.state.baseline.reportedCredits;
        countFrom = bts;
      }
    }
    const local = this.state.entries
      .filter((e) => {
        const t = new Date(e.ts).getTime();
        return t >= countFrom && t <= now.getTime();
      })
      .reduce((sum, e) => sum + e.costCredits, 0);
    return base + local;
  }

  summary(plan: Plan, now: Date = new Date()): BudgetSummary {
    const resetDay = plan.cycleResetDay ?? 1;
    const { credits: allowanceCredits, usd: allowanceUsd, promoActive } = this.registry.allowance(plan, now);
    const usedCredits = this.usedCredits(now, resetDay);
    const usedUsd = this.registry.creditsToUsd(usedCredits);

    const start = cycleStart(now, resetDay);
    const daysElapsed = Math.max((now.getTime() - start.getTime()) / DAY_MS, 0.5);
    const nextReset = new Date(start.getTime());
    nextReset.setUTCMonth(nextReset.getUTCMonth() + 1);
    const daysLeftInCycle = Math.max((nextReset.getTime() - now.getTime()) / DAY_MS, 0);

    const burnPerDayCredits = usedCredits / daysElapsed;
    const remainingCredits = Math.max(allowanceCredits - usedCredits, 0);

    let projectedRunOut: Date | null = null;
    if (burnPerDayCredits > 0) {
      const daysToZero = allowanceCredits / burnPerDayCredits;
      projectedRunOut = new Date(start.getTime() + daysToZero * DAY_MS);
    }
    const runsOutEarly = projectedRunOut ? projectedRunOut < nextReset : false;

    return {
      allowanceCredits,
      allowanceUsd,
      usedCredits,
      usedUsd,
      remainingCredits,
      remainingUsd: this.registry.creditsToUsd(remainingCredits),
      pctUsed: allowanceCredits > 0 ? usedCredits / allowanceCredits : 0,
      pctRemaining: allowanceCredits > 0 ? remainingCredits / allowanceCredits : 0,
      burnPerDayCredits,
      daysElapsed,
      daysLeftInCycle,
      projectedRunOut,
      runsOutEarly,
      promoActive,
      pooled: plan.pooled,
    };
  }
}

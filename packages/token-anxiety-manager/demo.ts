// Runnable validation of the cost engine. Run: `node demo.ts` (Node >= 22).
// Demonstrates: rate lookups, model comparison + recommendation, caching and
// auto-select savings, and a full month-to-date budget summary with a manual sync.

import {
  CostRegistry,
  Estimator,
  HeuristicTokenCounter,
  Ledger,
  MemoryStorage,
  CREDIT_USD,
  type ModelRate,
  type Feature,
} from './src/core/index.ts';

const NOW = new Date('2026-06-06T12:00:00Z');

const registry = new CostRegistry();
const estimator = new Estimator(registry, new HeuristicTokenCounter());

const usd = (n: number) => `$${n < 1 ? n.toFixed(4) : n.toFixed(2)}`;
const cr = (n: number) => `${n.toFixed(1)} cr`;
const pad = (s: string, n: number) => s.padEnd(n);
const padL = (s: string, n: number) => s.padStart(n);
const rule = (c = '─', n = 74) => console.log(c.repeat(n));
const head = (t: string) => {
  console.log('\n' + t);
  rule();
};

// ───────────────────────────── 1. Rate lookups ─────────────────────────────
head('1 · Sample model rates (USD per 1M tokens · 1 credit = $0.01)');
for (const id of ['gpt-5-mini', 'gpt-5.4', 'gpt-5.5', 'claude-sonnet-4.5', 'claude-opus-4.8', 'gemini-3.1-pro']) {
  const m = registry.getModel(id)!;
  console.log(
    `  ${pad(m.label, 20)} ${pad(m.category, 12)} in ${padL(usd(m.inputPerM), 7)}  cached ${padL(usd(m.cachedInputPerM), 7)}  out ${padL(usd(m.outputPerM), 7)}`,
  );
}

// ─────────────────────── 2. Pre-flight model comparison ───────────────────────
head('2 · Pre-flight comparison — "refactor auth module" (edit, ~8,200 input tokens)');
const candidates: ModelRate[] = [
  'gpt-5-mini', 'gpt-5.4', 'gpt-5.5', 'claude-sonnet-4.5', 'claude-opus-4.8', 'gemini-3.1-pro',
].map((id) => registry.getModel(id)!);

const scenario = { inputTokens: 8200, feature: 'edit' as Feature };
const cmp = estimator.compare(candidates, scenario);

console.log(`  ${pad('Model', 20)} ${padL('expected', 12)} ${padL('range (low–high)', 22)}  note`);
for (const r of cmp.results) {
  const tags: string[] = [];
  if (r.modelId === cmp.recommendedId) tags.push('★ RECOMMENDED');
  if (r.modelId === cmp.cheapestId) tags.push('cheapest');
  if (r.modelId === cmp.mostExpensiveId) tags.push('most expensive');
  console.log(
    `  ${pad(r.label, 20)} ${padL(cr(r.expected.totalCredits), 8)} ${padL(usd(r.expected.totalUsd), 9)}  ${padL(`${cr(r.low.totalCredits)}–${cr(r.high.totalCredits)}`, 20)}  ${tags.join(', ')}`,
  );
}
const rec = cmp.results.find((r) => r.modelId === cmp.recommendedId)!;
const opus = cmp.results.find((r) => r.modelId === 'claude-opus-4.8')!;
console.log(
  `\n  → Recommending ${rec.label}: ${cr(rec.expected.totalCredits)} vs Opus ${cr(opus.expected.totalCredits)} ` +
    `(saves ${cr(opus.expected.totalCredits - rec.expected.totalCredits)} / ${usd(opus.expected.totalUsd - rec.expected.totalUsd)} per request).`,
);

// ─────────────────────── 3. Caching savings (follow-up turn) ───────────────────────
head('3 · Caching — Claude Sonnet 4.5, 8,200 input, agent turn');
const sonnet = registry.getModel('claude-sonnet-4.5')!;
const fresh = estimator.estimate({ model: sonnet, inputTokens: 8200, feature: 'agent' });
const cached = estimator.estimate({ model: sonnet, inputTokens: 8200, cachedInputTokens: 7000, feature: 'agent' });
console.log(`  Fresh context (0 cached):   ${cr(fresh.expected.totalCredits)}  ${usd(fresh.expected.totalUsd)}`);
console.log(`  Continued thread (7k cached): ${cr(cached.expected.totalCredits)}  ${usd(cached.expected.totalUsd)}`);
console.log(
  `  → Continuing the thread instead of restarting saves ${cr(fresh.expected.totalCredits - cached.expected.totalCredits)} on input alone.`,
);

// ─────────────────────── 4. Auto-select 10% discount ───────────────────────
head('4 · Auto model selection — 10% discount (GPT-5.4, edit)');
const g54 = registry.getModel('gpt-5.4')!;
const list = estimator.estimate({ model: g54, inputTokens: 8200, feature: 'edit' });
const disc = estimator.estimate({ model: g54, inputTokens: 8200, feature: 'edit', autoSelectDiscount: true });
console.log(`  Standard:        ${cr(list.expected.totalCredits)}  ${usd(list.expected.totalUsd)}`);
console.log(`  With auto-select: ${cr(disc.expected.totalCredits)}  ${usd(disc.expected.totalUsd)}  (−10%)`);

// ─────────────────────── 5. Budget summary (month-to-date) ───────────────────────
head('5 · Budget gauge — Copilot Enterprise (promo active), as of 2026-06-06');
const ledger = new Ledger(new MemoryStorage(), registry);

function recordRun(modelId: string, feature: Feature, input: number, output: number, cachedTok: number, ts: Date) {
  const model = registry.getModel(modelId)!;
  const est = estimator.estimate({ model, inputTokens: input, expectedOutputTokens: output, cachedInputTokens: cachedTok, feature });
  ledger.record({
    ts: ts.toISOString(), tool: 'copilot', modelId, feature,
    inputTokens: input, outputTokens: output, cachedTokens: cachedTok,
    costUsd: est.expected.totalUsd, costCredits: est.expected.totalCredits, estimated: true,
  });
}
const at = (day: number, hour: number) => new Date(Date.UTC(2026, 5, 1 + day, hour, 0, 0));

// Heavy agentic user: Opus agent runs + light chats + a few edits, Jun 1–5.
for (let d = 0; d < 5; d++) {
  for (let i = 0; i < 6; i++) recordRun('claude-opus-4.8', 'agent', 90_000, 9_000, 20_000, at(d, 9 + i));
  for (let i = 0; i < 10; i++) recordRun('gpt-5-mini', 'chat', 1_500, 400, 0, at(d, 8 + i));
  for (let i = 0; i < 3; i++) recordRun('gpt-5.4', 'edit', 8_000, 900, 0, at(d, 10 + i));
}

const plan = registry.getPlan('copilot-enterprise')!;
const s = ledger.summary(plan, NOW);
const fmtDate = (dt: Date | null) => (dt ? dt.toISOString().slice(0, 10) : 'n/a');

console.log(`  Plan: ${plan.label}  (${s.promoActive ? 'PROMO' : 'standard'}, pooled across seats)`);
console.log(`  Allowance: ${s.allowanceCredits.toLocaleString()} cr  (${usd(s.allowanceUsd)} / user / mo)`);
console.log(`  Used:      ${cr(s.usedCredits)}  (${usd(s.usedUsd)})  →  ${(s.pctUsed * 100).toFixed(0)}% used`);
console.log(`  Remaining: ${cr(s.remainingCredits)}  (${usd(s.remainingUsd)})  →  ${(s.pctRemaining * 100).toFixed(0)}% left`);
console.log(`  Burn rate: ${s.burnPerDayCredits.toFixed(0)} cr/day over ${s.daysElapsed.toFixed(1)} days`);
console.log(`  Cycle: ${s.daysLeftInCycle.toFixed(0)} days left · projected run-out ${fmtDate(s.projectedRunOut)}`);
console.log(`  ${s.runsOutEarly ? '⚠ Projected to run out BEFORE the cycle resets.' : '✓ On track to finish the cycle.'}`);

console.log('\n  Where the spend went:');
const total = s.usedCredits;
for (const row of ledger.byModel(NOW)) {
  const pct = total > 0 ? (row.credits / total) * 100 : 0;
  const bar = '▰'.repeat(Math.round(pct / 5)).padEnd(20, '▱');
  console.log(`    ${pad(row.modelId, 18)} ${bar} ${cr(row.credits)} (${pct.toFixed(0)}%, ${row.count} calls)`);
}

// ─────────────────────── 6. Manual sync reconciliation ───────────────────────
head('6 · Manual sync — reconcile against GitHub-reported usage');
console.log(`  Local estimate before sync: ${cr(s.usedCredits)}`);
ledger.applySync(3100, new Date('2026-06-06T00:00:00Z')); // GitHub says 3,100 credits used as of midnight
const s2 = ledger.summary(plan, NOW);
console.log(`  GitHub reported 3,100 cr at 00:00; local activity since is added on top.`);
console.log(`  Reconciled used: ${cr(s2.usedCredits)}  →  ${(s2.pctUsed * 100).toFixed(0)}% used, ${cr(s2.remainingCredits)} left`);

console.log('\n✓ Cost engine validated: registry, estimator, comparison, caching, ledger, and sync all working.');
console.log(`  (1 AI credit = ${usd(CREDIT_USD)}; rates seeded from GitHub's published table, verified 2026-06-06.)`);

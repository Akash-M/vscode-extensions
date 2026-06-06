# Token Anxiety Manager

A VS Code extension that shows what every AI coding request **will cost before you send it** — and tracks your monthly budget so you never get caught out mid-sprint. Tool-agnostic across **GitHub Copilot, Claude, and Codex**.

Since GitHub Copilot moved to **usage-based billing (GitHub AI Credits, 1 credit = $0.01)** on June 1, 2026, cost is driven by token consumption per model. There's no longer a cheaper-model fallback when you run out — so pre-flight awareness matters more than ever.

## What it does

- **Status-bar gauge** — ambient, color-coded budget (used / allowance / % left) with a hover tooltip showing burn rate and a projected run-out date.
- **Pre-flight estimator** — `Token Anxiety: Estimate a Request` (or `@tokenanxiety` in Chat) counts the request's tokens and compares every model, highlighting the cheapest **capable** one.
- **Sidebar dashboard** — budget summary plus a "where your spend went" per-model breakdown and quick actions.
- **High-cost nudge** — a warning when a single request is estimated above a configurable credit threshold.
- **Manual sync** — reconcile the local ledger against the figure on your GitHub usage dashboard. No sign-in, no API keys, no admin credentials.

## Architecture

The cost logic lives in a dependency-free, editor-agnostic core (`src/core`):

| Module | Responsibility |
| --- | --- |
| `rates.ts` | Per-model rates (input / cached / output) + plan allowances, seeded from GitHub's published table. |
| `registry.ts` | Normalized lookup, long-context tier selection, promo-aware allowances, credit↔dollar conversion. |
| `estimator.ts` | Token-based cost with a low/expected/high range, caching + auto-select discount, and `compare()`. |
| `ledger.ts` | Cycle-aware spend tracking, burn rate, projected run-out, per-model breakdown, manual sync. |

The extension layer injects VS Code specifics: an exact token counter via `LanguageModelChat.countTokens()` and a `globalState`-backed ledger store.

## Develop

```bash
corepack enable
yarn install
yarn workspace token-anxiety-manager build      # bundle with esbuild → dist/extension.cjs
yarn workspace token-anxiety-manager typecheck   # tsc --noEmit
yarn workspace token-anxiety-manager demo        # run the cost-engine validation
```

Then press **F5** in VS Code to launch an Extension Development Host.

### Package a VSIX

```bash
npx @vscode/vsce package --no-dependencies
```

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `tokenAnxiety.tool` | `copilot` | Which assistant to track (`copilot` / `claude-code` / `codex`). |
| `tokenAnxiety.plan` | `copilot-enterprise` | Plan id used to derive the monthly allowance. |
| `tokenAnxiety.compareModels` | `[]` | Model ids to compare (empty = all models for the tool). |
| `tokenAnxiety.warnThresholds` | `[0.5, 0.8, 0.95]` | Budget-used fractions that trigger alerts. |
| `tokenAnxiety.highCostCredits` | `50` | Warn above this many credits for a single request. |

> Rates and allowances are seeded from GitHub's published table (verified 2026-06-06) and should be re-checked when GitHub updates pricing.

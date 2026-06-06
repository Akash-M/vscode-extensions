// Small display helpers shared across surfaces.

export function fmtCredits(c: number): string {
  return c >= 100 ? `${Math.round(c).toLocaleString()} cr` : `${c.toFixed(1)} cr`;
}

export function fmtUsd(n: number): string {
  return n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function isoDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : 'n/a';
}

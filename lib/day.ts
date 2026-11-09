// End-of-day logic: pure functions over ledger rows. No I/O, so the spoken numbers are testable.
// Amounts are normalised back to dollars (EUR rows divide by the demo rate) so a day with a euro tourist still adds up.
import { numberToWords, spokenAmount } from "./sale-math";
import { OWING_STATES, PAID_STATES } from "./statuses";
import type { LedgerRow } from "./types";

export function dayKey(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

// Most recent Saturday strictly before today's local date.
export function lastSaturdayKey(nowIso: string, tz: string): string {
  const today = dayKey(nowIso, tz);
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const back = ((date.getUTCDay() - 6 + 7) % 7) || 7; // days since last Saturday, never 0
  date.setUTCDate(date.getUTCDate() - back);
  return date.toISOString().slice(0, 10);
}

export const toDollars = (row: LedgerRow, fx: number) => (row.currency === "EUR" ? row.total / fx : row.total);

export const isPaid = (r: LedgerRow) => PAID_STATES.includes(r.status);

export type DaySummary = {
  count: number;
  total: number;
  cashCount: number;
  cashTotal: number;
  paypalTotal: number;
  topItem?: { name: string; qty: number };
  curatedCount: number; // seeded history rows included in this day
  itemQty: Map<string, number>;
};

export function summarizeDay(rows: LedgerRow[], key: string, tz: string, fx: number): DaySummary {
  const day = rows.filter((r) => isPaid(r) && dayKey(r.time, tz) === key);
  const itemQty = new Map<string, number>();
  let total = 0, cashTotal = 0, cashCount = 0;
  for (const r of day) {
    const dollars = toDollars(r, fx);
    total += dollars;
    if (r.method === "CASH") { cashTotal += dollars; cashCount++; }
    for (const i of r.items) itemQty.set(i.name, (itemQty.get(i.name) ?? 0) + i.qty);
  }
  const top = [...itemQty.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    count: day.length,
    curatedCount: day.filter((r) => r.curated).length,
    total: round0(total),
    cashCount,
    cashTotal: round0(cashTotal),
    paypalTotal: round0(total - cashTotal),
    topItem: top ? { name: top[0], qty: top[1] } : undefined,
    itemQty,
  };
}

const round0 = (n: number) => Math.round(n * 100) / 100;

// `shortOf` maps an invoice line name to its short spoken label ("Beeswax candle large" -> "Large candles").
export function spokenSummary(s: DaySummary, shortOf: (name: string) => string = (n) => n): string {
  if (s.count === 0) return "Nothing sold yet. The honey is still here.";
  const sales = s.count === 1 ? "1 sale" : `${s.count} sales`;
  const top = s.topItem ? ` ${shortOf(s.topItem.name)} carried the day.` : "";
  // Honesty line: seeded history is never presented as live sales.
  const curated = s.curatedCount ? ` ${sentenceCase(numberToWords(s.curatedCount))} of those ${s.curatedCount === 1 ? "is" : "are"} curated history.` : "";
  return `Today: ${sales}, ${spokenAmount(s.total, "USD")}, ${s.cashCount} in cash.${top}${curated}`;
}

// Anyone with an open, unpaid invoice owes: a pay-later sale, or a QR the buyer walked away from.
const sentenceCase = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function owing(rows: LedgerRow[]): LedgerRow[] {
  return rows.filter((r) => OWING_STATES.includes(r.status));
}

export type Suggestion = { sku: string; text: string };

// Two concrete suggestions with the numbers behind them: the biggest riser and the biggest faller versus last Saturday.
export function planNextWeek(today: DaySummary, lastSaturday: DaySummary, label: (name: string) => string = (n) => n.toLowerCase()): Suggestion[] {
  const names = new Set([...today.itemQty.keys(), ...lastSaturday.itemQty.keys()]);
  const deltas = [...names].map((name) => ({ name, now: today.itemQty.get(name) ?? 0, before: lastSaturday.itemQty.get(name) ?? 0 }))
    .map((d) => ({ ...d, delta: d.now - d.before }));
  const riser = [...deltas].sort((a, b) => b.delta - a.delta)[0];
  const faller = [...deltas].sort((a, b) => a.delta - b.delta)[0];
  const out: Suggestion[] = [];
  if (riser && riser.delta > 0) out.push({ sku: riser.name, text: `Bring more ${label(riser.name)}: ${riser.now} sold today against ${riser.before} last Saturday.` });
  if (faller && faller.delta < 0) out.push({ sku: faller.name, text: `Bring fewer ${label(faller.name)}: ${faller.now} today against ${faller.before} last Saturday.` });
  return out.slice(0, 2);
}

export function spokenPlan(suggestions: Suggestion[], lastSaturdayIsCurated = false): string {
  if (!suggestions.length) return "Not enough history yet to compare. Ask me again after next Saturday.";
  return suggestions.map((s) => s.text).join(" ") + (lastSaturdayIsCurated ? " Last Saturday is curated history." : "");
}

export { numberToWords };

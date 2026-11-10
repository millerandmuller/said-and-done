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

/**
 * The most recent calendar day before today with at least one paid sale (PayPal or cash, curated or live), or null.
 * Used only when today has no paid sale: a seller's book always has a last market day. Same day key as the ledger.
 */
export function lastMarketDayKey(rows: LedgerRow[], nowIso: string, tz: string): string | null {
  const today = dayKey(nowIso, tz);
  const days = rows.filter(isPaid).map((r) => dayKey(r.time, tz)).filter((k) => k < today);
  return days.length ? days.sort().at(-1)! : null;
}

/** The two most recent days with paid sales, newest first, counting today if it has any. */
export function lastTwoSaleDays(rows: LedgerRow[], nowIso: string, tz: string): string[] {
  const today = dayKey(nowIso, tz);
  const days = new Set(rows.filter(isPaid).map((r) => dayKey(r.time, tz)).filter((k) => k <= today));
  return [...days].sort().reverse().slice(0, 2);
}

const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-11-07" -> "Saturday 7 November" (the key is already a date in the stall's timezone, so no timezone maths). */
export function spokenDayLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${LONG_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${LONG_MONTHS[d.getUTCMonth()]}`;
}

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
// `fallbackDay` is set when today was empty and `s` summarizes the last market day instead; the sentence says so.
export function spokenSummary(s: DaySummary, shortOf: (name: string) => string = (n) => n, fallbackDay?: string): string {
  if (s.count === 0) return "Nothing sold yet. The honey is still here.";
  const sales = s.count === 1 ? "1 sale" : `${s.count} sales`;
  const top = s.topItem ? ` ${shortOf(s.topItem.name)} carried the day.` : "";
  // Honesty line: seeded history is never presented as live sales.
  const curated = s.curatedCount ? ` ${sentenceCase(numberToWords(s.curatedCount))} of those ${s.curatedCount === 1 ? "is" : "are"} curated history.` : "";
  const lead = fallbackDay ? `Nothing sold yet today. Last market day, ${spokenDayLabel(fallbackDay)}:` : "Today:";
  return `${lead} ${sales}, ${spokenAmount(s.total, "USD")}, ${s.cashCount} in cash.${top}${curated}`;
}

// Anyone with an open, unpaid invoice owes: a pay-later sale, or a QR the buyer walked away from.
const sentenceCase = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function owing(rows: LedgerRow[]): LedgerRow[] {
  return rows.filter((r) => OWING_STATES.includes(r.status));
}

export type Suggestion = { sku: string; text: string };

// Two concrete suggestions with the numbers behind them: the biggest riser and the biggest faller versus last Saturday.
// `when` names the two compared days in the sentence; the default is today against last Saturday.
export type PlanWhen = { now: string; before: string };
const TODAY_VS_SATURDAY: PlanWhen = { now: "today", before: "last Saturday" };

export function planNextWeek(today: DaySummary, lastSaturday: DaySummary, label: (name: string) => string = (n) => n.toLowerCase(), when: PlanWhen = TODAY_VS_SATURDAY): Suggestion[] {
  const names = new Set([...today.itemQty.keys(), ...lastSaturday.itemQty.keys()]);
  const deltas = [...names].map((name) => ({ name, now: today.itemQty.get(name) ?? 0, before: lastSaturday.itemQty.get(name) ?? 0 }))
    .map((d) => ({ ...d, delta: d.now - d.before }));
  const riser = [...deltas].sort((a, b) => b.delta - a.delta)[0];
  const faller = [...deltas].sort((a, b) => a.delta - b.delta)[0];
  const out: Suggestion[] = [];
  if (riser && riser.delta > 0) out.push({ sku: riser.name, text: `Bring more ${label(riser.name)}: ${riser.now} sold ${when.now} against ${riser.before} ${when.before}.` });
  if (faller && faller.delta < 0) out.push({ sku: faller.name, text: `Bring fewer ${label(faller.name)}: ${faller.now} ${when.now} against ${faller.before} ${when.before}.` });
  return out.slice(0, 2);
}

export function spokenPlan(suggestions: Suggestion[], lastSaturdayIsCurated = false): string {
  if (!suggestions.length) return "Not enough history yet to compare. Ask me again after next Saturday.";
  return suggestions.map((s) => s.text).join(" ") + (lastSaturdayIsCurated ? " Last Saturday is curated history." : "");
}

/** Today is empty: compare the two most recent sale days. Names both days; says when the older one is seeded history. */
export function planFromLastTwoDays(latest: { key: string; summary: DaySummary }, earlier: { key: string; summary: DaySummary }, label?: (name: string) => string): string {
  const a = spokenDayLabel(latest.key), b = spokenDayLabel(earlier.key);
  const suggestions = planNextWeek(latest.summary, earlier.summary, label, { now: `on ${a}`, before: `on ${b}` });
  const lead = `Nothing sold yet today. Comparing ${a} with ${b}.`;
  if (!suggestions.length) return `${lead} Nothing moved enough between those two days to change what you bring.`;
  const curated = earlier.summary.curatedCount > 0 ? ` ${b} is curated history.` : "";
  return `${lead} ${suggestions.map((s) => s.text).join(" ")}${curated}`;
}

export { numberToWords };

// Shapes ledger rows for the AG Grid tables. Row grouping is an AG Grid Enterprise feature (brief: Community only),
// so the by-item and by-method roll-ups are computed here and shown as their own small grids.
import { dayKey, isPaid, toDollars } from "./day";
import { OWING_STATES } from "./statuses";
import type { LedgerRow } from "./types";

export type LineRow = { invoice_id: string; day: string; item: string; qty: number; amount: number; method: "PAYPAL" | "CASH"; status: string; payer: string; curated: boolean };
export type RollupRow = { label: string; qty: number; sales: number; amount: number };

export function toLines(rows: LedgerRow[], tz: string, fx: number): LineRow[] {
  return rows.filter(isPaid).flatMap((r) => {
    const rate = r.currency === "EUR" ? 1 / fx : 1;
    return r.items.map((i) => ({
      invoice_id: r.invoice_id, day: dayKey(r.time, tz), item: i.name, qty: i.qty,
      amount: Math.round(i.qty * i.unit_price * rate * 100) / 100,
      method: r.method, status: r.status, payer: r.payer ?? "", curated: !!r.curated,
    }));
  });
}

function rollup(lines: LineRow[], key: (l: LineRow) => string): RollupRow[] {
  const map = new Map<string, { qty: number; amount: number; invoices: Set<string> }>();
  for (const l of lines) {
    const k = key(l);
    const cur = map.get(k) ?? { qty: 0, amount: 0, invoices: new Set<string>() };
    cur.qty += l.qty;
    cur.amount += l.amount;
    cur.invoices.add(l.invoice_id);
    map.set(k, cur);
  }
  return [...map.entries()]
    .map(([label, v]) => ({ label, qty: v.qty, sales: v.invoices.size, amount: Math.round(v.amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);
}

export const byItem = (lines: LineRow[]) => rollup(lines, (l) => l.item);
export const byMethod = (lines: LineRow[]) => rollup(lines, (l) => (l.method === "CASH" ? "Cash" : "PayPal"));

export function totalOfRows(rows: LedgerRow[], fx: number): number {
  return Math.round(rows.filter(isPaid).reduce((s, r) => s + toDollars(r, fx), 0) * 100) / 100;
}

// Human labels for the books table (the raw values stay in the rows for sorting and filtering).
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-07" -> "Sat 7 Nov". The key is already a calendar date in the stall's timezone, so no timezone maths here. */
export function dayLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export const methodLabel = (method: "PAYPAL" | "CASH") => (method === "CASH" ? "Cash" : "PayPal");

export function statusLabel(status: string, method: "PAYPAL" | "CASH"): string {
  if (status === "PAID") return "Paid";
  if (status === "MARKED_AS_PAID") return method === "CASH" ? "Paid, cash" : "Paid";
  if ((OWING_STATES as string[]).includes(status)) return "Due";
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
}

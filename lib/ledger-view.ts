// Shapes ledger rows for the AG Grid tables. Row grouping is an AG Grid Enterprise feature (brief: Community only),
// so the by-item and by-method roll-ups are computed here and shown as their own small grids.
import { dayKey, isPaid, toDollars } from "./day";
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

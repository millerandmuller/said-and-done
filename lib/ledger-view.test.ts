import { describe, expect, it } from "vitest";
import { byItem, byMethod, toLines, totalOfRows } from "./ledger-view";
import type { LedgerRow } from "./types";

const rows: LedgerRow[] = [
  { invoice_id: "A", time: "2026-11-09T20:00:00Z", items: [{ name: "Honey 500 g", qty: 2, unit_price: 8 }, { name: "Soap", qty: 1, unit_price: 5 }], total: 21, currency: "USD", method: "PAYPAL", status: "PAID" },
  { invoice_id: "B", time: "2026-11-09T21:00:00Z", items: [{ name: "Honey 500 g", qty: 1, unit_price: 8 }], total: 8, currency: "USD", method: "CASH", status: "MARKED_AS_PAID" },
  { invoice_id: "C", time: "2026-11-09T21:00:00Z", items: [{ name: "Jam", qty: 9, unit_price: 7 }], total: 63, currency: "USD", method: "PAYPAL", status: "UNPAID" },
];

describe("ledger view", () => {
  const lines = toLines(rows, "America/Los_Angeles", 0.92);
  it("flattens paid invoices only, one line per item", () => expect(lines).toHaveLength(3));
  it("rolls up by item, biggest first", () => {
    const r = byItem(lines);
    expect(r[0]).toEqual({ label: "Honey 500 g", qty: 3, sales: 2, amount: 24 });
  });
  it("splits cash from PayPal", () => {
    const m = Object.fromEntries(byMethod(lines).map((r) => [r.label, r.amount]));
    expect(m).toEqual({ PayPal: 21, Cash: 8 });
  });
  it("totals paid rows and converts euros back to dollars", () => {
    expect(totalOfRows(rows, 0.92)).toBe(29);
    expect(totalOfRows([{ ...rows[0], currency: "EUR", total: 18.4 }], 0.92)).toBe(20);
  });
});

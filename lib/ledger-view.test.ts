import { describe, expect, it } from "vitest";
import { byItem, byMethod, dayLabel, methodLabel, statusLabel, toLines, totalOfRows } from "./ledger-view";
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

describe("human labels", () => {
  it("writes the day as a short date", () => {
    expect(dayLabel("2026-11-07")).toBe("Sat 7 Nov");
    expect(dayLabel("2026-11-09")).toBe("Mon 9 Nov");
    expect(dayLabel("not a day")).toBe("not a day");
  });
  it("labels status and method", () => {
    expect(statusLabel("PAID", "PAYPAL")).toBe("Paid");
    expect(statusLabel("MARKED_AS_PAID", "CASH")).toBe("Paid, cash");
    expect(statusLabel("MARKED_AS_PAID", "PAYPAL")).toBe("Paid");
    expect(statusLabel("UNPAID", "PAYPAL")).toBe("Due");
    expect(statusLabel("PARTIALLY_PAID", "PAYPAL")).toBe("Due");
    expect(statusLabel("CANCELLED", "CASH")).toBe("Cancelled");
    expect(methodLabel("CASH")).toBe("Cash");
    expect(methodLabel("PAYPAL")).toBe("PayPal");
  });
});

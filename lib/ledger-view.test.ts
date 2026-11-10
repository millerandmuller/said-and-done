import { describe, expect, it } from "vitest";
import { booksView, byItem, byMethod, dayLabel, filterByDay, methodLabel, statusLabel, toLines, totalOfRows } from "./ledger-view";
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

describe("filterByDay", () => {
  const mk = (id: string, time: string): LedgerRow => ({ invoice_id: id, time, items: [], total: 0, currency: "USD", method: "PAYPAL", status: "PAID" });
  const all = [mk("sat", "2026-11-07T20:00:00Z"), mk("mon1", "2026-11-09T20:00:00Z"), mk("mon2", "2026-11-09T09:00:00Z"), mk("sun", "2026-11-08T20:00:00Z")];
  const now = "2026-11-09T18:00:00Z"; // Monday 10:00 in Los Angeles
  it("today", () => expect(filterByDay(all, "today", "America/Los_Angeles", now).map((r) => r.invoice_id)).toEqual(["mon1", "mon2"]));
  it("last Saturday", () => expect(filterByDay(all, "last_saturday", "America/Los_Angeles", now).map((r) => r.invoice_id)).toEqual(["sat"]));
  it("all days keeps every row, nothing is hidden", () => expect(filterByDay(all, "all", "America/Los_Angeles", now)).toHaveLength(4));
});

describe("booksView", () => {
  const TZ = "America/Los_Angeles";
  const mk = (id: string, time: string, status: LedgerRow["status"] = "PAID"): LedgerRow => ({ invoice_id: id, time, items: [], total: 1, currency: "USD", method: "PAYPAL", status });
  const history = [mk("sat", "2026-11-07T20:00:00Z"), mk("sat2", "2026-11-07T21:00:00Z"), mk("old", "2026-10-31T20:00:00Z"), mk("unpaid", "2026-11-09T20:00:00Z", "UNPAID")];
  const TUE = "2026-11-10T18:00:00Z";

  it("(a) today has a paid sale: no fallback, no label", () => {
    const v = booksView([...history, mk("now", "2026-11-10T17:00:00Z")], null, TZ, TUE);
    expect(v.active).toBe("today");
    expect(v.label).toBeUndefined();
    expect(v.rows.map((r) => r.invoice_id)).toEqual(["now"]);
  });
  it("(b) today empty, history present: opens on the most recent sale day and names it", () => {
    const v = booksView(history, null, TZ, TUE);
    expect(v.rows.map((r) => r.invoice_id)).toEqual(["sat", "sat2"]);
    expect(v.active).toBeNull();
    expect(v.label).toBe("Nothing sold yet today. Showing Sat 7 Nov, the last market day.");
  });
  it("(b) tapping Today shows the honest empty state", () => {
    const v = booksView(history, "today", TZ, TUE);
    expect(v.rows).toEqual([]);
    expect(v.label).toBeUndefined();
  });
  it("(b) Last Saturday and All days are unchanged", () => {
    expect(booksView(history, "all", TZ, TUE).rows).toHaveLength(4);
    expect(booksView(history, "last_saturday", TZ, TUE).rows.map((r) => r.invoice_id)).toEqual(["sat", "sat2"]);
  });
  it("(c) no history at all: an empty Today, no label", () => {
    const v = booksView([], null, TZ, TUE);
    expect(v).toEqual({ rows: [], active: "today" });
  });
  it("an unpaid-only today does not count as a sale", () => expect(booksView(history, null, TZ, TUE).rows.some((r) => r.invoice_id === "unpaid")).toBe(false));
});

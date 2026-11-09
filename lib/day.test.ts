import { describe, expect, it } from "vitest";
import { lastSaturdayKey, owing, planNextWeek, spokenSummary, summarizeDay } from "./day";
import type { LedgerRow } from "./types";

const TZ = "America/Los_Angeles";
const row = (over: Partial<LedgerRow>): LedgerRow => ({
  invoice_id: "INV-1", time: "2026-11-09T20:00:00.000Z", items: [{ name: "Honey 500 g", qty: 2, unit_price: 8 }], total: 16,
  currency: "USD", method: "PAYPAL", status: "PAID", ...over,
});

describe("lastSaturdayKey", () => {
  it("from a Monday is the previous Saturday", () => expect(lastSaturdayKey("2026-11-09T18:00:00Z", TZ)).toBe("2026-11-07"));
  it("from a Saturday is the Saturday a week before, not today", () => expect(lastSaturdayKey("2026-11-14T18:00:00Z", TZ)).toBe("2026-11-07"));
  it("respects the stall time zone near midnight UTC", () => expect(lastSaturdayKey("2026-11-09T02:00:00Z", TZ)).toBe("2026-11-07")); // still Sunday evening in PT
});

describe("summarizeDay", () => {
  const rows = [
    row({ invoice_id: "a", total: 22, items: [{ name: "Honey 500 g", qty: 2, unit_price: 8 }, { name: "Beeswax candle large", qty: 1, unit_price: 6 }] }),
    row({ invoice_id: "b", method: "CASH", status: "MARKED_AS_PAID", total: 5, items: [{ name: "Soap", qty: 1, unit_price: 5 }] }),
    row({ invoice_id: "c", status: "UNPAID", total: 99 }),
    row({ invoice_id: "d", time: "2026-11-07T20:00:00.000Z", total: 40 }),
  ];
  it("counts only paid rows of that day, splits cash, finds the top item", () => {
    const s = summarizeDay(rows, "2026-11-09", TZ, 0.92);
    expect(s).toMatchObject({ count: 2, total: 27, cashCount: 1, cashTotal: 5, paypalTotal: 22 });
    expect(s.topItem?.name).toBe("Honey 500 g");
  });
  it("converts euro rows back to dollars", () => {
    const s = summarizeDay([row({ currency: "EUR", total: 18.4 })], "2026-11-09", TZ, 0.92);
    expect(s.total).toBe(20);
  });
  it("speaks the summary and the empty day", () => {
    expect(spokenSummary(summarizeDay(rows, "2026-11-09", TZ, 0.92), (n) => (n.startsWith("Honey") ? "Honey" : n))).toBe("Today: 2 sales, twenty-seven dollars, 1 in cash. Honey carried the day.");
    expect(spokenSummary(summarizeDay([], "2026-11-09", TZ, 0.92))).toBe("Nothing sold yet. The honey is still here.");
  });
});

describe("owing and planning", () => {
  it("lists open unpaid invoices and nothing that is settled or cancelled", () => {
    const rows = [row({ later: true, status: "UNPAID" }), row({ later: true, status: "PAID" }), row({ status: "UNPAID" }), row({ status: "CANCELLED" }), row({ status: "MARKED_AS_PAID" })];
    expect(owing(rows)).toHaveLength(2);
  });
  it("cites real counts for riser and faller", () => {
    const today = summarizeDay([row({ items: [{ name: "Honey 500 g", qty: 6, unit_price: 8 }, { name: "Soap", qty: 1, unit_price: 5 }] })], "2026-11-09", TZ, 1);
    const last = summarizeDay([row({ time: "2026-11-07T20:00:00.000Z", items: [{ name: "Honey 500 g", qty: 2, unit_price: 8 }, { name: "Soap", qty: 4, unit_price: 5 }] })], "2026-11-07", TZ, 1);
    const [a, b] = planNextWeek(today, last);
    expect(a.text).toBe("Bring more honey 500 g: 6 sold today against 2 last Saturday.");
    expect(planNextWeek(today, last, () => "honey")[0].text).toBe("Bring more honey: 6 sold today against 2 last Saturday.");
    expect(b.text).toBe("Bring fewer soap: 1 today against 4 last Saturday.");
  });
});

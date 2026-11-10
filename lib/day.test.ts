import { describe, expect, it } from "vitest";
import { lastMarketDayKey, lastSaturdayKey, lastTwoSaleDays, owing, planFromLastTwoDays, planNextWeek, spokenDayLabel, spokenSummary, summarizeDay } from "./day";
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

describe("last market day fallback", () => {
  const NOW = "2026-11-10T18:00:00Z"; // Tuesday in Los Angeles
  const sat = row({ invoice_id: "s1", time: "2026-11-07T20:00:00.000Z", total: 16 });
  const sat2 = row({ invoice_id: "s2", time: "2026-11-07T21:00:00.000Z", method: "CASH", status: "MARKED_AS_PAID", total: 5, items: [{ name: "Soap", qty: 1, unit_price: 5 }] });
  const sat0 = row({ invoice_id: "o1", time: "2026-10-31T20:00:00.000Z", curated: true, items: [{ name: "Honey 500 g", qty: 1, unit_price: 8 }], total: 8 });
  const unpaidMon = row({ invoice_id: "u", time: "2026-11-09T20:00:00.000Z", status: "UNPAID" });

  it("picks the most recent day with a paid sale, ignoring unpaid and cancelled rows", () => {
    expect(lastMarketDayKey([sat0, sat, sat2, unpaidMon, row({ time: "2026-11-09T20:00:00.000Z", status: "CANCELLED" })], NOW, TZ)).toBe("2026-11-07");
  });
  it("is null with no history", () => expect(lastMarketDayKey([], NOW, TZ)).toBeNull());
  it("never returns today", () => expect(lastMarketDayKey([row({ time: "2026-11-10T17:00:00.000Z" })], NOW, TZ)).toBeNull());
  it("lastTwoSaleDays lists the two newest sale days", () => expect(lastTwoSaleDays([sat0, sat, sat2], NOW, TZ)).toEqual(["2026-11-07", "2026-10-31"]));
  it("spells the day out for speech", () => expect(spokenDayLabel("2026-11-07")).toBe("Saturday 7 November"));
  it("the summary names the fallback day and keeps the curated honesty line", () => {
    const s = summarizeDay([sat, sat2], "2026-11-07", TZ, 1);
    expect(spokenSummary(s, (n) => n, "2026-11-07")).toBe("Nothing sold yet today. Last market day, Saturday 7 November: 2 sales, twenty-one dollars, 1 in cash. Honey 500 g carried the day.");
  });
  it("the plan names both days and flags curated history", () => {
    const text = planFromLastTwoDays(
      { key: "2026-11-07", summary: summarizeDay([sat], "2026-11-07", TZ, 1) },
      { key: "2026-10-31", summary: summarizeDay([sat0], "2026-10-31", TZ, 1) },
    );
    expect(text).toBe("Nothing sold yet today. Comparing Saturday 7 November with Saturday 31 October. Bring more honey 500 g: 2 sold on Saturday 7 November against 1 on Saturday 31 October. Saturday 31 October is curated history.");
  });
});

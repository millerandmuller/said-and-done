import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CATALOG } from "../data/default-catalog";

// Bystander chatter must produce no spoken reply at all: the server returns "ignored".
const understand = vi.fn();
vi.mock("./understand", () => ({ understand: (...a: unknown[]) => understand(...a) }));
vi.mock("./catalog", () => ({ getCatalog: async () => DEFAULT_CATALOG, addCatalogItem: vi.fn() }));
vi.mock("./config", () => ({ getConfig: () => ({ defaultCurrency: "USD", demoFxUsdEur: 0.92, timezone: "America/Los_Angeles" }) }));
vi.mock("./ledger", () => ({ fetchLedger: vi.fn() }));
vi.mock("./invoices", () => ({ sendReminder: vi.fn() }));

import { fetchLedger } from "./ledger";
import { interpretTurn } from "./turn";

const CHATTER = ["okay cool good just one second please", "hold on let me see", "yeah thanks, I'll be right with you"];

describe("interpretTurn: chatter is ignored silently", () => {
  beforeEach(() => understand.mockReset());

  it.each(CHATTER)("intent unknown -> ignored: %s", async (say) => {
    understand.mockResolvedValue({ intent: "unknown", items: [], payment_mode: null, currency: null });
    const r = await interpretTurn(say, null);
    expect(r).toEqual({ kind: "ignored" });
  });

  it.each(CHATTER)("a sale intent with no lines is ignored too: %s", async (say) => {
    understand.mockResolvedValue({ intent: "sale", items: [], payment_mode: null, currency: null });
    expect((await interpretTurn(say, null)).kind).toBe("ignored");
  });

  it("a real sale is still a sale", async () => {
    understand.mockResolvedValue({ intent: "sale", items: [{ sku: "honey-500", name: "honey", qty: 2 }], payment_mode: "paypal_qr", currency: null });
    const r = await interpretTurn("two honey", null);
    expect(r.kind).toBe("sale");
  });

  it("drops a half-heard email (no TLD) instead of carrying it to PayPal", async () => {
    understand.mockResolvedValue({ intent: "sale", items: [{ sku: "honey-500", name: "honey", qty: 1 }], payment_mode: "paypal_later", currency: null, payer_email: "anna@example", payer_name: "Anna" });
    const r = await interpretTurn("one honey, she pays later, anna at example", null);
    expect(r.kind === "sale" && r.sale.payer_email).toBeUndefined();
    understand.mockResolvedValue({ intent: "sale", items: [{ sku: "honey-500", name: "honey", qty: 1 }], payment_mode: "paypal_later", currency: null, payer_email: "anna@example.com", payer_name: "Anna" });
    const ok = await interpretTurn("one honey, she pays later, anna at example dot com", null);
    expect(ok.kind === "sale" && ok.sale.payer_email).toBe("anna@example.com");
  });

  it("refuses a catalog price that is not whole cents", async () => {
    understand.mockResolvedValue({ intent: "add_catalog_item", items: [], new_item: { name: "Soap", price: 0.004, aliases: [] }, payment_mode: null, currency: null });
    expect((await interpretTurn("I sell soap for a tenth of a cent", null)).kind).toBe("unknown");
    understand.mockResolvedValue({ intent: "add_catalog_item", items: [], new_item: { name: "Soap", price: 0.333, aliases: [] }, payment_mode: null, currency: null });
    expect((await interpretTurn("I sell soap", null)).kind).toBe("unknown");
  });
});

describe("interpretTurn: empty today falls back to the last market day (same day the Books page opens on)", () => {
  const paid = (id: string, time: string, over: Record<string, unknown> = {}) => ({ invoice_id: id, time, items: [{ name: "Honey 500 g", qty: 2, unit_price: 8 }], total: 16, currency: "USD", method: "PAYPAL", status: "PAID", ...over });
  const history = [paid("a", "2026-11-07T20:00:00Z"), paid("b", "2026-11-07T21:00:00Z", { method: "CASH", status: "MARKED_AS_PAID" }), paid("c", "2026-10-31T20:00:00Z", { items: [{ name: "Soap", qty: 3, unit_price: 5 }], total: 15 })];

  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-10T18:00:00Z")); understand.mockReset(); });
  afterEach(() => vi.useRealTimers());

  it("the day summary speaks the fallback day", async () => {
    understand.mockResolvedValue({ intent: "day_summary", items: [], payment_mode: null, currency: null });
    vi.mocked(fetchLedger).mockResolvedValue(history as never);
    const r = await interpretTurn("how did today go", null);
    expect(r).toMatchObject({ kind: "summary" });
    expect((r as { speak: string }).speak).toMatch(/^Nothing sold yet today\. Last market day, Saturday 7 November: 2 sales, thirty-two dollars, 1 in cash\./);
  });
  it("with sales today the summary is the plain Today sentence", async () => {
    understand.mockResolvedValue({ intent: "day_summary", items: [], payment_mode: null, currency: null });
    vi.mocked(fetchLedger).mockResolvedValue([...history, paid("t", "2026-11-10T17:00:00Z")] as never);
    expect(((await interpretTurn("how did today go", null)) as { speak: string }).speak).toMatch(/^Today: 1 sale, sixteen dollars/);
  });
  it("no history at all keeps the old answer", async () => {
    understand.mockResolvedValue({ intent: "day_summary", items: [], payment_mode: null, currency: null });
    vi.mocked(fetchLedger).mockResolvedValue([] as never);
    expect(((await interpretTurn("how did today go", null)) as { speak: string }).speak).toBe("Nothing sold yet. The honey is still here.");
  });
  it("the plan compares the last two sale days and names both", async () => {
    understand.mockResolvedValue({ intent: "plan_week", items: [], payment_mode: null, currency: null });
    vi.mocked(fetchLedger).mockResolvedValue(history as never);
    const speak = ((await interpretTurn("what should I bring next week", null)) as { speak: string }).speak;
    expect(speak).toContain("Nothing sold yet today. Comparing Saturday 7 November with Saturday 31 October.");
    expect(speak).toMatch(/Bring more .*honey/i);
  });
  it("fewer than two days of history keeps the old plan answer", async () => {
    understand.mockResolvedValue({ intent: "plan_week", items: [], payment_mode: null, currency: null });
    vi.mocked(fetchLedger).mockResolvedValue(history.slice(0, 2) as never);
    expect(((await interpretTurn("what should I bring next week", null)) as { speak: string }).speak).toMatch(/^Not enough history yet to compare/);
  });
});

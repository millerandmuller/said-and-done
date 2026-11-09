import { describe, expect, it } from "vitest";
import { DEFAULT_CATALOG } from "../data/default-catalog";
import { summarizeDay, spokenSummary, spokenPlan } from "./day";
import { once } from "./idempotency";
import { errorMessageOf } from "./paypal-toolkit";
import { buildSale, priceLines, validateSale } from "./sale-math";
import type { LedgerRow, Sale } from "./types";

describe("errorMessageOf: PayPal failures are JSON, not exceptions", () => {
  it("recognises the shapes seen in the sandbox", () => {
    expect(errorMessageOf({ ok: false, status: 403, message: "Authorization failed" })).toBe("Authorization failed");
    expect(errorMessageOf({ error: { message: "not supported in sandbox" } })).toBe("not supported in sandbox");
    expect(errorMessageOf({ name: "INVALID_REQUEST", message: "bad", debug_id: "abc" })).toBe("bad");
    expect(errorMessageOf({ status: 404 })).toBe("HTTP 404");
  });
  it("lets real successes through", () => {
    expect(errorMessageOf({ status: "UNPAID", amount: { value: "22.00" } })).toBeNull();
    expect(errorMessageOf({ href: "https://api.sandbox.paypal.com/v2/invoicing/invoices/INV2-X", rel: "self" })).toBeNull();
    expect(errorMessageOf({ items: [], total_pages: 1 })).toBeNull();
  });
});

const good: Sale = { items: [{ sku: "tea", name: "Tea", qty: 2, unit_price: 6 }], currency: "USD", total: 12, payment_mode: "cash" };

describe("validateSale: the browser is not trusted", () => {
  it("accepts a normal sale", () => expect(validateSale(good)).toBeNull());
  it.each([
    ["empty", { ...good, items: [] }],
    ["negative price", { ...good, items: [{ ...good.items[0], unit_price: -5 }] }],
    ["zero price", { ...good, items: [{ ...good.items[0], unit_price: 0 }] }],
    ["fractional qty", { ...good, items: [{ ...good.items[0], qty: 1.5 }] }],
    ["huge qty", { ...good, items: [{ ...good.items[0], qty: 1000 }] }],
    ["bad currency", { ...good, currency: "GBP" }],
    ["too large total", { ...good, items: [{ ...good.items[0], qty: 99, unit_price: 900 }] }],
    ["long name", { ...good, items: [{ ...good.items[0], name: "x".repeat(300) }] }],
  ])("rejects %s", (_n, sale) => expect(validateSale(sale as Sale)).not.toBeNull());
});

describe("pricing never honours zero or negative spoken prices", () => {
  it("treats a negative custom price on an unknown item as unpriced", () => {
    const { items, unknown } = priceLines([{ name: "mug", qty: 1, custom_price: -5 }], DEFAULT_CATALOG, 1);
    expect(items).toEqual([]);
    expect(unknown).toHaveLength(1);
  });
  it("falls back to the catalog price when the spoken price is zero", () => {
    const { items } = priceLines([{ sku: "tea", qty: 1, custom_price: 0 }], DEFAULT_CATALOG, 1);
    expect(items[0].unit_price).toBe(6);
  });
  it("caps quantity", () => {
    const { items } = priceLines([{ sku: "tea", qty: 1_000_000 }], DEFAULT_CATALOG, 1);
    expect(items[0].qty).toBe(99);
    expect(buildSale(items, { currency: "USD", payment_mode: "cash" }).total).toBe(594);
  });
});

describe("once: one invoice per sale", () => {
  it("runs the work once for the same key, even concurrently", async () => {
    let calls = 0;
    const work = async () => { calls++; return calls; };
    const [a, b] = await Promise.all([once("k1", work), once("k1", work)]);
    expect([a, b, calls]).toEqual([1, 1, 1]);
  });
  it("allows a retry after a failure", async () => {
    let calls = 0;
    await once("k2", async () => { calls++; throw new Error("boom"); }).catch(() => {});
    await new Promise((r) => setTimeout(r, 0));
    expect(await once("k2", async () => ++calls)).toBe(2);
  });
});

describe("curated history is disclosed aloud", () => {
  const row = (over: Partial<LedgerRow>): LedgerRow => ({ invoice_id: "A", time: "2026-11-09T20:00:00Z", items: [{ name: "Honey 500 g", qty: 1, unit_price: 8 }], total: 8, currency: "USD", method: "PAYPAL", status: "PAID", ...over });
  it("says how many of today's sales are curated", () => {
    const s = summarizeDay([row({ curated: true }), row({ invoice_id: "B", curated: true }), row({ invoice_id: "C" })], "2026-11-09", "America/Los_Angeles", 1);
    expect(spokenSummary(s)).toBe("Today: 3 sales, twenty-four dollars, 0 in cash. Honey 500 g carried the day. Two of those are curated history.");
  });
  it("says nothing extra for a fully live day", () => {
    expect(spokenSummary(summarizeDay([row({})], "2026-11-09", "America/Los_Angeles", 1))).not.toContain("curated");
  });
  it("flags curated last Saturday in the plan", () => {
    expect(spokenPlan([{ sku: "x", text: "Bring more honey: 8 sold today against 2 last Saturday." }], true)).toMatch(/curated history\.$/);
  });
});

describe("cents, modes and key binding", () => {
  const withPrice = (unit_price: number): Sale => ({ ...good, items: [{ sku: "x", name: "X", qty: 1, unit_price }], total: unit_price });
  it("rejects sub-cent and fractional-cent prices", () => {
    expect(validateSale(withPrice(0.001))).not.toBeNull();
    expect(validateSale(withPrice(0.333))).not.toBeNull();
    expect(validateSale(withPrice(0.01))).toBeNull();
    expect(validateSale(withPrice(7.5))).toBeNull();
  });
  it("rejects an unknown payment mode, a bad email and an oversized name", () => {
    expect(validateSale({ ...good, payment_mode: "bogus" as never })).not.toBeNull();
    expect(validateSale({ ...good, payment_mode: "paypal_later", payer_email: "not an email\r\nBcc: x@y.z" })).not.toBeNull();
    expect(validateSale({ ...good, payment_mode: "paypal_later", payer_email: "anna@example.com", payer_name: "Anna" })).toBeNull();
    expect(validateSale({ ...good, payer_name: "x".repeat(61) })).not.toBeNull();
  });
  it("ignores a spoken price that rounds to zero and uses the catalog price", () => {
    const { items } = priceLines([{ sku: "honey-500", qty: 1, custom_price: 0.003 }], DEFAULT_CATALOG, 1);
    expect(items[0].unit_price).toBe(8);
  });
});

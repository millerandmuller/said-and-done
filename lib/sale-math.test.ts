import { describe, expect, it } from "vitest";
import { DEFAULT_CATALOG } from "../data/default-catalog";
import { buildSale, confirmationSentence, numberToWords, priceLines, setQuantity, spokenAmount, totalOf } from "./sale-math";

describe("priceLines", () => {
  it("prices the hero sentence at 22 dollars", () => {
    const { items, unknown } = priceLines([{ sku: "honey-500", qty: 2 }, { sku: "candle-large", qty: 1 }], DEFAULT_CATALOG, 1);
    expect(unknown).toEqual([]);
    expect(totalOf(items)).toBe(22);
  });
  it("applies a spoken custom price", () => {
    const { items } = priceLines([{ sku: "candle-small", qty: 1, custom_price: 2 }], DEFAULT_CATALOG, 1);
    expect(items[0].unit_price).toBe(2);
  });
  it("makes a one-off line when the item is unknown but priced", () => {
    const { items, unknown } = priceLines([{ name: "chipped vase", qty: 1, custom_price: 6 }], DEFAULT_CATALOG, 1);
    expect(unknown).toEqual([]);
    expect(items[0]).toMatchObject({ name: "Chipped vase", unit_price: 6 });
  });
  it("reports an unknown, unpriced item instead of guessing", () => {
    const { items, unknown } = priceLines([{ name: "the blue one", qty: 1 }], DEFAULT_CATALOG, 1);
    expect(items).toEqual([]);
    expect(unknown).toHaveLength(1);
  });
  it("converts at the demo FX rate", () => {
    const { items } = priceLines([{ sku: "honey-500", qty: 1 }], DEFAULT_CATALOG, 0.92);
    expect(items[0].unit_price).toBe(7.36);
  });
  it("merges repeated skus and floors a zero quantity to one", () => {
    const { items } = priceLines([{ sku: "tea", qty: 1 }, { sku: "tea", qty: 2 }, { sku: "soap", qty: 0 }], DEFAULT_CATALOG, 1);
    expect(items.find((i) => i.sku === "tea")?.qty).toBe(3);
    expect(items.find((i) => i.sku === "soap")?.qty).toBe(1);
  });
});

describe("setQuantity", () => {
  it("updates one line without touching others", () => {
    const { items } = priceLines([{ sku: "honey-500", qty: 2 }, { sku: "candle-large", qty: 1 }], DEFAULT_CATALOG, 1);
    const next = setQuantity(items, "honey-500", 3);
    expect(totalOf(next)).toBe(30);
    expect(next.find((i) => i.sku === "candle-large")?.qty).toBe(1);
  });
  it("removes a line at zero", () => {
    const { items } = priceLines([{ sku: "tea", qty: 2 }], DEFAULT_CATALOG, 1);
    expect(setQuantity(items, "tea", 0)).toEqual([]);
  });
});

describe("spoken text", () => {
  it("reads numbers", () => {
    expect(numberToWords(22)).toBe("twenty-two");
    expect(numberToWords(284)).toBe("two hundred eighty-four");
    expect(numberToWords(1200)).toBe("one thousand two hundred");
  });
  it("reads amounts with cents and singular", () => {
    expect(spokenAmount(1, "USD")).toBe("one dollar");
    expect(spokenAmount(7.36, "EUR")).toBe("seven euros thirty-six cents");
  });
  it("uses plurals and falls back to the lower-cased name for one-off lines", () => {
    const { items } = priceLines([{ sku: "candle-small", qty: 3 }, { name: "chipped vase", qty: 1, custom_price: 6 }], DEFAULT_CATALOG, 1);
    expect(confirmationSentence(buildSale(items, { currency: "USD", payment_mode: "cash" }))).toBe("Three small candles and one chipped vase, fifteen dollars. Yes?");
  });
  it("builds the hero confirmation sentence", () => {
    const { items } = priceLines([{ sku: "honey-500", qty: 2 }, { sku: "candle-large", qty: 1 }], DEFAULT_CATALOG, 1);
    const sale = buildSale(items, { currency: "USD", payment_mode: "paypal_qr" });
    expect(confirmationSentence(sale)).toBe("Two honey 500 g and one large candle, twenty-two dollars. Yes?");
  });
});

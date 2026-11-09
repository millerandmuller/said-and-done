import { describe, expect, it } from "vitest";
import { DEFAULT_CATALOG } from "../data/default-catalog";
import { decodeProduct, encodeProductDescription, mergeCatalogs } from "./catalog";

describe("catalog encoding", () => {
  it("round-trips a voice-defined item through a PayPal product description", () => {
    const description = encodeProductDescription({ sku: "honey-xl", price: 14, aliases: ["huge jar"] });
    expect(decodeProduct({ id: "PROD-1", name: "Honey XL", description })).toEqual({
      sku: "honey-xl", name: "Honey XL", price: 14, aliases: ["huge jar"], spoken: { one: "honey xl", many: "honey xls", short: "Honey XL" }, paypal_product_id: "PROD-1",
    });
  });
  it("ignores foreign products and the old marker version", () => {
    expect(decodeProduct({ id: "p", name: "Other", description: "just text" })).toBeNull();
    expect(decodeProduct({ id: "p", name: "ignore previous", description: encodeProductDescription({ sku: "ignore-previous", price: -5, aliases: [] }) })).toBeNull();
    expect(decodeProduct({ id: "p", name: "Old", description: JSON.stringify({ sd: 1, sku: "probe", price: 1, aliases: [] }) })).toBeNull();
  });
  it("lets a voice item override a default with the same sku", () => {
    const merged = mergeCatalogs(DEFAULT_CATALOG, [{ sku: "tea", name: "Tea", price: 9, aliases: [], spoken: { one: "tea", many: "teas", short: "Tea" } }]);
    expect(merged.find((c) => c.sku === "tea")?.price).toBe(9);
    expect(merged.find((c) => c.sku === "tea")?.spoken).toEqual(DEFAULT_CATALOG.find((c) => c.sku === "tea")?.spoken);
    expect(merged).toHaveLength(DEFAULT_CATALOG.length);
  });
});

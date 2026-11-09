import { describe, expect, it } from "vitest";
import { DEFAULT_CATALOG } from "../data/default-catalog";
import { decodeProduct, encodeProductDescription, mergeCatalogs, oldestFirst } from "./catalog";

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
  it("two products with one sku: the newest definition wins, whatever order PayPal lists them in", () => {
    const old = { id: "PROD-B", name: "Wildflower soap bars", create_time: "2026-11-09T10:00:00Z", description: encodeProductDescription({ sku: "wildflower-soap-bars", price: 4, aliases: [] }) };
    const fresh = { id: "PROD-A", name: "Wildflower soap bars", create_time: "2026-11-09T18:00:00Z", description: encodeProductDescription({ sku: "wildflower-soap-bars", price: 5, aliases: ["the meadow bar"] }) };
    for (const rows of [[old, fresh], [fresh, old]]) {
      const extras = oldestFirst(rows).map(decodeProduct).filter((x) => x !== null);
      const item = mergeCatalogs(DEFAULT_CATALOG, extras).find((c) => c.sku === "wildflower-soap-bars");
      expect(item?.price).toBe(5);
      expect(item?.aliases).toEqual(["the meadow bar"]);
    }
  });
});

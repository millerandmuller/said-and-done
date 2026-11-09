// The demo stall's starting catalog (brief section 1.6 "Demo-Daten"). Prices in USD.
// Curated on purpose: a seller never types a catalog; extra items arrive by voice and live in PayPal products.
import type { CatalogItem } from "../lib/types";

export const DEFAULT_CATALOG: CatalogItem[] = [
  { sku: "honey-500", spoken: { one: "honey 500 g", many: "honey 500 g", short: "Honey" }, name: "Honey 500 g", price: 8, aliases: ["honey", "jar of honey", "jars of honey", "big jar", "big honey", "large honey", "500 gram honey"] },
  { sku: "honey-250", spoken: { one: "small honey", many: "small honeys", short: "Small honey" }, name: "Honey 250 g", price: 5, aliases: ["small honey", "little jar", "small jar", "mini honey", "250 gram honey"] },
  { sku: "candle-large", spoken: { one: "large candle", many: "large candles", short: "Large candles" }, name: "Beeswax candle large", price: 6, aliases: ["big candle", "large candle", "candle", "tall candle", "beeswax candle"] },
  { sku: "candle-small", spoken: { one: "small candle", many: "small candles", short: "Small candles" }, name: "Beeswax candle small", price: 3, aliases: ["small candle", "little candle", "tea light", "mini candle"] },
  { sku: "lip-balm", spoken: { one: "lip balm", many: "lip balms", short: "Lip balm" }, name: "Lip balm", price: 4, aliases: ["balm", "chapstick", "lip stuff"] },
  { sku: "soap", spoken: { one: "soap", many: "soaps", short: "Soap" }, name: "Soap", price: 5, aliases: ["soap bar", "honey soap", "bar of soap"] },
  { sku: "gift-box", spoken: { one: "gift box", many: "gift boxes", short: "Gift boxes" }, name: "Gift box", price: 15, aliases: ["gift set", "gift pack", "present box", "box"] },
  { sku: "jam", spoken: { one: "jam", many: "jams", short: "Jam" }, name: "Jam", price: 7, aliases: ["jam jar", "jar of jam", "preserves", "berry jam"] },
  { sku: "propolis", spoken: { one: "propolis tincture", many: "propolis tinctures", short: "Propolis" }, name: "Propolis tincture", price: 12, aliases: ["tincture", "propolis", "drops"] },
  { sku: "tea", spoken: { one: "tea", many: "teas", short: "Tea" }, name: "Tea", price: 6, aliases: ["herbal tea", "tea bag box", "tea tin"] },
];

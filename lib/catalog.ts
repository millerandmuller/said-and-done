// Catalog = bundled defaults + items the seller added by voice (stored as PayPal catalog products).
// PayPal is the store so the hosted demo works on stateless serverless functions.
// If PayPal is slow or down the last known catalog is served (brief F9: cached catalog).
import { DEFAULT_CATALOG } from "../data/default-catalog";
import { callTool } from "./paypal-toolkit";
import type { CatalogItem, SpokenForms } from "./types";

const MARKER_VERSION = 2; // products without sd:2 in their description are not ours
const TTL_MS = 15_000;

type ProductRow = { id: string; name: string; description?: string; create_time?: string };

// Two products can carry one sku (the seller redefines an item by voice). Oldest first, so the newest definition wins in mergeCatalogs, whatever order PayPal lists them in.
export function oldestFirst(rows: ProductRow[]): ProductRow[] {
  return [...rows].sort((a, b) => (a.create_time ?? "").localeCompare(b.create_time ?? "") || a.id.localeCompare(b.id));
}

let cache: { items: CatalogItem[]; at: number } | null = null;

export function encodeProductDescription(item: Pick<CatalogItem, "sku" | "price" | "aliases">): string {
  return JSON.stringify({ sd: MARKER_VERSION, sku: item.sku, price: item.price, aliases: item.aliases });
}

export function decodeProduct(row: ProductRow): CatalogItem | null {
  try {
    const meta = JSON.parse(row.description ?? "");
    if (meta?.sd !== MARKER_VERSION || typeof meta.sku !== "string" || typeof meta.price !== "number") return null;
    // A product with a non-positive or absurd price (e.g. left over in the sandbox) must never reach the prompt or a sale.
    if (!Number.isFinite(meta.price) || meta.price <= 0 || meta.price > 1000) return null;
    return { sku: meta.sku, name: row.name, price: meta.price, aliases: Array.isArray(meta.aliases) ? meta.aliases : [], spoken: simpleSpoken(row.name), paypal_product_id: row.id };
  } catch {
    return null;
  }
}

// Good-enough spoken forms for items the seller defined by voice: lower-case name, naive plural.
export function simpleSpoken(name: string): SpokenForms {
  const one = name.toLowerCase();
  const many = /(s|x|ch|sh)$/.test(one) ? one : `${one}s`;
  return { one, many, short: name.charAt(0).toUpperCase() + name.slice(1) };
}

export function mergeCatalogs(defaults: CatalogItem[], extras: CatalogItem[]): CatalogItem[] {
  const bySku = new Map(defaults.map((d) => [d.sku, d]));
  for (const e of extras) {
    const base = bySku.get(e.sku);
    // A PayPal product overrides price and aliases of a default with the same sku, but keeps the hand-written spoken forms.
    bySku.set(e.sku, base ? { ...e, spoken: base.spoken ?? e.spoken } : e);
  }
  return [...bySku.values()];
}

export async function getCatalog(): Promise<CatalogItem[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.items;
  try {
    const res = await callTool<{ products?: ProductRow[] }>("list_products", { page: 1, page_size: 100 });
    const extras = oldestFirst(res.products ?? []).map(decodeProduct).filter((x): x is CatalogItem => x !== null);
    cache = { items: mergeCatalogs(DEFAULT_CATALOG, extras), at: Date.now() };
  } catch (e) {
    console.warn("[catalog] PayPal list_products failed, serving last known catalog:", (e as Error).message);
    cache = { items: cache?.items ?? DEFAULT_CATALOG, at: Date.now() - TTL_MS + 3000 }; // retry in 3 s
  }
  return cache.items;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// "I sell 500 g honey for 8 dollars, people call it the big jar": creates a PayPal catalog product
// and makes it sellable immediately (cache updated in place).
export async function addCatalogItem(input: { name: string; price: number; aliases: string[] }): Promise<CatalogItem> {
  const sku = slugify(input.name);
  const draft: CatalogItem = { sku, name: input.name, price: input.price, aliases: input.aliases.map((a) => a.toLowerCase()) };
  // Spoken forms are not persisted in PayPal; decodeProduct derives the same simple forms on every read.
  draft.spoken = simpleSpoken(input.name);
  const created = await callTool<{ id: string }>("create_product", {
    name: draft.name,
    type: "PHYSICAL",
    category: "FOOD_PRODUCTS",
    description: encodeProductDescription(draft),
  });
  const item = { ...draft, paypal_product_id: created.id };
  const current = cache?.items ?? DEFAULT_CATALOG;
  cache = { items: mergeCatalogs(current, [item]), at: Date.now() };
  return item;
}

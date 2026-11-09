// Pure sale arithmetic: draft lines from the model + catalog -> priced Sale. No I/O, fully unit-tested.
// The model only chooses which item and how many; every price and the total are computed here,
// so a hallucinated price can never reach PayPal.
import type { CatalogItem, PaymentMode, Sale, SaleItem } from "./types";

export type DraftLine = {
  sku?: string | null; // catalog sku the model matched, null when unknown
  name?: string | null; // spoken name for one-off lines
  qty: number;
  custom_price?: number | null; // seller said "the chipped one for six" (USD, per unit)
};

export const MAX_QTY = 99;
export const MAX_UNIT_PRICE = 1000;
export const MAX_SALE_TOTAL = 5000;
export const ALLOWED_CURRENCIES = ["USD", "EUR"];
const PAYMENT_MODES: PaymentMode[] = ["paypal_qr", "paypal_later", "cash"];
export const isValidEmail = (e: unknown): e is string => typeof e === "string" && e.length <= 120 && EMAIL_SHAPE.test(e);
const EMAIL_SHAPE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

// Guard for anything that reaches PayPal. The browser is not trusted: lines must be positive, bounded, and the total is recomputed.
export function validateSale(sale: Sale): string | null {
  if (!sale || !Array.isArray(sale.items) || sale.items.length === 0) return "There is nothing to invoice.";
  if (!ALLOWED_CURRENCIES.includes(sale.currency)) return `Currency ${sale.currency} is not supported.`;
  for (const i of sale.items) {
    if (!i || typeof i !== "object") return "An item is not valid.";
    if (!Number.isInteger(i.qty) || i.qty < 1 || i.qty > MAX_QTY) return `Quantity for ${i.name} must be between 1 and ${MAX_QTY}.`;
    if (!Number.isFinite(i.unit_price) || i.unit_price < 0.01 || i.unit_price > MAX_UNIT_PRICE) return `Price for ${i.name} is out of range.`;
    if (Math.abs(i.unit_price * 100 - Math.round(i.unit_price * 100)) > 1e-6) return `Price for ${i.name} must be in whole cents.`;
    if (typeof i.name !== "string" || !i.name.trim() || i.name.length > 100) return "An item name is missing or too long.";
  }
  if (!PAYMENT_MODES.includes(sale.payment_mode)) return "Unknown payment mode.";
  if (sale.payer_email != null && !isValidEmail(sale.payer_email)) return "That email address does not look right.";
  if (sale.payer_name != null && (typeof sale.payer_name !== "string" || sale.payer_name.length > 60)) return "The payer name is not valid.";
  if (totalOf(sale.items) > MAX_SALE_TOTAL) return "That total is too large for the counter.";
  return null;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type PricedResult = { items: SaleItem[]; unknown: DraftLine[] };

export function priceLines(lines: DraftLine[], catalog: CatalogItem[], fx: number): PricedResult {
  const bySku = new Map(catalog.map((c) => [c.sku, c]));
  const items: SaleItem[] = [];
  const unknown: DraftLine[] = [];
  for (const line of lines) {
    const qty = Math.min(MAX_QTY, Math.max(1, Math.round(line.qty || 1)));
    // Zero, negative or sub-cent (after conversion) prices are never honoured.
    const wanted = line.custom_price != null && line.custom_price > 0 ? Math.min(line.custom_price, MAX_UNIT_PRICE) : null;
    const custom = wanted !== null && round2(wanted * fx) >= 0.01 ? wanted : null;
    const item = line.sku ? bySku.get(line.sku) : undefined;
    if (item) {
      const base = custom ?? item.price;
      items.push({ sku: item.sku, name: item.name, qty, unit_price: round2(base * fx), spoken: item.spoken });
    } else if (custom !== null && line.name) {
      items.push({ sku: `custom-${slug(line.name)}`, name: capitalise(line.name), qty, unit_price: round2(custom * fx) });
    } else {
      unknown.push(line);
    }
  }
  return { items: mergeSameSku(items), unknown };
}

function mergeSameSku(items: SaleItem[]): SaleItem[] {
  const merged = new Map<string, SaleItem>();
  for (const i of items) {
    const key = `${i.sku}@${i.unit_price}`;
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, qty: prev.qty + i.qty } : { ...i });
  }
  return [...merged.values()];
}

export const totalOf = (items: SaleItem[]) => round2(items.reduce((sum, i) => sum + i.qty * i.unit_price, 0));

export function buildSale(
  items: SaleItem[],
  opts: { currency: string; payment_mode: PaymentMode; payer_email?: string; payer_name?: string },
): Sale {
  return { items, currency: opts.currency, total: totalOf(items), payment_mode: opts.payment_mode, payer_email: opts.payer_email, payer_name: opts.payer_name };
}

// Applies a spoken correction ("no, three") to the line that was just discussed; returns a new array.
export function setQuantity(items: SaleItem[], sku: string, qty: number): SaleItem[] {
  if (qty <= 0) return items.filter((i) => i.sku !== sku);
  return items.map((i) => (i.sku === sku ? { ...i, qty: Math.round(qty) } : i));
}

export function removeItem(items: SaleItem[], sku: string): SaleItem[] {
  return items.filter((i) => i.sku !== sku);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// One-sentence confirmation read aloud: "Two Honey 500 g and one Beeswax candle large, twenty-two dollars. Yes?"
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

export function numberToWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberToWords(n % 100)}` : ""}`;
  return `${numberToWords(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${numberToWords(n % 1000)}` : ""}`;
}

const CURRENCY_WORDS: Record<string, [string, string]> = { USD: ["dollar", "cent"], EUR: ["euro", "cent"] };

export function spokenAmount(amount: number, currency: string): string {
  const [unit, sub] = CURRENCY_WORDS[currency] ?? [currency, "cent"];
  const whole = Math.floor(amount);
  const cents = Math.round((amount - whole) * 100);
  const wholePart = `${numberToWords(whole)} ${unit}${whole === 1 ? "" : "s"}`;
  return cents ? `${wholePart} ${numberToWords(cents)} ${sub}${cents === 1 ? "" : "s"}` : wholePart;
}

export function spokenItems(items: SaleItem[]): string {
  const parts = items.map((i) => `${numberToWords(i.qty)} ${i.spoken ? (i.qty === 1 ? i.spoken.one : i.spoken.many) : i.name.toLowerCase()}`);
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function confirmationSentence(sale: Sale): string {
  return `${capitalise(spokenItems(sale.items))}, ${spokenAmount(sale.total, sale.currency)}. Yes?`;
}

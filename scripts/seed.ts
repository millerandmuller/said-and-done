// npm run seed            -> catalog products, 8 sales today, 12 last Saturday, 1 pay-later regular (idempotent)
// npm run seed -- --reset -> first cancels every open (unpaid) Said & Done invoice, e.g. leftovers from rehearsals
import { DEFAULT_CATALOG } from "../data/default-catalog";
import { SEED_LAST_SATURDAY, SEED_PAY_LATER, SEED_TODAY, type SeedSale } from "../data/seed-sales";
import { encodeProductDescription } from "../lib/catalog";
import { getConfig } from "../lib/config";
import { dayKey, lastSaturdayKey } from "../lib/day";
import { createInvoiceDraft, recordExternalPayment, shareInvoice } from "../lib/invoices";
import { fetchLedger } from "../lib/ledger";
import { callTool } from "../lib/paypal-toolkit";
import { buildSale, priceLines } from "../lib/sale-math";
import { OWING_STATES } from "../lib/statuses";

const cfg = getConfig();
const catalog = DEFAULT_CATALOG;

async function inParallel<T>(list: T[], size: number, fn: (x: T) => Promise<void>) {
  for (let i = 0; i < list.length; i += size) await Promise.all(list.slice(i, i + size).map(fn));
}

async function seedCatalogProducts() {
  const existing = await callTool<{ products?: { description?: string }[] }>("list_products", { page: 1, page_size: 100 });
  const have = new Set((existing.products ?? []).map((p) => { try { return JSON.parse(p.description ?? "").sku as string; } catch { return ""; } }));
  const missing = catalog.filter((c) => !have.has(c.sku));
  await inParallel(missing, 4, async (c) => {
    await callTool("create_product", { name: c.name, type: "PHYSICAL", category: "FOOD_PRODUCTS", description: encodeProductDescription(c) });
  });
  console.log(`catalog: ${missing.length} products created, ${catalog.length - missing.length} already there`);
}

async function seedSales(label: string, tag: string, date: string, sales: SeedSale[], alreadySeeded: number) {
  const todo = sales.slice(alreadySeeded);
  await inParallel(todo, 4, async (s) => {
    const lines = s.items.map(([sku, qty]) => ({ sku, qty }));
    const { items } = priceLines(lines, catalog, 1);
    const sale = buildSale(items, { currency: "USD", payment_mode: s.method === "CASH" ? "cash" : "paypal_qr" });
    const id = await createInvoiceDraft(sale, { seedTag: tag, invoiceDate: date });
    await shareInvoice(id, sale);
    await recordExternalPayment(id, sale.total, "USD", { method: s.method, paymentDate: date, note: "Curated history (seed data)" });
  });
  console.log(`${label}: ${todo.length} created, ${alreadySeeded} already there (${date})`);
}

async function seedPayLater(today: string) {
  const email = process.env.PAYPAL_SANDBOX_PERSONAL_EMAIL;
  if (!email) return console.log("pay-later: skipped, PAYPAL_SANDBOX_PERSONAL_EMAIL is not set");
  const rows = await fetchLedger({ fresh: true });
  if (rows.some((r) => r.later && r.payer_email === email && OWING_STATES.includes(r.status))) return console.log("pay-later: already there");
  const { items } = priceLines([{ sku: SEED_PAY_LATER.sku, qty: SEED_PAY_LATER.qty }], catalog, 1);
  const sale = buildSale(items, { currency: "USD", payment_mode: "paypal_later", payer_email: email, payer_name: SEED_PAY_LATER.name });
  const id = await createInvoiceDraft(sale, { invoiceDate: today });
  await shareInvoice(id, sale);
  console.log(`pay-later: ${SEED_PAY_LATER.name} owes ${sale.total} (${id}), emailed to ${email}`);
}

async function resetOpen() {
  const rows = await fetchLedger({ fresh: true });
  const open = rows.filter((r) => OWING_STATES.includes(r.status));
  const stuck: string[] = [];
  await inParallel(open, 4, async (r) => {
    try {
      await callTool("cancel_sent_invoice", { invoice_id: r.invoice_id, send_to_recipient: false });
    } catch (err) {
      // PayPal refuses to cancel partially paid invoices; report them instead of aborting the reset.
      stuck.push(`${r.invoice_id} (${r.status}): ${(err as Error).message.slice(-60)}`);
    }
  });
  console.log(`reset: cancelled ${open.length - stuck.length} of ${open.length} open invoices`);
  if (stuck.length) console.log(`reset: could not cancel, remove in the dashboard:\n  ${stuck.join("\n  ")}`);
}

async function main() {
  const now = new Date().toISOString();
  const today = dayKey(now, cfg.timezone);
  const saturday = lastSaturdayKey(now, cfg.timezone);
  if (process.argv.includes("--reset")) await resetOpen();
  await seedCatalogProducts();
  const rows = await fetchLedger({ fresh: true });
  const curatedOn = (day: string) => rows.filter((r) => r.curated && dayKey(r.time, cfg.timezone) === day).length;
  await seedSales("today", "seed-today", today, SEED_TODAY, Math.min(curatedOn(today), SEED_TODAY.length));
  await seedSales("last Saturday", "seed-saturday", saturday, SEED_LAST_SATURDAY, Math.min(curatedOn(saturday), SEED_LAST_SATURDAY.length));
  await seedPayLater(today);
  const after = await fetchLedger({ fresh: true });
  console.log(`ledger now: ${after.length} invoices, ${after.filter((r) => r.curated).length} curated`);
}
main().catch((e) => { console.error("SEED FAILED:", e.message); process.exit(1); });

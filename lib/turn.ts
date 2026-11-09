// One spoken turn, end to end on the server: understand -> price -> decide what the counter says and shows.
// The browser sends the utterance plus the current draft; it gets back a typed result to render and speak.
import { getCatalog, addCatalogItem } from "./catalog";
import { getConfig } from "./config";
import { dayKey, lastSaturdayKey, owing, planNextWeek, spokenPlan, spokenSummary, summarizeDay } from "./day";
import { sendReminder } from "./invoices";
import { fetchLedger } from "./ledger";
import { buildSale, confirmationSentence, isValidEmail, numberToWords, priceLines, spokenAmount, type DraftLine } from "./sale-math";
import { understand } from "./understand";
import type { CatalogItem, PaymentMode, Sale, SaleItem } from "./types";

export type Draft = { items: SaleItem[]; currency: string; payment_mode: PaymentMode; payer_email?: string; payer_name?: string };

export type TurnResult =
  | { kind: "sale"; sale: Sale; speak: string }
  | { kind: "ask_price"; speak: string; unknown: string[]; partial: Sale | null }
  | { kind: "summary"; speak: string }
  | { kind: "plan"; speak: string }
  | { kind: "reminders"; speak: string; reminded: number }
  | { kind: "catalog_added"; speak: string; item: CatalogItem }
  | { kind: "unknown"; speak: string }
  | { kind: "ignored" }; // chatter that is not a sale, command or question: the counter stays silent

// Draft lines that were custom (not in the catalog) must survive a correction; expose them as temporary catalog entries.
function withDraftCustoms(catalog: CatalogItem[], draft: Draft, fx: number): CatalogItem[] {
  const known = new Set(catalog.map((c) => c.sku));
  const customs = draft.items.filter((i) => !known.has(i.sku)).map((i) => ({ sku: i.sku, name: i.name, aliases: [], price: i.unit_price / fx }));
  return [...catalog, ...customs];
}

export async function interpretTurn(utterance: string, draft: Draft | null, focusSku?: string): Promise<TurnResult> {
  const cfg = getConfig();
  const catalog = await getCatalog();
  const draftFx = draft?.currency === "EUR" ? cfg.demoFxUsdEur : 1;
  const u = await understand(utterance, withDraftCustoms(catalog, draft ?? emptyDraft(cfg.defaultCurrency), draftFx), draft?.items ?? [], focusSku);

  switch (u.intent) {
    case "sale":
      return saleTurn(u, draft, catalog, cfg.defaultCurrency, cfg.demoFxUsdEur);
    case "add_catalog_item":
      return catalogTurn(u.new_item);
    case "day_summary":
      return summaryTurn(cfg.timezone, cfg.demoFxUsdEur);
    case "plan_week":
      return planTurn(cfg.timezone, cfg.demoFxUsdEur);
    case "remind_owing":
      return reminderTurn();
    default:
      return { kind: "ignored" };
  }
}

const emptyDraft = (currency: string): Draft => ({ items: [], currency, payment_mode: "paypal_qr" });

type U = Awaited<ReturnType<typeof understand>>;

function saleTurn(u: U, draft: Draft | null, catalog: CatalogItem[], defaultCurrency: string, usdEur: number): TurnResult {
  const currency = u.currency ?? draft?.currency ?? defaultCurrency;
  const fx = currency === "EUR" ? usdEur : 1;
  const draftFx = draft?.currency === "EUR" ? usdEur : 1;
  const lines: DraftLine[] = u.items.filter((i) => i.qty > 0).map((i) => ({ sku: i.sku, name: i.name, qty: i.qty, custom_price: i.custom_price }));
  const { items, unknown } = priceLines(lines, withDraftCustoms(catalog, draft ?? emptyDraft(defaultCurrency), draftFx), fx);
  const meta = {
    currency,
    payment_mode: (u.payment_mode ?? draft?.payment_mode ?? "paypal_qr") as PaymentMode,
    payer_email: [u.payer_email, draft?.payer_email].find(isValidEmail) ?? undefined, // a half-heard address ("anna@example") is dropped, not carried to PayPal
    payer_name: u.payer_name ?? draft?.payer_name,
  };
  if (unknown.length) {
    const names = unknown.map((l) => l.name ?? "that");
    return { kind: "ask_price", unknown: names, partial: items.length ? buildSale(items, meta) : null, speak: `I don't know '${names[0]}'. What does it cost?` };
  }
  if (!items.length) return { kind: "ignored" };
  const sale = buildSale(items, meta);
  return { kind: "sale", sale, speak: confirmationSentence(sale) };
}

async function catalogTurn(newItem: U["new_item"]): Promise<TurnResult> {
  const ok = newItem && Number.isFinite(newItem.price) && newItem.price >= 0.01 && newItem.price <= 500 && Math.abs(newItem.price * 100 - Math.round(newItem.price * 100)) < 1e-6 && newItem.name.trim().length > 0 && newItem.name.length <= 60;
  if (!newItem || !ok) return { kind: "unknown", speak: "I didn't catch the price." };
  const item = await addCatalogItem(newItem);
  return { kind: "catalog_added", item, speak: `Added ${item.name.toLowerCase()}, ${spokenAmount(item.price, "USD")}. ${item.aliases[0] ? `Say '${item.aliases[0]}' to sell it.` : ""}`.trim() };
}

async function summaryTurn(tz: string, fx: number): Promise<TurnResult> {
  const [rows, catalog] = await Promise.all([fetchLedger({ fresh: true }), getCatalog()]);
  const shortByName = new Map(catalog.map((c) => [c.name, c.spoken?.short ?? c.name]));
  const summary = summarizeDay(rows, dayKey(new Date().toISOString(), tz), tz, fx);
  return { kind: "summary", speak: spokenSummary(summary, (n) => shortByName.get(n) ?? n) };
}

async function planTurn(tz: string, fx: number): Promise<TurnResult> {
  const [rows, catalog] = await Promise.all([fetchLedger({ fresh: true }), getCatalog()]);
  const labelByName = new Map(catalog.map((c) => [c.name, (c.spoken?.short ?? c.name).toLowerCase()]));
  const now = new Date().toISOString();
  const today = summarizeDay(rows, dayKey(now, tz), tz, fx);
  const last = summarizeDay(rows, lastSaturdayKey(now, tz), tz, fx);
  return { kind: "plan", speak: spokenPlan(planNextWeek(today, last, (n) => labelByName.get(n) ?? n.toLowerCase()), last.curatedCount > 0) };
}

async function reminderTurn(): Promise<TurnResult> {
  const rows = await fetchLedger({ fresh: true });
  const debts = owing(rows).filter((r) => r.payer_email);
  if (!debts.length) return { kind: "reminders", reminded: 0, speak: "Nobody owes you anything." };
  await Promise.all(debts.map((r) => sendReminder(r.invoice_id)));
  const first = debts[0];
  const who = first.payer && !first.payer.includes("@") ? first.payer : "A regular";
  const lead = `${who} still owes ${spokenAmount(first.total, first.currency)}`;
  return { kind: "reminders", reminded: debts.length, speak: debts.length === 1 ? `${lead}. Reminder sent.` : `${lead}, and ${numberToWords(debts.length - 1)} more. Reminders sent.` };
}

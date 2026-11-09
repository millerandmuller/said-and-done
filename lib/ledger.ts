// The ledger is read from PayPal (the source of truth for status and amounts) and cached briefly.
// list_invoices gives status and totals; get_invoice adds line items, payments and the SD: reference tag.
import { callTool } from "./paypal-toolkit";
import type { InvoiceStatus, LedgerRow, PaymentMode } from "./types";

type RawInvoice = {
  id?: string;
  status: InvoiceStatus;
  detail?: { currency_code?: string; reference?: string; metadata?: { create_time?: string }; invoice_date?: string };
  primary_recipients?: { billing_info?: { email_address?: string; name?: { given_name?: string; full_name?: string } } }[];
  items?: { name: string; quantity: string; unit_amount: { value: string } }[];
  amount?: { value: string; currency_code?: string };
  payments?: { transactions?: { method?: string; payment_date?: string; amount?: { value: string } }[] };
};

export function modeFromReference(reference?: string): PaymentMode | "seed" | undefined {
  if (!reference?.startsWith("SD:")) return undefined;
  const tag = reference.slice(3);
  if (tag.startsWith("seed")) return "seed";
  return tag === "qr" ? "paypal_qr" : tag === "later" ? "paypal_later" : tag === "cash" ? "cash" : undefined;
}

// Maps one PayPal invoice to a ledger row. Returns null for invoices this app did not create.
export function rowFromInvoice(id: string, inv: RawInvoice): LedgerRow | null {
  const reference = inv.detail?.reference;
  if (!reference?.startsWith("SD:")) return null;
  const payment = inv.payments?.transactions?.[0];
  const cashPaid = payment?.method === "CASH";
  const recipient = inv.primary_recipients?.[0]?.billing_info;
  return {
    invoice_id: id,
    // Curated history is dated by its recorded payment date; live sales keep PayPal's real creation time.
    time: reference.startsWith("SD:seed") && payment?.payment_date ? normaliseDate(payment.payment_date) : (inv.detail?.metadata?.create_time ?? new Date().toISOString()),
    items: (inv.items ?? []).map((i) => ({ name: i.name, qty: Number(i.quantity), unit_price: Number(i.unit_amount.value) })),
    total: Number(inv.amount?.value ?? 0),
    currency: inv.detail?.currency_code ?? inv.amount?.currency_code ?? "USD",
    method: cashPaid || reference === "SD:cash" ? "CASH" : "PAYPAL",
    status: inv.status,
    payer: displayName(recipient),
    curated: reference.startsWith("SD:seed"),
    later: reference === "SD:later",
    payer_email: recipient?.email_address,
  };
}

// Prefer the buyer's name; "Customer" is the placeholder this app sends when no name was spoken, so it falls back to the email.
export function displayName(billing?: { email_address?: string; name?: { given_name?: string; full_name?: string } }): string | undefined {
  const name = billing?.name?.full_name ?? billing?.name?.given_name;
  return name && name !== "Customer" ? name : billing?.email_address ?? name;
}

// PayPal returns payment_date as "2026-11-07" or a full timestamp; make both valid ISO.
function normaliseDate(d: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T20:00:00.000Z` : d;
}

const terminalCache = new Map<string, LedgerRow | null>(); // PAID / cancelled invoices never change again
let listCache: { rows: LedgerRow[]; at: number } | null = null;
const TTL_MS = 8000;
const CONCURRENCY = 8;

async function inChunks<T, R>(list: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < list.length; i += size) out.push(...(await Promise.all(list.slice(i, i + size).map(fn))));
  return out;
}

async function listAllInvoiceIds(): Promise<{ id: string; status: InvoiceStatus }[]> {
  const ids: { id: string; status: InvoiceStatus }[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await callTool<{ items?: { id: string; status: InvoiceStatus }[]; total_pages?: number }>("list_invoices", { page, page_size: 100, total_required: true });
    ids.push(...(res.items ?? []).map((i) => ({ id: i.id, status: i.status })));
    if (page >= (res.total_pages ?? 1)) break;
  }
  return ids;
}

export async function fetchLedger(opts: { fresh?: boolean } = {}): Promise<LedgerRow[]> {
  if (!opts.fresh && listCache && Date.now() - listCache.at < TTL_MS) return listCache.rows;
  try {
    const ids = await listAllInvoiceIds();
    const rows = await inChunks(ids, CONCURRENCY, async ({ id, status }) => {
      if (terminalCache.has(id)) return terminalCache.get(id)!;
      const inv = await callTool<RawInvoice>("get_invoice", { invoice_id: id });
      const row = rowFromInvoice(id, inv);
      if (status !== "UNPAID" && status !== "SENT" && status !== "PAYMENT_PENDING" && status !== "DRAFT") terminalCache.set(id, row);
      return row;
    });
    const clean = rows.filter((r): r is LedgerRow => r !== null).sort((a, b) => b.time.localeCompare(a.time));
    listCache = { rows: clean, at: Date.now() };
    return clean;
  } catch (e) {
    console.warn("[ledger] refresh failed, serving last known ledger:", (e as Error).message);
    if (listCache) return listCache.rows;
    throw e;
  }
}

export function invalidateLedger() {
  listCache = null;
}

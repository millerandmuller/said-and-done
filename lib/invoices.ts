// Invoice lifecycle on top of the PayPal Agent Toolkit tools:
// create_invoice -> send_invoice (link only) -> generate_invoice_qr_code -> get_invoice (poll).
import { callTool } from "./paypal-toolkit";
import { getConfig } from "./config";
import type { CreatedInvoice, InvoiceStatus, Sale } from "./types";

const money = (n: number) => n.toFixed(2);

export function invoiceIdFromHref(href: string): string {
  const id = href.split("/").pop();
  if (!id || !id.startsWith("INV")) throw new Error(`Cannot read an invoice id from "${href}"`);
  return id;
}

// The toolkit returns the QR as a raw multipart body ("--boundary ... image/png-base64 ... --boundary--").
// Pull the base64 payload out; return undefined when the shape is unexpected so the caller can fall back to the link.
export function parseQrPayload(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const parts = raw.split(/\r?\n\r?\n/);
  const candidate = parts.length > 1 ? parts[1] : parts[0];
  const base64 = candidate.split(/\r?\n--/)[0].trim();
  return /^[A-Za-z0-9+/=]+$/.test(base64) && base64.length > 100 ? base64 : undefined;
}

// `reference` tags every invoice so the ledger can tell how it was sold ("SD:qr", "SD:later", "SD:cash", "SD:seed-saturday").
export function referenceFor(sale: Sale, seedTag?: string): string {
  return seedTag ? `SD:${seedTag}` : `SD:${sale.payment_mode === "paypal_qr" ? "qr" : sale.payment_mode === "paypal_later" ? "later" : "cash"}`;
}

export function buildInvoiceArgs(sale: Sale, opts: { sellerName: string; seedTag?: string; invoiceDate?: string }) {
  const recipient: Record<string, unknown> = { name: { given_name: sale.payer_name ?? "Customer" } };
  if (sale.payer_email) recipient.email_address = sale.payer_email;
  return {
    currency_code: sale.currency,
    invoicer_business_name: opts.sellerName,
    reference: referenceFor(sale, opts.seedTag),
    ...(opts.invoiceDate ? { invoice_date: opts.invoiceDate } : {}),
    primary_recipients: [{ billing_info: recipient }],
    items: sale.items.map((i) => ({
      name: i.name,
      quantity: String(i.qty),
      unit_amount: { currency_code: sale.currency, value: money(i.unit_price) },
    })),
  };
}

export async function createInvoiceDraft(sale: Sale, opts: { seedTag?: string; invoiceDate?: string } = {}): Promise<string> {
  const cfg = getConfig();
  const created = await callTool<{ href: string }>("create_invoice", buildInvoiceArgs(sale, { sellerName: cfg.sellerName, ...opts }));
  return invoiceIdFromHref(created.href);
}

// Shares the invoice as a link (the QR encodes it). Email is only sent when the seller asked for pay-later with an address.
export async function shareInvoice(invoice_id: string, sale: Sale): Promise<string> {
  const sendByEmail = sale.payment_mode === "paypal_later" && !!sale.payer_email;
  const shared = await callTool<{ href: string }>("send_invoice", { invoice_id, send_to_recipient: sendByEmail });
  return shared.href;
}

export async function createSaleInvoice(sale: Sale, opts: { seedTag?: string; invoiceDate?: string } = {}): Promise<CreatedInvoice> {
  const invoice_id = await createInvoiceDraft(sale, opts);
  const payer_url = await shareInvoice(invoice_id, sale);
  return { invoice_id, payer_url, total: sale.total, currency: sale.currency };
}

export async function generateQr(invoice_id: string): Promise<string | undefined> {
  const raw = await callTool<unknown>("generate_invoice_qr_code", { invoice_id, width: 500, height: 500 }).catch(
    // callTool tries JSON.parse; a multipart body is not JSON, so recover the text from the error.
    (e: Error) => e.message,
  );
  return parseQrPayload(typeof raw === "string" ? raw.replace(/^PayPal toolkit tool generate_invoice_qr_code failed: /, "") : raw);
}

// The amount PayPal holds on the invoice: the only figure a cash payment may be recorded against.
export async function getInvoiceAmount(invoice_id: string): Promise<{ total: number; currency: string }> {
  const inv = await callTool<{ amount?: { value: string; currency_code: string }; detail?: { currency_code?: string } }>("get_invoice", { invoice_id });
  if (!inv.amount) throw new Error("PayPal returned no amount for that invoice.");
  return { total: Number(inv.amount.value), currency: inv.amount.currency_code ?? inv.detail?.currency_code ?? "USD" };
}

export async function getInvoiceStatus(invoice_id: string): Promise<InvoiceStatus> {
  const inv = await callTool<{ status: InvoiceStatus }>("get_invoice", { invoice_id });
  return inv.status;
}

// Records an external payment (cash at the stall, or curated history). `paymentDate` is yyyy-MM-DD.
export async function recordExternalPayment(
  invoice_id: string,
  total: number,
  currency: string,
  opts: { method?: "CASH" | "PAYPAL"; paymentDate?: string; note?: string } = {},
): Promise<void> {
  await callTool("record_payment_for_invoice", {
    invoice_id,
    method: opts.method ?? "CASH",
    amount: { currency_code: currency, value: money(total) },
    note: opts.note ?? "Paid in cash at the stall",
    ...(opts.paymentDate ? { payment_date: opts.paymentDate } : {}),
  });
}

export async function sendReminder(invoice_id: string, note?: string): Promise<void> {
  await callTool("send_invoice_reminder", { invoice_id, note: note ?? "Friendly reminder from the stall." });
}

// What happens after the seller says "yes": invoice, share link, QR, or the cash / pay-later variants.
// Returns a timed trace of the PayPal Agent Toolkit calls; the Proof beat shows it on screen.
import { createInvoiceDraft, generateQr, recordExternalPayment, shareInvoice } from "./invoices";
import { once } from "./idempotency";
import { invalidateLedger } from "./ledger";
import { totalOf, validateSale } from "./sale-math";
import type { InvoiceStatus, Sale } from "./types";

export type TraceStep = { tool: string; ms: number };

export type CheckoutResult = {
  invoice_id: string;
  mode: Sale["payment_mode"];
  status: InvoiceStatus | "MARKED_AS_PAID";
  payer_url: string;
  qr_png_base64?: string;
  total: number;
  currency: string;
  trace: TraceStep[];
};

async function timed<T>(trace: TraceStep[], tool: string, work: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  const value = await work();
  trace.push({ tool, ms: Date.now() - t0 });
  return value;
}

// The browser's total is ignored: it is recomputed here from validated lines, so a crafted request cannot change what is billed or shown.
export function startCheckout(clientSale: Sale, saleKey?: string): Promise<CheckoutResult> {
  const problem = validateSale(clientSale);
  if (problem) return Promise.reject(new Error(problem));
  const sale: Sale = { ...clientSale, total: totalOf(clientSale.items) };
  return once(saleKey, () => runCheckout(sale));
}

async function runCheckout(sale: Sale): Promise<CheckoutResult> {
  const trace: TraceStep[] = [];
  const invoice_id = await timed(trace, "create_invoice", () => createInvoiceDraft(sale));
  const payer_url = await timed(trace, "send_invoice", () => shareInvoice(invoice_id, sale));
  invalidateLedger();
  const base = { invoice_id, mode: sale.payment_mode, payer_url, total: sale.total, currency: sale.currency, trace };

  if (sale.payment_mode === "cash") {
    await timed(trace, "record_payment_for_invoice", () => recordExternalPayment(invoice_id, sale.total, sale.currency, { method: "CASH" }));
    return { ...base, status: "MARKED_AS_PAID" };
  }
  if (sale.payment_mode === "paypal_later") return { ...base, status: "UNPAID" };

  const qr_png_base64 = await timed(trace, "generate_invoice_qr_code", () => generateQr(invoice_id)); // undefined -> the screen falls back to the link
  return { ...base, status: "UNPAID", qr_png_base64 };
}

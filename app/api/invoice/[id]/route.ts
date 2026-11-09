import { getInvoiceStatus, recordExternalPayment } from "@/lib/invoices";
import { invalidateLedger } from "@/lib/ledger";
import { respond } from "@/lib/http";
import { callTool } from "@/lib/paypal-toolkit";

export const maxDuration = 15;

type Ctx = { params: Promise<{ id: string }> };

// Polled by the screen every 3 s while the QR is up.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return respond(async () => ({ invoice_id: id, status: await getInvoiceStatus(id) }));
}

// "Cash" on the QR screen records an external CASH payment; "Never mind" cancels the invoice.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json()) as { action: "cash" | "cancel"; total?: number; currency?: string };
  return respond(async () => {
    if (body.action === "cash") {
      await recordExternalPayment(id, body.total ?? 0, body.currency ?? "USD", { method: "CASH" });
      invalidateLedger();
      return { invoice_id: id, status: "MARKED_AS_PAID" };
    }
    await callTool("cancel_sent_invoice", { invoice_id: id, send_to_recipient: false });
    invalidateLedger();
    return { invoice_id: id, status: "CANCELLED" };
  });
}

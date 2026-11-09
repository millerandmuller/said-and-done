import { getInvoiceAmount, getInvoiceStatus, recordExternalPayment } from "@/lib/invoices";
import { invalidateLedger } from "@/lib/ledger";
import { respond } from "@/lib/http";
import { callTool } from "@/lib/paypal-toolkit";
import { PAID_STATES } from "@/lib/statuses";

export const maxDuration = 15;

type Ctx = { params: Promise<{ id: string }> };

const INVOICE_ID = /^INV2-[A-Z0-9-]{10,40}$/;
const badId = (id: string) => { if (!INVOICE_ID.test(id)) throw new Error("That is not an invoice id."); };

// Polled by the screen every 3 s while the QR is up.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return respond(async () => {
    badId(id);
    return { invoice_id: id, status: await getInvoiceStatus(id) };
  });
}

// "Cash" on the QR screen records an external CASH payment for the amount PayPal holds on the invoice (never a client figure);
// "Never mind" cancels it. Both re-read the invoice afterwards and report what PayPal says, not what was asked.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  return respond(async () => {
    badId(id);
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "cash" && body.action !== "cancel") throw new Error("Unknown action.");
    const before = await getInvoiceStatus(id);
    if (PAID_STATES.includes(before)) return { invoice_id: id, status: before }; // already settled: nothing to cash or cancel
    if (body.action === "cash") {
      const { total, currency } = await getInvoiceAmount(id);
      await recordExternalPayment(id, total, currency, { method: "CASH" });
    } else {
      await callTool("cancel_sent_invoice", { invoice_id: id, send_to_recipient: false });
    }
    invalidateLedger();
    const after = await getInvoiceStatus(id);
    const ok = body.action === "cash" ? PAID_STATES.includes(after) : after === "CANCELLED";
    if (!ok) throw new Error(`PayPal did not ${body.action === "cash" ? "record the cash payment" : "cancel the invoice"} (status ${after}).`);
    return { invoice_id: id, status: after };
  });
}
